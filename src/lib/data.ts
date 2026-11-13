import 'server-only';
import { db, must } from './supabase/admin';
import { daysBetween, fmtDate, todayISO } from './format';
import { canSeePerson, type Session } from './session';
import { fmtSize } from './files';

export type Client = { id: string; name: string; code: string; address: string | null; email: string | null; currency: string; time_zone: string; region: string | null; status: string };
export type Vendor = { id: string; name: string; city: string | null; address: string | null; email: string; phone: string | null; state_of_incorporation: string | null;
  signatory_name: string | null; signatory_phone: string | null; contact_name: string | null; payment_term: string; account_manager_id: string; status: string; ein_last4: string | null };
export type Person = { id: string; type: 'consultant' | 'w2' | 'w1099'; full_name: string; email: string; phone: string | null; address: string | null; ssn_last4: string | null;
  vendor_id: string | null; status: string; role_title: string | null; client_id: string | null; hourly_rate: number | null; start_date: string | null; end_date: string | null;
  duration: string | null; work_location: string | null; payment_term: string | null; account_manager_id: string | null };
export type Submission = { id: string; ref: string; person_id: string; client_id: string; period: string; version_no: number; hours: number; hourly_rate: number; amount: number | null;
  invoice_path: string | null; invoice_name: string | null; timesheet_path: string | null; timesheet_name: string | null; status: string; reject_reason: string | null;
  submitted_at: string; reviewed_by: string | null; reviewed_at: string | null };
export type ClientInvoice = { id: string; client_id: string; person_id: string; period: string; hours: number; file_path: string; file_name: string; uploaded_at: string };

export const TYPE_LABEL = { consultant: 'Vendor Consultant', w2: 'W-2 Employee', w1099: '1099 Contractor' } as const;
export const STATUS_LABEL: Record<string, string> = { active: 'Active', onboarding: 'Onboarding', invited: 'Invited', inactive: 'Inactive', ended: 'Ended',
  in_progress: 'In Progress', approved: 'Approved', rejected: 'Rejected', superseded: 'Superseded' };
export const label = (s: string) => STATUS_LABEL[s] || s;

/* ---------------- scoped lists ---------------- */
export async function clientsInScope(s: Session): Promise<Client[]> {
  let q = db().from('clients').select('*').order('name');
  if (!s.scope.all) q = q.in('id', s.scope.clientIds.length ? s.scope.clientIds : ['00000000-0000-0000-0000-000000000000']);
  return must(await q, 'clients') as Client[];
}
export async function vendorsInScope(s: Session): Promise<Vendor[]> {
  let q = db().from('vendors').select('*').order('name');
  if (!s.scope.all) q = q.in('id', s.scope.vendorIds.length ? s.scope.vendorIds : ['00000000-0000-0000-0000-000000000000']);
  return must(await q, 'vendors') as Vendor[];
}
export async function peopleInScope(s: Session, type?: Person['type']): Promise<Person[]> {
  let q = db().from('people').select('*').order('full_name');
  if (type) q = q.eq('type', type);
  const all = must(await q, 'people') as Person[];
  return all.filter((p) => canSeePerson(s, p));
}
export async function getPerson(id: string) {
  return must(await db().from('people').select('*').eq('id', id).maybeSingle(), 'person') as Person | null;
}
export async function maps() {
  const [clients, vendors, ams] = await Promise.all([
    db().from('clients').select('id,name,code,time_zone'),
    db().from('vendors').select('id,name,contact_name,email,payment_term,account_manager_id'),
    db().from('user_accounts').select('id,full_name,email,role,status').eq('role', 'account_manager')
  ]);
  return {
    client: Object.fromEntries((clients.data || []).map((c) => [c.id, c])) as Record<string, { id: string; name: string; code: string; time_zone: string }>,
    vendor: Object.fromEntries((vendors.data || []).map((v) => [v.id, v])) as Record<string, { id: string; name: string; contact_name: string; email: string; payment_term: string; account_manager_id: string }>,
    am: Object.fromEntries((ams.data || []).map((a) => [a.id, a])) as Record<string, { id: string; full_name: string; email: string; status: string }>
  };
}

/* ---------------- documents ---------------- */
export type DocVersion = { id: string; version_no: number; storage_path: string; file_name: string; size_bytes: number | null; uploaded_by_name: string | null; uploaded_at: string; valid_to: string | null };
export type Doc = { id: string; owner_kind: 'client' | 'vendor' | 'person'; owner_id: string; doc_type: string; uploader_kind: 'staff' | 'vendor' | 'resource';
  no_dates: boolean; valid_from: string | null; valid_to: string | null; audit_period: string | null; not_applicable: boolean;
  versions: DocVersion[]; current: DocVersion | null; status: string; size: string };

