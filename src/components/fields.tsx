'use client';
// Form building blocks with the prototype's markup (form-card / form-section / field / doc-field …).
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileChip } from './ui';

const UPLOAD_ICON = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>;
const TYPES = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];
const MAX = 5 * 1024 * 1024;
export const fileProblem = (f: File) => (!TYPES.includes(f.name.split('.').pop()?.toLowerCase() || '') ? 'Only PDF, DOCX, JPG, JPEG or PNG.'
  : f.size === 0 ? `“${f.name}” is empty (0 KB). Open it, add the content and save it, then choose it again.`
  : f.size > MAX ? 'Max 5 MB per file.' : '');
const fmtSize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

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
  // Phone fields: digits only, plus + ( ) - and spaces; letters are dropped as they are typed or pasted.
  const phone = !readOnly && /phone$/.test(name);
  return (
    <Field label={label} required={required} lock={readOnly ? lock || 'Auto-filled' : undefined} note={note} full={full} error={errors?.[name]} htmlFor={`f-${name}`}>
      <input id={`f-${name}`} name={name} type={phone ? 'tel' : type} defaultValue={value ?? ''} readOnly={readOnly} className={readOnly ? 'readonly' : undefined}
        placeholder={placeholder ?? (phone ? '+1 (555) 123-4567' : undefined)} autoComplete={autoComplete ?? (phone ? 'tel' : undefined)}
        inputMode={phone ? 'tel' : undefined} maxLength={phone ? 20 : undefined}
        onInput={phone ? (e) => { const el = e.currentTarget; const v = el.value.replace(/[^\d+()\-\s]/g, ''); if (v !== el.value) el.value = v; } : undefined} />
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

/* ---------------- Dates: always shown and typed as MM/DD/YYYY (PRD §7), with a calendar button ---------------- */
const CALENDAR = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
const isoToMdy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');
function mdyToIso(mdy: string) {
  const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  const real = d.getUTCFullYear() === +yyyy && d.getUTCMonth() === +mm - 1 && d.getUTCDate() === +dd;
  return real && +yyyy >= 1900 && +yyyy <= 2100 ? `${yyyy}-${mm}-${dd}` : '';
}

// The form receives the date as YYYY-MM-DD in the hidden native input; the user sees and types MM/DD/YYYY.
// min: no date before it can be picked or typed (end date ≥ start date).
export function DateInput({ name, value, min, onChange, id, label }: { name: string; value?: string | null; min?: string | null; onChange?: (iso: string) => void; id?: string; label?: string }) {
  const [iso, setIso] = useState(value || '');
  const [text, setText] = useState(isoToMdy(value || ''));
  const [err, setErr] = useState('');
  const native = useRef<HTMLInputElement>(null);
  const set = (v: string) => { setIso(v); setText(isoToMdy(v)); setErr(''); onChange?.(v); };
  // If the start date moves past this end date, clear it.
  useEffect(() => { if (min && iso && iso < min) { setIso(''); setText(''); onChange?.(''); setErr(`Choose a date on or after ${isoToMdy(min)}.`); } }, [min]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="date-field">
        <input type="text" id={id} className="date-text" placeholder="MM/DD/YYYY" inputMode="numeric" maxLength={10} value={text} aria-label={label}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 8);
            const t = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
            setText(t);
            // Store the date as soon as it is complete, so pressing Enter (no blur) still submits it.
            const v = d.length === 8 ? mdyToIso(t) : '';
            if (v && !(min && v < min)) { setIso(v); setErr(''); onChange?.(v); }
            else if (!d.length) { setIso(''); onChange?.(''); }
          }}
          onBlur={() => {
            if (!text) { set(''); return; }
            const v = mdyToIso(text);
            if (!v) { setErr('Enter a valid date as MM/DD/YYYY (year 1900–2100).'); setIso(''); onChange?.(''); return; }
            if (min && v < min) { setErr(`Choose a date on or after ${isoToMdy(min)}.`); setIso(''); onChange?.(''); return; }
            set(v);
          }} />
        <button type="button" className="date-pick" aria-label="Pick a date" title="Pick a date" onClick={() => { try { native.current?.showPicker(); } catch { native.current?.focus(); } }}>{CALENDAR}</button>
        <input ref={native} type="date" className="date-native" tabIndex={-1} name={name} value={iso} min={min || '1900-01-01'} max="2100-12-31" onChange={(e) => set(e.target.value)} />
      </div>
      {err ? <span className="field-note date-error">{err}</span> : null}
    </>
  );
}

export function DateField({ name, label, value, required, errors, min, onChange }: { name: string; label: string; value?: string | null; required?: boolean; errors?: Errors; min?: string | null; onChange?: (iso: string) => void }) {
  return (
    <Field label={label} required={required} error={errors?.[name]} htmlFor={`f-${name}`}>
      <DateInput id={`f-${name}`} name={name} value={value} min={min} onChange={onChange} label={label} />
    </Field>
  );
}

