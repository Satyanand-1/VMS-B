// Presentational building blocks. Each mirrors a prototype helper (same class names → same look).
import Link from 'next/link';
import type { ReactNode } from 'react';

const BADGE_TONES: Record<string, string[]> = {
  approved: ['Active', 'Valid', 'Approved', 'Matched', 'Signed', 'Submitted', 'Uploaded', 'Paid', 'Current'],
  rejected: ['Rejected', 'Expired', 'Inactive', 'Mismatch', 'Missing'],
  warning: ['Expiring Soon', 'Review', 'Due', 'Due Soon', 'Action Needed', 'Draft', 'Not Uploaded'],
  progress: ['In Progress', 'Pending', 'Incomplete', 'Awaiting Client Invoice', 'Onboarding', 'Not Started', 'Invited'],
  neutral: ['Not Applicable', 'Closed', 'Ended', 'Superseded', 'Not Submitted']
};
export function Badge({ text }: { text: string }) {
  if (text === '—') return <>—</>;
  const tone = Object.keys(BADGE_TONES).find((k) => BADGE_TONES[k].includes(text)) || 'neutral';
  return <span className={`status-badge status-${tone}`}>{text}</span>;
}

export function PersonCell({ name, sub }: { name: string; sub?: ReactNode }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="person-cell">
      <span className="avatar">{initials}</span>
      <span><span className="person-name">{name}</span>{sub ? <span className="person-sub">{sub}</span> : null}</span>
    </div>
  );
}
export function Sub({ main, secondary }: { main: ReactNode; secondary?: ReactNode }) {
  return <><span className="person-name">{main}</span>{secondary ? <span className="person-sub">{secondary}</span> : null}</>;
}
export const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;
export const Muted = ({ children }: { children: ReactNode }) => <span className="person-sub inline">{children}</span>;
export const Diff = ({ children }: { children: ReactNode }) => <span className="diff-bad">{children}</span>;

export function FileChip({ name, size }: { name: string; size?: string }) {
  return (
    <span className="file-chip">
      <span className="file-ext">{name.split('.').pop()?.toUpperCase()}</span>{name}
      {size ? <span className="person-sub inline">{size}</span> : null}
    </span>
  );
}

const EYE = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const PENCIL = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
export const DOWNLOAD_ICON = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;

// View (eye) and Edit (pencil) are icons everywhere, with the word as tooltip (PRD §7).
export function ViewLink({ href, label = 'View' }: { href: string; label?: string }) {
  return <Link href={href} scroll={false} className="link-btn icon-btn" aria-label={label} title={label}>{EYE}</Link>;
}
export function EditLink({ href, label = 'Edit' }: { href: string; label?: string }) {
  return <Link href={href} scroll={false} className="link-btn icon-btn" aria-label={label} title={label}>{PENCIL}</Link>;
}
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} scroll={false} className="link-btn">{children}</Link>;
}
// File View / Download (signed URL through /api/files)
export function FileLinks({ fileKey, name, download = true }: { fileKey: string; name: string; download?: boolean }) {
  return (
    <div className="row-actions">
      <a className="link-btn icon-btn" href={`/api/files/${fileKey}`} target="_blank" rel="noreferrer" aria-label="View" title={`View ${name}`}>{EYE}</a>
      {download ? <a className="link-btn icon-btn" href={`/api/files/${fileKey}?download=1`} aria-label="Download" title="Download">{DOWNLOAD_ICON}</a> : null}
    </div>
  );
}
export const RowActions = ({ children }: { children: ReactNode }) => <div className="row-actions">{children}</div>;

export function Alert({ tone, title, text, action }: { tone: 'success' | 'warning' | 'danger' | 'info'; title: ReactNode; text?: ReactNode; action?: { label: string; href: string } }) {
  return (
    <div className={`alert alert-${tone}`}>
      <div>
        <div className="alert-title">{title}</div>
        {text ? <div className="alert-text">{text}</div> : null}
      </div>
      {action ? <Link className="btn btn-alert" href={action.href}>{action.label}</Link> : null}
    </div>
  );
}

