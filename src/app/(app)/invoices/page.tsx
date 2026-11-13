import { SubmissionsPortal } from '@/components/portal';
import { requireSession } from '@/lib/session';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['vendor', 'w9']);
  return <SubmissionsPortal s={s} sp={await searchParams} path="/invoices" />;
}
