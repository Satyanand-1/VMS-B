'use client';
import { useFormAction } from '@/components/useFormAction';
import { useRef, useState } from 'react';
import { DateInput, fileProblem } from '@/components/fields';
import { FileChip } from '@/components/ui';
import { uploadOwnDocumentAction } from '@/lib/actions/documents';

// Upload or Replace one of your own documents (W-9, COI, ACH / W-4, I-9 …).
// The button opens the file picker straight away; then the dates (pre-filled from the current version) and Upload appear.
export function OwnUpload({ docId, docType, hasFile, noDates, start, end }: { docId: string; docType: string; hasFile: boolean; noDates: boolean; start?: string | null; end?: string | null }) {
  const [state, action, pending] = useFormAction(uploadOwnDocumentAction);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [from, setFrom] = useState(start || '');
  const input = useRef<HTMLInputElement>(null);
  const cancel = () => { setFile(null); setErr(''); if (input.current) input.current.value = ''; };
  return (
    <form onSubmit={action} className={file ? 'replace-form' : 'replace-inline'}>
      <input type="hidden" name="document_id" value={docId} />
      <input ref={input} type="file" name="file" accept=".pdf,.docx,.jpg,.jpeg,.png" hidden onChange={(e) => {
        const f = e.target.files?.[0] || null;
        const p = f ? fileProblem(f) : '';
        if (p) { setErr(p); e.target.value = ''; setFile(null); } else { setErr(''); setFile(f); }
      }} />
      {!file ? (
        <>
          <button type="button" className="link-btn" onClick={() => input.current?.click()}>{hasFile ? 'Replace' : 'Upload'}</button>
          {err ? <span className="field-error">{err}</span> : null}
        </>
      ) : (
        <div className="field doc-field has-dates">
          <div className="doc-name"><label>{docType}</label></div>
          <div className="doc-file"><div className="upload-done"><FileChip name={file.name} /><button type="button" className="link-btn" onClick={() => input.current?.click()}>Change</button></div></div>
          {noDates ? null : (
            <div className="doc-dates"><div className="validity-row">
              <div className="validity-cell"><span className="expiry-label">Start date</span><DateInput name="file__start" value={start} onChange={setFrom} label="Start date" /></div>
              <div className="validity-cell"><span className="expiry-label">End date</span><DateInput name="file__end" value={end} min={from || null} label="End date" /></div>
            </div></div>
          )}
          {state?.error || err ? <span className="field-error">{state?.error || err}</span> : null}
          <div className="row-actions"><button type="button" className="link-btn" onClick={cancel}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</button></div>
        </div>
      )}
    </form>
  );
}
