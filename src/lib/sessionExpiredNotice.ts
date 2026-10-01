import { toast } from '@/lib/toast';

/**
 * The user-facing side of a session ending on its own (token expired or
 * rejected by the backend), as opposed to the user signing out.
 *
 * A session must never end silently: the user is told once, with a toast at
 * the moment it happens, and the login page they land on repeats it and sends
 * them back to where they were (`ProtectedRoute` adds `redirectTo`).
 */
export const SESSION_EXPIRED_MESSAGE =
  'Your session expired — please log in again';

/** Query param `ProtectedRoute` adds so the login page can show the notice. */
export const SESSION_EXPIRED_PARAM = 'sessionExpired';

let expiredAt: number | null = null;

/** Record that the session ended on its own and tell the user (once). */
export function noteSessionExpired(): void {
  const first = expiredAt === null;
  expiredAt = Date.now();
  if (first) toast.error(SESSION_EXPIRED_MESSAGE, { duration: 8000 });
}

/** Whether the current signed-out state follows an expired session. */
export function isSessionExpiredPending(): boolean {
  return expiredAt !== null;
}

/** Reset on sign-in. */
export function clearSessionExpired(): void {
  expiredAt = null;
}

/**
 * The login URL for a signed-out visitor at `path`: same-origin return target
 * plus, after an expiry, the notice flag.
 */
export function loginRedirectUrl(path: string): string {
  const params = new URLSearchParams();
  if (path && path.startsWith('/') && !path.startsWith('//') && path !== '/') {
    params.set('redirectTo', path);
  }
  if (isSessionExpiredPending()) params.set(SESSION_EXPIRED_PARAM, '1');
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
