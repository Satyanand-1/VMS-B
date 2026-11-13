'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeVendor, canSeeClient, canSeePerson } from '../session';
import { audit } from '../audit';
import { checkFile } from '../files';
import { encrypt } from '../crypto';
import { addDocumentVersion, auditPeriodOf, extraDocs, uploadField } from '../domain/documents';
import { createExternalLogin } from '../domain/accounts';
import { savePaymentTerm } from './vendors';
import type { FormState } from './auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;
type PType = 'consultant' | 'w2' | 'w1099';

// Documents the account manager uploads, per type (TM-3, TM-5, TM-7). Audit reports are uploaded later.
const STAFF_DOCS: Record<PType, { name: string; field: string; dates: boolean; multiple?: boolean }[]> = {
  consultant: [{ name: 'Resume', field: 'doc_resume', dates: false }, { name: 'I-9', field: 'doc_i9', dates: true }, { name: 'E-Verify document', field: 'doc_everify', dates: true }],
  w2: [{ name: 'Employment contract', field: 'doc_contract', dates: true }, { name: 'W-2 (year end)', field: 'doc_yearend', dates: true }, { name: 'Payslips', field: 'doc_payslips', dates: false, multiple: true }],
  w1099: [{ name: '1099 contract', field: 'doc_contract', dates: true }, { name: '1099 (year end)', field: 'doc_yearend', dates: true }]
};
// Documents the resource uploads after signing in (hidden from staff until uploaded).
const SELF_DOCS: Record<PType, string[]> = { consultant: [], w2: ['W-4', 'I-9', 'ACH form'], w1099: ['W-9', 'I-9', 'ACH form'] };

function personFields(form: FormData) {
  return {
    full_name: String(form.get('full_name') || '').trim(),
    email: String(form.get('email') || '').trim().toLowerCase(),
    phone: String(form.get('phone') || '').trim() || null,
    address: String(form.get('address') || '').trim() || null,
    ssn: String(form.get('ssn') || '').replace(/\D/g, ''),
    role_title: String(form.get('role_title') || '').trim(),
    client_id: String(form.get('client_id') || '') || null,
    hourly_rate: Number(form.get('hourly_rate') || 0),
    start_date: String(form.get('start_date') || '') || null,
    end_date: String(form.get('end_date') || '') || null,
    duration: String(form.get('duration') || '').trim() || null,
    work_location: String(form.get('work_location') || 'Remote').trim() || 'Remote',
    payment_term: String(form.get('payment_term') || '').trim()
  };
}

async function validate(f: ReturnType<typeof personFields>, type: PType, mode: 'add' | 'edit', personId?: string) {
  const fe: Record<string, string> = {};
  if (!f.full_name) fe.full_name = 'Enter the name.';
  if (!EMAIL.test(f.email)) fe.email = 'Enter a valid email address. It is the sign-in username.';
  if (!f.role_title) fe.role_title = 'Enter the role.';
  if (!(f.hourly_rate > 0)) fe.hourly_rate = 'Enter the hourly rate.';
  if (type !== 'consultant' && !f.client_id) fe.client_id = 'Choose the client.';
  if (type !== 'consultant' && mode === 'add' && f.ssn.length !== 9) fe.ssn = 'Enter the 9-digit SSN.';
  if (f.start_date && f.end_date && f.end_date < f.start_date) fe.end_date = 'The end date must be after the start date.';
  if (!fe.email) {
    const dup = (await db().from('people').select('id').eq('email', f.email).maybeSingle()).data as { id: string } | null;
    const acc = (await db().from('user_accounts').select('id,person_id').eq('email', f.email).maybeSingle()).data as { person_id: string | null } | null;
    if ((dup && dup.id !== personId) || (acc && acc.person_id !== personId)) fe.email = 'This email is already used by another account.';
  }
  return fe;
}

async function checkUploads(form: FormData, fields: string[], fe: Record<string, string>) {
  for (const n of fields) {
    for (const v of form.getAll(n)) if (v instanceof File && v.size > 0) { const p = await checkFile(v); if (p) fe[n] = p; }
  }
  for (const x of extraDocs(form)) {
    if (x.file && !x.name) fe.extra = 'Enter a name for each other document.';
    if (x.file) { const p = await checkFile(x.file); if (p) fe.extra = p; }
  }
}

