import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Aniston VMS app frame — reference: .claude/docs/actual-design.png.
// The dashboard fills the entire viewport (the dark "canvas" border seen in
// some mockup exports is NOT part of the UI). The dark sidebar is a fixed
// full-height rail with its own internal scroll; only the main column scrolls.
export function AppShell(): JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-surface font-inter text-ink antialiased">
      <Sidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
