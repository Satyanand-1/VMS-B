import { Page } from '@/components/page';
import { DataTable } from '@/components/client';
import { Badge } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import { fmtDate } from '@/lib/format';

const ROLE: Record<string, string> = { super_admin: 'Super Admin', account_manager: 'Account Manager', vendor: 'Vendor', resource: 'Resource', system: 'System' };

// AUD-1: append-only log. Super Admin sees everything; an Account Manager sees their own actions and those of their vendors and resources.
export default async function AuditPage() {
  const s = await requireSession(['superadmin', 'accountmanager']);
  let q = db().from('audit_log').select('*').order('at', { ascending: false }).limit(500);
  if (s.persona === 'accountmanager') {
    const [vendors, people] = await Promise.all([
      db().from('user_accounts').select('id').in('vendor_id', s.scope.vendorIds.length ? s.scope.vendorIds : ['00000000-0000-0000-0000-000000000000']),
      db().from('people').select('id').or(`client_id.in.(${s.scope.clientIds.join(',') || '00000000-0000-0000-0000-000000000000'}),vendor_id.in.(${s.scope.vendorIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
    ]);
    const personAccounts = await db().from('user_accounts').select('id').in('person_id', (people.data || []).map((p) => p.id).concat('00000000-0000-0000-0000-000000000000'));
    const actors = [s.account.id, ...(vendors.data || []).map((v) => v.id), ...(personAccounts.data || []).map((p) => p.id)];
    q = q.in('actor_id', actors);
  }
  const rows = must(await q, 'audit') as { id: number; at: string; actor_name: string; actor_role: string; action: string; entity: string; summary: string }[];
  const time = (iso: string) => `${fmtDate(iso)}, ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return (
    <Page s={s} title="Audit Log" description="Immutable record of every create, update, delete, upload, login and status change. Entries cannot be edited or deleted.">
      <DataTable title="Activity" total={rows.length} headers={['When', 'Who', 'Role', 'Action', 'Record', 'Details']}
        rows={rows.map((r) => [time(r.at), r.actor_name, ROLE[r.actor_role] || r.actor_role, <Badge key="a" text={r.action.charAt(0).toUpperCase() + r.action.slice(1)} />, r.entity.replace('_', ' '), r.summary])}
        searchText={rows.map((r) => `${r.actor_name} ${r.action} ${r.entity} ${r.summary}`)} />
    </Page>
  );
}
