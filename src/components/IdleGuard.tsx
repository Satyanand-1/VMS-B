'use client';
import { useEffect, useRef, useState } from 'react';

// 15-minute session limit in the browser (every portal). Activity (mouse, keys, scroll, touch) in any open tab keeps the
// session alive: the last activity time is shared between tabs, and the server's activity clock is refreshed at most once a
// minute while the user is active. After 14 idle minutes a warning offers "Stay signed in"; at 15 minutes the user is signed out.
const IDLE_MS = 15 * 60_000;
const WARN_MS = 14 * 60_000;
const PING_EVERY_MS = 60_000;
const KEY = 'vms_last_activity';

const readShared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const writeShared = (t: number) => { try { localStorage.setItem(KEY, String(t)); } catch { /* private mode */ } };

export function IdleGuard() {
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(60);
  const lastPing = useRef(Date.now());
  const last = useRef(Date.now());

  useEffect(() => {
    last.current = Date.now();
    writeShared(last.current);
    const ping = () => { lastPing.current = Date.now(); fetch('/api/session/ping', { cache: 'no-store', credentials: 'same-origin' }).then((r) => { if (r.status === 401) window.location.href = '/login/signed-out?reason=idle'; }).catch(() => {}); };
    const active = () => {
      const now = Date.now();
      last.current = now;
      writeShared(now);
      if (now - lastPing.current > PING_EVERY_MS) ping();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    const tick = window.setInterval(() => {
      const idle = Date.now() - Math.max(last.current, readShared());
      if (idle >= IDLE_MS) { window.location.href = '/login/signed-out?reason=idle'; return; }
      setWarn(idle >= WARN_MS);
      setLeft(Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)));
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, active)); window.clearInterval(tick); };
  }, []);

  if (!warn) return null;
  return (
    <div className="idle-warning" role="alertdialog" aria-live="assertive" aria-label="Session about to end">
      <div>
        <div className="alert-title">Still there?</div>
        <div className="alert-text">For security you will be signed out in {left} second{left === 1 ? '' : 's'} because of inactivity.</div>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => {
        last.current = Date.now(); writeShared(last.current); lastPing.current = Date.now(); setWarn(false);
        fetch('/api/session/ping', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
      }}>Stay signed in</button>
    </div>
  );
}
