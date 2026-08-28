import { isReadOnly } from '@/lib/demoMode';
import { isReady as isAnalyticsReady } from '@/lib/analytics';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  StrategyEnum,
  type ComboBot,
  type DCABot,
  type ExchangeInUser,
} from '@/types';
import { comboDealToOpenTrade } from '@/lib/utils/comboDealToOpenTrade';
import {
  areAllBotsDeletable,
  filterDeletableBots,
  filterRestartableBots,
  filterStartableBots,
  filterStoppableBots,
} from '@/utils/botStatusUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import {
  Archive,
  Boxes,
  Edit,
  ExternalLink,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Square,
  Star,
  Trash2,
} from 'lucide-react';
import EmptyState from '../components/ui/empty-state';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BotActionsMenuItems,
  type BotStatusType,
  type BotTypeId,
} from '../components/bots/BotActionsMenuItems';
import { BotCard } from '../components/bots/BotCard';
import { BotUsageCell } from '../components/bots/BotUsageCell';
import { Skeleton } from '@/components/ui/skeleton';
import { BotDetailsDrawer } from '../components/bots/BotDetailsDrawer';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
} from '../components/modals';
import BotsSkeleton from '../components/ui/BotsPageSkeleton';
import { Button } from '../components/ui/button';
import {
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
  StrategyChip,
} from '../components/ui/chip';
import { DataTable } from '../components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import OpenOrdersWidget from '../components/widgets/shared/OpenOrdersWidget';

