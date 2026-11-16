import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// Role, inactive-account and password-expiry checks run in the (app) layout, which reads the account row.
//
// Session limit (every portal): signed out after 15 minutes without activity. The time of the last request is kept in
// "vms_seen", an httpOnly cookie signed with HMAC so it cannot be edited to stay signed in. Activity in the browser
// (typing, clicking) refreshes it through /api/session/ping, so someone filling in a long form is not signed out.
const IDLE_MINUTES = 15;
const SEEN = 'vms_seen';

async function hmac(value: string) {
  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function lastSeen(request: NextRequest): Promise<number | null> {
  const raw = request.cookies.get(SEEN)?.value || '';
  const [ts, sig] = raw.split('.');
  if (!ts || !sig || sig !== (await hmac(ts))) return null;
  return Number(ts) || null;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // Same as src/lib/supabase/server.ts: sign-in cookies are httpOnly, HTTPS-only in production and SameSite=Lax.
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/invite');
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const now = Date.now();
    const seen = await lastSeen(request);
    if (seen && now - seen > IDLE_MINUTES * 60_000) {
      // Idle too long: end the session (the signed-out route signs out and explains why).
      const url = request.nextUrl.clone();
      url.pathname = '/login/signed-out';
      url.search = '?reason=idle';
      return path.startsWith('/api/') ? new NextResponse('Session expired', { status: 401 }) : NextResponse.redirect(url);
    }
    const ts = String(now);
    response.cookies.set(SEEN, `${ts}.${await hmac(ts)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|arkhya-lockup-dark.svg|api/cron).*)']
};
