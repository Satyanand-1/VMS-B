'use server';
import { isValidEmail } from '../email-format';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeVendor, canSeePerson } from '../session';
import { audit } from '../audit';
import { checkFile, unstage } from '../files';
import { encrypt } from '../crypto';
import { addDocumentVersion, extraDocs, hasCurrentFile, otherDocs, saveOtherDocs, uploadField } from '../domain/documents';
import { createLogin, loginNote, passwordFromForm, sendNewPassword } from '../domain/accounts';
import { docDateErrors, phoneError } from '../validate';
import { amOfVendor, notifyStaff, notifyUsers } from '../domain/notify';
import { likeExact } from '../safe';
import { savePaymentTerm } from '../domain/terms';
import { einProblem, usPhone } from '../formats';
import type { FormState } from './auth';

const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;

const VENDOR_DOCS = ['MSA', 'PO', 'W-9', 'COI', 'ACH form'];
async function checkDocs(form: FormData, names: string[], fe: Record<string, string>, reserved: string[] = []) {
  // MSA and PO need a start and end date with their file; documents added under "Other documents" do not.
  docDateErrors(form, names, fe, { dated: names.filter((n) => n === 'msa' || n === 'po'), reserved: [...VENDOR_DOCS, ...reserved] });
  for (const n of names) {
    const u = uploadField(form, n);
    if (u.file) { const p = await checkFile(u.file); if (p) fe[n] = p; }
  }
  for (const x of extraDocs(form)) if (x.file) { const p = await checkFile(x.file); if (p) fe.extra = p; }
}

// VN-3: Add Vendor (Super Admin, or Account Manager for themselves) + login details email (AUTH-2).
export async function createVendorAction(_: FormState, raw: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  let form: FormData;
  try { form = await unstage(raw, s.account.id); } catch (e) { return { error: (e as Error).message }; }
  const v = {
    name: String(form.get('name') || '').trim(), address: String(form.get('address') || '').trim(), email: String(form.get('email') || '').trim().toLowerCase(),
    einRaw: String(form.get('ein') || '').trim(), ein: String(form.get('ein') || '').replace(/\D/g, ''), phone: usPhone(String(form.get('phone') || '')), state: String(form.get('state_of_incorporation') || ''),
    signatory: String(form.get('signatory_name') || '').trim(), term: String(form.get('payment_term') || '').trim(),
    am: s.persona === 'accountmanager' ? s.account.id : String(form.get('account_manager_id') || '')
  };
  const fe: Record<string, string> = {};
  if (!v.name) fe.name = 'Enter the vendor name.';
  if (!v.address) fe.address = 'Enter the address.';
  if (!isValidEmail(v.email)) fe.email = 'Enter a valid email address. It is the vendor’s sign-in username.';
  const einErr = einProblem(v.einRaw);
  if (einErr) fe.ein = einErr;
  const ph = phoneError(v.phone, true);
  if (ph) fe.phone = ph;
  if (!v.state) fe.state_of_incorporation = 'Choose the state of incorporation.';
  if (!v.signatory) fe.signatory_name = 'Enter the authorized signatory name.';
  if (!v.am) fe.account_manager_id = 'Choose the account manager.';
  const termErr = v.term ? await savePaymentTerm(v.term) : 'Choose the payment term, or type a custom term (Net + days).';
  if (termErr) fe.payment_term = termErr;
  const pw = passwordFromForm(form);
  if (pw.error) fe.pw_value = pw.error;
  await checkDocs(form, ['msa', 'po'], fe);
  if (!uploadField(form, 'msa').file) fe.msa = 'Upload the MSA with its start and end date.';
  if (!fe.email && (await db().from('user_accounts').select('id').eq('email', v.email).maybeSingle()).data) fe.email = 'An account with this email already exists.';
  if (!fe.name && (await db().from('vendors').select('id').ilike('name', likeExact(v.name)).maybeSingle()).data) fe.name = 'A vendor with this name already exists.';
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
  await audit(s, 'create', 'vendor', row.id, `created vendor ${v.name}`, null, { ...v, ein: undefined, einRaw: undefined });
  await notifyStaff(s, [v.am], { title: `New vendor: ${v.name}`, body: `Account manager: ${v.am === s.account.id ? 'you' : 'assigned by the Super Admin'}. Login details were sent to ${v.email}.`, link: `/vendors?m=view-vendor&id=${row.id}` });
  let login;
  try { login = await createLogin(s, { email: v.email, name: v.signatory, role: 'vendor', password: pw.password!, vendorId: row.id }); }
  catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/vendors');
  redirect(`/vendors?${flash(login.sent ? 'Vendor added · login details sent' : 'Vendor added · email not sent', `${v.name} was added. ${await loginNote(login, s)}`)}`);
}

