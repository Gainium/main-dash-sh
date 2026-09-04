/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  botWebSocketManager,
  type BotStatsUpdate,
  type OrderUpdate,
  type BalanceUpdate,
  type DealUpdate,
  type WebSocketEvent,
} from '@/services/websocket/BotWebSocketManager';
import type { CalculatedBotStats } from '@/services/metrics/BotMetricsCalculator';
import { logger } from '@/lib/loggerInstance';
import {
  useBotStatsStore,
  useOrderStore,
  useBalanceStore,
  useDealStore,
  useMessageStore,
  initializeSocketIntegration,
  cleanupSocketIntegration,
  type DealType,
} from '@/stores/live';
import type { BalanceData } from '@/stores/live/balanceStore';
import type { MessageData } from '@/stores/live/messageStore';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { LiveMessageToaster } from '@/components/live/LiveMessageToaster';
import {
  type BotSymbolsStats,
  type OrderData,
  type DCADeals,
  BotTypesEnum,
} from '@/types';
import type { OrderType } from '@/stores/live/orderStore';

interface LiveUpdateContextType {
  // Connection status
  isConnected: boolean;
  connectionError: string | null;
  reconnect: () => void;

  // Store actions
  botStatsActions: {
    updateBotStats: (botId: string, stats: CalculatedBotStats) => void;
    updateBotStatsFromWebSocket: (update: BotStatsUpdate) => void;
    setBotStatsLoading: (botId: string, loading: boolean) => void;
    setBotStatsError: (botId: string, error: string | null) => void;
    clearBotStats: (botId: string) => void;
    clearAllBotStats: () => void;
  };

  orderActions: {
    updateOrder: (botId: string, order: OrderData, type: OrderType) => void;
    updateOrderFromWebSocket: (update: OrderUpdate, type: OrderType) => void;
    removeOrder: (botId: string, orderId: string, type: OrderType) => void;
    setOrderLoading: (botId: string, loading: boolean) => void;
    setOrderError: (botId: string, error: string | null) => void;
    clearOrders: (botId: string) => void;
    clearAllOrders: () => void;
  };

  balanceActions: {
    updateBalances: (balances: BalanceData[]) => void;
    updateBalanceFromWebSocket: (update: BalanceUpdate) => void;
    updateSingleBalance: (asset: string, balance: Partial<BalanceData>) => void;
    setBalanceLoading: (loading: boolean) => void;
    setBalanceError: (error: string | null) => void;
    clearBalances: () => void;
  };

  dealActions: {
    updateDeal: (botId: string, deal: DCADeals, dealType: DealType) => void;
    updateDealFromWebSocket: (update: DealUpdate, dealType: DealType) => void;
    removeDeal: (botId: string, dealId: string) => void;
    setDealLoading: (botId: string, loading: boolean) => void;
    setDealError: (botId: string, error: string | null) => void;
    clearDeals: (botId: string) => void;
    clearAllDeals: () => void;
  };

  messageActions: {
    addMessage: (
      message: Omit<MessageData, 'id' | 'timestamp' | 'dismissed'>
    ) => void;
    dismissMessage: (messageId: string) => void;
    clearMessages: () => void;
    clearBotMessages: (botId: string) => void;
  };

  // Store selectors
  botStatsSelectors: {
    getBotStats: (botId: string) => CalculatedBotStats | null;
    getAllBotStats: () => Record<string, CalculatedBotStats>;
    isBotStatsLoading: (botId: string) => boolean;
    getBotStatsError: (botId: string) => string | null;
  };

  orderSelectors: {
    getOrders: (botId: string) => OrderData[];
    getAllOrders: () => Record<string, OrderData[]>;
    getOrder: (botId: string, orderId: string) => OrderData | null;
    isOrderLoading: (botId: string) => boolean;
    getOrderError: (botId: string) => string | null;
  };

  balanceSelectors: {
    getBalances: () => BalanceData[];
    getBalance: (asset: string) => BalanceData | null;
    getTotalUsdValue: () => number;
    isBalanceLoading: () => boolean;
    getBalanceError: () => string | null;
  };

