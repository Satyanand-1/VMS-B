import { SideNav, ToastProvider } from '@/components/client';
import { requireSession } from '@/lib/session';
import { navFor } from '@/lib/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <ToastProvider>
      <div className="app-shell">
        <SideNav items={navFor(s.persona)} />
        <main className="main-panel">{children}</main>
      </div>
    </ToastProvider>
  );
}
