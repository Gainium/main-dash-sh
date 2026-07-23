import { useAuthStore } from '@/stores/authStore';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Where to land after a successful sign-in. Honors a same-origin
 * `redirectTo` query param (used by the OAuth consent flow to return the
 * user to the consent screen with its params intact); defaults to
 * /overview. Captured once at mount via a ref: a fresh login navigates
 * to the target and the `isAuthenticated` effect below can fire a second
 * time *after* the URL has already changed — reading the live URL there
 * would lose redirectTo and bounce the user to /overview. The ref keeps
 * the original target stable.
 *
 * Also bounces already-authenticated visitors to the target (effect, not
 * <Navigate/>, so fresh sign-in flows can still mount briefly and drive
 * their own navigation).
 */
export function usePostLoginTarget(): () => string {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const redirectToRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('redirectTo')
  );
  const postLoginTarget = (): string => {
    const rt = redirectToRef.current;
    return rt && rt.startsWith('/') ? rt : '/overview';
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate(postLoginTarget(), { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return postLoginTarget;
}
