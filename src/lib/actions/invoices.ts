'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'crypto';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeClient, canSeePerson, type Session } from '../session';
import { audit } from '../audit';
import { sendEmail } from '../email';
import { checkFile, storeFile } from '../files';
import { monthLong, roundHalfUp } from '../format';
import type { Submission, Person } from '../data';
import type { FormState } from './auth';

const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;

async function notifySubmitter(person: Pick<Person, 'id' | 'vendor_id' | 'full_name'>, title: string, body: string) {
  const acc = person.vendor_id
    ? (await db().from('user_accounts').select('id,email,full_name').eq('vendor_id', person.vendor_id).limit(1)).data?.[0]
    : (await db().from('user_accounts').select('id,email,full_name').eq('person_id', person.id).limit(1)).data?.[0];
  if (!acc) return;
  await db().from('notifications').insert({ user_id: acc.id, title, body, link: person.vendor_id ? '/invoices' : '/dashboard' });
  await sendEmail('status_change', acc.email, title, `Hello ${acc.full_name},\n\n${body}\n\nArkhya Tech`);
}

/* ---------------- Review (CI-4, CI-5, REC-1 … REC-5) ---------------- */
export async function reviewAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const decision = String(form.get('decision'));
  const sub = must(await db().from('submissions').select('*').eq('id', String(form.get('submission_id'))).single(), 'submission') as Submission;
  if (!canSeeClient(s, sub.client_id)) return { error: 'You can review only your own clients.' };
  if (sub.status !== 'in_progress') return { error: 'This submission was already reviewed.' };
  const ci = (await db().from('client_invoices').select('*').eq('person_id', sub.person_id).eq('period', sub.period).maybeSingle()).data as { hours: number } | null;
  if (!ci) return { error: 'Both documents are needed before this can be reviewed.' };
  const person = must(await db().from('people').select('id,full_name,vendor_id').eq('id', sub.person_id).single(), 'person') as Person;
  const what = `${sub.ref} (${person.full_name}, ${monthLong(sub.period)})`;
  if (decision === 'approve') {
    if (Number(ci.hours) !== Number(sub.hours)) return { error: `Hours do not match (client ${Number(ci.hours)} h, submitted ${Number(sub.hours)} h). Reject it with a reason instead.` };
    must(await db().from('submissions').update({ status: 'approved', reviewed_by: s.account.id, reviewed_at: new Date().toISOString(), reject_reason: null }).eq('id', sub.id), 'approve');
    await audit(s, 'approve', 'submission', sub.id, `approved ${what}`);
    await notifySubmitter(person, `${sub.ref} approved`, `${what} was approved.`);
  } else {
    const reason = String(form.get('reason') || '').trim();
    if (!reason) return { fieldErrors: { reason: 'Enter the reason for rejection.' } };
    must(await db().from('submissions').update({ status: 'rejected', reject_reason: reason, reviewed_by: s.account.id, reviewed_at: new Date().toISOString() }).eq('id', sub.id), 'reject');
    await audit(s, 'reject', 'submission', sub.id, `rejected ${what} — ${reason}`);
    await notifySubmitter(person, `${sub.ref} rejected`, `${what} was rejected: ${reason}\nPlease correct and resubmit it.`);
  }
  revalidatePath('/invoice-management');
  const back = String(form.get('back') || '/invoice-management');
  redirect(`${back}${back.includes('?') ? '&' : '?'}${flash(decision === 'approve' ? 'Approved' : 'Rejected', `${what} is now ${decision === 'approve' ? 'Approved' : 'Rejected'}.`)}`);
}

