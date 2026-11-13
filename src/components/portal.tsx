// Vendor / 1099 Invoices and W-2 Timesheets (shared): list with status tabs, Upload, View (with Replace) and Resubmit.
import Link from 'next/link';
import { Page } from './page';
import { DataTable, Modal, ModalClose } from './client';
import { Badge, DetailCard, FileChip, FileLinks, Muted, PersonCell, Tabs, TextLink, ViewLink } from './ui';
import { ReplaceFile, ResubmitForm, SubmitForm, type SubmitPerson } from './SubmitForms';
import { db, must } from '@/lib/supabase/admin';
import { billingPeriods, clientInvoicesFor, maps, peopleInScope, reviewStatus, submissionsFor, type Person, type Submission } from '@/lib/data';
import { fmtDate, monthLong, monthShort, usd } from '@/lib/format';
import type { Session } from '@/lib/session';

const TABS = ['All', 'Approved', 'In Progress', 'Rejected'];

export async function SubmissionsPortal({ s, sp, path }: { s: Session; sp: Record<string, string>; path: string }) {
  const vendor = s.persona === 'vendor';
  const w2 = s.persona === 'w2';
  const people: Person[] = vendor ? await peopleInScope(s, 'consultant')
    : [must(await db().from('people').select('*').eq('id', s.account.person_id!).single(), 'person') as Person];
  const m = await maps();
  const allSubs = await submissionsFor(people.map((p) => p.id));
  const subs = allSubs.filter((x) => x.status !== 'superseded');
  const cis = await clientInvoicesFor(people.map((p) => p.id));
  // What the submitter sees: Approved / Rejected, or In Progress (waiting for the client invoice or review).
  const shown = (x: Submission) => reviewStatus(x, cis.find((c) => c.person_id === x.person_id && c.period === x.period) || null);
  const tab = Math.min(Math.max(Number(sp.tab) || 0, 0), 3);
  const filtered = subs.filter((x) => tab === 0 || shown(x) === TABS[tab]);
  const pName = Object.fromEntries(people.map((p) => [p.id, p]));
  const actions = (x: Submission) => (
    <div key="act" className="row-actions">
      <ViewLink href={`${path}?m=view&id=${x.id}`} />
      {x.status === 'rejected' ? <TextLink href={`${path}?m=resubmit&id=${x.id}`}>Resubmit</TextLink> : null}
    </div>
  );
  const headers = vendor ? ['Invoice #', 'Consultant', 'Client', 'Hours', 'Amount', 'Submitted', 'Status', 'Actions']
    : w2 ? ['Period', 'Hours', 'Timesheet', 'Submitted', 'Status', 'Actions'] : ['Invoice #', 'Period', 'Hours', 'Amount', 'Status', 'Actions'];
  const submitted = (x: Submission) => `${fmtDate(x.submitted_at)}${x.version_no > 1 ? ` (v${x.version_no})` : ''}`;
  const rows = filtered.map((x) => vendor
    ? [<span key="r" className="mono">{x.ref}</span>, <PersonCell key="p" name={pName[x.person_id]?.full_name} />, m.client[x.client_id]?.name, String(Number(x.hours)), usd(x.amount), submitted(x), <Badge key="s" text={shown(x)} />, actions(x)]
    : w2 ? [monthLong(x.period), String(Number(x.hours)), x.timesheet_name ? <FileChip key="f" name={x.timesheet_name} /> : <Muted>Not uploaded</Muted>, submitted(x), <Badge key="s" text={shown(x)} />, actions(x)]
    : [<span key="r" className="mono">{x.ref}</span>, monthShort(x.period), String(Number(x.hours)), usd(x.amount), <Badge key="s" text={shown(x)} />, actions(x)]);

  // Upload form data: active people mapped to a client, with months not yet submitted (INV-8)
  const periods = billingPeriods();
  const submitPeople: SubmitPerson[] = people.filter((p) => p.client_id && (p.status === 'active' || p.status === 'onboarding')).map((p) => ({
    id: p.id, name: p.full_name, client: m.client[p.client_id!]?.name, rate: Number(p.hourly_rate),
    term: p.vendor_id ? m.vendor[p.vendor_id]?.payment_term : p.payment_term || 'Net 10',
    openPeriods: periods.filter((pr) => (!p.start_date || p.start_date <= `${pr.slice(0, 8)}31`) && !subs.some((x) => x.person_id === p.id && x.period === pr)).map((pr) => ({ value: pr, label: monthLong(pr) }))
  })).filter((p) => p.openPeriods.length);

  let modal = null;
  const close = path;
  if (sp.m === 'new') {
    modal = (
      <Modal title={w2 ? 'Upload Timesheet' : 'Upload Invoice'} description={w2 ? 'Upload your monthly timesheet. It is reviewed against the client invoice hours.'
        : vendor ? 'Upload the monthly invoice and timesheet for one consultant. It is reviewed against the client invoice hours.' : 'Upload your monthly invoice and timesheet. It is reviewed against the client invoice hours.'} closeHref={close}>
        <SubmitForm people={submitPeople} w2={w2} vendor={vendor} cancelHref={close} />
      </Modal>
    );
  }
  const sel = sp.id ? subs.find((x) => x.id === sp.id) : null;
  if (sel && sp.m === 'resubmit' && sel.status === 'rejected') {
    modal = (
      <Modal title={`Resubmit Rejected ${w2 ? 'Timesheet' : 'Invoice'}`} description={`${sel.ref} · ${pName[sel.person_id]?.full_name} · ${monthLong(sel.period)}`} closeHref={close}>
        <ResubmitForm cancelHref={close} w2={w2} sub={{ id: sel.id, ref: sel.ref, hours: Number(sel.hours), rate: Number(sel.hourly_rate), reason: sel.reject_reason, invoice: sel.invoice_name, timesheet: sel.timesheet_name }} />
      </Modal>
    );
  }
  if (sel && sp.m === 'view') {
    const p = pName[sel.person_id];
    const ci = cis.find((c) => c.person_id === sel.person_id && c.period === sel.period);
    const canChange = vendor && ['in_progress', 'rejected'].includes(sel.status);
    const fileRow = (lbl: string, kind: 'invoice' | 'timesheet') => {
      const name = kind === 'invoice' ? sel.invoice_name : sel.timesheet_name;
      const key = `${kind === 'invoice' ? 'si' : 'st'}-${sel.id}`;
      return [lbl, name ? <FileChip key="f" name={name} /> : <Muted>Not uploaded</Muted>, name ? fmtDate(sel.submitted_at) : '—',
        <div key="a" className="row-actions">{name ? <FileLinks fileKey={key} name={name} /> : null}{canChange ? <ReplaceFile submissionId={sel.id} kind={kind} label={name ? 'Replace' : 'Upload'} /> : null}</div>];
    };
    modal = (
      <Modal title={sel.ref} description={`${p?.full_name}${p?.vendor_id ? ` · ${m.vendor[p.vendor_id]?.name}` : ''} · ${m.client[sel.client_id]?.name} · ${monthLong(sel.period)}.`} closeHref={close}>
        {sel.status === 'rejected' ? <div className="alert alert-danger"><div><div className="alert-title">Rejected by the reviewer</div><div className="alert-text">{sel.reject_reason}</div></div></div> : null}
        <div className="modal-content">
          <DetailCard sections={[{ title: w2 ? 'Timesheet details' : 'Invoice details', items: [
            { label: vendor ? 'Consultant' : 'Resource', value: p?.full_name },
            ...(p?.vendor_id ? [{ label: 'Vendor', value: m.vendor[p.vendor_id]?.name }] : []),
            { label: 'Client', value: m.client[sel.client_id]?.name }, { label: 'Billing period', value: monthLong(sel.period) },
            { label: 'Hours submitted', value: String(Number(sel.hours)) }, { label: 'Client invoice hours', value: ci ? String(Number(ci.hours)) : 'Awaiting client invoice' },
            ...(w2 ? [] : [{ label: 'Hourly rate', value: usd(sel.hourly_rate) }, { label: 'Invoice amount (USD)', value: usd(sel.amount) }]),
            { label: 'Payment term', value: p?.vendor_id ? m.vendor[p.vendor_id]?.payment_term : p?.payment_term || 'Net 10' },
            { label: 'Submitted', value: submitted(sel) }, { label: 'Status', value: <Badge text={shown(sel)} /> }] }]}
            documents={{ title: w2 ? 'Timesheet' : 'Invoice & timesheet', headers: ['Document', 'File', 'Uploaded', 'Actions'],
              rows: [...(w2 ? [] : [fileRow('Invoice', 'invoice')]), fileRow('Timesheet', 'timesheet')] }} />
        </div>
        <div className="form-footer modal-footer"><span /><div className="form-buttons">
          <ModalClose href={close} primary={sel.status !== 'rejected'} />
          {sel.status === 'rejected' ? <Link className="btn btn-primary" href={`${path}?m=resubmit&id=${sel.id}`} scroll={false}>Resubmit {w2 ? 'Timesheet' : 'Invoice'}</Link> : null}
        </div></div>
      </Modal>
    );
  }
  const counts = TABS.map((t, i) => `${t} (${i === 0 ? subs.length : subs.filter((x) => shown(x) === t).length})`);
  return (
    <Page s={s} title={w2 ? 'Timesheets' : 'Invoices'} flash={sp.flash}
      description={w2 ? 'Each timesheet is matched against the client invoice hours.' : vendor ? 'Invoices submitted for your consultants and their review result.' : 'Your submitted invoices and their review result.'}
      actions={<Link className="btn btn-primary" href={`${path}?m=new`} scroll={false}>{w2 ? 'Upload Timesheet' : 'Upload Invoice'}</Link>}>
      <Tabs tabs={counts} active={tab} href={(i) => `${path}?tab=${i}`} />
      <DataTable title={w2 ? 'Submission history' : vendor ? 'Consultant invoices' : 'Invoice history'} total={filtered.length} headers={headers} rows={rows}
        searchText={filtered.map((x) => `${x.ref} ${pName[x.person_id]?.full_name} ${monthLong(x.period)}`)} empty="No submissions in this view." />
      {modal}
    </Page>
  );
}
