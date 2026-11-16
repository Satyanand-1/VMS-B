import { Page } from '@/components/page';
import { requireSession, passwordInfo } from '@/lib/session';
import { ChangePasswordForm } from './ChangePasswordForm';

// AUTH-5: vendor, consultant, W-2 and 1099 users change their password (current one required).
export default async function ChangePasswordPage() {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const p = passwordInfo(s.account);
  const status = p.expired ? `Expired on ${p.expires}` : `Expires on ${p.expires} (${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left)`;
  return (
    <Page s={s} title="Change Password">
      <ChangePasswordForm hint={status} />
    </Page>
  );
}
