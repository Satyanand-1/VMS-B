'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState, type ReactNode } from 'react';
import { DataTable } from '@/components/client';
import { FileChip } from '@/components/ui';
import { fileProblem } from '@/components/fields';
import { saveClientInvoicesAction } from '@/lib/actions/clients';

export type CiRow = { personId: string; cells: ReactNode[]; uploaded: boolean; fileCell?: ReactNode; hours?: string; search: string };

// The Clients page list: for each Not Uploaded person, choose the client invoice and type its hours; one Save for all (CL-3).
export function ClientInvoicesTable({ title, chip, headers, rows, period, back, editable }: {
  title: string; chip: string; headers: string[]; rows: CiRow[]; period: string; back: string; editable: boolean;
}) {
  const [state, action, pending] = useFormAction(saveClientInvoicesAction);
  const missing = rows.filter((r) => !r.uploaded).length;
  // Columns: person [, client], Client Invoice, Client Billable Hours, Status
  const built = rows.map((r) => {
    const err = state?.fieldErrors?.[r.personId];
    const [person, ...rest] = r.cells;
    const status = rest.pop();
    return [
      person, ...rest,
      r.uploaded ? r.fileCell : editable ? <CellUpload name={`file_${r.personId}`} error={err} /> : <span className="person-sub inline">Not uploaded</span>,
      r.uploaded ? r.hours : editable ? <input className="cell-input ci-h" name={`hours_${r.personId}`} inputMode="decimal" placeholder="0" aria-label="Client billable hours" /> : '—',
      status
    ];
  });
  return (
    <form onSubmit={action}>
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="back" value={back} />
      {state?.error ? <div className="alert alert-danger form-error-banner"><div><div className="alert-title">{state.error}</div></div></div> : null}
      <DataTable title={title} chip={chip} headers={headers} rows={built} searchText={rows.map((r) => r.search)} noSearch empty="No one matches these filters." />
      {missing && editable ? (
        <div className="review-actions"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save client invoices'}</button></div>
      ) : null}
    </form>
  );
}

function CellUpload({ name, error }: { name: string; error?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  return (
    <span className="cell-upload-wrap">
      {file ? <div className="doc-cell"><FileChip name={file.name} /></div> : null}
      <label className="upload-mini ci-up" style={{ display: file ? 'none' : undefined }}>
        Upload
        <input type="file" name={name} accept=".pdf,.docx,.jpg,.jpeg,.png" hidden onChange={(e) => {
          const f = e.target.files?.[0] || null;
          const p = f ? fileProblem(f) : '';
          if (p) { setErr(p); e.target.value = ''; setFile(null); } else { setErr(''); setFile(f); }
        }} />
      </label>
      {err || error ? <span className="field-error">{err || error}</span> : null}
    </span>
  );
}
