import { useMutation } from '@tanstack/react-query';
import { GraphQLClient, type ReturnResult } from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { logger } from '@/lib/loggerInstance';

export interface RequestMagicLinkInput {
  email: string;
  redirectPath?: string;
}

export interface ConsumeMagicLinkInput {
  token: string;
  timezone?: string;
  termsAccepted?: boolean;
}

export interface ConsumeMagicLinkData {
  token?: string;
  isNewUser?: boolean;
  pendingTerms?: boolean;
  isOTP?: boolean;
  email?: string;
}

/**
 * Hook for requesting an emailed sign-in link. Unauthenticated — no
 * token required. Returns a BasicResponse-shaped result; we only care
 * about status/reason.
 */
export function useRequestMagicLink() {
  return useMutation({
    mutationFn: async (input: RequestMagicLinkInput) => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint);

      const { query, variables } = GraphQlQuery.requestMagicLink(input);

      logger.info('Requesting magic link', { email: input.email });

      const result = await client.request<{
        requestMagicLink: ReturnResult<unknown>;
      }>(query, variables);

      if (result.requestMagicLink.status !== 'OK') {
        throw new Error(
          result.requestMagicLink.reason || 'Failed to request magic link'
        );
      }

      return result.requestMagicLink;
    },
    onError: (error) => {
      logger.error('Failed to request magic link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Hook for consuming a magic-link token. Returns the full
 * ConsumeMagicLinkResult so callers can branch on pendingTerms (sign-up
 * needs ToS step), data.token (signed in), or error.
 */
export function useConsumeMagicLink() {
  return useMutation({
    mutationFn: async (input: ConsumeMagicLinkInput) => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint);

      const { query, variables } = GraphQlQuery.consumeMagicLink(input);

      const result = await client.request<{
        consumeMagicLink: ReturnResult<ConsumeMagicLinkData>;
      }>(query, variables);

      if (result.consumeMagicLink.status !== 'OK') {
        throw new Error(
          result.consumeMagicLink.reason || 'Failed to consume magic link'
        );
      }

      return result.consumeMagicLink;
    },
    onError: (error) => {
      logger.error('Failed to consume magic link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
