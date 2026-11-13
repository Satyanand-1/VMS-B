'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { FormFooter, Section, UploadRow } from './fields';
import { resubmitAction, submitAction } from '@/lib/actions/invoices';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type SubmitPerson = { id: string; name: string; client: string; rate: number; term: string; openPeriods: { value: string; label: string }[] };

// Upload Invoice (vendor per consultant, 1099) / Upload Timesheet (W-2). Only months not yet submitted are offered (INV-8).
export function SubmitForm({ people, w2, vendor, cancelHref }: { people: SubmitPerson[]; w2: boolean; vendor: boolean; cancelHref: string }) {
  const [state, action, pending] = useFormAction(submitAction);
  const [pid, setPid] = useState(people[0]?.id || '');
  const [hours, setHours] = useState('');
  const p = people.find((x) => x.id === pid);
  const fe = state?.fieldErrors;
  const h = Number(hours);
  if (!people.length) return <div className="modal-content"><div className="review-missing">No active consultant is mapped to a client yet. Contact your account manager.</div></div>;
  return (
    <form className="form-card" onSubmit={action}>
      <Section title={w2 ? 'Timesheet' : 'Invoice'}>
        {vendor ? (
          <div className="field"><label htmlFor="f-person">Consultant<span className="req">*</span></label>
            <select id="f-person" name="person_id" value={pid} onChange={(e) => setPid(e.target.value)}>
              {people.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.client}</option>)}
            </select>{fe?.person_id ? <span className="field-error">{fe.person_id}</span> : null}</div>
        ) : null}
        <div className="field"><label htmlFor="f-period">Billing period<span className="req">*</span></label>
          {p && p.openPeriods.length ? (
            <select id="f-period" name="period" key={pid}>{p.openPeriods.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          ) : <input className="readonly" readOnly value="All recent months are already submitted" />}
          {fe?.period ? <span className="field-error">{fe.period}</span> : null}</div>
        <div className="field"><label htmlFor="f-hours">{w2 ? 'Total hours' : 'Total billed hours'}<span className="req">*</span></label>
          <input id="f-hours" name="hours" inputMode="decimal" placeholder="e.g. 160" value={hours} onChange={(e) => setHours(e.target.value)} />
          {fe?.hours ? <span className="field-error">{fe.hours}</span> : null}</div>
        {!w2 ? (
          <>
            <div className="field"><label>Hourly rate<span className="lock">From assignment</span></label><input className="readonly" readOnly value={p ? money(p.rate) : ''} /></div>
            <div className="field"><label>Invoice amount (USD)<span className="lock">Auto-calculated</span></label><input className="readonly" readOnly value={p ? money(h > 0 ? round(h * p.rate) : 0) : ''} /></div>
          </>
        ) : null}
        <div className="field"><label>Payment term<span className="lock">From assignment</span></label><input className="readonly" readOnly value={p?.term || ''} /></div>
      </Section>
      <Section title="Attachments" hint="PDF, DOCX, JPG, JPEG or PNG · max 5 MB per file.">
        {!w2 ? <UploadRow name="invoice" label="Invoice" errors={fe} /> : null}
        <UploadRow name="timesheet" label="Timesheet" errors={fe} />
      </Section>
      <FormFooter cancelHref={cancelHref} submitLabel={w2 ? 'Upload Timesheet' : 'Upload Invoice'} pending={pending} error={state?.error} />
    </form>
  );
}

// Resubmit a rejected invoice / timesheet with corrected hours and files (REC-6).
export function ResubmitForm({ sub, w2, cancelHref }: { sub: { id: string; ref: string; hours: number; rate: number; reason: string | null; invoice: string | null; timesheet: string | null }; w2: boolean; cancelHref: string }) {
  const [state, action, pending] = useFormAction(resubmitAction);
  const [hours, setHours] = useState(String(sub.hours));
  const fe = state?.fieldErrors;
  return (
    <form className="form-card" onSubmit={action}>
      <input type="hidden" name="submission_id" value={sub.id} />
      <input type="hidden" name="mode" value="resubmit" />
      {sub.reason ? <div className="form-section"><div className="review-reason"><b>Rejection reason:</b> {sub.reason}</div></div> : null}
      <Section title={`Corrected ${w2 ? 'timesheet' : 'invoice'} · ${sub.ref}`}>
        <div className="field"><label htmlFor="f-hours">{w2 ? 'Total hours' : 'Total billed hours'}<span className="req">*</span></label>
          <input id="f-hours" name="hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          {fe?.hours ? <span className="field-error">{fe.hours}</span> : null}</div>
        {!w2 ? <div className="field"><label>Invoice amount (USD)<span className="lock">Auto-calculated</span></label><input className="readonly" readOnly value={money(Number(hours) > 0 ? round(Number(hours) * sub.rate) : 0)} /></div> : null}
      </Section>
      <Section title="Attachments" hint="Upload the corrected files. A file you don’t replace is kept from the rejected version.">
        {!w2 ? <UploadRow name="invoice" label="Invoice" note={sub.invoice ? `Rejected version: ${sub.invoice}` : undefined} errors={fe} /> : null}
        <UploadRow name="timesheet" label="Timesheet" note={sub.timesheet ? `Rejected version: ${sub.timesheet}` : undefined} errors={fe} />
      </Section>
      <FormFooter cancelHref={cancelHref} submitLabel="Resubmit" pending={pending} error={state?.error} />
    </form>
  );
}

// Replace (or upload a missing) invoice / timesheet file while In Progress or Rejected (INV-12).
export function ReplaceFile({ submissionId, kind, label }: { submissionId: string; kind: 'invoice' | 'timesheet'; label: string }) {
  const [state, action, pending] = useFormAction(resubmitAction);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <form onSubmit={action} className="replace-form">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="mode" value="replace" />
      <UploadRow name={kind} errors={state?.fieldErrors} />
      {state?.error ? <span className="field-error">{state.error}</span> : null}
      <div className="row-actions"><button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</button></div>
    </form>
  );
}
