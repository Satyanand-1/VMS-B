import { DataTable } from '@/components/client';
import { Badge, FileLinks, Muted } from '@/components/ui';
import type { Session } from '@/lib/session';
import { docsFor } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { OwnUpload } from './OwnUpload';

// The signed-in vendor's company documents (on Company Profile) or the resource's own documents (My Documents).
// Vendor: W-9, COI and ACH are uploaded here; MSA and PO come from the account manager (view and download only).
export async function OwnDocuments({ s }: { s: Session }) {
  const vendor = s.persona === 'vendor';
  const docs = vendor ? await docsFor('vendor', [s.account.vendor_id!]) : await docsFor('person', [s.account.person_id!]);
  const mineKind = vendor ? 'vendor' : 'resource';
  const rows = docs.map((d) => {
    const mine = d.uploader_kind === mineKind;
    const version = d.current ? `v${d.current.version_no}` : '—';
    return vendor
      ? [d.doc_type, version, d.current ? fmtDate(d.current.uploaded_at) : '—', <Badge key="s" text={d.status} />,
        <div key="a" className="row-actions">{d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : null}
          {mine ? <OwnUpload docId={d.id} docType={d.doc_type} hasFile={!!d.current} noDates={d.no_dates} start={d.valid_from} end={d.valid_to} /> : <span className="lock">Uploaded by account manager</span>}</div>]
      : [d.doc_type, d.current ? fmtDate(d.current.uploaded_at) : '—', d.no_dates || d.doc_type === 'Resume' ? '—' : fmtDate(d.valid_to), <Badge key="s" text={d.status} />,
        <div key="a" className="row-actions">{d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : <Muted>Not uploaded</Muted>}
          {mine ? <OwnUpload docId={d.id} docType={d.doc_type} hasFile={!!d.current} noDates={d.no_dates} start={d.valid_from} end={d.valid_to} /> : null}</div>];
  });
  return (
    <DataTable title={vendor ? 'Company documents' : 'Documents'} total={docs.length} noSearch
      headers={vendor ? ['Document', 'Version', 'Last Updated', 'Status', 'Actions'] : ['Document', 'Last Updated', 'Expires', 'Status', 'Actions']} rows={rows} />
  );
}
