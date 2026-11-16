import { redirect } from 'next/navigation';
import { Page } from '@/components/page';
import { requireSession } from '@/lib/session';
import { OwnDocuments } from './OwnDocuments';

// Resource My Documents (TM-5, TM-7). A vendor's documents are on Company Profile (one page with the profile and documents).
export default async function MyDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const sp = await searchParams;
  if (s.persona === 'vendor') redirect(`/profile${sp.flash ? `?flash=${encodeURIComponent(sp.flash)}` : ''}#documents`);
  return (
    <Page s={s} title="My Documents" flash={sp.flash}>
      <OwnDocuments s={s} />
    </Page>
  );
}
