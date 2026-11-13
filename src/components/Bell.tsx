'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { markNotificationsRead } from '@/lib/actions/notifications';

export type Note = { id: string; title: string; body: string | null; link: string | null; when: string; unread: boolean };

// Notifications bell: unread count, and a list of recent notifications (REC-8 in-app). Opening it marks them read.
export function Bell({ notes, unread }: { notes: Note[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="user-block" ref={box}>
      <button className="ghost-button notif-button" aria-label="Notifications" type="button" aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (count) { setCount(0); markNotificationsRead(); } }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {count ? <span className="notif-count">{count}</span> : null}
      </button>
      {open ? (
        <div className="profile-menu notif-menu" role="menu">
          <div className="profile-menu-head"><div className="user-name">Notifications</div></div>
          {notes.length ? notes.map((n) => (
            <Link key={n.id} href={n.link || '/dashboard'} className="profile-menu-item notif-item" onClick={() => setOpen(false)}>
              <span className="notif-title">{n.unread ? <b>{n.title}</b> : n.title}</span>
              {n.body ? <span className="person-sub">{n.body}</span> : null}
              <span className="person-sub">{n.when}</span>
            </Link>
          )) : <div className="profile-menu-item"><span className="person-sub">No notifications yet.</span></div>}
        </div>
      ) : null}
    </div>
  );
}
