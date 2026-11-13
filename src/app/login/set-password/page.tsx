import { redirect } from 'next/navigation';
import { loadSession } from '@/lib/session';
import { SetPasswordForm } from './SetPasswordForm';

export default async function SetPasswordPage() {
  const s = await loadSession();
  if (!s) redirect('/login');
  if (!s.account.must_change_password) redirect('/dashboard');
  return (
    <div className="login-screen active">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arkhya-lockup-dark.svg" alt="Arkhya Tech" className="arkhya-logo" />
        </div>
        <SetPasswordForm email={s.account.email} />
      </div>
    </div>
  );
}
