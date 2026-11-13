'use client';
import { useFormAction } from '@/components/useFormAction';
import { useId } from 'react';
import { DateField, ExtraDocs, FormFooter, PaymentTerm, Section, Select, Text, UploadRow, WorkLocation } from './fields';
import { PasswordBox } from './actions-client';
import { createPersonAction, updatePersonAction } from '@/lib/actions/people';

type PType = 'consultant' | 'w2' | 'w1099';
export type PersonFormData = {
  id?: string; full_name?: string; email?: string; phone?: string | null; address?: string | null; ssnMasked?: string;
  role_title?: string | null; client_id?: string | null; hourly_rate?: number | null; start_date?: string | null; end_date?: string | null;
  duration?: string | null; work_location?: string | null; payment_term?: string | null; status?: string; account_manager_id?: string | null;
};
export type EditDoc = { id: string; doc_type: string; uploader_kind: string; no_dates: boolean; valid_from: string | null; valid_to: string | null;
  audit_period: string | null; current: { name: string; size?: string } | null };

const ADD_DOCS: Record<PType, { label: string; field: string; dates: boolean; multiple?: boolean }[]> = {
  consultant: [{ label: 'Resume', field: 'doc_resume', dates: false }, { label: 'I-9', field: 'doc_i9', dates: true }, { label: 'E-Verify document', field: 'doc_everify', dates: true }],
  w2: [{ label: 'Employment contract', field: 'doc_contract', dates: true }, { label: 'W-2 (year end)', field: 'doc_yearend', dates: true }, { label: 'Payslips', field: 'doc_payslips', dates: false, multiple: true }],
  w1099: [{ label: '1099 contract', field: 'doc_contract', dates: true }, { label: '1099 (year end)', field: 'doc_yearend', dates: true }]
};

