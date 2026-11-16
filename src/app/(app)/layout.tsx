import { SideNav, ToastProvider } from '@/components/client';
import { requireSession } from '@/lib/session';
import { navFor } from '@/lib/nav';
import { IdleGuard } from '@/components/IdleGuard';

// Saves that store several documents and create a login do many steps; allow up to 60 seconds per request on Vercel
// (instead of the short default) so they are never cut off half-way.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <ToastProvider>
      <div className="app-shell">
        <SideNav items={navFor(s.persona)} />
        <main className="main-panel">{children}</main>
      </div>
      <IdleGuard />{/* 15-minute session limit on every portal */}
    </ToastProvider>
  );
}
