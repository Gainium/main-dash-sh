import { logger } from '@/lib/loggerInstance';
import type { ExchangeEnum } from '@/types';
import { getProviderIcon } from '@/utils/exchangeUtils';
import { useMemo } from 'react';
import { useExchangesStore } from '@/stores/exchangesStore';

// Define the exchange data structure based on the GraphQL API
interface ExchangeData {
  uuid: string;
  key: string;
  name: string;
  provider: ExchangeEnum | 'all';
  balance?: number | undefined;
  status?: boolean | undefined;
  rotationRequired?: boolean | undefined;
}

// Transformed exchange for UI consumption
export interface UIExchange {
  id: string;
  key: string;
  name: string;
  provider: ExchangeEnum | 'all';
  icon: string;
  type: 'exchange' | 'aggregate';
  balance?: number | undefined;
  status: boolean;
  color?: string;
  /** Still on a credential the operator has asked the user to replace. */
  rotationRequired: boolean;
}

/**
 * Hook that provides transformed exchange data for UI consumption.
 * Uses TanStack Query caching via useExchanges, so data is shared across components.
 */
export function useTransformedExchanges() {
  const { isLoading, exchanges: data } = useExchangesStore();
  // Transform GraphQL data to display format
  const exchanges = useMemo(() => {
    // Try different possible paths for the exchanges data
    const exchangesData = Object.values(data || {});

    if (!exchangesData.length || !Array.isArray(exchangesData)) {
      // Empty exchanges is a normal state (user hasn't connected any yet).
      // Only emit at debug level so it doesn't show up as a warning in prod.
      if (!isLoading) {
        logger.debug('useTransformedExchanges: no exchanges available');
      }
      return [];
    }

    // Add "All Exchanges" item at the beginning
    const allExchanges: UIExchange = {
      id: 'ALL',
      key: 'ALL',
      name: 'All Exchanges',
      provider: 'all',
      icon: getProviderIcon('all'),
      type: 'aggregate' as const,
      balance: exchangesData.reduce(
        (sum: number, ex: ExchangeData) => sum + (ex.balance || 0),
        0
      ),
      status: true,
      // The aggregate row is not a real connection, so it never carries a key.
      rotationRequired: false,
    };

    // Transform individual exchanges
    const individualExchanges: UIExchange[] = exchangesData.map(
      (exchange: ExchangeData) => ({
        id: exchange.uuid,
        key: exchange.key,
        name: exchange.name,
        provider: exchange.provider,
        icon: getProviderIcon(exchange.provider),
        type: 'exchange' as const,
        balance: exchange.balance ?? undefined,
        status: exchange.status ?? false,
        rotationRequired: exchange.rotationRequired ?? false,
      })
    );

    return [allExchanges, ...individualExchanges];
  }, [data, isLoading]);

  return {
    exchanges,
    isLoading: isLoading,
  };
}
