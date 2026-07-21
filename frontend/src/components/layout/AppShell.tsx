import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Aniston VMS authenticated shell — full-bleed "inset dashboard" frame.
// The app frame (bg-sidebar, overflow-hidden) fills the whole viewport edge-to-
// edge with SQUARE outer corners, so the dashboard touches all four browser
// edges with no gutter and no white strip. The sidebar is the left section of
// that frame. The main column is a separate rounded-l-frame panel (bg-surface)
// sitting flush against the sidebar: because the frame behind it is sidebar-
// coloured, the panel's left curves expose that colour and therefore appear to
// cut into the sidebar. Only the inner <main> scrolls.
//
// The full-viewport wrapper keeps overflow-hidden so the body itself never
// scrolls.
export function AppShell(): JSX.Element {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <div className="flex h-full w-full overflow-hidden bg-sidebar font-inter text-ink antialiased">
        <Sidebar />
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-l-frame bg-surface">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-6 pb-10 pt-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
