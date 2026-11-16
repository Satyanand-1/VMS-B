import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '@/lib/supabase/server';
import { loadSession, passwordInfo } from '@/lib/session';
import { audit } from '@/lib/audit';

// An inactive account or an expired password ends the session and returns to sign-in with the reason.
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get('reason');
  const s = await loadSession();
  let notice = 'Please sign in again.';
  if (reason === 'inactive') notice = 'This account cannot sign in. Contact your account manager.';
  if (reason === 'idle') {
    notice = 'You were signed out after 15 minutes without activity. Please sign in again.';
    if (s) await audit(s, 'logout', 'session', s.account.id, 'signed out after 15 minutes without activity');
  }
  if (reason === 'expired' && s) {
    notice = `Your password expired on ${passwordInfo(s.account).expires}. Passwords must be changed every 30 days. Your account manager will email you a new temporary password.`;
  }
  const supabase = await authClient();
  await supabase.auth.signOut();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?notice=${encodeURIComponent(notice)}`;
  const res = NextResponse.redirect(url);
  res.cookies.delete('vms_seen');
  return res;
}
