import { Page } from '@/components/page';
import { requireSession, passwordInfo } from '@/lib/session';
import { ChangePasswordForm } from './ChangePasswordForm';

// AUTH-5: vendor, consultant, W-2 and 1099 users change their password (current one required).
export default async function ChangePasswordPage() {
  const s = await requireSession(['vendor', 'w2', 'w9']);
  const p = passwordInfo(s.account);
  const status = p.expired ? `expired on ${p.expires}` : `was set on ${p.set} and expires on ${p.expires} (${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left)`;
  return (
    <Page s={s} title="Change Password" description="Enter your current password, then choose a new one. Each password is valid for 30 days.">
      <ChangePasswordForm hint={`Passwords expire every 30 days. Your current password ${status}. Changing it now, even on day 29 or 30, keeps you signed in for the next 30 days from today.`} />
    </Page>
  );
}
