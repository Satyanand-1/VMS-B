'use server';
import { randomUUID } from 'crypto';
import { db } from '../supabase/admin';
import { requireSession } from '../session';
import { BUCKET, MAX_BYTES } from '../files';

const EXT = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];

// Step 1 of a form upload: the browser sends the file straight to storage (staging/…) with a one-time signed URL,
// so large files never pass through the app server's request-size limit. The form then carries only the staged path.
export async function stageUploadAction(fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  await requireSession();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!EXT.includes(ext)) return { error: 'Only PDF, DOCX, JPG, JPEG or PNG.' };
  if (size > MAX_BYTES) return { error: 'Max 5 MB per file.' };
  const path = `staging/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: `Upload failed: ${error?.message || 'no upload URL'}` };
  return { path, token: data.token };
}
