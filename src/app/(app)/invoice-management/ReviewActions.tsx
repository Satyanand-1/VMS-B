'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { reviewAction, reviewClientInvoiceAction } from '@/lib/actions/invoices';
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
            {state?.fieldErrors?.reason ? <span className="field-error">{state.fieldErrors.reason}</span> : null}
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

// Upload a missing client invoice with its hours, from the Review pop-up (CI-4).
export function ReviewClientInvoice({ personId, period }: { personId: string; period: string }) {
  const [state, action, pending] = useFormAction(reviewClientInvoiceAction);
  return (
    <form onSubmit={action} className="review-ci">
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="period" value={period} />
      <UploadRow name="file" errors={state?.fieldErrors} />
      <div className="field"><label htmlFor="rv-ci-hours">Client billable hours</label><input id="rv-ci-hours" name="hours" className="rv-client-hours" inputMode="decimal" placeholder="Enter hours" />
        {state?.fieldErrors?.hours ? <span className="field-error">{state.fieldErrors.hours}</span> : null}</div>
      {state?.error ? <span className="field-error">{state.error}</span> : null}
      <div className="review-actions"><button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? 'Saving…' : 'Save client invoice'}</button></div>
    </form>
  );
}
