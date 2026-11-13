'use client';
// Small action buttons used inside server-rendered lists.
import { useActionState, useEffect, useState } from 'react';
import { useToast } from './client';
import { Badge } from './ui';
import { PasswordChoice } from './fields';
import { useFormAction } from './useFormAction';
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

// Sign-in box on Edit Vendor / Edit person / Edit Account Manager with "Send new password" (AUTH-4):
// the sender generates a password or types one; it is emailed and must be changed at the next sign-in.
export function PasswordBox({ info, staff }: { info: { accountId: string; email: string; name: string; badge: string; text: string }; staff?: boolean }) {
  const [state, action, pending] = useFormAction(sendNewPasswordAction);
  const [open, setOpen] = useState(false);
  const sent = !!state?.ok;
  return (
    <div className="pw-status">
      <div className="pw-line">{sent ? <><Badge text="Pending" /> New password set; not changed by the user yet</> : <><Badge text={info.badge} /> {info.text}</>}</div>
      {sent ? <div className="pw-sent">{state.ok}</div> : null}
      {state?.error ? <div className="field-error">{state.error}</div> : null}
      <div className="pw-meta">Username: <b>{info.email}</b>{staff ? '' : ' · passwords expire every 30 days'}</div>
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm send-pw" onClick={() => setOpen(true)}>Send new password</button>
      ) : (
        <form onSubmit={action}>
          <input type="hidden" name="account_id" value={info.accountId} />
          <PasswordChoice compact />
          <div className="row-actions">
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Sending…' : 'Send new password'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
