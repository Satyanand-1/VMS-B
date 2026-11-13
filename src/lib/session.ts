import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { authClient } from './supabase/server';
import { db, must } from './supabase/admin';
import { addDays, daysBetween, fmtDate, todayISO } from './format';

export type Role = 'super_admin' | 'account_manager' | 'vendor' | 'resource';
export type Persona = 'superadmin' | 'accountmanager' | 'vendor' | 'w2' | 'w9';

export type Account = {
  id: string; role: Role; email: string; full_name: string; phone: string | null; status: string;
  password_set_at: string | null; password_expires_at: string | null; must_change_password: boolean;
  vendor_id: string | null; person_id: string | null; last_login_at: string | null;
};

// What the signed-in user may see. Every query filters by this (AUTH-6).
export type Scope = {
  all: boolean;            // Super Admin
  clientIds: string[];     // Account Manager: own clients
  vendorIds: string[];     // Account Manager: own vendors; Vendor: itself
  personId: string | null; // Resource: itself
};

export type Session = { account: Account; persona: Persona; scope: Scope; personType: 'w2' | 'w1099' | 'consultant' | null };

export const PASSWORD_DAYS = 30;
export const isExternal = (role: Role) => role === 'vendor' || role === 'resource';

export function passwordInfo(a: Pick<Account, 'password_set_at' | 'password_expires_at' | 'must_change_password' | 'role'>) {
  const set = a.password_set_at ? a.password_set_at.slice(0, 10) : todayISO();
  const expires = a.password_expires_at ? a.password_expires_at.slice(0, 10) : addDays(set, PASSWORD_DAYS);
  const daysLeft = daysBetween(todayISO(), expires);
  return {
    set: fmtDate(set), expires: fmtDate(expires), daysLeft,
    expired: isExternal(a.role) && daysLeft < 0,
    temp: a.must_change_password
  };
}

// Loads the account for the current Supabase session (once per request).
export const loadSession = cache(async (): Promise<Session | null> => {
  const supabase = await authClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await db().from('user_accounts').select('*').eq('id', user.id).maybeSingle();
  if (!account) return null;
  const a = account as Account;

  let personType: Session['personType'] = null;
  if (a.person_id) {
    const p = must(await db().from('people').select('type').eq('id', a.person_id).single(), 'person');
    personType = (p as { type: Session['personType'] }).type;
  }
  const persona: Persona = a.role === 'super_admin' ? 'superadmin' : a.role === 'account_manager' ? 'accountmanager'
    : a.role === 'vendor' ? 'vendor' : personType === 'w2' ? 'w2' : 'w9';

  const scope: Scope = { all: a.role === 'super_admin', clientIds: [], vendorIds: [], personId: a.person_id };
  if (a.role === 'account_manager') {
    const cl = must(await db().from('client_account_managers').select('client_id').eq('account_manager_id', a.id), 'scope clients') as { client_id: string }[];
    const vn = must(await db().from('vendors').select('id').eq('account_manager_id', a.id), 'scope vendors') as { id: string }[];
    scope.clientIds = cl.map((r) => r.client_id);
    scope.vendorIds = vn.map((r) => r.id);
  }
  if (a.role === 'vendor' && a.vendor_id) scope.vendorIds = [a.vendor_id];
  return { account: a, persona, scope, personType };
});

// For pages and actions: signed in, active, password valid, allowed persona. Redirects otherwise.
export async function requireSession(allowed?: Persona[]): Promise<Session> {
  const s = await loadSession();
  if (!s) redirect('/login');
  if (s.account.status === 'inactive' || s.personType === 'consultant') redirect('/login/signed-out?reason=inactive');
  if (s.account.must_change_password) redirect('/login/set-password');
  if (passwordInfo(s.account).expired) redirect('/login/signed-out?reason=expired');
  if (allowed && !allowed.includes(s.persona)) redirect('/dashboard');
  return s;
}

export const isStaff = (s: Session) => s.persona === 'superadmin' || s.persona === 'accountmanager';

// Ownership checks (403 when a record is outside the user's scope).
export class Forbidden extends Error {
  constructor() { super('You do not have access to this record.'); }
}
export function canSeeClient(s: Session, clientId: string | null) {
  return s.scope.all || (!!clientId && s.scope.clientIds.includes(clientId));
}
export function canSeeVendor(s: Session, vendorId: string | null) {
  return s.scope.all || (!!vendorId && s.scope.vendorIds.includes(vendorId));
}
export function canSeePerson(s: Session, p: { id: string; client_id: string | null; vendor_id: string | null }) {
  if (s.scope.all) return true;
  if (s.persona === 'accountmanager') return canSeeClient(s, p.client_id) || canSeeVendor(s, p.vendor_id);
  if (s.persona === 'vendor') return canSeeVendor(s, p.vendor_id);
  return s.scope.personId === p.id;
}
