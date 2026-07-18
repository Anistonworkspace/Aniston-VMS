import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks/useAppStore';
import { useRefreshSessionMutation } from './auth.api';
import { setBootstrapped } from './auth.slice';

interface AuthBootProps {
  children: ReactNode;
}

// Runs once at app boot (mounted in main.tsx, above the router) — silently
// exchanges the httpOnly `vms_refresh` cookie for a fresh access token so a
// page reload doesn't force a full re-login. Renders a full-screen loader
// until the attempt settles (success or fail) so ProtectedRoute never makes
// a premature logged-out decision while this is still in flight.
export function AuthBoot({ children }: AuthBootProps): JSX.Element {
  const dispatch = useAppDispatch();
  const bootstrapped = useAppSelector((s) => s.auth.bootstrapped);
  const [refreshSession] = useRefreshSessionMutation();

  useEffect(() => {
    refreshSession()
      .unwrap()
      .catch(() => {
        // No valid session cookie (or it's expired) — stay logged out;
        // ProtectedRoute will redirect to /login.
      })
      .finally(() => {
        dispatch(setBootstrapped());
      });
    // Intentionally run only once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-sage" aria-label="Loading" />
      </div>
    );
  }

  return <>{children}</>;
}
