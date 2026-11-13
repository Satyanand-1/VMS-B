'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeClient, isStaff } from '../session';
import { audit } from '../audit';
import { checkFile, storeFile } from '../files';
import { addDocumentVersion, extraDocs, uploadField } from '../domain/documents';
import { monthLong } from '../format';
import type { FormState } from './auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;

function clientFields(form: FormData) {
  return {
    name: String(form.get('name') || '').trim(),
    email: String(form.get('email') || '').trim(),
    address: String(form.get('address') || '').trim() || null,
    currency: String(form.get('currency') || 'USD'),
    time_zone: String(form.get('time_zone') || 'America/New_York'),
    region: String(form.get('region') || '').trim() || null
  };
}

// CL-4: Super Admin only.
export async function createClientAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const f = clientFields(form);
  const ams = form.getAll('account_managers').map(String);
  const msa = uploadField(form, 'msa');
  const fe: Record<string, string> = {};
  if (!f.name) fe.name = 'Enter the client name.';
  if (!EMAIL.test(f.email)) fe.email = 'Enter a valid email address.';
  if (!ams.length) fe.account_managers = 'Select at least one account manager.';
  if (!msa.start) fe.msa__start = 'Enter the MSA start date.';
  if (!msa.end) fe.msa__end = 'Enter the MSA end date.';
  if (msa.file) { const p = await checkFile(msa.file); if (p) fe.msa = p; }
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  const dup = (await db().from('clients').select('id').ilike('name', f.name).maybeSingle()).data;
  if (dup) return { fieldErrors: { name: 'A client with this name already exists.' } };

  const code = f.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CL';
  const c = must(await db().from('clients').insert({ ...f, code }).select('id').single(), 'client') as { id: string };
  must(await db().from('client_account_managers').insert(ams.map((a) => ({ client_id: c.id, account_manager_id: a }))), 'client AMs');
  if (msa.file) await addDocumentVersion(s, 'client', c.id, 'MSA', msa.file, { validFrom: msa.start, validTo: msa.end, ownerLabel: f.name });
  else await db().from('documents').insert({ owner_kind: 'client', owner_id: c.id, doc_type: 'MSA', valid_from: msa.start, valid_to: msa.end });
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'client', c.id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: f.name });
  await audit(s, 'create', 'client', c.id, `created client ${f.name}`, null, f);
  revalidatePath('/clients');
  redirect(`/clients?client=${c.id}&${flash('Client added', `${f.name} was created and assigned to its account managers.`)}`);
}

// CL-6 / CL-8: Super Admin edits everything; an Account Manager edits their own client but not its account managers.
export async function updateClientAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const id = String(form.get('id'));
  if (!canSeeClient(s, id)) return { error: 'You do not have access to this client.' };
  const before = must(await db().from('clients').select('*').eq('id', id).single(), 'client') as Record<string, unknown>;
  const f = clientFields(form);
  const status = String(form.get('status') || 'active');
  const msa = uploadField(form, 'msa');
  const fe: Record<string, string> = {};
  if (!f.name) fe.name = 'Enter the client name.';
  if (!EMAIL.test(f.email)) fe.email = 'Enter a valid email address.';
  if (msa.file) { const p = await checkFile(msa.file); if (p) fe.msa = p; }
  let ams: string[] = [];
  if (s.persona === 'superadmin') {
    ams = form.getAll('account_managers').map(String);
    if (!ams.length) fe.account_managers = 'A client must have at least one account manager.';
  }
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };

  must(await db().from('clients').update({ ...f, status }).eq('id', id), 'update client');
  if (s.persona === 'superadmin') {
    // Add the new ones first so the client is never left without an account manager.
    const current = (must(await db().from('client_account_managers').select('account_manager_id').eq('client_id', id), 'AMs') as { account_manager_id: string }[]).map((r) => r.account_manager_id);
    const add = ams.filter((a) => !current.includes(a));
    const remove = current.filter((a) => !ams.includes(a));
    if (add.length) must(await db().from('client_account_managers').insert(add.map((a) => ({ client_id: id, account_manager_id: a }))), 'add AMs');
    if (remove.length) must(await db().from('client_account_managers').delete().eq('client_id', id).in('account_manager_id', remove), 'remove AMs');
  }
  if (msa.file) await addDocumentVersion(s, 'client', id, 'MSA', msa.file, { validFrom: msa.start, validTo: msa.end, ownerLabel: f.name });
  else if (msa.start || msa.end) await db().from('documents').update({ valid_from: msa.start, valid_to: msa.end }).eq('owner_kind', 'client').eq('owner_id', id).eq('doc_type', 'MSA');
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'client', id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: f.name });
  await audit(s, 'update', 'client', id, `updated client ${f.name}`, before, { ...f, status });
  revalidatePath('/clients');
  redirect(`/clients?client=${id}&${flash('Client updated', `${f.name} was saved.`)}`);
}