  dealSelectors: {
    getDeals: (botId: string) => DCADeals[];
    getAllDeals: () => Record<string, DCADeals[]>;
    getDeal: (botId: string, dealId: string) => DCADeals | null;
    getActiveDeals: (botId: string) => DCADeals[];
    getClosedDeals: (botId: string) => DCADeals[];
    isDealLoading: (botId: string) => boolean;
    getDealError: (botId: string) => string | null;
  };

  messageSelectors: {
    getMessages: () => MessageData[];
    getActiveMessages: () => MessageData[];
    getBotMessages: (botId: string) => MessageData[];
    getMessageById: (messageId: string) => MessageData | null;
    getUnreadCount: () => number;
  };
}

const LiveUpdateContext = createContext<LiveUpdateContextType | undefined>(
  undefined
);

// Action groups only wrap `useXStore.getState()...` calls and close over
// nothing render-scoped, so they're hoisted to module level. Their identity
// is stable across renders — a prerequisite for the memoized `contextValue`
// below to stay stable while the provider itself re-renders.
const botStatsActions: LiveUpdateContextType['botStatsActions'] = {
  updateBotStats: (botId: string, stats: CalculatedBotStats) =>
    useBotStatsStore.getState().updateBotStats(botId, stats),
  updateBotStatsFromWebSocket: (update: BotStatsUpdate) =>
    useBotStatsStore.getState().updateBotStatsFromWebSocket(update),
  setBotStatsLoading: (botId: string, loading: boolean) =>
    useBotStatsStore.getState().setBotStatsLoading(botId, loading),
  setBotStatsError: (botId: string, error: string | null) =>
    useBotStatsStore.getState().setBotStatsError(botId, error),
  clearBotStats: (botId: string) =>
    useBotStatsStore.getState().clearBotStats(botId),
  clearAllBotStats: () => useBotStatsStore.getState().clearAllBotStats(),
};

const orderActions: LiveUpdateContextType['orderActions'] = {
  updateOrder: (botId: string, order: OrderData, type: OrderType) =>
    useOrderStore.getState().updateOrder(botId, order, type),
  updateOrderFromWebSocket: (update: OrderUpdate, type: OrderType) =>
    useOrderStore.getState().updateOrderFromWebSocket(update, type),
  removeOrder: (botId: string, orderId: string, type: OrderType) =>
    useOrderStore.getState().removeOrder(botId, orderId, type),
  setOrderLoading: (botId: string, loading: boolean) =>
    useOrderStore.getState().setOrderLoading(botId, loading),
  setOrderError: (botId: string, error: string | null) =>
    useOrderStore.getState().setOrderError(botId, error),
  clearOrders: (botId: string) => useOrderStore.getState().clearOrders(botId),
  clearAllOrders: () => useOrderStore.getState().clearAllOrders(),
};

const balanceActions: LiveUpdateContextType['balanceActions'] = {
  updateBalances: (balances: BalanceData[]) =>
    useBalanceStore.getState().updateBalances(balances),
  updateBalanceFromWebSocket: (update: BalanceUpdate) =>
    useBalanceStore.getState().updateBalanceFromWebSocket(update),
  updateSingleBalance: (asset: string, balance: Partial<BalanceData>) =>
    useBalanceStore.getState().updateSingleBalance(asset, balance),
  setBalanceLoading: (loading: boolean) =>
    useBalanceStore.getState().setBalanceLoading(loading),
  setBalanceError: (error: string | null) =>
    useBalanceStore.getState().setBalanceError(error),
  clearBalances: () => useBalanceStore.getState().clearBalances(),
};

