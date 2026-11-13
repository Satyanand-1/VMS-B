import { Page } from '@/components/page';
import { DataTable } from '@/components/client';
import { Badge, PersonCell, ViewLink } from '@/components/ui';
import { personModal } from '@/components/person-modals';
import { requireSession } from '@/lib/session';
import { label, peopleInScope } from '@/lib/data';
import { fmtDate, usd } from '@/lib/format';

// Vendor: its consultants, view only (TM-2). Consultants are added and edited by the account manager.
export default async function ConsultantsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['vendor']);
  const sp = await searchParams;
  const people = await peopleInScope(s, 'consultant');
  const rows = people.map((p) => [
    <PersonCell key="p" name={p.full_name} sub={p.role_title || undefined} />, usd(p.hourly_rate),
    `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`, p.work_location || 'Remote', <Badge key="s" text={label(p.status)} />,
    <div key="a" className="row-actions"><ViewLink href={`/consultants?m=view-person&id=${p.id}`} /></div>
  ]);
  return (
    <Page s={s} title="Consultants" description="Your consultants and their current assignment. New consultants are added by your account manager; contact them to add or change one.">
      <DataTable title="Consultants" total={people.length} headers={['Consultant', 'Hourly Rate', 'Assignment', 'Location', 'Status', 'Actions']} rows={rows}
        searchText={people.map((p) => `${p.full_name} ${p.role_title}`)} />
      {sp.m === 'view-person' ? await personModal(sp, s, '/consultants') : null}
    </Page>
  );
}