// Start + end date pair: the end date cannot be before the start date.
export function DateRange({ startName, endName, startLabel = 'Start date', endLabel = 'End date', start, end, required, errors }: {
  startName: string; endName: string; startLabel?: string; endLabel?: string; start?: string | null; end?: string | null; required?: boolean; errors?: Errors;
}) {
  const [from, setFrom] = useState(start || '');
  return (
    <>
      <DateField name={startName} label={startLabel} value={start} required={required} errors={errors} onChange={setFrom} />
      <DateField name={endName} label={endLabel} value={end} required={required} errors={errors} min={from || null} />
    </>
  );
}
// Inline start/end cells used in document rows.
function ValidityCells({ prefix, start, end }: { prefix: string; start?: string | null; end?: string | null }) {
  const [from, setFrom] = useState(start || '');
  return (
    <div className="validity-row">
      <div className="validity-cell"><span className="expiry-label">Start date</span><DateInput name={`${prefix}__start`} value={start} onChange={setFrom} label="Start date" /></div>
      <div className="validity-cell"><span className="expiry-label">End date</span><DateInput name={`${prefix}__end`} value={end} min={from || null} label="End date" /></div>
    </div>
  );
}
function ExtraValidity() {
  const [from, setFrom] = useState('');
  return (
    <div className="validity-row">
      <div className="validity-cell"><span className="expiry-label">Start date</span><DateInput name="extra_start" onChange={setFrom} label="Start date" /></div>
      <div className="validity-cell"><span className="expiry-label">End date</span><DateInput name="extra_end" min={from || null} label="End date" /></div>
    </div>
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
// Saved locations are options of their own; the entry field appears only when "Location" (add new) is chosen,
// and "Add" turns the typed name into an option and selects it.
const NEW_LOCATION = '__new__';
export function WorkLocation({ name = 'work_location', value, errors }: { name?: string; value?: string | null; errors?: Errors }) {
  const [places, setPlaces] = useState<string[]>(value && value !== 'Remote' ? [value] : []);
  const [choice, setChoice] = useState(value || 'Remote');
  const [typed, setTyped] = useState('');
  const add = () => {
    const t = typed.trim();
    if (!t) return;
    const known = ['Remote', ...places].find((p) => p.toLowerCase() === t.toLowerCase());
    if (!known) setPlaces((p) => [...p, t]);
    setChoice(known || t); setTyped('');
  };
  return (
    <Field label="Work location" error={errors?.[name]} htmlFor={`f-${name}`}>
      <select id={`f-${name}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="Remote">Remote</option>
        {places.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value={NEW_LOCATION}>Location</option>
      </select>
      <input type="hidden" name={name} value={choice === NEW_LOCATION ? '' : choice} />
      {choice === NEW_LOCATION ? (
        <div className="custom-term-row add-option-row">
          <input className="add-option-input" placeholder="Enter location name, e.g. San Francisco, CA" value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label="New location name" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={!typed.trim()}>Add</button>
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
  // One file input, always in the form; "Replace" opens the file picker straight away.
  const fileInput = <input ref={input} type="file" name={name} accept=".pdf,.docx,.jpg,.jpeg,.png" multiple={multiple} hidden
    onChange={(e) => { pick(e.target.files); if (existing && e.target.files?.length) setReplace(true); }} />;
  const keep = () => { setReplace(false); setFiles([]); setErr(''); if (input.current) input.current.value = ''; };
  const control = locked ? (
    existing ? <div className="upload-done"><FileChip name={existing.name} size={existing.size} /><span className="lock">View / download only</span></div>
      : <div className="upload-locked">{locked}</div>
  ) : hasFile ? (
    <>
      <div className="upload-done"><FileChip name={existing!.name} size={existing!.size} /><button type="button" className="link-btn" onClick={() => input.current?.click()}>Replace</button></div>
      {err || errors?.[name] ? <span className="field-error">{err || errors?.[name]}</span> : null}
    </>
  ) : (
    <>
      {files.length ? null : (
        <label className="upload-box compact" role="button" tabIndex={0} onClick={(e) => { e.preventDefault(); input.current?.click(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}>
          <span className="upload-btn">{UPLOAD_ICON}{multiple ? 'Choose files' : 'Choose file'}</span>
          <span className="upload-hint">PDF, DOCX, JPG, PNG · max 5 MB{multiple ? ' each · several allowed' : ''}</span>
        </label>
      )}
      <div className="upload-list">
        {files.map((f) => <div key={f.name} className="upload-done"><FileChip name={f.name} size={fmtSize(f.size)} /></div>)}
        {files.length ? <button type="button" className="link-btn" onClick={() => input.current?.click()}>Change</button> : null}
        {replace && existing ? <button type="button" className="link-btn" onClick={keep}>Keep {existing.name}</button> : null}
      </div>
      {err || errors?.[name] ? <span className="field-error">{err || errors?.[name]}</span> : null}
    </>
  );
  // The input stays at a fixed position so React keeps the chosen file when the view switches to "replacing".
  const fileControl = <>{locked ? null : fileInput}{control}</>;
  const datesEl = (
    <>
      {auditPeriod ? (
        <>
          <div className="validity-row">
            <div className="validity-cell"><span className="expiry-label">Audit period</span><select name={`${name}__period`}><option>6 months</option><option>3 months</option></select></div>
            <div className="validity-cell"><span className="expiry-label">Period start</span><DateInput name={`${name}__start`} label="Period start" /></div>
          </div>
          <span className="person-sub">A new report replaces the one shown; earlier reports stay in version history.</span>
        </>
      ) : null}
      {dates && !locked ? (
        <ValidityCells prefix={name} start={dates.start} end={dates.end} />
      ) : null}
    </>
  );
  const hasDates = auditPeriod || (dates && !locked);
  // "Uploaded" only for a file already saved; a newly chosen file is "Selected" until the form is saved.
  const state = locked ? (existing ? <span className="doc-state ok">Uploaded</span> : null)
    : files.length ? <span className="doc-state ok" title="Saved when you save the form">Selected</span>
    : hasFile ? <span className="doc-state ok">Uploaded</span> : <span className="doc-state">Not uploaded</span>;
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
// reserved: names already used by this record's documents (MSA, PO, I-9 …); an extra document may not reuse them.
export function ExtraDocs({ withDates = true, reserved = [] }: { withDates?: boolean; reserved?: string[] }) {
  const [rows, setRows] = useState([0]);
  const [names, setNames] = useState<Record<number, string>>({});
  const taken = (id: number) => {
    const n = (names[id] || '').trim().toLowerCase();
    if (!n) return false;
    return reserved.some((r) => r.trim().toLowerCase() === n) || rows.some((o) => o !== id && rows.indexOf(o) < rows.indexOf(id) && (names[o] || '').trim().toLowerCase() === n);
  };
  return (
    <div className="field full">
      <label>Other documents</label>
      <div className="extra-docs">
        {rows.map((id, i) => (
          <div key={id} className={`field doc-field extra-doc ${withDates ? 'has-dates' : ''}`}>
            <div className="doc-name extra-doc-head">
              <input className="extra-doc-name" name="extra_name" placeholder="Document name" aria-label="Document name" value={names[id] || ''}
                onChange={(e) => setNames((m) => ({ ...m, [id]: e.target.value }))} aria-invalid={taken(id) || undefined} />
              {i > 0 ? <button type="button" className="link-btn link-danger extra-doc-remove" onClick={() => setRows((r) => r.filter((x) => x !== id))}>Remove</button> : null}
              {taken(id) ? <span className="field-error">A document named “{names[id].trim()}” already exists. Use a different name.</span> : null}
            </div>
            <div className="doc-file"><ExtraFile /></div>
            {withDates ? (
              <div className="doc-dates"><ExtraValidity /></div>
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

// Sign-in password: generated by the system or set by the Super Admin / Account Manager. Username = the email.
export function PasswordChoice({ errors, compact }: { errors?: Errors; compact?: boolean }) {
  const [mode, setMode] = useState<'generate' | 'own'>('generate');
  const [show, setShow] = useState(false);
  return (
    <div className={`field ${compact ? '' : 'full'} pw-choice`}>
      <label>Password<span className="req">*</span></label>
      <div className="segmented">
        <button type="button" className={`seg ${mode === 'generate' ? 'active' : ''}`} onClick={() => setMode('generate')}>Generate automatically</button>
        <button type="button" className={`seg ${mode === 'own' ? 'active' : ''}`} onClick={() => setMode('own')}>Set a password</button>
      </div>
      <input type="hidden" name="pw_mode" value={mode} />
      {mode === 'own' ? (
        <div className="custom-term-row">
          <input name="pw_value" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" aria-label="Password" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
        </div>
      ) : <span className="person-sub">A random 14-character password is created.</span>}
      {errors?.pw_value ? <span className="field-error">{errors.pw_value}</span> : null}
      <span className="person-sub">The username (their email) and this password are emailed. They must choose their own password at first sign-in.</span>
    </div>
  );
}

// formId: the footer can sit outside the <form> (e.g. after the Sign-in box, which has its own small form).
export function FormFooter({ cancelHref, submitLabel, pending, error, extra, formId }: { cancelHref?: string; submitLabel: string; pending?: boolean; error?: string; extra?: ReactNode; formId?: string }) {
  return (
    <div className="form-footer">
      <span className="person-sub inline">{error ? <span className="field-error" role="alert">{error}</span> : <><span className="req">*</span> Required</>}</span>
      <div className="form-buttons">
        {extra}
        {cancelHref ? <Link href={cancelHref} scroll={false} className="btn btn-secondary">Cancel</Link> : null}
        <button className="btn btn-primary" type="submit" form={formId} disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
      </div>
    </div>
  );
}
