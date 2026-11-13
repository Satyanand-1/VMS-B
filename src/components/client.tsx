'use client';
// Interactive pieces: searchable table, URL filters, pop-ups, left menu, profile menu, toasts, expandable rows.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/* ---------------- Table with search (DSH-6) ---------------- */
export function DataTable({ title, chip, headers, rows, searchText, total, noSearch, expand, empty }: {
  title: ReactNode; chip?: ReactNode; headers: string[]; rows: ReactNode[][]; searchText?: string[];
  total?: number; noSearch?: boolean; expand?: { key: string; content: ReactNode }[]; empty?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const visible = rows.map((_, i) => i).filter((i) => !q || (searchText?.[i] || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="table-card">
      <div className="table-header-row">
        <div className="table-heading">
          <div className="card-title">{title}</div>
          {chip ? <span className="action-chip">{chip}</span> : null}
        </div>
        {noSearch ? null : (
          <div className="table-tools">
            <input className="table-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this table" />
            <button className="btn btn-secondary" type="button" onClick={() => setQ('')}>{q ? 'Clear' : 'Filter'}</button>
          </div>
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={headers.length}><span className="person-sub inline">{empty || 'No records match.'}</span></td></tr>
            ) : visible.map((i) => {
              const ex = expand?.[i];
              const isOpen = ex ? !!open[ex.key] : false;
              return [
                <tr key={`r${i}`} className={ex ? 'has-expand' : undefined}>
                  {rows[i].map((c, j) => <td key={j}>{c}</td>)}
                  {ex ? (
                    <td>
                      <button type="button" className={`row-toggle${isOpen ? ' open' : ''}`} aria-expanded={isOpen} aria-label="Show consultants" title="Consultants"
                        onClick={() => setOpen((o) => ({ ...o, [ex.key]: !o[ex.key] }))}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </td>
                  ) : null}
                </tr>,
                ex && isOpen ? <tr key={`e${i}`} className="expand-row"><td colSpan={headers.length}>{ex.content}</td></tr> : null
              ];
            })}
          </tbody>
        </table>
      </div>
      {total !== undefined ? (
        <div className="table-footer"><span>Showing {visible.length === 0 ? 0 : 1}–{visible.length} of {q ? visible.length : total.toLocaleString('en-US')}</span></div>
      ) : null}
    </div>
  );
}

/* ---------------- Filters bound to URL params ---------------- */
export function Filters({ filters }: { filters: { label: string; param: string; options: { value: string; label: string }[]; value: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="filter-bar">
      {filters.map((f) => (
        <div className="field inline-field" key={f.param}>
          <label htmlFor={`f-${f.param}`}>{f.label}</label>
          <select id={`f-${f.param}`} value={f.value} onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            next.set(f.param, e.target.value);
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Pop-up (modal) ---------------- */
// Each pop-up is part of the URL (?m=…), so Back closes it. Closing goes back to the same page without ?m.
export function Modal({ title, description, closeHref, children, wide }: { title: ReactNode; description?: ReactNode; closeHref: string; children: ReactNode; wide?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => router.push(closeHref, { scroll: false }), [router, closeHref]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id="modalTitle">{title}</h2>
            {description ? <p className="modal-desc">{description}</p> : null}
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function ModalClose({ href, label = 'Close', primary }: { href: string; label?: string; primary?: boolean }) {
  return <Link href={href} scroll={false} className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`}>{label}</Link>;
}

/* ---------------- Left menu ---------------- */
export type NavItem = { label: string; href: string; group?: string; match?: string[] };
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (it: NavItem) => [it.href, ...(it.match || [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
  const groups = Array.from(new Set(items.filter((i) => i.group).map((i) => i.group!)));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  return (
    <aside className={`sidebar${menuOpen ? ' menu-open' : ''}`} id="sidebar">
      <div className="brand-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arkhya-lockup-dark.svg" alt="Arkhya Tech" className="brand-logo-image" />
        <button type="button" className="menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>{menuOpen ? '✕ Close' : '☰ Menu'}</button>
      </div>
      <div className="sidebar-menu" id="sidebarMenu">
        <nav className="left-nav">
          {items.filter((i) => !i.group).map((it) => (
            <Link key={it.href} href={it.href} className={isActive(it) ? 'active' : ''}>{it.label}</Link>
          ))}
          {groups.map((g) => {
            const members = items.filter((i) => i.group === g);
            const hasActive = members.some(isActive);
            const open = openGroups[g] ?? hasActive;
            return (
              <div key={g}>
                <button type="button" className={`nav-group-toggle${hasActive ? ' has-active' : ''}`} aria-expanded={open} onClick={() => setOpenGroups((o) => ({ ...o, [g]: !open }))}>
                  <span>{g}</span><span className="nav-caret" aria-hidden="true">▾</span>
                </button>
                <div className="nav-group" hidden={!open}>
                  {members.map((it) => <Link key={it.href} href={it.href} className={isActive(it) ? 'active' : ''}>{it.label}</Link>)}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

/* ---------------- Profile menu (top right) ---------------- */
export function ProfileMenu({ name, sub, email, items, signOut }: { name: string; sub: string; email: string; items: { label: string; href: string }[]; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <div className="user-block" ref={box}>
      <button type="button" className="profile-trigger has-menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="user-pill">{initials}</span>
        <span className="user-meta"><span className="user-name">{name}</span><span className="user-role">{sub}</span></span>
        <span className="profile-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head"><div className="user-name">{name}</div><div className="profile-menu-email">{email}</div></div>
          {items.map((it) => (
            <Link key={it.href} role="menuitem" href={it.href} className={`profile-menu-item${pathname === it.href ? ' active' : ''}`}>{it.label}</Link>
          ))}
          {items.length ? <div className="profile-menu-sep" /> : null}
          <form action={signOut}><button type="submit" role="menuitem" className="profile-menu-item profile-signout">Sign Out</button></form>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Toasts (bottom right) ---------------- */
type Toast = { id: number; tone: 'success' | 'error'; title: string; text?: string };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4500);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">{t.tone === 'error' ? '✕' : '✓'}</span>
            <div className="toast-body"><div className="toast-title">{t.title}</div>{t.text ? <div className="toast-text">{t.text}</div> : null}</div>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Back button in the breadcrumb ---------------- */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return <button type="button" className="back-btn" aria-label="Go back" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}>‹ Back</button>;
}
