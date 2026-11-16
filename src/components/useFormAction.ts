'use client';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { FormState } from '@/lib/actions/auth';
import { stageUploadAction } from '@/lib/actions/uploads';
import { emailProblem } from '@/lib/email-format';

const STAGED = '__staged__:';
let storage: ReturnType<typeof createClient> | null = null;
const browserClient = () => (storage ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));

// Sends each chosen file straight to storage and replaces it in the form with a small marker (path + name),
// so forms with several documents (up to 5 MB each) stay far below the server's request-size limit.
async function stageFiles(fd: FormData): Promise<FormData | string> {
  const out = new FormData();
  for (const [k, v] of fd.entries()) {
    if (v instanceof File && v.size > 0) {
      const st = await stageUploadAction(v.name, v.size);
      if ('error' in st) return `${v.name}: ${st.error}`;
      // Content type from the extension (browsers sometimes send none); the bucket accepts only these four types.
      const ext = v.name.split('.').pop()?.toLowerCase() || '';
      const contentType = ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as Record<string, string>)[ext];
      const { error } = await browserClient().storage.from('vms-files').uploadToSignedUrl(st.path, st.token, v, { contentType });
      if (error) return `${v.name}: upload failed (${error.message}).`;
      out.append(k, `${STAGED}${JSON.stringify({ path: st.path, name: v.name, type: v.type })}`);
    } else out.append(k, v instanceof File ? '' : v); // keep empty file slots so "Other documents" rows stay aligned
  }
  return out;
}

// As soon as the user changes a field, its red marks go away: the "required" outline and any error from the
// last save (e.g. a Federal ID that was too short). A new save shows the server's errors again.
if (typeof document !== 'undefined' && !(window as unknown as { __reqWatch?: boolean }).__reqWatch) {
  (window as unknown as { __reqWatch?: boolean }).__reqWatch = true;
  const clear = (e: Event) => {
    const field = (e.target as HTMLElement | null)?.closest?.('.field');
    if (!field) return;
    field.classList.remove('field-missing');
    if (field.querySelector('.srv')) field.classList.add('edited');
    // When every flagged field has been corrected, the "Check the highlighted fields" line goes too.
    const card = field.closest('.form-card') || field.closest('form');
    const emailsOk = card ? [...card.querySelectorAll<HTMLInputElement>('input[data-email]')].every((i) => !i.value.trim() || !emailProblem(i.value)) : true;
    if (card && emailsOk && ![...card.querySelectorAll('.field:not(.edited) .srv, .field-missing')].length) card.classList.add('errors-fixed');
  };
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
}

// Every field whose label has the red * must be filled before the form is sent (the server checks again).
// Marks each empty one with "field-missing" (red outline + "This field is required.") and returns how many there are.
function checkRequired(form: HTMLFormElement): number {
  form.querySelectorAll('.field-missing').forEach((el) => el.classList.remove('field-missing'));
  let missing = 0;
  const fields = [...form.querySelectorAll<HTMLElement>('.field')].filter((f) => f.querySelector(':scope > label .req, :scope > .doc-name label .req') && f.offsetParent !== null);
  for (const f of fields) {
    let filled: boolean;
    if (f.classList.contains('doc-field')) {
      // Document: a file already on record, or one chosen now.
      const chosen = [...f.querySelectorAll<HTMLInputElement>('input[type=file]')].some((i) => (i.files?.length || 0) > 0);
      filled = chosen || !!f.querySelector('.doc-file .upload-done');
    } else if (f.querySelector('.ms')) {
      filled = !!f.querySelector('.ms input[type=hidden]'); // multi-select: at least one chosen
    } else if (f.querySelector('.date-native')) {
      filled = !!(f.querySelector('.date-native') as HTMLInputElement).value;
    } else if (f.classList.contains('pw-choice')) {
      const mode = (f.querySelector('input[name=pw_mode]') as HTMLInputElement | null)?.value;
      filled = mode !== 'own' || !!(f.querySelector('input[name=pw_value]') as HTMLInputElement | null)?.value.trim();
    } else {
      // Text, select or textarea; for controls with a hidden value (payment term, work location) the hidden value counts.
      const hidden = f.querySelector<HTMLInputElement>('input[type=hidden][name]');
      const control = f.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type=hidden]):not([type=file]):not([readonly]), select, textarea');
      if (hidden && control && !control.getAttribute('name')) filled = !!hidden.value.trim();
      else if (control) filled = !!control.value.trim();
      else filled = true; // read-only / locked value
    }
    if (!filled) { f.classList.add('field-missing'); missing++; }
  }
  if (missing) form.querySelector<HTMLElement>('.field-missing input:not([type=hidden]), .field-missing select, .field-missing textarea, .field-missing button')?.focus();
  return missing;
}

// Email fields with a wrong address (no @, no domain, spaces …): show their message and stop the save.
function checkEmails(form: HTMLFormElement): number {
  let bad = 0;
  for (const el of form.querySelectorAll<HTMLInputElement>('input[data-email]')) {
    if (el.offsetParent === null || !el.value.trim()) continue; // empty is handled by the required check
    if (emailProblem(el.value)) {
      bad++;
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); // the field shows its own message
      if (bad === 1) el.focus();
    }
  }
  return bad;
}

// Submits a server action from onSubmit, so React does not clear the form after a validation error
// (passing the action to <form action> resets uncontrolled fields). Includes the clicked button's name/value.
export function useFormAction(action: (state: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (uploading || pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    e.currentTarget.querySelectorAll('.field.edited').forEach((el) => el.classList.remove('edited')); // show the next save's errors
    (e.currentTarget.closest('.form-card') || e.currentTarget).classList.remove('errors-fixed');
    e.currentTarget.classList.remove('errors-fixed');
    const missing = checkRequired(e.currentTarget);
    if (missing) { setUploadError(`Fill in the ${missing === 1 ? 'required field' : `${missing} required fields`} marked *.`); return; }
    if (checkEmails(e.currentTarget)) { setUploadError('Correct the email address: it must look like name@company.com.'); return; }
    const raw = new FormData(e.currentTarget, submitter && submitter.getAttribute('name') ? submitter : undefined);
    const hasFiles = [...raw.values()].some((v) => v instanceof File && v.size > 0);
    let fd: FormData | string = raw;
    if (hasFiles) {
      setUploading(true); setUploadError(null);
      try { fd = await stageFiles(raw); } catch (err) { fd = `Upload failed: ${(err as Error).message}`; }
      setUploading(false);
      if (typeof fd === 'string') { setUploadError(fd); return; }
    }
    setUploadError(null);
    const ready = fd as FormData;
    startTransition(() => dispatch(ready));
  };
  const shown: FormState = uploadError ? { ...(state || {}), error: uploadError } : state;
  return [shown, onSubmit, pending || uploading] as const;
}
