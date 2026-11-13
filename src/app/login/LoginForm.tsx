'use client';
import { useFormAction } from '@/components/useFormAction';
import { useState } from 'react';
import { signIn } from '@/lib/actions/auth';

const DEMO = [
  ['a.krishnan@arkhyatech.com', 'Super Admin · Arun Krishnan'],
  ['a.ross@arkhyatech.com', 'Account Manager · Alicia Ross'],
  ['d.ortiz@coralstaffing.com', 'Vendor · Daniel Ortiz'],
  ['maya.reed@outlook.com', 'W-2 · Maya Reed'],
  ['jordan@blakeux.studio', '1099 · Jordan Blake'],
  ['contracts@harborviewstaffing.com', 'New vendor · first sign-in'],
  ['mprice@ridgelinetalent.com', 'Password expired (day 31)'],
  ['billing@orbitsystems.com', 'Inactive vendor']
];

export function LoginForm({ notice, ok, demo }: { notice?: string; ok?: string; demo: boolean }) {
  const [state, action, pending] = useFormAction(signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = state?.error || notice;
  return (
    <div className="login-pane">
      <h2>Vendor Management System</h2>
      <p className="login-sub">Sign in with your email and password. Vendors, consultants and W-2 / 1099 resources: use the username and temporary password from your welcome email the first time. Your password must be changed every 30 days.</p>
      <form className="login-form" onSubmit={action}>
        <label htmlFor="loginEmail">Email (username)</label>
        <input type="email" id="loginEmail" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="loginPassword">Password</label>
        <input type="password" id="loginPassword" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {ok && !state?.error ? <div className="login-notice">{ok}</div> : null}
        {error ? <div className="login-error">{error}</div> : null}
        <button className="btn btn-primary login-button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign In'}</button>
      </form>
      {demo ? (
        <div className="demo-accounts">
          <div className="demo-title">Demo accounts (development) · password: password123</div>
          <div className="demo-row">
            {DEMO.map(([e, label]) => (
              <button key={e} type="button" className="demo-chip login-chip" onClick={() => { setEmail(e); setPassword('password123'); }}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
