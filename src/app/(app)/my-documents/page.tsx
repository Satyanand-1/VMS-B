import { Page } from '@/components/page';
import { DataTable } from '@/components/client';
import { Badge, FileLinks, Muted } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { docsFor } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { OwnUpload } from './OwnUpload';

// Vendor Documents (VN-4, VN-6) and resource My Documents (TM-5, TM-7).
export default async function MyDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const sp = await searchParams;
  const vendor = s.persona === 'vendor';
  const docs = vendor ? await docsFor('vendor', [s.account.vendor_id!]) : await docsFor('person', [s.account.person_id!]);
  const mineKind = vendor ? 'vendor' : 'resource';
  const rows = docs.map((d) => {
    const mine = d.uploader_kind === mineKind;
    const version = d.current ? `v${d.current.version_no}` : '—';
    return vendor
      ? [d.doc_type, version, d.current ? fmtDate(d.current.uploaded_at) : '—', <Badge key="s" text={d.status} />,
        <div key="a" className="row-actions">{d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : null}
          {mine ? <OwnUpload docId={d.id} docType={d.doc_type} hasFile={!!d.current} noDates={d.no_dates} /> : <span className="lock">Uploaded by account manager</span>}</div>]
      : [d.doc_type, d.current ? fmtDate(d.current.uploaded_at) : '—', d.no_dates || d.doc_type === 'Resume' ? '—' : fmtDate(d.valid_to), <Badge key="s" text={d.status} />,
        <div key="a" className="row-actions">{d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : <Muted>Not uploaded</Muted>}
          {mine ? <OwnUpload docId={d.id} docType={d.doc_type} hasFile={!!d.current} noDates={d.no_dates} /> : null}</div>];
  });
  return (
    <Page s={s} title={vendor ? 'Documents' : 'My Documents'} flash={sp.flash}
      description={vendor ? 'Company documents. You upload W-9, COI and ACH; MSA and PO are uploaded by your account manager (view and download only). Replacing a document keeps the earlier version in history.'
        : 'Your onboarding documents. Upload or replace the ones you provide (W-4 or W-9, I-9, ACH); the rest are uploaded by your account manager.'}>
      <DataTable title={vendor ? 'Company documents' : 'Documents'} total={docs.length} noSearch
        headers={vendor ? ['Document', 'Version', 'Last Updated', 'Status', 'Actions'] : ['Document', 'Last Updated', 'Expires', 'Status', 'Actions']} rows={rows} />
    </Page>
  );
}
