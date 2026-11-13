'use client';
import { useFormAction } from '@/components/useFormAction';
import { FormFooter, Section, Text } from '@/components/fields';
import { updateCompanyProfileAction } from '@/lib/actions/vendors';

export function ProfileForm({ v, amName }: { v: { name: string; email: string; einMasked: string; address: string | null; phone: string | null; signatory_name: string | null; signatory_phone: string | null; payment_term: string; state: string | null }; amName: string }) {
  const [state, action, pending] = useFormAction(updateCompanyProfileAction);
  const fe = state?.fieldErrors;
  return (
    <form className="form-card" onSubmit={action}>
      <Section title="Company">
        <Text name="name" label="Company name" value={v.name} readOnly lock="Admin-managed" />
        <Text name="email" label="Email (username)" value={v.email} readOnly lock="Admin-managed" />
        <Text name="ein" label="Federal ID (EIN)" value={v.einMasked} readOnly lock="Admin-managed" />
        <Text name="state" label="State of incorporation" value={v.state} readOnly lock="Admin-managed" />
        <Text name="address" label="Address" value={v.address} required full errors={fe} />
        <Text name="phone" label="Phone" value={v.phone} required errors={fe} />
        <Text name="payment_term" label="Payment term" value={v.payment_term} readOnly lock="Set by account manager" />
        <Text name="am" label="Account manager" value={amName} readOnly lock="Assigned" />
      </Section>
      <Section title="Authorized signatory">
        <Text name="signatory_name" label="Name" value={v.signatory_name} required errors={fe} />
        <Text name="signatory_phone" label="Phone" value={v.signatory_phone} errors={fe} />
      </Section>
      <FormFooter submitLabel="Save Changes" pending={pending} error={state?.error} />
    </form>
  );
}
