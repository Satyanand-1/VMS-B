'use client';
import { useState } from 'react';

// Shown when the login email could not be sent: username and password to share another way (kept for 2 minutes).
export function LoginDetails({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = `AT VMS login\nUsername: ${email}\nPassword: ${password}\nSign in at ${window.location.origin}/login — you will be asked to choose your own password.`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
  };
  return (
    <div className="alert alert-warning">
      <div>
        <div className="alert-title">Login details to share</div>
        <div className="alert-text">Username: <b>{email}</b> · Password: <b className="mono">{password}</b>. These are shown only for 2 minutes. The password must be changed at first sign-in.</div>
      </div>
      <button type="button" className="btn btn-alert" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}
