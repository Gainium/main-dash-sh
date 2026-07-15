import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BotTypesEnum,
  type Bot,
  type LeverageBracket,
  type Transaction,
} from '@/types';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { useGraphQL } from '@/hooks/useGraphQL';
import {
  useBotOrders,
  formatOrderForDisplay,
  type BotOrder,
} from '@/hooks/useBotOrders';
import { useBotTransactions } from '@/hooks/useBotTransactions';
import { useBotEvents } from '@/hooks/useBotEvents';
import {
  useBotProfitChartData,
  calculateProfitMetrics,
} from '@/hooks/useBotProfitChartData';
/* import { useBotAvgPriceLines } from '@/hooks/useBotAvgPriceLines'; */
import type { GridBot } from '@/types/gridBot';
import { useGridBotsStore } from '@/stores/live/gridBotsStore';
import { buildFundsSnapshot } from '@/utils/bots/grid/funds';
import { calcDuration } from '@/utils/bots/grid/math';
import type {
  GridCurrency,
  GridLeverageState,
  GridMarketOverviewState,
  GridOrdersRow,
  GridTransactionsRow,
  /* GridOverlayState, */
} from '@/types/bots/grid/data';
import type {
  GridPageApi,
  GridPageOptions,
  GridPageState,
  GridPageStatus,
} from '@/types/bots/grid/api';

type StoredState<T> = { value: T; fromStorage: boolean };

const DEFAULT_PREFERENCES: GridPageState['preferences'] = {
  currency: 'usd',
  ordersView: 'open',
};

const DEFAULT_MARKET_OVERVIEW: GridMarketOverviewState = {
  showTradingView: true,
  showOrders: true,
  showTransactions: true,
};

const parseNumber = (value?: string | number | null): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const readStoredState = <T extends object>(
  key: string | null,
  fallback: T
): StoredState<T> => {
  if (!key || typeof window === 'undefined') {
    return { value: fallback, fromStorage: false };
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return { value: fallback, fromStorage: false };
    }
    const parsed = JSON.parse(raw) as Partial<T>;
    return { value: { ...fallback, ...parsed }, fromStorage: true };
  } catch (error) {
    console.warn('[useGridPage] Failed to parse stored state', { key, error });
    return { value: fallback, fromStorage: false };
  }
};

const normalizeCurrency = (value?: string | null): GridCurrency => {
  const lowered = value?.toLowerCase() ?? '';

  if (lowered.includes('usd')) {
    return 'usd';
  }

  if (lowered.includes('base')) {
    return 'base';
  }

  if (lowered.includes('quote')) {
    return 'quote';
  }

  return 'usd';
};

const mapTransactionToRow = (transaction: Transaction): GridTransactionsRow => {
  const price = parseNumber(transaction.priceSell || transaction.priceBuy);
  const amountBase = parseNumber(
    transaction.amountBaseSell || transaction.amountBaseBuy
  );
  const amountQuote = parseNumber(
    transaction.amountQuoteSell || transaction.amountQuoteBuy
  );

  return {
    id: transaction._id,
    time: transaction.updateTime,
    side: transaction.side,
    price,
    amountBase,
    amountQuote,
    profitBase: parseNumber(transaction.profitBase),
    profitQuote: parseNumber(transaction.profitQuote),
    profitUsd: parseNumber(transaction.profitUsdt),
    feeBase: parseNumber(transaction.feeBase),
    feeQuote: parseNumber(transaction.feeQuote),
  };
};

const mapOrderToRow = (order: BotOrder): GridOrdersRow => {
  const formatted = formatOrderForDisplay(order);

  return {
    id: formatted.id,
    clientOrderId: formatted.clientOrderId,
    price: formatted.price,
    quantity: formatted.quantity,
    executedQuantity: formatted.executedQuantity,
    status: formatted.status,
    side: formatted.side,
    time: formatted.time,
    baseAsset: formatted.baseAsset,
    quoteAsset: formatted.quoteAsset,
    type: order.type,
  };
};

