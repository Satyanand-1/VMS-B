import Link from 'next/link';
import { Page } from '@/components/page';
import { Filters, Modal, ModalClose } from '@/components/client';
import { Badge, DetailCard, EditLink, FileChip, FileLinks, PersonCell, Tabs, ViewLink } from '@/components/ui';
import { requireSession, canSeeClient } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import { billingPeriods, clientInvoicesFor, clientsInScope, currentPeriod, docsFor, maps, peopleInScope, type Person } from '@/lib/data';
import { fmtDate, monthLong } from '@/lib/format';
import { ClientInvoicesTable, type CiRow } from './ClientInvoicesTable';
import { ClientForm } from './ClientForm';

const TABS = ['Vendor Consultants', 'W-2', '1099'] as const;
const TAB_TYPES: Person['type'][] = ['consultant', 'w2', 'w1099'];
const STATUSES = ['All', 'Uploaded', 'Not uploaded'];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['superadmin', 'accountmanager']);
  const sp = await searchParams;
  const sa = s.persona === 'superadmin';
  const clients = await clientsInScope(s);
  const months = billingPeriods();
  const clientId = sp.client && clients.some((c) => c.id === sp.client) ? sp.client : 'all';
  const status = STATUSES.includes(sp.status) ? sp.status : 'All';
  const period = months.includes(sp.month) ? sp.month : currentPeriod();
  const tab = Math.min(Math.max(Number(sp.tab) || 0, 0), 2);
  const all = clientId === 'all';
  const m = await maps();

  // People working on the client(s) in that month (consultants mapped to a client, W-2 and 1099 resources).
  const [y, mo] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const people = (await peopleInScope(s)).filter((p) => p.client_id && (all ? clients.some((c) => c.id === p.client_id) : p.client_id === clientId)
    && (!p.start_date || p.start_date <= monthEnd) && (!p.end_date || p.end_date >= period));
  const cis = await clientInvoicesFor(people.map((p) => p.id), [period]);
  const ciOf = (pid: string) => cis.find((c) => c.person_id === pid) || null;
  const ofTab = people.filter((p) => p.type === TAB_TYPES[tab]);
  const shown = ofTab.filter((p) => status === 'All' || (status === 'Uploaded') === !!ciOf(p.id));
  const missing = shown.filter((p) => !ciOf(p.id)).length;

  const rows: CiRow[] = shown.map((p) => {
    const ci = ciOf(p.id);
    return {
      personId: p.id, uploaded: !!ci, search: p.full_name,
      cells: [
        <PersonCell key="p" name={p.full_name} sub={p.vendor_id ? m.vendor[p.vendor_id]?.name : `${p.type === 'w2' ? 'W-2' : '1099'} resource`} />,
        ...(all ? [m.client[p.client_id!]?.name] : []),
        <Badge key="s" text={ci ? 'Uploaded' : 'Not Uploaded'} />
      ],
      fileCell: ci ? <div className="doc-cell"><FileChip name={ci.file_name} /><FileLinks fileKey={`ci-${ci.id}`} name={ci.file_name} download={false} /></div> : undefined,
      hours: ci ? String(Number(ci.hours)) : undefined
    };
  });
  const base = (over: Record<string, string | number>) => {
    const q = new URLSearchParams({ client: clientId, status, month: period, tab: String(tab), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return `/clients?${q.toString()}`;
  };
  const closeHref = base({});

  // Selected client details strip (CL-3) with View / Edit
  let strip = null;
  if (!all) {
    const c = clients.find((x) => x.id === clientId)!;
    const amIds = (must(await db().from('client_account_managers').select('account_manager_id').eq('client_id', c.id), 'AMs') as { account_manager_id: string }[]).map((r) => r.account_manager_id);
    const msa = (await docsFor('client', [c.id])).find((d) => d.doc_type === 'MSA');
    strip = (
      <div className="client-strip">
        <div><span className="person-sub">Client</span><b>{c.name}</b><span className="person-sub">{c.currency} · {c.time_zone}</span></div>
        <div><span className="person-sub">Account managers</span><b>{amIds.map((a) => m.am[a]?.full_name).join(', ') || '—'}</b></div>
        <div><span className="person-sub">MSA expiry</span><b>{fmtDate(msa?.valid_to)} {msa && msa.status !== 'Valid' ? <Badge text={msa.status} /> : null}</b></div>
        <div className="row-actions"><ViewLink href={base({ m: 'view-client', id: c.id })} /><EditLink href={base({ m: 'edit-client', id: c.id })} /></div>
      </div>
    );
  }

  const modal = await clientModal(sp, s, closeHref, m);
  return (
    <Page s={s} title={sa ? 'Client Management' : 'My Clients'} flash={sp.flash}
      description={sa ? 'Choose a client, status and month, then upload the client invoice for each consultant or resource with its billable hours. Approving or rejecting is done in Invoice Management.'
        : 'Choose one of your clients, a status and a month, then upload the client invoice for each consultant or resource with its billable hours. Approving or rejecting is done in Invoice Management.'}
      actions={sa ? <Link className="btn btn-primary" href={base({ m: 'add-client' })} scroll={false}>Add Client</Link> : null}>
      <Filters filters={[
        { label: 'Client', param: 'client', value: clientId, options: [{ value: 'all', label: 'All clients' }, ...clients.map((c) => ({ value: c.id, label: c.name }))] },
        { label: 'Status', param: 'status', value: status, options: STATUSES.map((x) => ({ value: x, label: x })) },
        { label: 'Month', param: 'month', value: period, options: months.map((x) => ({ value: x, label: monthLong(x) })) }
      ]} />
      {strip}
      <Tabs tabs={TABS.map((t, i) => `${t} (${people.filter((p) => p.type === TAB_TYPES[i]).length})`)} active={tab} href={(i) => base({ tab: i })} />
      <ClientInvoicesTable key={`${clientId}-${status}-${period}-${tab}`}
        title={`${all ? 'All clients' : clients.find((c) => c.id === clientId)?.name} · ${TABS[tab]} · ${monthLong(period)}`}
        chip={missing ? `${missing} client invoice${missing > 1 ? 's' : ''} not uploaded` : `${shown.length} ${shown.length === 1 ? 'person' : 'people'}`}
        headers={[tab === 0 ? 'Consultant' : 'Resource', ...(all ? ['Client'] : []), 'Client Invoice', 'Client Billable Hours', 'Status']}
        rows={rows} period={period} back={closeHref} editable />
      {modal}
    </Page>
  );
}

async function clientModal(sp: Record<string, string>, s: Awaited<ReturnType<typeof requireSession>>, closeHref: string, m: Awaited<ReturnType<typeof maps>>) {
  const amOptions = async () => {
    const ams = must(await db().from('user_accounts').select('id,full_name,status').eq('role', 'account_manager').neq('status', 'inactive').order('full_name'), 'AMs') as { id: string; full_name: string }[];
    return ams.map((a) => ({ value: a.id, label: a.full_name }));
  };
  if (sp.m === 'add-client' && s.persona === 'superadmin') {
    return (
      <Modal title="Add Client" description="Create a client, assign one or more account managers and upload the MSA." closeHref={closeHref}>
        <ClientForm mode="add" data={{ ams: [] }} amOptions={await amOptions()} canEditAms amNames="" cancelHref={closeHref} />
      </Modal>
    );
  }
  if ((sp.m === 'view-client' || sp.m === 'edit-client') && sp.id && canSeeClient(s, sp.id)) {
    const c = must(await db().from('clients').select('*').eq('id', sp.id).single(), 'client') as { id: string; name: string; email: string; address: string; currency: string; time_zone: string; status: string };
    const amIds = (must(await db().from('client_account_managers').select('account_manager_id').eq('client_id', c.id), 'AMs') as { account_manager_id: string }[]).map((r) => r.account_manager_id);
    const docs = await docsFor('client', [c.id]);
    const msa = docs.find((d) => d.doc_type === 'MSA');
    const amNames = amIds.map((a) => m.am[a]?.full_name).join(', ');
    if (sp.m === 'view-client') {
      return (
        <Modal title="Client" description="Read-only view. Use Edit to change it." closeHref={closeHref}>
          <div className="modal-content">
            <DetailCard sections={[
              { title: 'Client details', items: [
                { label: 'Client name', value: c.name }, { label: 'Billing email', value: c.email }, { label: 'Address', value: c.address || '—', full: true },
                { label: 'Currency', value: c.currency }, { label: 'Time zone', value: c.time_zone }, { label: 'Account managers', value: amNames || '—' },
                { label: 'Status', value: <Badge text={c.status === 'active' ? 'Active' : 'Inactive'} /> }] },
              { title: 'Master Services Agreement', items: [
                { label: 'MSA start date', value: fmtDate(msa?.valid_from) }, { label: 'MSA end date', value: fmtDate(msa?.valid_to) },
                { label: 'MSA document', value: msa?.current ? <div className="doc-cell"><FileChip name={msa.current.file_name} size={msa.size} /><FileLinks fileKey={`d-${msa.current.id}`} name={msa.current.file_name} /></div> : <span className="person-sub inline">Not uploaded</span> }] }
            ]} documents={docs.length > 1 ? { title: 'Other documents', headers: ['Document', 'File', 'Valid until', 'Actions'],
              rows: docs.filter((d) => d.doc_type !== 'MSA').map((d) => [d.doc_type, d.current ? <FileChip name={d.current.file_name} /> : '—', fmtDate(d.valid_to), d.current ? <FileLinks fileKey={`d-${d.current.id}`} name={d.current.file_name} /> : '—']) } : undefined} />
          </div>
          <div className="form-footer modal-footer"><span /><div className="form-buttons"><ModalClose href={closeHref} primary /></div></div>
        </Modal>
      );
    }
    return (
      <Modal title="Edit Client" description="Review and update the client profile, account assignment and MSA." closeHref={closeHref}>
        <ClientForm mode="edit" cancelHref={closeHref} canEditAms={s.persona === 'superadmin'} amNames={amNames} amOptions={await amOptions()}
          data={{ id: c.id, name: c.name, email: c.email, address: c.address, currency: c.currency, time_zone: c.time_zone, status: c.status, ams: amIds,
            msaStart: msa?.valid_from, msaEnd: msa?.valid_to, msaFile: msa?.current ? { name: msa.current.file_name, size: msa.size } : null }} />
      </Modal>
    );
  }
  return null;
}
