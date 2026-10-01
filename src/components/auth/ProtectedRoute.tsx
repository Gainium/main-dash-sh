import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { loginRedirectUrl } from '@/lib/sessionExpiredNotice';
import { useAuthStore } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Paths that support shared (read-only) viewing via ?share= or ?backtestShare=.
// Mirrors main-dash/components/authProvider.tsx (the legacy reference).
const SHARE_PATH_PREFIXES = ['/bot', '/combo', '/grid', '/hedge', '/strategy'];

function isPublicSharePath(pathname: string, search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search);
  const hasShareParam = params.has('share') || params.has('backtestShare');
  if (!hasShareParam) return false;
  return SHARE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * ProtectedRoute component that wraps authenticated routes
 *
 * This component checks if the user is authenticated and shows appropriate UI:
 * - Shows loading spinner while authentication is being initialized
 * - Redirects to login page if user is not authenticated
 * - Renders children if user is authenticated
 *
 * @example
 * ```tsx
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 * ```
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  // Show loading spinner while authentication is being initialized
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-md">
          <Loader2 className="h-8 w-8 animate-spin text-gradient-start dark:text-gradient-end" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow read-only share viewing without authentication.
  // Matches main-dash AuthProvider behavior for ?share= and ?backtestShare=
  // URLs on /bot, /combo, /grid, /hedge, /strategy paths.
  if (
    !isAuthenticated &&
    isPublicSharePath(location.pathname, location.search)
  ) {
    return <>{children}</>;
  }

  // Redirect to login if not authenticated, keeping where the user was (and,
  // after an expired session, the notice the login page shows).
  if (!isAuthenticated) {
    return (
      <Navigate
        to={loginRedirectUrl(
          `${location.pathname}${location.search}${location.hash}`
        )}
        replace
      />
    );
  }

  // Render children if authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
