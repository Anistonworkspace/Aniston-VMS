import { Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';

function PageFallback(): JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <Loader2 className="h-8 w-8 animate-spin text-sage" />
    </div>
  );
}

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<OverviewPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
