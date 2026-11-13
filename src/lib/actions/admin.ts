'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash, randomBytes } from 'crypto';
import { db, must } from '../supabase/admin';
import { requireSession } from '../session';
import { audit } from '../audit';
import { sendEmail } from '../email';
import type { FormState } from './auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const flash = (title: string, text: string) => `flash=${encodeURIComponent(`${title}|${text}`)}`;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

// ADM-3: single-use invite link valid 72 hours; a new one voids the previous.
async function sendInvite(userId: string, email: string, name: string) {
  await db().from('invites').update({ voided_at: new Date().toISOString() }).eq('user_id', userId).is('used_at', null).is('voided_at', null);
  const token = randomBytes(32).toString('hex');
  await db().from('invites').insert({ user_id: userId, token_hash: hash(token), expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString() });
  return sendEmail('am_invite', email, 'Your AT VMS account manager invite',
    `Hello ${name},\n\nYou have been added as an Account Manager in AT VMS. Set your password with this link (valid for 72 hours, single use):\n\n${process.env.APP_BASE_URL}/invite/${token}\n\nArkhya Tech`);
}

// ADM-2: Add Account Manager (name, unique email, phone, at least one client) + invite.
export async function createAmAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const name = String(form.get('full_name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const phone = String(form.get('phone') || '').trim() || null;
  const clients = form.getAll('clients').map(String);
  const fe: Record<string, string> = {};
  if (!name) fe.full_name = 'Enter the full name.';
  if (!EMAIL.test(email)) fe.email = 'Enter a valid work email.';
  else if ((await db().from('user_accounts').select('id').eq('email', email).maybeSingle()).data) fe.email = 'An account with this email already exists.';
  if (!clients.length) fe.clients = 'Select at least one client.';
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) return { error: error?.message || 'Could not create the account.' };
  must(await db().from('user_accounts').insert({ id: data.user.id, role: 'account_manager', email, full_name: name, phone, status: 'invited' }), 'account');
  must(await db().from('client_account_managers').insert(clients.map((c) => ({ client_id: c, account_manager_id: data.user!.id }))), 'clients');
  await sendInvite(data.user.id, email, name);
  await audit(s, 'create', 'account_manager', data.user.id, `added account manager ${name} and sent an invite`);
  revalidatePath('/settings/users');
  redirect(`/settings/users?${flash('Invite sent', `${name} was added with status Invited. An invite link (valid 72 hours) was emailed to ${email}.`)}`);
}

// ADM-4: Edit name, email, phone, status and clients. A client is never left without an account manager.
export async function updateAmAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const id = String(form.get('id'));
  const before = must(await db().from('user_accounts').select('*').eq('id', id).single(), 'am') as { full_name: string; email: string; status: string };
  const name = String(form.get('full_name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const phone = String(form.get('phone') || '').trim() || null;
  const status = String(form.get('status') || before.status);
  const clients = form.getAll('clients').map(String);
  const fe: Record<string, string> = {};
  if (!name) fe.full_name = 'Enter the full name.';
  if (!EMAIL.test(email)) fe.email = 'Enter a valid work email.';
  else if (email !== before.email && (await db().from('user_accounts').select('id').eq('email', email).maybeSingle()).data) fe.email = 'An account with this email already exists.';
  const current = (must(await db().from('client_account_managers').select('client_id').eq('account_manager_id', id), 'clients') as { client_id: string }[]).map((r) => r.client_id);
  const removed = current.filter((c) => !clients.includes(c));
  for (const c of removed) {
    const others = (await db().from('client_account_managers').select('account_manager_id').eq('client_id', c).neq('account_manager_id', id)).data || [];
    if (!others.length) {
      const cn = (await db().from('clients').select('name').eq('id', c).single()).data?.name;
      fe.clients = `${cn} has no other account manager. Assign another one to it before removing it here.`;
    }
  }
  if (Object.keys(fe).length) return { fieldErrors: fe, error: 'Check the highlighted fields.' };
  must(await db().from('user_accounts').update({ full_name: name, email, phone, status }).eq('id', id), 'update');
  if (email !== before.email) await db().auth.admin.updateUserById(id, { email, email_confirm: true });
  const added = clients.filter((c) => !current.includes(c));
  if (added.length) must(await db().from('client_account_managers').insert(added.map((c) => ({ client_id: c, account_manager_id: id }))), 'add');
  if (removed.length) must(await db().from('client_account_managers').delete().eq('account_manager_id', id).in('client_id', removed), 'remove');
  await audit(s, 'update', 'account_manager', id, `updated account manager ${name}`, before, { full_name: name, email, phone, status, clients });
  revalidatePath('/settings/users');
  redirect(`/settings/users?${flash('Account manager updated', `${name} was saved.`)}`);
}

export async function resendInviteAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const id = String(form.get('id'));
  const am = must(await db().from('user_accounts').select('full_name,email,status').eq('id', id).single(), 'am') as { full_name: string; email: string; status: string };
  if (am.status !== 'invited') return { error: 'Only invited account managers get a new invite.' };
  await sendInvite(id, am.email, am.full_name);
  await audit(s, 'invite', 'account_manager', id, `resent the invite to ${am.full_name}`);
  return { ok: `A new invite link was emailed to ${am.email}; the previous link no longer works.` };
}

