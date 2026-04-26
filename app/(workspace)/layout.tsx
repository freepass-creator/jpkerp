import { AuthGuard } from '@/components/layout/auth-guard';
import { CommandPalette } from '@/components/layout/command-palette';
import { MenuCountsSync } from '@/components/layout/menu-counts-sync';
import { RouteGuard } from '@/components/layout/route-guard';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

/**
 * WorkspaceLayout — JPK ERP v3 shell
 * - .app grid: [sb-w | 1fr] x [topbar-h | 1fr]
 * - .sidebar 풀하이트 (column 1 / row 1/-1)
 * - .topbar  메인 위만 (column 2 / row 1)
 * - .main    메인 본문 (column 2 / row 2)
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <RouteGuard>
        <MenuCountsSync />
        <div className="app">
          <Sidebar />
          <Topbar />
          <main className="main">{children}</main>
        </div>
        <CommandPalette />
      </RouteGuard>
    </AuthGuard>
  );
}
