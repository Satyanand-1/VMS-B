'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeVendor, canSeePerson } from '../session';
import { audit } from '../audit';
import { checkFile, unstage } from '../files';
import { encrypt } from '../crypto';
import { addDocumentVersion, extraDocs, otherDocs, saveOtherDocs, uploadField } from '../domain/documents';
import { createLogin, loginNote, passwordFromForm, sendNewPassword } from '../domain/accounts';
import { docDateErrors, phoneError } from '../validate';
import type { FormState } from './auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;

// TM-10: "Custom" payment terms are Net + days; a new one is saved for later drop-downs.
export async function savePaymentTerm(term: string): Promise<string | null> {
  const t = term.trim();
  const known = (await db().from('payment_terms').select('label').eq('label', t).maybeSingle()).data;
  if (known) return null;
  if (!/^Net\s([1-9]\d{0,2})$/.test(t)) return 'Use the format Net + number of days, e.g. Net 20.';
  await db().from('payment_terms').insert({ label: t, sort: 50, is_custom: true });
  return null;
}

const VENDOR_DOCS = ['MSA', 'PO', 'W-9', 'COI', 'ACH form'];
async function checkDocs(form: FormData, names: string[], fe: Record<string, string>, reserved: string[] = []) {
  // Every vendor document the account manager uploads has a start and end date.
  docDateErrors(form, names, fe, { dated: names, reserved: [...VENDOR_DOCS, ...reserved] });
  for (const n of names) {
    const u = uploadField(form, n);
    if (u.file) { const p = await checkFile(u.file); if (p) fe[n] = p; }
  }
  for (const x of extraDocs(form)) if (x.file) { const p = await checkFile(x.file); if (p) fe.extra = p; }
}

// VN-3: Add Vendor (Super Admin, or Account Manager for themselves) + login details email (AUTH-2).
export async function createVendorAction(_: FormState, raw: FormData): Promise<FormState> {
  let form: FormData;
  try { form = await unstage(raw); } catch (e) { return { error: (e as Error).message }; }
  const s = await requireSession(['superadmin', 'accountmanager']);
  const v = {
    name: String(form.get('name') || '').trim(), address: String(form.get('address') || '').trim(), email: String(form.get('email') || '').trim().toLowerCase(),
    ein: String(form.get('ein') || '').replace(/\D/g, ''), phone: String(form.get('phone') || '').trim(), state: String(form.get('state_of_incorporation') || ''),
    signatory: String(form.get('signatory_name') || '').trim(), term: String(form.get('payment_term') || '').trim(),
    am: s.persona === 'accountmanager' ? s.account.id : String(form.get('account_manager_id') || '')
  };
  const fe: Record<string, string> = {};
  if (!v.name) fe.name = 'Enter the vendor name.';
  if (!v.address) fe.address = 'Enter the address.';
  if (!EMAIL.test(v.email)) fe.email = 'Enter a valid email address. It is the vendor’s sign-in username.';
  if (v.ein.length !== 9) fe.ein = 'Enter the 9-digit federal ID (EIN).';
  const ph = phoneError(v.phone, true);
  if (ph) fe.phone = ph;
  if (!v.state) fe.state_of_incorporation = 'Choose the state of incorporation.';
  if (!v.signatory) fe.signatory_name = 'Enter the authorized signatory name.';
  if (!v.am) fe.account_manager_id = 'Choose the account manager.';
  const termErr = v.term ? await savePaymentTerm(v.term) : 'Choose the payment term.';
  if (termErr) fe.payment_term = termErr;
  const pw = passwordFromForm(form);
  if (pw.error) fe.pw_value = pw.error;
  await checkDocs(form, ['msa', 'po'], fe);
  if (!fe.email && (await db().from('user_accounts').select('id').eq('email', v.email).maybeSingle()).data) fe.email = 'An account with this email already exists.';
  if (!fe.name && (await db().from('vendors').select('id').ilike('name', v.name).maybeSingle()).data) fe.name = 'A vendor with this name already exists.';
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };

  const row = must(await db().from('vendors').insert({
    name: v.name, address: v.address, email: v.email, ein_last4: v.ein.slice(-4), ein_enc: encrypt(v.ein), phone: v.phone, state_of_incorporation: v.state,
    signatory_name: v.signatory, contact_name: v.signatory, payment_term: v.term, account_manager_id: v.am, status: 'onboarding',
    city: v.address.split(',').slice(-2).join(',').replace(/\d{5}/, '').trim()
  }).select('id').single(), 'vendor') as { id: string };
  for (const [n, type] of [['msa', 'MSA'], ['po', 'PO']] as const) {
    const u = uploadField(form, n);
    if (u.file) await addDocumentVersion(s, 'vendor', row.id, type, u.file, { validFrom: u.start, validTo: u.end, ownerLabel: v.name });
    else await db().from('documents').insert({ owner_kind: 'vendor', owner_id: row.id, doc_type: type, valid_from: u.start, valid_to: u.end });
  }
  // Documents the vendor uploads later (W-9, COI, ACH) start as Incomplete in the Document Tracker.
  await db().from('documents').insert([
    { owner_kind: 'vendor', owner_id: row.id, doc_type: 'W-9', uploader_kind: 'vendor' },
    { owner_kind: 'vendor', owner_id: row.id, doc_type: 'COI', uploader_kind: 'vendor' },
    { owner_kind: 'vendor', owner_id: row.id, doc_type: 'ACH form', uploader_kind: 'vendor', no_dates: true }
  ]);
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'vendor', row.id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: v.name });
  await audit(s, 'create', 'vendor', row.id, `created vendor ${v.name}`, null, { ...v, ein: undefined });
  let login;
  try { login = await createLogin(s, { email: v.email, name: v.signatory, role: 'vendor', password: pw.password!, vendorId: row.id }); }
  catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/vendors');
  redirect(`/vendors?${flash(login.sent ? 'Vendor added · login details sent' : 'Vendor added · email not sent', `${v.name} was added. ${await loginNote(login)}`)}`);
}

