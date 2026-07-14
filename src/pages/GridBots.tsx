import { isReadOnly } from '@/lib/demoMode';
import { isReady as isAnalyticsReady } from '@/lib/analytics';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import {
  BotTypesEnum,
  CloseGRIDTypeEnum,
  PositionSide,
  type Bot,
  type BotStatus,
  type ExchangeInUser,
} from '@/types';
import { isFuturesExchange } from '@/utils/exchangeUtils';
import {
  areAllBotsDeletable,
  filterDeletableBots,
  filterRestartableBots,
  filterStartableBots,
  filterStoppableBots,
  getActionPastTense,
  getTargetStatus,
  isBotActive,
  isBotDeletable,
} from '@/utils/botStatusUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import {
  Archive,
  Edit,
  ExternalLink,
  Filter,
  Grid3x3,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
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
import { useNavigate, useParams } from 'react-router-dom';
/* import { toDrawerBot } from '../adapters/bots/drawer'; */
import {
  BotActionsMenuItems,
  type BotStatusType,
  type BotTypeId,
} from '../components/bots/BotActionsMenuItems';
import { BotCard } from '../components/bots/BotCard';
import { Skeleton } from '@/components/ui/skeleton';
import { BotDetailsDrawer } from '../components/bots/BotDetailsDrawer';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '../components/modals';
import { Badge } from '../components/ui/badge';
import BotsSkeleton from '../components/ui/BotsPageSkeleton';
import { Button } from '../components/ui/button';
import {
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
} from '../components/ui/chip';
import { DataTable } from '../components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

import { MotionButton } from '../components/ui/MotionWrapper';
import BotListStatsBoxes from '../components/ui/BotListStatsBoxes';
import Widget from '../components/ui/widget';
import CoinPair from '../components/widgets/shared/CoinPair';
import StaleIndicator from '../components/widgets/shared/StaleIndicator';
import { CARD_VIEW_COLUMNS } from '../config/responsive';
import { useBotModeGuard } from '../hooks/bots/base/useBotModeGuard';
import {
  useBotArchive,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from '../hooks/useBotMutations';
import { useCacheKey } from '../hooks/useCacheKey';
import { useCacheStatus } from '../hooks/useCacheStatus';
import { useGridBots, useGridBotStats } from '../hooks/useGridBots';
import { logger } from '../lib/loggerInstance';
import { toast } from '../lib/toast';
import { useGridBotStore } from '../stores/botWidgetsStoreFactory';
import { useUIStore } from '../stores/uiStore';
/* import type { BotStatus } from '../types'; */
/* import type { DrawerBot } from '../types/bots/drawer'; */
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import { transformGridBotToBot, type GridBot } from '../types/gridBot';
import { useShareContext } from '../hooks/useShareContext';
import { useSharedBot } from '../hooks/useSharedBot';
import { useAuthStore } from '../stores/authStore';

const GRID_BOT_TYPE_ID = 'grid';

// Bot table actions component for mobile accessibility
interface BotTableActionsProps {
  bot: ReturnType<typeof transformGridBotToBot>;
  originalBotData: GridBot | undefined;
}

const BotTableActions: React.FC<BotTableActionsProps> = ({
  bot,
  originalBotData,
}) => {
  const navigate = useNavigate();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    type: 'clone' | 'delete';
    newItemId?: string;
  } | null>(null);

  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.grid);
  const deleteMutation = useBotDelete();
  const archiveMutation = useBotArchive();
  const restartMutation = useBotRestart();

  const handleEdit = () => {
    navigate(`/bot/edit/${bot.id}`);
  };

  const handleClone = () => {
    navigate(`/grid/new?load=${bot.id}`);
  };

  const handleStatusToggle = () => {
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = (
    closeType?: string,
    cancelPartiallyFilled?: boolean
  ) => {
    const isActive = isBotActive(bot.status);
    const newStatus = getTargetStatus(bot.status);

    statusToggleMutation.mutate(
      {
        id: bot.id,
        status: newStatus,
        closeGridType: closeType as CloseGRIDTypeEnum | undefined,
        cancelPartiallyFilled,
      },
      {
        onSuccess: () => {
          setStatusModalOpen(false);
          toast.success(`Bot ${getActionPastTense(bot.status)} successfully`);
        },
        onError: (error) => {
          console.error('Failed to change bot status:', error);
          toast.error(`Failed to ${isActive ? 'stop' : 'start'} bot`);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!isBotDeletable(bot.status)) {
      toast.info(
        'Only closed or archived bots can be deleted. Stop the bot first.'
      );
      return;
    }
    setDeleteModalOpen(true);
  };

  const handleRestart = () => {
    restartMutation.mutate(
      {
        id: bot.id,
        type: BotTypesEnum.grid,
      },
      {
        onSuccess: () => {
          toast.success('Bot restarted successfully');
        },
        onError: () => {
          toast.error('Failed to restart bot');
        },
      }
    );
  };

  const handleConfirmDelete = async () => {
    if (!isBotDeletable(bot.status)) {
      toast.info(
        'Only closed or archived bots can be deleted. Stop the bot first.'
      );
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: bot.id, type: BotTypesEnum.grid });
      setSuccessData({ type: 'delete' });
      setSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  };

  const handleArchive = () => {
    const isArchived = bot.status.toLowerCase() === 'archived';
    archiveMutation.mutate({
      id: bot.id,
      archive: !isArchived,
      type: BotTypesEnum.grid,
    });
  };

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
          className="w-56 z-50"
          bot={{
            id: bot.id,
            name: bot.name,
            type: bot.type as BotTypeId,
            status: bot.status as BotStatusType,
            coldArchived: bot.coldArchived,
          }}
          pending={{
            statusToggle: statusToggleMutation.isPending,
            restart: restartMutation.isPending,
            clone: false,
            delete: deleteMutation.isPending,
            archive: archiveMutation.isPending,
          }}
          onToggleStatus={() => handleStatusToggle()}
          onRestart={() => handleRestart()}
          onEdit={() => handleEdit()}
          onClone={() => handleClone()}
          onViewClosedTrades={() => navigate(`/trades?botId=${bot.id}`)}
          onShareConfig={async () => {
            try {
              const source =
                originalBotData ?? (bot as unknown as Record<string, unknown>);
              await navigator.clipboard.writeText(
                JSON.stringify(source, null, 2)
              );
              toast.success('Configuration copied to clipboard');
            } catch (err) {
              console.error('Failed to copy configuration:', err);
              toast.error('Failed to copy configuration');
            }
          }}
          onCopyToLive={() => {
            toast.info('Copy to live not yet implemented for grid bots');
          }}
          onDelete={() => handleDelete()}
          onArchive={() => handleArchive()}
        />
      </DropdownMenu>

      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Bot"
        description="Are you sure you want to delete this bot? This action cannot be undone."
        itemType="bot"
        itemName={bot.name}
        requireConfirmation={false}
      />

      <BotStatusConfirmationModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        onConfirm={handleConfirmStatusChange}
        botName={bot.name}
        currentStatus={bot.status}
        targetStatus={getTargetStatus(bot.status)}
        hasActiveDeals={
          (originalBotData?.levels?.active?.buy || 0) +
            (originalBotData?.levels?.active?.sell || 0) >
          0
        }
        botType={BotTypesEnum.grid}
        gridFutures={isFuturesExchange(bot.exchange)}
        gridHasOpenPosition={(originalBotData?.position?.price ?? 0) !== 0}
        gridIsShort={originalBotData?.position?.side === PositionSide.SHORT}
        isLoading={statusToggleMutation.isPending}
      />

      <SuccessFeedbackModal
        open={successModalOpen}
        onOpenChange={(open) => {
          setSuccessModalOpen(open);
          if (!open) {
            setSuccessData(null);
          }
        }}
        type={successData?.type || 'clone'}
        itemName={bot.name}
        itemType="bot"
        newItemId={successData?.newItemId}
        details={
          successData?.type === 'clone'
            ? {
                originalName: bot.name,
                newName: `${bot.name} (Clone)`,
              }
            : undefined
        }
      />
    </>
  );
};

