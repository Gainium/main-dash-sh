import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useMemo } from 'react';

/**
 * Create a stable string representation of variables for cache key
 * This function properly handles nested objects, arrays, and ensures
 * consistent serialization for cache key generation
 */
function serializeVariables(variables?: Record<string, unknown>): string {
  // Create a stable hash of the variables
  // - Omits keys with `undefined` values (GraphQL clients typically treat them as absent)
  // - Ensures consistent serialization for cache key generation
  const createStableHash = (obj: unknown): string => {
    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (
      typeof obj === 'string' ||
      typeof obj === 'number' ||
      typeof obj === 'boolean'
    ) {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      return `[${obj.map(createStableHash).join(',')}]`;
    }

    if (typeof obj === 'object') {
      // Sort keys to ensure consistent serialization
      const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
      const pairs = sortedKeys
        .filter((key) => (obj as Record<string, unknown>)[key] !== undefined)
        .map((key) => {
          const value = (obj as Record<string, unknown>)[key];
          return `${key}:${createStableHash(value)}`;
        });
      return `{${pairs.join(',')}}`;
    }

    return String(obj);
  };

  if (!variables) {
    return 'no-vars';
  }

  const hash = createStableHash(variables);
  // If the object ended up with no meaningful keys (e.g. { input: undefined })
  // treat it as having no variables for cache-key purposes.
  if (hash === '{}' || hash === '{ }') {
    return 'no-vars';
  }

  return hash;
}

// Market data queries that don't need trading context differentiation
const MARKET_DATA_QUERIES = new Set([
  'getAssetMetrics',
  'getScreenerData',
  'getLatestQuotes',
  'getLatestFearAndGreedIndex',
  'getCandleData',
  'getMarketData',
  'getTechnicalIndicators',
]);

/**
 * Generate stable cache keys that persist across browser sessions
 * while still being user-specific and context-aware
 */
export function useCacheKey(
  baseKey: string,
  variables?: Record<string, unknown>,
  paperContext?: boolean
): unknown[] {
  const user = useAuthStore((s) => s.user);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);

  // Serialize variables to ensure proper cache key differentiation
  const serializedVariables = useMemo(
    () => serializeVariables(variables),
    [variables]
  );

  return useMemo(() => {
    // Use user ID or email as a stable identifier that doesn't change
    // when tokens are refreshed, but still isolates user data
    const userIdentifier = user?.id || user?.email || 'anonymous';

    // Check if this is a market data query that doesn't need trading context
    const needsTradingContext = !MARKET_DATA_QUERIES.has(baseKey);

    if (needsTradingContext) {
      // Include trading context for user-specific queries that differ between live/paper modes
      // Demo mode gets its own context to prevent cache collision with paper mode
      const isDemoMode = tradingMode === 'demo';

      let tradingContext: string;
      if (isDemoMode) {
        // Demo mode uses 'demo' context to differentiate from real paper/live trading
        tradingContext = 'demo';
      } else {
        // Regular mode: use override if provided, or fallback to global store
        const isPaper = paperContext ?? !isLiveTrading;
        tradingContext = isPaper ? 'paper' : 'live';
      }

      return [baseKey, serializedVariables, userIdentifier, tradingContext];
    } else {
      // For market data queries, exclude trading context as the data is the same
      // regardless of live/paper mode
      return [baseKey, serializedVariables, userIdentifier];
    }
  }, [
    baseKey,
    serializedVariables,
    user?.id,
    user?.email,
    isLiveTrading,
    tradingMode,
    paperContext,
  ]);
}

/**
 * Get cache keys for invalidation when user data might have changed
 */
export function getInvalidationKeys(userId?: string): string[][] {
  if (!userId) return [];

  // Return common query patterns that should be invalidated
  // when user-specific data might have changed
  return [
    ['getPortfolioByUser', userId],
    ['getProfitByUser', userId],
    ['botList', userId],
    ['dcaBotList', userId],
    ['comboBotList', userId],
    ['getLatestOrders', userId],
    ['user', userId],
  ];
}

