'use client';
import { useState } from 'react';

// Shown when the login email could not be sent: username and password to share another way (kept for 2 minutes).
// The password sits in its own box with its own Copy button, with nothing attached to it (no full stop), so it is copied exactly.
export function LoginDetails({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState<'' | 'all' | 'pw'>('');
  const copy = (what: 'all' | 'pw') => {
    const text = what === 'pw' ? password
      : `AT VMS login\nUsername: ${email}\nPassword: ${password}\nSign in at ${window.location.origin}/login — you will be asked to choose your own password.`;
    navigator.clipboard?.writeText(text);
    setCopied(what);
  };
  return (
    <div className="alert alert-warning login-details">
      <div>
        <div className="alert-title">Login details to share (shown for 2 minutes)</div>
        <div className="login-details-grid">
          <span>Username</span><code className="cred">{email}</code>
          <span>Password</span><span className="cred-row"><code className="cred">{password}</code>
            <button type="button" className="link-btn" onClick={() => copy('pw')}>{copied === 'pw' ? 'Copied' : 'Copy password'}</button></span>
        </div>
      </div>
      <button type="button" className="btn btn-alert" onClick={() => copy('all')}>{copied === 'all' ? 'Copied' : 'Copy all'}</button>
    </div>
  );
}
