'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { UploadRow } from '@/components/fields';
import { uploadOwnDocumentAction } from '@/lib/actions/documents';

// Upload or Replace one of your own documents (W-9, COI, ACH / W-4, I-9 …) with its dates.
export function OwnUpload({ docId, docType, hasFile, noDates }: { docId: string; docType: string; hasFile: boolean; noDates: boolean }) {
  const [state, action, pending] = useFormAction(uploadOwnDocumentAction);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)}>{hasFile ? 'Replace' : 'Upload'}</button>;
  return (
    <form onSubmit={action} className="replace-form">
      <input type="hidden" name="document_id" value={docId} />
      <UploadRow name="file" label={docType} dates={noDates ? false : {}} />
      {state?.error ? <span className="field-error">{state.error}</span> : null}
      <div className="row-actions"><button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</button></div>
    </form>
  );
}
