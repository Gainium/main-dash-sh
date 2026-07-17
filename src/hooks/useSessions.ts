import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/loggerInstance';

/** One active login session (a live tokens[] row on the backend). Admin
 *  impersonation / demo sessions are filtered out server-side and never
 *  reach the client. */
export interface UserSession {
  id: string;
  /** Login method that minted the session: 'web' (password), 'email'
   *  (magic link), 'webauthn' (passkey), or an OAuth provider name. */
  source: string | null;
  /** Human device label derived from the User-Agent, e.g. "Chrome on macOS". */
  device: string | null;
  /** IP address the session signed in from. */
  ip: string | null;
  /** Approx location for that IP, e.g. "Lisbon, Portugal" (may be null). */
  location: string | null;
  createdAt: string | null;
  expiredAt: string | null;
  /** True for the session making this request — it can't be revoked. */
  current: boolean;
}

const endpoint = () =>
  import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

/** Fetches the user's active sessions. */
export function useActiveSessions() {
  const { tokens } = useAuthStore();
  const token = tokens?.accessToken;

  return useQuery({
    queryKey: ['activeSessions'],
    enabled: !!token,
    queryFn: async (): Promise<UserSession[]> => {
      if (!token) throw new Error('No authentication token available');
      const client = new GraphQLClient(endpoint(), token, true);
      const { query } = GraphQlQuery.activeSessions();
      const result = await client.request<{
        activeSessions: ReturnResult<UserSession[]>;
      }>(query);
      if (result.activeSessions.status !== 'OK') {
        throw new Error(
          result.activeSessions.reason || 'Failed to load sessions'
        );
      }
      return result.activeSessions.data ?? [];
    },
  });
}

/** Revokes a single other session by id. */
export function useRevokeSession() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = tokens?.accessToken;
      if (!token) throw new Error('No authentication token available');
      const client = new GraphQLClient(endpoint(), token, true);
      const { query, variables } = GraphQlQuery.revokeSession({ id });
      const result = await client.request<{
        revokeSession: ReturnResult<null>;
      }>(query, variables);
      if (result.revokeSession.status !== 'OK') {
        throw new Error(
          result.revokeSession.reason || 'Failed to revoke session'
        );
      }
      return result.revokeSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
    },
    onError: (error) => {
      logger.error('Failed to revoke session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/** Logs out every other session, keeping only the current one. */
export function useLogoutOtherSessions() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = tokens?.accessToken;
      if (!token) throw new Error('No authentication token available');
      const client = new GraphQLClient(endpoint(), token, true);
      const { query } = GraphQlQuery.logoutOtherSessions();
      const result = await client.request<{
        logoutOtherSessions: ReturnResult<null>;
      }>(query);
      if (result.logoutOtherSessions.status !== 'OK') {
        throw new Error(
          result.logoutOtherSessions.reason || 'Failed to log out sessions'
        );
      }
      return result.logoutOtherSessions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
    },
    onError: (error) => {
      logger.error('Failed to log out other sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/** Combined session-management operations for the Security settings card. */
export function useSessionOperations() {
  const sessions = useActiveSessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOtherSessions();

  return {
    sessions: sessions.data ?? [],
    isLoading: sessions.isLoading,
    error: sessions.error,
    refetch: sessions.refetch,

    revokeSession: revoke.mutate,
    revokingId: revoke.isPending ? revoke.variables : null,

    logoutOtherSessions: logoutOthers.mutate,
    isLoggingOutOthers: logoutOthers.isPending,
  };
}