// DOC-2: Incomplete (nothing uploaded), Not Applicable, Expired, Expiring Soon (≤ 30 days), Valid. A resume has no status (—).
export function docStatus(d: Pick<Doc, 'not_applicable' | 'doc_type' | 'valid_to'> & { current: DocVersion | null }): string {
  if (d.not_applicable) return 'Not Applicable';
  if (!d.current) return 'Incomplete';
  if (d.doc_type === 'Resume') return '—';
  if (d.valid_to) {
    const left = daysBetween(todayISO(), d.valid_to);
    if (left < 0) return 'Expired';
    if (left <= 30) return 'Expiring Soon';
  }
  return 'Valid';
}

export async function docsFor(ownerKind: Doc['owner_kind'], ownerIds: string[]): Promise<Doc[]> {
  if (!ownerIds.length) return [];
  const rows = must(await db().from('documents').select('*, document_versions(*)').eq('owner_kind', ownerKind).in('owner_id', ownerIds).order('created_at'), 'documents') as
    (Omit<Doc, 'versions' | 'current' | 'status' | 'size'> & { document_versions: DocVersion[] })[];
  return rows.map(({ document_versions, ...d }) => {
    const versions = [...document_versions].sort((a, b) => a.version_no - b.version_no);
    const current = versions[versions.length - 1] || null;
    const doc = { ...d, versions, current } as Doc;
    doc.status = docStatus(doc);
    doc.size = fmtSize(current?.size_bytes);
    return doc;
  });
}

/* ---------------- submissions / review status ---------------- */
export async function submissionsFor(personIds: string[], periods?: string[]): Promise<Submission[]> {
  if (!personIds.length) return [];
  let q = db().from('submissions').select('*').in('person_id', personIds).order('period', { ascending: false }).order('version_no', { ascending: false });
  if (periods) q = q.in('period', periods);
  return must(await q, 'submissions') as Submission[];
}
export async function clientInvoicesFor(personIds: string[], periods?: string[]): Promise<ClientInvoice[]> {
  if (!personIds.length) return [];
  let q = db().from('client_invoices').select('*').in('person_id', personIds);
  if (periods) q = q.in('period', periods);
  return must(await q, 'client invoices') as ClientInvoice[];
}
// The person's active submission for a month (in progress, approved or rejected; never a superseded version).
export function activeSubmission(subs: Submission[], personId: string, period: string) {
  return subs.find((x) => x.person_id === personId && x.period === period && x.status !== 'superseded') || null;
}
// INV-9 / CI-5: In Progress while either document is missing or both are in but not reviewed; else the decision.
export function reviewStatus(sub: Submission | null, ci: ClientInvoice | null): 'In Progress' | 'Approved' | 'Rejected' {
  if (!sub || !ci) return 'In Progress';
  if (sub.status === 'approved') return 'Approved';
  if (sub.status === 'rejected') return 'Rejected';
  return 'In Progress';
}
export function reviewNote(sub: Submission | null, ci: ClientInvoice | null, type: Person['type']) {
  const docLabel = type === 'consultant' ? 'vendor invoice' : type === 'w2' ? 'timesheet' : 'resource invoice';
  if (!ci && !sub) return 'Waiting for both documents';
  if (!ci) return 'Waiting for client invoice';
  if (!sub) return `Waiting for ${docLabel}`;
  if (sub.status === 'in_progress') return 'Ready for review';
  return '';
}

/* ---------------- misc ---------------- */
// Billing period under review = the previous calendar month (Nov 13 → October).
export function currentPeriod(): string {
  const [y, m] = todayISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}
export function billingPeriods(): string[] {
  // The current reconciliation month and the two before it.
  const [y, m] = currentPeriod().split('-').map(Number);
  return [0, 1, 2].map((k) => {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    return d.toISOString().slice(0, 10);
  });
}
export function dueDate(period: string) {
  const [y, m] = period.split('-').map(Number);
  return fmtDate(new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10)); // 15th of the following month
}
export async function paymentTerms(): Promise<string[]> {
  const rows = must(await db().from('payment_terms').select('label,sort').order('sort'), 'terms') as { label: string }[];
  return rows.map((r) => r.label);
}
