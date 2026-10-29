import { useMutation } from '@tanstack/react-query';
import { GraphQLClient, type ReturnResult } from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { logger } from '@/lib/loggerInstance';

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  token: string;
  /** 2FA account: `token` is a short-lived pre-OTP jwt, not a session. */
  isOTP?: boolean | null;
}

/**
 * Hook for requesting a password-reset email. Unauthenticated.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (input: RequestPasswordResetInput) => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint);

      const { query, variables } = GraphQlQuery.requestPasswordReset(input);

      logger.info('Requesting password reset', { email: input.email });

      const result = await client.request<{
        requestPasswordReset: ReturnResult<unknown>;
      }>(query, variables);

      if (result.requestPasswordReset.status !== 'OK') {
        throw new Error(
          result.requestPasswordReset.reason ||
            'Failed to request password reset'
        );
      }

      return result.requestPasswordReset;
    },
    onError: (error) => {
      logger.error('Failed to request password reset', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Hook for consuming a password-reset token and setting a new password.
 * Unauthenticated; returns a fresh JWT on success.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: ResetPasswordInput) => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint);

      const { query, variables } = GraphQlQuery.resetPassword(input);

      logger.info('Submitting password reset');

      const result = await client.request<{
        resetPassword: ReturnResult<ResetPasswordResponse>;
      }>(query, variables);

      if (result.resetPassword.status !== 'OK' || !result.resetPassword.data) {
        throw new Error(
          result.resetPassword.reason || 'Failed to reset password'
        );
      }

      return result.resetPassword.data;
    },
    onError: (error) => {
      logger.error('Failed to reset password', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