const deriveMetrics = (bot?: GridBot) => {
  if (!bot) {
    return undefined;
  }

  const workingShiftStart = bot.workingShift?.[0]?.start ?? bot.created;
  const workingTime = calcDuration(workingShiftStart);

  const activeOrders =
    (bot.levels?.active?.buy ?? 0) + (bot.levels?.active?.sell ?? 0);
  const totalOrders =
    (bot.levels?.all?.buy ?? 0) + (bot.levels?.all?.sell ?? 0);

  const filledOrders =
    (bot.transactionsCount?.buy ?? 0) + (bot.transactionsCount?.sell ?? 0);

  return {
    workingTime,
    activeOrders,
    totalOrders,
    filledOrders,
    status: bot.status,
    statusReason:
      typeof bot.statusReason === 'string' ? bot.statusReason : null,
    transactions: {
      buy: bot.transactionsCount?.buy ?? 0,
      sell: bot.transactionsCount?.sell ?? 0,
    },
    levels: {
      active: (bot.levels?.active?.buy ?? 0) + (bot.levels?.active?.sell ?? 0),
      total: (bot.levels?.all?.buy ?? 0) + (bot.levels?.all?.sell ?? 0),
    },
    profitUsd: bot.profit?.totalUsd ?? 0,
    profitTotal: bot.profit?.total ?? 0,
    dailyProfitUsd: bot.profitToday?.totalTodayUsd ?? 0,
  };
};

const deriveOrdersState = (
  orders: BotOrder[],
  total: number,
  isLoading: boolean,
  error: Error | null,
  activeTab: GridPageState['preferences']['ordersView'],
  page: number
): GridPageState['orders'] => {
  const rows = orders.map(mapOrderToRow);

  const filteredRows = rows.filter((row) => {
    if (activeTab === 'open') {
      return row.status !== 'filled' && row.status !== 'cancelled';
    }
    return row.status === 'filled' || row.status === 'cancelled';
  });

  return {
    rows: filteredRows,
    total,
    page,
    isLoading,
    error: error?.message ?? null,
    activeTab,
    raw: orders,
  };
};

const deriveTransactionsState = (
  transactions: Transaction[],
  isLoading: boolean,
  error: Error | null
): GridPageState['transactions'] => ({
  rows: transactions.map(mapTransactionToRow),
  isLoading,
  error: error?.message ?? null,
  raw: transactions,
});

