// Person profile (View), invoice & timesheet history, and the Sign-in status box (server components).
import { Badge, DetailCard, FileChip, FileLinks, Muted, Sub } from './ui';
import { RequestButton } from './actions-client';
import { db } from '@/lib/supabase/admin';
import { docsFor, submissionsFor, TYPE_LABEL, label, maps, dueDate, currentPeriod, type Person, type Doc } from '@/lib/data';
import { fmtDate, monthLong, monthShort, usd } from '@/lib/format';
import { passwordInfo, type Account, type Session } from '@/lib/session';
import { maskSsn } from '@/lib/crypto';

export const isSelfDoc = (p: Pick<Person, 'type'>, d: Pick<Doc, 'uploader_kind'>) => p.type !== 'consultant' && d.uploader_kind === 'resource';

// Staff don't see documents the resource uploads until they exist (VN-4 / TM-5).
export function visibleDocs(s: Session, p: Person, docs: Doc[]) {
  return docs.filter((d) => !(isSelfDoc(p, d) && !d.current && s.persona !== 'w2' && s.persona !== 'w9'));
}

export async function PersonView({ s, person }: { s: Session; person: Person }) {
  const m = await maps();
  const docs = visibleDocs(s, person, await docsFor('person', [person.id]));
  const vendor = person.vendor_id ? m.vendor[person.vendor_id] : null;
  const missing = docs.filter((d) => !d.current && !d.not_applicable).length;
  const vendorView = s.persona === 'vendor';
  const personal = [
    { label: 'Full name', value: person.full_name },
    { label: 'Resource type', value: TYPE_LABEL[person.type] },
    { label: 'Email', value: person.email },
    { label: 'Phone', value: person.phone || '—' },
    ...(person.type === 'consultant'
      ? [{ label: 'Vendor', value: vendor?.name || '—' }, { label: 'Vendor contact', value: vendor ? `${vendor.contact_name} · ${vendor.email}` : '—' }]
      : [{ label: 'SSN', value: maskSsn(person.ssn_last4) }, { label: 'Address', value: person.address || '—', full: true }])
  ];
  const assignment = [
    { label: 'Client', value: person.client_id ? m.client[person.client_id]?.name : 'Not mapped — the account manager maps the client' },
    { label: 'Role', value: person.role_title || '—' },
    { label: 'Hourly rate', value: usd(person.hourly_rate) },
    { label: 'Work location', value: person.work_location || '—' },
    { label: 'Start date', value: fmtDate(person.start_date) },
    { label: 'End date', value: fmtDate(person.end_date) },
    { label: 'Payment term', value: person.type === 'consultant' ? vendor?.payment_term || 'Net 10' : person.payment_term || 'Net 10' },
    { label: 'Account manager', value: person.account_manager_id ? m.am[person.account_manager_id]?.full_name || '—' : '—' },
    { label: 'Status', value: <Badge text={label(person.status)} /> }
  ];
  return (
    <DetailCard sections={[{ title: 'Personal details', items: personal }, { title: 'Assignment', items: assignment }]}
      documents={{
        title: 'Documents',
        hint: missing ? `${missing} document${missing > 1 ? 's' : ''} missing — shown as Incomplete in the Document Tracker.` : 'All onboarding documents on file.',
        headers: ['Document', 'File', 'Last Updated', 'Expires', 'Status', 'Actions'],
        rows: docs.map((d) => [
          d.audit_period ? <Sub main={d.doc_type} secondary={`Latest · covers ${d.audit_period}${d.versions.length > 1 ? ` · ${d.versions.length - 1} earlier in history` : ''}`} />
            : isSelfDoc(person, d) ? <Sub main={d.doc_type} secondary="Uploaded by the resource" /> : d.doc_type,
          d.current ? <FileChip name={d.current.file_name} /> : <Muted>Not uploaded</Muted>,
          d.current ? fmtDate(d.current.uploaded_at) : '—',
          d.no_dates || d.doc_type === 'Resume' ? '—' : fmtDate(d.valid_to),
          <Badge key="b" text={d.status} />,
          d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} />
            : vendorView ? <Muted>Uploaded by account manager</Muted>
            : d.not_applicable ? '—' : <RequestButton docId={d.id} kind="request" />
        ])
      }} />
  );
}

// VN-9 / INV-12: a person's invoices and timesheets for every month, latest first (Super Admin / Account Manager).
export async function InvoiceHistory({ person }: { person: Person }) {
  const subs = (await submissionsFor([person.id])).filter((x) => x.status !== 'superseded');
  const w2 = person.type === 'w2';
  const period = currentPeriod();
  const rows = [...subs];
  const hasCurrent = rows.some((x) => x.period === period);
  const fileCell = (key: string | null, name: string | null) => (name && key
    ? <div className="doc-cell"><FileChip name={name} /><FileLinks fileKey={key} name={name} /></div>
    : <Muted>Not uploaded</Muted>);
  const body = [
    ...(!hasCurrent && person.client_id ? [[
      <><span className="person-name nowrap">{monthShort(period)}</span><span className="person-sub nowrap">Not submitted</span></>, '—',
      ...(w2 ? [] : [<Muted key="i">Not uploaded</Muted>]), <Muted key="t">Not uploaded</Muted>, <><Badge text="Not Submitted" /><span className="person-sub">Due {dueDate(period)}</span></>
    ]] : []),
    ...rows.map((x) => [
      <><span className="person-name nowrap">{monthShort(x.period)}</span><span className="person-sub nowrap">{x.ref}</span></>,
      String(Number(x.hours)),
      ...(w2 ? [] : [fileCell(x.invoice_path ? `si-${x.id}` : null, x.invoice_name)]),
      fileCell(x.timesheet_path ? `st-${x.id}` : null, x.timesheet_name),
      <Badge key="s" text={label(x.status)} />
    ])
  ];
  return (
    <div className="table-card">
      <div className="table-header-row"><div className="table-heading"><div className="card-title">{body.length} month{body.length === 1 ? '' : 's'}</div></div></div>
      <div className="table-scroll">
        <table>
          <thead><tr>{['Month', 'Hours', ...(w2 ? [] : ['Invoice']), 'Timesheet', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{body.length ? body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={5}><Muted>No invoices yet.</Muted></td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

// Sign-in status for Edit Vendor / Edit person (AUTH-4).
export async function signInInfo(where: { vendorId?: string; personId?: string }) {
  let q = db().from('user_accounts').select('*');
  q = where.vendorId ? q.eq('vendor_id', where.vendorId) : q.eq('person_id', where.personId!);
  const acc = (await q.limit(1)).data?.[0] as Account | undefined;
  if (!acc) return null;
  const p = passwordInfo(acc);
  const state = acc.must_change_password ? { badge: 'Pending', text: 'Temporary password sent; not changed yet' }
    : p.expired ? { badge: 'Expired', text: `Expired on ${p.expires}. ${acc.full_name} cannot sign in until you send a new password.` }
    : { badge: 'Active', text: `Last changed ${p.set} · expires ${p.expires} (${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left)` };
  return { accountId: acc.id, email: acc.email, name: acc.full_name, ...state };
}

export function monthTitle(period: string) { return monthLong(period); }
