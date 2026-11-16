import { notFound } from 'next/navigation';
import { Page } from '@/components/page';
import { DataTable } from '@/components/client';
import { Badge, FileChip, FileLinks, Muted } from '@/components/ui';
import { requireSession, canSeePerson } from '@/lib/session';
import { getPerson, label, maps, submissionsFor } from '@/lib/data';
import { monthShort, usd } from '@/lib/format';

// TM-15: a resource's submissions by month — view only (INV-11).
export default async function SubmissionsPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const s = await requireSession(['superadmin', 'accountmanager']);
  const person = await getPerson(id);
  if (!person || !canSeePerson(s, person) || person.type === 'consultant') notFound();
  const m = await maps();
  const subs = await submissionsFor([id]);
  const w2 = person.type === 'w2';
  const file = (key: string, name: string | null) => (name ? <div className="doc-cell"><FileChip name={name} /><FileLinks fileKey={key} name={name} /></div> : <Muted>Not uploaded</Muted>);
  // W-2 resources submit timesheets only (no amount or invoice columns); 1099 resources submit an invoice and a timesheet.
  const rows = subs.map((x) => w2
    ? [monthShort(x.period), m.client[x.client_id]?.name, <span key="r" className="mono">{x.ref}</span>, String(Number(x.hours)), file(`st-${x.id}`, x.timesheet_name), <Badge key="s" text={label(x.status)} />]
    : [monthShort(x.period), m.client[x.client_id]?.name, <span key="r" className="mono">{x.ref}</span>, String(Number(x.hours)), usd(x.amount),
      file(`si-${x.id}`, x.invoice_name), file(`st-${x.id}`, x.timesheet_name), <Badge key="s" text={label(x.status)} />]);
  const listHref = `/resources/${type}`;
  return (
    <Page s={s} title={`${person.full_name} · ${w2 ? 'Timesheets' : 'Invoices & Timesheets'}`} parent={{ label: w2 ? 'W-2 Resources' : '1099 Resources', href: listHref }}>
      <DataTable title={w2 ? 'Timesheets' : 'Submissions'} noSearch
        headers={w2 ? ['Period', 'Client', 'Reference', 'Hours', 'Timesheet', 'Status'] : ['Period', 'Client', 'Reference', 'Hours', 'Amount', 'Invoice', 'Timesheet', 'Status']}
        rows={rows} empty={w2 ? 'No timesheets yet.' : 'No submissions yet.'} />
    </Page>
  );
}
