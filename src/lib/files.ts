import 'server-only';
import { randomUUID } from 'crypto';
import { db } from './supabase/admin';

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
  if (!file || file.size === 0) return 'Choose a file.';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED[ext]) return 'Only PDF, DOCX, JPG, JPEG or PNG.';
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
  const path = `${folder}/${randomUUID()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: ALLOWED[ext], upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, name: file.name, size: file.size, mime: ALLOWED[ext] };
}

export async function signedUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) throw new Error(`Could not open file: ${error?.message}`);
  return data.signedUrl;
}

export function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
