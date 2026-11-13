'use client';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { FormState } from '@/lib/actions/auth';
import { stageUploadAction } from '@/lib/actions/uploads';

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
      const { error } = await browserClient().storage.from('vms-files').uploadToSignedUrl(st.path, st.token, v, { contentType: v.type || undefined });
      if (error) return `${v.name}: upload failed (${error.message}).`;
      out.append(k, `${STAGED}${JSON.stringify({ path: st.path, name: v.name, type: v.type })}`);
    } else out.append(k, v instanceof File ? '' : v); // keep empty file slots so "Other documents" rows stay aligned
  }
  return out;
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