export function PersonForm({ mode, type, data, vendor, clients, terms, amOptions, canEditAm, amName, docs, signIn, back, cancelHref }: {
  mode: 'add' | 'edit'; type: PType; data: PersonFormData; vendor?: { id: string; name: string; payment_term: string; contact: string } | null;
  clients: { value: string; label: string }[]; terms: string[]; amOptions?: { value: string; label: string }[]; canEditAm?: boolean; amName?: string;
  docs?: EditDoc[]; signIn?: { accountId: string; email: string; name: string; badge: string; text: string } | null; back: string; cancelHref: string;
}) {
  const [state, action, pending] = useFormAction(mode === 'add' ? createPersonAction : updatePersonAction);
  const fe = state?.fieldErrors;
  const formId = useId();
  const consultant = type === 'consultant';
  const docTitle = consultant ? 'Documents' : `${type === 'w2' ? 'W-2' : '1099'} documents uploaded by the account manager`;
  const clientOptions = consultant ? [{ value: '', label: 'Not mapped' }, ...clients] : [{ value: '', label: 'Select client…' }, ...clients];
  return (
    <div className="form-card">
      <form id={formId} onSubmit={action}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="back" value={back} />
        {data.id ? <input type="hidden" name="id" value={data.id} /> : null}
        {vendor ? <input type="hidden" name="vendor_id" value={vendor.id} /> : null}
        {consultant ? (
          <Section title={mode === 'add' ? 'Consultant & assignment' : 'Personal details'}>
            {vendor ? <Text name="vendor_name" label="Vendor" value={vendor.name} readOnly lock="Selected" /> : null}
            <Text name="full_name" label="Consultant name" value={data.full_name} required errors={fe} />
            <Text name="email" label="Email (username)" value={data.email} required errors={fe} note="Sign-in username. Login details are sent to this address." />
            <Text name="phone" label="Phone" value={data.phone} errors={fe} />
            {mode === 'edit' && vendor ? <Text name="vendor_contact" label="Vendor contact" value={vendor.contact} readOnly lock="From vendor" /> : null}
          </Section>
        ) : (
          <Section title="Personal details">
            <Text name="full_name" label="Full name" value={data.full_name} required errors={fe} />
            <Text name="ssn" label="SSN" value="" required={mode === 'add'} errors={fe} placeholder={mode === 'edit' ? `${data.ssnMasked} — enter to change` : '123-45-6789'} />
            <Text name="email" label="Email (username)" value={data.email} required errors={fe} note="Sign-in username. Login details are sent to this address." />
            <Text name="phone" label="Phone" value={data.phone} errors={fe} />
            <Text name="address" label="Address" value={data.address} full errors={fe} />
          </Section>
        )}
        <Section title="Assignment">
          <Select name="client_id" label="Client" value={data.client_id || ''} options={clientOptions} required={!consultant} errors={fe} />
          <Text name="role_title" label="Role" value={data.role_title} required errors={fe} />
          <Text name="hourly_rate" label="Hourly rate (USD)" value={data.hourly_rate ?? ''} required errors={fe} />
          <WorkLocation value={data.work_location} errors={fe} />
          <DateField name="start_date" label="Start date" value={data.start_date} errors={fe} />
          <DateField name="end_date" label="End date" value={data.end_date} errors={fe} />
          {consultant
            ? <Text name="payment_term_ro" label="Payment term" value={vendor?.payment_term || data.payment_term} readOnly lock="From vendor · set by account manager" />
            : <PaymentTerm terms={terms} value={data.payment_term} errors={fe} />}
          <Text name="duration" label="Duration" value={data.duration} placeholder="e.g. 12 months" errors={fe} />
          {mode === 'edit' ? (
            <>
              {canEditAm && amOptions ? <Select name="account_manager_id" label="Account manager" value={data.account_manager_id} options={amOptions} />
                : <Text name="am_ro" label="Account manager" value={amName} readOnly lock="Assigned by Super Admin" />}
              <Select name="status" label="Status" value={data.status} options={[{ value: 'active', label: 'Active' }, { value: 'onboarding', label: 'Onboarding' }, { value: 'inactive', label: 'Inactive' }, { value: 'ended', label: 'Ended' }]} />
            </>
          ) : null}
        </Section>
        <Section title={docTitle} hint={mode === 'add'
          ? (consultant ? 'PDF, DOCX, JPG or PNG · max 5 MB each. Enter a start and end date for each document except the resume (it has no dates). Missing documents can be added later; the audit report (a separate document from the I-9) is added later, for each 3- or 6-month period.'
            : 'Every document except ACH, audit report and payslips has a start and end date. Anything not uploaded now is marked Incomplete in the Document Tracker.')
          : 'Upload a file to add a new version; earlier versions stay in history. Documents the resource uploads can only be viewed here.'}>
          {mode === 'add' ? (
            <>
              {ADD_DOCS[type].map((d) => <UploadRow key={d.field} name={d.field} label={d.label} dates={d.dates ? {} : false} multiple={d.multiple} errors={fe} />)}
              {consultant ? <UploadRow name="doc_audit" label="Audit report" auditPeriod errors={fe} />
                : <UploadRow name="doc_audit" label="Audit report" locked="Uploaded later by the account manager, not during onboarding. A new report is uploaded for each 3- or 6-month period; only the latest is shown." />}
            </>
          ) : (docs || []).map((d) => {
            const self = d.uploader_kind !== 'staff';
            return <UploadRow key={d.id} name={`doc_${d.id}`} label={d.doc_type} existing={d.current} errors={fe}
              locked={self ? 'Uploaded by the resource.' : undefined}
              auditPeriod={!self && d.doc_type === 'Audit report'}
              note={d.audit_period ? `Latest report · covers ${d.audit_period}` : undefined}
              dates={!self && !d.no_dates && d.doc_type !== 'Audit report' ? { start: d.valid_from, end: d.valid_to } : false} />;
          })}
          <ExtraDocs />
          {fe?.extra ? <span className="field-error">{fe.extra}</span> : null}
        </Section>
      </form>
      {mode === 'add' ? (
        <div className="form-section"><div className="section-head"><div className="section-title">Sign-in</div>
          <div className="section-hint">On save, the {consultant ? 'consultant' : 'resource'} gets an email with their username (the email above) and a temporary password. They must set a new password at first sign-in. Passwords expire every 30 days.</div></div></div>
      ) : signIn ? (
        <div className="form-section"><div className="section-head"><div className="section-title">Sign-in</div></div><div className="form-grid"><div className="field full"><PasswordBox info={signIn} /></div></div></div>
      ) : null}
      <FormFooter formId={formId} cancelHref={cancelHref} submitLabel={mode === 'add' ? 'Save & Send Login Details' : 'Save Changes'} pending={pending} error={state?.error} />
    </div>
  );
}