// Edit Vendor (Super Admin; Account Manager for own vendors). Name, EIN and email are admin-managed and read-only.
export async function updateVendorAction(_: FormState, raw: FormData): Promise<FormState> {
  let form: FormData;
  try { form = await unstage(raw); } catch (e) { return { error: (e as Error).message }; }
  const s = await requireSession(['superadmin', 'accountmanager']);
  const id = String(form.get('id'));
  if (!canSeeVendor(s, id)) return { error: 'You do not have access to this vendor.' };
  const before = must(await db().from('vendors').select('*').eq('id', id).single(), 'vendor') as Record<string, unknown> & { name: string };
  const upd: Record<string, unknown> = {
    address: String(form.get('address') || '').trim(), phone: String(form.get('phone') || '').trim(),
    state_of_incorporation: String(form.get('state_of_incorporation') || ''), signatory_name: String(form.get('signatory_name') || '').trim(),
    signatory_phone: String(form.get('signatory_phone') || '').trim() || null, payment_term: String(form.get('payment_term') || '').trim(),
    status: String(form.get('status') || before.status)
  };
  if (s.persona === 'superadmin') upd.account_manager_id = String(form.get('account_manager_id') || before.account_manager_id);
  const fe: Record<string, string> = {};
  if (!upd.address) fe.address = 'Enter the address.';
  const ph = phoneError(upd.phone as string, true);
  if (ph) fe.phone = ph;
  const sph = phoneError(upd.signatory_phone as string | null);
  if (sph) fe.signatory_phone = sph;
  if (!upd.signatory_name) fe.signatory_name = 'Enter the authorized signatory name.';
  const termErr = await savePaymentTerm(String(upd.payment_term));
  if (termErr) fe.payment_term = termErr;
  const { all, others } = await otherDocs('vendor', id, VENDOR_DOCS);
  await checkDocs(form, ['msa', 'po', ...others.map((d) => `doc_${d.id}`)], fe, all);
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  must(await db().from('vendors').update(upd).eq('id', id), 'update vendor');
  await saveOtherDocs(s, 'vendor', id, before.name, form, others);
  for (const [n, type] of [['msa', 'MSA'], ['po', 'PO']] as const) {
    const u = uploadField(form, n);
    if (u.file) await addDocumentVersion(s, 'vendor', id, type, u.file, { validFrom: u.start, validTo: u.end, ownerLabel: before.name });
    else if (u.start || u.end) await db().from('documents').update({ valid_from: u.start, valid_to: u.end }).eq('owner_kind', 'vendor').eq('owner_id', id).eq('doc_type', type);
  }
  for (const x of extraDocs(form)) if (x.file && x.name) await addDocumentVersion(s, 'vendor', id, x.name, x.file, { validFrom: x.start, validTo: x.end, ownerLabel: before.name });
  await audit(s, 'update', 'vendor', id, `updated vendor ${before.name}`, before, upd);
  revalidatePath('/vendors');
  redirect(`/vendors?${flash('Vendor updated', `${before.name} was saved.`)}`);
}

