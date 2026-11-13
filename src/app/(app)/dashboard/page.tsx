import { Page } from '@/components/page';
import { Activity, Alert, Badge, KpiRow, Panel, Panels, Sub, type Kpi } from '@/components/ui';
import { requireSession, passwordInfo, isStaff, type Session, type Account } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import {
  activeSubmission, clientInvoicesFor, clientsInScope, currentPeriod, docsFor, dueDate, maps, peopleInScope, reviewStatus,
  submissionsFor, vendorsInScope, type Doc, type Person
} from '@/lib/data';
import { fmtDate, monthLong, monthShort, usd } from '@/lib/format';

function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr${Math.round(mins / 60) === 1 ? '' : 's'} ago`;
  if (mins < 48 * 60) return 'Yesterday';
  return fmtDate(iso);
}
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

async function activity(s: Session) {
  let q = db().from('audit_log').select('actor_name,summary,at').neq('action', 'login').neq('action', 'logout').order('at', { ascending: false }).limit(5);
  if (!s.scope.all) q = q.eq('actor_id', s.account.id);
  const rows = must(await q, 'activity') as { actor_name: string; summary: string; at: string }[];
  return rows.map((r) => ({ who: r.actor_name, what: r.summary, when: relTime(r.at) }));
}

// External users in scope whose password expired (AUTH-4 alert for Super Admin / Account Manager).
async function expiredPasswords(s: Session, people: Person[]) {
  const vendors = await vendorsInScope(s);
  const accs = must(await db().from('user_accounts').select('*').in('role', ['vendor', 'resource']), 'accounts') as Account[];
  const personIds = new Set(people.map((p) => p.id));
  const vendorIds = new Set(vendors.map((v) => v.id));
  return accs.filter((a) => (a.person_id ? personIds.has(a.person_id) : a.vendor_id ? vendorIds.has(a.vendor_id) : false))
    .filter((a) => a.status === 'active' && !a.must_change_password && passwordInfo(a).expired);
}

function expiringItems(docs: Doc[], ownerName: (d: Doc) => string, ownerKind: (d: Doc) => string) {
  return docs.filter((d) => d.status === 'Expiring Soon' || d.status === 'Expired')
    .sort((a, b) => (a.valid_to || '').localeCompare(b.valid_to || ''))
    .map((d) => ({ label: <Sub main={ownerName(d) ? `${d.doc_type} — ${ownerName(d)}` : d.doc_type} secondary={ownerKind(d)} />, value: <Badge text={d.status} />, meta: fmtDate(d.valid_to) }));
}

async function staffDashboard(s: Session) {
  const period = currentPeriod();
  const sa = s.persona === 'superadmin';
  const [clients, vendors, people, m] = await Promise.all([clientsInScope(s), vendorsInScope(s), peopleInScope(s), maps()]);
  const ids = people.map((p) => p.id);
  const [subs, cis] = await Promise.all([submissionsFor(ids, [period]), clientInvoicesFor(ids, [period])]);
  const billable = people.filter((p) => p.client_id && p.status !== 'inactive');
  const statuses = billable.map((p) => reviewStatus(activeSubmission(subs, p.id, period), cis.find((c) => c.person_id === p.id) || null));
  const count = (st: string) => statuses.filter((x) => x === st).length;
  const consultants = people.filter((p) => p.type === 'consultant');
  const w2 = people.filter((p) => p.type === 'w2').length;
  const w9 = people.filter((p) => p.type === 'w1099').length;
  const awaitingCi = billable.filter((p) => !cis.some((c) => c.person_id === p.id));
  const total = statuses.length;
  const bars = [
    { label: 'Approved', value: count('Approved'), pct: pct(count('Approved'), total), tone: 'approved', href: '/invoice-management?status=Approved' },
    { label: 'In Progress (a document missing or awaiting review)', value: count('In Progress'), pct: pct(count('In Progress'), total), tone: 'progress', href: '/invoice-management?status=In+Progress' },
    { label: 'Rejected', value: count('Rejected'), pct: pct(count('Rejected'), total), tone: 'rejected', href: '/invoice-management?status=Rejected' }
  ];
  const kpis: Kpi[] = sa ? [
    { label: 'Active clients', value: clients.filter((c) => c.status === 'active').length, trend: clients.map((c) => c.name).join(' · '), tone: 'neutral', href: '/clients' },
    { label: 'Active vendors', value: vendors.filter((v) => v.status === 'active').length, trend: `${vendors.filter((v) => v.status === 'onboarding').length} onboarding`, tone: 'up', href: '/vendors' },
    { label: 'Vendor consultants', value: consultants.length, trend: `${consultants.filter((p) => p.status === 'onboarding').length} onboarding`, tone: 'up', href: '/vendors' },
    { label: 'W-2 / 1099 resources', value: w2 + w9, trend: `${w2} W-2 · ${w9} 1099`, tone: 'neutral', href: '/resources/w2' }
  ] : [
    { label: 'Assigned clients', value: clients.length, trend: clients.map((c) => c.name).join(' · '), tone: 'neutral', href: '/clients' },
    { label: 'Vendors in scope', value: vendors.length, trend: `${vendors.filter((v) => v.status === 'onboarding').length} onboarding`, tone: 'neutral', href: '/vendors' },
    { label: 'Awaiting client invoice', value: awaitingCi.length, trend: `${new Set(awaitingCi.map((p) => p.client_id)).size} clients outstanding`, tone: 'warn', href: '/clients?status=Not+uploaded' },
    { label: 'Rejected this cycle', value: count('Rejected'), trend: 'Corrected by the submitter', tone: count('Rejected') ? 'down' : 'up', href: '/invoice-management?status=Rejected' }
  ];

  // Documents expiring in 30 days (clients, vendors, people in scope)
  const [cDocs, vDocs, pDocs] = await Promise.all([docsFor('client', clients.map((c) => c.id)), docsFor('vendor', vendors.map((v) => v.id)), docsFor('person', ids)]);
  const pName = Object.fromEntries(people.map((p) => [p.id, p]));
  const expiring = [
    ...expiringItems(cDocs, (d) => m.client[d.owner_id]?.name, () => 'Client document'),
    ...expiringItems(vDocs, (d) => m.vendor[d.owner_id]?.name, () => 'Vendor document'),
    ...expiringItems(pDocs, (d) => pName[d.owner_id]?.full_name, (d) => (pName[d.owner_id]?.type === 'consultant' ? `Consultant · ${m.vendor[pName[d.owner_id].vendor_id!]?.name}` : 'Resource document'))
  ];
  const expired = await expiredPasswords(s, people);
  const firstExpired = expired[0];
  const expiredTarget = firstExpired ? (firstExpired.person_id
    ? `/${pName[firstExpired.person_id]?.type === 'consultant' ? 'vendors' : `resources/${pName[firstExpired.person_id]?.type === 'w2' ? 'w2' : '1099'}`}?m=edit-person&id=${firstExpired.person_id}`
    : `/vendors?m=edit-vendor&id=${firstExpired.vendor_id}`) : '';

  const attention = [
    ...clients.map((c) => {
      const waiting = awaitingCi.filter((p) => p.client_id === c.id).length;
      return waiting ? { label: <Sub main={`Upload ${monthShort(period).split(' ')[0]} client invoices — ${c.name}`} secondary={`${waiting} ${waiting === 1 ? 'person' : 'people'} still waiting`} />, value: <Badge text="Due" />, meta: dueDate(period) } : null;
    }).filter(Boolean) as { label: React.ReactNode; value: React.ReactNode; meta: string }[],
    ...expiring.slice(0, 3)
  ];

  return (
    <Page s={s} title="Dashboard" description={sa
      ? `Platform-wide view of clients, vendors, people and the ${monthLong(period)} billing cycle.`
      : `Your ${clients.length} clients and ${vendors.length} vendors. ${monthLong(period)} billing closes ${dueDate(period)}.`}>
      {expired.length ? (
        <Alert tone="danger" title={`${expired.length} password${expired.length > 1 ? 's' : ''} expired`}
          text={`${expired.map((a) => a.full_name).join(', ')} did not change their password within 30 days and cannot sign in. Send a new temporary password from their Edit form.`}
          action={{ label: `Send new password to ${firstExpired.full_name}`, href: expiredTarget }} />
      ) : null}
      <KpiRow kpis={kpis} />
      <Panels>
        {sa ? (
          <>
            <Panel title={`Invoices by status — ${monthShort(period)}`} chip={`${total} total`} bars={bars} />
            <Panel title="Expiring in the next 30 days" chip={`${expiring.length} documents`} items={expiring.slice(0, 5)} />
          </>
        ) : (
          <>
            <Panel title="Needs your attention" chip={`${attention.length} tasks`} items={attention.length ? attention : [{ label: 'Nothing waiting on you', value: '' }]} />
            <Panel title={`${monthLong(period).split(' ')[0]} invoice review`} chip={`${total} submissions`} bars={bars} />
          </>
        )}
      </Panels>
      <Activity items={await activity(s)} viewAllHref="/audit" />
    </Page>
  );
}

async function vendorDashboard(s: Session, flash?: string) {
  const period = currentPeriod();
  const vendor = must(await db().from('vendors').select('*').eq('id', s.account.vendor_id!).single(), 'vendor') as { name: string; account_manager_id: string };
  const am = must(await db().from('user_accounts').select('full_name').eq('id', vendor.account_manager_id).single(), 'am') as { full_name: string };
  const people = await peopleInScope(s, 'consultant');
  const subs = await submissionsFor(people.map((p) => p.id), [period]);
  const active = subs.filter((x) => x.status !== 'superseded');
  const approved = active.filter((x) => x.status === 'approved').length;
  const rejected = active.filter((x) => x.status === 'rejected');
  const inProgress = active.filter((x) => x.status === 'in_progress').length;
  const [vDocs, pDocs] = await Promise.all([docsFor('vendor', [s.account.vendor_id!]), docsFor('person', people.map((p) => p.id))]);
  const pName = Object.fromEntries(people.map((p) => [p.id, p.full_name]));
  const expiring = [...expiringItems(vDocs, () => '', () => 'Company document').map((i) => i),
    ...expiringItems(pDocs, (d) => pName[d.owner_id], () => 'Consultant document')];
  const valid = vDocs.filter((d) => d.status === 'Valid').length;
  const total = active.length;
  const firstRej = rejected[0];
  const pw = passwordInfo(s.account);
  return (
    <Page s={s} title="Dashboard" flash={flash} description={`${vendor.name} · Account manager: ${am.full_name}. ${monthLong(period)} invoices are due ${dueDate(period)}.`}>
      {pw.daysLeft <= 5 ? <Alert tone="warning" title={`Your password expires in ${pw.daysLeft} day${pw.daysLeft === 1 ? '' : 's'} (${pw.expires})`}
        text="Passwords expire every 30 days. Change it now to keep access; an unchanged password stops working the day after it expires." action={{ label: 'Change Password', href: '/change-password' }} /> : null}
      {firstRej ? <Alert tone="danger" title={`${rejected.length} invoice${rejected.length > 1 ? 's were' : ' was'} rejected and needs correction`}
        text={`${firstRej.ref} · ${pName[firstRej.person_id]} — ${firstRej.reject_reason || 'total hours do not match the client invoice.'}`}
        action={{ label: 'Fix now', href: `/invoices?m=resubmit&id=${firstRej.id}` }} /> : null}
      <KpiRow kpis={[
        { label: 'Active consultants', value: people.filter((p) => p.status === 'active').length, trend: `${people.filter((p) => p.status === 'onboarding').length} onboarding`, tone: 'neutral', href: '/consultants' },
        { label: `Approved — ${monthShort(period)}`, value: approved, trend: `of ${total} submitted`, tone: 'up', href: '/invoices?tab=1' },
        { label: 'Rejected to fix', value: rejected.length, trend: rejected.length ? 'Action needed' : 'Nothing to fix', tone: rejected.length ? 'down' : 'up', href: '/invoices?tab=3' },
        { label: 'Expiring documents', value: expiring.length, trend: expiring[0] ? `Next: ${expiring[0].meta}` : 'None in 30 days', tone: 'warn', href: '/my-documents' }
      ]} />
      <Panels>
        <Panel title={`${monthLong(period)} submissions`} chip={`${people.length} consultants`} bars={[
          { label: 'Approved', value: approved, pct: pct(approved, total), tone: 'approved', href: '/invoices?tab=1' },
          { label: 'In Progress', value: inProgress, pct: pct(inProgress, total), tone: 'progress', href: '/invoices?tab=2' },
          { label: 'Rejected', value: rejected.length, pct: pct(rejected.length, total), tone: 'rejected', href: '/invoices?tab=3' }
        ]} />
        <Panel title="Documents" chip={`${valid} of ${vDocs.length} valid`} items={[
          ...expiring.slice(0, 3),
          ...vDocs.filter((d) => d.status === 'Valid').slice(0, 2).map((d) => ({ label: <Sub main={d.doc_type} secondary={d.valid_to ? `Valid until ${fmtDate(d.valid_to)}` : 'Company document'} />, value: <Badge text="Valid" />, meta: '' }))
        ]} />
      </Panels>
      <VendorActivity s={s} />
    </Page>
  );
}

async function VendorActivity({ s }: { s: Session }) {
  const items = await activity(s);
  return items.length ? <Activity items={items} /> : null;
}

async function resourceDashboard(s: Session, flash?: string) {
  const person = must(await db().from('people').select('*').eq('id', s.account.person_id!).single(), 'person') as Person;
  const client = person.client_id ? (await db().from('clients').select('name').eq('id', person.client_id).single()).data?.name : '';
  const subs = (await submissionsFor([person.id])).filter((x) => x.status !== 'superseded');
  const cis = await clientInvoicesFor([person.id]);
  const docs = (await docsFor('person', [person.id])).filter((d) => d.uploader_kind === 'resource');
  const todo = docs.filter((d) => d.status === 'Incomplete' || d.status === 'Expired' || d.status === 'Expiring Soon');
  const w2 = person.type === 'w2';
  const period = currentPeriod();
  const cur = subs.find((x) => x.period === period);
  const rejected = subs.filter((x) => x.status === 'rejected');
  const pw = passwordInfo(s.account);
  const first = person.full_name.split(' ')[0];
  const shown = (x: (typeof subs)[number]) => {
    const st = reviewStatus(x, cis.find((c) => c.period === x.period) || null);
    return st;
  };
  return (
    <Page s={s} title={`Welcome back, ${first}`} flash={flash} description={w2 ? 'W-2 employees submit a monthly timesheet. No invoice is needed.' : '1099 contractors submit a monthly invoice and timesheet.'}>
      {pw.daysLeft <= 5 ? <Alert tone="warning" title={`Your password expires in ${pw.daysLeft} day${pw.daysLeft === 1 ? '' : 's'} (${pw.expires})`}
        text="Passwords expire every 30 days. Change it now to keep access; an unchanged password stops working the day after it expires." action={{ label: 'Change Password', href: '/change-password' }} /> : null}
      {rejected[0] ? <Alert tone="danger" title={`Your ${monthLong(rejected[0].period).split(' ')[0]} ${w2 ? 'timesheet' : 'invoice'} for ${client} was rejected`}
        text={`${rejected[0].ref} — ${rejected[0].reject_reason || 'hours did not match the client invoice.'}`}
        action={{ label: w2 ? 'Resubmit timesheet' : 'Resubmit invoice', href: `${w2 ? '/timesheets' : '/invoices'}?m=resubmit&id=${rejected[0].id}` }} />
        : todo[0] ? <Alert tone="warning" title={`Your ${todo[0].doc_type} is ${todo[0].status === 'Incomplete' ? 'incomplete' : todo[0].status.toLowerCase()}`}
          text={`Upload your ${todo[0].doc_type} so your onboarding file is complete.`} action={{ label: 'Upload', href: '/my-documents' }} /> : null}
      <KpiRow kpis={w2 ? [
        { label: `${monthLong(period).split(' ')[0]} timesheet`, value: cur ? 'Submitted' : 'Not submitted', trend: cur ? `${shown(cur)} · ${Number(cur.hours)} h` : `Due ${dueDate(period)}`, tone: cur ? 'up' : 'warn', href: '/timesheets' },
        { label: 'Approved this year', value: subs.filter((x) => x.status === 'approved').length, trend: rejected.length ? `${rejected.length} to fix` : 'No open rejections', tone: 'up', href: '/timesheets' },
        { label: 'Documents to action', value: todo.length, trend: todo.length ? `${todo[0].doc_type} ${todo[0].status.toLowerCase()}` : 'All valid', tone: todo.length ? 'warn' : 'up', href: '/my-documents' }
      ] : [
        { label: `Billed in ${monthLong(period).split(' ')[0]}`, value: cur ? usd(cur.amount).replace('.00', '') : '—', trend: cur ? `${Number(cur.hours)} h · ${client}` : `Due ${dueDate(period)}`, tone: 'neutral', href: '/invoices' },
        { label: 'Rejected to fix', value: rejected.length, trend: rejected.length ? 'Action needed' : 'Nothing to fix', tone: rejected.length ? 'down' : 'up', href: '/invoices' },
        { label: 'Documents', value: todo.length ? `${todo.length} to action` : 'All valid', trend: todo.length ? todo[0].doc_type : 'Nothing due', tone: todo.length ? 'warn' : 'up', href: '/my-documents' }
      ]} />
      <Panels single>
        <Panel title={w2 ? 'Submission status by month' : 'Invoices by month'} chip="Last 3 months" items={subs.slice(0, 3).map((x) => ({
          label: <Sub main={monthLong(x.period)} secondary={`${client} · ${w2 ? `${Number(x.hours)} h` : usd(x.amount)}`} />, value: <Badge text={shown(x)} />, meta: ''
        }))} />
      </Panels>
    </Page>
  );
}

async function consultantDashboard(s: Session) {
  return (
    <Page s={s} title={`Welcome back, ${s.account.full_name.split(' ')[0]}`} description="Your invoices and timesheets are submitted by your vendor. Use the profile menu to change your password.">
      <Alert tone="info" title="Nothing to do here" text="Your account manager and vendor manage your assignment and documents." />
    </Page>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession();
  const { flash } = await searchParams;
  if (isStaff(s)) return staffDashboard(s);
  if (s.persona === 'vendor') return vendorDashboard(s, flash);
  if (s.personType === 'consultant') return consultantDashboard(s);
  return resourceDashboard(s, flash);
}
