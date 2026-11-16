import 'server-only';
import { db } from '../supabase/admin';
import type { Session } from '../session';

// In-app notifications (the bell, top right, on every portal). Each one has a title, optional text and a link.
type Note = { title: string; body?: string | null; link?: string | null };

export async function notifyUsers(userIds: (string | null | undefined)[], note: Note, exceptUserId?: string) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x && x !== exceptUserId)));
  if (!ids.length) return;
  await db().from('notifications').insert(ids.map((user_id) => ({ user_id, title: note.title, body: note.body || null, link: note.link || null })));
}

async function superAdmins(): Promise<string[]> {
  return ((await db().from('user_accounts').select('id').eq('role', 'super_admin').eq('status', 'active')).data || []).map((r) => r.id as string);
}

// Staff responsible for a record: its account manager(s) plus the Super Admin(s). The person acting is never notified about their own action.
export async function notifyStaff(s: Session, amIds: (string | null | undefined)[], note: Note) {
  await notifyUsers([...amIds, ...(await superAdmins())], note, s.account.id);
}

export async function amOfPerson(personId: string): Promise<string | null> {
  const p = (await db().from('people').select('account_manager_id,vendor_id').eq('id', personId).maybeSingle()).data as { account_manager_id: string | null; vendor_id: string | null } | null;
  if (!p) return null;
  if (p.account_manager_id) return p.account_manager_id;
  if (p.vendor_id) return ((await db().from('vendors').select('account_manager_id').eq('id', p.vendor_id).maybeSingle()).data as { account_manager_id: string } | null)?.account_manager_id || null;
  return null;
}
export async function amOfVendor(vendorId: string): Promise<string | null> {
  return ((await db().from('vendors').select('account_manager_id').eq('id', vendorId).maybeSingle()).data as { account_manager_id: string } | null)?.account_manager_id || null;
}
