/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { GraphQLClient, getGraphQLConfig } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { logger } from '../lib/loggerInstance';

interface CancelOrderInput {
  dealId: string;
  botId: string;
  orderId: string;
}

interface CancelOrderResponse {
  status: 'OK' | 'NOTOK';
  reason?: string;
  data?: any;
}

// Build an authenticated client per request. The shared `graphQLClient`
// singleton carries no auth token or paper-context, so a write mutation sent
// through it reaches the backend with no `token` header — the server can't
// populate `req.user`, and the write guard rejects it with "Cannot access".
// Mirror `useGraphQL`: read the token + paper/live mode at call time and
// construct a client that sends both the `token` and `paper-context` headers.
function createAuthenticatedClient(): GraphQLClient {
  const { tokens } = useAuthStore.getState();
  const { isLiveTrading } = useUIStore.getState();
  const { token, paperContext } = getGraphQLConfig(tokens, isLiveTrading);
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
  return new GraphQLClient(endpoint, token, paperContext);
}

// Hook for canceling terminal deal orders
export function useCancelTerminalOrder() {
  const queryClient = useQueryClient();

  return useMutation<CancelOrderResponse, Error, CancelOrderInput>({
    mutationFn: async ({ dealId, orderId }) => {
      logger.info('[useCancelTerminalOrder] Canceling terminal order:', {
        dealId,
        orderId,
      });

      const { query, variables } = botQueries.cancelTerminalDealOrder({
        dealId,
        orderId,
      });

      const response = await createAuthenticatedClient().request<{
        cancelTerminalDealOrder: CancelOrderResponse;
      }>(query, variables);

      if (response.cancelTerminalDealOrder.status !== 'OK') {
        throw new Error(
          response.cancelTerminalDealOrder.reason || 'Failed to cancel order'
        );
      }

      return response.cancelTerminalDealOrder;
    },
    onSuccess: (data, variables) => {
      logger.info('[useCancelTerminalOrder] Order canceled successfully:', {
        dealId: variables.dealId,
        orderId: variables.orderId,
        response: data,
      });

      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['dcaBotList'] });
      queryClient.invalidateQueries({ queryKey: ['getDCADeals'] });
    },
    onError: (error, variables) => {
      logger.error('[useCancelTerminalOrder] Failed to cancel order:', {
        dealId: variables.dealId,
        orderId: variables.orderId,
        error: error.message,
      });
    },
  });
}

// Hook for canceling pending add funds orders
export function useCancelPendingAddFundsOrder() {
  const queryClient = useQueryClient();

  return useMutation<CancelOrderResponse, Error, CancelOrderInput>({
    mutationFn: async ({ dealId, botId, orderId }) => {
      logger.info(
        '[useCancelPendingAddFundsOrder] Canceling pending add funds order:',
        { dealId, botId, orderId }
      );

      const { query, variables } = botQueries.cancelPendingAddFundsDealOrder({
        dealId,
        botId,
        orderId,
      });

      const response = await createAuthenticatedClient().request<{
        cancelPendingAddFundsDealOrder: CancelOrderResponse;
      }>(query, variables);

      if (response.cancelPendingAddFundsDealOrder.status !== 'OK') {
        throw new Error(
          response.cancelPendingAddFundsDealOrder.reason ||
            'Failed to cancel pending order'
        );
      }

      return response.cancelPendingAddFundsDealOrder;
    },
    onSuccess: (data, variables) => {
      logger.info(
        '[useCancelPendingAddFundsOrder] Pending order canceled successfully:',
        {
          dealId: variables.dealId,
          botId: variables.botId,
          orderId: variables.orderId,
          response: data,
        }
      );

      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['dcaBotList'] });
      queryClient.invalidateQueries({ queryKey: ['getDCADeals'] });
    },
    onError: (error, variables) => {
      logger.error(
        '[useCancelPendingAddFundsOrder] Failed to cancel pending order:',
        {
          dealId: variables.dealId,
          botId: variables.botId,
          orderId: variables.orderId,
          error: error.message,
        }
      );
    },
  });
}

interface BuyBaseRemainderInput {
  dealId: string;
  botId: string;
}

// Hook for buying the unfilled rest of a part-filled LIMIT base order at
// market: the backend cancels the resting remainder order and merges a market
// fill for the remaining quantity into the deal.
export function useBuyDealBaseRemainder() {
  const queryClient = useQueryClient();

  return useMutation<CancelOrderResponse, Error, BuyBaseRemainderInput>({
    mutationFn: async ({ dealId, botId }) => {
      logger.info('[useBuyDealBaseRemainder] Buying base remainder:', {
        dealId,
        botId,
      });

      const { query, variables } = botQueries.buyDealBaseRemainder({
        dealId,
        botId,
      });

      const response = await createAuthenticatedClient().request<{
        buyDealBaseRemainder: CancelOrderResponse;
      }>(query, variables);

      if (response.buyDealBaseRemainder.status !== 'OK') {
        throw new Error(
          response.buyDealBaseRemainder.reason ||
            'Failed to buy the rest at market'
        );
      }

      return response.buyDealBaseRemainder;
    },
    onSuccess: (data, variables) => {
      logger.info('[useBuyDealBaseRemainder] Base remainder bought:', {
        dealId: variables.dealId,
        botId: variables.botId,
        response: data,
      });

      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['dcaBotList'] });
      queryClient.invalidateQueries({ queryKey: ['getDCADeals'] });
    },
    onError: (error, variables) => {
      logger.error('[useBuyDealBaseRemainder] Failed to buy base remainder:', {
        dealId: variables.dealId,
        botId: variables.botId,
        error: error.message,
      });
    },
  });
}

// Generic order cancellation hook that determines the appropriate mutation
export function useCancelOrder() {
  const cancelTerminal = useCancelTerminalOrder();
  const cancelPending = useCancelPendingAddFundsOrder();

  return {
    cancelTerminalOrder: cancelTerminal.mutateAsync,
    cancelPendingOrder: cancelPending.mutateAsync,
    isLoading: cancelTerminal.isPending || cancelPending.isPending,
    error: cancelTerminal.error || cancelPending.error,
  };
}