// ADM-5: Delete, reassigning clients and vendors to an Active account manager in the same step.
export async function deleteAmAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const id = String(form.get('id'));
  const to = String(form.get('reassign_to') || '');
  const am = must(await db().from('user_accounts').select('full_name').eq('id', id).single(), 'am') as { full_name: string };
  const [cl, vn] = await Promise.all([
    db().from('client_account_managers').select('client_id').eq('account_manager_id', id),
    db().from('vendors').select('id').eq('account_manager_id', id)
  ]);
  const hasWork = (cl.data || []).length + (vn.data || []).length > 0;
  if (hasWork) {
    if (!to) return { fieldErrors: { reassign_to: 'Choose an Active account manager to take over these clients and vendors.' } };
    const target = (await db().from('user_accounts').select('status,role').eq('id', to).maybeSingle()).data as { status: string; role: string } | null;
    if (!target || target.role !== 'account_manager' || target.status !== 'active' || to === id) return { fieldErrors: { reassign_to: 'Choose an Active account manager.' } };
    for (const { client_id } of cl.data || []) {
      const exists = (await db().from('client_account_managers').select('client_id').eq('client_id', client_id).eq('account_manager_id', to).maybeSingle()).data;
      if (!exists) await db().from('client_account_managers').insert({ client_id, account_manager_id: to });
    }
    await db().from('vendors').update({ account_manager_id: to }).eq('account_manager_id', id);
  }
  await db().from('people').update({ account_manager_id: to || null }).eq('account_manager_id', id);
  await db().from('client_account_managers').delete().eq('account_manager_id', id);
  const { error } = await db().auth.admin.deleteUser(id);
  if (error) return { error: error.message };
  await audit(s, 'delete', 'account_manager', id, `deleted account manager ${am.full_name}${hasWork ? ' and reassigned their clients and vendors' : ''}`);
  revalidatePath('/settings/users');
  redirect(`/settings/users?${flash('Account manager deleted', `${am.full_name} was removed.${hasWork ? ' Their clients and vendors were reassigned.' : ''}`)}`);
}

// Invite link: set the password, then sign in normally (status becomes Active).
export async function acceptInviteAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') || '');
  const pw = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');
  if (pw.length < 8) return { error: 'Use at least 8 characters.' };
  if (pw !== confirm) return { error: 'The two passwords do not match.' };
  const inv = (await db().from('invites').select('*').eq('token_hash', hash(token)).maybeSingle()).data as { id: string; user_id: string; expires_at: string; used_at: string | null; voided_at: string | null } | null;
  if (!inv || inv.used_at || inv.voided_at || new Date(inv.expires_at) < new Date()) return { error: 'This invite link is no longer valid. Ask the Super Admin to resend it.' };
  const { error } = await db().auth.admin.updateUserById(inv.user_id, { password: pw });
  if (error) return { error: error.message };
  await db().from('invites').update({ used_at: new Date().toISOString() }).eq('id', inv.id);
  await db().from('user_accounts').update({ status: 'active', password_set_at: new Date().toISOString() }).eq('id', inv.user_id);
  await audit(null, 'update', 'account_manager', inv.user_id, 'account manager set a password from the invite link');
  redirect(`/login?notice=${encodeURIComponent('Your password is set. Sign in with your email and new password.')}`);
}
