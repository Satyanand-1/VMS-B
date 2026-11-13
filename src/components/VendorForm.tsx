'use client';
import { useActionState, useId } from 'react';
import { ExtraDocs, FormFooter, PaymentTerm, Section, Select, Text, UploadRow } from './fields';
import { PasswordBox } from './actions-client';
import { createVendorAction, updateVendorAction } from '@/lib/actions/vendors';
import type { FormState } from '@/lib/actions/auth';

const STATES = ['Alabama', 'Arizona', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Illinois', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'New Jersey', 'New York', 'North Carolina', 'Ohio', 'Oregon', 'Pennsylvania', 'Texas', 'Virginia', 'Washington'];

export type VendorFormData = {
  id?: string; name?: string; address?: string | null; email?: string; einMasked?: string; phone?: string | null; state_of_incorporation?: string | null;
  signatory_name?: string | null; signatory_phone?: string | null; payment_term?: string; account_manager_id?: string; status?: string;
  msa?: { start: string | null; end: string | null; file: { name: string; size?: string } | null };
  po?: { start: string | null; end: string | null; file: { name: string; size?: string } | null };
};

export function VendorForm({ mode, data, terms, amOptions, canPickAm, amName, signIn, cancelHref }: {
  mode: 'add' | 'edit'; data: VendorFormData; terms: string[]; amOptions: { value: string; label: string }[]; canPickAm: boolean; amName: string;
  signIn?: { accountId: string; email: string; name: string; badge: string; text: string } | null; cancelHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === 'add' ? createVendorAction : updateVendorAction, undefined);
  const fe = state?.fieldErrors;
  const formId = useId();
  const add = mode === 'add';
  return (
    <div className="form-card">
      <form id={formId} action={action}>
        {data.id ? <input type="hidden" name="id" value={data.id} /> : null}
        <Section title={add ? 'Vendor details' : 'Company'}>
          <Text name="name" label="Name" value={data.name} required={add} readOnly={!add} lock="Admin-managed" errors={fe} />
          <Text name="address" label="Address" value={data.address} required full errors={fe} />
          <Text name="email" label="Email (username)" value={data.email} required={add} readOnly={!add} lock="Admin-managed" errors={fe} note={add ? 'Sign-in username. Login details are sent to this address.' : undefined} />
          <Text name="ein" label="Federal ID (EIN)" value={add ? '' : data.einMasked} required={add} readOnly={!add} lock="Admin-managed" placeholder="12-3456789" errors={fe} />
          <Text name="phone" label="Phone" value={data.phone} required errors={fe} />
          <Select name="state_of_incorporation" label="State of incorporation" value={data.state_of_incorporation || ''} required errors={fe}
            options={[{ value: '', label: 'Select state…' }, ...STATES.map((s) => ({ value: s, label: s }))]} />
          <Text name="signatory_name" label="Authorized signatory name" value={data.signatory_name} required errors={fe} />
          {!add ? <Text name="signatory_phone" label="Authorized signatory phone" value={data.signatory_phone} errors={fe} /> : null}
          {canPickAm ? <Select name="account_manager_id" label="Account manager" value={data.account_manager_id} required options={amOptions} errors={fe} />
            : <Text name="am_ro" label="Account manager" value={amName} readOnly lock={add ? 'Assigned to you' : 'Assigned by Super Admin'} />}
          <PaymentTerm terms={terms} value={data.payment_term} errors={fe} />
          {!add ? <Select name="status" label="Status" value={data.status} options={[{ value: 'active', label: 'Active' }, { value: 'onboarding', label: 'Onboarding' }, { value: 'inactive', label: 'Inactive' }]} /> : null}
        </Section>
        <Section title="Documents uploaded by the account manager" hint="PDF, DOCX, JPG or PNG · max 5 MB. Enter the start and end date of each. Documents not uploaded now are marked Incomplete in the Document Tracker.">
          <UploadRow name="msa" label="MSA" existing={data.msa?.file} dates={{ start: data.msa?.start, end: data.msa?.end }} errors={fe} />
          <UploadRow name="po" label="PO" existing={data.po?.file} dates={{ start: data.po?.start, end: data.po?.end }} errors={fe} />
          <ExtraDocs />
          {fe?.extra ? <span className="field-error">{fe.extra}</span> : null}
        </Section>
      </form>
      {add ? (
        <div className="form-section"><div className="section-head"><div className="section-title">Sign-in</div>
          <div className="section-hint">On save, the vendor gets an email with their username (the email above) and a temporary password. They must set a new password at first sign-in. Passwords expire every 30 days.</div></div></div>
      ) : signIn ? (
        <div className="form-section"><div className="section-head"><div className="section-title">Sign-in</div></div><div className="form-grid"><div className="field full"><PasswordBox info={signIn} /></div></div></div>
      ) : null}
      <FormFooter formId={formId} cancelHref={cancelHref} submitLabel={add ? 'Save & Send Login Details' : 'Save Changes'} pending={pending} error={state?.error} />
    </div>
  );
}
