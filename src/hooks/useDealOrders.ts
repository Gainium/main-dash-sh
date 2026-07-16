import { useOrderStore } from '@/stores/live';
import { useEffect, useMemo } from 'react';
import type { ReturnResult } from '../lib/api/types';
import { BotTypesEnum, type OrderData } from '../types';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import { logger } from '../lib/loggerInstance';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import {
  GraphQLClient,
  getGraphQLConfig,
  DEFAULT_READ_TIMEOUT_MS,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export interface UseDealOrdersResult {
  data: ReturnResult<OrderData[]> | null;
  orders: OrderData[];
  total: number;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

// Helper function to build GraphQL query for deal orders
function buildDealOrdersQuery(
  botId: string,
  dealId: string,
  botType: BotTypesEnum,
  shareId?: string | null
) {
  const input = {
    id: botId,
    dealId: dealId,
    all: true,
    ...(shareId ? { shareId } : {}),
  };

  const query =
    botType === BotTypesEnum.combo
      ? dealQueries.getComboDealOrders
      : dealQueries.getDealOrders;

  const key =
    botType === BotTypesEnum.combo ? 'getComboDealOrders' : 'getDealOrders';

  return { query: query(input), key };
}

// Standalone function to fetch deal orders
export async function fetchDealOrders(
  botId: string,
  dealId: string,
  botType: BotTypesEnum = BotTypesEnum.dca
): Promise<OrderData[]> {
  try {
    // Get auth tokens and trading mode
    const { tokens } = useAuthStore.getState();
    const { isLiveTrading, tradingMode } = useUIStore.getState();

    if (!tokens?.accessToken) {
      logger.warn('[fetchDealOrders] No access token available');
      return [];
    }

    const { query: gql } = buildDealOrdersQuery(botId, dealId, botType);

    // Create GraphQL client with current config
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const config = getGraphQLConfig(tokens, isLiveTrading);

    // In demo mode, ALWAYS use paper context
    const isDemoMode = tradingMode === 'demo';
    const paperContext = isDemoMode ? true : config.paperContext;

    const client = new GraphQLClient(endpoint, config.token, paperContext);

    const result = await client.request<{
      [key: string]: ReturnResult<OrderData[]>;
    }>(gql.query, gql.variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

    // Extract operation name or field name from query
    const operationMatch = gql.query.match(/(?:query|mutation)\s+(\w+)/);
    const fieldMatch = gql.query.match(/{\s*(\w+)(?:\s*\(|\s*{|\s)/);
    const resultKey = fieldMatch?.[1] || operationMatch?.[1];

    const data = resultKey ? result[resultKey] : Object.values(result)[0];

    if (data?.status === 'OK' && data.data) {
      return data.data;
    } else {
      logger.error(
        '[fetchDealOrders] API error:',
        data?.reason || 'Unknown error'
      );
      return [];
    }
  } catch (error) {
    logger.error('[fetchDealOrders] Error fetching orders:', error);
    return [];
  }
}

export function useDealOrders(
  botId: string,
  dealId: string,
  botType: BotTypesEnum = BotTypesEnum.dca
): UseDealOrdersResult {
  // 1. Read from Zustand store (instant, filtered by botId)
  // Select the Record directly to avoid creating new array reference on every render
  const ordersRecord = useOrderStore().getOrders(botId);
  const hasHydrated = useOrderStore((state) => state._hasHydrated);

  // Convert to array for specific botId (memoized by ordersRecord)
  const ordersFromStore = useMemo(() => {
    const orders = [...(ordersRecord || [])];
    return orders.filter((order: OrderData) => order.dealId === dealId);
  }, [ordersRecord, dealId]);

  // Avoid firing the query when botId is missing/empty
  const hasValidId = useMemo(
    () => typeof botId === 'string' && botId.trim().length > 0,
    [botId]
  );
  const hasValidDealId = useMemo(
    () => typeof dealId === 'string' && dealId.trim().length > 0,
    [dealId]
  );

  const { shareId } = useShareContext();

  // Use shared query building logic
  const { query: gql, key } = useMemo(
    () => buildDealOrdersQuery(botId, dealId, botType, shareId),
    [botId, dealId, botType, shareId]
  );

  const enabled = useMemo(
    () => hasValidId && hasValidDealId,
    [hasValidId, hasValidDealId]
  );

  // Use the GraphQL hook with proper caching
  const queryResult = useGraphQL<OrderData[]>(key, gql, {
    // Disable the query until we have a valid id to prevent backend cast errors
    enabled,
    shareId,
  });

  // Update store when query succeeds and handle sequential auto-loading
  useEffect(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data.data;
      const apiOrders = response || [];
      const splitOrdersByStatus = apiOrders.reduce(
        (acc, v) => {
          if (v.status === 'FILLED') {
            acc.filled.push(v);
          } else {
            acc.new.push(v);
          }
          return acc;
        },
        { new: [], filled: [] } as { new: OrderData[]; filled: OrderData[] }
      );

      if (splitOrdersByStatus.new.length) {
        useOrderStore
          .getState()
          .updateOrders(botId, splitOrdersByStatus.new, 'new');
      }
      if (splitOrdersByStatus.filled.length) {
        useOrderStore
          .getState()
          .updateOrders(botId, splitOrdersByStatus.filled, 'filled');
      }
      // This fetch (`all: true`) is the authoritative order set for the deal,
      // so drop any cached order it no longer returns — otherwise an order
      // canceled elsewhere (or in a prior session) lingers because
      // `updateOrders` only merges. Runs even when the response is empty.
      useOrderStore
        .getState()
        .reconcileDealOrders(
          botId,
          dealId,
          apiOrders.map((o) => o.clientOrderId)
        );
      logger.info(
        `[useDealOrders] Updated store with ${splitOrdersByStatus.new.length} new orders and ${splitOrdersByStatus.filled.length} filled orders for deal ${dealId} of bot ${botId}`
      );
    }
    if (queryResult.error) {
      logger.error('[useDealOrders] Query error:', queryResult.error.message);
    }
  }, [
    queryResult.data,
    queryResult.isLoading,
    dealId,
    botId,
    queryResult.error,
  ]);

  // Get total from API response (for pagination)
  const apiTotal = useMemo(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data.data;
      return response?.length || 0;
    }
    return 0;
  }, [queryResult.data]);

  // Only show loading on initial load (when store data is empty) or during
  // auto-loading. Also treat pre-hydration as loading so the table doesn't
  // flash empty during the IDB read window on hard refresh / HMR.
  const isInitialLoad = useMemo(
    () =>
      !hasHydrated || (ordersFromStore.length === 0 && queryResult.isLoading),
    [hasHydrated, ordersFromStore.length, queryResult.isLoading]
  );
  const hasValidResponse = useMemo(
    () => queryResult.data?.status === 'OK' || ordersFromStore.length > 0,
    [queryResult.data, ordersFromStore.length]
  );
  const result = useMemo(
    () => ({
      data: queryResult.data || null,
      orders: ordersFromStore,
      total: apiTotal,
      hasValidResponse,
      isLoading: isInitialLoad, // Only show loading on first load
      isError: queryResult.isError,
      error: queryResult.error,
      refetch: queryResult.refetch,
    }),
    [queryResult, ordersFromStore, apiTotal, hasValidResponse, isInitialLoad]
  );
  return result;
}
