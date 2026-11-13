'use client';
import { useActionState, useEffect, useId } from 'react';
import { useFormAction } from '@/components/useFormAction';
import { useToast } from '@/components/client';
import { PasswordBox } from '@/components/actions-client';
import { FormFooter, MultiSelect, PasswordChoice, Section, Select, Text } from '@/components/fields';
import { createAmAction, deleteAmAction, resendInviteAction, updateAmAction } from '@/lib/actions/admin';
import type { FormState } from '@/lib/actions/auth';

export function AmForm({ mode, data, clientOptions, cancelHref, signIn }: {
  mode: 'add' | 'edit'; data: { id?: string; full_name?: string; email?: string; phone?: string | null; status?: string; clients: string[] };
  clientOptions: { value: string; label: string; hint?: string }[]; cancelHref: string;
  signIn?: { accountId: string; email: string; name: string; badge: string; text: string } | null;
}) {
  const [state, action, pending] = useFormAction(mode === 'add' ? createAmAction : updateAmAction);
  const fe = state?.fieldErrors;
  const formId = useId();
  return (
    <div className="form-card">
      <form id={formId} onSubmit={action}>
        {data.id ? <input type="hidden" name="id" value={data.id} /> : null}
        <Section title="Account manager">
          <Text name="full_name" label="Full name" value={data.full_name} required errors={fe} />
          <Text name="email" label="Work email (username)" value={data.email} required errors={fe} note={mode === 'add' ? 'Sign-in username. Login details are sent to this address.' : undefined} />
          <Text name="phone" label="Phone" value={data.phone} errors={fe} />
          <Text name="role" label="Role" value="Account Manager" readOnly lock="Fixed" />
          {mode === 'edit' ? <Select name="status" label="Status" value={data.status} options={[{ value: 'active', label: 'Active' }, { value: 'invited', label: 'Invited' }, { value: 'inactive', label: 'Inactive' }]}
            note="An Inactive account manager cannot sign in." /> : null}
          {clientOptions.length || mode === 'edit'
            ? <MultiSelect name="clients" label="Clients" options={clientOptions} selected={data.clients} required={mode === 'edit' && data.clients.length > 0} errors={fe} placeholder="Select clients…" />
            : <Text name="clients_none" label="Clients" value="No clients yet — assign this account manager when you add a client" readOnly lock="Later" full />}
        </Section>
        {mode === 'add' ? <Section title="Sign-in" hint="The username is the work email above."><PasswordChoice errors={fe} /></Section> : null}
      </form>
      {mode === 'edit' && signIn ? (
        <div className="form-section"><div className="section-head"><div className="section-title">Sign-in</div></div><div className="form-grid"><div className="field full"><PasswordBox info={signIn} staff /></div></div></div>
      ) : null}
      <FormFooter formId={formId} cancelHref={cancelHref} submitLabel={mode === 'add' ? 'Save & Send Login Details' : 'Save Changes'} pending={pending} error={state?.error} />
    </div>
  );
}

export function DeleteAmForm({ id, name, hasWork, targets, cancelHref }: { id: string; name: string; hasWork: boolean; targets: { value: string; label: string }[]; cancelHref: string }) {
  const [state, action, pending] = useFormAction(deleteAmAction);
  return (
    <form className="form-card" onSubmit={action}>
      <input type="hidden" name="id" value={id} />
      <Section title="Delete account manager" hint={hasWork ? `${name} still has clients or vendors. Choose an Active account manager to take them over; this happens in the same step.` : `${name} has no clients or vendors. This cannot be undone.`}>
        {hasWork ? <Select name="reassign_to" label="Reassign to" required options={[{ value: '', label: 'Select account manager…' }, ...targets]} errors={state?.fieldErrors} /> : null}
      </Section>
      <FormFooter cancelHref={cancelHref} submitLabel="Delete" pending={pending} error={state?.error} />
    </form>
  );
}

export function ResendInvite({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendInviteAction, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast({ tone: 'success', title: 'Invite sent', text: state.ok });
    if (state?.error) toast({ tone: 'error', title: 'Invite not sent', text: state.error });
  }, [state, toast]);
  return (
    <form action={action} style={{ display: 'inline' }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="link-btn" disabled={pending}>Resend invite</button>
    </form>
  );
}