// CL-3: upload the client invoice (file + billable hours) for every row filled in, in one save.
export async function saveClientInvoicesAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  if (!isStaff(s)) return { error: 'Not allowed.' };
  const period = String(form.get('period'));
  const back = String(form.get('back') || '/clients');
  const personIds = Array.from(new Set(Array.from(form.keys()).filter((k) => k.startsWith('hours_') || k.startsWith('file_')).map((k) => k.split('_')[1])));
  const fe: Record<string, string> = {};
  const todo: { personId: string; file: File; hours: number; clientId: string; name: string }[] = [];
  for (const pid of personIds) {
    const f = form.get(`file_${pid}`);
    const file = f instanceof File && f.size > 0 ? f : null;
    const hoursRaw = String(form.get(`hours_${pid}`) || '').trim();
    if (!file && !hoursRaw) continue; // nothing entered for this person
    const p = (await db().from('people').select('id,full_name,client_id,vendor_id').eq('id', pid).maybeSingle()).data as { id: string; full_name: string; client_id: string | null } | null;
    if (!p || !p.client_id || !canSeeClient(s, p.client_id)) { fe[pid] = 'Not in your scope.'; continue; }
    const hours = Number(hoursRaw);
    if (!file) { fe[pid] = 'Upload the client invoice.'; continue; }
    const problem = await checkFile(file);
    if (problem) { fe[pid] = problem; continue; }
    if (!(hours > 0 && hours <= 744)) { fe[pid] = 'Enter the billable hours.'; continue; }
    const exists = (await db().from('client_invoices').select('id').eq('person_id', pid).eq('period', period).maybeSingle()).data;
    if (exists) { fe[pid] = 'A client invoice is already uploaded for this month.'; continue; }
    todo.push({ personId: pid, file, hours: Math.round(hours * 100) / 100, clientId: p.client_id, name: p.full_name });
  }
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Some rows could not be saved. Nothing was saved yet.' };
  if (!todo.length) return { error: 'Upload a client invoice and enter its billable hours first.' };
  for (const t of todo) {
    const stored = await storeFile(`client-invoices/${t.clientId}/${period}`, t.file);
    must(await db().from('client_invoices').insert({ client_id: t.clientId, person_id: t.personId, period, hours: t.hours, file_path: stored.path, file_name: stored.name, uploaded_by: s.account.id }), 'client invoice');
    await audit(s, 'upload', 'client_invoice', t.personId, `uploaded the ${monthLong(period)} client invoice for ${t.name} (${t.hours} h)`);
  }
  revalidatePath('/clients');
  revalidatePath('/invoice-management');
  redirect(`${back}${back.includes('?') ? '&' : '?'}${flash(`${todo.length} client invoice${todo.length > 1 ? 's' : ''} saved`, 'Ready for review in Invoice Management once the vendor or resource side is in.')}`);
}
