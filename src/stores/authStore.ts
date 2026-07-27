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
                logger.error('Failed to process cookie token:', error);
              }
            }

            // Continue with normal stored token validation
            if (tokens?.accessToken) {
              // Check if token is expired first (client-side check)
              if (get().isTokenExpired()) {
                logger.info('Stored token is expired, clearing auth state');
                set({
                  user: null,
                  tokens: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
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
                set({
                  user: null,
                  tokens: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                return;
              }

              // Indeterminate failure (client timeout, network error, 5xx):
              // we never learned whether the token is valid, so KEEP the
              // session. Wiping it here is what used to log users out of
              // prod whenever the API had a bad moment. Queries retry on
              // their own; the next boot revalidates.
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
          // For real auth with long-lived tokens, we just validate the current token
          const { tokens } = get();
          if (!tokens?.accessToken) {
            return false;
          }

          try {
            const userData = await RealAuthService.validateToken(
              tokens.accessToken
            );
            if (typeof userData === 'object' && userData !== null) {
              set({ isLoading: false, user: userData });
              return true;
            } else {
              set({
                tokens: null,
                isAuthenticated: false,
                isLoading: false,
                user: null,
              });
              return false;
            }
          } catch (error) {
            logger.error('Token validation failed:', error);
            set({
              tokens: null,
              isAuthenticated: false,
              isLoading: false,
            });
            return false;
          }
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
