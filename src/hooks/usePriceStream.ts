import {
  ExchangeWebSocketService,
  isPriceStreamSupported,
  type PriceUpdate,
  type TradingPair,
} from '@/services/ExchangeWebSocketService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Custom hook for deep equality comparison
function useDeepMemo<T>(value: T): T {
  const ref = useRef<T>(value);
  const valueRef = useRef<string>(JSON.stringify(value));

  const currentValueString = JSON.stringify(value);
  if (currentValueString !== valueRef.current) {
    ref.current = value;
    valueRef.current = currentValueString;
  }

  return ref.current;
}

export interface UsePriceStreamOptions {
  enableStream?: boolean;
}

export function usePriceStream(
  pairs: TradingPair[] = [],
  options: UsePriceStreamOptions = {}
) {
  const { enableStream = true } = options;
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('disconnected');
  const [connectedExchanges, setConnectedExchanges] = useState<
    Record<string, boolean>
  >({});
  const unsubscribeFunctionsRef = useRef<(() => void)[]>([]);
  const wsServiceRef = useRef<ExchangeWebSocketService | null>(null);

  // Use deep comparison to prevent unnecessary re-renders when pairs content is the same
  const stablePairs = useDeepMemo(pairs);

  // Initialize WebSocket service
  useEffect(() => {
    if (!enableStream) {
      setConnectionStatus('disconnected');
      return;
    }

    wsServiceRef.current = ExchangeWebSocketService.getInstance();
    setConnectionStatus('connecting');

    return () => {
      // Cleanup subscriptions when component unmounts
      unsubscribeFunctionsRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribeFunctionsRef.current = [];
    };
  }, [enableStream]);

  // Update connection status based on exchanges
  useEffect(() => {
    if (!wsServiceRef.current || !enableStream) return;

    const updateConnectionStatus = () => {
      const status = wsServiceRef.current?.getConnectionStatus();
      if (!status) return;
      setConnectedExchanges(status);

      // Determine overall connection status
      const exchanges = Object.keys(status);

      if (exchanges.length === 0) {
        setConnectionStatus('disconnected');
      } else if (exchanges.some((ex) => status[ex])) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('connecting');
      }
    };

    // Check status periodically
    updateConnectionStatus();
    const statusInterval = setInterval(updateConnectionStatus, 2000);

    return () => clearInterval(statusInterval);
  }, [enableStream]);

  // Subscribe to pairs
  useEffect(() => {
    if (!wsServiceRef.current || !enableStream || stablePairs.length === 0) {
      // Clear prices when no pairs - only if prices aren't already empty
      if (stablePairs.length === 0) {
        setPrices((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      }
      return;
    }

    // Unsubscribe from previous subscriptions
    unsubscribeFunctionsRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeFunctionsRef.current = [];

    // Subscribe to each pair
    stablePairs.forEach((pair) => {
      const handlePriceUpdate = (update: PriceUpdate) => {
        const key = `${pair.pair}_${pair.exchange}`;
        setPrices((prev) => ({
          ...prev,
          [key]: update,
        }));
      };

      const unsubscribe = wsServiceRef.current?.subscribe(
        pair,
        handlePriceUpdate
      );
      if (!unsubscribe) return;
      unsubscribeFunctionsRef.current.push(unsubscribe);
    });

    return () => {
      // Cleanup subscriptions
      unsubscribeFunctionsRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribeFunctionsRef.current = [];
    };
  }, [stablePairs, enableStream]);

  // Get price for a specific pair
  const getPriceForPair = useCallback(
    (pair: TradingPair): PriceUpdate | null => {
      const key = `${pair.pair}_${pair.exchange}`;
      return prices[key] || null;
    },
    [prices]
  );

  // Manual subscribe function for external control
  const subscribe = useCallback(
    (pairsToAdd: TradingPair[]) => {
      if (!wsServiceRef.current || !enableStream) return () => {};

      const unsubscribeFunctions: (() => void)[] = [];

      pairsToAdd.forEach((pair) => {
        const handlePriceUpdate = (update: PriceUpdate) => {
          const key = `${pair.pair}_${pair.exchange}`;
          setPrices((prev) => ({
            ...prev,
            [key]: update,
          }));
        };

        const unsubscribe = wsServiceRef.current?.subscribe(
          pair,
          handlePriceUpdate
        );
        if (!unsubscribe) return;
        unsubscribeFunctions.push(unsubscribe);
      });

      // Return function to unsubscribe all
      return () => {
        unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
      };
    },
    [enableStream]
  );

  // Pairs whose exchange has no public price stream we implement. These can
  // never produce a price, so the UI must show a terminal state rather than
  // an indefinite "Connecting...". Keyed like `prices`.
  const unsupportedPairs = useMemo(() => {
    const keys = new Set<string>();
    stablePairs.forEach((pair) => {
      if (!isPriceStreamSupported(pair.exchange)) {
        keys.add(`${pair.pair}_${pair.exchange}`);
      }
    });
    return keys;
  }, [stablePairs]);

  return {
    prices,
    connectionStatus,
    connectedExchanges,
    getPriceForPair,
    subscribe,
    unsupportedPairs,
    isConnected: connectionStatus === 'connected',
  };
}
