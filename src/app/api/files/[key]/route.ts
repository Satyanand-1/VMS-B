import { NextResponse, type NextRequest } from 'next/server';
import { loadSession, canSeeClient, canSeePerson, canSeeVendor, isStaff, passwordInfo } from '@/lib/session';
import { db } from '@/lib/supabase/admin';
import { signedUrl } from '@/lib/files';

// View / Download: checks the user may see the file, then redirects to a 5-minute signed URL.
// Keys: d-<documentVersionId>, si-<submissionId> (invoice), st-<submissionId> (timesheet), ci-<clientInvoiceId>.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const s = await loadSession();
  if (!s || s.account.status === 'inactive' || passwordInfo(s.account).expired) return new NextResponse('Not signed in', { status: 401 });
  const { key } = await params;
  const [kind, ...rest] = key.split('-');
  const id = rest.join('-');
  let path: string | null = null;
  let name = 'file';
  let allowed = false;

  if (kind === 'd') {
    const v = (await db().from('document_versions').select('storage_path,file_name,documents(owner_kind,owner_id)').eq('id', id).maybeSingle()).data as
      { storage_path: string; file_name: string; documents: { owner_kind: string; owner_id: string } } | null;
    if (v) {
      path = v.storage_path; name = v.file_name;
      const { owner_kind, owner_id } = v.documents;
      if (owner_kind === 'client') allowed = isStaff(s) && canSeeClient(s, owner_id);
      else if (owner_kind === 'vendor') allowed = canSeeVendor(s, owner_id);
      else {
        const p = (await db().from('people').select('id,client_id,vendor_id').eq('id', owner_id).maybeSingle()).data;
        allowed = !!p && canSeePerson(s, p);
      }
    }
  } else if (kind === 'si' || kind === 'st') {
    const sub = (await db().from('submissions').select('invoice_path,invoice_name,timesheet_path,timesheet_name,person_id').eq('id', id).maybeSingle()).data;
    if (sub) {
      path = kind === 'si' ? sub.invoice_path : sub.timesheet_path;
      name = (kind === 'si' ? sub.invoice_name : sub.timesheet_name) || 'file';
      const p = (await db().from('people').select('id,client_id,vendor_id').eq('id', sub.person_id).maybeSingle()).data;
      allowed = !!p && canSeePerson(s, p);
    }
  } else if (kind === 'ci') {
    const ci = (await db().from('client_invoices').select('file_path,file_name,client_id').eq('id', id).maybeSingle()).data;
    if (ci) { path = ci.file_path; name = ci.file_name; allowed = isStaff(s) && canSeeClient(s, ci.client_id); }
  }
  if (!path) return new NextResponse('File not found', { status: 404 });
  if (!allowed) return new NextResponse('You do not have access to this file.', { status: 403 });
  const url = await signedUrl(path, req.nextUrl.searchParams.get('download') ? name : undefined);
  return NextResponse.redirect(url);
}
