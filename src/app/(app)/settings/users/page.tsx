import Link from 'next/link';
import { Page } from '@/components/page';
import { DataTable, Modal } from '@/components/client';
import { Badge, EditLink, RowActions } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { db, must } from '@/lib/supabase/admin';
import { label } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { AmForm, DeleteAmForm, ResendInvite } from './AmForms';

type Am = { id: string; full_name: string; email: string; phone: string | null; status: string; last_login_at: string | null };

// ADM-1 … ADM-6: Super Admin manages account managers.
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession(['superadmin']);
  const sp = await searchParams;
  const ams = must(await db().from('user_accounts').select('id,full_name,email,phone,status,last_login_at').eq('role', 'account_manager').order('full_name'), 'AMs') as Am[];
  const [cam, vendors, clients] = await Promise.all([
    db().from('client_account_managers').select('client_id,account_manager_id'),
    db().from('vendors').select('id,account_manager_id'),
    db().from('clients').select('id,name').order('name')
  ]);
  const clientsOf = (id: string) => (cam.data || []).filter((r) => r.account_manager_id === id).map((r) => r.client_id);
  const vendorsOf = (id: string) => (vendors.data || []).filter((v) => v.account_manager_id === id).length;
  const amName = Object.fromEntries(ams.map((a) => [a.id, a.full_name]));
  const clientOptions = (forId?: string) => (clients.data || []).map((c) => {
    const others = (cam.data || []).filter((r) => r.client_id === c.id && r.account_manager_id !== forId).map((r) => amName[r.account_manager_id]).filter(Boolean);
    return { value: c.id, label: c.name, hint: others.length ? `Managed by ${others.join(', ')}` : 'No account manager yet' };
  });
  const rows = ams.map((a) => [
    a.full_name, a.email, a.phone || '—', String(clientsOf(a.id).length), String(vendorsOf(a.id)), <Badge key="s" text={label(a.status)} />,
    a.last_login_at ? fmtDate(a.last_login_at) : '—',
    <RowActions key="a">
      <EditLink href={`/settings/users?m=edit&id=${a.id}`} />
      <Link className="link-btn link-danger" href={`/settings/users?m=delete&id=${a.id}`} scroll={false}>Delete</Link>
      {a.status === 'invited' ? <ResendInvite id={a.id} /> : null}
    </RowActions>
  ]);
  const close = '/settings/users';
  const sel = sp.id ? ams.find((a) => a.id === sp.id) : null;
  let modal = null;
  if (sp.m === 'add') modal = <Modal title="Add Account Manager" description="Enter the account manager’s details and choose the clients they manage. Vendors can be assigned to them afterwards from Vendors." closeHref={close}>
    <AmForm mode="add" data={{ clients: [] }} clientOptions={clientOptions()} cancelHref={close} /></Modal>;
  if (sp.m === 'edit' && sel) modal = <Modal title={`Edit ${sel.full_name}`} description="Change details, status and clients. Clients can be removed only while another account manager still manages them." closeHref={close}>
    <AmForm mode="edit" data={{ ...sel, clients: clientsOf(sel.id) }} clientOptions={clientOptions(sel.id)} cancelHref={close} /></Modal>;
  if (sp.m === 'delete' && sel) modal = <Modal title={`Delete ${sel.full_name}?`} description="The account is removed and can no longer sign in. This is recorded in the Audit Log." closeHref={close}>
    <DeleteAmForm id={sel.id} name={sel.full_name} hasWork={clientsOf(sel.id).length + vendorsOf(sel.id) > 0} cancelHref={close}
      targets={ams.filter((a) => a.id !== sel.id && a.status === 'active').map((a) => ({ value: a.id, label: a.full_name }))} /></Modal>;
  return (
    <Page s={s} title="User Account Management" flash={sp.flash}
      description="Add, edit or delete account managers. New account managers receive an email invite to set their password."
      actions={<Link className="btn btn-primary" href="/settings/users?m=add" scroll={false}>Add Account Manager</Link>}>
      <DataTable title="Account managers" total={ams.length} headers={['Name', 'Email', 'Phone', 'Clients', 'Vendors', 'Status', 'Last login', 'Actions']} rows={rows}
        searchText={ams.map((a) => `${a.full_name} ${a.email}`)} />
      {modal}
    </Page>
  );
}
