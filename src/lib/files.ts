import 'server-only';
import { randomUUID } from 'crypto';
import { db } from './supabase/admin';
import { ownValue } from './safe';

export const BUCKET = 'vms-files';
const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};
export const MAX_BYTES = 5 * 1024 * 1024;

// INV-5: PDF, DOCX, JPG, JPEG, PNG; max 5 MB. Checked by extension and by the file's first bytes.
export async function checkFile(file: File | null | undefined): Promise<string | null> {
  if (!file) return 'Choose a file.';
  if (file.size === 0) return `“${file.name}” is empty (0 KB). Open it, add the content and save it, then choose it again.`;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ownValue(ALLOWED, ext)) return 'Only PDF, DOCX, JPG, JPEG or PNG.';
  if (file.size > MAX_BYTES) return 'Max 5 MB per file.';
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('');
  const ok =
    (ext === 'pdf' && hex.startsWith('25504446')) ||
    (ext === 'docx' && hex.startsWith('504b0304')) ||
    ((ext === 'jpg' || ext === 'jpeg') && hex.startsWith('ffd8ff')) ||
    (ext === 'png' && hex.startsWith('89504e47'));
  return ok ? null : 'The file content does not match its type.';
}

export async function storeFile(folder: string, file: File): Promise<{ path: string; name: string; size: number; mime: string }> {
  const ext = file.name.split('.').pop()!.toLowerCase();
  const mime = ownValue(ALLOWED, ext);
  if (!mime) throw new Error('Only PDF, DOCX, JPG, JPEG or PNG.');
  const path = `${folder}/${randomUUID()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mime, upsert: false });
  if (error) { console.error('store file', error.message); throw new Error('The file could not be saved. Try again.'); }
  return { path, name: file.name, size: file.size, mime };
}

// Step 2 of a form upload: replace every staged-file marker in the form with the real File, read back from storage.
export const STAGED = '__staged__:';
// Only files staged by this same user (staging/<user id>/<uuid>.<ext>) are accepted.
const STAGED_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|jpg|jpeg|png)$/;
export async function unstage(form: FormData, userId: string): Promise<FormData> {
  const out = new FormData();
  const prefix = `staging/${userId}/`;
  const own = (p: string) => p.startsWith(prefix) && STAGED_FILE.test(p.slice(prefix.length));
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string' && v.startsWith(STAGED)) {
      let meta: { path: string; name: string; type: string };
      try { meta = JSON.parse(v.slice(STAGED.length)); } catch { continue; }
      if (typeof meta?.path !== 'string' || !own(meta.path)) continue;
      const name = String(meta.name || 'file').replace(/[\u0000-\u001f\\/]/g, '').slice(0, 200) || 'file';
      const { data, error } = await db().storage.from(BUCKET).download(meta.path);
      await db().storage.from(BUCKET).remove([meta.path]);
      if (error || !data) throw new Error(`Upload failed: could not read ${name}. Try again.`);
      if (data.size > MAX_BYTES) throw new Error('Max 5 MB per file.');
      out.append(k, new File([await data.arrayBuffer()], name, { type: ownValue(ALLOWED, name.split('.').pop()?.toLowerCase() || '') || 'application/octet-stream' }));
    } else out.append(k, v);
  }
  return out;
}

export async function signedUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) { console.error('signed url', error?.message); throw new Error('The file could not be opened.'); }
  return data.signedUrl;
}

export function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
