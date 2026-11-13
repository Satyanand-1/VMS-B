import 'server-only';
import { db, must } from '../supabase/admin';
import { storeFile } from '../files';
import { audit } from '../audit';
import type { Session } from '../session';

type OwnerKind = 'client' | 'vendor' | 'person';
const NO_DATES = ['Resume', 'ACH form', 'Payslips'];

// Adds a new version of a document (creating the document row the first time). Earlier versions stay in history.
export async function addDocumentVersion(s: Session, ownerKind: OwnerKind, ownerId: string, docType: string, file: File, opts: {
  uploader?: 'staff' | 'vendor' | 'resource'; validFrom?: string | null; validTo?: string | null; auditPeriod?: string | null; ownerLabel?: string;
} = {}) {
  const existing = (await db().from('documents').select('id').eq('owner_kind', ownerKind).eq('owner_id', ownerId).eq('doc_type', docType).maybeSingle()).data as { id: string } | null;
  let docId = existing?.id;
  const noDates = NO_DATES.includes(docType);
  if (!docId) {
    const row = must(await db().from('documents').insert({
      owner_kind: ownerKind, owner_id: ownerId, doc_type: docType, uploader_kind: opts.uploader || 'staff', no_dates: noDates,
      valid_from: noDates ? null : opts.validFrom || null, valid_to: noDates ? null : opts.validTo || null, audit_period: opts.auditPeriod || null
    }).select('id').single(), 'document') as { id: string };
    docId = row.id;
  } else {
    await db().from('documents').update({
      ...(noDates ? {} : { valid_from: opts.validFrom || null, valid_to: opts.validTo || null }),
      ...(opts.auditPeriod ? { audit_period: opts.auditPeriod } : {}), not_applicable: false
    }).eq('id', docId);
  }
  const last = (await db().from('document_versions').select('version_no').eq('document_id', docId).order('version_no', { ascending: false }).limit(1)).data?.[0] as { version_no: number } | undefined;
  const stored = await storeFile(`documents/${ownerKind}/${ownerId}`, file);
  must(await db().from('document_versions').insert({
    document_id: docId, version_no: (last?.version_no || 0) + 1, storage_path: stored.path, file_name: stored.name, size_bytes: stored.size,
    mime_type: stored.mime, uploaded_by: s.account.id, uploaded_by_name: s.account.full_name, valid_to: noDates ? null : opts.validTo || null
  }), 'version');
  await audit(s, 'upload', 'document', docId, `uploaded ${docType}${opts.ownerLabel ? ` for ${opts.ownerLabel}` : ''} (v${(last?.version_no || 0) + 1})`);
  return docId;
}

// Reads the standard upload fields from a form: <name> file, <name>__start, <name>__end, <name>__period.
export function uploadField(form: FormData, name: string) {
  const f = form.get(name);
  const file = f instanceof File && f.size > 0 ? f : null;
  return { file, start: String(form.get(`${name}__start`) || '') || null, end: String(form.get(`${name}__end`) || '') || null, period: String(form.get(`${name}__period`) || '') || null };
}

// "Audit period 6 months, start 2026-07-01" → label "Jul 1, 2026 – Dec 31, 2026 (6 months)" and the end date.
export function auditPeriodOf(start: string | null, period: string | null) {
  if (!start || !period) return { label: null, end: null };
  const months = period.startsWith('3') ? 3 : 6;
  const [y, m, d] = start.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d - 1)).toISOString().slice(0, 10);
  const fmt = (iso: string) => { const [yy, mm, dd] = iso.split('-').map(Number); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm - 1]} ${dd}, ${yy}`; };
  return { label: `${fmt(start)} – ${fmt(end)} (${months} months)`, end };
}

// "Other documents" rows: extra_name[], extra_file[], extra_start[], extra_end[].
export function extraDocs(form: FormData) {
  const names = form.getAll('extra_name').map(String);
  const files = form.getAll('extra_file');
  const starts = form.getAll('extra_start').map(String);
  const ends = form.getAll('extra_end').map(String);
  return names.map((n, i) => ({ name: n.trim(), file: files[i] instanceof File && (files[i] as File).size > 0 ? (files[i] as File) : null, start: starts[i] || null, end: ends[i] || null }))
    .filter((r) => r.name || r.file);
}