const dealActions: LiveUpdateContextType['dealActions'] = {
  updateDeal: (botId: string, deal: DCADeals, dealType: DealType) =>
    useDealStore.getState().updateDeal(botId, deal, dealType),
  updateDealFromWebSocket: (update: DealUpdate, dealType: DealType) =>
    useDealStore.getState().updateDealFromWebSocket(update, dealType),
  removeDeal: (botId: string, dealId: string) =>
    useDealStore.getState().removeDeal(botId, dealId),
  setDealLoading: (botId: string, loading: boolean) =>
    useDealStore.getState().setDealLoading(botId, loading),
  setDealError: (botId: string, error: string | null) =>
    useDealStore.getState().setDealError(botId, error),
  clearDeals: (botId: string) => useDealStore.getState().clearDeals(botId),
  clearAllDeals: () => useDealStore.getState().clearAllDeals(),
};

const messageActions: LiveUpdateContextType['messageActions'] = {
  addMessage: (message: Omit<MessageData, 'id' | 'timestamp' | 'dismissed'>) =>
    useMessageStore.getState().addMessage(message),
  dismissMessage: (messageId: string) =>
    useMessageStore.getState().dismissMessage(messageId),
  clearMessages: () => useMessageStore.getState().clearMessages(),
  clearBotMessages: (botId: string) =>
    useMessageStore.getState().clearBotMessages(botId),
};

// Selector groups, like the action groups above, only wrap `getState()` reads
// and close over nothing render-scoped. They were previously created inside the
// provider via `useXStore((s) => s.method)` — but each selects a store-method
// reference that is stable for the store's lifetime, so those subscriptions
// never fired and only served to pad the `contextValue` memo's dep list. Hoisted
// to module level, they have a stable identity and drop out of the deps entirely.
const botStatsSelectors: LiveUpdateContextType['botStatsSelectors'] = {
  getBotStats: (botId: string) =>
    useBotStatsStore.getState().getBotStats(botId),
  getAllBotStats: () => useBotStatsStore.getState().getAllBotStats(),
  isBotStatsLoading: (botId: string) =>
    useBotStatsStore.getState().isBotStatsLoading(botId),
  getBotStatsError: (botId: string) =>
    useBotStatsStore.getState().getBotStatsError(botId),
};

const orderSelectors: LiveUpdateContextType['orderSelectors'] = {
  getOrders: (botId: string) => useOrderStore.getState().getOrders(botId),
  getAllOrders: () => useOrderStore.getState().getAllOrders(),
  getOrder: (botId: string, orderId: string) =>
    useOrderStore.getState().getOrder(botId, orderId),
  isOrderLoading: (botId: string) =>
    useOrderStore.getState().isOrderLoading(botId),
  getOrderError: (botId: string) =>
    useOrderStore.getState().getOrderError(botId),
};

const balanceSelectors: LiveUpdateContextType['balanceSelectors'] = {
  getBalances: () => useBalanceStore.getState().getBalances(),
  getBalance: (asset: string) => useBalanceStore.getState().getBalance(asset),
  getTotalUsdValue: () => useBalanceStore.getState().getTotalUsdValue(),
  isBalanceLoading: () => useBalanceStore.getState().isBalanceLoading(),
  getBalanceError: () => useBalanceStore.getState().getBalanceError(),
};

const dealSelectors: LiveUpdateContextType['dealSelectors'] = {
  getDeals: (botId: string) => useDealStore.getState().getDeals(botId),
  getAllDeals: () => useDealStore.getState().getAllDeals(),
  getDeal: (botId: string, dealId: string) =>
    useDealStore.getState().getDeal(botId, dealId),
  getActiveDeals: (botId: string) =>
    useDealStore.getState().getActiveDeals(botId),
  getClosedDeals: (botId: string) =>
    useDealStore.getState().getClosedDeals(botId),
  isDealLoading: (botId: string) =>
    useDealStore.getState().isDealLoading(botId),
  getDealError: (botId: string) => useDealStore.getState().getDealError(botId),
};

const messageSelectors: LiveUpdateContextType['messageSelectors'] = {
  getMessages: () => useMessageStore.getState().getMessages(),
  getActiveMessages: () => useMessageStore.getState().getActiveMessages(),
  getBotMessages: (botId: string) =>
    useMessageStore.getState().getBotMessages(botId),
  getMessageById: (messageId: string) =>
    useMessageStore.getState().getMessageById(messageId),
  getUnreadCount: () => useMessageStore.getState().getUnreadCount(),
};