export type Kpi = { label: string; value: string | number; trend: string; tone?: 'up' | 'down' | 'warn' | 'neutral'; href?: string };
export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="kpi-row" style={{ ['--kpi-cols' as string]: Math.min(kpis.length, 4) }}>
      {kpis.map((k) => (
        <Link key={k.label} href={k.href || '/dashboard'} className="kpi-card">
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value">{k.value}</div>
          <div className={`kpi-trend trend-${k.tone || 'neutral'}`}>{k.trend}</div>
        </Link>
      ))}
    </div>
  );
}

export type Bar = { label: string; value: number | string; pct: number; tone: string; href?: string };
export type PanelItem = { label: ReactNode; value: ReactNode; meta?: ReactNode };
export function Panel({ title, chip, bars, items }: { title: string; chip?: string; bars?: Bar[]; items?: PanelItem[] }) {
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">{title}</div>
        {chip ? <div className="action-chip">{chip}</div> : null}
      </div>
      {bars ? (
        <div className="bar-list">
          {bars.map((bar) => {
            const inner = (
              <>
                <div className="bar-meta"><span>{bar.label}</span><span className="mini-stat">{bar.value}<span className="bar-go" aria-hidden="true">›</span></span></div>
                <div className="bar-track"><div className={`bar-fill fill-${bar.tone}`} style={{ width: `${bar.pct}%` }} /></div>
              </>
            );
            return bar.href
              ? <Link key={bar.label} href={bar.href} className="bar-row bar-link" title={`View ${bar.label.toLowerCase()} invoices`}>{inner}</Link>
              : <div key={bar.label} className="bar-row">{inner}</div>;
          })}
        </div>
      ) : (
        <ul className="list-plain">
          {(items || []).map((it, i) => (
            <li key={i}>
              <span className="li-label">{it.label}</span>
              <span className="li-right">{it.meta ? <span className="li-meta">{it.meta}</span> : null}{it.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function Panels({ children, single }: { children: ReactNode; single?: boolean }) {
  return <div className={`content-grid${single ? ' single' : ''}`}>{children}</div>;
}

export function Activity({ items, viewAllHref }: { items: { who: string; what: string; when: string }[]; viewAllHref?: string }) {
  return (
    <div className="widget activity">
      <div className="widget-header">
        <div className="widget-title">Recent activity</div>
        {viewAllHref ? <Link className="link-btn" href={viewAllHref}>View all</Link> : null}
      </div>
      <ul className="activity-list">
        {items.map((a, i) => (
          <li key={i}>
            <span className={`avatar ${a.who === 'System' ? 'avatar-system' : ''}`}>{a.who === 'System' ? '⚙' : a.who.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
            <span className="activity-text"><b>{a.who}</b> {a.what}</span>
            <span className="li-meta">{a.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tabs are links (?tab=N) so Back and refresh keep the selected tab.
export function Tabs({ tabs, active, href }: { tabs: string[]; active: number; href: (i: number) => string }) {
  return (
    <div className="tabs">
      {tabs.map((t, i) => <Link key={t} href={href(i)} scroll={false} replace className={`tab ${i === active ? 'active' : ''}`}>{t}</Link>)}
    </div>
  );
}

export type DetailSection = { title: string; items: { label: string; value: ReactNode; full?: boolean }[] };
export function DetailCard({ sections, documents }: {
  sections: DetailSection[];
  documents?: { title: string; hint?: string; headers: string[]; rows: ReactNode[][] };
}) {
  return (
    <div className="form-card">
      {sections.map((s) => (
        <div className="form-section" key={s.title}>
          <div className="section-head"><div className="section-title">{s.title}</div></div>
          <div className="detail-grid">
            {s.items.map((it) => (
              <div key={it.label} className={`detail-item ${it.full ? 'full' : ''}`}>
                <div className="detail-label">{it.label}</div>
                <div className="detail-value">{it.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {documents ? (
        <div className="form-section detail-docs">
          <div className="section-head">
            <div className="section-title">{documents.title}</div>
            {documents.hint ? <div className="section-hint">{documents.hint}</div> : null}
          </div>
          <div className="table-card detail-docs-table">
            <div className="table-scroll">
              <table>
                <thead><tr>{documents.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{documents.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
