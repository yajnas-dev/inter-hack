import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@jobportal/shared';
import { useAuth } from '../features/auth/AuthContext';
import { PageLoading } from '../shared/ui/Feedback';

/** Client-side routing convenience only: the server enforces every role rule on the API. */
export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoading label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function RequireRole({ requires }: { requires: Role }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoading label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== requires) return <Navigate to="/" replace />;
  return <Outlet />;
}
