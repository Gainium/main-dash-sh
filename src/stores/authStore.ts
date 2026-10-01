import { logger } from '@/lib/loggerInstance';
import { loggerStorage } from '@/lib/loggerStorage';
import {
  identify as analyticsIdentify,
  reset as analyticsReset,
} from '@/lib/analytics';
import { pouchDBSync } from '@/lib/pouchdbSync';
import { priceCache } from '@/lib/priceCache';
import { queryClient } from '@/lib/queryClient';
import { RealAuthService } from '@/lib/realAuthService';
import {
  isSessionDeadMessage,
  setSessionDeadHandler,
  setSessionSuspectHandler,
} from '@/lib/api/GraphQLClient';
import {
  clearSessionExpired,
  noteSessionExpired,
} from '@/lib/sessionExpiredNotice';
import { useUIStore } from '@/stores/uiStore';
import { indexedDBStorage } from '@/lib/zustand-indexeddb-storage';

import type { AuthState, User } from '@/types/auth';
import { jwtDecode } from 'jwt-decode';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Helper function to get token from cookie
const getTokenFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((cookie) =>
    cookie.trim().startsWith('token=')
  );

  if (tokenCookie) {
    return tokenCookie.split('=')[1].trim();
  }

  return null;
};

interface AuthActions {
  login: (accessToken: string, user: User) => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  refreshUser: () => Promise<boolean>;
  initializeAuth: () => Promise<void>;
  isTokenExpired: () => boolean;
  setLoading: (loading: boolean) => void;
  setUserPaperContext: (paperContext: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

const removeTokenFromCookie = () => {
  if (typeof document !== 'undefined') {
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  }
};

const removeAllAppData = async () => {
  await Promise.all([
    loggerStorage.clearLogs(),
    pouchDBSync.clearLocalData(),
    priceCache.clearCache(),
    queryClient.clear(),
    indexedDBStorage.clearAll(),
  ]);
};

const bindAccountScopedStores = (_userId?: string | null) => {
  // Per-user account-scoped store bindings.
};

const clearSessionScopedData = async () => {
  await Promise.all([priceCache.clearCache(), queryClient.clear()]);
};

/**
 * Set when boot validation could not reach a verdict (client timeout, network
 * blip, 5xx) and the session was kept on the benefit of the doubt. The
 * watchdog at the bottom of this file keeps asking until the backend answers
 * — see `startSessionWatchdog` for why a one-shot check isn't enough.
 */
let sessionUnverified = false;
/** Throttle for the watchdog's network revalidation attempts. */
let lastRevalidateAt = 0;

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        tokens: null,
        isLoading: false,
        isAuthenticated: false,
        initInProgress: false,

        // Actions
        login: (accessToken: string, user: User) => {
          try {
            const decoded = jwtDecode<{ exp: number }>(accessToken);
            const expiresAt = decoded.exp * 1000; // Convert to milliseconds

            set({
              user,
              tokens: { accessToken, expiresAt },
              isAuthenticated: true,
              isLoading: false,
            });
            sessionUnverified = false;
            clearSessionExpired();

            bindAccountScopedStores(user.id);

            // Identify user in PostHog
            if (user.id) {
              analyticsIdentify(user.id, {
                email: user.email || '',
                name: user.name || '',
                username: user.name || user.email || '',
              });
            }
          } catch (error) {
            logger.error('Failed to decode access token:', error);
            get().logout();
          }
        },

        initializeAuth: async () => {
          if (get().initInProgress) return; // Prevent multiple simultaneous initializations
          set({ initInProgress: true });

          try {
            // Check if admin has set a token in cookie
            const cookieToken = getTokenFromCookie();
            const { tokens } = get();
            // If cookie token exists and differs from stored token, replace it
            if (cookieToken && cookieToken !== tokens?.accessToken) {
              logger.info(
                'New token detected in cookie, replacing stored token and clearing app data'
              );

              try {
                // Decode the token to get expiration time
                const decoded = jwtDecode<{ exp: number }>(cookieToken);
                const expiresAt = decoded.exp * 1000;

                // Get user information from the API. Time-capped so a
                // degraded backend can't hang the boot gate for minutes on
                // the admin/dev cookie handoff either.
                const user = await RealAuthService.getUserInfo(cookieToken, {
                  timeoutMs: 15_000,
                });

                // Clear all app data to prevent stale-while-revalidate issues
                queryClient.clear();

                // Update store with new token
                set({
                  user,
                  tokens: { accessToken: cookieToken, expiresAt },
                  isAuthenticated: true,
                  isLoading: false,
                });

                bindAccountScopedStores(user.id);

                // Identify user in PostHog
                if (user.id) {
                  analyticsIdentify(user.id, {
                    email: user.email || '',
                    name: user.name || '',
                    username: user.name || user.email || '',
                  });
                }
                await removeAllAppData();
                removeTokenFromCookie();
                // Reload the page to ensure clean state
                window.location.reload();
                return;
              } catch (error) {
                removeTokenFromCookie();
                // A rejected cookie token says nothing about the STORED
                // session — they are different tokens, which is why the
                // session-dead handler deliberately ignores this rejection.
                // Fall through to the stored-token validation below; it is
                // the only thing allowed to end the current session.
                const reason =
                  error instanceof Error ? error.message : 'Unknown error';
                logger.error('Failed to process cookie token:', {
                  reason,
                  tokenRejectedByBackend: isSessionDeadMessage(reason),
                });
              }
            }

            // Continue with normal stored token validation
            if (tokens?.accessToken) {
              // Check if token is expired first (client-side check)
              if (get().isTokenExpired()) {
                logger.info('Stored token is expired, clearing auth state');
                sessionUnverified = false;
                set({
                  user: null,
                  tokens: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                noteSessionExpired();
                return;
              }

              // Optimistically restore the session from persisted state so
              // the full-screen boot gate (ProtectedRoute's "Loading…")
              // doesn't block on the network. The server validation below
              // still runs and a definitive rejection still logs out — but a
              // slow API no longer means minutes of spinner, and cached
              // dashboard data renders immediately.
              const persistedUser = get().user;
              if (persistedUser) {
                set({
                  isAuthenticated: true,
                  isLoading: false,
                  user: persistedUser,
                });
                bindAccountScopedStores(persistedUser.id);
              }

              // Validate token with server. The timeout caps how long boot
              // validation can hang when the backend is degraded — without
              // it the request pends for the full ~5-minute server timeout.
              const validation = await RealAuthService.validateTokenDetailed(
                tokens.accessToken,
                { timeoutMs: 15_000 }
              );

              if (validation.ok) {
                // Token is valid, restore auth state with fresh user data
                sessionUnverified = false;
                set({
                  isAuthenticated: true,
                  isLoading: false,
                  user: validation.user,
                });

                bindAccountScopedStores(validation.user.id);

                // Re-identify user in PostHog after restoring from storage
                if (validation.user.id) {
                  analyticsIdentify(validation.user.id, {
                    email: validation.user.email || '',
                    name: validation.user.name || '',
                    username: validation.user.name || validation.user.email || '',
                  });
                }

                return;
              }

              if (validation.definitive) {
                // The backend evaluated the token and rejected it — the
                // session is truly dead. Clear it.
                logger.info('Stored token rejected by server, clearing auth', {
                  reason: validation.reason,
                });
                sessionUnverified = false;
                set({
                  user: null,
                  tokens: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                noteSessionExpired();
                return;
              }

              // Indeterminate failure (client timeout, network error, 5xx):
              // we never learned whether the token is valid, so KEEP the
              // session. Wiping it here is what used to log users out of
              // prod whenever the API had a bad moment.
              //
              // "The next boot revalidates" is not enough on its own: a user
              // who doesn't reload sits on an authenticated shell where every
              // widget renders its own "Error Loading …" forever. Flag the
              // session so the watchdog keeps asking until the backend gives
              // a verdict.
              sessionUnverified = true;
              logger.warn(
                'Token validation inconclusive (network/server issue), keeping session',
                { reason: validation.reason }
              );
              if (!persistedUser) {
                // No cached user to render with — fall back to the login
                // page rather than an empty authenticated shell. The token
                // stays stored; the next boot retries validation.
                set({ isLoading: false });
              }
              return;
            }

            // No stored token, user needs to log in
            set({ isLoading: false });
          } catch (error) {
            // Unexpected failure somewhere in init. Do NOT clear the stored
            // tokens — destroying a possibly-valid session on an incidental
            // error (analytics, storage, a throw in a helper) is exactly the
            // failure mode the classification above exists to prevent. Drop
            // the loading gate and let the next boot retry.
            logger.error('Auth initialization failed:', error);
            set({ isLoading: false });
          } finally {
            // Always release the init lock. Leaving `initInProgress: true`
            // persisted in localStorage made subsequent `initializeAuth`
            // calls no-op (line 110's guard), so once auth crashed once it
            // could never recover without manual storage clear.
            set({ initInProgress: false });
          }
        },

        logout: async () => {
          const { tokens } = get();
          sessionUnverified = false;

          // Call logout API if we have a token
          if (tokens?.accessToken) {
            try {
              await RealAuthService.logout(tokens.accessToken);
            } catch (error) {
              logger.error('Logout request failed:', error);
            }
          }

          // Reset PostHog user identification
          analyticsReset();

          // Reset onboarding UI flags so they don't bleed across accounts on
          // the same browser. Both keys are persisted in ui-store and not
          // user-scoped.
          try {
            const ui = useUIStore.getState();
            ui.setOnboardingStepsVisible(false);
            ui.setOnboardingStepsCollapsed(false);
          } catch (error) {
            logger.warn('Failed to reset onboarding UI flags on logout', {
              error,
            });
          }

          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
          });

          // Clear the query cache on logout to prevent data leakage
          await clearSessionScopedData();
        },

        refreshToken: async (): Promise<boolean> => {
          // The backend has no refresh grant: a session token is only ever
          // re-validated, and an expired one can't be renewed. So "refresh"
          // means: still valid → keep it; expired or definitively rejected →
          // end the session WITH the expired notice; no answer (network,
          // timeout, 5xx) → keep it and let the watchdog ask again. It used
          // to clear the session silently on any failure, including a
          // transient one.
          const { tokens } = get();
          if (!tokens?.accessToken) {
            return false;
          }
          if (get().isTokenExpired()) {
            await endExpiredSession('access token expired');
            return false;
          }
          const validation = await RealAuthService.validateTokenDetailed(
            tokens.accessToken,
            { timeoutMs: 15_000 }
          );
          if (validation.ok) {
            set({ isLoading: false, user: validation.user });
            return true;
          }
          if (validation.definitive) {
            await endExpiredSession(validation.reason);
            return false;
          }
          sessionUnverified = true;
          return false;
        },

        refreshUser: async (): Promise<boolean> => {
          // Re-fetch the user (subscription, balance, credits) into the
          // store after a mutation that changed it (e.g. plan upgrade).
          // Unlike refreshToken, a fetch failure here does NOT clear the
          // session — a transient network blip must not log the user out.
          const { tokens } = get();
          if (!tokens?.accessToken) {
            return false;
          }
          try {
            const userData = await RealAuthService.validateToken(
              tokens.accessToken
            );
            if (typeof userData === 'object' && userData !== null) {
              set({ user: userData });
              return true;
            }
            logger.warn('refreshUser: no user returned, keeping session');
            return false;
          } catch (error) {
            logger.error('refreshUser failed, keeping session:', error);
            return false;
          }
        },

        isTokenExpired: (): boolean => {
          const { tokens } = get();
          if (!tokens) return true;

          // Add 30 second buffer before expiry
          return Date.now() >= tokens.expiresAt - 30000;
        },

        setLoading: (loading: boolean) => {
          if (get().isLoading === loading) return; // Avoid unnecessary state updates
          set({ isLoading: loading });
        },

        // The paper/live toggle writes `paperContext` to the server, but the
        // profile this store holds is what `usePaperContext` reconciles the UI
        // store against on every boot — and it is persisted. Without writing
        // the new value back here, the persisted profile keeps the PREVIOUS
        // paperContext until the next `validateToken` lands, and the reload in
        // between re-applies that stale value: switch to Live, reload, the app
        // comes back Paper. (Legacy main-dash does the same write —
        // `setUserAction(dispatch, { ...user, paperContext: value })`.)
        setUserPaperContext: (paperContext: boolean) => {
          const { user } = get();
          if (!user || user.paperContext === paperContext) return;
          set({ user: { ...user, paperContext } });
        },
      }),
      {
        name: 'auth-store',
        partialize: (state) => {
          const { user, ...rest } = state;
          if (!user) return state;
          // Strip server-owned activation flags so the widget waits for the
          // fresh validateToken() payload instead of flashing stale onboarding
          // state when switching accounts on the same browser.
          const { onboardingSteps: _omit, ...userWithoutOnboarding } = user;
          return {
            ...rest,
            user: userWithoutOnboarding as User,
          } as AuthState;
        },
        merge(persistedState, currentState) {
          return {
            ...currentState,
            ...(persistedState as Partial<AuthState>),
            isLoading: true,
            isAuthenticated: false,
            initInProgress: false,
          };
        },
      }
    ),
    {
      name: 'auth-store',
    }
  )
);

