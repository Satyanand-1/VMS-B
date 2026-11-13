import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM for SSN and EIN (PRD §7). Stored as base64(iv | tag | ciphertext); key from ENCRYPTION_KEY.
function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || '';
  if (hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex characters');
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(stored: string | null | undefined): string {
  if (!stored) return '';
  const buf = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export const maskSsn = (last4: string | null | undefined) => (last4 ? `•••-••-${last4}` : '—');
