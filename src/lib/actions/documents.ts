'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, must } from '../supabase/admin';
import { requireSession, canSeeClient, canSeePerson, canSeeVendor, isStaff, type Session } from '../session';
import { audit } from '../audit';
import { sendEmail } from '../email';
import { checkFile } from '../files';
import { addDocumentVersion, uploadField } from '../domain/documents';
import type { FormState } from './auth';

type DocRow = { id: string; owner_kind: string; owner_id: string; doc_type: string; uploader_kind: string };

// Who owns the document, and may this user act on it?
async function ownerOf(s: Session, d: DocRow) {
  if (d.owner_kind === 'client') {
    const c = (await db().from('clients').select('name,email').eq('id', d.owner_id).single()).data as { name: string; email: string };
    return { ok: isStaff(s) && canSeeClient(s, d.owner_id), name: c.name, email: c.email, userId: null as string | null };
  }
  if (d.owner_kind === 'vendor') {
    const v = (await db().from('vendors').select('name,email').eq('id', d.owner_id).single()).data as { name: string; email: string };
    const acc = (await db().from('user_accounts').select('id').eq('vendor_id', d.owner_id).limit(1)).data?.[0] as { id: string } | undefined;
    return { ok: canSeeVendor(s, d.owner_id), name: v.name, email: v.email, userId: acc?.id || null };
  }
  const p = (await db().from('people').select('id,full_name,email,client_id,vendor_id').eq('id', d.owner_id).single()).data as { id: string; full_name: string; email: string; client_id: string | null; vendor_id: string | null };
  const acc = (await db().from('user_accounts').select('id').eq('person_id', d.owner_id).limit(1)).data?.[0] as { id: string } | undefined;
  return { ok: canSeePerson(s, p), name: p.full_name, email: p.email, userId: acc?.id || null };
}

// DOC-6: Remind (expiring / expired) or Request (incomplete); one per owner, document and kind per day.
export async function remindAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const kind = String(form.get('kind')) === 'remind' ? 'remind' : 'request';
  const d = (await db().from('documents').select('id,owner_kind,owner_id,doc_type,uploader_kind').eq('id', String(form.get('document_id'))).maybeSingle()).data as DocRow | null;
  if (!d) return { error: 'Document not found.' };
  const owner = await ownerOf(s, d);
  if (!owner.ok) return { error: 'You do not have access to this document.' };
  const { error } = await db().from('reminders').insert({ document_id: d.id, kind, sent_by: s.account.id });
  if (error) return { error: `A ${kind === 'remind' ? 'reminder' : 'request'} for ${d.doc_type} was already sent to ${owner.name} today.` };
  const subject = kind === 'remind' ? `Reminder: your ${d.doc_type} is expiring` : `Please upload your ${d.doc_type}`;
  await sendEmail(kind, owner.email, subject, `Hello ${owner.name},\n\n${kind === 'remind' ? `Your ${d.doc_type} is expiring soon. Please upload a renewed copy in AT VMS.` : `Your ${d.doc_type} is missing. Please upload it in AT VMS.`}\n\nArkhya Tech`);
  if (owner.userId) await db().from('notifications').insert({ user_id: owner.userId, title: subject, link: '/my-documents' });
  await audit(s, kind, 'document', d.id, `${kind === 'remind' ? 'reminded' : 'requested'} ${d.doc_type} from ${owner.name}`);
  return { ok: `${owner.name} was notified about ${d.doc_type}.` };
}

// DOC-4: Super Admin marks a document Not Applicable for a person.
export async function notApplicableAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['superadmin']);
  const id = String(form.get('document_id'));
  const value = String(form.get('value')) === 'true';
  must(await db().from('documents').update({ not_applicable: value }).eq('id', id), 'NA');
  await audit(s, 'update', 'document', id, `${value ? 'marked' : 'unmarked'} a document as Not Applicable`);
  revalidatePath('/documents');
  return { ok: value ? 'Marked Not Applicable.' : 'Not Applicable removed.' };
}

// Vendor (W-9, COI, ACH) and resource (W-4 / W-9, I-9, ACH) upload or replace their own documents (VN-4, VN-6, TM-5, TM-7).
export async function uploadOwnDocumentAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const d = (await db().from('documents').select('id,owner_kind,owner_id,doc_type,uploader_kind').eq('id', String(form.get('document_id'))).maybeSingle()).data as DocRow | null;
  if (!d) return { error: 'Document not found.' };
  const mine = s.persona === 'vendor' ? d.owner_kind === 'vendor' && d.owner_id === s.account.vendor_id && d.uploader_kind === 'vendor'
    : d.owner_kind === 'person' && d.owner_id === s.account.person_id && d.uploader_kind === 'resource';
  if (!mine) return { error: 'This document is uploaded by your account manager. You can view and download it only.' };
  const u = uploadField(form, 'file');
  if (!u.file) return { error: 'Choose a file.' };
  const problem = await checkFile(u.file);
  if (problem) return { error: problem };
  if (d.doc_type !== 'ACH form' && (!u.start || !u.end)) return { error: 'Enter the start and end date.' };
  if (u.start && u.end && u.end < u.start) return { error: 'The end date must be after the start date.' };
  await addDocumentVersion(s, d.owner_kind as 'vendor' | 'person', d.owner_id, d.doc_type, u.file, { uploader: s.persona === 'vendor' ? 'vendor' : 'resource', validFrom: u.start, validTo: u.end });
  revalidatePath('/my-documents');
  redirect(`/my-documents?flash=${encodeURIComponent(`${d.doc_type} uploaded|The earlier version is kept in history.`)}`);
}
