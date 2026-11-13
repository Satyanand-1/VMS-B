'use client';
import { useFormAction } from '@/components/useFormAction';
import { acceptInviteAction } from '@/lib/actions/admin';

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useFormAction(acceptInviteAction);
  return (
    <div className="login-pane">
      <h2>Set your password</h2>
      <p className="login-sub">Welcome to AT VMS. Choose a password for your account manager login. This link works once and expires 72 hours after it was sent.</p>
      <form className="login-form" onSubmit={action}>
        <input type="hidden" name="token" value={token} />
        <label htmlFor="newPassword">New password</label>
        <input type="password" id="newPassword" name="password" autoComplete="new-password" placeholder="At least 8 characters" />
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input type="password" id="confirmPassword" name="confirm" autoComplete="new-password" />
        {state?.error ? <div className="login-error">{state.error}</div> : null}
        <button className="btn btn-primary login-button" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Set Password'}</button>
      </form>
    </div>
  );
}
