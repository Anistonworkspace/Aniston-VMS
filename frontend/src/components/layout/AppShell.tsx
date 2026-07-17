import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Aniston VMS app frame — docs/04-uiux-brief.md §3: the app floats as a
// rounded 28px shell (max-width ~1440px, centered, soft shadow) on the
// --canvas background; below lg it goes edge-to-edge with radius 0.
export function AppShell(): JSX.Element {
  return (
    <div className="min-h-screen bg-canvas font-inter text-ink antialiased lg:px-8 lg:py-6">
      <div className="mx-auto flex min-h-screen max-w-[1440px] overflow-hidden bg-surface shadow-soft lg:min-h-[calc(100vh-3rem)] lg:rounded-frame">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-6 pb-10 pt-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
