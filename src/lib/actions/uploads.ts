'use server';
import { randomUUID } from 'crypto';
import { db } from '../supabase/admin';
import { requireSession } from '../session';
import { BUCKET, MAX_BYTES } from '../files';

const EXT = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];

// Step 1 of a form upload: the browser sends the file straight to storage (staging/…) with a one-time signed URL,
// so large files never pass through the app server's request-size limit. The form then carries only the staged path.
// Each user's staged files sit in their own folder (staging/<user id>/…), and a save can only use files staged by the
// same signed-in user (see unstage), so nobody can attach someone else's upload.
export async function stageUploadAction(fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  const s = await requireSession();
  if (typeof fileName !== 'string' || typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || fileName.length > 255) return { error: 'Choose a valid file.' };
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!EXT.includes(ext)) return { error: 'Only PDF, DOCX, JPG, JPEG or PNG.' };
  if (size > MAX_BYTES) return { error: 'Max 5 MB per file.' };
  const path = `staging/${s.account.id}/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) { console.error('stage upload', error?.message); return { error: 'The file could not be uploaded. Try again.' }; }
  return { path, token: data.token };
}
