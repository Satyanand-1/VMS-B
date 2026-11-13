import { InviteForm } from './InviteForm';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="login-screen active">
      <div className="login-card">
        <div className="login-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arkhya-lockup-dark.svg" alt="Arkhya Tech" className="arkhya-logo" />
        </div>
        <InviteForm token={token} />
      </div>
    </div>
  );
}
