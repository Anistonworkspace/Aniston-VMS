import { Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { CamerasPage } from '@/features/cameras/CamerasPage';
import { IncidentsPage } from '@/features/incidents/IncidentsPage';
import { ClipsPage } from '@/features/clips/ClipsPage';
import { LiveWallPage } from '@/features/livewall/LiveWallPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

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
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<OverviewPage />} />
            <Route path="/live" element={<LiveWallPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/cameras" element={<CamerasPage />} />
            <Route path="/cameras/:cameraId" element={<CamerasPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:incidentId" element={<IncidentsPage />} />
            <Route path="/clips" element={<ClipsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