import { MotionButton } from '../components/ui/MotionWrapper';
import BotListStatsBoxes from '../components/ui/BotListStatsBoxes';
import Widget from '../components/ui/widget';
import CoinPair from '../components/widgets/shared/CoinPair';
import StaleIndicator from '../components/widgets/shared/StaleIndicator';
import { CARD_VIEW_COLUMNS } from '../config/responsive';
import {
  useBotArchive,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from '../hooks/useBotMutations';
import { useBotActions } from '../hooks/useBotActions';
import { BotActionsModals } from '../components/bots/BotActionsModals';
import { useBotModeGuard } from '../hooks/bots/base/useBotModeGuard';
import { useCacheKey } from '../hooks/useCacheKey';
import { useCacheStatus } from '../hooks/useCacheStatus';
import {
  useComboBots,
  useComboBotStats,
  type ComboBotsFilter,
} from '../hooks/useComboBots';
import { logger } from '../lib/loggerInstance';
import { toast } from '../lib/toast';
import { useComboBotStore } from '../stores/botWidgetsStoreFactory';
import { useUIStore } from '../stores/uiStore';
/* import type { DrawerBot } from '../types/bots/drawer'; */
/* import { transformDcaBotToBot,  type ComboBot } from '../types/comboBot'; */
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import { useUserFees } from '@/hooks/useUserFeesService';
import { useAuthStore } from '@/stores/authStore';
import { useBotStatsStore } from '@/stores/live';
import { transformDcaBotToBot } from '@/types/dcaBot';
import { useShareContext } from '../hooks/useShareContext';
import { useDrawerBot } from '../hooks/useDrawerBot';
import { useStableBotTransforms } from '../hooks/useStableBotTransforms';
import type { CalculatedBotStats } from '../services/metrics/BotMetricsCalculator';
import { useComboDeals } from '../hooks/useComboDeals';

const COMBO_BOT_TYPE_ID = 'combo';

// Bot table actions component for mobile accessibility
interface BotTableActionsProps {
  bot: ReturnType<typeof transformDcaBotToBot>;
  originalBotData: ComboBot | undefined;
}

const BotTableActions: React.FC<BotTableActionsProps> = ({
  bot,
  originalBotData,
}) => {
  // Shared bot-action orchestration (clone opens the pre-filled create page;
  // status/delete via the confirmation modals rendered by <BotActionsModals>).
  const botActions = useBotActions({
    botId: bot.id,
    botType: BotTypesEnum.combo,
    botName: bot.name,
    status: bot.status,
    activeDeals: originalBotData?.dealsInBot?.active || 0,
    totalValue: originalBotData?.usage?.current?.quote || 0,
    currency: originalBotData?.symbol?.[0]?.value?.quoteAsset || 'USD',
    lastActivity: originalBotData?.created || 'Unknown',
    botData: originalBotData ?? bot,
    onCopyToLive: () => {
      toast.info('Copy to live not yet implemented for combo bots');
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <BotActionsMenuItems
          align="end"
          className="w-56"
          bot={{
            id: bot.id,
            name: bot.name,
            type: bot.type as BotTypeId,
            status: bot.status as BotStatusType,
            coldArchived: bot.coldArchived,
          }}
          {...botActions.menuProps}
        />
      </DropdownMenu>

      {/* Shared status / delete / success modals, driven by useBotActions. */}
      <BotActionsModals {...botActions.modalProps} />
    </>
  );
};

type ProfitabilityFilter = 'all' | 'profitable' | 'losing';
type ComboActiveFilters = {
  status: string[];
  exchange: string[];
  strategy: string[];
  profitability: ProfitabilityFilter;
};

const ComboBots: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const selectedBot = params.id ?? null;
  const privacyMode = useUIStore((state) => state.privacyMode);

  // When opening a specific bot via /combo/view/:id, keep the bot's real
  // paper/live mode authoritative over the global toggle so a refresh doesn't
  // flip the drawer to the wrong mode (and the bot vanishes). Thread 4872.
  useBotModeGuard(selectedBot ?? undefined, BotTypesEnum.combo, {
    enabled: !!selectedBot,
  });

  // Check if in demo mode (read-only)
  const readOnly = isReadOnly();

  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.combo);
  const restartMutation = useBotRestart();

  const [showArchived, setShowArchived] = useState(false);
  const [activeFilters] = useState<ComboActiveFilters>({
    status: [],
    exchange: [],
    strategy: [],
    profitability: 'all',
  });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Manage widget layout
  const { initializeDefaultWidgets } = useComboBotStore();

  useEffect(() => {
    initializeDefaultWidgets({ botTypeId: COMBO_BOT_TYPE_ID, mode: 'create' });
  }, [initializeDefaultWidgets]);

  // Get real Combo bot data with filtering options
  const filterOptions: ComboBotsFilter = useMemo(
    () => ({
      status: showArchived ? ['archive'] : undefined,
    }),
    [showArchived]
  );
  const {
    bots: comboBots,
    isLoading: botsLoading,
    isError: botsError,
  } = useComboBots(filterOptions);

  const handleSelectBot = useCallback(
    (botId: string | null) => {
      // Carry the page-level Bots/Deals view across drawer open/close —
      // these navigations replace the whole query string otherwise.
      const suffix = searchParams.get('view') === 'deals' ? '?view=deals' : '';
      if (botId) {
        navigate(`/combo/view/${botId}${suffix}`);
      } else {
        navigate(`/combo${suffix}`);
      }
    },
    [navigate, searchParams]
  );

  // Track pageview when bot is selected and data is available
  // Note: Actual pageview tracking is handled by useBotAnalytics in BotDetailsDrawer
  // This useEffect is kept for potential future analytics needs
  useEffect(() => {
    if (selectedBot && comboBots && isAnalyticsReady()) {
      const botData = comboBots.find((b) => b._id === selectedBot);
      if (botData) {
        // Bot data available - drawer will handle pageview tracking
        logger.debug(`[ComboBots] Bot selected: ${selectedBot}`);
      }
    }
  }, [selectedBot, comboBots]);

  const deleteMutation = useBotDelete();
  const archiveMutation = useBotArchive();

  // Bulk delete modal state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<
    ReturnType<typeof transformDcaBotToBot>[]
  >([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Bulk status change modal state
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusTargets, setBulkStatusTargets] = useState<
    ReturnType<typeof transformDcaBotToBot>[]
  >([]);
  const [bulkStatusAction, setBulkStatusAction] = useState<'start' | 'stop'>(
    'start'
  );
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false);

  // Map of original combo bots for quick lookups
  const originalComboBotMap = useMemo(() => {
    const map = new Map<string, ComboBot>();
    for (const b of comboBots || []) {
      map.set(b._id, b);
    }
    return map;
  }, [comboBots]);

  const getOriginalComboBot = useCallback(
    (botId: string) => {
      return originalComboBotMap.get(botId);
    },
    [originalComboBotMap]
  );

  const handleOpenBulkDelete = (
    bots: ReturnType<typeof transformDcaBotToBot>[]
  ) => {
    if (!bots || bots.length === 0) {
      toast.info('No bots selected');
      return;
    }

    if (!areAllBotsDeletable(bots)) {
      const deletableBots = filterDeletableBots(bots);
      if (deletableBots.length === 0) {
        toast.info(
          'Only closed or archived bots can be deleted. Stop bots before deleting.'
        );
      } else {
        toast.info(
          'Some selected bots are still running. Stop them before bulk delete.'
        );
      }
      return;
    }

    setBulkDeleteTargets(bots);
    setBulkDeleteOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (!areAllBotsDeletable(bulkDeleteTargets)) {
      toast.info(
        'Only closed or archived bots can be deleted. Stop bots before deleting.'
      );
      setBulkDeleteOpen(false);
      setBulkDeleteTargets([]);
      return;
    }

    setBulkDeleteLoading(true);
    try {
      for (const b of bulkDeleteTargets) {
        await deleteMutation.mutateAsync({
          id: b.id,
          type: BotTypesEnum.combo,
        });
      }
      toast.success(`Deleted ${bulkDeleteTargets.length} bot(s)`);
    } catch (error) {
      console.error('Failed to delete selected combo bots:', error);
      toast.error('Failed to delete selected bot(s)');
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteOpen(false);
      setBulkDeleteTargets([]);
    }
  };

  // Open bulk status change modal
  const handleOpenBulkStatusChange = (
    bots: ReturnType<typeof transformDcaBotToBot>[],
    action: 'start' | 'stop'
  ) => {
    const filteredBots =
      action === 'start'
        ? filterStartableBots(bots)
        : filterStoppableBots(bots);

    if (filteredBots.length === 0) {
      toast.info(
        action === 'start'
          ? 'No stopped bots selected'
          : 'No active bots selected'
      );
      return;
    }
    setBulkStatusTargets(filteredBots);
    setBulkStatusAction(action);
    setBulkStatusOpen(true);
  };

  const handleBulkRestart = async (
    bots: ReturnType<typeof transformDcaBotToBot>[]
  ) => {
    const restartableBots = filterRestartableBots(bots);

    if (restartableBots.length === 0) {
      toast.info('No active bots selected');
      return;
    }

    try {
      for (const b of restartableBots) {
        await restartMutation.mutateAsync({
          id: b.id,
          type: BotTypesEnum.combo,
        });
      }
      toast.success(`Restarted ${restartableBots.length} bot(s)`);
    } catch {
      toast.error('Failed to restart selected bots');
    }
  };

  // Confirm bulk status change
  const handleConfirmBulkStatusChange = async (closeType?: string) => {
    setBulkStatusLoading(true);
    try {
      const newStatus = bulkStatusAction === 'start' ? 'open' : 'closed';
      for (const b of bulkStatusTargets) {
        await statusToggleMutation.mutateAsync({
          id: b.id,
          status: newStatus,
          closeType:
            bulkStatusAction === 'stop'
              ? (closeType as CloseDCATypeEnum | undefined)
              : undefined,
        });
      }
      toast.success(
        `${bulkStatusAction === 'start' ? 'Started' : 'Stopped'} ${bulkStatusTargets.length} bot(s)`
      );
    } catch (error) {
      console.error('Failed to change status for selected bots:', error);
      toast.error('Failed to change status for selected bots');
    } finally {
      setBulkStatusLoading(false);
      setBulkStatusOpen(false);
      setBulkStatusTargets([]);
    }
  };

  // Check if any bulk targets have active deals (for showing close options)
  const bulkHasActiveDeals = useMemo(() => {
    return bulkStatusTargets.some((b) => {
      const original = getOriginalComboBot(b.id);
      return (original?.dealsInBot?.active || 0) > 0;
    });
  }, [bulkStatusTargets, getOriginalComboBot]);

  const { botListStats, isLoading: statsLoading } =
    useComboBotStats(filterOptions);
  const { fetchMultipleFees } = useUserFees();
  const [allFees, setAllFees] = useState<
    Array<{ exchange: string; symbol: string; fee: number }>
  >([]);

  const botSymbolsMap = useMemo(() => {
    const symbolsMap = new Map<string, Set<string>>();

    for (const bot of comboBots || []) {
      const exchangeUuid = bot.exchangeUUID;
      if (!exchangeUuid) continue;

      for (const symbolEntry of bot.symbol || []) {
        const symbol = symbolEntry.value?.symbol;
        if (!symbol) continue;

        if (!symbolsMap.has(exchangeUuid)) {
          symbolsMap.set(exchangeUuid, new Set());
        }
        symbolsMap.get(exchangeUuid)?.add(symbol);
      }
    }

    return symbolsMap;
  }, [comboBots]);

  const tokens = useAuthStore((state) => state.tokens);
  const currentUser = useAuthStore((state) => state.user);

  // Share-link path: see TradingBots.tsx — single-bot fetch when `?share=…`
  // is present on a combo URL, used to hydrate the drawer for non-owners.
  const { shareId } = useShareContext();

  useEffect(() => {
    if (botSymbolsMap.size === 0) {
      return;
    }

    // Use the service to fetch fees with automatic caching
    fetchMultipleFees({
      exchangeSymbolMap: botSymbolsMap,
      options: {
        debug: import.meta.env.DEV,
      },
    })
      .catch((error) => {
        logger.error('[TradingBots] Error fetching fees via service:', error);
      })
      .then((res) => {
        setAllFees(
          (res || []).map((r) => ({
            exchange: r.exchangeUUID,
            symbol: r.symbol,
            fee: r.maker,
          }))
        );
      });
  }, [botSymbolsMap, tokens?.accessToken, fetchMultipleFees]);

  const [currentPrices, setCurrentPrices] = useState(() => getLocalPrices());

  const lastPriceUpdateRef = useRef(0);
  const lastAcceptedPricesLengthRef = useRef(0);
  const PRICE_UPDATE_THROTTLE_MS = 10000; // Increased to 10 seconds for better stability

  useEffect(() => {
    // Subscribe to price updates
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastPriceUpdateRef.current;

        // The price helper invokes this callback twice on subscribe: once
        // with IDB-cached prices (often empty/stale on a fresh session),
        // then ~100ms later with the live `/tickers` fetch. The 10s throttle
        // was rejecting that second update, leaving the page on the empty
        // cache for up to a 60s helper interval — which broke the unPnL
        // formula in transformDcaBotToBot for bots without server-side
        // liveStats. Always accept when our snapshot is empty or when the
        // new payload is materially larger than what we have.
        const shouldBypassThrottle =
          result.data.length > 0 &&
          (lastAcceptedPricesLengthRef.current === 0 ||
            result.data.length > lastAcceptedPricesLengthRef.current * 1.1);

        if (
          shouldBypassThrottle ||
          timeSinceLastUpdate > PRICE_UPDATE_THROTTLE_MS
        ) {
          setCurrentPrices(result.data);
          lastPriceUpdateRef.current = now;
          lastAcceptedPricesLengthRef.current = result.data.length;
        }
      }
    }, false); // false = don't load binance US

    return unsubscribe;
  }, []);

  const memoizedPrices = useMemo(() => currentPrices, [currentPrices]);

  const [userExchanges, setUserExchanges] = useState<ExchangeInUser[]>([]);

  const { data: exchangesData } = useExchangesFromContext();

  useEffect(() => {
    if (exchangesData?.data) {
      const exchanges = exchangesData.data.exchanges || [];
      setUserExchanges(exchanges);
    }
  }, [exchangesData]);

  const memoizedUserExchanges = useMemo(() => userExchanges, [userExchanges]);

  // Memoize allFees to prevent unnecessary re-renders
  const memoizedAllFees = useMemo(() => allFees, [allFees]);

  const [stableDependencies, setStableDependencies] = useState(() => ({
    prices: memoizedPrices,
    fees: memoizedAllFees,
    exchanges: memoizedUserExchanges,
    lastUpdated: Date.now(),
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if there are actual changes
      if (
        stableDependencies.prices !== memoizedPrices ||
        stableDependencies.fees !== memoizedAllFees ||
        stableDependencies.exchanges !== memoizedUserExchanges
      ) {
        setStableDependencies({
          prices: memoizedPrices,
          fees: memoizedAllFees,
          exchanges: memoizedUserExchanges,
          lastUpdated: Date.now(),
        });
      }
    }, 1500); // Increased debounce time to 1.5 seconds for better stability

    return () => clearTimeout(timer);
  }, [
    memoizedPrices,
    memoizedAllFees,
    memoizedUserExchanges,
    stableDependencies.prices,
    stableDependencies.fees,
    stableDependencies.exchanges,
  ]);

  const liveBotStats = useBotStatsStore((state) => state.botStats);

  // Transform each combo bot with a per-bot memo so a live-stats tick for one
  // bot doesn't produce fresh `item` objects for the whole grid (which would
  // defeat the card React.memo and re-render every card). Only the ticking
  // bot's slice changes, so only that card gets a new object.
  // See useStableBotTransforms.
  const transformComboBot = useCallback(
    (comboBot: ComboBot, slice: CalculatedBotStats | undefined) => {
      try {
        return transformDcaBotToBot(
          comboBot,
          stableDependencies.fees,
          stableDependencies.prices,
          true,
          stableDependencies.exchanges,
          slice
        );
      } catch (error) {
        if (import.meta.env.DEV) {
          logger.error('[ComboBots] Error transforming bot:', {
            botId: comboBot._id,
            error,
          });
        }
        throw error;
      }
    },
    [stableDependencies]
  );

  const transformedBots = useStableBotTransforms(
    comboBots,
    (comboBot) => comboBot._id,
    (id) => liveBotStats[id],
    stableDependencies,
    transformComboBot
  );

  // Shared drawer-bot resolution: list lookup + by-id fallback (archived/share
  // bots) + sticky-through-refetch, all in one place for every bot page.
  const drawerBot = useDrawerBot({
    selectedBotId: selectedBot,
    listBots: transformedBots,
    type: BotTypesEnum.combo,
    shareId,
    listLoading: botsLoading,
    transformRaw: (raw) =>
      transformDcaBotToBot(raw as ComboBot, [], [], true, [], undefined),
  });

  // Register cache status to show stale indicator and auto revalidation
  // Use the same variables as the query so the cache key matches the real query
  const defaultComboStatuses = [
    'open',
    'range',
    'monitoring',
    'error',
    'closed',
  ];
  const comboCacheKey = useCacheKey('comboBotList', {
    input: { all: true, status: defaultComboStatuses },
  });
  useCacheStatus('combo-bots', [comboCacheKey], ['comboBotList']);

  /*  const transformComboBotForDrawer = useCallback(
    (item: ReturnType<typeof transformDcaBotToBot>): DrawerBot | null => {
      const originalBot = comboBots.find((bot) => bot._id === item.id);
      if (!originalBot) {
        return null;
      }

      const sumAssetValues = (
        entries?: Array<{ key: string; value: number }>
      ) =>
        entries?.reduce((total, entry) => total + (entry?.value ?? 0), 0) ?? 0;

      const primarySymbol =
        item.symbol ??
        originalBot.symbol?.[0]?.value?.symbol ??
        originalBot.settings?.pair?.[0] ??
        '';

      const fallbackSymbol = primarySymbol || 'COMBO';
      const mappedSymbols =
        originalBot.symbol?.map(
          (entry: ComboBot['symbol'][number]) => entry?.value?.symbol
        ) ?? [];
      const derivedSymbols =
        item.symbols?.length && item.symbols.length > 0
          ? item.symbols
          : mappedSymbols.filter(
              (symbol: string | undefined): symbol is string => Boolean(symbol)
            );
      const symbols =
        derivedSymbols.length > 0 ? derivedSymbols : [fallbackSymbol];

      const pairLabel = (() => {
        const configuredPairs = originalBot.settings?.pair ?? [];
        if (configuredPairs.length === 1) {
          return configuredPairs[0];
        }
        if (configuredPairs.length > 1) {
          return `${configuredPairs.length} pairs`;
        }
        return item.pair ?? fallbackSymbol;
      })();

      const coinPair =
        item.coinPair ??
        originalBot.symbol?.[0]?.value?.symbol ??
        fallbackSymbol;

      const baseAsset = originalBot.symbol?.[0]?.value?.baseAsset;
      const quoteAsset = originalBot.symbol?.[0]?.value?.quoteAsset;

      const initialQuoteBalance = sumAssetValues(
        originalBot.initialBalances?.quote
      );
      const investedUsd = item.investedUsd ?? initialQuoteBalance;
      const invested = item.invested ?? investedUsd;

      const usedBase = sumAssetValues(originalBot.assets?.used?.base);
      const usedQuote = sumAssetValues(originalBot.assets?.used?.quote);
      const requiredBase = sumAssetValues(originalBot.assets?.required?.base);
      const requiredQuote = sumAssetValues(originalBot.assets?.required?.quote);

      const usageCurrentBase = originalBot.usage?.current?.base ?? usedBase;
      const usageCurrentQuote = originalBot.usage?.current?.quote ?? usedQuote;
      const usageMaxBase = originalBot.usage?.max?.base ?? requiredBase;
      const usageMaxQuote = originalBot.usage?.max?.quote ?? requiredQuote;

      const currentCost =
        item.currentCost ?? originalBot.usage?.current?.quote ?? usedQuote ?? 0;

      const maxCost =
        item.maxCost ?? originalBot.usage?.max?.quote ?? requiredQuote ?? 0;

      const profitUsd = item.profitUsd ?? item.profit ?? 0;

      const currentQuoteBalance = sumAssetValues(
        originalBot.currentBalances?.quote
      );
      const totalValue = item.value ?? currentQuoteBalance + profitUsd;

      const unrealizedUsd = originalBot.unrealizedProfit ?? 0;

      const unrealizedPercent =
        investedUsd > 0 ? (unrealizedUsd / investedUsd) * 100 : 0;

      const openTrades = item.openTrades ?? originalBot.dealsInBot?.active ?? 0;

      const closedTrades =
        item.closedTrades ?? (originalBot.dealsInBot?.all ?? 0) - openTrades;

      const rawData = (item.rawData ??
        originalBot) as unknown as DrawerBot['rawData'];

      const combinedCurrent = usageCurrentBase + usageCurrentQuote;
      const combinedMax = usageMaxBase + usageMaxQuote;

      const usagePercent =
        maxCost > 0 ? (currentCost / maxCost) * 100 : (item.usage ?? 0);

      const currentUsage = {
        current: combinedCurrent > 0 ? combinedCurrent : undefined,
        currentUsd:
          originalBot.usage?.currentUsd ??
          (currentCost > 0 ? currentCost : undefined),
        max: combinedMax > 0 ? combinedMax : undefined,
        base: usageCurrentBase > 0 ? usageCurrentBase : undefined,
        quote: usageCurrentQuote > 0 ? usageCurrentQuote : undefined,
      } satisfies DrawerBot['currentUsage'];

      return {
        id: item.id,
        name: item.name,
        type: 'combo',
        exchange: item.exchange ?? originalBot.exchange,
        exchangeUUID: originalBot.exchangeUUID,
        symbol: primarySymbol || symbols[0],
        symbols,
        pair: pairLabel,
        coinPair,
        strategy:
          item.strategy ?? originalBot.settings?.strategy ?? 'Combo Strategy',
        status: item.status ?? 'active',
        scanner: item.scanner ?? originalBot.settings?.strategy,
        color: item.color,
        baseAsset,
        quoteAsset,
        profit: item.profit ?? profitUsd,
        profitUsd,
        pnlPercent: item.pnlPercent ?? unrealizedPercent,
        invested,
        investedUsd,
        runtime: item.runtime,
        totalProfitUsd: item.totalProfitUsd ?? profitUsd,
        totalProfitPercent:
          item.totalProfitPercent ??
          (investedUsd > 0 ? (profitUsd / investedUsd) * 100 : 0),
        value: totalValue,
        avgDaily: item.avgDaily ?? 0,
        annualizedReturn: item.annualizedReturn ?? 0,
        tradingTime: item.tradingTime ?? item.runtime,
        created:
          item.created ?? new Date(originalBot.created).toLocaleDateString(),
        usage: usagePercent,
        deals: item.deals ?? originalBot.dealsInBot?.all ?? 0,
        currentCost,
        maxCost,
        currentBaseUsage: item.currentBaseUsage ?? usageCurrentBase,
        maxBaseUsage: item.maxBaseUsage ?? usageMaxBase,
        unrealizedPnl: unrealizedUsd,
        unrealizedPnlUsd: unrealizedUsd,
        unrealizedPnlPercent: unrealizedPercent,
        openTrades,
        closedTrades,
        ...(rawData ? { rawData } : {}),
        settings: {
          strategy: originalBot.settings?.strategy ?? item.strategy,
        },
        currentUsage,
      };
    },
    [comboBots]
  ); */

  // Create a map of bot IDs to original bot data for actions
  const botDataMap = useMemo(() => {
    const map = new Map();
    comboBots.forEach((bot) => map.set(bot._id, bot));
    return map;
  }, [comboBots]);

  const NameCell: React.FC<{ value: string; id: string }> = ({ value, id }) => {
    const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
    const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);
    const starred = starredBotIds.has(id);
    return (
      <div className="flex items-center gap-xs">
        <div className="truncate">{value}</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(`/combo/view/${id}`, '_blank');
          }}
          className="p-1 rounded hover:bg-muted/30"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStarred(id);
          }}
          className="p-1 rounded hover:bg-muted/30"
          title={starred ? 'Unstar bot' : 'Star bot'}
        >
          <Star
            className={`w-4 h-4 ${starred ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`}
          />
        </button>
      </div>
    );
  };

  // Define columns for the data table
  const columns: ColumnDef<ReturnType<typeof transformDcaBotToBot>>[] = useMemo(
    () => [
      {
        accessorKey: 'exchangeUUID',
        header: 'EXCHANGE',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            return [bot['exchangeName'], bot['exchange']].filter(
              Boolean
            ) as string[];
          },
        },
        cell: ({ getValue }) => {
          const exchangeUUID = getValue() as string;
          return (
            <div className="flex items-center">
              {/* Show user's saved name and the canonical exchange/provider info */}
              <ExchangeChip
                exchangeId={exchangeUUID}
                size="sm"
                layout="stacked"
                chipStyle="soft"
              />
            </div>
          );
        },
        getGroupingValue: (row) => row.exchangeName || row.exchange,
        aggregatedCell: ({ row }) => {
          const exchangeUUID =
            (row.getGroupingValue('exchangeUUID') as string) || '';
          return (
            <div className="flex items-center gap-xs font-medium">
              <ExchangeChip
                exchangeId={exchangeUUID}
                size="sm"
                layout="stacked"
                chipStyle="soft"
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'coinPair',
        header: 'COIN PAIR',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            const coinPair = (bot['coinPair'] as string) || '';
            const pair = (bot['pair'] as string) || '';
            const baseAsset = (bot['baseAsset'] as string) || '';
            const quoteAsset = (bot['quoteAsset'] as string) || '';
            return [
              coinPair,
              pair,
              baseAsset,
              quoteAsset,
              coinPair.replace('/', ''),
            ].filter(Boolean);
          },
        },
        cell: ({ getValue, row }) => {
          const coinPair = (getValue() as string) || row.original.pair; /* ||
            (row.original.symbols && row.original.symbols[0]) */
          return (
            <CoinPair
              /* baseAsset={row.original.baseAsset}
              quoteAsset={row.original.quoteAsset} */
              pair={coinPair}
              iconSize="sm"
              showText={true}
              layout="horizontal"
            />
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'NAME',
        meta: { filterType: 'string' },
        cell: ({ getValue, row }) => {
          const name = getValue() as string;
          const id = row.original.id as string;
          return <NameCell value={name} id={id} />;
        },
      },
      {
        accessorKey: 'strategy',
        header: 'STRATEGY',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            const settings = bot['settings'] as
              | Record<string, unknown>
              | undefined;
            return [bot['strategy'], settings?.['strategy']].filter(
              Boolean
            ) as string[];
          },
        },
        cell: ({ getValue, row }) => {
          const strategy =
            (getValue() as string) || row.original.settings.strategy;
          return (
            <StrategyChip
              strategy={strategy || StrategyEnum.long}
              size="xs"
              chipStyle="solid"
            />
          );
        },
        getGroupingValue: (row) => row.settings?.strategy || StrategyEnum.long,
        aggregatedCell: ({ row }) => {
          const strategy =
            (row.getGroupingValue('strategy') as string) || StrategyEnum.long;
          return (
            <div className="flex items-center gap-xs font-medium">
              <StrategyChip
                strategy={strategy as StrategyEnum}
                size="xs"
                chipStyle="solid"
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'maxValue',
        header: 'MAX COST',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ getValue }) => {
          const cost = getValue() as number;
          return <span>{privacyMode ? '***' : `$${cost.toFixed(2)}`}</span>;
        },
        footerValue: (value: number) => (
          <span className="font-bold">
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        accessorKey: 'totalProfitUsd',
        header: 'TOTAL PROFIT, $',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ row }) => {
          const profit = row.original.totalProfitUsd ?? 0;
          const percentage = row.original.profitPerc ?? 0;
          return (
            <ProfitAndPerc
              value={profit}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        accessorKey: 'profitPerc',
        header: 'TOTAL PROFIT',
        meta: { filterType: 'number' },
        cell: ({ getValue }) => {
          const profit = getValue() as number;
          return <ProfitLossPercChip value={profit} size="sm" />;
        },
      },
      {
        accessorKey: 'unPnl',
        header: 'VALUE',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ row }) => {
          if (row.original.isActive && row.original.loadedPrices === false) {
            return <Skeleton className="h-4 w-16" />;
          }
          const value = row.original.unPnl ?? 0;
          const percentage = row.original.unPnlPerc ?? 0;
          return (
            <ProfitAndPerc
              value={value}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-green-600 font-bold'
                  : 'text-red-600 font-bold'
            }
          >
            {privacyMode
              ? '***'
              : value < 0
                ? `-$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                : `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
          </span>
        ),
      },
      {
        accessorKey: 'avgDaily',
        header: 'AVG DAILY',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'average',
        },
        aggregationFn: 'mean',
        cell: ({ row }) => {
          const daily = row.original.avgDaily ?? 0;
          const dailyPerc = row.original.avgDailyPerc ?? 0;
          return (
            <ProfitAndPerc
              value={daily}
              percentage={dailyPerc}
              privacyMode={privacyMode}
              chipPosition="bottom"
              size="sm"
            />
          );
        },
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        id: 'netPnl',
        header: 'NET PNL',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        accessorFn: (row) => {
          const totalProfit = row.totalProfitUsd ?? 0;
          const unrealized = row.unPnl ?? 0;
          return totalProfit + unrealized;
        },
        cell: ({ row }) => {
          if (row.original.isActive && row.original.loadedPrices === false) {
            return <Skeleton className="h-4 w-16" />;
          }
          const totalProfit = row.original.totalProfitUsd ?? 0;
          const unrealized = row.original.unPnl ?? 0;
          const netPnl = totalProfit + unrealized;
          const cost = row.original.currentValue ?? row.original.maxValue ?? 0;
          const percentage = cost > 0 ? (netPnl / cost) * 100 : 0;
          return (
            <ProfitAndPerc
              value={netPnl}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        id: 'netPnlPercentage',
        header: 'NET PNL, %',
        meta: {
          filterType: 'number',
        },
        accessorFn: (row) => {
          const totalProfit = row.totalProfitUsd ?? 0;
          const unrealized = row.unPnl ?? 0;
          const netPnl = totalProfit + unrealized;
          const cost = row.currentValue ?? row.maxValue ?? 0;
          return cost > 0 ? (netPnl / cost) * 100 : 0;
        },
        cell: ({ row }) => {
          if (row.original.isActive && row.original.loadedPrices === false) {
            return <Skeleton className="h-4 w-12" />;
          }
          const totalProfit = row.original.totalProfitUsd ?? 0;
          const unrealized = row.original.unPnl ?? 0;
          const netPnl = totalProfit + unrealized;
          const cost = row.original.currentValue ?? row.original.maxValue ?? 0;
          const percentage = cost > 0 ? (netPnl / cost) * 100 : 0;
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
      },
      {
        accessorKey: 'annualizedReturn',
        header: 'ANNUALIZED RETURN',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const annualizedReturnPerc = row.original.annualizedReturn ?? 0;
          const annualizedReturnUsd = (row.original.avgDaily ?? 0) * 365;
          return (
            <ProfitAndPerc
              value={annualizedReturnUsd}
              percentage={annualizedReturnPerc}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
      },
      {
        accessorKey: 'workingTime',
        header: 'TRADING TIME',
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'currentValue',
        header: 'CURRENT COST',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ getValue }) => {
          const cost = getValue() as number;
          return <span>{privacyMode ? '***' : `$${cost.toFixed(2)}`}</span>;
        },
        footerValue: (value: number) => (
          <span className="font-bold">
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        accessorKey: 'created',
        header: 'CREATED',
        meta: { filterType: 'string' },
        cell: ({ row }) => {
          const created = row.original.created;
          if (!created) return 'N/A';
          const date = new Date(created);
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        },
      },
      {
        accessorKey: 'status',
        header: 'STATUS',
        meta: { filterType: 'string' },
        cell: ({ getValue, row }) => {
          const status = getValue() as string;
          const reason = (row.original as { statusReason?: unknown })
            .statusReason;
          const tooltip =
            status === 'error' && typeof reason === 'string'
              ? reason
              : undefined;
          return (
            <StatusChip
              status={status}
              size="xs"
              chipStyle="soft"
              tooltip={tooltip}
            />
          );
        },
        getGroupingValue: (row) => row.status,
        aggregatedCell: ({ row }) => {
          const status = (row.getGroupingValue('status') as string) || '';
          return (
            <div className="flex items-center gap-xs font-medium">
              <StatusChip status={status} size="xs" chipStyle="soft" />
            </div>
          );
        },
      },
      {
        accessorKey: 'usage',
        // Sort/filter on the numeric `usageTotal` percentage, not the nested
        // `usage` object that `accessorKey: 'usage'` would otherwise resolve to.
        accessorFn: (row) => row.usageTotal || 0,
        header: 'USAGE',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <BotUsageCell
            botId={row.original.id}
            usageTotal={row.original.usageTotal}
            dealType="combo"
          />
        ),
      },
      {
        accessorKey: 'deals',
        header: 'DEALS',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const totalDeals = (row.original as DCABot).dealsInBot.all;
          const activeDeals = (row.original as DCABot).dealsInBot.active;
          return (
            <div className="text-center">
              <div>Active: {activeDeals || 0}</div>
              <div>Total: {totalDeals || 0}</div>
            </div>
          );
        },
      },
      {
        accessorKey: 'cost',
        header: 'CREDITS COST',
        meta: { filterType: 'number' },
        cell: ({ getValue }) => {
          const cost = getValue() as number;
          return `${(cost || 0).toFixed(2)}`;
        },
      },
      {
        id: 'botId',
        accessorFn: (row) => row.id,
        header: 'BOT ID',
        cell: ({ row }) => {
          const value = row.original.id;
          if (!value) return <span className="text-muted-foreground">—</span>;
          return <span className="text-xs font-mono">{value}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: 'ACTIONS',
        cell: ({ row }) => {
          const bot = row.original;
          return (
            <BotTableActions
              bot={bot}
              originalBotData={botDataMap.get(bot.id)}
            />
          );
        },
        enableSorting: false,
        enableHiding: false,
        size: 56,
      },
    ],
    [privacyMode, botDataMap]
  );

  // archived/active counts are intentionally not shown in header anymore

  // Filter functionality is now handled by the native QuickFilterBar component

  const filteredData = useMemo(() => {
    let data = transformedBots;

    // No need for archive filtering here - handled by API query based on showArchived

    if (activeFilters.status.length > 0) {
      data = data.filter((bot) =>
        activeFilters.status.includes(bot.status ?? '')
      );
    }

    if (activeFilters.exchange.length > 0) {
      data = data.filter((bot) =>
        activeFilters.exchange.includes(bot.exchange ?? '')
      );
    }

    if (activeFilters.strategy.length > 0) {
      data = data.filter((bot) =>
        activeFilters.strategy.includes(
          (bot.settings.strategy ?? '').toString()
        )
      );
    }

    if (activeFilters.profitability === 'profitable') {
      data = data.filter((bot) => (bot.totalProfitUsd ?? 0) > 0);
    } else if (activeFilters.profitability === 'losing') {
      data = data.filter((bot) => (bot.totalProfitUsd ?? 0) < 0);
    }

    return data;
  }, [transformedBots, activeFilters]);
  // Put starred bots first in the list (subscribe to starred ids for reactivity)
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);
  const orderedFilteredData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aStar = starredBotIds.has(a.id) ? 0 : 1;
      const bStar = starredBotIds.has(b.id) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;

      // Prefer createdAt (numeric) when available, otherwise fall back to rawData.created
      const aCreated =
        a.createdAt ??
        new Date(/* a.rawData?.created || */ a.created || 0).getTime();
      const bCreated =
        b.createdAt ??
        new Date(/* b.rawData?.created ||  */ b.created || 0).getTime();
      return bCreated - aCreated;
    });
  }, [filteredData, starredBotIds]);

  // Keep current values in refs so BotCardWrapper can read the latest values
  // without recreating the component type (which causes all cards to remount).
  const selectedBotRef = useRef(selectedBot);
  selectedBotRef.current = selectedBot;
  const privacyModeRef = useRef(privacyMode);
  privacyModeRef.current = privacyMode;
  const handleSelectBotRef = useRef(handleSelectBot);
  handleSelectBotRef.current = handleSelectBot;

  const BotCardWrapper = useMemo(
    () =>
      React.memo(
        ({
          item,
          index,
        }: {
          item: ReturnType<typeof transformDcaBotToBot>;
          index: number;
        }) => (
          <BotCard
            type={BotTypesEnum.combo}
            item={item}
            index={index}
            onClick={(bot) => handleSelectBotRef.current(bot.id)}
            isSelected={selectedBotRef.current === item.id}
            privacyMode={privacyModeRef.current}
          />
        )
      ),

    [] // Never recreate — refs keep values current without changing component identity
  );

  // ----- Deals tab -----
  // `?view=deals` is the source of truth for the page-level Bots/Deals
  // toggle so reloads and deep links land on the right view. Absence of
  // the param means the default Bots view.
  const pageTab: 'bots' | 'deals' =
    searchParams.get('view') === 'deals' ? 'deals' : 'bots';
  const setPageTab = useCallback(
    (tab: 'bots' | 'deals') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'deals') next.set('view', 'deals');
          else next.delete('view');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Drive the deal fetch by the widget's open/closed toggle. Without this the
  // backend defaults to open-only and the Closed view is always empty.
  const [dealsStatus, setDealsStatus] = useState<'open' | 'closed'>('open');

  const { deals: comboDealsForTab } = useComboDeals({
    status:
      dealsStatus === 'closed'
        ? DCADealStatusEnum.closed
        : DCADealStatusEnum.open,
  });

  // Transform Combo deals to OpenTrade[] for the OpenOrdersWidget
  const comboDealsAsOpenTrades = useMemo(
    () =>
      comboDealsForTab.map((deal) =>
        comboDealToOpenTrade(deal, (id) => botDataMap.get(id)?.name)
      ),
    [comboDealsForTab, botDataMap]
  );

  // Only show the loading skeleton when we don't have any cached data yet
  if ((botsLoading || statsLoading) && comboBots.length === 0) {
    return (
      <MainLayout pageTitle="Combo Bots" activePage="/combo-bots">
        <BotsSkeleton
          title="Loading Combo Bots"
          description="Fetching your combo bot data and performance metrics..."
          statCount={4}
          statColumns={{ xs: 1, sm: 2, md: 2, lg: 4 }}
        />
      </MainLayout>
    );
  }
  if (botsError) {
    return (
      <MainLayout pageTitle="Combo Bots" activePage="/combo-bots">
        <WidgetContainer layout="flex" verticalGap>
          <Widget className="p-sm text-card-foreground" noPadding>
            <div className="space-y-xs">
              <h1 className="text-2xl font-bold">Combo Bots</h1>
              <p>Error loading combo bots</p>
            </div>
          </Widget>
        </WidgetContainer>
      </MainLayout>
    );
  }

  // Share-mode: render ONLY the shared bot's drawer (no list, no stats,
  // no create button). MainLayout short-circuits to SharedPageLayout so
  // the outer chrome is already minimal.
  if (shareId) {
    const sharedBotForDrawer = drawerBot.bot;
    const sharedOwnerId =
      (drawerBot.rawBot as { userId?: string } | null)?.userId;
    return (
      <MainLayout pageTitle="Shared combo bot" activePage="/combo-bots">
        {sharedBotForDrawer ? (
          <BotDetailsDrawer
            type={BotTypesEnum.combo}
            bot={sharedBotForDrawer}
            open
            onClose={() => navigate('/combo')}
            viewOnly
            ownerUserId={sharedOwnerId}
            fullWidth
          >
            <div />
          </BotDetailsDrawer>
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
            {drawerBot.isLoading
              ? 'Loading shared bot…'
              : 'Shared bot is not available.'}
          </div>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Combo Bots" activePage="/combo-bots">
      <WidgetContainer
        layout="flex"
        verticalGap
        className="h-full min-h-0 flex-1"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.3,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        >
          <Widget
            className="p-sm text-card-foreground flex-1 min-h-[500px]"
            noPadding
            overflow="auto"
          >
            <Tabs
              value={pageTab}
              onValueChange={(v) => setPageTab(v as 'bots' | 'deals')}
            >
              <div className="flex flex-col h-full min-h-[500px]">
                <motion.div
                  className="shrink-0"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  {/* Small screens: title and New combo Bot on same row */}
                  <div className="flex items-center justify-between w-full sm:hidden">
                    <div className="flex items-center gap-sm">
                      <div className="flex items-center gap-xs">
                        <h2 className="font-semibold text-xl">
                          Active Combo Bots
                        </h2>
                        <StaleIndicator componentId="combo-bots" />
                      </div>
                    </div>

                    <div className="flex items-center gap-xs">
                      <TabsList className="w-auto!" fullWidth={false}>
                        <TabsTrigger value="bots">Bots</TabsTrigger>
                        <TabsTrigger value="deals">Deals</TabsTrigger>
                      </TabsList>
                      {readOnly ? (
                        <span title="Creating bots is not available in demo mode">
                          <MotionButton variant="default" disabled={true}>
                            <Plus className="w-4 h-4" />
                            New
                          </MotionButton>
                        </span>
                      ) : (
                        <MotionButton
                          variant="default"
                          onClick={() => navigate('/combo/new')}
                        >
                          <Plus className="w-4 h-4" />
                          New
                        </MotionButton>
                      )}
                    </div>
                  </div>

                  {/* Small screens: full-width stats row */}
                  <div className="w-full sm:hidden mt-2">
                    <BotListStatsBoxes
                      stats={botListStats}
                      privacyMode={privacyMode}
                      isLoading={botsLoading || statsLoading}
                      className="w-full"
                    />
                  </div>

                  {/* Large screens: title, stats and button on a single row */}
                  <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center w-full">
                    <div className="flex items-center gap-sm">
                      <div className="flex items-center gap-xs">
                        <h2 className="font-semibold text-xl">
                          Active Combo Bots
                        </h2>
                        <StaleIndicator componentId="combo-bots" />
                      </div>
                    </div>

                    <div className="min-w-0 flex justify-end px-md">
                      <BotListStatsBoxes
                        stats={botListStats}
                        privacyMode={privacyMode}
                        isLoading={botsLoading || statsLoading}
                      />
                    </div>

                    <div className="flex items-center gap-xs justify-end">
                      <TabsList className="w-auto!" fullWidth={false}>
                        <TabsTrigger value="bots">Bots</TabsTrigger>
                        <TabsTrigger value="deals">Deals</TabsTrigger>
                      </TabsList>
                      {readOnly ? (
                        <span title="Creating bots is not available in demo mode">
                          <MotionButton variant="default" disabled={true}>
                            <Plus className="w-4 h-4" />
                            New
                          </MotionButton>
                        </span>
                      ) : (
                        <MotionButton
                          variant="default"
                          onClick={() => navigate('/combo/new')}
                        >
                          <Plus className="w-4 h-4" />
                          New
                        </MotionButton>
                      )}
                    </div>
                  </div>
                </motion.div>

                <TabsContent
                  value="bots"
                  className="flex-1 min-h-[400px] overflow-hidden mt-0"
                >
                  <motion.div
                    className="flex-1 min-h-[400px] overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.6 }}
                  >
                    <DataTable
                      tableId="combo-bots"
                      columns={columns}
                      data={orderedFilteredData}
                      enableGlobalFilter={true}
                      enableColumnFilters={true}
                      enableSorting={true}
                      enableColumnVisibility={true}
                      defaultColumnVisibility={{
                        netPnl: false,
                        netPnlPercentage: false,
                        botId: false,
                      }}
                      enableGrouping={true}
                      enableCardView={true}
                      defaultView="cards"
                      defaultPinnedColumns={{ left: [], right: ['actions'] }}
                      showPagination={true}
                      cardComponent={BotCardWrapper}
                      cardViewBreakpoints={CARD_VIEW_COLUMNS}
                      cardViewGap={16}
                      emptyContent={
                        <EmptyState
                          size="page"
                          icon={<Boxes className="w-6 h-6" />}
                          title={
                            showArchived
                              ? 'No archived combo bots'
                              : 'No combo bots yet'
                          }
                          description={
                            showArchived
                              ? 'Bots you archive move here. Un-archive one to bring it back to your active list.'
                              : 'Combo bots blend DCA and grid strategies under one configuration. Set one up to start trading multiple pairs at once.'
                          }
                          action={
                            showArchived
                              ? {
                                  label: 'Back to active bots',
                                  onClick: () =>
                                    setShowArchived((prev) => !prev),
                                }
                              : readOnly
                                ? undefined
                                : {
                                    label: 'Create combo bot',
                                    onClick: () => navigate('/combo/new'),
                                    icon: <Plus className="w-5 h-5" />,
                                  }
                          }
                          secondaryAction={
                            showArchived
                              ? undefined
                              : {
                                  label: 'View archived bots',
                                  onClick: () =>
                                    setShowArchived((prev) => !prev),
                                }
                          }
                        />
                      }
                      className="h-full min-h-[400px]"
                      enableQuickFilterBar={true}
                      quickFilterBarStorageKey="combo-bots-filters"
                      onRowClick={(bot) => handleSelectBot(bot.id)}
                      getRowIsSelected={(bot) => selectedBot === bot.id}
                      getRowId={(bot) => bot.id}
                      bulkActions={
                        readOnly
                          ? undefined
                          : [
                              {
                                id: 'start',
                                label: 'Start',
                                icon: Play,
                                onAction: (bots) => {
                                  handleOpenBulkStatusChange(bots, 'start');
                                },
                                shouldShow: (
                                  bots: ReturnType<
                                    typeof transformDcaBotToBot
                                  >[]
                                ) => filterStartableBots(bots).length > 0,
                              },
                              {
                                id: 'stop',
                                label: 'Stop',
                                icon: Square,
                                onAction: (bots) => {
                                  handleOpenBulkStatusChange(bots, 'stop');
                                },
                                shouldShow: (
                                  bots: ReturnType<
                                    typeof transformDcaBotToBot
                                  >[]
                                ) => filterStoppableBots(bots).length > 0,
                              },
                              {
                                id: 'restart',
                                label: 'Restart',
                                icon: RefreshCw,
                                onAction: (bots) => {
                                  handleBulkRestart(bots);
                                },
                                shouldShow: (
                                  bots: ReturnType<
                                    typeof transformDcaBotToBot
                                  >[]
                                ) => filterRestartableBots(bots).length > 0,
                              },
                              {
                                id: 'edit',
                                label: 'Edit',
                                icon: Edit,
                                onAction: () => {
                                  toast.info('Bulk edit coming soon');
                                },
                              },
                              {
                                id: 'delete',
                                label: 'Delete',
                                icon: Trash2,
                                onAction: (bots) => {
                                  handleOpenBulkDelete(bots);
                                },
                                shouldShow: (
                                  bots: ReturnType<
                                    typeof transformDcaBotToBot
                                  >[]
                                ) => areAllBotsDeletable(bots),
                              },
                              {
                                id: 'archive',
                                label: showArchived ? 'Unarchive' : 'Archive',
                                icon: Archive,
                                onAction: (bots) => {
                                  bots.forEach((b) =>
                                    archiveMutation.mutate({
                                      id: b.id,
                                      archive: !showArchived,
                                      type: BotTypesEnum.combo,
                                    })
                                  );
                                },
                              },
                            ]
                      }
                      customToolbarActions={
                        <Button
                          variant={showArchived ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setShowArchived((prev) => !prev)}
                          className="h-9 gap-2 px-3"
                          title={
                            showArchived
                              ? 'Show Active Bots'
                              : 'Show Archived Bots'
                          }
                        >
                          <Archive className="h-4 w-4" />
                          <span>Archived</span>
                        </Button>
                      }
                      customToolbarActionsCompact={
                        <Button
                          variant={showArchived ? 'default' : 'ghost'}
                          size="icon"
                          onClick={() => setShowArchived((prev) => !prev)}
                          className="h-9 w-9"
                          title={
                            showArchived
                              ? 'Show Active Bots'
                              : 'Show Archived Bots'
                          }
                          aria-label={
                            showArchived
                              ? 'Show active bots'
                              : 'Show archived bots'
                          }
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      }
                      // New button moved to widget header
                    />


                    {/* Bulk delete modal */}
                    <DeleteConfirmationModal
                      open={bulkDeleteOpen}
                      onOpenChange={setBulkDeleteOpen}
                      onConfirm={handleConfirmBulkDelete}
                      title={`Delete ${bulkDeleteTargets.length} bot${bulkDeleteTargets.length === 1 ? '' : 's'}`}
                      description={`Are you sure you want to delete ${bulkDeleteTargets.length} selected bot${bulkDeleteTargets.length === 1 ? '' : 's'}? This action cannot be undone.`}
                      itemName={`${bulkDeleteTargets.length} bots`}
                      itemType="bot"
                      additionalInfo={{
                        activeDeals: bulkDeleteTargets.reduce(
                          (
                            sum: number,
                            b: ReturnType<typeof transformDcaBotToBot>
                          ) => sum + ((b as DCABot)?.dealsInBot.active || 0),
                          0
                        ),
                        totalValue: bulkDeleteTargets.reduce(
                          (
                            sum: number,
                            b: ReturnType<typeof transformDcaBotToBot>
                          ) => sum + (b?.value || 0),
                          0
                        ),
                        currency:
                          getOriginalComboBot(bulkDeleteTargets[0]?.id ?? '')
                            ?.symbol?.[0]?.value?.quoteAsset || 'USD',
                        lastActivity: 'Multiple',
                      }}
                      isLoading={bulkDeleteLoading}
                    />

                    {/* Bulk status change modal */}
                    <BotStatusConfirmationModal
                      open={bulkStatusOpen}
                      onOpenChange={setBulkStatusOpen}
                      onConfirm={handleConfirmBulkStatusChange}
                      botName={`${bulkStatusTargets.length} bot${bulkStatusTargets.length === 1 ? '' : 's'}`}
                      currentStatus={
                        bulkStatusAction === 'start' ? 'closed' : 'open'
                      }
                      targetStatus={
                        bulkStatusAction === 'start' ? 'open' : 'closed'
                      }
                      hasActiveDeals={bulkHasActiveDeals}
                      isLoading={bulkStatusLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  value="deals"
                  className="flex-1 min-h-[400px] overflow-hidden mt-0"
                >
                  <OpenOrdersWidget
                    widgetId="combo-bot-deals"
                    data={{ trades: comboDealsAsOpenTrades }}
                    enableStatusToggle={true}
                    onStatusFilterChange={setDealsStatus}
                    privacyMode={privacyMode}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </Widget>
        </motion.div>
        {/* Bot Details Drawer - OPTIMIZED: Single shared drawer instead of one per bot */}
        {selectedBot &&
          (() => {
            const selectedBotData = drawerBot.bot;
            if (!selectedBotData) return null;

            const sharedOwnerId =
              (drawerBot.rawBot as { userId?: string } | null)?.userId;
            const viewOnly =
              !!shareId ||
              (!!currentUser && !!sharedOwnerId && sharedOwnerId !== currentUser.id);

            return (
              <BotDetailsDrawer
                type={BotTypesEnum.combo}
                bot={selectedBotData}
                open={true}
                onClose={() => handleSelectBot(null)}
                viewOnly={viewOnly}
                ownerUserId={sharedOwnerId}
              >
                <div />
              </BotDetailsDrawer>
            );
          })()}
      </WidgetContainer>
    </MainLayout>
  );
};

export default ComboBots;
