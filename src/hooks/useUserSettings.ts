/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  GraphQLClient,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { useAuthStore } from '@/stores/authStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { logger } from '@/lib/loggerInstance';

// Per-user allowed login methods (cloud-only). Missing when the backend
// doesn't expose the field (self-hosted) — treat absent as all-allowed.
export interface AllowedLoginMethods {
  password: boolean;
  google: boolean;
  discord: boolean;
  emailLink: boolean;
  passkey: boolean;
}

// Types for user settings - matches full user query response
export interface UserSettingsData {
  _id: string;
  username: string;
  timezone: string;
  weekStart: string;
  name: string;
  lastName?: string;
  picture?: string;
  nickname?: string;
  // License key shape, populated by the user resolver.
  licenseKey?: {
    key?: string | null;
    isPremium?: boolean | null;
  } | null;
  otp?: {
    otp_enabled: boolean;
  };
  allowedLoginMethods?: AllowedLoginMethods;
  apiKeys?: Array<{
    _id: string;
    created: string;
    expired: string;
    permission: 'read' | 'write';
    name?: string;
    paperContext?: boolean;
    botId?: string;
  }>;
  // Additional fields from full user query
  bigAccount?: boolean;
  demo?: boolean;
  theme?: string;
  lastChangeLog?: string;
  balance?: number;
  hasExchanges?: boolean;
  hasPaperExchanges?: boolean;
  hasLiveExchanges?: boolean;
  subscription?: any;
  paperContext?: boolean;
  importAsPaper?: boolean;
  switchPaperIcon?: boolean;
  shouldOnBoard?: boolean;
  shouldOnBoardExchange?: boolean;
  affiliate?: any;
  notifications?: any;
  videos?: any;
  onboardingSteps?: any;
  groups?: any;
  credits?: any;
  discourseId?: string;
  rewards?: any;
  tg?: any;
  alerts?: any;
}

export interface UserSettingsInput {
  timezone?: string;
  theme?: string;
  paperContext?: boolean;
  shouldOnBoard?: boolean;
  shouldOnBoardExchange?: boolean;
  name?: string;
  lastName?: string;
  nickname?: string;
}

export interface TimezoneInput {
  timezone: string;
  weekStart: string;
}

/**
 * Hook for fetching user settings data
 * Following old dashboard pattern: use paperContext: true for consistency
 */
export function useUserSettings() {
  const { tokens } = useAuthStore();
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

  const result = useQuery({
    queryKey: ['user-settings'], // Simplified key
    queryFn: async () => {
      if (!tokens?.accessToken) {
        throw new Error('No authentication token available');
      }

      const client = new GraphQLClient(endpoint, tokens.accessToken, true);
      const { query } = GraphQlQuery.userSettings();
      const response = await client.request<{
        user: ReturnResult<UserSettingsData>;
      }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

      return response.user;
    },
    enabled: !!tokens?.accessToken,
    staleTime: 0,
    gcTime: 0,
  });

  return {
    user: result.data?.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Hook for updating user settings
 * Following old dashboard pattern: use paperContext: true for consistency
 */
export function useUpdateUserSettings() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UserSettingsInput) => {
      if (!tokens?.accessToken) {
        throw new Error('No authentication token available');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      // Don't pass paperContext for user settings mutations - matches old dashboard
      // which creates GraphQlFetch(token) without paperContext for settings operations
      const client = new GraphQLClient(endpoint, tokens.accessToken);

      const { query, variables } = GraphQlQuery.setUserSettings(input);

      const result = await client.request<{
        userSettings: ReturnResult<unknown>;
      }>(query, variables);

      if (result.userSettings.status !== 'OK') {
        throw new Error(
          result.userSettings.reason || 'Failed to update user settings'
        );
      }

      return result.userSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'user' ||
          query.queryKey[0] === 'user-settings',
      });
    },
    onError: (error) => {
      logger.error('Failed to update user settings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Hook for updating timezone and week start
 * Following old dashboard pattern: use paperContext: true for consistency
 */
export function useUpdateTimezone() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TimezoneInput) => {
      if (!tokens?.accessToken) {
        throw new Error('No authentication token available');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      // Don't pass paperContext for settings mutations - matches old dashboard
      const client = new GraphQLClient(endpoint, tokens.accessToken);

      const { query, variables } = GraphQlQuery.setTimezone(input);

      logger.info('Updating timezone settings', { input });

      const result = await client.request<{
        setTimezone: ReturnResult<unknown>;
      }>(query, variables);

      if (result.setTimezone.status !== 'OK') {
        throw new Error(
          result.setTimezone.reason || 'Failed to update timezone'
        );
      }

      return result.setTimezone;
    },
    onSuccess: (data, variables) => {
      logger.info('Timezone updated successfully', {
        variables,
        response: data,
      });

      // ✅ Invalidate all user-related queries following old dashboard pattern
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'user' || query.queryKey[0] === 'user-settings',
      });
    },
    onError: (error, variables) => {
      logger.error('Failed to update timezone', {
        error: error instanceof Error ? error.message : 'Unknown error',
        variables,
      });
    },
  });
}

/**
 * Hook for updating the per-user allowed login methods (cloud-only).
 * The backend rejects sets that would lock the user out; surface that
 * reason to the caller so the UI can revert the optimistic toggle.
 */
export function useSetAllowedLoginMethods() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AllowedLoginMethods) => {
      if (!tokens?.accessToken) {
        throw new Error('No authentication token available');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, tokens.accessToken);

      const { query, variables } =
        GraphQlQuery.setAllowedLoginMethods(input);

      const result = await client.request<{
        setAllowedLoginMethods: ReturnResult<AllowedLoginMethods>;
      }>(query, variables);

      if (result.setAllowedLoginMethods.status !== 'OK') {
        throw new Error(
          result.setAllowedLoginMethods.reason ||
            'Failed to update login methods'
        );
      }

      return result.setAllowedLoginMethods.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'user' ||
          query.queryKey[0] === 'user-settings',
      });
    },
    onError: (error) => {
      logger.error('Failed to update allowed login methods', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Combined hook for all user settings operations
 */
export function useUserSettingsOperations() {
  const userSettings = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const updateTimezone = useUpdateTimezone();

  return {
    // Data
    user: userSettings.user,
    isLoading: userSettings.isLoading,
    error: userSettings.error,
    refetch: userSettings.refetch,

    // Operations
    updateUserSettings: updateUserSettings.mutate,
    updateTimezone: updateTimezone.mutate,
    resetSettingsState: updateUserSettings.reset,
    resetTimezoneState: updateTimezone.reset,

    // Loading states
    isUpdatingSettings: updateUserSettings.isPending,
    isUpdatingTimezone: updateTimezone.isPending,

    // Success states
    isSettingsUpdateSuccess: updateUserSettings.isSuccess,
    isTimezoneUpdateSuccess: updateTimezone.isSuccess,

    // Error states
    updateSettingsError: updateUserSettings.error,
    updateTimezoneError: updateTimezone.error,
    isSettingsUpdateError: updateUserSettings.isError,
    isTimezoneUpdateError: updateTimezone.isError,
  };
}
