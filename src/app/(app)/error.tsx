'use client';
import { useEffect } from 'react';

// Any unexpected error on a screen shows this instead of a blank "Application error" page.
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="screen">
      <div className="alert alert-warning">
        <div>
          <div className="alert-title">Something went wrong on this screen</div>
          <div className="alert-text">The app may have just been updated, or the connection was interrupted. Reload the page and try again. If it keeps happening, sign out and sign in again.</div>
        </div>
        <div className="form-buttons">
          <button type="button" className="btn btn-secondary" onClick={() => reset()}>Try again</button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    </div>
  );
}
