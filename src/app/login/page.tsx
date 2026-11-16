import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="login-screen active">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arkhya-lockup-dark.svg" alt="Arkhya Tech" className="arkhya-logo" />
        </div>
        <LoginForm notice={sp.notice?.slice(0, 300)} ok={sp.ok?.slice(0, 300)} />
      </div>
    </div>
  );
}