// Add Consultant (TM-2) / Add W-2 Resource (TM-4, TM-5) / Add 1099 Resource (TM-6, TM-7) + login details email.
export async function createPersonAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const type = String(form.get('type')) as PType;
  const vendorId = type === 'consultant' ? String(form.get('vendor_id') || '') : null;
  const back = String(form.get('back') || '/vendors');
  if (vendorId && !canSeeVendor(s, vendorId)) return { error: 'You do not have access to this vendor.' };
  const f = personFields(form);
  if (f.client_id && type !== 'consultant' && !canSeeClient(s, f.client_id)) return { fieldErrors: { client_id: 'Choose one of your clients.' } };
  const fe = await validate(f, type, 'add');
  let term = f.payment_term;
  if (vendorId) term = (must(await db().from('vendors').select('payment_term').eq('id', vendorId).single(), 'vendor') as { payment_term: string }).payment_term;
  else { const err = await savePaymentTerm(term || 'Net 10'); if (err) fe.payment_term = err; }
  await checkUploads(form, [...STAFF_DOCS[type].map((d) => d.field), 'doc_audit'], fe);
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };

  const p = must(await db().from('people').insert({
    type, full_name: f.full_name, email: f.email, phone: f.phone, address: type === 'consultant' ? null : f.address,
    ssn_last4: f.ssn ? f.ssn.slice(-4) : null, ssn_enc: f.ssn ? encrypt(f.ssn) : null, vendor_id: vendorId, status: 'onboarding',
    role_title: f.role_title, client_id: f.client_id, hourly_rate: f.hourly_rate, start_date: f.start_date, end_date: f.end_date,
    duration: f.duration, work_location: f.work_location, payment_term: term || 'Net 10',
    account_manager_id: s.persona === 'accountmanager' ? s.account.id : (await amFor(vendorId, f.client_id))
  }).select('id').single(), 'person') as { id: string };

  for (const d of STAFF_DOCS[type]) {
    const files = form.getAll(d.field).filter((v): v is File => v instanceof File && v.size > 0);
    const u = uploadField(form, d.field);
    if (files.length) for (const file of files) await addDocumentVersion(s, 'person', p.id, d.name, file, { validFrom: d.dates ? u.start : null, validTo: d.dates ? u.end : null, ownerLabel: f.full_name });
    else await db().from('documents').insert({ owner_kind: 'person', owner_id: p.id, doc_type: d.name, no_dates: !d.dates, valid_from: d.dates ? u.start : null, valid_to: d.dates ? u.end : null });
  }
  const audit_ = uploadField(form, 'doc_audit');
  const ap = auditPeriodOf(audit_.start, audit_.period);
  if (audit_.file) await addDocumentVersion(s, 'person', p.id, 'Audit report', audit_.file, { validTo: ap.end, auditPeriod: ap.label, ownerLabel: f.full_name });
  else await db().from('documents').insert({ owner_kind: 'person', owner_id: p.id, doc_type: 'Audit report' });
  if (SELF_DOCS[type].length) await db().from('documents').insert(SELF_DOCS[type].map((name) => ({ owner_kind: 'person', owner_id: p.id, doc_type: name, uploader_kind: 'resource', no_dates: name === 'ACH form' })));
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'person', p.id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: f.full_name });

  const label = type === 'consultant' ? 'Consultant' : type === 'w2' ? 'W-2 resource' : '1099 resource';
  await audit(s, 'create', 'person', p.id, `created ${label.toLowerCase()} ${f.full_name}`, null, { ...f, ssn: undefined });
  let sent = true;
  try { ({ sent } = await createExternalLogin(s, { email: f.email, name: f.full_name, role: 'resource', personId: p.id })); }
  catch (e) { return { error: (e as Error).message }; }
  revalidatePath(back.split('?')[0]);
  redirect(`${back}${back.includes('?') ? '&' : '?'}${flash(`${label} added · login details sent`, `${f.full_name} was added. ${sent ? `An email with the username (${f.email}) and a temporary password was sent to ${f.email}.` : 'The login email could not be sent; use Send new password from Edit.'}`)}`);
}

