import { SubmissionsPortal } from '@/components/portal';
import { requireSession } from '@/lib/session';

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['w2']);
  return <SubmissionsPortal s={s} sp={await searchParams} path="/timesheets" />;
}
