import 'server-only';
import { db } from './supabase/admin';
import type { Session } from './session';

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
    before: before ?? null,
    after: after ?? null
  });
}
