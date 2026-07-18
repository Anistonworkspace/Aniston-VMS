import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks/useAppStore';

interface ProtectedRouteProps {
  children: ReactNode;
}

// Gate for authenticated routes. By the time this renders, AuthBoot (mounted
// above the router in main.tsx) has already settled its silent-refresh
// attempt, so a missing accessToken here means the user really is logged
// out — send them to /login, remembering where they were headed.
export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
