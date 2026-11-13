import 'server-only';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { db, must } from '../supabase/admin';
import { loginDetailsEmail, newPasswordEmail, sendEmail } from '../email';
import { addDays, todayISO } from '../format';
import { audit } from '../audit';
import type { Session } from '../session';

// Random 14-character temporary password (letters, digits, symbols).
export function tempPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '#%+=!?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 14) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

// The creator chooses "Generate automatically" or "Set a password" (fields pw_mode / pw_value).
// Returns the password to use, or an error message for the form.
export function passwordFromForm(form: FormData): { password?: string; error?: string } {
  if (String(form.get('pw_mode') || 'generate') !== 'own') return { password: tempPassword() };
  const pw = String(form.get('pw_value') || '');
  if (pw.length < 8) return { error: 'Use at least 8 characters for the password.' };
  if (/\s/.test(pw)) return { error: 'The password cannot contain spaces.' };
  return { password: pw };
}

export type LoginResult = { sent: boolean; email: string; password: string };

// AUTH-2: creates the sign-in (username = email) with the chosen password and emails the login details.
// Vendors and W-2 / 1099 resources (30-day expiry) and account managers (no expiry). Must be changed at first sign-in.
export async function createLogin(s: Session, opts: {
  email: string; name: string; role: 'vendor' | 'resource' | 'account_manager'; password: string; vendorId?: string; personId?: string; phone?: string | null;
}): Promise<LoginResult> {
  const { data, error } = await db().auth.admin.createUser({ email: opts.email, password: opts.password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message.includes('already') ? 'An account with this email already exists.' : `Could not create the sign-in: ${error?.message}`);
  const external = opts.role !== 'account_manager';
  must(await db().from('user_accounts').insert({
    id: data.user.id, role: opts.role, email: opts.email, full_name: opts.name, phone: opts.phone || null, status: 'active',
    password_set_at: new Date().toISOString(), password_expires_at: external ? `${addDays(todayISO(), 30)}T23:59:59Z` : null, must_change_password: true,
    vendor_id: opts.vendorId || null, person_id: opts.personId || null
  }), 'account');
  const sent = await sendEmail('login_details', opts.email, 'Your AT VMS login details', loginDetailsEmail(opts.name, opts.email, opts.password));
  await audit(s, 'invite', 'account', data.user.id, `${sent ? 'emailed' : 'created (email not sent)'} login details for ${opts.name} (${opts.email})`);
  return { sent, email: opts.email, password: opts.password };
}

// AUTH-4: new password (chosen or generated), must be changed at next sign-in; external users get a fresh 30-day period.
export async function sendNewPassword(s: Session, accountId: string, password: string): Promise<LoginResult & { name: string }> {
  const acc = must(await db().from('user_accounts').select('*').eq('id', accountId).single(), 'account') as { id: string; email: string; full_name: string; role: string };
  if (acc.role === 'super_admin') throw new Error('The Super Admin password is changed by the Super Admin.');
  if (acc.role === 'account_manager' && s.persona !== 'superadmin') throw new Error('Only the Super Admin sets account manager passwords.');
  const { error } = await db().auth.admin.updateUserById(acc.id, { password });
  if (error) throw new Error(error.message);
  const external = acc.role === 'vendor' || acc.role === 'resource';
  await db().from('user_accounts').update({
    must_change_password: true, password_set_at: new Date().toISOString(), status: acc.role === 'account_manager' ? 'active' : undefined,
    password_expires_at: external ? `${addDays(todayISO(), 30)}T23:59:59Z` : null
  }).eq('id', acc.id);
  const sent = await sendEmail('new_password', acc.email, 'Your new AT VMS password', newPasswordEmail(acc.full_name, acc.email, password));
  await audit(s, 'update', 'account', acc.id, `${sent ? 'emailed' : 'set (email not sent)'} a new password for ${acc.full_name}`);
  return { sent, email: acc.email, password, name: acc.full_name };
}

// Text for the success message. When the email could not be sent, the login details are kept in a private,
// 2-minute cookie and shown on screen (never in the URL), so they can be shared another way.
export async function loginNote(r: LoginResult) {
  if (r.sent) return `An email with the username (${r.email}) and password was sent to ${r.email}. The password must be changed at first sign-in.`;
  const store = await cookies();
  store.set('vms_login_note', JSON.stringify({ email: r.email, password: r.password }), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 120, path: '/' });
  return 'The email could not be sent (email service not set up). The login details are shown below for 2 minutes — share them yourself.';
}
