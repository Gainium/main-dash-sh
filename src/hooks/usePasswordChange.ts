import { useMutation } from '@tanstack/react-query';
import { GraphQLClient, type ReturnResult } from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { useAuthStore } from '@/stores/authStore';

import { logger } from '@/lib/loggerInstance';

export interface PasswordChangeInput {
  password: string;
}

export interface PasswordValidation {
  minLength: boolean;
  hasNumber: boolean;
  hasCapital: boolean;
  passwordsMatch: boolean;
}

/**
 * Validates password strength and matching
 */
export function validatePassword(
  password: string,
  confirmPassword: string
): PasswordValidation {
  return {
    minLength: password.length >= 6,
    hasNumber: /\d/.test(password),
    hasCapital: /[A-Z]/.test(password),
    passwordsMatch: password === confirmPassword && password.length > 0,
  };
}

/**
 * Hook for changing user password
 */
export function usePasswordChange() {
  const { tokens } = useAuthStore();

  return useMutation({
    mutationFn: async (input: PasswordChangeInput) => {
      if (!tokens?.accessToken) {
        throw new Error('No authentication token available');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      // ✅ Use paper context like old dashboard for consistency
      const client = new GraphQLClient(endpoint, tokens.accessToken, true);

      const { query, variables } = GraphQlQuery.changePassword(input);

      logger.info('Changing user password');

      const result = await client.request<{
        changePassword: ReturnResult<string>;
      }>(query, variables);

      if (result.changePassword.status !== 'OK') {
        throw new Error(
          result.changePassword.reason || 'Failed to change password'
        );
      }

      return result.changePassword;
    },
    onSuccess: (data) => {
      logger.info('Password changed successfully', { response: data });

      // Nothing to invalidate: the password is not part of the user profile
      // payload, and `['user']` is the exchange/backtest cache key rather
      // than the profile's — invalidating it here only cost a refetch.
    },
    onError: (error) => {
      logger.error('Failed to change password', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Hook that combines password validation and change functionality
 */
export function usePasswordOperations() {
  const passwordChange = usePasswordChange();

  return {
    // Operations
    changePassword: passwordChange.mutate,

    // States
    isChangingPassword: passwordChange.isPending,
    changePasswordError: passwordChange.error,
    changePasswordSuccess: passwordChange.isSuccess,

    // Utilities
    validatePassword,

    // Reset states
    reset: passwordChange.reset,
  };
}
