import Link from 'next/link';
import { Page } from '@/components/page';
import { DataTable, Filters, Modal } from '@/components/client';
import { Badge, Diff, Muted, PersonCell } from '@/components/ui';
import { requireSession, canSeePerson, type Session } from '@/lib/session';
import { activeSubmission, billingPeriods, clientInvoicesFor, clientsInScope, currentPeriod, getPerson, maps, peopleInScope, reviewNote, reviewStatus, submissionsFor,
  type ClientInvoice, type Person, type Submission } from '@/lib/data';
import { monthLong } from '@/lib/format';
import { ReviewActions, ReviewClientInvoice } from './ReviewActions';

const TABS = ['Vendor Consultants', 'W-2', '1099'];
const TYPES: Person['type'][] = ['consultant', 'w2', 'w1099'];
const STATUSES = ['All statuses', 'Approved', 'Rejected', 'In Progress'];

export default async function InvoiceManagementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const sp = await searchParams;
  const months = billingPeriods();
  const clients = await clientsInScope(s);
  const client = clients.some((c) => c.id === sp.client) ? sp.client : 'all';
  const status = STATUSES.includes(sp.status) ? sp.status : 'All statuses';
  const period = months.includes(sp.period) ? sp.period : currentPeriod();
  const tab = Math.min(Math.max(Number(sp.tab) || 0, 0), 2);
  const m = await maps();
  const [y, mo] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const people = (await peopleInScope(s)).filter((p) => p.client_id && clients.some((c) => c.id === p.client_id)
    && (!p.start_date || p.start_date <= monthEnd) && (!p.end_date || p.end_date >= period));
  const ids = people.map((p) => p.id);
  const [subs, cis] = await Promise.all([submissionsFor(ids, [period]), clientInvoicesFor(ids, [period])]);
  const rec = (p: Person) => {
    const sub = activeSubmission(subs, p.id, period);
    const ci = cis.find((c) => c.person_id === p.id) || null;
    return { p, sub, ci, st: reviewStatus(sub, ci), note: reviewNote(sub, ci, p.type) };
  };
  const all = people.map(rec);
  const list = all.filter((r) => r.p.type === TYPES[tab] && (client === 'all' || r.p.client_id === client) && (status === 'All statuses' || r.st === status));
  const q = (over: Record<string, string | number>) => `/invoice-management?${new URLSearchParams({ client, status, period, tab: String(tab), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) })}`;
  const hours = (h: number | null | undefined, other: number | null | undefined, key: string) => (h == null ? '—' : other != null && Number(h) !== Number(other) ? <Diff key={key}>{Number(h)}</Diff> : String(Number(h)));
  const rows = list.map(({ p, sub, ci, st, note }) => [
    <Link key="p" href={q({ m: 'review', person: p.id })} scroll={false} className="link-btn person-link"><PersonCell name={p.full_name} sub={p.vendor_id ? m.vendor[p.vendor_id]?.name : `${p.type === 'w2' ? 'W-2' : '1099'} resource`} /></Link>,
    m.client[p.client_id!]?.name,
    hours(ci?.hours, sub?.hours, 'ch'),
    hours(sub?.hours, ci?.hours, 'dh'),
    <span key="st"><Badge text={st} />{note ? <span className="person-sub">{note}</span> : null}</span>,
    <Link key="r" href={q({ m: 'review', person: p.id })} scroll={false} className="link-btn">Review</Link>
  ]);
  const closeHref = q({});
  return (
    <Page s={s} title="Invoice Management" flash={sp.flash}
      description="Review each person’s client invoice against the vendor invoice, resource invoice or timesheet, then approve or reject. A record stays In Progress while either document is missing.">
      <Filters filters={[
        { label: 'Client', param: 'client', value: client, options: [{ value: 'all', label: 'All clients' }, ...clients.map((c) => ({ value: c.id, label: c.name }))] },
        { label: 'Status', param: 'status', value: status, options: STATUSES.map((x) => ({ value: x, label: x })) },
        { label: 'Billing period', param: 'period', value: period, options: months.map((x) => ({ value: x, label: monthLong(x) })) }
      ]} />
      <div className="tabs">
        {TABS.map((t, i) => <Link key={t} href={q({ tab: i })} scroll={false} replace className={`tab ${i === tab ? 'active' : ''}`}>{t} ({all.filter((r) => r.p.type === TYPES[i]).length})</Link>)}
      </div>
      <DataTable title={`${TABS[tab]} · ${monthLong(period)}`} chip={`${list.length} ${list.length === 1 ? 'person' : 'people'}`} noSearch
        headers={[tab === 0 ? 'Consultant' : 'Resource', 'Client', 'Client Hours', tab === 0 ? 'Vendor Hours' : 'Resource Hours', 'Status', 'Actions']}
        rows={rows} empty="No one matches these filters." />
      {sp.m === 'review' && sp.person ? await reviewModal(s, sp.person, period, closeHref, m) : null}
    </Page>
  );
}