interface LiveUpdateProviderProps {
  children: ReactNode;
}

export const LiveUpdateProvider: React.FC<LiveUpdateProviderProps> = ({
  children,
}) => {
  const hasInitializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tradingMode = useUIStore((state) => state.tradingMode);

  useEffect(() => {
    const paperContext = tradingMode === 'paper';
    botWebSocketManager.setPaperContext(paperContext);
    logger.debug(
      `[LiveUpdateContext] Setting paper context: ${paperContext} from trading mode: ${tradingMode}`
    );
  }, [tradingMode]);

  // Connect/disconnect WebSocket based on authentication status
  useEffect(() => {
    // Prevent duplicate initialization
    if (hasInitializedRef.current) return;

    if (isAuthenticated && user && tokens?.accessToken) {
      hasInitializedRef.current = true;

      // Set paper context based on trading mode
      // paperContext = true for paper trading, false for live/demo

      if (user.id) {
        botWebSocketManager.connect(user.id, tokens.accessToken);
      }

      // Initialize socket integration for new bot list stores
      // This connects dcaBotsStore, gridBotsStore, comboBotsStore, transactionsStore, minigridsStore
      initializeSocketIntegration();

      // Set up WebSocket event subscriptions to update stores
      // Bot stats updates
      botWebSocketManager.subscribe('bot stats update', {
        id: 'live-update-bot-stats',
        callback: (event: WebSocketEvent) => {
          // Server sends: { botId, data: { stats: BotStats, symbolStats?: BotSymbolsStats[] } }
          // We need to extract the stats object
          const serverData = event.data as Record<string, unknown>;
          if (!serverData['stats']) {
            console.warn(
              `📡 [LiveUpdateContext] No stats in bot stats update for bot ${event.botId}`
            );
            return;
          }

          const update: BotStatsUpdate = {
            botId: event.botId ?? '',
            data: serverData['stats'] as Record<string, unknown>,
            // Keep the pairs. Dropping them here left `symbolStats` with no
            // live channel at all, so the Statistics tab's Pairs table could
            // only ever come from its own fetch (bug #619).
            symbolStats: serverData['symbolStats'] as
              | BotSymbolsStats[]
              | undefined,
          };
          useBotStatsStore.getState().updateBotStatsFromWebSocket(update);
        },
      });

      // Order updates
      botWebSocketManager.subscribe('data update', {
        id: 'live-update-orders',
        callback: (event: WebSocketEvent) => {
          if (
            event.data['status'] !== 'FILLED' &&
            event.data['status'] !== 'NEW'
          ) {
            useOrderStore
              .getState()
              .removeOrder(
                event.botId ?? '',
                event.data['clientOrderId'] as string,
                'new'
              );
            useOrderStore
              .getState()
              .removeOrder(
                event.botId ?? '',
                event.data['clientOrderId'] as string,
                'filled'
              );
            return;
          }
          const update: OrderUpdate = {
            botId: event.botId ?? '',
            data: event.data as Record<string, unknown>,
            paperContext: event.paperContext || false,
          };
          useOrderStore
            .getState()
            .updateOrderFromWebSocket(
              update,
              event.data['status'] === 'FILLED' ? 'filled' : 'new'
            );
        },
      });

      // Balance updates
      botWebSocketManager.subscribe('balance', {
        id: 'live-update-balance',
        callback: (event: WebSocketEvent) => {
          const update: BalanceUpdate = {
            data: (event.data as { balances: Record<string, unknown>[] })
              .balances,
          };
          useBalanceStore.getState().updateBalanceFromWebSocket(update);
        },
      });

      // Deal updates
      botWebSocketManager.subscribe('bot deal update', {
        id: 'live-update-deals',
        callback: (event: WebSocketEvent) => {
          const update: DealUpdate = {
            botId: event.botId ?? '',
            data: event.data as Record<string, unknown>,
            paperContext: event.paperContext || false,
          };
          useDealStore
            .getState()
            .updateDealFromWebSocket(
              update,
              event.botType === BotTypesEnum.combo ? 'combo' : 'dca'
            );
        },
      });

      // Bot messages
      botWebSocketManager.subscribe('bot sends message', {
        id: 'live-update-messages',
        callback: (event: WebSocketEvent) => {
          const data = event.data as Record<string, unknown>;
          useMessageStore.getState().addMessage({
            type: (data['type'] as string) || 'info',
            title: (data['botName'] as string) || 'Bot Message',
            message: (data['message'] as string) || '',
            botId: event.botId ?? '',
          });
          // The Notifications panel reads from the `getMessageBot` GraphQL
          // query (not from useMessageStore). Invalidate so the panel picks
          // up the new entry without a hard refresh.
          queryClient.invalidateQueries({ queryKey: ['getMessageBot'] });
        },
      });
    } else if (!isAuthenticated) {
      // Clean up socket integration on logout
      if (hasInitializedRef.current) {
        cleanupSocketIntegration();
        botWebSocketManager.disconnect();
        hasInitializedRef.current = false;
      }
    }

    // Cleanup function
    return () => {
      if (!isAuthenticated && hasInitializedRef.current) {
        cleanupSocketIntegration();
        botWebSocketManager.disconnect();
        hasInitializedRef.current = false;
      }
    };
  }, [isAuthenticated, user, tokens?.accessToken]);

  // Update paper context when trading mode changes
  useEffect(() => {
    if (isAuthenticated && botWebSocketManager.getIsConnected()) {
      const paperContext = tradingMode === 'paper';
      logger.info(
        '[LiveUpdateContext] Trading mode changed, updating paper context:',
        paperContext
      );
      botWebSocketManager.setPaperContext(paperContext);
    }
  }, [tradingMode, isAuthenticated]);

  const reconnect = useCallback(() => {
    setConnectionError(null);
    botWebSocketManager.connect();
  }, []);

  // Listen to WebSocket connection events instead of polling
  useEffect(() => {
    const subscriberId = 'live-update-connection-monitor';

    const handleConnectionEvent = (event: WebSocketEvent) => {
      if (event.type === 'connect') {
        logger.info('[LiveUpdateProvider] WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
      } else if (event.type === 'disconnect') {
        logger.warn('[LiveUpdateProvider] WebSocket disconnected');
        setIsConnected(false);
      }
    };

    const subscriber = {
      id: subscriberId,
      callback: handleConnectionEvent,
    };

    // Subscribe to connection events
    botWebSocketManager.subscribe('connect', subscriber);
    botWebSocketManager.subscribe('disconnect', subscriber);

    // Initial status check
    setIsConnected(botWebSocketManager.getIsConnected());

    return () => {
      botWebSocketManager.unsubscribe('connect', subscriberId);
      botWebSocketManager.unsubscribe('disconnect', subscriberId);
    };
  }, []);

  // `contextValue` identity must stay stable unless connection state genuinely
  // changes. Every action and selector group is now module-level with a stable
  // identity, so this memo only recomputes when isConnected/connectionError flip
  // or `reconnect` changes.
  const contextValue = useMemo<LiveUpdateContextType>(
    () => ({
      isConnected,
      connectionError,
      reconnect,

      botStatsActions,
      orderActions,
      balanceActions,
      dealActions,
      messageActions,

      botStatsSelectors,
      orderSelectors,
      balanceSelectors,
      dealSelectors,
      messageSelectors,
    }),
    [isConnected, connectionError, reconnect]
  );

  return (
    <LiveUpdateContext.Provider value={contextValue}>
      <LiveMessageToaster />
      {children}
    </LiveUpdateContext.Provider>
  );
};

export const useLiveUpdate = (): LiveUpdateContextType => {
  const context = useContext(LiveUpdateContext);
  if (!context) {
    throw new Error('useLiveUpdate must be used within a LiveUpdateProvider');
  }
  return context;
};
