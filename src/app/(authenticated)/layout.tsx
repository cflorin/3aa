// EPIC-004/STORY-054/TASK-054-002: Authenticated layout — sidebar + dark theme shell
// Wraps all authenticated pages (/universe, /stocks/[ticker])

import Sidebar from '@/components/layout/Sidebar';
import { T } from '@/lib/theme';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: T.bg,
      color: T.text,
      fontSize: 13,
      fontFamily: 'var(--font-dm-sans, "DM Sans", system-ui, sans-serif)',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