// Any query that comes back with the backend's "token rejected" message tears
// the session down immediately, so an open tab lands on the login screen
// instead of sitting on a shell whose every widget errors. Registered here
// (rather than imported inside GraphQLClient) to keep the module graph acyclic.
setSessionDeadHandler((rejectedToken) => {
  const { isAuthenticated, tokens } = useAuthStore.getState();
  if (!isAuthenticated && !tokens?.accessToken) return; // already signed out
  // Only the CURRENT session's rejection may tear it down. Requests from a
  // previous session can resolve long after a re-login (SPA login keeps
  // in-flight fetches alive, and on a slow connection they straggle for tens
  // of seconds); acting on those killed the fresh session — and logout()'s
  // deleteToken then revoked its token server-side — trapping the user in a
  // login loop.
  if (rejectedToken !== tokens?.accessToken) {
    logger.warn('Ignoring token rejection for a non-current session token', {
      rejectedTokenTail: rejectedToken ? rejectedToken.slice(-8) : null,
    });
    return;
  }
  // The backend already refused this token, so there is nothing to revoke:
  // end the session locally and tell the user (logout() would fire
  // deleteToken and end it silently).
  void endExpiredSession('token rejected by the backend');
});

/**
 * An auth-shaped refusal (401, FORBIDDEN, "Access denied"…) on a request made
 * with the current token. Those also mean "not allowed" for features outside
 * a plan or allowlist, so they never end the session by themselves: the token
 * is re-validated, and only a definitive rejection ends it. One check at a
 * time, at most every SUSPECT_CHECK_MIN_INTERVAL_MS — a page full of refused
 * widgets must not turn into a burst of validation calls.
 */
