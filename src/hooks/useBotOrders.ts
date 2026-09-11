import { useOrderStore } from '@/stores/live';
import { useEffect, useMemo, useState } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { ReturnResult } from '../lib/api/types';
import { BotTypesEnum, type OrderData } from '../types';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import { logger } from '../lib/loggerInstance';
import { getOrderExecutionTime } from '../utils/orders/executionTime';

export type BotOrder = OrderData; /* {
  clientOrderId: string;
  reduceFundsId?: string;
  origQty: string;
  executedQty: string;
  price: string;
  side: string;
  status: string;
  time: number;
  transactTime: number;
  type: string;
  updateTime: number;
  botId: string;
  userId: string;
  typeOrder: string;
  baseAsset: string;
  quoteAsset: string;
  dealId: string;
  tpSlTarget?: string;
  sl?: boolean;
  acBefore?: number;
  acAfter?: number;
  symbol: string;
  exchange: string;
} */

export interface BotOrdersData {
  orders: BotOrder[];
  page: number;
  total: number;
}

export interface UseBotOrdersOptions {
  status?: string;
  page?: number;
  pageSize?: number;
  autoPaginate?: boolean; // Whether to auto-load more pages (default: true)
}

export interface UseBotOrdersResult {
  data: ReturnResult<BotOrdersData> | null;
  orders: BotOrder[];
  total: number;
  page: number;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useBotOrders(
  botId: string,
  botType: BotTypesEnum = BotTypesEnum.dca,
  options: UseBotOrdersOptions = {}
): UseBotOrdersResult {
  // Auto-loading pagination state - maximum 2 pages
  const [currentPageLoading, setCurrentPageLoading] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([0]));
  const maxPages = 2; // Maximum 2 pages for performance

  // 1. Read from Zustand store (instant, filtered by botId)
  // Select the Record directly to avoid creating new array reference on every render
  const ordersRecord = useOrderStore().getOrders(botId);
  const hasHydrated = useOrderStore((state) => state._hasHydrated);

  // Convert to array for specific botId (memoized by ordersRecord)
  const ordersFromStore = useMemo(() => {
    const orders = [...(ordersRecord || [])];

    // Filter by status if provided
    if (options.status) {
      return orders.filter(
        (order: OrderData) => order.status === options.status
      );
    }

    return orders;
  }, [ordersRecord, options.status]);

  // Avoid firing the query when botId is missing/empty
  const hasValidId = useMemo(
    () => typeof botId === 'string' && botId.trim().length > 0,
    [botId]
  );

  // When the page is opened via a ?share=<id> URL we need to forward
  // that shareId to the backend so it can authorize the public read,
  // and tell useGraphQL to send the request in demo / no-token mode.
  const { shareId } = useShareContext();

  // Prepare input for GraphQL query
  const input = useMemo(
    () => ({
      id: botId,
      type: botType,
      status: options.status || '', // Use the status from options if provided
      page: currentPageLoading, // Use current page being loaded
      pageSize: options.pageSize || 500, // Reduced page size for better performance
      ...(shareId ? { shareId } : {}),
    }),
    [botId, botType, options.status, currentPageLoading, options.pageSize, shareId]
  );

  // Get the query and variables from botQueries

  // Use the GraphQL hook with proper caching
  const queryResult = useGraphQL<BotOrdersData>(
    'getBotOrders',
    botQueries.getBotOrders(input),
    {
      // Disable the query until we have a valid id to prevent backend cast errors
      enabled: hasValidId,
      shareId,
    }
  );