// A missing client invoice can be uploaded in the Review pop-up (CI-4).
export async function reviewClientInvoiceAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const personId = String(form.get('person_id'));
  const period = String(form.get('period'));
  const person = must(await db().from('people').select('id,full_name,client_id,vendor_id').eq('id', personId).single(), 'person') as Person;
  if (!person.client_id || !canSeeClient(s, person.client_id)) return { error: 'You can upload client invoices only for your own clients.' };
  const f = form.get('file');
  const file = f instanceof File && f.size > 0 ? f : null;
  const hours = Number(form.get('hours'));
  const fe: Record<string, string> = {};
  if (!file) fe.file = 'Upload the client invoice.';
  else { const p = await checkFile(file); if (p) fe.file = p; }
  if (!(hours > 0 && hours <= 744)) fe.hours = 'Enter the client billable hours.';
  if (Object.keys(fe).length) return { fieldErrors: fe };
  const stored = await storeFile(`client-invoices/${person.client_id}/${period}`, file!);
  const { error } = await db().from('client_invoices').insert({ client_id: person.client_id, person_id: personId, period, hours: roundHalfUp(hours), file_path: stored.path, file_name: stored.name, uploaded_by: s.account.id });
  if (error) return { error: 'A client invoice is already uploaded for this month.' };
  await audit(s, 'upload', 'client_invoice', personId, `uploaded the ${monthLong(period)} client invoice for ${person.full_name} (${hours} h)`);
  revalidatePath('/invoice-management');
  redirect(`/invoice-management?m=review&person=${personId}&period=${period}`);
}

/* ---------------- Submissions by vendors and resources (INV-1 … INV-12) ---------------- */
async function newRef(w2: boolean, period: string) {
  const [y, m] = period.split('-');
  for (let i = 0; i < 20; i++) {
    const ref = `${w2 ? 'TS' : 'INV'}-${y}-${m}-${String(randomInt(1000, 9999))}`;
    if (!(await db().from('submissions').select('id').eq('ref', ref).limit(1)).data?.length) return ref;
  }
  throw new Error('Could not create an invoice number.');
}

// Which person may this user submit for? Vendor: own active consultants. Resource: themselves.
async function submitter(s: Session, personId: string) {
  const p = (await db().from('people').select('*').eq('id', personId).maybeSingle()).data as Person | null;
  if (!p) return null;
  if (s.persona === 'vendor') return p.vendor_id === s.account.vendor_id ? p : null;
  return p.id === s.account.person_id ? p : null;
}

async function filesFrom(form: FormData, w2: boolean, required: boolean) {
  const pick = (n: string) => { const f = form.get(n); return f instanceof File && f.size > 0 ? f : null; };
  const invoice = w2 ? null : pick('invoice');
  const timesheet = pick('timesheet');
  const fe: Record<string, string> = {};
  if (required && !w2 && !invoice) fe.invoice = 'Upload the invoice.';
  if (required && !timesheet) fe.timesheet = 'Upload the timesheet.';
  for (const [n, f] of [['invoice', invoice], ['timesheet', timesheet]] as const) if (f) { const p = await checkFile(f); if (p) fe[n] = p; }
  return { invoice, timesheet, fe };
}

export async function submitAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const personId = s.persona === 'vendor' ? String(form.get('person_id') || '') : s.account.person_id!;
  const period = String(form.get('period') || '');
  const back = s.persona === 'w2' ? '/timesheets' : '/invoices';
  const p = await submitter(s, personId);
  const fe: Record<string, string> = {};
  if (!p) return { fieldErrors: { person_id: 'Choose one of your consultants.' } };
  if (p.status === 'inactive' || p.status === 'ended') return { error: `${p.full_name} is inactive; no new invoices can be submitted.` };
  if (!p.client_id) return { error: `${p.full_name} is not mapped to a client yet. Contact your account manager.` };
  const w2 = p.type === 'w2';
  if (!/^\d{4}-\d{2}-01$/.test(period)) fe.period = 'Choose the billing period.';
  const hours = Number(form.get('hours'));
  if (!(hours > 0 && hours <= 744)) fe.hours = 'Enter the total hours for the month (more than 0).';
  const files = await filesFrom(form, w2, true);
  Object.assign(fe, files.fe);
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  const active = (await db().from('submissions').select('id,status').eq('person_id', p.id).eq('period', period).neq('status', 'superseded')).data || [];
  if (active.length) return { fieldErrors: { period: `${p.full_name} already has ${w2 ? 'a timesheet' : 'an invoice'} for ${monthLong(period)}. Only one is allowed per month${active[0].status === 'rejected' ? '; resubmit the rejected one instead' : ''}.` } };
  const ref = await newRef(w2, period);
  const folder = `submissions/${p.id}/${period}`;
  const inv = files.invoice ? await storeFile(folder, files.invoice) : null;
  const ts = await storeFile(folder, files.timesheet!);
  const rate = Number(p.hourly_rate);
  const { error } = await db().from('submissions').insert({
    ref, person_id: p.id, client_id: p.client_id, period, hours: roundHalfUp(hours), hourly_rate: rate, amount: w2 ? null : roundHalfUp(hours * rate),
    invoice_path: inv?.path || null, invoice_name: inv?.name || null, timesheet_path: ts.path, timesheet_name: ts.name, status: 'in_progress', submitted_by: s.account.id
  });
  if (error) return { fieldErrors: { period: `Only one ${w2 ? 'timesheet' : 'invoice'} is allowed per month.` } };
  await audit(s, 'submit', 'submission', ref, `submitted ${ref} (${p.full_name}, ${monthLong(period)}, ${hours} h)`);
  revalidatePath(back);
  redirect(`${back}?${flash(`${w2 ? 'Timesheet' : 'Invoice'} ${ref} submitted`, `${hours} h for ${monthLong(period)}. It is In Progress until it is reviewed against the client invoice.`)}`);
}

