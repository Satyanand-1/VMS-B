'use client';
import { useFormAction } from '@/components/useFormAction';
import { setNewPassword, signOut, type FormState } from '@/lib/actions/auth';

export function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useFormAction(setNewPassword);
  return (
    <div className="login-pane">
      <form action={signOut}><button className="back-link" type="submit">← Back to sign-in</button></form>
      <h2>Set a new password</h2>
      <p className="login-sub">You signed in with a temporary password emailed to <b>{email}</b>. Choose a new password to continue. It will be valid for 30 days.</p>
      <form className="login-form" onSubmit={action}>
        <label htmlFor="newPassword">New password</label>
        <input type="password" id="newPassword" name="password" autoComplete="new-password" placeholder="At least 8 characters" />
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input type="password" id="confirmPassword" name="confirm" autoComplete="new-password" />
        {state?.error ? <div className="login-error">{state.error}</div> : null}
        <button className="btn btn-primary login-button" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save & Sign In'}</button>
      </form>
    </div>
  );
}
