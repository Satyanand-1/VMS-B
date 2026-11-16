import { Page } from '@/components/page';
import { requireSession } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import type { Vendor } from '@/lib/data';
import { ProfileForm } from './ProfileForm';
import { OwnDocuments } from '../my-documents/OwnDocuments';

// Company Profile (vendor): company details (VN-5: the vendor changes only address, phone and authorized signatory)
// and the company documents (VN-4, VN-6) on one page.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['vendor']);
  const sp = await searchParams;
  const v = must(await db().from('vendors').select('*').eq('id', s.account.vendor_id!).single(), 'vendor') as Vendor;
  const am = must(await db().from('user_accounts').select('full_name').eq('id', v.account_manager_id).single(), 'am') as { full_name: string };
  return (
    <Page s={s} title="Company Profile" flash={sp.flash}>
      <ProfileForm amName={am.full_name} v={{ name: v.name, email: v.email, einMasked: v.ein_last4 ? `••-•••${v.ein_last4}` : '—', address: v.address, phone: v.phone,
        signatory_name: v.signatory_name, signatory_phone: v.signatory_phone, payment_term: v.payment_term, state: v.state_of_incorporation }} />
      <div id="documents" className="profile-documents">
        <OwnDocuments s={s} />
      </div>
    </Page>
  );
}
