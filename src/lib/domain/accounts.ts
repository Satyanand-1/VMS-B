import 'server-only';
import { randomInt } from 'crypto';
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

// AUTH-2: creates the sign-in for a vendor / consultant / W-2 / 1099 resource and emails username + temporary password.
export async function createExternalLogin(s: Session, opts: { email: string; name: string; role: 'vendor' | 'resource'; vendorId?: string; personId?: string }) {
  const password = tempPassword();
  const { data, error } = await db().auth.admin.createUser({ email: opts.email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message.includes('already') ? 'An account with this email already exists.' : `Could not create the sign-in: ${error?.message}`);
  must(await db().from('user_accounts').insert({
    id: data.user.id, role: opts.role, email: opts.email, full_name: opts.name, status: 'active',
    password_set_at: new Date().toISOString(), password_expires_at: `${addDays(todayISO(), 30)}T23:59:59Z`, must_change_password: true,
    vendor_id: opts.vendorId || null, person_id: opts.personId || null
  }), 'account');
  const sent = await sendEmail('login_details', opts.email, 'Your AT VMS login details', loginDetailsEmail(opts.name, opts.email, password));
  await audit(s, 'invite', 'account', data.user.id, `sent login details to ${opts.name} (${opts.email})`);
  return { sent };
}

// AUTH-4: new temporary password, must be changed at next sign-in; starts a fresh 30-day period.
export async function sendNewPassword(s: Session, accountId: string) {
  const acc = must(await db().from('user_accounts').select('*').eq('id', accountId).single(), 'account') as { id: string; email: string; full_name: string; role: string };
  if (acc.role !== 'vendor' && acc.role !== 'resource') throw new Error('Only vendor, consultant and resource passwords are sent this way.');
  const password = tempPassword();
  const { error } = await db().auth.admin.updateUserById(acc.id, { password });
  if (error) throw new Error(error.message);
  await db().from('user_accounts').update({
    must_change_password: true, password_set_at: new Date().toISOString(), password_expires_at: `${addDays(todayISO(), 30)}T23:59:59Z`
  }).eq('id', acc.id);
  await sendEmail('new_password', acc.email, 'Your new AT VMS temporary password', newPasswordEmail(acc.full_name, acc.email, password));
  await audit(s, 'update', 'account', acc.id, `sent a new temporary password to ${acc.full_name}`);
  return acc;
}
