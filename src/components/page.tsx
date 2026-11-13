// Page frame: top bar (breadcrumb + Back, title, bell, profile menu) and the screen body.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BackButton, ProfileMenu } from './client';
import { Bell, type Note } from './Bell';
import { fmtDate } from '@/lib/format';
import { Alert } from './ui';
import { profileMenuFor } from '@/lib/nav';
import { signOut } from '@/lib/actions/auth';
import { db } from '@/lib/supabase/admin';
import type { Session } from '@/lib/session';

const ROLE_LABEL = { superadmin: 'Super Admin', accountmanager: 'Account Manager', vendor: '', w2: 'W-2 Resource', w9: '1099 Resource' };

export async function Page({ s, title, parent, description, actions, flash, children }: {
  s: Session; title: string; parent?: { label: string; href: string }; description?: ReactNode; actions?: ReactNode;
  flash?: string; children: ReactNode;
}) {
  const { count } = await db().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', s.account.id).is('read_at', null);
  const recent = ((await db().from('notifications').select('*').eq('user_id', s.account.id).order('created_at', { ascending: false }).limit(8)).data || []) as
    { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }[];
  const notes: Note[] = recent.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, when: fmtDate(n.created_at), unread: !n.read_at }));
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
          <Bell notes={notes} unread={count || 0} />
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
