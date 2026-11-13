import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page } from '@/components/page';
import { DataTable } from '@/components/client';
import { Badge, EditLink, PersonCell, TextLink, ViewLink } from '@/components/ui';
import { personModal } from '@/components/person-modals';
import { requireSession } from '@/lib/session';
import { activeSubmission, clientInvoicesFor, currentPeriod, label, maps, peopleInScope, reviewStatus, submissionsFor } from '@/lib/data';
import { fmtDate, monthShort, usd } from '@/lib/format';

// TM-1: separate W-2 Resources and 1099 Resources lists (Super Admin: all; Account Manager: own clients).
export default async function ResourcesPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string>> }) {
  const { type } = await params;
  if (type !== 'w2' && type !== '1099') notFound();
  const s = await requireSession(['superadmin', 'accountmanager']);
  const sp = await searchParams;
  const ptype = type === 'w2' ? 'w2' : 'w1099';
  const base = `/resources/${type}`;
  const [people, m] = await Promise.all([peopleInScope(s, ptype), maps()]);
  const am = s.persona === 'accountmanager';
  const period = currentPeriod();
  const [subs, cis] = await Promise.all([submissionsFor(people.map((p) => p.id), [period]), clientInvoicesFor(people.map((p) => p.id), [period])]);
  const rows = people.map((p) => {
    const sub = activeSubmission(subs, p.id, period);
    const st = sub ? reviewStatus(sub, cis.find((c) => c.person_id === p.id) || null) : 'Not Started';
    return [
      <PersonCell key="p" name={p.full_name} sub={p.role_title || undefined} />,
      p.client_id ? m.client[p.client_id]?.name : '—',
      usd(p.hourly_rate),
      am ? <Badge key="s" text={st} /> : `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`,
      <Badge key="st" text={label(p.status)} />,
      <div key="a" className="row-actions">
        <ViewLink href={`${base}?m=view-person&id=${p.id}`} />
        <EditLink href={`${base}?m=edit-person&id=${p.id}`} />
        <TextLink href={`${base}/${p.id}`}>Invoices &amp; Timesheets</TextLink>
      </div>
    ];
  });
  const w2 = type === 'w2';
  return (
    <Page s={s} title={w2 ? 'W-2 Resources' : '1099 Resources'} flash={sp.flash}
      description={w2 ? (am ? 'W-2 employees working on your clients. Each submits one timesheet per month.' : 'In-house W-2 employees. Each works for one client and submits one timesheet per month.')
        : (am ? '1099 contractors working on your clients. Each submits one invoice and timesheet per month.' : 'In-house 1099 contractors. Each works for one client and submits one invoice and timesheet per month.')}
      actions={<Link className="btn btn-primary" href={`${base}?m=${w2 ? 'add-w2' : 'add-1099'}`} scroll={false}>{w2 ? 'Add W-2 Resource' : 'Add 1099 Resource'}</Link>}>
      <DataTable title={w2 ? 'W-2 resources' : '1099 resources'} total={people.length}
        headers={['Name', 'Client', 'Hourly Rate', am ? `${monthShort(period).split(' ')[0]} Submission` : 'Assignment Period', 'Status', 'Actions']}
        rows={rows} searchText={people.map((p) => `${p.full_name} ${p.role_title} ${p.client_id ? m.client[p.client_id]?.name : ''}`)} />
      {await personModal(sp, s, base)}
    </Page>
  );
}
