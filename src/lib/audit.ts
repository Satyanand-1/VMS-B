import 'server-only';
import { db } from './supabase/admin';
import type { Session } from './session';

// Never written to the audit trail: encrypted SSN / EIN, passwords and tokens (only that they changed is recorded via the summary).
const SECRET_KEY = /(_enc|password|pw_value|token|secret|^ssn|^ssnRaw|^ein|^einRaw)$/i; // ssn_last4 / ein_last4 are kept
function scrub(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v ?? null;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => !SECRET_KEY.test(k) && x !== undefined));
}

// Append-only audit trail (AUD-1): who, what, when, before and after.
export async function audit(
  s: Pick<Session, 'account'> | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  before?: unknown,
  after?: unknown
) {
  await db().from('audit_log').insert({
    actor_id: s?.account.id ?? null,
    actor_name: s?.account.full_name ?? 'System',
    actor_role: s?.account.role ?? 'system',
    action,
    entity,
    entity_id: entityId,
    summary,
    before: scrub(before),
    after: scrub(after)
  });
}
