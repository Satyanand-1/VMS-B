'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { cancelApprovalAction, reviewAction, reviewClientInvoiceAction, updateClientInvoiceAction } from '@/lib/actions/invoices';
import { UploadRow } from '@/components/fields';

// Approve / Reject (reason required) — shown only when both documents are in (CI-5).
export function ReviewActions({ submissionId, back }: { submissionId: string; back: string }) {
  const [state, action, pending] = useFormAction(reviewAction);
  const [rejecting, setRejecting] = useState(false);
  return (
    <form onSubmit={action}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="back" value={back} />
      {state?.error ? <div className="review-match bad">{state.error}</div> : null}
      {!rejecting ? (
        <div className="review-actions">
          <button type="button" className="btn btn-reject" onClick={() => setRejecting(true)}>Reject</button>
          <button type="submit" name="decision" value="approve" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Approve'}</button>
        </div>
      ) : (
        <div className="review-reject">
          <div className="field">
            <label htmlFor="rv-reason">Reason for rejection<span className="req">*</span></label>
            <textarea id="rv-reason" name="reason" className="rv-reason" placeholder="Explain what must be corrected" />
            {state?.fieldErrors?.reason ? <span className="field-error srv">{state.fieldErrors.reason}</span> : null}
          </div>
          <div className="review-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>Cancel</button>
            <button type="submit" name="decision" value="reject" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Submit rejection'}</button>
          </div>
        </div>
      )}
    </form>
  );
}

// Cancel Approval with a reason (allowed until 2 days before the payment is due; the server checks it again).
export function CancelApproval({ submissionId, back, lastDay }: { submissionId: string; back: string; lastDay: string }) {
  const [state, action, pending] = useFormAction(cancelApprovalAction);
  const [open, setOpen] = useState(false);
  if (!open) return (
    <div className="review-actions"><span className="person-sub inline">Can be cancelled until {lastDay}.</span>
      <button type="button" className="btn btn-reject" onClick={() => setOpen(true)}>Cancel Approval</button></div>
  );
  return (
    <form onSubmit={action} className="review-reject">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="back" value={back} />
      {state?.error ? <div className="review-match bad">{state.error}</div> : null}
      <div className="field">
        <label htmlFor="ca-reason">Reason for cancelling the approval<span className="req">*</span></label>
        <textarea id="ca-reason" name="reason" className="rv-reason" placeholder="Why the approval is cancelled" />
        {state?.fieldErrors?.reason ? <span className="field-error srv">{state.fieldErrors.reason}</span> : null}
      </div>
      <div className="review-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Keep approval</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Cancel Approval'}</button>
      </div>
    </form>
  );
}

// Correct the client invoice (billable hours and/or a new file) before approving or rejecting; not once approved.
export function EditClientInvoice({ ciId, hours, back }: { ciId: string; hours: number; back: string }) {
  const [state, action, pending] = useFormAction(updateClientInvoiceAction);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-btn ci-edit-link" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <form onSubmit={action} className="review-ci ci-edit">
      <input type="hidden" name="client_invoice_id" value={ciId} />
      <input type="hidden" name="back" value={back} />
      <div className="field"><label htmlFor="ci-edit-hours">Client billable hours<span className="req">*</span></label>
        <input id="ci-edit-hours" name="hours" inputMode="decimal" defaultValue={hours} />
        {state?.fieldErrors?.hours ? <span className="field-error srv">{state.fieldErrors.hours}</span> : null}</div>
      <UploadRow name="file" label="New client invoice file (optional)" errors={state?.fieldErrors} />
      {state?.error ? <span className="field-error">{state.error}</span> : null}
      <div className="review-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save client invoice'}</button>
      </div>
    </form>
  );
}

// Upload a missing client invoice with its hours, from the Review pop-up (CI-4).
export function ReviewClientInvoice({ personId, period }: { personId: string; period: string }) {
  const [state, action, pending] = useFormAction(reviewClientInvoiceAction);
  return (
    <form onSubmit={action} className="review-ci">
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="period" value={period} />
      <UploadRow name="file" errors={state?.fieldErrors} />
      <div className="field"><label htmlFor="rv-ci-hours">Client billable hours<span className="req">*</span></label><input id="rv-ci-hours" name="hours" className="rv-client-hours" inputMode="decimal" placeholder="Enter hours" />
        {state?.fieldErrors?.hours ? <span className="field-error srv">{state.fieldErrors.hours}</span> : null}</div>
      {state?.error ? <span className="field-error srv">{state.error}</span> : null}
      <div className="review-actions"><button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? 'Saving…' : 'Save client invoice'}</button></div>
    </form>
  );
}
