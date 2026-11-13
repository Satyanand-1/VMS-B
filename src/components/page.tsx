// Page frame: top bar (breadcrumb + Back, title, bell, profile menu) and the screen body.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BackButton, ProfileMenu } from './client';
import { Alert } from './ui';
import { profileMenuFor } from '@/lib/nav';
import { signOut } from '@/lib/actions/auth';
import { db } from '@/lib/supabase/admin';
import type { Session } from '@/lib/session';

const ROLE_LABEL = { superadmin: 'Super Admin', accountmanager: 'Account Manager', vendor: '', w2: 'W-2 Resource', w9: '1099 Resource', consultant: 'Vendor Consultant' };

export async function Page({ s, title, parent, description, actions, flash, children }: {
  s: Session; title: string; parent?: { label: string; href: string }; description?: ReactNode; actions?: ReactNode;
  flash?: string; children: ReactNode;
}) {
  const { count } = await db().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', s.account.id).is('read_at', null);
  let sub = ROLE_LABEL[s.persona];
  if (s.persona === 'vendor' && s.account.vendor_id) {
    const { data } = await db().from('vendors').select('name').eq('id', s.account.vendor_id).single();
    sub = data?.name || 'Vendor';
  }
  const [flashTitle, flashText] = flash ? decodeURIComponent(flash).split('|') : [];
  return (
    <>
      <header className="topbar">
        <div>
          <div className="breadcrumb">
            {parent ? <BackButton fallback={parent.href} /> : null}
            Home
            {parent ? <><span className="crumb-sep">/</span><Link className="crumb-link" href={parent.href}>{parent.label}</Link></> : null}
            {title !== 'Dashboard' && !title.startsWith('Welcome') ? <><span className="crumb-sep">/</span>{title}</> : null}
          </div>
          <h1>{title}</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button notif-button" aria-label="Notifications" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            {count ? <span className="notif-count">{count}</span> : null}
          </button>
          <ProfileMenu name={s.account.full_name} sub={sub} email={s.account.email} items={profileMenuFor(s.persona)} signOut={signOut} />
        </div>
      </header>
      <section className="screen-container">
        <div className="screen">
          {description !== undefined || actions ? (
            <div className="screen-head">
              <p className="screen-desc">{description}</p>
              <div className="screen-actions">{actions}</div>
            </div>
          ) : null}
          {flashTitle ? <Alert tone="success" title={flashTitle} text={flashText} /> : null}
          {children}
        </div>
      </section>
    </>
  );
}
