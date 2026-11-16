import 'server-only';
import { db } from '../supabase/admin';

// TM-10: "Custom" payment terms are Net + days; a new one is saved for later drop-downs.
// Internal helper (called only from signed-in server actions); it is not a server action itself.
export async function savePaymentTerm(term: string): Promise<string | null> {
  const t = term.trim();
  const known = (await db().from('payment_terms').select('label').eq('label', t).maybeSingle()).data;
  if (known) return null;
  if (!/^Net\s([1-9]\d{0,2})$/.test(t)) return 'Use the format Net + number of days, e.g. Net 20.';
  await db().from('payment_terms').insert({ label: t, sort: 50, is_custom: true });
  return null;
}
