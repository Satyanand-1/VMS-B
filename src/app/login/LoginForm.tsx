'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { signIn } from '@/lib/actions/auth';
import { PasswordInput } from '@/components/PasswordInput';

export function LoginForm({ notice, ok }: { notice?: string; ok?: string }) {
  const [state, action, pending] = useFormAction(signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = state?.error || notice;
  return (
    <div className="login-pane">
      <h2>Vendor Management System</h2>
      <p className="login-sub">Sign in with your email and password. Vendors and W-2 / 1099 resources: use the username and temporary password from your welcome email the first time. Your password must be changed every 30 days.</p>
      <form className="login-form" onSubmit={action}>
        <label htmlFor="loginEmail">Email (username)</label>
        <input type="email" id="loginEmail" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="loginPassword">Password</label>
        <PasswordInput id="loginPassword" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {ok && !state?.error ? <div className="login-notice">{ok}</div> : null}
        {error ? <div className="login-error">{error}</div> : null}
        <button className="btn btn-primary login-button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  );
}
