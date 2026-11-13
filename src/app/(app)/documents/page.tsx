import Link from 'next/link';
import { Page } from '@/components/page';
import { DataTable, Modal, ModalClose } from '@/components/client';
import { Badge, FileChip, FileLinks, Muted, Sub, Tabs, ViewLink } from '@/components/ui';
import { RequestButton } from '@/components/actions-client';
import { NotApplicableButton } from './NotApplicable';
import { requireSession } from '@/lib/session';
import { clientsInScope, docsFor, maps, peopleInScope, vendorsInScope, type Doc } from '@/lib/data';
import { fmtDate } from '@/lib/format';

const TABS = ['All', 'Expiring Soon', 'Expired', 'Incomplete'];

// DOC-1 … DOC-6: every document for clients, vendors, consultants and resources in scope.
export default async function DocumentTrackerPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const sp = await searchParams;
  const [clients, vendors, people, m] = await Promise.all([clientsInScope(s), vendorsInScope(s), peopleInScope(s), maps()]);
  const [cd, vd, pd] = await Promise.all([docsFor('client', clients.map((c) => c.id)), docsFor('vendor', vendors.map((v) => v.id)), docsFor('person', people.map((p) => p.id))]);
  const pBy = Object.fromEntries(people.map((p) => [p.id, p]));
  const owner = (d: Doc) => d.owner_kind === 'client' ? { name: m.client[d.owner_id]?.name, type: 'Client' }
    : d.owner_kind === 'vendor' ? { name: m.vendor[d.owner_id]?.name, type: 'Vendor' }
    : { name: pBy[d.owner_id]?.full_name, type: pBy[d.owner_id]?.type === 'consultant' ? 'Consultant' : pBy[d.owner_id]?.type === 'w2' ? 'W-2 Resource' : '1099 Resource' };
  const all = [...cd, ...vd, ...pd].filter((d) => d.doc_type !== 'Resume' || d.current);
  const tab = Math.min(Math.max(Number(sp.tab) || 0, 0), 3);
  const list = all.filter((d) => tab === 0 || d.status === TABS[tab]).sort((a, b) => (a.valid_to || '9999').localeCompare(b.valid_to || '9999'));
  const rows = list.map((d) => {
    const o = owner(d);
    const past = d.versions.length - 1;
    return [
      d.audit_period ? <Sub key="d" main={d.doc_type} secondary={`covers ${d.audit_period}`} /> : d.doc_type,
      o.name, o.type,
      d.current ? <span key="v">v{d.current.version_no}{past > 0 ? <> · <Link className="link-btn" href={`/documents?tab=${tab}&m=doc&id=${d.id}`} scroll={false}>{past} past</Link></> : null}</span> : '—',
      d.no_dates || d.doc_type === 'Resume' ? '—' : fmtDate(d.valid_to),
      <Badge key="s" text={d.status} />,
      <div key="a" className="row-actions">
        <ViewLink href={`/documents?tab=${tab}&m=doc&id=${d.id}`} />
        {d.status === 'Expiring Soon' || d.status === 'Expired' ? <RequestButton docId={d.id} kind="remind" /> : null}
        {d.status === 'Incomplete' ? <RequestButton docId={d.id} kind="request" /> : null}
      </div>
    ];
  });
  const counts = TABS.map((t, i) => `${t} (${i === 0 ? all.length : all.filter((d) => d.status === t).length})`);
  const sel = sp.m === 'doc' ? all.find((d) => d.id === sp.id) : null;
  const close = `/documents?tab=${tab}`;
  return (
    <Page s={s} title="Document Tracker" flash={sp.flash}
      description="Every client, vendor, consultant and resource document. Owners and account managers are alerted 30 days before expiry.">
      <Tabs tabs={counts} active={tab} href={(i) => `/documents?tab=${i}`} />
      <DataTable title="Documents" total={list.length} headers={['Document', 'Owner', 'Owner Type', 'Version', 'Expires', 'Status', 'Actions']} rows={rows}
        searchText={list.map((d) => `${d.doc_type} ${owner(d).name} ${owner(d).type}`)} empty="No documents in this view." />
      {sel ? (
        <Modal title={`${sel.doc_type} · ${owner(sel).name}`} description="Current version and full version history. Past versions are read-only." closeHref={close}>
          <div className="modal-content">
            <div className="review-summary">
              <div><span className="person-sub">Owner</span><b>{owner(sel).name}</b><span className="person-sub">{owner(sel).type}</span></div>
              <div><span className="person-sub">Current version</span><b>{sel.current ? `v${sel.current.version_no}` : '—'}</b>{sel.current ? <span className="person-sub">{sel.current.file_name}</span> : null}</div>
              <div><span className="person-sub">Versions</span><b>{sel.versions.length}</b></div>
              <div><span className="person-sub">Valid until</span><b>{sel.no_dates ? '—' : fmtDate(sel.valid_to)}</b></div>
              <div><span className="person-sub">Status</span><Badge text={sel.status} /></div>
            </div>
            <div className="table-card">
              <div className="table-header-row"><div className="table-heading"><div className="card-title">Version history</div></div>
                {s.persona === 'superadmin' && !sel.current ? <NotApplicableButton docId={sel.id} value={!sel.not_applicable} /> : null}</div>
              <div className="table-scroll"><table>
                <thead><tr>{['Version', 'File', 'Uploaded', 'Uploaded by', 'Valid until', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {sel.versions.length ? [...sel.versions].reverse().map((v, i) => (
                    <tr key={v.id}>
                      <td><span className="version-tag">v{v.version_no}</span></td><td><FileChip name={v.file_name} /></td><td>{fmtDate(v.uploaded_at)}</td>
                      <td>{v.uploaded_by_name || '—'}</td><td>{fmtDate(v.valid_to)}</td><td><Badge text={i === 0 ? 'Current' : 'Superseded'} /></td>
                      <td><FileLinks fileKey={`d-${v.id}`} name={v.file_name} /></td>
                    </tr>
                  )) : <tr><td colSpan={7}><Muted>No versions uploaded.</Muted></td></tr>}
                </tbody>
              </table></div>
            </div>
          </div>
          <div className="form-footer modal-footer"><span /><div className="form-buttons"><ModalClose href={close} primary /></div></div>
        </Modal>
      ) : null}
    </Page>
  );
}