export const useGridPage = (options: GridPageOptions = {}): GridPageApi => {
  const botType = options.botType ?? BotTypesEnum.grid;

  const preferenceKey = options.botId
    ? `grid.page.${options.botId}.preferences`
    : null;
  const marketOverviewKey = options.botId
    ? `grid.page.${options.botId}.marketOverview`
    : null;

  const prefsInit = useMemo(
    () => readStoredState(preferenceKey, DEFAULT_PREFERENCES),
    [preferenceKey]
  );
  const [preferences, setPreferences] = useState(prefsInit.value);
  const preferencesFromStorageRef = useRef(prefsInit.fromStorage);

  const marketInit = useMemo(
    () => readStoredState(marketOverviewKey, DEFAULT_MARKET_OVERVIEW),
    [marketOverviewKey]
  );
  const [marketOverview, setMarketOverviewState] = useState(marketInit.value);

  useEffect(() => {
    if (!preferenceKey) {
      setPreferences(DEFAULT_PREFERENCES);
      preferencesFromStorageRef.current = false;
      return;
    }

    const stored = readStoredState(preferenceKey, DEFAULT_PREFERENCES);
    setPreferences(stored.value);
    preferencesFromStorageRef.current = stored.fromStorage;
  }, [preferenceKey]);

  useEffect(() => {
    if (!marketOverviewKey) {
      setMarketOverviewState(DEFAULT_MARKET_OVERVIEW);
      return;
    }

    const stored = readStoredState(marketOverviewKey, DEFAULT_MARKET_OVERVIEW);
    setMarketOverviewState(stored.value);
  }, [marketOverviewKey]);

  useEffect(() => {
    if (!preferenceKey || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  }, [preferenceKey, preferences]);

  useEffect(() => {
    if (!marketOverviewKey || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      marketOverviewKey,
      JSON.stringify(marketOverview)
    );
  }, [marketOverviewKey, marketOverview]);

  const botQueryInput = useMemo(
    () => botQueries.getBot({ id: options.botId ?? '' }),
    [options.botId]
  );

  const botQuery = useGraphQL<GridBot>('getBot', botQueryInput);

  const ordersResult = useBotOrders(options.botId ?? '', botType, {
    status: preferences.ordersView === 'completed' ? 'completed' : 'open',
  });

  const transactionsResult = useBotTransactions(options.botId ?? '');

  const profitResult = useBotProfitChartData(options.botId ?? '', botType);

  const eventsResult = useBotEvents(options.botId ?? '', botType, {
    pageSize: 50,
  });

  /* const shouldFetchAvgPrice = Boolean(options.botId); */

  /*  const avgPriceResult = useBotAvgPriceLines(options.botId ?? '', botType, {
    enabled: shouldFetchAvgPrice,
    staleTime: 5 * 60 * 1000,
  }); */

  const [isRefreshing, setIsRefreshing] = useState(false);

  const botData =
    botQuery.data?.status === 'OK'
      ? (botQuery.data.data as GridBot)
      : undefined;
  const botError =
    botQuery.data?.status === 'NOTOK'
      ? (botQuery.data.reason ?? 'Failed to load bot')
      : undefined;

  // Seed the live socket store with the fetched bot so websocket updates —
  // notably the order-placement `progress` field on `bot sends settings` —
  // are applied to it. The store's websocket merge skips bots it doesn't
  // already hold, so a deep-linked grid page (e.g. right after create → start)
  // would otherwise drop early progress events. Only seed when absent so we
  // never clobber a fresher live snapshot already in the store.
  useEffect(() => {
    if (!botData?._id) return;
    const store = useGridBotsStore.getState();
    if (!store.getBot(botData._id)) {
      store.addBot(botData as unknown as Bot);
    }
  }, [botData]);

  useEffect(() => {
    if (botData && !preferencesFromStorageRef.current) {
      const preferredCurrency = normalizeCurrency(
        botData.settings?.profitCurrency
      );
      setPreferences((prev) =>
        prev.currency === preferredCurrency
          ? prev
          : {
              ...prev,
              currency: preferredCurrency,
            }
      );
      preferencesFromStorageRef.current = true;
    }
  }, [botData]);

  const metrics = useMemo(() => deriveMetrics(botData), [botData]);

  const funds = useMemo(() => {
    if (!botData) {
      return undefined;
    }

    const snapshot = buildFundsSnapshot(botData, preferences.currency);
    return snapshot;
  }, [botData, preferences.currency]);

  const exchangeUuid = botData?.exchangeUUID ?? null;
  const isFuturesBot = Boolean(botData?.settings?.futures);
  const isPaperExchange =
    typeof botData?.exchange === 'string'
      ? botData.exchange.toLowerCase().includes('paper')
      : false;

  const shouldFetchLeverage = Boolean(
    exchangeUuid && isFuturesBot && !isPaperExchange && !options.demo
  );

  const leverageQueryInput = useMemo(
    () => botQueries.getLeverageBracket({ uuid: exchangeUuid ?? '' }),
    [exchangeUuid]
  );

  const leverageQuery = useGraphQL<LeverageBracket[]>(
    'getLeverageBracket',
    leverageQueryInput,
    {
      enabled: shouldFetchLeverage && !!exchangeUuid,
      staleTime: 5 * 60 * 1000,
    }
  );

  const leverageData = leverageQuery.data;
  const leverageLoading = leverageQuery.isLoading;
  const leverageFetching = leverageQuery.isFetching;
  const leverageQueryError = leverageQuery.error;

  const leverageState = useMemo<GridLeverageState>(() => {
    if (!shouldFetchLeverage) {
      return { brackets: [], isLoading: false };
    }

    const brackets =
      leverageData?.status === 'OK' && Array.isArray(leverageData.data)
        ? leverageData.data
        : [];

    const errorMessage =
      leverageData?.status === 'NOTOK'
        ? (leverageData.reason ?? 'Failed to fetch leverage brackets.')
        : (leverageQueryError?.message ?? null);

    return {
      brackets,
      isLoading: leverageLoading || leverageFetching,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }, [
    shouldFetchLeverage,
    leverageData,
    leverageLoading,
    leverageFetching,
    leverageQueryError,
  ]);

  /* const avgPriceState = useMemo<GridOverlayState['avgPrice']>(() => {
    const errorMessage = avgPriceResult.isError
      ? (avgPriceResult.error?.message ?? 'Failed to load average price lines')
      : null;

    return {
      lines: avgPriceResult.avgPrices,
      hasData: avgPriceResult.avgPrices.length > 0,
      isLoading: avgPriceResult.isLoading,
      error: errorMessage,
    };
  }, [
    avgPriceResult.avgPrices,
    avgPriceResult.error,
    avgPriceResult.isError,
    avgPriceResult.isLoading,
  ]); */

  const ordersErrorObject = useMemo(
    () =>
      ordersResult.isError
        ? (ordersResult.error ?? new Error('Failed to load orders'))
        : null,
    [ordersResult.isError, ordersResult.error]
  );

  const transactionsErrorObject = useMemo(
    () =>
      transactionsResult.isError
        ? (transactionsResult.error ?? new Error('Failed to load transactions'))
        : null,
    [transactionsResult.isError, transactionsResult.error]
  );

  const ordersState = useMemo(
    () =>
      deriveOrdersState(
        ordersResult.orders,
        ordersResult.total,
        ordersResult.isLoading,
        ordersErrorObject,
        preferences.ordersView,
        ordersResult.page
      ),
    [
      ordersResult.orders,
      ordersResult.total,
      ordersResult.isLoading,
      ordersErrorObject,
      preferences.ordersView,
      ordersResult.page,
    ]
  );

  const transactionsState = useMemo(
    () =>
      deriveTransactionsState(
        transactionsResult.transactions,
        transactionsResult.isLoading,
        transactionsErrorObject
      ),
    [
      transactionsResult.transactions,
      transactionsResult.isLoading,
      transactionsErrorObject,
    ]
  );

  const eventsState = useMemo(
    () => ({
      items: eventsResult.events,
      total: eventsResult.total,
      isLoading: eventsResult.isLoading,
      error: eventsResult.isError
        ? (eventsResult.error?.message ?? 'Failed to load bot events')
        : undefined,
    }),
    [
      eventsResult.events,
      eventsResult.total,
      eventsResult.isLoading,
      eventsResult.isError,
      eventsResult.error,
    ]
  );

  const profitMetrics = useMemo(
    () => calculateProfitMetrics(profitResult.profitData),
    [profitResult.profitData]
  );

  const charts = useMemo(
    () => ({
      profit: profitResult.profitData,
      hasProfitData: profitResult.profitData.length > 0,
      metrics: {
        totalProfit: profitMetrics.totalProfit,
        averageDaily: profitMetrics.avgDailyProfit,
        averageWeekly: profitMetrics.avgWeeklyProfit,
        averageMonthly: profitMetrics.avgMonthlyProfit,
        bestDay: profitMetrics.bestDay,
        worstDay: profitMetrics.worstDay,
        profitableDays: profitMetrics.profitableDays,
        totalDays: profitMetrics.totalDays,
      },
    }),
    [profitResult.profitData, profitMetrics]
  );

  /* const avgPriceError =
    avgPriceState.error === null || avgPriceState.error === undefined
      ? undefined
      : avgPriceState.error;
 */
  const profitError =
    profitResult.data?.status === 'NOTOK'
      ? (profitResult.data.reason ?? 'Failed to load profit data')
      : undefined;

  const eventsError = eventsResult.isError
    ? (eventsResult.error?.message ?? 'Failed to load bot events')
    : undefined;

  const transactionsError = transactionsResult.isError
    ? (transactionsResult.error?.message ?? 'Failed to load transactions')
    : undefined;

  const ordersError = ordersResult.isError
    ? (ordersResult.error?.message ?? 'Failed to load orders')
    : undefined;

  const status: GridPageStatus = useMemo(() => {
    if (!options.botId) {
      return 'idle';
    }

    if (isRefreshing) {
      return 'loading';
    }

    if (
      botQuery.isLoading ||
      ordersResult.isLoading ||
      transactionsResult.isLoading ||
      profitResult.isLoading ||
      eventsResult.isLoading /* ||
      avgPriceResult.isLoading */
    ) {
      return 'loading';
    }

    if (
      botError ||
      ordersError ||
      transactionsError ||
      profitError ||
      eventsError /* ||
      avgPriceError */
    ) {
      return 'error';
    }

    if (botData) {
      return 'ready';
    }

    return 'idle';
  }, [
    options.botId,
    isRefreshing,
    botQuery.isLoading,
    ordersResult.isLoading,
    transactionsResult.isLoading,
    profitResult.isLoading,
    eventsResult.isLoading,
    /* avgPriceResult.isLoading, */
    botError,
    ordersError,
    transactionsError,
    profitError,
    eventsError,
    /* avgPriceError, */
    botData,
  ]);

  const error = options.botId
    ? (botError ??
      ordersError ??
      transactionsError ??
      profitError ??
      eventsError ??
      /*  avgPriceError ?? */
      null)
    : null;

  const { refetch: refetchBot } = botQuery;
  const { refetch: refetchOrders } = ordersResult;
  const { refetch: refetchTransactions } = transactionsResult;
  const { refetch: refetchProfit } = profitResult;
  const { refetch: refetchLeverage } = leverageQuery;
  const { refetch: refetchEvents } = eventsResult;
  /* const { refetch: refetchAvgPrice } = avgPriceResult; */

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const tasks: Array<Promise<unknown>> = [
        refetchBot(),
        refetchOrders(),
        refetchTransactions(),
        refetchProfit(),
        refetchEvents(),
      ];

      if (shouldFetchLeverage) {
        tasks.push(refetchLeverage());
      }

      /* if (shouldFetchAvgPrice) {
        tasks.push(refetchAvgPrice());
      } */

      await Promise.all(tasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    refetchBot,
    refetchOrders,
    refetchTransactions,
    refetchProfit,
    refetchLeverage,
    refetchEvents,
    /* refetchAvgPrice, */
    shouldFetchLeverage,
    /*  shouldFetchAvgPrice, */
  ]);

  const setCurrency = useCallback((currency: GridCurrency) => {
    setPreferences((prev) =>
      prev.currency === currency ? prev : { ...prev, currency }
    );
  }, []);

  const setOrdersTab = useCallback(
    (tab: GridPageState['preferences']['ordersView']) => {
      setPreferences((prev) =>
        prev.ordersView === tab ? prev : { ...prev, ordersView: tab }
      );
    },
    []
  );

  const setMarketOverview = useCallback((state: GridMarketOverviewState) => {
    setMarketOverviewState(state);
  }, []);

  const formatOrder = useCallback(
    (order: BotOrder) => mapOrderToRow(order),
    []
  );

  const formatTransaction = useCallback(
    (transaction: Transaction) => mapTransactionToRow(transaction),
    []
  );

  const state = useMemo(() => {
    const baseState = {
      status,
      botId: options.botId ?? null,
      botType,
      orders: ordersState,
      transactions: transactionsState,
      events: eventsState,
      charts,
      overlays: {
        avgPrice: {
          lines: [],
          hasData: false,
          isLoading: false,
        },
        /* avgPriceState */
      },
      marketOverview,
      preferences,
      leverage: leverageState,
    } as GridPageState;

    if (botData) {
      baseState.bot = botData;
    }

    if (metrics) {
      baseState.metrics = metrics;
    }

    if (funds) {
      baseState.funds = funds;
    }

    if (error) {
      baseState.error = error;
    }

    return baseState;
  }, [
    status,
    options.botId,
    botType,
    ordersState,
    transactionsState,
    charts,
    /* avgPriceState, */
    marketOverview,
    preferences,
    leverageState,
    eventsState,
    botData,
    metrics,
    funds,
    error,
  ]);

  return useMemo(
    () => ({
      state,
      actions: {
        refresh,
        setCurrency,
        setOrdersTab,
        setMarketOverview,
      },
      helpers: {
        formatOrder,
        formatTransaction,
      },
    }),
    [
      state,
      refresh,
      setCurrency,
      setOrdersTab,
      setMarketOverview,
      formatOrder,
      formatTransaction,
    ]
  );
};