const SUSPECT_CHECK_MIN_INTERVAL_MS = 15_000;
let suspectCheckInFlight = false;
let lastSuspectCheckAt = 0;

setSessionSuspectHandler((token) => {
  const { tokens } = useAuthStore.getState();
  if (!token || token !== tokens?.accessToken) return;
  const now = Date.now();
  if (
    suspectCheckInFlight ||
    now - lastSuspectCheckAt < SUSPECT_CHECK_MIN_INTERVAL_MS
  )
    return;
  lastSuspectCheckAt = now;
  suspectCheckInFlight = true;
  void (async () => {
    try {
      if (useAuthStore.getState().isTokenExpired()) {
        await endExpiredSession('access token expired');
        return;
      }
      const validation = await RealAuthService.validateTokenDetailed(token, {
        timeoutMs: 15_000,
      });
      // A re-login while the check ran: its verdict is about the old token.
      if (useAuthStore.getState().tokens?.accessToken !== token) return;
      if (validation.ok) return;
      if (validation.definitive) {
        await endExpiredSession(validation.reason);
        return;
      }
      sessionUnverified = true;
    } catch (error) {
      logger.warn('Session re-validation failed', { error });
    } finally {
      suspectCheckInFlight = false;
    }
  })();
});

/**
 * End a session we know is dead, WITHOUT calling `logout()`.
 *
 * `logout()` fires the `deleteToken` mutation, and the backend tracks tokens
 * server-side — revoking is permanent. The watchdog's verdicts come from this
 * client's clock (`expiresAt`) or from a token the backend has already
 * refused, so there is nothing left worth revoking and a clock-skew false
 * positive must not be able to kill a token that was actually still good.
 */
