import { Page } from '@/components/page';
import { requireSession, passwordInfo, isExternal } from '@/lib/session';
import { ChangePasswordForm } from './ChangePasswordForm';

// AUTH-5: every signed-in user changes their own password (current one required):
// Super Admin, account managers, vendors and W-2 / 1099 resources.
export default async function ChangePasswordPage() {
  const s = await requireSession(['superadmin', 'accountmanager', 'vendor', 'w2', 'w9']);
  const p = passwordInfo(s.account);
  const status = !isExternal(s.account.role) ? `Last changed ${p.set}`
    : p.expired ? `Expired on ${p.expires}` : `Expires on ${p.expires} (${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left)`;
  return (
    <Page s={s} title="Change Password">
      <ChangePasswordForm hint={status} />
    </Page>
  );
}
