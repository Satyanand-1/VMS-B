'use client';
import { useFormAction } from '@/components/useFormAction';
import { ExtraDocs, FormFooter, MultiSelect, Section, Select, Text, UploadRow, DateField } from '@/components/fields';
import { createClientAction, updateClientAction } from '@/lib/actions/clients';
import type { FormState } from '@/lib/actions/auth';

export type ClientFormData = {
  id?: string; name?: string; email?: string; address?: string | null; currency?: string; time_zone?: string; status?: string;
  ams: string[]; msaStart?: string | null; msaEnd?: string | null; msaFile?: { name: string; size?: string } | null;
};

const ZONES = [
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' }
];

export function ClientForm({ mode, data, amOptions, canEditAms, amNames, cancelHref }: {
  mode: 'add' | 'edit'; data: ClientFormData; amOptions: { value: string; label: string; hint?: string }[]; canEditAms: boolean; amNames: string; cancelHref: string;
}) {
  const [state, action, pending] = useFormAction(mode === 'add' ? createClientAction : updateClientAction);
  const fe = state?.fieldErrors;
  return (
    <form className="form-card" onSubmit={action}>
      {data.id ? <input type="hidden" name="id" value={data.id} /> : null}
      <Section title="Client details">
        <Text name="name" label="Client name" value={data.name} required placeholder="Enter client name" errors={fe} />
        <Text name="email" label="Billing email" value={data.email} required placeholder="name@company.com" errors={fe} />
        <Text name="address" label="Address" value={data.address} full placeholder="Street, city, state, ZIP" errors={fe} />
        <Select name="currency" label="Currency" value={data.currency || 'USD'} options={[{ value: 'USD', label: 'USD — US Dollar' }, { value: 'CAD', label: 'CAD — Canadian Dollar' }]} />
        <Select name="time_zone" label="Time zone" value={data.time_zone || 'America/New_York'} options={ZONES} />
        {canEditAms
          ? <MultiSelect name="account_managers" label="Account managers" options={amOptions} selected={data.ams} required errors={fe} placeholder="Select account managers…" />
          : <Text name="am_readonly" label="Account managers" value={amNames} readOnly lock="Assigned by Super Admin" full />}
        {mode === 'edit' ? <Select name="status" label="Status" value={data.status} required options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          note="Inactive clients stay on record but get no new invoices." /> : null}
      </Section>
      <Section title="Master Services Agreement">
        <DateField name="msa__start" label="MSA start date" value={data.msaStart} required errors={fe} />
        <DateField name="msa__end" label="MSA end date" value={data.msaEnd} required errors={fe} />
        <UploadRow name="msa" label="MSA document" existing={data.msaFile} errors={fe} />
        <ExtraDocs />
      </Section>
      <FormFooter cancelHref={cancelHref} submitLabel="Save Client" pending={pending} error={state?.error} />
    </form>
  );
}