async function amFor(vendorId: string | null, clientId: string | null) {
  if (vendorId) return (must(await db().from('vendors').select('account_manager_id').eq('id', vendorId).single(), 'vendor') as { account_manager_id: string }).account_manager_id;
  if (clientId) return ((await db().from('client_account_managers').select('account_manager_id').eq('client_id', clientId).limit(1)).data?.[0] as { account_manager_id: string } | undefined)?.account_manager_id || null;
  return null;
}

// TM-13: Edit person (Super Admin; Account Manager within scope). Every change is audited.
export async function updatePersonAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const id = String(form.get('id'));
  const back = String(form.get('back') || '/vendors');
  const before = must(await db().from('people').select('*').eq('id', id).single(), 'person') as Record<string, unknown> & { type: PType; vendor_id: string | null; client_id: string | null; full_name: string; id: string };
  if (!canSeePerson(s, before)) return { error: 'You do not have access to this person.' };
  const f = personFields(form);
  if (f.client_id && !canSeeClient(s, f.client_id) && f.client_id !== before.client_id) return { fieldErrors: { client_id: 'Choose one of your clients.' } };
  const fe = await validate(f, before.type, 'edit', id);
  if (before.type !== 'consultant') { const err = await savePaymentTerm(f.payment_term || 'Net 10'); if (err) fe.payment_term = err; }
  const docs = must(await db().from('documents').select('id,doc_type,uploader_kind').eq('owner_kind', 'person').eq('owner_id', id), 'docs') as { id: string; doc_type: string; uploader_kind: string }[];
  await checkUploads(form, docs.map((d) => `doc_${d.id}`), fe);
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };

  const upd: Record<string, unknown> = {
    full_name: f.full_name, email: f.email, phone: f.phone, role_title: f.role_title, client_id: f.client_id, hourly_rate: f.hourly_rate,
    start_date: f.start_date, end_date: f.end_date, duration: f.duration, work_location: f.work_location,
    status: String(form.get('status') || before.status)
  };
  if (before.type !== 'consultant') { upd.address = f.address; upd.payment_term = f.payment_term || 'Net 10'; if (f.ssn.length === 9) { upd.ssn_last4 = f.ssn.slice(-4); upd.ssn_enc = encrypt(f.ssn); } }
  if (s.persona === 'superadmin' && form.get('account_manager_id')) upd.account_manager_id = String(form.get('account_manager_id'));
  must(await db().from('people').update(upd).eq('id', id), 'update person');
  if (f.email !== before.email) {
    const acc = (await db().from('user_accounts').select('id').eq('person_id', id).maybeSingle()).data as { id: string } | null;
    if (acc) { await db().auth.admin.updateUserById(acc.id, { email: f.email, email_confirm: true }); await db().from('user_accounts').update({ email: f.email, full_name: f.full_name }).eq('id', acc.id); }
  }
  // New versions for any document chosen (never for documents the resource uploads: view only for staff).
  for (const d of docs) {
    if (d.uploader_kind !== 'staff') continue;
    const u = uploadField(form, `doc_${d.id}`);
    const ap = d.doc_type === 'Audit report' ? auditPeriodOf(u.start, u.period) : null;
    if (u.file) await addDocumentVersion(s, 'person', id, d.doc_type, u.file, ap ? { validTo: ap.end, auditPeriod: ap.label, ownerLabel: f.full_name } : { validFrom: u.start, validTo: u.end, ownerLabel: f.full_name });
  }
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'person', id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: f.full_name });
  await audit(s, 'update', 'person', id, `updated ${f.full_name}`, { ...before, ssn_enc: undefined }, { ...upd, ssn_enc: undefined });
  revalidatePath(back.split('?')[0]);
  redirect(`${back}${back.includes('?') ? '&' : '?'}${flash('Changes saved', `${f.full_name} was updated. The change is recorded in the Audit Log.`)}`);
}
