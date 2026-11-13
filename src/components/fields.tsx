'use client';
// Form building blocks with the prototype's markup (form-card / form-section / field / doc-field …).
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileChip } from './ui';

const UPLOAD_ICON = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>;
const TYPES = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];
const MAX = 5 * 1024 * 1024;
export const fileProblem = (f: File) => (!TYPES.includes(f.name.split('.').pop()?.toLowerCase() || '') ? 'Only PDF, DOCX, JPG, JPEG or PNG.' : f.size > MAX ? 'Max 5 MB per file.' : '');
const fmtSize = (b: number) => (b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export type Errors = Record<string, string> | undefined;

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-section">
      <div className="section-head">
        <div className="section-title">{title}</div>
        {hint ? <div className="section-hint">{hint}</div> : null}
      </div>
      <div className="form-grid">{children}</div>
    </div>
  );
}

export function Field({ label, required, lock, note, full, error, children, htmlFor }: {
  label?: string; required?: boolean; lock?: string; note?: ReactNode; full?: boolean; error?: string; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label ? <label htmlFor={htmlFor}>{label}{required ? <span className="req">*</span> : null}{lock ? <span className="lock">{lock}</span> : null}</label> : null}
      {children}
      {note ? <span className="person-sub">{note}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function Text({ name, label, value, required, readOnly, lock, note, full, placeholder, type = 'text', errors, autoComplete }: {
  name: string; label: string; value?: string | number | null; required?: boolean; readOnly?: boolean; lock?: string; note?: ReactNode; full?: boolean;
  placeholder?: string; type?: string; errors?: Errors; autoComplete?: string;
}) {
  return (
    <Field label={label} required={required} lock={readOnly ? lock || 'Auto-filled' : undefined} note={note} full={full} error={errors?.[name]} htmlFor={`f-${name}`}>
      <input id={`f-${name}`} name={name} type={type} defaultValue={value ?? ''} readOnly={readOnly} className={readOnly ? 'readonly' : undefined} placeholder={placeholder} autoComplete={autoComplete} />
    </Field>
  );
}

export function Select({ name, label, options, value, required, full, errors, note }: {
  name: string; label: string; options: (string | { value: string; label: string })[]; value?: string | null; required?: boolean; full?: boolean; errors?: Errors; note?: ReactNode;
}) {
  return (
    <Field label={label} required={required} full={full} error={errors?.[name]} note={note} htmlFor={`f-${name}`}>
      <select id={`f-${name}`} name={name} defaultValue={value ?? undefined}>
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function DateField({ name, label, value, required, errors }: { name: string; label: string; value?: string | null; required?: boolean; errors?: Errors }) {
  return (
    <Field label={label} required={required} error={errors?.[name]} htmlFor={`f-${name}`}>
      <input id={`f-${name}`} type="date" name={name} defaultValue={value ?? ''} />
    </Field>
  );
}

// Payment term with "Custom": the user types Net + days (TM-10); the server saves it for later drop-downs.
export function PaymentTerm({ name = 'payment_term', terms, value, errors, readOnly, lock }: { name?: string; terms: string[]; value?: string | null; errors?: Errors; readOnly?: boolean; lock?: string }) {
  const [choice, setChoice] = useState(value || 'Net 10');
  const [custom, setCustom] = useState('');
  const bad = choice === 'Custom' && custom && !/^Net\s([1-9]\d{0,2})$/.test(custom.trim());
  if (readOnly) return <Text name={name} label="Payment term" value={value} readOnly lock={lock} />;
  return (
    <Field label="Payment term" required error={errors?.[name]} htmlFor={`f-${name}`}>
      <select id={`f-${name}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
        {[...terms, 'Custom'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="hidden" name={name} value={choice === 'Custom' ? custom.trim() : choice} />
      {choice === 'Custom' ? (
        <div className="custom-term-row">
          <input className="custom-term" placeholder="Enter term, e.g. Net 20 or Net 25" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
      ) : null}
      {bad ? <span className="field-note">Use the format Net + number of days, e.g. Net 20.</span> : null}
    </Field>
  );
}

// Work location: Remote or a typed location name (TM-2).
export function WorkLocation({ name = 'work_location', value, errors }: { name?: string; value?: string | null; errors?: Errors }) {
  const initial = !value || value === 'Remote' ? 'Remote' : 'Location';
  const [choice, setChoice] = useState(initial);
  const [loc, setLoc] = useState(initial === 'Location' ? value || '' : '');
  return (
    <Field label="Work location" error={errors?.[name]} htmlFor={`f-${name}`}>
      <select id={`f-${name}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="Remote">Remote</option>
        <option value="Location">{loc ? loc : 'Location'}</option>
      </select>
      <input type="hidden" name={name} value={choice === 'Remote' ? 'Remote' : loc} />
      {choice === 'Location' ? (
        <div className="custom-term-row add-option-row">
          <input className="add-option-input" placeholder="Enter location name, e.g. San Francisco, CA" value={loc} onChange={(e) => setLoc(e.target.value)} />
        </div>
      ) : null}
    </Field>
  );
}

// Searchable multi-select (account managers / clients), selected values shown as chips.
export function MultiSelect({ name, label, options, selected = [], required, errors, placeholder = 'Select…' }: {
  name: string; label: string; options: { value: string; label: string; hint?: string }[]; selected?: string[]; required?: boolean; errors?: Errors; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(selected);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label || v;
  return (
    <Field label={label} required={required} full error={errors?.[name]}>
      <div className="ms" ref={box}>
        <button type="button" className="ms-toggle" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="ms-summary">
            {sel.length ? sel.map((v) => <span key={v} className="ms-chip">{labelOf(v)}</span>) : <span className="ms-placeholder">{placeholder}</span>}
          </span>
          <span className="ms-caret" aria-hidden="true">▾</span>
        </button>
        {open ? (
          <div className="ms-panel">
            <input type="text" className="ms-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="ms-list" role="listbox" aria-multiselectable="true">
              {options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).map((o) => (
                <label className="ms-option" key={o.value}>
                  <input type="checkbox" checked={sel.includes(o.value)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, o.value] : s.filter((x) => x !== o.value)))} />
                  <span className="ms-name">{o.label}</span><span className="ms-hint">{o.hint || ''}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {sel.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      </div>
    </Field>
  );
}

/* ---------------- Document upload row ---------------- */
// One row per document: name + Uploaded / Not uploaded | file control | dates (start/end, or audit period).
export function UploadRow({ name, label, existing, dates, auditPeriod, locked, multiple, errors, note }: {
  name: string; label?: string; existing?: { name: string; size?: string } | null;
  dates?: { start?: string | null; end?: string | null } | false; auditPeriod?: boolean; locked?: string; multiple?: boolean; errors?: Errors; note?: ReactNode;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [replace, setReplace] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => {
    const arr = Array.from(list || []);
    const problem = arr.map(fileProblem).find(Boolean);
    if (problem) { setErr(problem); if (input.current) input.current.value = ''; setFiles([]); return; }
    setErr(''); setFiles(arr);
  };
  const hasFile = !!existing && !replace;
  const fileControl = locked ? (
    existing ? <div className="upload-done"><FileChip name={existing.name} size={existing.size} /><span className="lock">View / download only</span></div>
      : <div className="upload-locked">{locked}</div>
  ) : hasFile ? (
    <div className="upload-done"><FileChip name={existing!.name} size={existing!.size} /><button type="button" className="link-btn" onClick={() => setReplace(true)}>Replace</button></div>
  ) : (
    <>
      <label className="upload-box compact" role="button" tabIndex={0}>
        <span className="upload-btn">{UPLOAD_ICON}{multiple ? 'Choose files' : 'Choose file'}</span>
        <span className="upload-hint">PDF, DOCX, JPG, PNG · max 5 MB{multiple ? ' each · several allowed' : ''}</span>
        <input ref={input} type="file" name={name} accept=".pdf,.docx,.jpg,.jpeg,.png" multiple={multiple} hidden onChange={(e) => pick(e.target.files)} />
      </label>
      <div className="upload-list">
        {files.map((f) => <div key={f.name} className="upload-done"><FileChip name={f.name} size={fmtSize(f.size)} /></div>)}
      </div>
      {err || errors?.[name] ? <span className="field-error">{err || errors?.[name]}</span> : null}
    </>
  );
  const datesEl = (
    <>
      {auditPeriod ? (
        <>
          <div className="validity-row">
            <div className="validity-cell"><span className="expiry-label">Audit period</span><select name={`${name}__period`}><option>6 months</option><option>3 months</option></select></div>
            <div className="validity-cell"><span className="expiry-label">Period start</span><input type="date" name={`${name}__start`} /></div>
          </div>
          <span className="person-sub">A new report replaces the one shown; earlier reports stay in version history.</span>
        </>
      ) : null}
      {dates && !locked ? (
        <div className="validity-row">
          <div className="validity-cell"><span className="expiry-label">Start date</span><input type="date" name={`${name}__start`} defaultValue={dates.start || ''} /></div>
          <div className="validity-cell"><span className="expiry-label">End date</span><input type="date" name={`${name}__end`} defaultValue={dates.end || ''} /></div>
        </div>
      ) : null}
    </>
  );
  const hasDates = auditPeriod || (dates && !locked);
  const state = locked ? null : (hasFile || files.length) ? <span className="doc-state ok">Uploaded</span> : <span className="doc-state">Not uploaded</span>;
  if (!label) return <div className="field doc-field doc-bare">{fileControl}{hasDates ? datesEl : null}{note ? <span className="person-sub">{note}</span> : null}</div>;
  return (
    <div className={`field doc-field ${hasDates ? 'has-dates' : ''}`}>
      <div className="doc-name"><label>{label}</label>{state}{note ? <span className="person-sub">{note}</span> : null}</div>
      <div className="doc-file">{fileControl}</div>
      {hasDates ? <div className="doc-dates">{datesEl}</div> : null}
    </div>
  );
}

// "Other documents": rows with a typed name, file and dates; "+ Add" adds another row.
export function ExtraDocs({ withDates = true }: { withDates?: boolean }) {
  const [rows, setRows] = useState([0]);
  return (
    <div className="field full">
      <label>Other documents</label>
      <div className="extra-docs">
        {rows.map((id, i) => (
          <div key={id} className={`field doc-field extra-doc ${withDates ? 'has-dates' : ''}`}>
            <div className="doc-name extra-doc-head">
              <input className="extra-doc-name" name="extra_name" placeholder="Document name" aria-label="Document name" />
              {i > 0 ? <button type="button" className="link-btn link-danger extra-doc-remove" onClick={() => setRows((r) => r.filter((x) => x !== id))}>Remove</button> : null}
            </div>
            <div className="doc-file"><ExtraFile /></div>
            {withDates ? (
              <div className="doc-dates"><div className="validity-row">
                <div className="validity-cell"><span className="expiry-label">Start date</span><input type="date" name="extra_start" /></div>
                <div className="validity-cell"><span className="expiry-label">End date</span><input type="date" name="extra_end" /></div>
              </div></div>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm extra-doc-add" onClick={() => setRows((r) => [...r, Date.now()])}>+ Add</button>
    </div>
  );
}
function ExtraFile() {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  return (
    <>
      <label className="upload-box compact" role="button" tabIndex={0}>
        <span className="upload-btn">{UPLOAD_ICON}Choose file</span>
        <span className="upload-hint">PDF, DOCX, JPG, PNG · max 5 MB</span>
        <input type="file" name="extra_file" accept=".pdf,.docx,.jpg,.jpeg,.png" hidden onChange={(e) => {
          const f = e.target.files?.[0] || null;
          const p = f ? fileProblem(f) : '';
          if (p) { setErr(p); e.target.value = ''; setFile(null); } else { setErr(''); setFile(f); }
        }} />
      </label>
      {file ? <div className="upload-list"><div className="upload-done"><FileChip name={file.name} size={fmtSize(file.size)} /></div></div> : null}
      {err ? <span className="field-error">{err}</span> : null}
    </>
  );
}

export function FormFooter({ cancelHref, submitLabel, pending, error, extra }: { cancelHref?: string; submitLabel: string; pending?: boolean; error?: string; extra?: ReactNode }) {
  return (
    <div className="form-footer">
      <span className="person-sub inline">{error ? <span className="field-error" role="alert">{error}</span> : <><span className="req">*</span> Required</>}</span>
      <div className="form-buttons">
        {extra}
        {cancelHref ? <Link href={cancelHref} scroll={false} className="btn btn-secondary">Cancel</Link> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
      </div>
    </div>
  );
}
