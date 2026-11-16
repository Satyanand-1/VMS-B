'use server';
import { passwordProblem } from '../password';
import { isValidEmail } from '../email-format';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { authClient } from '../supabase/server';
import { db } from '../supabase/admin';
import { audit } from '../audit';
import { loadSession, passwordInfo, isExternal, PASSWORD_DAYS, type Account } from '../session';
import { addDays, todayISO } from '../format';

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string } | undefined;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;


// AUTH-1, AUTH-2, AUTH-3, AUTH-7
export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') || '').trim().toLowerCase();
  // Passwords never contain spaces, so spaces or line breaks picked up when copying from an email are removed.
  const password = String(form.get('password') || '').replace(/\s+/g, '');
  if (!isValidEmail(email)) return { error: 'Enter a valid email address.' };
  if (!password) return { error: 'Enter your password.' };
  if (password.length > 200) return { error: 'Email or password is incorrect.' };

  // Brute-force protection: after 5 wrong passwords for an email within 15 minutes, that email is locked for 15 minutes.
  const since = new Date(Date.now() - LOCK_MINUTES * 60000).toISOString();
  const { count: fails } = await db().from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', 'login_failed').eq('entity_id', email).gte('at', since);
  if ((fails || 0) >= MAX_FAILS) return { error: `Too many unsuccessful sign-ins. For your security this account is locked for ${LOCK_MINUTES} minutes. Try again later or ask your account manager to send a new password.` };

  const { data: acc } = await db().from('user_accounts').select('*').eq('email', email).maybeSingle();
  const account = acc as Account | null;
  let consultant = false;
  if (account?.person_id) {
    const p = (await db().from('people').select('type').eq('id', account.person_id).maybeSingle()).data as { type: string } | null;
    consultant = p?.type === 'consultant'; // vendor consultants have no login
  }

  // The password is checked first, so the messages below never reveal whether an email has an account.
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !account || consultant) {
    await supabase.auth.signOut();
    await db().from('audit_log').insert({ action: 'login_failed', entity: 'session', entity_id: email, summary: 'unsuccessful sign-in', actor_name: email });
    return { error: 'Email or password is incorrect.' };
  }
  if (account.status === 'inactive' || account.status === 'invited') {
    await supabase.auth.signOut();
    return { error: account.status === 'inactive' ? 'This account is inactive. Contact your account manager to restore access.'
      : 'Your account is not active yet. Use the invite link in your email to set a password.' };
  }
  const p = passwordInfo(account);
  if (!account.must_change_password && p.expired) {
    await supabase.auth.signOut();
    return { error: `Your password expired on ${p.expires}. Passwords must be changed every 30 days. Your account manager will email you a new temporary password.` };
  }
  await db().from('user_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', account.id);
  await audit({ account }, 'login', 'session', account.id, 'signed in (password)');
  (await cookies()).delete('vms_seen'); // a new session starts its 15-minute activity clock fresh
  redirect(account.must_change_password ? '/login/set-password' : '/dashboard');
}

// First sign-in with a temporary password: choose a new one (AUTH-2).
export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const s = await loadSession();
  if (!s) redirect('/login');
  const pw = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');
  const weak = passwordProblem(pw);
  if (weak) return { error: weak };
  if (pw !== confirm) return { error: 'The two passwords do not match.' };
  const checker = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await checker.auth.signInWithPassword({ email: s.account.email, password: pw })).error) return { error: 'Choose a password different from the temporary one.' };
  const { error } = await db().auth.admin.updateUserById(s.account.id, { password: pw });
  if (error) return { error: error.message };
  const today = todayISO();
  await db().from('user_accounts').update({
    must_change_password: false,
    password_set_at: new Date().toISOString(),
    password_expires_at: isExternal(s.account.role) ? `${addDays(today, PASSWORD_DAYS)}T23:59:59Z` : null
  }).eq('id', s.account.id);
  await audit(s, 'update', 'password', s.account.id, 'set a new password (first sign-in)');
  await renewSession(s.account.email, pw);
  redirect('/dashboard');
}

// Change Password (AUTH-5): the current password must be correct; a new one starts a fresh 30-day period.
export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const s = await loadSession();
  if (!s) redirect('/login');
  const current = String(form.get('current') || '').replace(/\s+/g, '');
  const pw = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');
  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = 'Enter your current password.';
  const weak = passwordProblem(pw);
  if (weak) fieldErrors.password = weak;
  else if (pw === current) fieldErrors.password = 'The new password must be different from the current one.';
  if (pw !== confirm) fieldErrors.confirm = 'The two passwords do not match.';
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  // Check the current password with a separate client so the signed-in session is never touched.
  const checker = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = await checker.auth.signInWithPassword({ email: s.account.email, password: current });
  if (check.error) return { fieldErrors: { current: 'Current password is incorrect.' } };
  await checker.auth.signOut({ scope: 'local' }); // only this check's session, never the user's browser session
  const { error } = await db().auth.admin.updateUserById(s.account.id, { password: pw });
  if (error) return { error: error.message };
  const expires = addDays(todayISO(), PASSWORD_DAYS);
  await db().from('user_accounts').update({
    password_set_at: new Date().toISOString(), password_expires_at: `${expires}T23:59:59Z`, must_change_password: false
  }).eq('id', s.account.id);
  await audit(s, 'update', 'password', s.account.id, 'changed password');
  await renewSession(s.account.email, pw);
  const p = passwordInfo({ ...s.account, password_set_at: new Date().toISOString(), password_expires_at: `${expires}T23:59:59Z`, must_change_password: false });
  redirect(`/dashboard?flash=${encodeURIComponent(`Password changed|Your new password is valid until ${p.expires}.`)}`);
}

// After a password change Supabase may end the existing session; sign in again with the new password
// so the user stays signed in and lands on the dashboard.
async function renewSession(email: string, password: string) {
  const supabase = await authClient();
  await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const s = await loadSession();
  const supabase = await authClient();
  await supabase.auth.signOut();
  if (s) await audit(s, 'logout', 'session', s.account.id, 'signed out');
  (await cookies()).delete('vms_seen');
  redirect('/login');
}
