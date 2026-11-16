import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Runs before every page and API request (except static files and the cron jobs):
//  1. Content Security Policy with a fresh nonce per request: only scripts carrying that nonce (Next.js's own) may run,
//     plus what they load ('strict-dynamic'). No inline or injected script can run.
//  2. Refreshes the Supabase session cookie and sends signed-out visitors to /login.
//  3. Session limit (every portal): signed out after 15 minutes without activity. The time of the last request is kept in
//     "vms_seen", an httpOnly cookie signed with HMAC-SHA256 so it cannot be edited to stay signed in. Activity in the
//     browser (typing, clicking) refreshes it through /api/session/ping, so someone filling in a long form is not signed out.
// Role, inactive-account and password-expiry checks run in the (app) layout, which reads the account row.
const IDLE_MINUTES = 15;
const SEEN = 'vms_seen';
const dev = process.env.NODE_ENV !== 'production';

function supabaseOrigin() {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin; } catch { return ''; }
}
function contentSecurityPolicy(nonce: string) {
  const sb = supabaseOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${sb}`,
    `connect-src 'self' ${sb}${dev ? ' ws: http://127.0.0.1:* http://localhost:*' : ''}`,
    `frame-src 'self' ${sb}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(!dev && sb.startsWith('https://') ? ['upgrade-insecure-requests'] : [])
  ].join('; ');
}

// The signing key for the activity cookie: SESSION_SECRET, or else ENCRYPTION_KEY, or else the service-role key
// (all long random secrets that never reach the browser). Never an empty key.
function signingSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (s.length < 32) throw new Error('SESSION_SECRET (or ENCRYPTION_KEY) must be set to a long random value.');
  return s;
}
async function hmac(value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Constant-time comparison, so the signature cannot be guessed byte by byte from response times.
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function lastSeen(request: NextRequest): Promise<number | null> {
  const raw = request.cookies.get(SEEN)?.value || '';
  const [ts, sig] = raw.split('.');
  if (!ts || !sig || !/^\d{13}$/.test(ts) || !sameText(sig, await hmac(ts))) return null;
  return Number(ts);
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from these request headers and adds it to its own scripts.
  const forward = () => {
    const h = new Headers(request.headers);
    h.set('x-nonce', nonce);
    h.set('content-security-policy', csp);
    h.set('cookie', request.cookies.toString());
    return NextResponse.next({ request: { headers: h } });
  };
  const withCsp = (res: NextResponse) => { res.headers.set('Content-Security-Policy', csp); return res; };

  let response = forward();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // Same as src/lib/supabase/server.ts: sign-in cookies are httpOnly, HTTPS-only in production and SameSite=Lax.
    cookieOptions: { httpOnly: true, secure: !dev, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/invite');
  if (!user && !isPublic) {
    if (path.startsWith('/api/')) return new NextResponse('Not signed in', { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return withCsp(NextResponse.redirect(url));
  }

  if (user && !isPublic) {
    const now = Date.now();
    const seen = await lastSeen(request);
    if (seen && now - seen > IDLE_MINUTES * 60_000) {
      // Idle too long: end the session (the signed-out route signs out and explains why).
      if (path.startsWith('/api/')) return new NextResponse('Session expired', { status: 401 });
      const url = request.nextUrl.clone();
      url.pathname = '/login/signed-out';
      url.search = '?reason=idle';
      return withCsp(NextResponse.redirect(url));
    }
    const ts = String(now);
    response.cookies.set(SEEN, `${ts}.${await hmac(ts)}`, { httpOnly: true, secure: !dev, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
  }
  return withCsp(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|arkhya-lockup-dark.svg|api/cron).*)']
};