// VN-5: the vendor edits only address, phone and authorized signatory.
export async function updateCompanyProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['vendor']);
  const id = s.account.vendor_id!;
  const upd = { address: String(form.get('address') || '').trim(), phone: String(form.get('phone') || '').trim(), signatory_name: String(form.get('signatory_name') || '').trim(), signatory_phone: String(form.get('signatory_phone') || '').trim() || null };
  const fe: Record<string, string> = {};
  if (!upd.address) fe.address = 'Enter the address.';
  const ph = phoneError(upd.phone, true);
  if (ph) fe.phone = ph;
  const sph = phoneError(upd.signatory_phone);
  if (sph) fe.signatory_phone = sph;
  if (!upd.signatory_name) fe.signatory_name = 'Enter the authorized signatory name.';
  if (Object.keys(fe).length) return { fieldErrors: fe };
  const before = must(await db().from('vendors').select('address,phone,signatory_name,signatory_phone').eq('id', id).single(), 'vendor');
  must(await db().from('vendors').update(upd).eq('id', id), 'update profile');
  await audit(s, 'update', 'vendor', id, 'updated the company profile', before, upd);
  revalidatePath('/profile');
  redirect(`/profile?${flash('Company profile saved', 'Your address, phone and authorized signatory were updated.')}`);
}

// AUTH-4: Send new password (from Edit Vendor / Edit person / Edit Account Manager), generated or chosen by the sender.
export async function sendNewPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const accountId = String(form.get('account_id'));
  const acc = (await db().from('user_accounts').select('id,role,vendor_id,person_id,full_name,email').eq('id', accountId).maybeSingle()).data as { id: string; role: string; vendor_id: string | null; person_id: string | null; full_name: string; email: string } | null;
  if (!acc) return { error: 'Account not found.' };
  const pw = passwordFromForm(form);
  if (pw.error) return { error: pw.error };
  let ok = acc.role === 'account_manager' && s.persona === 'superadmin';
  if (acc.vendor_id) ok = canSeeVendor(s, acc.vendor_id);
  if (acc.person_id) {
    const p = (await db().from('people').select('id,client_id,vendor_id').eq('id', acc.person_id).maybeSingle()).data;
    ok = !!p && canSeePerson(s, p);
  }
  if (!ok) return { error: 'You do not have access to this account.' };
  let r;
  try { r = await sendNewPassword(s, accountId, pw.password!); } catch (e) { return { error: (e as Error).message }; }
  return { ok: r.sent ? `New password emailed to ${acc.email}. ${acc.full_name} must choose their own password at next sign-in.`
    : `The email could not be sent (email service not set up). Share these login details yourself — Username: ${r.email} · Password: ${r.password}. ${acc.full_name} must choose their own password at next sign-in.` };
}