type ProfitabilityFilter = 'all' | 'profitable' | 'losing';
type GridActiveFilters = {
  status: string[];
  exchange: string[];
  profitability: ProfitabilityFilter;
};

const GridBots: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const selectedBot = params.id ?? null;
  const privacyMode = useUIStore((state) => state.privacyMode);

  // When opening a specific bot via /grid/view/:id, keep the bot's real
  // paper/live mode authoritative over the global toggle so a refresh doesn't
  // flip the drawer to the wrong mode (and the bot vanishes). Thread 4872.
  useBotModeGuard(selectedBot ?? undefined, BotTypesEnum.grid, {
    enabled: !!selectedBot,
  });

  // Check if in demo mode (read-only)
  const readOnly = isReadOnly();

  // Bot status toggle mutation for bulk actions
  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.grid);
  const restartMutation = useBotRestart();

  const [showFilters, setShowFilters] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<'table' | 'cards'>(
    'cards'
  );
  const [showArchived, setShowArchived] = useState(false);
  const [activeFilters] = useState<GridActiveFilters>({
    status: [],
    exchange: [],
    profitability: 'all',
  });
  const navigate = useNavigate();

  // Manage widget layout
  const { initializeDefaultWidgets } = useGridBotStore();

  useEffect(() => {
    initializeDefaultWidgets({ botTypeId: GRID_BOT_TYPE_ID, mode: 'create' });
  }, [initializeDefaultWidgets]);

  // Get real Grid bot data with filtering options
  // Only get active grid bots (not closed/error)
  /* const filterOptions = {
    status: ['open', 'range', 'monitoring'] as BotStatus[],
  }; */
  const options: { status: BotStatus[] } = useMemo(
    () => ({
      status: showArchived ? ['archive'] : [],
    }),
    [showArchived]
  );
  const {
    bots: gridBots,
    isLoading: botsLoading,
    isError: botsError,
  } = useGridBots(options);

  // Share-link path: see TradingBots.tsx
  const currentUser = useAuthStore((s) => s.user);
  const { shareId } = useShareContext();
  const sharedBotResult = useSharedBot({
    botId: selectedBot ?? '',
    type: BotTypesEnum.grid,
    shareId,
  });

  // By-id drawer fallback: an archived (cold-stored) bot is filtered out of the
  // default list, so opening it would otherwise fail to resolve and the drawer
  // would render nothing. When a selected bot isn't in the loaded list, fetch it
  // by id via the shared hook (authenticated, no shareId) so it stays viewable.
  const selectedInList = useMemo(
    () => !!selectedBot && gridBots.some((b) => b._id === selectedBot),
    [selectedBot, gridBots]
  );
  const needBotFallback =
    !shareId && !!selectedBot && !botsLoading && !selectedInList;
  const fallbackBotResult = useSharedBot({
    botId: selectedBot ?? '',
    type: BotTypesEnum.grid,
    shareId: null,
    enabled: needBotFallback,
  });

  const deleteMutation = useBotDelete();
  const archiveMutation = useBotArchive();

  // Bulk delete modal state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<
    ReturnType<typeof transformGridBotToBot>[]
  >([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Bulk status change modal state
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusTargets, setBulkStatusTargets] = useState<
    ReturnType<typeof transformGridBotToBot>[]
  >([]);
  const [bulkStatusAction, setBulkStatusAction] = useState<'start' | 'stop'>(
    'start'
  );
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false);

  const handleOpenBulkDelete = (
    bots: ReturnType<typeof transformGridBotToBot>[]
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
        await deleteMutation.mutateAsync({ id: b.id, type: BotTypesEnum.grid });
      }
      toast.success(`Deleted ${bulkDeleteTargets.length} bot(s)`);
    } catch (error) {
      console.error('Failed to delete selected grid bots:', error);
      toast.error('Failed to delete selected bot(s)');
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteOpen(false);
      setBulkDeleteTargets([]);
    }
  };

  // Open bulk status change modal
  const handleOpenBulkStatusChange = (
    bots: ReturnType<typeof transformGridBotToBot>[],
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
    bots: ReturnType<typeof transformGridBotToBot>[]
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
          type: BotTypesEnum.grid,
        });
      }
      toast.success(`Restarted ${restartableBots.length} bot(s)`);
    } catch {
      toast.error('Failed to restart selected bots');
    }
  };

  // Confirm bulk status change
  const handleConfirmBulkStatusChange = async (
    closeType?: string,
    cancelPartiallyFilled?: boolean
  ) => {
    setBulkStatusLoading(true);
    try {
      const newStatus = bulkStatusAction === 'start' ? 'open' : 'closed';
      const isStop = bulkStatusAction === 'stop';
      for (const b of bulkStatusTargets) {
        await statusToggleMutation.mutateAsync({
          id: b.id,
          status: newStatus,
          closeGridType: isStop
            ? (closeType as CloseGRIDTypeEnum | undefined)
            : undefined,
          cancelPartiallyFilled: isStop ? cancelPartiallyFilled : undefined,
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

  const { botListStats, isLoading: statsLoading } =
    useGridBotStats(/* filterOptions */);

  const [currentPrices, setCurrentPrices] = useState(() => getLocalPrices());
  const { data: exchangesData } = useExchangesFromContext();
  const [userExchanges, setUserExchanges] = useState<ExchangeInUser[]>([]);
  const memoizedUserExchanges = useMemo(() => userExchanges, [userExchanges]);

  useEffect(() => {
    if (exchangesData?.data) {
      const exchanges = exchangesData.data.exchanges || [];
      setUserExchanges(exchanges);
    }
  }, [exchangesData]);

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

  const [stableDependencies, setStableDependencies] = useState(() => ({
    prices: memoizedPrices,
    exchanges: memoizedUserExchanges,
    lastUpdated: Date.now(),
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if there are actual changes
      if (
        stableDependencies.prices !== memoizedPrices ||
        stableDependencies.exchanges !== memoizedUserExchanges
      ) {
        setStableDependencies({
          prices: memoizedPrices,
          exchanges: memoizedUserExchanges,
          lastUpdated: Date.now(),
        });
      }
    }, 1500); // Increased debounce time to 1.5 seconds for better stability

    return () => clearTimeout(timer);
  }, [
    memoizedPrices,
    memoizedUserExchanges,
    stableDependencies.prices,
    stableDependencies.exchanges,
  ]);
  // Transform Grid bots to the format expected by the UI
  const transformedBots = useMemo(() => {
    if (import.meta.env.DEV) {
      logger.debug('[GridBots] Grid bots received:', {
        count: gridBots.length,
        sample: gridBots.slice(0, 3),
      });
    }

    const transformed = gridBots.map((gridBot: Bot) => {
      try {
        const result = transformGridBotToBot(
          gridBot,
          stableDependencies.prices,
          stableDependencies.exchanges
        );
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          logger.error('[GridBots] Error transforming bot:', {
            botId: gridBot._id,
            error,
          });
        }
        throw error;
      }
    });

    if (import.meta.env.DEV) {
      logger.debug('[GridBots] Final transformed bots:', {
        count: transformed.length,
        bots: transformed,
      });
    }

    return transformed;
  }, [gridBots, stableDependencies.prices, stableDependencies.exchanges]);

  const handleSelectBot = useCallback(
    (botId: string | null) => {
      if (botId) {
        navigate(`/grid/view/${botId}`);
      } else {
        navigate('/grid');
      }
    },
    [navigate]
  );

  // Track pageview when bot is selected and data is available
  // Note: Actual pageview tracking is handled by useBotAnalytics in BotDetailsDrawer
  // This useEffect is kept for potential future analytics needs
  useEffect(() => {
    if (selectedBot && gridBots && isAnalyticsReady()) {
      const botData = gridBots.find((b) => b._id === selectedBot);
      if (botData) {
        // Bot data available - drawer will handle pageview tracking
        logger.debug(`[GridBots] Bot selected: ${selectedBot}`);
      }
    }
  }, [selectedBot, gridBots]);

  // Register cache status and query keys so StaleIndicator can work
  const gridCacheKey = useCacheKey(
    'botList' /* , {
    input: { status: filterOptions.status },
  } */
  );
  useCacheStatus('grid-bots', [gridCacheKey], ['botList']);

  // Transform bot data for the drawer component using the adapter pattern
  // This follows the same pattern as DCA bots in TradingBots.tsx lines 625-634
  /* const transformBotForDrawer = useCallback(
    (item: ReturnType<typeof transformGridBotToBot>): DrawerBot | null => {
      // Find the original Grid bot data to extract detailed settings
      const originalBot = gridBots.find((bot) => bot._id === item.id);
      if (!originalBot) {
        return null;
      }

      // Create a base DrawerBot structure from the transformed item
      // This ensures all required fields are present before passing to adapter
      // Use Partial<DrawerBot> to handle optional fields correctly
      const baseDrawerBot = {
        id: item.id,
        name: item.name,
        type: 'grid' as const,
        exchange: item.exchange,
        exchangeUUID: item.exchangeUUID || '',
        symbol: item.symbol,
        symbols: item.symbols || [item.symbol],
        pair: item.pair || item.symbol,
        coinPair: item.coinPair || item.symbol,
        strategy: item.strategy || 'Grid Trading',
        status: item.status,
        scanner: item.scanner || 'Grid Bot',
        color: item.color || '#10b981',
        profit: item.profit,
        profitUsd: item.profitUsd,
        pnlPercent: item.pnlPercent,
        invested: item.invested,
        investedUsd: item.investedUsd,
        runtime: item.runtime,
        totalProfitUsd: item.profitUsd,
        totalProfitPercent: item.pnlPercent,
        value: item.value || 0, // Explicitly pass through the calculated value
        avgDaily: item.avgDaily || 0, // Pass through calculated avgDaily
        avgDailyPerc: item.avgDailyPerc ?? 0, // Pass through calculated avgDailyPerc
        annualizedReturn: item.annualizedReturn || 0, // Pass through calculated annualizedReturn
        tradingTime: item.runtime,
        created: new Date(originalBot.created).toLocaleDateString(),
        usage: item.usage || 0,
        deals: item.closedTrades || 0,
        currentCost: item.currentCost || item.investedUsd,
        maxCost: item.maxCost || item.investedUsd,
        currentBaseUsage: item.currentBaseUsage,
        maxBaseUsage: item.maxBaseUsage,
        workingTime: item.workingTime, // Pass through calculated workingTime
        workingDays: item.workingDays, // Pass through calculated workingDays
        unrealizedPnl: item.unrealizedPnl,
        unrealizedPnlUsd: item.unrealizedPnlUsd,
        unrealizedPnlPercent: item.unrealizedPnlPercent,
        openTrades: item.openTrades,
        closedTrades: item.closedTrades,
        rawData: item.rawData,
      } as DrawerBot;

      // Use the toDrawerBot adapter to enhance with grid-specific details
      // The adapter will handle extracting grid settings and additional metadata
      return toDrawerBot({
        type: 'grid',
        item: baseDrawerBot,
        original: originalBot,
      });
    },
    [gridBots]
  ); */

  // Create a map of bot IDs to original bot data for actions
  const botDataMap = useMemo(() => {
    const map = new Map();
    gridBots.forEach((bot) => map.set(bot._id, bot));
    return map;
  }, [gridBots]);

  // Check if any bulk targets have pending orders (for showing close options)
  const bulkHasActiveDeals = useMemo(() => {
    return bulkStatusTargets.some((b) => {
      const original = botDataMap.get(b.id) as GridBot | undefined;
      return (
        (original?.levels?.active?.buy || 0) +
          (original?.levels?.active?.sell || 0) >
        0
      );
    });
  }, [bulkStatusTargets, botDataMap]);

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
            window.open(`/grid/view/${id}`, '_blank');
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
  const columns: ColumnDef<ReturnType<typeof transformGridBotToBot>>[] =
    useMemo(
      () => [
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
          id: 'coinPair',
          header: 'COIN PAIR',
          meta: {
            filterType: 'array',
            getFilterValue: (row: unknown) => {
              const bot = row as Record<string, unknown>;
              const symbol = bot['symbol'] as
                | Record<string, unknown>
                | undefined;
              const base = (symbol?.['baseAsset'] as string) || '';
              const quote = (symbol?.['quoteAsset'] as string) || '';
              return [
                `${base}/${quote}`,
                `${base}${quote}`,
                base,
                quote,
              ].filter(Boolean);
            },
          },
          accessorFn: (row) => {
            const base = row.symbol?.baseAsset || '';
            const quote = row.symbol?.quoteAsset || '';
            return `${base}/${quote}`;
          },
          cell: ({ row }) => {
            const bot = row.original;
            const pair = `${bot.symbol?.baseAsset || ''}/${bot.symbol?.quoteAsset || ''}`;
            return (
              <CoinPair
                pair={pair}
                iconSize="sm"
                showText={true}
                layout="horizontal"
              />
            );
          },
        },
        {
          accessorKey: 'budget',
          header: 'BUDGET',
          meta: {
            filterType: 'number',
            enableTotalsRow: true,
            totalsDefaultAggregation: 'sum',
          },
          aggregationFn: 'sum',
          cell: ({ getValue }) => {
            const budget = getValue() as number;
            return privacyMode ? '***' : `$${budget.toFixed(2)}`;
          },
          footerValue: (value: number) => (
            <span className="font-bold">
              {privacyMode ? '***' : `$${value.toFixed(2)}`}
            </span>
          ),
        },
        {
          accessorKey: 'value',
          header: 'VALUE',
          meta: {
            filterType: 'number',
            enableTotalsRow: true,
            totalsDefaultAggregation: 'sum',
          },
          aggregationFn: 'sum',
          cell: ({ row, getValue }) => {
            if (row.original.isActive && row.original.loadedPrices === false) {
              return <Skeleton className="h-4 w-16" />;
            }
            const value = getValue() as number;
            return privacyMode ? '***' : `$${value.toFixed(2)}`;
          },
          footerValue: (value: number) => (
            <span className="font-bold">
              {privacyMode ? '***' : `$${value.toFixed(2)}`}
            </span>
          ),
        },
        {
          id: 'valueChange',
          header: 'VALUE CHANGE',
          accessorFn: (row) => row.valueChangeUsd || 0,
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
            const bot = row.original;
            const valueChangeUsd = +(bot.valueChangeUsd || 0);
            const valueChangePerc = +(bot.valueChange || 0);
            return (
              <ProfitAndPerc
                value={valueChangeUsd}
                percentage={valueChangePerc}
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
          id: 'avgDaily',
          header: 'AVG DAILY',
          accessorFn: (row) => row.avgDaily || 0,
          meta: {
            filterType: 'number',
            enableTotalsRow: true,
            totalsDefaultAggregation: 'average',
          },
          aggregationFn: 'mean',
          cell: ({ row }) => {
            const bot = row.original;
            const avgDaily = bot.avgDaily || 0;
            const avgDailyPerc = bot.avgDailyPerc || 0;
            return (
              <ProfitAndPerc
                value={avgDaily}
                percentage={avgDailyPerc}
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
          id: 'totalProfit',
          header: 'TOTAL PROFIT, $',
          accessorFn: (row) => row.profit.totalUsd || 0,
          meta: {
            filterType: 'number',
            enableTotalsRow: true,
            totalsDefaultAggregation: 'sum',
          },
          aggregationFn: 'sum',
          cell: ({ row }) => {
            const bot = row.original;
            const totalProfit = bot.profit.totalUsd || 0;
            const profitPerc = bot.profitPerc || 0;
            return (
              <ProfitAndPerc
                value={totalProfit}
                percentage={profitPerc}
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
          id: 'transactions',
          header: 'TRANSACTIONS',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const buyCount = bot.transactionsCount?.buy || 0;
            const sellCount = bot.transactionsCount?.sell || 0;
            const total = buyCount + sellCount;
            return `${total}`;
          },
        },
        {
          accessorKey: 'created',
          header: 'CREATED',
          meta: { filterType: 'string' },
          cell: ({ getValue }) => {
            const created = getValue() as string;
            const date = new Date(created);
            return date.toLocaleDateString();
          },
        },
        {
          accessorKey: 'workingTime',
          header: 'TRADING TIME',
          meta: { filterType: 'string' },
        },
        {
          id: 'totalGrids',
          header: 'TOTAL GRIDS',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            return `${bot.levels.all.buy + bot.levels.all.sell}`;
          },
        },
        {
          id: 'gridLevels',
          header: 'GRID LEVELS',
          meta: { filterType: 'string' },
          cell: ({ row }) => {
            const bot = row.original;
            return `${bot.levels.active.buy + bot.levels.active.sell} / ${bot.levels.all.buy + bot.levels.all.sell}`;
          },
        },
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
          accessorKey: 'status',
          header: 'BOT STATUS',
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
          id: 'drawdown',
          header: 'DRAWDOWN',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const drawdownPerc = bot.stats?.drawdownPercent || 0;
            return (
              <ProfitLossPercChip
                value={Math.abs(drawdownPerc) * 100}
                size="sm"
                showSign={false}
              />
            );
          },
        },
        {
          id: 'runUp',
          header: 'RUN UP',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const runUpPerc = bot.stats?.runUpPercent || 0;
            return (
              <ProfitLossPercChip value={runUpPerc * 100} size="sm" showSign />
            );
          },
        },
        {
          id: 'timeInLoss',
          header: 'TIME IN LOSS',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const timeInLoss = bot.stats?.timeInLoss || 0;
            const totalTime = bot.stats?.trackTime || 1;
            const percentage = (timeInLoss / totalTime) * 100;
            return (
              <ProfitLossPercChip
                value={percentage}
                size="sm"
                showSign={false}
              />
            );
          },
        },
        {
          id: 'timeInProfit',
          header: 'TIME IN PROFIT',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const timeInProfit = bot.stats?.timeInProfit || 0;
            const totalTime = bot.stats?.trackTime || 1;
            const percentage = (timeInProfit / totalTime) * 100;
            return (
              <ProfitLossPercChip
                value={percentage}
                size="sm"
                showSign={false}
              />
            );
          },
        },
        {
          id: 'creditsCost',
          header: 'CREDITS COST',
          meta: { filterType: 'number' },
          cell: ({ row }) => {
            const bot = row.original;
            const cost = bot.cost || 0;
            return `${cost.toFixed(2)}`;
          },
        },
        {
          id: 'botId',
          accessorFn: (row) => row.id,
          header: 'BOT ID',
          cell: ({ row }) => {
            const value = row.original.id;
            if (!value)
              return <span className="text-muted-foreground">—</span>;
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

  const activeFiltersCount = useMemo(
    () =>
      activeFilters.status.length +
      activeFilters.exchange.length +
      (activeFilters.profitability !== 'all' ? 1 : 0),
    [activeFilters]
  );

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

    if (activeFilters.profitability === 'profitable') {
      data = data.filter((bot) => (bot.totalProfitUsd ?? 0) > 0);
    } else if (activeFilters.profitability === 'losing') {
      data = data.filter((bot) => (bot.totalProfitUsd ?? 0) < 0);
    }

    return data;
  }, [transformedBots, activeFilters]);

  // Put starred bots first and then sort by creation date (newest first)
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);
  const orderedFilteredData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aStar = starredBotIds.has(a.id) ? 0 : 1;
      const bStar = starredBotIds.has(b.id) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;

      // Try createdAt, fall back to original grid bot created value
      const findOriginalCreated = (id: string) => {
        const original = gridBots.find((g) => g._id === id);
        return original ? new Date(original.created).getTime() : 0;
      };

      const aCreated = a.createdAt ?? findOriginalCreated(a.id) ?? 0;
      const bCreated = b.createdAt ?? findOriginalCreated(b.id) ?? 0;
      return bCreated - aCreated;
    });
  }, [filteredData, starredBotIds, gridBots]);

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
          item: ReturnType<typeof transformGridBotToBot>;
          index: number;
        }) => (
          <BotCard
            type={BotTypesEnum.grid}
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

  // Only show the loading skeleton on first load when there is no cached data
  if ((botsLoading || statsLoading) && gridBots.length === 0) {
    return (
      <MainLayout pageTitle="Grid Bots" activePage="/grid-bots">
        <BotsSkeleton
          title="Loading Grid Bots"
          description="Fetching your grid bot data and performance metrics..."
          statCount={4}
          statColumns={{ xs: 1, sm: 2, md: 2, lg: 4 }}
          statCardPadding="p-md"
          headerPadding="p-lg"
        />
      </MainLayout>
    );
  }

  if (botsError) {
    return (
      <MainLayout pageTitle="Grid Bots" activePage="/grid-bots">
        <WidgetContainer layout="flex" verticalGap>
          <Widget className="p-lg text-card-foreground" noPadding>
            <div className="space-y-xs">
              <h1 className="text-2xl font-bold">Grid Bots</h1>
              <p>Error loading grid bots</p>
            </div>
          </Widget>
        </WidgetContainer>
      </MainLayout>
    );
  }

  // Share-mode: render ONLY the shared grid bot's drawer (no list,
  // no stats, no create button). MainLayout short-circuits to
  // SharedPageLayout when isDemo, so chrome is minimal.
  if (shareId) {
    let sharedBotForDrawer:
      | ReturnType<typeof transformGridBotToBot>
      | undefined;
    if (selectedBot && sharedBotResult.bot) {
      try {
        sharedBotForDrawer = transformGridBotToBot(
          sharedBotResult.bot as unknown as Bot,
          [],
          []
        );
      } catch (e) {
        logger.warn('[GridBots] failed to transform shared bot', { error: e });
      }
    }
    const sharedOwnerId =
      (sharedBotResult.bot as { userId?: string } | null)?.userId;
    return (
      <MainLayout pageTitle="Shared grid bot" activePage="/grid-bots">
        {sharedBotForDrawer ? (
          <BotDetailsDrawer
            type={BotTypesEnum.grid}
            bot={sharedBotForDrawer}
            open
            onClose={() => navigate('/grid')}
            viewOnly
            ownerUserId={sharedOwnerId}
            fullWidth
          >
            <div />
          </BotDetailsDrawer>
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
            {sharedBotResult.isLoading
              ? 'Loading shared bot…'
              : 'Shared bot is not available.'}
          </div>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Grid Bots" activePage="/grid-bots">
      <WidgetContainer
        layout="flex"
        verticalGap
        className="h-full min-h-0 flex-1"
      >
        {/* Stats boxes moved into header */}

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
            className="p-sm md:p-md text-card-foreground flex-1 min-h-[500px]"
            noPadding
            overflow="auto"
          >
            <div className="flex flex-col h-full min-h-[500px]">
              <motion.div
                className="mb-md shrink-0"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
              >
                {/* Small screens: title and New on same row */}
                <div className="flex items-center justify-between w-full sm:hidden">
                  <div className="flex items-center gap-sm">
                    <div className="flex items-center gap-xs">
                      <h2 className="font-semibold text-xl">
                        Active Grid Bots
                      </h2>
                      <StaleIndicator componentId="grid-bots" />
                    </div>
                  </div>

                  <div className="flex items-center gap-xs">
                    {readOnly ? (
                      <span title="Creating bots is not available in demo mode">
                        <MotionButton variant="default" disabled={true}>
                          <Plus className="w-4 h-4 mr-xs" />
                          New
                        </MotionButton>
                      </span>
                    ) : (
                      <MotionButton
                        variant="default"
                        onClick={() => navigate('/grid/new')}
                      >
                        <Plus className="w-4 h-4 mr-xs" />
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
                    activityLabel="bots"
                    className="w-full"
                  />
                </div>

                {/* Large screens: title, stats and button on a single row */}
                <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-xs w-full">
                  <div className="flex items-center gap-sm">
                    <div className="flex items-center gap-xs">
                      <h2 className="font-semibold text-xl">
                        Active Grid Bots
                      </h2>
                      <StaleIndicator componentId="grid-bots" />
                    </div>
                  </div>

                  <div className="min-w-0 flex justify-end px-md">
                    <BotListStatsBoxes
                      stats={botListStats}
                      privacyMode={privacyMode}
                      isLoading={botsLoading || statsLoading}
                      activityLabel="bots"
                    />
                  </div>

                  <div className="flex items-center gap-xs justify-end">
                    {readOnly ? (
                      <span title="Creating bots is not available in demo mode">
                        <MotionButton variant="default" disabled={true}>
                          <Plus className="w-4 h-4 mr-xs" />
                          New
                        </MotionButton>
                      </span>
                    ) : (
                      <MotionButton
                        variant="default"
                        onClick={() => navigate('/grid/new')}
                      >
                        <Plus className="w-4 h-4 mr-xs" />
                        New
                      </MotionButton>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="flex-1 min-h-[400px] overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                {gridBots.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <EmptyState
                      size="page"
                      icon={<Grid3x3 className="w-6 h-6" />}
                      title={
                        showArchived
                          ? 'No archived grid bots'
                          : 'No grid bots yet'
                      }
                      description={
                        showArchived
                          ? 'Bots you archive move here. Un-archive one to bring it back to your active list.'
                          : 'Grid bots place a ladder of buy and sell orders to profit from price oscillations in a range. Set up your first grid to get started.'
                      }
                      action={
                        showArchived
                          ? {
                              label: 'Back to active bots',
                              onClick: () => setShowArchived((prev) => !prev),
                            }
                          : readOnly
                            ? undefined
                            : {
                                label: 'Create grid bot',
                                onClick: () => navigate('/grid/new'),
                                icon: <Plus className="w-5 h-5" />,
                              }
                      }
                      secondaryAction={
                        showArchived
                          ? undefined
                          : {
                              label: 'View archived bots',
                              onClick: () => setShowArchived((prev) => !prev),
                            }
                      }
                    />
                  </div>
                ) : (
                <DataTable
                  tableId="grid-bots"
                  columns={columns}
                  data={orderedFilteredData}
                  enableGlobalFilter={true}
                  enableColumnFilters={true}
                  enableSorting={true}
                  enableColumnVisibility={true}
                  defaultColumnVisibility={{ botId: false }}
                  enableGrouping={true}
                  enableCardView={true}
                  defaultView="cards"
                  defaultPinnedColumns={{ left: [], right: ['actions'] }}
                  showPagination={true}
                  cardComponent={BotCardWrapper}
                  cardViewBreakpoints={CARD_VIEW_COLUMNS}
                  cardViewGap={16}
                  emptyMessage="No grid bots found"
                  className="h-full min-h-[400px]"
                  onViewModeChange={setCurrentViewMode}
                  onColumnFiltersVisibilityChange={setShowFilters}
                  enableQuickFilterBar={true}
                  quickFilterBarStorageKey="grid-bots-filters"
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
                              bots: ReturnType<typeof transformGridBotToBot>[]
                            ) => filterStartableBots(bots).length > 0,
                          },
                          {
                            id: 'stop',
                            label: 'Stop',
                            icon: Pause,
                            onAction: (bots) => {
                              handleOpenBulkStatusChange(bots, 'stop');
                            },
                            shouldShow: (
                              bots: ReturnType<typeof transformGridBotToBot>[]
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
                              bots: ReturnType<typeof transformGridBotToBot>[]
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
                              bots: ReturnType<typeof transformGridBotToBot>[]
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
                                  type: BotTypesEnum.grid,
                                })
                              );
                            },
                          },
                        ]
                  }
                  firstToolbarActions={
                    currentViewMode === 'cards' && (
                      <Button
                        variant={
                          showFilters || activeFiltersCount > 0
                            ? 'default'
                            : 'ghost'
                        }
                        size="sm"
                        onClick={() => setShowFilters((prev) => !prev)}
                        className="h-9 gap-2 px-3 relative"
                        title={showFilters ? 'Hide filters' : 'Show filters'}
                      >
                        <Filter className="h-4 w-4" />
                        <span>Filters</span>
                        {activeFiltersCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs"
                          >
                            {activeFiltersCount}
                          </Badge>
                        )}
                      </Button>
                    )
                  }
                  firstToolbarActionsCompact={
                    currentViewMode === 'cards' && (
                      <Button
                        variant={
                          showFilters || activeFiltersCount > 0
                            ? 'default'
                            : 'ghost'
                        }
                        size="icon"
                        onClick={() => setShowFilters((prev) => !prev)}
                        className="h-9 w-9 relative"
                        title={showFilters ? 'Hide filters' : 'Show filters'}
                        aria-label={
                          showFilters ? 'Hide filters' : 'Show filters'
                        }
                      >
                        <Filter className="h-4 w-4" />
                        {activeFiltersCount > 0 && (
                          <Badge
                            variant="default"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                          >
                            {activeFiltersCount}
                          </Badge>
                        )}
                      </Button>
                    )
                  }
                  customToolbarActions={
                    <Button
                      variant={showArchived ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setShowArchived((prev) => !prev)}
                      className="h-9 gap-2 px-3"
                      title={
                        showArchived ? 'Show Active Bots' : 'Show Archived Bots'
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
                        showArchived ? 'Show Active Bots' : 'Show Archived Bots'
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
                )}

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
                    activeDeals: /*  bulkDeleteTargets.reduce(
                      (
                        sum: number,
                        b: ReturnType<typeof transformGridBotToBot>
                      ) => sum + (b?.openTrades || 0),
                      0
                    ) */ 0,
                    totalValue: bulkDeleteTargets.reduce(
                      (
                        sum: number,
                        b: ReturnType<typeof transformGridBotToBot>
                      ) => sum + (b?.value || 0),
                      0
                    ),
                    currency:
                      bulkDeleteTargets[0]?.pair?.split('/')[1] || 'USD',
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
                  botType={BotTypesEnum.grid}
                  // Bulk targets are heterogeneous — use the generic
                  // "close position" wording and always offer the options.
                  gridFutures
                  gridHasOpenPosition
                  isLoading={bulkStatusLoading}
                />
              </motion.div>
            </div>
          </Widget>
        </motion.div>
        {/* Bot Details Drawer - OPTIMIZED: Single shared drawer instead of one per bot */}
        {selectedBot &&
          (() => {
            let selectedBotData = transformedBots.find(
              (bot) => bot.id === selectedBot
            );
            if (!selectedBotData) {
              const raw = (
                shareId ? sharedBotResult.bot : fallbackBotResult.bot
              ) as unknown as Bot | null;
              if (raw) {
                try {
                  selectedBotData = transformGridBotToBot(raw, [], []);
                } catch (e) {
                  logger.warn('[GridBots] failed to transform shared bot', {
                    error: e,
                  });
                }
              }
            }
            if (!selectedBotData) return null;

            const sharedOwnerId =
              (sharedBotResult.bot as { userId?: string } | null)?.userId;
            const viewOnly =
              !!shareId ||
              (!!currentUser && !!sharedOwnerId && sharedOwnerId !== currentUser.id);

            /* const drawerBot = transformBotForDrawer(selectedBotData);
            if (!drawerBot) return null; */

            return (
              <BotDetailsDrawer
                type={BotTypesEnum.grid}
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

export default GridBots;