// Edit Vendor (Super Admin; Account Manager for own vendors). Name, EIN and email are admin-managed and read-only.
export async function updateVendorAction(_: FormState, raw: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  let form: FormData;
  try { form = await unstage(raw, s.account.id); } catch (e) { return { error: (e as Error).message }; }
  const id = String(form.get('id'));
  if (!canSeeVendor(s, id)) return { error: 'You do not have access to this vendor.' };
  const before = must(await db().from('vendors').select('*').eq('id', id).single(), 'vendor') as Record<string, unknown> & { name: string };
  const upd: Record<string, unknown> = {
    address: String(form.get('address') || '').trim(), phone: usPhone(String(form.get('phone') || '')),
    state_of_incorporation: String(form.get('state_of_incorporation') || ''), signatory_name: String(form.get('signatory_name') || '').trim(),
    signatory_phone: usPhone(String(form.get('signatory_phone') || '')) || null, payment_term: String(form.get('payment_term') || '').trim(),
    status: (['active', 'onboarding', 'inactive'] as string[]).includes(String(form.get('status'))) ? String(form.get('status')) : before.status
  };
  if (s.persona === 'superadmin') upd.account_manager_id = String(form.get('account_manager_id') || before.account_manager_id);
  const fe: Record<string, string> = {};
  if (!upd.address) fe.address = 'Enter the address.';
  const ph = phoneError(upd.phone as string, true);
  if (ph) fe.phone = ph;
  const sph = phoneError(upd.signatory_phone as string | null);
  if (sph) fe.signatory_phone = sph;
  if (!upd.signatory_name) fe.signatory_name = 'Enter the authorized signatory name.';
  if (!upd.state_of_incorporation) fe.state_of_incorporation = 'Choose the state of incorporation.';
  const termErr = upd.payment_term ? await savePaymentTerm(String(upd.payment_term)) : 'Choose the payment term, or type a custom term (Net + days).';
  if (termErr) fe.payment_term = termErr;
  const { all, others } = await otherDocs('vendor', id, VENDOR_DOCS);
  await checkDocs(form, ['msa', 'po', ...others.map((d) => `doc_${d.id}`)], fe, all);
  if (!uploadField(form, 'msa').file && !(await hasCurrentFile('vendor', id, 'MSA'))) fe.msa = 'Upload the MSA with its start and end date.';
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
  if (upd.account_manager_id && upd.account_manager_id !== before.account_manager_id)
    await notifyUsers([upd.account_manager_id as string], { title: `Vendor assigned to you: ${before.name}`, body: 'You are now the account manager for this vendor and its consultants.', link: `/vendors?m=view-vendor&id=${id}` }, s.account.id);
  revalidatePath('/vendors');
  redirect(`/vendors?${flash('Vendor updated', `${before.name} was saved.`)}`);
}

// VN-5: the vendor edits only address, phone and authorized signatory.
export async function updateCompanyProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['vendor']);
  const id = s.account.vendor_id!;
  const upd = { address: String(form.get('address') || '').trim(), phone: usPhone(String(form.get('phone') || '')), signatory_name: String(form.get('signatory_name') || '').trim(), signatory_phone: usPhone(String(form.get('signatory_phone') || '')) || null };
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
  const vname = ((await db().from('vendors').select('name').eq('id', id).single()).data as { name: string } | null)?.name;
  await notifyStaff(s, [await amOfVendor(id)], { title: `${vname} updated its company profile`, body: 'Address, phone or authorized signatory changed.', link: `/vendors?m=view-vendor&id=${id}` });
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
    : `The email could not be sent (email service not set up). ${acc.full_name} must choose their own password at next sign-in. Share these login details yourself — Username: ${r.email}   Password: ${r.password}` };
}