async function reviewModal(s: Session, personId: string, period: string, closeHref: string, m: Awaited<ReturnType<typeof maps>>) {
  const p = await getPerson(personId);
  if (!p || !canSeePerson(s, p) || !p.client_id) return null;
  const sub = activeSubmission(await submissionsFor([p.id], [period]), p.id, period) as Submission | null;
  const ci = (await clientInvoicesFor([p.id], [period]))[0] as ClientInvoice | undefined;
  const docLabel = p.type === 'consultant' ? 'Vendor invoice' : p.type === 'w2' ? 'Timesheet' : 'Resource invoice';
  const who = p.type === 'consultant' ? 'vendor' : 'resource';
  const st = reviewStatus(sub, ci || null);
  const both = !!(sub && ci);
  const match = both && Number(sub!.hours) === Number(ci!.hours);
  const docFile = sub ? (p.type === 'w2' ? { key: `st-${sub.id}`, name: sub.timesheet_name } : { key: `si-${sub.id}`, name: sub.invoice_name }) : null;
  const paper = (key: string, name: string) => (
    <>
      <div className="review-paper"><span className="doc-badge">{name.split('.').pop()?.toUpperCase()}</span><div className="review-paper-name">{name}</div><div className="review-lines"><i /><i /><i /><i /><i /></div></div>
      <div className="row-actions"><a className="link-btn" href={`/api/files/${key}`} target="_blank" rel="noreferrer">View</a><a className="link-btn" href={`/api/files/${key}?download=1`}>Download</a></div>
    </>
  );
  return (
    <Modal title={`Review · ${p.full_name}`} description={`Compare the client invoice with the ${docLabel.toLowerCase()} and approve or reject.`} closeHref={closeHref} wide>
      <div className="modal-content">
        <div className="review-summary">
          <div><span className="person-sub">{p.type === 'consultant' ? 'Consultant' : `${p.type === 'w2' ? 'W-2' : '1099'} resource`}</span><b>{p.full_name}</b></div>
          {p.vendor_id ? <div><span className="person-sub">Vendor</span><b>{m.vendor[p.vendor_id]?.name}</b></div> : null}
          <div><span className="person-sub">Client</span><b>{m.client[p.client_id]?.name}</b></div>
          <div><span className="person-sub">Billing period</span><b>{monthLong(period)}</b></div>
          <div><span className="person-sub">Status</span><Badge text={st} /></div>
        </div>
        {sub?.status === 'rejected' && sub.reject_reason ? (
          <div className="review-reason"><b>Rejection reason:</b> {sub.reject_reason}<br /><span className="person-sub">Waiting for the {who} to resubmit.</span></div>
        ) : null}
        <div className="review-grid">
          <div className="review-doc">
            <div className="review-doc-title">Client invoice</div>
            {ci ? paper(`ci-${ci.id}`, ci.file_name) : <><div className="review-missing">The client invoice is not uploaded yet. Upload it here.</div><ReviewClientInvoice personId={p.id} period={period} /></>}
          </div>
          <div className="review-doc">
            <div className="review-doc-title">{docLabel}</div>
            {docFile?.name ? paper(docFile.key, docFile.name) : <div className="review-missing">The {who} has not submitted the {docLabel.toLowerCase()} yet.</div>}
            {sub && p.type !== 'w2' && sub.timesheet_name ? <div className="person-sub">Timesheet: <a className="link-btn" href={`/api/files/st-${sub.id}`} target="_blank" rel="noreferrer">{sub.timesheet_name}</a></div> : null}
          </div>
        </div>
        <div className="review-grid">
          <div className="field"><label>Client billable hours</label><input className="readonly" readOnly value={ci ? Number(ci.hours) : ''} placeholder="Not uploaded" /></div>
          <div className="field"><label>{p.type === 'consultant' ? 'Vendor billable hours' : 'Resource billable hours'}</label><input className="readonly" readOnly value={sub ? Number(sub.hours) : ''} placeholder="Not submitted" /></div>
        </div>
        <div className={`review-match ${both ? (match ? 'ok' : 'bad') : ''}`}>
          {both ? (match ? `Hours match: ${Number(ci!.hours)} h on both.` : `Hours do not match: client ${Number(ci!.hours)} h, ${who} ${Number(sub!.hours)} h.`)
            : 'Both documents are needed before this can be reviewed. Status stays In Progress.'}
        </div>
        {both && sub!.status === 'in_progress' ? <ReviewActions submissionId={sub!.id} back={closeHref} /> : null}
        {both && sub!.status !== 'in_progress' ? <Muted>{sub!.status === 'approved' ? 'Approved — no further action.' : `Rejected — the ${who} corrects and resubmits it.`}</Muted> : null}
      </div>
    </Modal>
  );
}