const clearDeadSession = async (reason: string): Promise<void> => {
  const { tokens, isAuthenticated } = useAuthStore.getState();
  if (!tokens?.accessToken && !isAuthenticated) return;

  logger.info('Ending dead session', { reason });
  sessionUnverified = false;
  analyticsReset();
  useAuthStore.setState({
    user: null,
    tokens: null,
    isAuthenticated: false,
    isLoading: false,
  });
  await clearSessionScopedData();
};

/**
 * End a session that expired or was rejected, and tell the user. Every path
 * that ends a session on its own goes through here (backend rejection,
 * re-validation, the watchdog, apiClient's refresh) so none of them can sign
 * the user out silently. `ProtectedRoute` then sends them to the login page
 * with the notice and a return URL.
 */
async function endExpiredSession(reason: string): Promise<void> {
  const { tokens, isAuthenticated } = useAuthStore.getState();
  if (!tokens?.accessToken && !isAuthenticated) return;
  noteSessionExpired();
  await clearDeadSession(reason);
}

/** How long the watchdog waits between network revalidation attempts. */
const REVALIDATE_MIN_INTERVAL_MS = 20_000;

/**
 * One watchdog pass. Cheap and network-free unless the session is flagged
 * unverified.
 */
export const revalidateSession = async (): Promise<void> => {
  const state = useAuthStore.getState();
  if (!state.tokens?.accessToken) return;

  // Local certainty first: `expiresAt` is decoded from the JWT, so an expired
  // token ends the session even when the backend is unreachable. This is the
  // same rule `initializeAuth` applies at boot — the watchdog just keeps
  // applying it for as long as the tab stays open.
  if (state.isTokenExpired()) {
    await endExpiredSession('access token expired');
    return;
  }

  // A session the backend has confirmed is fine needs no polling: a mid-session
  // revocation still arrives through the session-dead handler above, on the
  // very next query. Only an unresolved boot validation is worth re-asking.
  if (!sessionUnverified || !state.isAuthenticated) return;

  const now = Date.now();
  if (now - lastRevalidateAt < REVALIDATE_MIN_INTERVAL_MS) return;
  lastRevalidateAt = now;

  const validation = await RealAuthService.validateTokenDetailed(
    state.tokens.accessToken,
    { timeoutMs: 15_000 }
  );

  if (validation.ok) {
    sessionUnverified = false;
    useAuthStore.setState({ user: validation.user });
    return;
  }

  if (validation.definitive) {
    await endExpiredSession(validation.reason);
    return;
  }

  logger.debug('Session revalidation still inconclusive, will retry', {
    reason: validation.reason,
  });
};

/** How often the watchdog re-checks while the tab is open. */
const WATCHDOG_INTERVAL_MS = 30_000;

/**
 * Start the session watchdog. Mounted once by `AuthProvider`.
 *
 * `initializeAuth` runs exactly once per page load, which left two ways for a
 * dead session to outlive its own death in an open tab:
 *
 *  1. The token's `exp` passes while the tab is open. Nothing re-read
 *     `expiresAt`, so the app kept firing doomed requests and the user saw a
 *     grid of "Error Loading …" cards instead of the login screen.
 *  2. Boot validation came back indeterminate and the session was kept on the
 *     benefit of the doubt — correct, but terminal. Nothing ever asked again.
 *
 * Both end the same way for the user, and neither is recoverable without a
 * manual reload. The watchdog re-checks on a timer, when the tab becomes
 * visible again, and when the browser comes back online — the last two being
 * exactly the moments a laptop wakes up to a session that expired while it
 * was asleep.
 */
export const startSessionWatchdog = (): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const tick = () => {
    void revalidateSession();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') tick();
  };

  const intervalId = window.setInterval(tick, WATCHDOG_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', tick);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', tick);
  };
};
