'use client';
// Small action buttons used inside server-rendered lists.
import { useActionState, useEffect } from 'react';
import { useToast } from './client';
import { Badge } from './ui';
import { sendNewPasswordAction } from '@/lib/actions/vendors';
import { remindAction } from '@/lib/actions/documents';
import type { FormState } from '@/lib/actions/auth';

// Remind (expiring / expired) and Request (incomplete): toast on success or failure (DOC-6).
export function RequestButton({ docId, kind }: { docId: string; kind: 'remind' | 'request' }) {
  const [state, action, pending] = useActionState<FormState, FormData>(remindAction, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast({ tone: 'success', title: kind === 'remind' ? 'Reminder sent' : 'Request sent', text: state.ok });
    if (state?.error) toast({ tone: 'error', title: kind === 'remind' ? 'Reminder not sent' : 'Request not sent', text: state.error });
  }, [state, toast, kind]);
  return (
    <form action={action} style={{ display: 'inline' }}>
      <input type="hidden" name="document_id" value={docId} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" className="link-btn doc-notify" disabled={pending}>{kind === 'remind' ? 'Remind' : 'Request'}</button>
    </form>
  );
}

// Sign-in box on Edit Vendor / Edit person with "Send new password" (AUTH-4).
export function PasswordBox({ info }: { info: { accountId: string; email: string; name: string; badge: string; text: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendNewPasswordAction, undefined);
  const sent = !!state?.ok;
  return (
    <div className="pw-status">
      <div className="pw-line">{sent ? <><Badge text="Pending" /> Temporary password sent; not changed yet</> : <><Badge text={info.badge} /> {info.text}</>}</div>
      {sent ? <div className="pw-sent">{state.ok}</div> : null}
      {state?.error ? <div className="field-error">{state.error}</div> : null}
      <div className="pw-meta">Username: <b>{info.email}</b> · passwords expire every 30 days</div>
      <form action={action}>
        <input type="hidden" name="account_id" value={info.accountId} />
        <button type="submit" className="btn btn-secondary btn-sm send-pw" disabled={pending}>{pending ? 'Sending…' : 'Send new password'}</button>
      </form>
    </div>
  );
}
