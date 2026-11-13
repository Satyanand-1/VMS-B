import Link from 'next/link';
import { Page } from '@/components/page';
import { DataTable, Modal, ModalClose } from '@/components/client';
import { Badge, DetailCard, EditLink, FileChip, FileLinks, Muted, PersonCell, Sub, TextLink, ViewLink } from '@/components/ui';
import { VendorForm } from '@/components/VendorForm';
import { personModal } from '@/components/person-modals';
import { signInInfo } from '@/components/people';
import { requireSession, canSeeVendor, type Session } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import { currentPeriod, docsFor, dueDate, label, maps, paymentTerms, peopleInScope, submissionsFor, vendorsInScope, type Vendor } from '@/lib/data';
import { fmtDate, monthLong } from '@/lib/format';

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const sp = await searchParams;
  const sa = s.persona === 'superadmin';
  const [vendors, m, consultants] = await Promise.all([vendorsInScope(s), maps(), peopleInScope(s, 'consultant')]);
  const subs = await submissionsFor(consultants.map((c) => c.id));
  const period = currentPeriod();

  // Consultants panel under each vendor row (VN-2 / VN-9)
  const panel = (v: Vendor) => {
    const list = consultants.filter((c) => c.vendor_id === v.id);
    if (!list.length) return <div className="vendor-expand-empty">No consultants yet. Use Add Consultant to add the first one.</div>;
    return (
      <div className="vendor-expand">
        <div className="vendor-expand-title">Consultants of {v.name} <span className="action-chip">{list.length}</span></div>
        <table className="sub-table">
          <thead><tr><th>Consultant</th><th>Client</th><th>Status</th><th>Latest invoice</th><th>Actions</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const latest = subs.filter((x) => x.person_id === c.id && x.status !== 'superseded')[0];
              const invoice = latest
                ? <><div className="vx-inv"><span className="mono">{latest.ref}</span> <Badge text={label(latest.status)} /></div><span className="person-sub">{monthLong(latest.period)}</span></>
                : c.client_id && c.status === 'active' ? <><Badge text="Not Submitted" /><span className="person-sub">{monthLong(period)} · due {dueDate(period)}</span></>
                : <Muted>No invoice yet</Muted>;
              return (
                <tr key={c.id}>
                  <td><PersonCell name={c.full_name} sub={c.role_title || undefined} /></td>
                  <td>{c.client_id ? m.client[c.client_id]?.name : <Muted>Not mapped</Muted>}</td>
                  <td><Badge text={label(c.status)} /></td>
                  <td>{invoice}</td>
                  <td><div className="row-actions">
                    <ViewLink href={`/vendors?m=view-person&id=${c.id}`} />
                    <EditLink href={`/vendors?m=edit-person&id=${c.id}`} />
                    {c.client_id ? <TextLink href={`/vendors?m=invoices&id=${c.id}`}>View Invoice</TextLink> : null}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const rows = vendors.map((v) => [
    <Sub key="v" main={v.name} secondary={v.city || ''} />,
    sa ? (m.am[v.account_manager_id]?.full_name || '—') : <Sub key="c" main={v.contact_name || '—'} secondary={v.email} />,
    v.phone || '—',
    <Badge key="s" text={label(v.status)} />,
    <div key="a" className="row-actions">
      <ViewLink href={`/vendors?m=view-vendor&id=${v.id}`} />
      <EditLink href={`/vendors?m=edit-vendor&id=${v.id}`} />
      <TextLink href={`/vendors?m=add-consultant&vendor=${v.id}`}>Add Consultant</TextLink>
    </div>
  ]);

  const modal = (await vendorModal(sp, s, m)) ?? (await personModal(sp, s, '/vendors'));
  return (
    <Page s={s} title={sa ? 'Vendor Management' : 'My Vendors'} flash={sp.flash}
      description={sa ? 'All vendors and their account manager. Click the arrow at the end of a row to see the vendor’s consultants and their invoices.'
        : 'Vendors assigned to you. Click the arrow at the end of a row to see the vendor’s consultants and their invoices.'}
      actions={<Link className="btn btn-primary" href="/vendors?m=add-vendor" scroll={false}>Add Vendor</Link>}>
      <DataTable title={sa ? 'All vendors' : 'Assigned vendors'} total={vendors.length}
        headers={['Vendor', sa ? 'Account Manager' : 'Primary Contact', 'Phone', 'Status', 'Actions', '']}
        rows={rows} searchText={vendors.map((v) => `${v.name} ${v.city} ${v.contact_name} ${v.email} ${m.am[v.account_manager_id]?.full_name}`)}
        expand={vendors.map((v) => ({ key: v.id, content: panel(v) }))} />
      {modal}
    </Page>
  );
}

async function vendorModal(sp: Record<string, string>, s: Session, m: Awaited<ReturnType<typeof maps>>) {
  const close = '/vendors';
  const amOptions = Object.values(m.am).filter((a) => a.status !== 'inactive').map((a) => ({ value: a.id, label: a.full_name }));
  if (sp.m === 'add-vendor') {
    return (
      <Modal title="Add Vendor" description="Create the vendor record. On save the vendor is emailed a username and temporary password. Only account managers and the Super Admin create vendors." closeHref={close}>
        <VendorForm mode="add" data={{ payment_term: 'Net 10', account_manager_id: amOptions[0]?.value }} terms={await paymentTerms()} amOptions={amOptions}
          canPickAm={s.persona === 'superadmin'} amName={`${s.account.full_name} (you)`} cancelHref={close} />
      </Modal>
    );
  }
  if ((sp.m === 'view-vendor' || sp.m === 'edit-vendor') && sp.id && canSeeVendor(s, sp.id)) {
    const v = must(await db().from('vendors').select('*').eq('id', sp.id).single(), 'vendor') as Vendor;
    const docs = await docsFor('vendor', [v.id]);
    const msa = docs.find((d) => d.doc_type === 'MSA');
    const po = docs.find((d) => d.doc_type === 'PO');
    if (sp.m === 'view-vendor') {
      // Documents the vendor uploads appear only once uploaded (VN-4).
      const shown = docs.filter((d) => d.uploader_kind === 'staff' || d.current);
      return (
        <Modal title={v.name} description="Read-only view. Use Edit to change it." closeHref={close}>
          <div className="modal-content">
            <DetailCard sections={[{ title: 'Company', items: [
              { label: 'Name', value: v.name }, { label: 'Address', value: v.address || '—', full: true }, { label: 'Email (username)', value: v.email },
              { label: 'Federal ID (EIN)', value: v.ein_last4 ? `••-•••${v.ein_last4}` : '—' }, { label: 'Phone', value: v.phone || '—' },
              { label: 'State of incorporation', value: v.state_of_incorporation || '—' }, { label: 'Authorized signatory', value: v.signatory_name || '—' },
              { label: 'Account manager', value: m.am[v.account_manager_id]?.full_name || '—' }, { label: 'Payment term', value: v.payment_term },
              { label: 'Status', value: <Badge text={label(v.status)} /> }] }]}
              documents={{ title: 'Documents', headers: ['Document', 'File', 'Valid until', 'Status', 'Actions'], rows: shown.map((d) => [
                d.uploader_kind === 'vendor' ? <Sub main={d.doc_type} secondary="Uploaded by the vendor" /> : d.doc_type,
                d.current ? <FileChip name={d.current.file_name} /> : <Muted>Not uploaded</Muted>,
                d.no_dates ? '—' : fmtDate(d.valid_to), <Badge key="b" text={d.status} />,
                d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : '—'
              ]) }} />
          </div>
          <div className="form-footer modal-footer"><span /><div className="form-buttons"><ModalClose href={close} primary /></div></div>
        </Modal>
      );
    }
    return (
      <Modal title="Edit Vendor" description="Update vendor profile details and the vendor’s account manager." closeHref={close}>
        <VendorForm mode="edit" terms={await paymentTerms()} amOptions={amOptions} canPickAm={s.persona === 'superadmin'} amName={m.am[v.account_manager_id]?.full_name || '—'}
          cancelHref={close} signIn={await signInInfo({ vendorId: v.id })}
          data={{ ...v, einMasked: v.ein_last4 ? `••-•••${v.ein_last4}` : '',
            msa: { start: msa?.valid_from || null, end: msa?.valid_to || null, file: msa?.current ? { name: msa.current.file_name, size: msa.size } : null },
            po: { start: po?.valid_from || null, end: po?.valid_to || null, file: po?.current ? { name: po.current.file_name, size: po.size } : null } }} />
      </Modal>
    );
  }
  return null;
}