  const [intermediateOrders, setIntermediateOrders] = useState<OrderData[]>([]);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);

  // Update store when query succeeds and handle sequential auto-loading
  useEffect(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data.data as unknown as BotOrdersData;
      const apiOrders = response.orders || [];
      const total = response.total || 0;
      const pageSize = options.pageSize || 500;

      setIntermediateOrders((prev) => [
        ...new Map(
          [...prev, ...apiOrders].map((order) => [order.clientOrderId, order])
        ).values(),
      ]); // Deduplicate by clientOrderId

      // Check if we should load more pages (only if query is not loading to ensure sequential loading)
      const shouldContinueLoading =
        options.autoPaginate &&
        !queryResult.isLoading && // Wait for current query to finish
        currentPageLoading < maxPages - 1 && // Haven't reached max pages (2)
        apiOrders.length === pageSize && // Current page is full
        (currentPageLoading + 1) * pageSize < total; // More data available
      if (shouldContinueLoading) {
        const nextPage = currentPageLoading + 1;
        if (!loadedPages.has(nextPage)) {
          setLoadedPages((prev) => new Set([...prev, nextPage]));

          // Add a small delay to ensure sequential loading and prevent race conditions
          setTimeout(() => {
            setCurrentPageLoading(nextPage);
          }, 100);
        }
      } else {
        // All pages loaded - mark loading as complete
        setIsLoadingComplete(true);
      }
    }
  }, [
    queryResult.data,
    queryResult.isLoading,
    currentPageLoading,
    loadedPages,
    options.pageSize,
    // Depend on the specific primitive the effect reads, not the whole
    // `options` object — callers (e.g. useGridPage) pass a fresh object
    // literal every render, which made this effect re-run on every render
    // and call setIntermediateOrders() with a new array reference,
    // producing an infinite render loop once the query resolved.
    options.autoPaginate,
  ]);

  // Debounced store update - only update when loading is complete
  useEffect(() => {
    if (isLoadingComplete && intermediateOrders.length > 0) {
      // Use a debounce timeout to prevent rapid updates
      const timeoutId = setTimeout(() => {
        // Determine order type based on status
        const orderType = input.status === 'FILLED' ? 'filled' : 'new';

        useOrderStore
          .getState()
          .updateOrders(botId, intermediateOrders, orderType);

        logger.info(
          `[useBotOrders] Updated store with ${intermediateOrders.length} orders for bot ${botId}`
        );
        setIntermediateOrders([]); // Clear intermediate orders after updating
        setIsLoadingComplete(false);
      }, 50); // 50ms debounce

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isLoadingComplete, intermediateOrders, botId, input.status]);

  // Log errors
  if (queryResult.error) {
    logger.error('[useBotOrders] Query error:', queryResult.error.message);
  }

  // Get total from API response (for pagination)
  const apiTotal = useMemo(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data as unknown as BotOrdersData;
      return response.total || 0;
    }
    return 0;
  }, [queryResult.data]);

  // Reset pagination state when filter changes
  useEffect(() => {
    setCurrentPageLoading(0);
    setLoadedPages(new Set([0]));
    setIntermediateOrders([]); // Clear accumulated orders
    setIsLoadingComplete(false); // Reset loading completion state
  }, [botId, botType, options.status]);

  // Only show loading on initial load (when store data is empty) or during
  // auto-loading. Also treat pre-hydration as loading so the table doesn't
  // flash empty during the IDB read window on hard refresh / HMR.
  const isInitialLoad = useMemo(
    () =>
      !hasHydrated ||
      (ordersFromStore.length === 0 &&
        (queryResult.isLoading || !isLoadingComplete)),
    [
      hasHydrated,
      ordersFromStore.length,
      queryResult.isLoading,
      isLoadingComplete,
    ]
  );
  const hasValidResponse =
    queryResult.data?.status === 'OK' || ordersFromStore.length > 0;

  // Extract total and page from query result
  const total = apiTotal || ordersFromStore.length;
  const page = options.page || 0;

  const result = useMemo(
    () => ({
      data: queryResult.data || null,
      orders: ordersFromStore,
      total,
      page,
      hasValidResponse,
      isLoading: isInitialLoad, // Only show loading on first load
      isError: queryResult.isError,
      error: queryResult.error,
      refetch: queryResult.refetch,
    }),
    [queryResult, ordersFromStore, total, page, hasValidResponse, isInitialLoad]
  );
  return result;
}

// Helper functions for order status and side mapping
export const mapOrderStatus = (
  status: string
): 'pending' | 'partial' | 'filled' | 'cancelled' => {
  switch (status.toLowerCase()) {
    case 'new':
    case 'pending':
      return 'pending';
    case 'partially_filled':
      return 'partial';
    case 'filled':
      return 'filled';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
};

// Map order type to buy/sell side (for display purposes)
export const mapOrderSide = (
  typeOrder: string | undefined,
  backendSide?: string
): 'buy' | 'sell' => {
  // First, try to use the backend side if available
  if (backendSide) {
    const normalizedSide = backendSide.toUpperCase();
    if (normalizedSide === 'BUY') return 'buy';
    if (normalizedSide === 'SELL') return 'sell';
  }

  // Fallback: determine from typeOrder
  // TP orders are always sell, everything else is typically buy
  switch (typeOrder) {
    case 'dealTP': // Take profit orders are sells
      return 'sell';
    case 'dealStart': // Base orders are buys
    case 'dealRegular': // DCA orders are buys
    case 'dealGrid': // Grid orders can be either, but default to buy
    case 'swap':
    case 'regular':
    default:
      return 'buy';
  }
};

// Map order type to category (base/safety/tp)
export const mapOrderCategory = (
  typeOrder: string | undefined
): 'base' | 'safety' | 'tp' => {
  if (!typeOrder) {
    return 'base'; // Default to base for undefined
  }
  switch (typeOrder) {
    case 'dealStart':
      return 'base';
    case 'dealRegular':
    case 'dealGrid':
      return 'safety';
    case 'dealTP':
      return 'tp';
    default:
      return 'base';
  }
};

// Helper function to format order for display
export const formatOrderForDisplay = (order: BotOrder) => ({
  id: order.clientOrderId,
  clientOrderId: order.clientOrderId,
  price: parseFloat(order.price),
  quantity: parseFloat(order.origQty),
  executedQuantity: parseFloat(order.executedQty),
  status: mapOrderStatus(order.status),
  side: mapOrderSide(order.typeOrder, order.side), // Pass backend side for accurate mapping
  category: mapOrderCategory(order.typeOrder), // Add category field
  time: order.time || order.transactTime || order.updateTime,
  executionTime: getOrderExecutionTime(order),
  updateTime: order.updateTime,
  symbol: order.symbol,
  baseAsset: order.baseAsset,
  quoteAsset: order.quoteAsset,
  dealId: order.dealId,
  type: order.type,
  exchange: order.exchange,
  typeOrder: order.typeOrder,
  // Additional fields for advanced functionality
  reduceFundsId: order.reduceFundsId,
  tpSlTarget: order.tpSlTarget,
  sl: order.sl,
  acBefore: order.acBefore,
  acAfter: order.acAfter,
});
