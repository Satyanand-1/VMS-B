'use server';
import { db } from '../supabase/admin';
import { loadSession } from '../session';

export async function markNotificationsRead() {
  const s = await loadSession();
  if (!s) return;
  await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', s.account.id).is('read_at', null);
}