// Resubmit a rejected submission, or replace a file while In Progress / Rejected (REC-6, REC-7, INV-12).
export async function resubmitAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const old = must(await db().from('submissions').select('*').eq('id', String(form.get('submission_id'))).single(), 'submission') as Submission;
  const p = await submitter(s, old.person_id);
  if (!p) return { error: 'You can only change your own submissions.' };
  const mode = String(form.get('mode')) === 'replace' ? 'replace' : 'resubmit';
  if (mode === 'resubmit' && old.status !== 'rejected') return { error: 'Only a rejected submission can be resubmitted.' };
  if (mode === 'replace' && !['in_progress', 'rejected'].includes(old.status)) return { error: 'An approved submission cannot be changed.' };
  const w2 = p.type === 'w2';
  const hours = mode === 'resubmit' ? Number(form.get('hours')) : Number(old.hours);
  const fe: Record<string, string> = {};
  if (!(hours > 0 && hours <= 744)) fe.hours = 'Enter the total hours for the month (more than 0).';
  const files = await filesFrom(form, w2, false);
  Object.assign(fe, files.fe);
  if (!files.invoice && !files.timesheet && mode === 'replace') fe.timesheet = 'Choose the file to upload.';
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  const folder = `submissions/${p.id}/${old.period}`;
  const inv = files.invoice ? await storeFile(folder, files.invoice) : null;
  const ts = files.timesheet ? await storeFile(folder, files.timesheet) : null;
  const rate = Number(old.hourly_rate);
  must(await db().from('submissions').update({ status: 'superseded' }).eq('id', old.id), 'supersede');
  const { error } = await db().from('submissions').insert({
    ref: old.ref, person_id: old.person_id, client_id: old.client_id, period: old.period, version_no: old.version_no + 1,
    hours: roundHalfUp(hours), hourly_rate: rate, amount: w2 ? null : roundHalfUp(hours * rate),
    invoice_path: inv?.path ?? old.invoice_path, invoice_name: inv?.name ?? old.invoice_name,
    timesheet_path: ts?.path ?? old.timesheet_path, timesheet_name: ts?.name ?? old.timesheet_name,
    status: 'in_progress', submitted_by: s.account.id
  });
  if (error) { await db().from('submissions').update({ status: old.status }).eq('id', old.id); return { error: error.message }; }
  await audit(s, mode === 'resubmit' ? 'resubmit' : 'replace', 'submission', old.ref, `${mode === 'resubmit' ? 'resubmitted' : 'replaced a file on'} ${old.ref} (${p.full_name}, v${old.version_no + 1})`);
  const back = s.persona === 'w2' ? '/timesheets' : '/invoices';
  revalidatePath(back);
  redirect(`${back}?${flash(mode === 'resubmit' ? `${old.ref} resubmitted` : 'File replaced', `${old.ref} is In Progress for review again. The earlier version is kept as Superseded.`)}`);
}

export async function canSubmitFor(s: Session, p: Person) { return canSeePerson(s, p); }
