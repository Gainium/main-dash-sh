import { dcaDealToOpenTrade } from '@/lib/utils/dcaDealToOpenTrade';
import { type ColumnDef } from '@tanstack/react-table';
import { motion, type Transition } from 'framer-motion';
import {
  Archive,
  Bot,
  Edit,
  ExternalLink,
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
  useContext,
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
import { Skeleton } from '@/components/ui/skeleton';

import { BotDetailsDrawer } from '../components/bots/BotDetailsDrawer';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import { Slot } from '@/lib/extensions';
import BotsSkeleton from '../components/ui/BotsPageSkeleton';
import { Button } from '../components/ui/button';
import { DataTable } from '../components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { DualArcProgressGauge } from '../components/ui/DualArcProgressGauge';
import { MotionButton } from '../components/ui/MotionWrapper';
import Widget from '../components/ui/widget';
import getLatestPrices, { getLocalPrices } from '../helper/price';
import {
  computeDcaBotStatsSummary,
  emptyDcaBotStatsSummary,
  useDcaBots,
} from '../hooks/useDcaBots';
/* import { useDcaDeals } from '../hooks/useDcaDeals'; */
import { useUserFees } from '../hooks/useUserFeesService';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

import { isReadOnly } from '@/lib/demoMode';
import { isReady as isAnalyticsReady } from '@/lib/analytics';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  StrategyEnum,
  type BotStatus,
  type DCABot,
  /*   type DCADeals, */
  type ExchangeInUser,
} from '@/types';
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
import { buildBotViewRoute } from '@/utils/bots/navigation';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import OpenOrdersWidget from '../components/widgets/shared/OpenOrdersWidget';
import { useDcaDeals } from '../hooks/useDcaDeals';
/* import { toDrawerBot } from '../adapters/bots/drawer'; */
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '../components/modals';
import {
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
  StrategyChip,
} from '../components/ui/chip';
import BotListStatsBoxes from '../components/ui/BotListStatsBoxes';
import CoinPair from '../components/widgets/shared/CoinPair';
import StaleIndicator from '../components/widgets/shared/StaleIndicator';
import {
  useBotArchive,
  useBotClone,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from '../hooks/useBotMutations';
import { useBotModeGuard } from '../hooks/bots/base/useBotModeGuard';
import { useCacheKey } from '../hooks/useCacheKey';
import { useCacheStatus } from '../hooks/useCacheStatus';
import { logger } from '../lib/loggerInstance';
import { toast } from '../lib/toast';
import { useTradingBotStore } from '../stores/botWidgetsStoreFactory';
import { useBotStatsStore } from '../stores/live/botStatsStore';
import { transformDcaBotToBot } from '../types/dcaBot';
import { useShareContext } from '../hooks/useShareContext';
import { useSharedBot } from '../hooks/useSharedBot';

// Bot table actions component for mobile accessibility
interface BotTableActionsProps {
  bot: ReturnType<typeof transformDcaBotToBot>;
  originalBotData: DCABot | undefined;
}

const TRADING_BOTS_DEFAULT_COLUMN_VISIBILITY = {
  profitPerc: false,
  unPnlPerc: false,
  avgDailyPerc: false,
  netPnl: false,
  netPnlPercentage: false,
  botId: false,
};

const TRADING_BOTS_DEFAULT_PINNED_COLUMNS = {
  left: [] as string[],
  right: ['actions'],
};

const TRADING_BOTS_CARD_VIEW_BREAKPOINTS = {
  default: 1,
  480: 1,
  600: 2,
  900: 3,
  1200: 4,
};

const TRADING_BOTS_SKELETON_STAT_COLUMNS = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 5,
};

const TRADING_BOTS_WIDGET_MOTION = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.4,
    delay: 0.3,
    ease: [0.25, 0.1, 0.25, 1],
  } as Transition,
};

const TRADING_BOTS_HEADER_MOTION = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3, delay: 0.5 },
};

const TRADING_BOTS_TABLE_MOTION = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.6 },
};

const BotTableActions: React.FC<BotTableActionsProps> = ({
  bot,
  originalBotData,
}) => {
  const navigate = useNavigate(); // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    type: 'clone' | 'delete';
    newItemId?: string;
  } | null>(null);

  // Bot mutations
  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.dca);
  const restartMutation = useBotRestart();
  const cloneMutation = useBotClone();
  const deleteMutation = useBotDelete();
  const archiveMutation = useBotArchive();

  // Real bot actions
  const handleEdit = useCallback(() => {
    navigate(`/bot/edit/${bot.id}`);
  }, [bot.id, navigate]);

  const handleClone = useCallback(() => {
    navigate(`/bot/new?load=${bot.id}`);
  }, [bot.id, navigate]);

  const handleStatusToggle = useCallback(() => {
    setStatusModalOpen(true);
  }, []);

  const handleConfirmStatusChange = useCallback(
    (closeType?: string) => {
      const isActive = isBotActive(bot.status);
      const newStatus = getTargetStatus(bot.status);

      statusToggleMutation.mutate(
        {
          id: bot.id,
          status: newStatus,
          closeType: closeType as CloseDCATypeEnum | undefined,
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
    },
    [bot.id, bot.status, statusToggleMutation]
  );

  const handleDelete = useCallback(() => {
    if (!isBotDeletable(bot.status)) {
      toast.info(
        'Only closed or archived bots can be deleted. Stop the bot first.'
      );
      return;
    }
    setDeleteModalOpen(true);
  }, [bot.status]);

  const handleRestart = useCallback(() => {
    restartMutation.mutate(
      {
        id: bot.id,
        type: BotTypesEnum.dca,
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
  }, [bot.id, restartMutation]);

  const handleConfirmDelete = useCallback(async () => {
    if (!isBotDeletable(bot.status)) {
      toast.info(
        'Only closed or archived bots can be deleted. Stop the bot first.'
      );
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: bot.id, type: BotTypesEnum.dca });
      setSuccessData({ type: 'delete' });
      setSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  }, [bot.id, bot.status, deleteMutation]);

  const handleArchive = useCallback(() => {
    const isArchived = bot.status.toLowerCase() === 'archived';
    archiveMutation.mutate({
      id: bot.id,
      archive: !isArchived,
      type: BotTypesEnum.dca,
    });
  }, [archiveMutation, bot.id, bot.status]);

  const handleViewClosedTrades = useCallback(() => {
    navigate(`${buildBotViewRoute(BotTypesEnum.dca, bot.id)}?tab=deals&dealTab=closed`);
  }, [bot.id, navigate]);

  const handleShareConfig = useCallback(async () => {
    try {
      const source =
        originalBotData ?? (bot as unknown as Record<string, unknown>);
      await navigator.clipboard.writeText(JSON.stringify(source, null, 2));
      toast.success('Configuration copied to clipboard');
    } catch (err) {
      console.error('Failed to copy configuration:', err);
      toast.error('Failed to copy configuration');
    }
  }, [bot, originalBotData]);

  const handleCopyToLive = useCallback(() => {
    const base = originalBotData
      ? {
          name: `${originalBotData.settings?.name || bot.name} (Live)`,
          type: bot.type,
          exchange: originalBotData.exchange,
          symbol: originalBotData.symbol?.[0]?.value?.symbol ?? bot.symbol,
          settings: originalBotData.settings,
        }
      : {
          name: `${bot.name} (Live)`,
          type: bot.type,
          exchange: bot.exchange,
          symbol: bot.symbol,
          settings: undefined,
        };
    try {
      sessionStorage.setItem('botConfig', JSON.stringify(base));
      navigate('/bot/new');
    } catch (err) {
      console.error('Failed to stage config for live trading:', err);
      toast.error('Failed to stage configuration');
    }
  }, [bot, navigate, originalBotData]);

  const botActionsMenuItems = useMemo(
    () => ({
      id: bot.id,
      name: bot.name,
      type: bot.type as BotTypeId,
      status: bot.status as BotStatusType,
      coldArchived: bot.coldArchived,
    }),
    [bot.id, bot.name, bot.type, bot.status, bot.coldArchived]
  );

  const botActionsPending = useMemo(
    () => ({
      statusToggle: statusToggleMutation.isPending,
      restart: restartMutation.isPending,
      clone: cloneMutation.isPending,
      delete: deleteMutation.isPending,
      archive: archiveMutation.isPending,
    }),
    [
      statusToggleMutation.isPending,
      restartMutation.isPending,
      cloneMutation.isPending,
      deleteMutation.isPending,
      archiveMutation.isPending,
    ]
  );

  const hasActiveDeals = useMemo(
    () => (originalBotData?.dealsInBot?.active || 0) > 0,
    [originalBotData?.dealsInBot?.active]
  );

  const deleteAdditionalInfo = useMemo(
    () => ({
      activeDeals: originalBotData?.dealsInBot?.active || 0,
      totalValue: originalBotData?.usage?.current?.quote || 0,
      currency: originalBotData?.symbol?.[0]?.value?.quoteAsset || 'USD',
      lastActivity: originalBotData?.created || 'Unknown',
    }),
    [
      originalBotData?.dealsInBot?.active,
      originalBotData?.usage,
      originalBotData?.symbol,
      originalBotData?.created,
    ]
  );

  const successDetails = useMemo(
    () =>
      successData?.type === 'clone'
        ? {
            originalName: bot.name,
            newName: `${bot.name} (Clone)`,
          }
        : undefined,
    [bot.name, successData?.type]
  );

  const handleMenuTriggerClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
    },
    []
  );

  const targetStatus = useMemo(() => getTargetStatus(bot.status), [bot.status]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-0"
            onClick={handleMenuTriggerClick}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <BotActionsMenuItems
          align="end"
          className="w-56 z-50"
          bot={botActionsMenuItems}
          pending={botActionsPending}
          onToggleStatus={handleStatusToggle}
          onRestart={handleRestart}
          onEdit={handleEdit}
          onClone={handleClone}
          onViewClosedTrades={handleViewClosedTrades}
          onShareConfig={handleShareConfig}
          onCopyToLive={handleCopyToLive}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </DropdownMenu>

      {/* Modals */}
      <BotStatusConfirmationModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        onConfirm={handleConfirmStatusChange}
        botName={bot.name}
        currentStatus={bot.status}
        targetStatus={targetStatus}
        hasActiveDeals={hasActiveDeals}
        isLoading={statusToggleMutation.isPending}
      />

      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Bot"
        description="Are you sure you want to delete this bot? This action cannot be undone."
        itemName={bot.name}
        itemType="bot"
        additionalInfo={deleteAdditionalInfo}
        isLoading={deleteMutation.isPending}
        requireConfirmation={false}
      />

      <SuccessFeedbackModal
        open={successModalOpen}
        onOpenChange={setSuccessModalOpen}
        type={successData?.type || 'clone'}
        itemName={bot.name}
        itemType="bot"
        newItemId={successData?.newItemId || undefined}
        details={successDetails}
      />
    </>
  );
};

const useRenderTelemetry = (
  componentName: string,
  getMetadata?: () => Record<string, unknown>
) => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const metadata = getMetadata ? getMetadata() : undefined;

    logger.debug(`[RenderTelemetry] ${componentName}`, {
      renderCount: renderCountRef.current,
      ...(metadata || {}),
    });
  });
};

interface TradingBotsCardContextValue {
  onSelect: (botId: string) => void;
  selectedBotId: string | null;
  getOriginalBot: (botId: string) => DCABot | undefined;
  /* getBotDeals: (botId: string) => DCADeals[]; */
  privacyMode: boolean;
}

const TradingBotsCardContext = React.createContext<
  TradingBotsCardContextValue | undefined
>(undefined);

const useTradingBotsCardContext = (): TradingBotsCardContextValue => {
  const context = useContext(TradingBotsCardContext);
  if (!context) {
    throw new Error(
      'BotCardWrapper must be used within a TradingBotsCardContext provider'
    );
  }
  return context;
};

interface BotCardWrapperProps {
  item: ReturnType<typeof transformDcaBotToBot>;
  index: number;
}

const BotCardWrapper: React.FC<BotCardWrapperProps> = React.memo(
  ({ item, index }) => {
    const { onSelect, selectedBotId, getOriginalBot, privacyMode } =
      useTradingBotsCardContext();

    useRenderTelemetry('BotCardWrapper', () => ({ botId: item.id }));

    const originalBot = useMemo(
      () => getOriginalBot(item.id),
      [getOriginalBot, item.id]
    );

    const handleClick = useCallback(() => {
      onSelect(item.id);
    }, [item.id, onSelect]);

    const originalBotProps = useMemo(
      () => (originalBot ? { originalBotData: originalBot } : undefined),
      [originalBot]
    );

    const isSelected = useMemo(
      () => selectedBotId === item.id,
      [selectedBotId, item.id]
    );

    return (
      <BotCard
        item={item}
        index={index}
        onClick={handleClick}
        isSelected={isSelected}
        {...(originalBotProps ?? {})}
        privacyMode={privacyMode}
        type={BotTypesEnum.dca}
      />
    );
  }
);

BotCardWrapper.displayName = 'BotCardWrapper';

const NameCell: React.FC<{ value: string; id: string }> = ({ value, id }) => {
  const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);
  const starred = starredBotIds.has(id);
  const handleOpenInNewTab = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      window.open(`/bot/view/${id}`, '_blank');
    },
    [id]
  );
  const handleToggleStarred = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      toggleStarred(id);
    },
    [id, toggleStarred]
  );
  return (
    <div className="flex items-center gap-xs">
      <div className="truncate">{value}</div>
      <button
        onClick={handleOpenInNewTab}
        className="p-1 rounded hover:bg-muted/30"
        title="Open in new tab"
      >
        <ExternalLink className="w-4 h-4 text-muted-foreground" />
      </button>
      <button
        onClick={handleToggleStarred}
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

const PRICE_UPDATE_THROTTLE_MS = 10000; // Increased to 10 seconds for better stability

const TradingBots: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Check if in demo mode (read-only)
  const readOnly = isReadOnly();

  // Selected bot comes from route param now
  const selectedBot = useMemo(() => params.id ?? null, [params.id]);

  // When opening a specific bot via /bot/view/:id, keep the bot's real
  // paper/live mode authoritative over the global toggle so a refresh doesn't
  // flip the drawer to the wrong mode (and the bot vanishes). Thread 4872.
  useBotModeGuard(selectedBot ?? undefined, BotTypesEnum.dca, {
    enabled: !!selectedBot,
  });

  // One-time migration: if legacy ?view=<botId> is present on /bot, redirect
  // to /bot/view/:id. Only ObjectId-shaped values are legacy bot links —
  // `?view=deals` / `?view=bots` now belong to the page-level tabs below.
  useEffect(() => {
    const legacyView = searchParams.get('view');
    if (legacyView && /^[0-9a-f]{24}$/i.test(legacyView) && !params.id) {
      navigate(`/bot/view/${legacyView}`, { replace: true });
    }
  }, [navigate, params.id, searchParams]);

  // Function to update selected bot by navigating
  const updateSelectedBot = useCallback(
    (botId: string | null) => {
      // Carry the page-level Bots/Deals view across drawer open/close —
      // these navigations replace the whole query string otherwise.
      const suffix = searchParams.get('view') === 'deals' ? '?view=deals' : '';
      if (botId) {
        navigate(`/bot/view/${botId}${suffix}`);
      } else {
        navigate(`/bot${suffix}`);
      }
    },
    [navigate, searchParams]
  );

  // Advanced filtering state
  const [activeFilters] = useState<{
    status: string[];
    exchange: string[];
    strategy: string[];
    profitability: 'all' | 'profitable' | 'losing';
  }>({
    status: [],
    exchange: [],
    strategy: [],
    profitability: 'all',
  });

  const [showArchived, setShowArchived] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<'table' | 'cards'>(
    'cards'
  );

  // Exchange data for bot value calculations
  const [userExchanges, setUserExchanges] = useState<ExchangeInUser[]>([]);

  // User fees service with caching
  const { fetchMultipleFees } = useUserFees();
  const [allFees, setAllFees] = useState<
    Array<{ exchange: string; symbol: string; fee: number }>
  >([]);

  // Auth and UI stores
  const tokens = useAuthStore((state) => state.tokens);
  const currentUser = useAuthStore((state) => state.user);
  const privacyMode = useUIStore((state) => state.privacyMode);
  const { data: exchangesData } = useExchangesFromContext();

  // Share-link viewers land here without auth — fetch the bot directly
  // via its share id. When `shareId` is set, the list query is bypassed
  // and the drawer is hydrated from the single shared bot record.
  const { shareId } = useShareContext();
  const sharedBotResult = useSharedBot({
    botId: selectedBot ?? '',
    type: BotTypesEnum.dca,
    shareId,
  });

  // Bot mutations
  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.dca);
  const restartMutation = useBotRestart();
  const cloneMutation = useBotClone();
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

  // Manage widget layout
  const { initializeDefaultWidgets } = useTradingBotStore();

  useEffect(() => {
    initializeDefaultWidgets();
  }, [initializeDefaultWidgets]);

  // State to track if price service is ready (only set once)
  const [priceServiceReady, setPriceServiceReady] = useState(false);

  // Initialize price service for VALUE calculations
  useEffect(() => {
    const unsubscribePrices = getLatestPrices(
      (result) => {
        if (result.status === 'OK' && !priceServiceReady) {
          // Only set once to avoid continuous re-renders
          setPriceServiceReady(true);
        } else if (result.status !== 'OK') {
          console.error(
            '❌ [TradingBots] Price service initialization failed:',
            result.reason
          );
        }
      },
      false // don't load US exchanges
    );

    return () => {
      unsubscribePrices();
    };
  }, [priceServiceReady]); // Add priceServiceReady to dependencies

  const useDcaBotsOptions: { status: BotStatus[] } = useMemo(
    () => ({
      status: showArchived ? ['archive'] : [],
    }),
    [showArchived]
  );

  const {
    bots: dcaBots,
    isLoading: botsLoading,
    isError: botsError,
    data: _rawBotData,
  } = useDcaBots(useDcaBotsOptions);

  // By-id drawer fallback: an archived (cold-stored) bot is filtered out of the
  // default list (`status: []`), so opening it would otherwise fail to resolve
  // and redirect to /bot. When a selected bot isn't in the loaded list, fetch it
  // by id via the shared hook so it stays viewable; its deals load from cold
  // storage through the normal backend routing (same drawer surface, no nav).
  const selectedInList = useMemo(
    () => !!selectedBot && dcaBots.some((b) => b._id === selectedBot),
    [selectedBot, dcaBots]
  );
  const needBotFallback =
    !shareId && !!selectedBot && !botsLoading && !selectedInList;
  const fallbackBotResult = useSharedBot({
    botId: selectedBot ?? '',
    type: BotTypesEnum.dca,
    shareId: null,
    enabled: needBotFallback,
  });

  /* const { deals: allDeals } = useDcaDeals({});

  const dealsByBotId = useMemo(() => {
    const map = new Map<string, DCADeals[]>();
    for (const deal of allDeals || []) {
      if (!deal.botId) continue;
      if (!map.has(deal.botId)) {
        map.set(deal.botId, []);
      }
      map.get(deal.botId)?.push(deal);
    }
    return map;
  }, [allDeals]); */

  const originalBotMap = useMemo(() => {
    const map = new Map<string, DCABot>();
    for (const bot of dcaBots || []) {
      map.set(bot._id, bot);
    }
    return map;
  }, [dcaBots]);

  const getOriginalBot = useCallback(
    (botId: string) => originalBotMap.get(botId),
    [originalBotMap]
  );

  /* const getBotDeals = useCallback(
    (botId: string) => dealsByBotId.get(botId) ?? [],
    [dealsByBotId]
  ); */

  const handleSelectBot = useCallback(
    (botId: string) => {
      logger.info('[TradingBots] Bot selected:', {
        botId,
      });
      updateSelectedBot(botId);
    },
    [updateSelectedBot]
  );

  // Track pageview when bot is selected and data is available
  // Note: Actual pageview tracking is handled by useBotAnalytics in BotDetailsDrawer
  // This useEffect is kept for potential future analytics needs
  useEffect(() => {
    if (selectedBot && dcaBots && isAnalyticsReady()) {
      const botData = dcaBots.find((b) => b._id === selectedBot);
      if (botData) {
        // Bot data available - drawer will handle pageview tracking
        logger.debug(`[TradingBots] Bot selected: ${selectedBot}`);
      }
    }
  }, [selectedBot, dcaBots]);

  // Open bulk delete modal with selected bots
  const handleOpenBulkDelete = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
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
    },
    []
  );

  // Confirm and perform bulk delete sequentially
  const handleConfirmBulkDelete = useCallback(async () => {
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
        await deleteMutation.mutateAsync({ id: b.id, type: BotTypesEnum.dca });
      }
      toast.success(`Deleted ${bulkDeleteTargets.length} bot(s)`);
    } catch (error) {
      console.error('Failed to delete selected bots:', error);
      toast.error('Failed to delete selected bots');
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteOpen(false);
      setBulkDeleteTargets([]);
    }
  }, [bulkDeleteTargets, deleteMutation]);

  // Open bulk status change modal
  const handleOpenBulkStatusChange = useCallback(
    (
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
    },
    []
  );

  // Confirm bulk status change
  const handleConfirmBulkStatusChange = useCallback(
    async (closeType?: string) => {
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
    },
    [bulkStatusAction, bulkStatusTargets, statusToggleMutation]
  );

  // Check if any bulk targets have active deals (for showing close options)
  const bulkHasActiveDeals = useMemo(() => {
    return bulkStatusTargets.some((b) => {
      const original = getOriginalBot(b.id);
      return (original?.dealsInBot?.active || 0) > 0;
    });
  }, [bulkStatusTargets, getOriginalBot]);

  const cardContextValue = useMemo(
    () => ({
      onSelect: handleSelectBot,
      selectedBotId: selectedBot,
      getOriginalBot,
      /* getBotDeals, */
      privacyMode,
    }),
    [
      /* getBotDeals, */ getOriginalBot,
      handleSelectBot,
      selectedBot,
      privacyMode,
    ]
  );
  // Debug dcaBots changes
  /*   useEffect(() => {
    // Removed debug logging to reduce console noise
  }, [dcaBots, botsLoading, botsError]); */

  const statsSummary = useMemo(() => {
    if (botsError) {
      return emptyDcaBotStatsSummary;
    }
    return computeDcaBotStatsSummary(dcaBots);
  }, [botsError, dcaBots]);

  const {
    closedTrades,
    profit,
    accumulatedProfit,
    profitByDay,
    activeBots,
    totalBots,
    activeDeals,
    profitableBots,
    successRate,
    bestBot,
    capitalMetrics,
    exchangeDistribution,
    exchangeCount,
  } = statsSummary;

  const statsLoading = botsLoading;

  // If route param points to non-existent bot, navigate back to /bot.
  // Skip this entirely in share mode — the visitor's bot list is empty
  // by design (see useDcaBots gating), and we'd otherwise kick a
  // share-link visitor off the URL they were sent.
  useEffect(() => {
    if (shareId) return;
    if (selectedBot && dcaBots.length > 0) {
      const exists = dcaBots.some((bot) => bot._id === selectedBot);
      // Don't redirect while the by-id fallback is still resolving, or if it
      // found the bot — archived bots legitimately live outside the default list.
      if (
        !exists &&
        !fallbackBotResult.isLoading &&
        !fallbackBotResult.bot
      ) {
        logger.warn(
          `[TradingBots] Bot ${selectedBot} not found, navigating back`
        );
        navigate('/bot', { replace: true });
      }
    }
  }, [
    shareId,
    selectedBot,
    dcaBots,
    navigate,
    fallbackBotResult.isLoading,
    fallbackBotResult.bot,
  ]);

  // Register cache status so stale indicator can show and revalidate as needed
  const dcaCacheKey = useCacheKey('dcaBotList', { input: { all: true } });
  useCacheStatus('trading-bots', [dcaCacheKey], ['dcaBotList']);

  // Live update integration - no need to subscribe per bot, stores handle all updates globally
  const liveBotStats = useBotStatsStore((state) => state.botStats);

  // Transform bot data for the drawer component with enhanced settings
  /* const transformBotForDrawer = (
    item: ReturnType<typeof transformDcaBotToBot>
  ) => {
    // Find the original DCA bot data to extract detailed settings
    return transformedBots.find((bot) => bot._id === item.id);

    // Use the toDrawerBot adapter to properly extract and map all data including stats/chart
    // The adapter will handle extracting rawData.stats.chart from original.stats
    return toDrawerBot({
      type: 'dca',
      item,
      original: originalBot,
    });
  }; */

  // Transform DCA bots to the format expected by the UI with proper sorting
  // Fetch exchanges data
  useEffect(() => {
    if (exchangesData?.data) {
      const exchanges = exchangesData.data.exchanges || [];
      setUserExchanges(exchanges);
    }
  }, [exchangesData]);

  // Memoize userExchanges to prevent unnecessary re-renders
  const memoizedUserExchanges = useMemo(() => userExchanges, [userExchanges]);

  // Memoize price data with throttled updates to prevent rapid re-renders
  const [currentPrices, setCurrentPrices] = useState(() => getLocalPrices());
  const lastPriceUpdateRef = useRef(0);

  const lastAcceptedPricesLengthRef = useRef(0);

  useEffect(() => {
    // Subscribe to price updates
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastPriceUpdateRef.current;

        // The price helper invokes this callback twice on subscribe: once
        // synchronously with IDB-cached prices (often empty/stale on a fresh
        // session), then again ~100ms later with the live `/tickers` fetch.
        // The 10s throttle was rejecting that second-pass live update,
        // leaving the page stuck on the empty/stale cache for up to a full
        // 60s helper interval. That breaks the unPnL formula path in
        // transformDcaBotToBot (no prices → `useLiveStats=true`) and bots
        // without server-side `liveStats` show VALUE = 0.
        // Always accept an update when our current snapshot is empty, or
        // when the new payload is materially larger than what we have.
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

  // Memoize bot symbols map to prevent unnecessary fee fetching
  const botSymbolsMap = useMemo(() => {
    const symbolsMap = new Map<string, Set<string>>();

    for (const bot of (dcaBots || []).filter(
      (b) => b.status !== 'closed' && b.status !== 'archive'
    )) {
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
  }, [dcaBots]);

  // Fetch fees for value calculations using the service
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

  // Debounce dcaBots changes to prevent excessive re-renders
  /* const [dcaBots, setDebouncedDcaBots] = useState(dcaBots); */

  /* useEffect(() => {
    if (dcaBots.length && !dcaBots.length) {
      setDebouncedDcaBots(dcaBots);
    }
    const timer = setTimeout(() => {
      // Only update if there are meaningful changes to avoid unnecessary updates
      const hasChanges =
        dcaBots.length !== dcaBots.length ||
        dcaBots.some((bot, index) => {
          const existingBot = dcaBots[index];
          return (
            !existingBot ||
            bot._id !== existingBot._id ||
            bot.status !== existingBot.status ||
            bot.profit?.totalUsd !== existingBot.profit?.totalUsd ||
            bot.usage?.current?.quote !== existingBot.usage?.current?.quote
          );
        });

      if (hasChanges) {
        setDebouncedDcaBots(dcaBots);
      }
    }, 1000); // Increased debounce time to 1 second

    return () => clearTimeout(timer);
  }, [dcaBots, dcaBots]); */

  // Create stable, throttled dependencies for bot transformation
  // Instead of separate state for each dependency, use a single combined state
  const [stableDependencies, setStableDependencies] = useState(() => ({
    prices: memoizedPrices,
    fees: allFees,
    exchanges: memoizedUserExchanges,
    lastUpdated: Date.now(),
  }));

  // Combine all dependency updates into a single, debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if there are actual changes
      if (
        stableDependencies.prices !== memoizedPrices ||
        stableDependencies.fees !== allFees ||
        stableDependencies.exchanges !== memoizedUserExchanges
      ) {
        setStableDependencies({
          prices: memoizedPrices,
          fees: allFees,
          exchanges: memoizedUserExchanges,
          lastUpdated: Date.now(),
        });
      }
    }, 1500); // Increased debounce time to 1.5 seconds for better stability

    return () => clearTimeout(timer);
  }, [
    memoizedPrices,
    allFees,
    memoizedUserExchanges,
    stableDependencies.prices,
    stableDependencies.fees,
    stableDependencies.exchanges,
  ]);
  const transformedBots = useMemo(() => {
    const transformed = dcaBots.map((dcaBot: DCABot) => {
      try {
        // Use stable references to prevent constant recalculations
        const result = transformDcaBotToBot(
          dcaBot,
          stableDependencies.fees,
          stableDependencies.prices,
          false,
          stableDependencies.exchanges,
          liveBotStats[dcaBot._id]
        );

        return result;
      } catch (error) {
        logger.error('[TradingBots] Error transforming bot:', {
          botId: dcaBot._id,
          error,
        });
        throw error;
      }
    });

    // Sort bots by creation date (newest first) by default
    const sortedBots = transformed.sort((a, b) => {
      const aCreated = a.createdAt ?? new Date(a.created || 0).getTime();
      const bCreated = b.createdAt ?? new Date(b.created || 0).getTime();
      return bCreated - aCreated;
    });

    return sortedBots;
  }, [dcaBots, stableDependencies, liveBotStats]);

  // Create a lookup map for original bot data to avoid repeated finds
  const botDataMap = useMemo(() => {
    const map = new Map();
    dcaBots.forEach((bot) => map.set(bot._id, bot));
    return map;
  }, [dcaBots]);

  // Define columns for the data table
  const columns: ColumnDef<ReturnType<typeof transformDcaBotToBot>>[] = useMemo(
    () => [
      {
        accessorKey: 'coinPair',
        header: 'COIN PAIR',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            const pair = (bot['pair'] as string) || '';
            const symbolData = Array.isArray(bot['symbol'])
              ? (bot['symbol'] as unknown[])[0]
              : bot['symbol'];
            const symbolValue =
              symbolData &&
              typeof symbolData === 'object' &&
              'value' in (symbolData as Record<string, unknown>)
                ? (symbolData as Record<string, unknown>)['value']
                : symbolData;
            const sv = symbolValue as Record<string, unknown> | undefined;
            const symbol = (sv?.['symbol'] as string) || '';
            const baseAsset = (sv?.['baseAsset'] as string) || '';
            const quoteAsset = (sv?.['quoteAsset'] as string) || '';
            return [
              pair,
              symbol,
              baseAsset,
              quoteAsset,
              pair.replace('/', ''),
            ].filter(Boolean);
          },
        },
        cell: ({ row }) => {
          const bot = row.original;
          const originalBot = botDataMap.get(bot.id);

          // Get base and quote assets from bot data
          const symbolData = Array.isArray(bot.symbol)
            ? bot.symbol[0]
            : bot.symbol;
          const symbolValue =
            symbolData && 'value' in symbolData ? symbolData.value : symbolData;
          const baseAsset = symbolValue?.baseAsset;
          const quoteAsset = symbolValue?.quoteAsset;

          // Get symbols array from original bot settings
          const symbols = originalBot?.settings?.pair
            ? [originalBot.settings.pair].flat()
            : undefined;

          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              symbols={symbols}
              maxDisplay={3}
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
            return (settings?.['strategy'] as string) || '';
          },
        },
        cell: ({ getValue, row }) => {
          const strategy =
            (getValue() as string) || row.original.settings?.strategy || 'LONG';
          return (
            <StrategyChip
              strategy={strategy as StrategyEnum}
              size="xs"
              chipStyle="solid"
            />
          );
        },
        getGroupingValue: (row) => row.settings?.strategy || 'LONG',
        aggregatedCell: ({ row }) => {
          const strategy =
            (row.getGroupingValue('strategy') as string) || 'LONG';
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
        header: 'TOTAL PROFIT, %',
        meta: {
          filterType: 'number',
        },
        cell: ({ row }) => {
          const percentage = row.original.profitPerc ?? 0;
          return <ProfitLossPercChip value={percentage} size="sm" />;
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
        accessorKey: 'unPnlPerc',
        header: 'VALUE, %',
        meta: {
          filterType: 'number',
        },
        cell: ({ row }) => {
          if (row.original.isActive && row.original.loadedPrices === false) {
            return <Skeleton className="h-4 w-12" />;
          }
          const percentage = row.original.unPnlPerc ?? 0;
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
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
        accessorKey: 'avgDailyPerc',
        header: 'AVG DAILY, %',
        meta: {
          filterType: 'number',
        },
        cell: ({ row }) => {
          const percentage = row.original.avgDailyPerc ?? 0;
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
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
        accessorKey: 'created',
        header: 'CREATED',
        meta: { filterType: 'date' },
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
        meta: { filterType: 'array' },
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
        cell: ({ row }) => {
          const usage = row.original.usageTotal;
          return (
            <div className="flex items-center justify-center">
              <DualArcProgressGauge
                size={40}
                outerPercentage={usage || 0}
                innerPercentage={0}
                outerProgressColor="#10b981"
                showInnerGauge={false}
                displayMode="outer"
                centerText={`${(usage || 0).toFixed(0)}%`}
                label=""
                animate={false}
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'deals',
        accessorFn: (row) => (row as DCABot).dealsInBot.all || 0,
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
    [botDataMap, privacyMode]
  );

  // Apply advanced filtering with archive support
  const filteredData = useMemo(() => {
    let filtered = transformedBots;

    // No need for archive filtering here - handled by API query based on showArchived

    // Filter by status
    if (activeFilters.status.length > 0) {
      filtered = filtered.filter((bot) =>
        activeFilters.status.includes(bot.status)
      );
    }

    // Filter by exchange
    if (activeFilters.exchange.length > 0) {
      filtered = filtered.filter(
        (bot) =>
          activeFilters.exchange.includes(bot.exchange) ||
          activeFilters.exchange.includes(bot.exchangeUUID || '')
      );
    }

    // Filter by strategy
    if (activeFilters.strategy.length > 0) {
      filtered = filtered.filter((bot) =>
        activeFilters.strategy.includes(
          bot.settings.strategy || StrategyEnum.long
        )
      );
    }

    // Filter by profitability
    if (activeFilters.profitability === 'profitable') {
      filtered = filtered.filter((bot) => bot.totalProfitUsd > 0);
    } else if (activeFilters.profitability === 'losing') {
      filtered = filtered.filter((bot) => bot.totalProfitUsd < 0);
    }

    return filtered;
  }, [transformedBots, activeFilters]);

  // Put starred bots first (subscribe to starred ids for reactivity)
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);
  const orderedFilteredData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aStar = starredBotIds.has(a.id) ? 0 : 1;
      const bStar = starredBotIds.has(b.id) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;

      const aCreated = a.createdAt ?? new Date(a.created || 0).getTime();
      const bCreated = b.createdAt ?? new Date(b.created || 0).getTime();
      return bCreated - aCreated;
    });
  }, [filteredData, starredBotIds]);

  useRenderTelemetry('TradingBotsPage', () => ({
    filteredCount: orderedFilteredData.length,
    viewMode: currentViewMode,
  }));

  // Count active filters

  // Filter functionality is now handled by the native QuickFilterBar component

  // Use real statistics data instead of mock
  const statsData = useMemo(
    () => ({
      closedTrades,
      profit,
      accumulatedProfit,
      profitByDay,
      activeBots,
      totalBots,
      activeDeals,
      profitableBots,
      successRate,
      bestBot,
      capitalMetrics,
      exchangeDistribution,
      exchangeCount,
      botListStats: statsSummary.botListStats,
    }),
    [
      closedTrades,
      profit,
      accumulatedProfit,
      profitByDay,
      activeBots,
      totalBots,
      activeDeals,
      profitableBots,
      successRate,
      bestBot,
      capitalMetrics,
      exchangeDistribution,
      exchangeCount,
      statsSummary.botListStats,
    ]
  );

  const selectedBotData = useMemo(() => {
    const fromList = transformedBots.find((bot) => bot.id === selectedBot);
    if (fromList) return fromList;
    // By-id path: share-link visitor (shareId) OR an archived bot not in the
    // list (fallback). Synthesize a drawer bot from the single-bot fetch.
    const raw = (shareId ? sharedBotResult.bot : fallbackBotResult.bot) as
      | DCABot
      | null;
    if (raw && selectedBot) {
      try {
        return transformDcaBotToBot(
          raw,
          [], // no fees needed for read-only render
          [], // no prices — value will be filled in by widget hooks later
          false,
          [],
          undefined
        );
      } catch (e) {
        logger.warn('[TradingBots] failed to transform fallback bot', {
          error: e,
        });
        return undefined;
      }
    }
    return undefined;
  }, [
    selectedBot,
    transformedBots,
    shareId,
    sharedBotResult.bot,
    fallbackBotResult.bot,
  ]);

  // viewOnly mirrors main-dash useDCAPage.ts:1031 — true for any share-
  // link visitor, true for a logged-in user looking at someone else's
  // bot. Gates mutating actions in the drawer.
  const viewOnly = useMemo(() => {
    if (shareId) return true;
    if (!selectedBotData || !currentUser) return false;
    const ownerId = (sharedBotResult.bot as { userId?: string } | null)?.userId;
    if (!ownerId) return false;
    return ownerId !== currentUser.id;
  }, [shareId, selectedBotData, currentUser, sharedBotResult.bot]);
  const onClone = useCallback(
    (botId: string) => {
      if (!selectedBotData) {
        return;
      }
      const originalBot = dcaBots.find((b) => b._id === botId);
      cloneMutation.mutate({
        id: botId,
        name: `${selectedBotData.name} (Clone)`,
        botData: originalBot,
        type: BotTypesEnum.dca,
      });
    },
    [selectedBotData, dcaBots, cloneMutation]
  );

  const onToggleStatus = useCallback(
    (botId: string, status: BotStatus) => {
      const bot = dcaBots.find((b) => b._id === botId);
      const isActive = bot ? isBotActive(bot.status) : false;

      statusToggleMutation.mutate(
        {
          id: botId,
          status,
        },
        {
          onSuccess: () => {
            toast.success(
              `Bot ${isActive ? 'stopped' : 'started'} successfully`
            );
          },
          onError: (error) => {
            console.error('Failed to change bot status:', error);
            toast.error(`Failed to ${isActive ? 'stop' : 'start'} bot`);
          },
        }
      );
    },
    [statusToggleMutation, dcaBots]
  );

  const onCloseBot = useCallback(
    () => updateSelectedBot(null),
    [updateSelectedBot]
  );

  const handleCreateBot = useCallback(() => {
    navigate('/bot/new');
  }, [navigate]);

  const toggleArchived = useCallback(() => {
    setShowArchived((prev) => !prev);
  }, []);

  const handleRowClick = useCallback(
    (bot: ReturnType<typeof transformDcaBotToBot>) => {
      handleSelectBot(bot.id);
    },
    [handleSelectBot]
  );

  const handleBulkArchive = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
      bots.forEach((b) =>
        archiveMutation.mutate({
          id: b.id,
          archive: !showArchived,
          type: BotTypesEnum.dca,
        })
      );
    },
    [archiveMutation, showArchived]
  );

  const handleBulkStart = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
      handleOpenBulkStatusChange(bots, 'start');
    },
    [handleOpenBulkStatusChange]
  );

  const handleBulkStop = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
      handleOpenBulkStatusChange(bots, 'stop');
    },
    [handleOpenBulkStatusChange]
  );

  const handleBulkRestart = useCallback(
    async (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
      const restartableBots = filterRestartableBots(bots);

      if (restartableBots.length === 0) {
        toast.info('No active bots selected');
        return;
      }

      try {
        for (const b of restartableBots) {
          await restartMutation.mutateAsync({
            id: b.id,
            type: BotTypesEnum.dca,
          });
        }
        toast.success(`Restarted ${restartableBots.length} bot(s)`);
      } catch {
        toast.error('Failed to restart selected bots');
      }
    },
    [restartMutation]
  );

  const handleBulkDelete = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) => {
      handleOpenBulkDelete(bots);
    },
    [handleOpenBulkDelete]
  );

  const handleBulkEdit = useCallback(() => {
    toast.info('Bulk edit coming soon');
  }, []);

  const shouldShowStart = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) =>
      filterStartableBots(bots).length > 0,
    []
  );

  const shouldShowStop = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) =>
      filterStoppableBots(bots).length > 0,
    []
  );

  const shouldShowRestart = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) =>
      filterRestartableBots(bots).length > 0,
    []
  );

  const shouldShowDelete = useCallback(
    (bots: ReturnType<typeof transformDcaBotToBot>[]) =>
      areAllBotsDeletable(bots),
    []
  );

  const bulkActions = useMemo(() => {
    if (readOnly) {
      return undefined;
    }

    return [
      {
        id: 'start',
        label: 'Start',
        icon: Play,
        onAction: handleBulkStart,
        shouldShow: shouldShowStart,
      },
      {
        id: 'stop',
        label: 'Stop',
        icon: Pause,
        onAction: handleBulkStop,
        shouldShow: shouldShowStop,
      },
      {
        id: 'restart',
        label: 'Restart',
        icon: RefreshCw,
        onAction: handleBulkRestart,
        shouldShow: shouldShowRestart,
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Edit,
        onAction: handleBulkEdit,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onAction: handleBulkDelete,
        shouldShow: shouldShowDelete,
      },
      {
        id: 'archive',
        label: showArchived ? 'Unarchive' : 'Archive',
        icon: Archive,
        onAction: handleBulkArchive,
      },
    ];
  }, [
    handleBulkArchive,
    handleBulkDelete,
    handleBulkEdit,
    handleBulkRestart,
    handleBulkStart,
    handleBulkStop,
    readOnly,
    shouldShowRestart,
    shouldShowStart,
    shouldShowStop,
    shouldShowDelete,
    showArchived,
  ]);

  const getRowId = useCallback(
    (bot: ReturnType<typeof transformDcaBotToBot>) => bot.id,
    []
  );

  const customToolbarActions = useMemo(
    () => (
      <Button
        variant={showArchived ? 'default' : 'ghost'}
        size="sm"
        onClick={toggleArchived}
        className="h-9 gap-2 px-3"
        title={showArchived ? 'Show Active Bots' : 'Show Archived Bots'}
      >
        <Archive className="h-4 w-4" />
        <span>Archived</span>
      </Button>
    ),
    [showArchived, toggleArchived]
  );
  const customToolbarActionsCompact = useMemo(
    () => (
      <Button
        variant={showArchived ? 'default' : 'ghost'}
        size="icon"
        onClick={toggleArchived}
        className="h-9 w-9"
        title={showArchived ? 'Show Active Bots' : 'Show Archived Bots'}
        aria-label={showArchived ? 'Show active bots' : 'Show archived bots'}
      >
        <Archive className="h-4 w-4" />
      </Button>
    ),
    [showArchived, toggleArchived]
  );

  // ----- Deals tab -----
  // `?view=deals` is the source of truth for the page-level Bots/Deals
  // toggle so reloads and deep links land on the right view. Absence of
  // the param means the default Bots view. (Legacy `?view=<botId>` links
  // are redirected by the migration effect near the top of the component.)
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

  const { deals: dcaDealsForTab } = useDcaDeals({
    terminal: false,
    status:
      dealsStatus === 'closed'
        ? DCADealStatusEnum.closed
        : DCADealStatusEnum.open,
  });

  // Transform DCA deals to OpenTrade[] for the OpenOrdersWidget
  const dcaDealsAsOpenTrades = useMemo(() => {
    if (!dcaDealsForTab || dcaDealsForTab.length === 0) return [];
    return dcaDealsForTab.map(dcaDealToOpenTrade);
  }, [dcaDealsForTab]);

  const customToolbarActionsOverflow = useMemo(
    () => ({
      menuLabel: showArchived ? 'Show Active Bots' : 'Show Archived Bots',
      menuIcon: Archive,
      onMenuClick: toggleArchived,
    }),
    [showArchived, toggleArchived]
  );

  const bulkDeleteAdditionalInfo = useMemo(
    () => ({
      activeDeals: bulkDeleteTargets.reduce(
        (sum: number, b: ReturnType<typeof transformDcaBotToBot>) =>
          sum + ((b as DCABot)?.dealsInBot.active || 0),
        0
      ),
      totalValue: bulkDeleteTargets.reduce(
        (sum: number, b: ReturnType<typeof transformDcaBotToBot>) =>
          sum + (getOriginalBot(b.id)?.usage?.current?.quote || 0),
        0
      ),
      currency:
        getOriginalBot(bulkDeleteTargets[0]?.id ?? '')?.symbol?.[0]?.value
          ?.quoteAsset || 'USD',
      lastActivity: 'Multiple',
    }),
    [bulkDeleteTargets, getOriginalBot]
  );
  // Only show the loading skeleton on first load (no cached data present)
  if ((botsLoading || statsLoading) && dcaBots.length === 0) {
    return (
      <MainLayout pageTitle="Trading Bots" activePage="/bot">
        <BotsSkeleton
          title="Loading Trading Bots"
          description="Fetching your bot data and performance metrics..."
          statCount={5}
          statColumns={TRADING_BOTS_SKELETON_STAT_COLUMNS}
        />
      </MainLayout>
    );
  }

  if (botsError) {
    return (
      <MainLayout pageTitle="Trading Bots" activePage="/bot">
        <WidgetContainer layout="flex" verticalGap>
          <Widget className="p-sm md:p-md text-card-foreground" noPadding>
            <div className="space-y-xs">
              <h1 className="text-2xl font-bold">Trading Bots</h1>
              <p>Error loading trading bots</p>
            </div>
          </Widget>
        </WidgetContainer>
      </MainLayout>
    );
  }

  // Share-mode: render ONLY the shared bot's drawer. Skip the list,
  // stats cards, create button — all of which would either expose
  // the visitor's data (now empty via the hook gate) or invite them
  // to mutate something the share link must not permit. MainLayout
  // itself short-circuits to SharedPageLayout in share mode, so the
  // outer chrome is already minimal.
  if (shareId) {
    return (
      <MainLayout pageTitle="Shared bot" activePage="/bot">
        {selectedBotData ? (
          <BotDetailsDrawer
            type={BotTypesEnum.dca}
            bot={selectedBotData}
            open={true}
            privacyMode={privacyMode}
            onClose={() => navigate('/bot')}
            viewOnly={true}
            ownerUserId={
              (sharedBotResult.bot as { userId?: string } | null)?.userId
            }
            fullWidth={true}
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
    <MainLayout pageTitle="Trading Bots" activePage="/bot">
      <Slot name="bot.listMounted" />
      <div className="h-full min-h-0 flex flex-col" data-tour="bot.list">
        <WidgetContainer
          layout="flex"
          verticalGap
          className="h-full min-h-0 flex-1"
        >
          {/* Enhanced Statistics Cards moved into header */}

          {/* Active Trading Bots - Full Height */}
          <motion.div {...TRADING_BOTS_WIDGET_MOTION}>
            <Widget
              className="p-sm md:p-md text-card-foreground flex-1 min-h-[500px]"
              noPadding
              overflow="auto"
            >
              <Tabs
                value={pageTab}
                onValueChange={(v) => setPageTab(v as 'bots' | 'deals')}
              >
                <div className="flex flex-col h-full min-h-[500px]">
                  <motion.div
                    className="mb-md shrink-0"
                    {...TRADING_BOTS_HEADER_MOTION}
                  >
                    {/* Small screens: title and New on the same row */}
                    <div className="flex items-center justify-between w-full sm:hidden">
                      <div className="flex items-center gap-xs">
                        <h2 className="font-semibold text-xl">Trading Bots</h2>
                        <StaleIndicator componentId="trading-bots" />
                      </div>

                      <div className="flex items-center gap-xs">
                        <TabsList className="w-auto!" fullWidth={false}>
                          <TabsTrigger value="bots">Bots</TabsTrigger>
                          <TabsTrigger value="deals">Deals</TabsTrigger>
                        </TabsList>
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
                            onClick={handleCreateBot}
                            className="fx-glow"
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
                        stats={statsData.botListStats}
                        privacyMode={privacyMode}
                        isLoading={botsLoading || statsLoading}
                        className="w-full"
                      />
                    </div>

                    {/* Large screens: title, stats and button on a single row */}
                    <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-xs w-full">
                      <div className="flex items-center gap-xs">
                        <h2 className="font-semibold text-xl">Trading Bots</h2>
                        <StaleIndicator componentId="trading-bots" />
                      </div>

                      <div className="min-w-0 flex justify-end px-md">
                        <BotListStatsBoxes
                          stats={statsData.botListStats}
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
                              <Plus className="w-4 h-4 mr-xs" />
                              New
                            </MotionButton>
                          </span>
                        ) : (
                          <MotionButton
                            variant="default"
                            onClick={handleCreateBot}
                            className="fx-glow"
                          >
                            <Plus className="w-4 h-4 mr-xs" />
                            New
                          </MotionButton>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Advanced Filters Panel moved to after DataTable */}

                  <TabsContent
                    value="bots"
                    className="flex-1 min-h-[400px] overflow-hidden mt-0"
                  >
                    {/* Data Table with Card View - Full Height */}
                    <motion.div
                      className="flex-1 min-h-[400px] overflow-hidden"
                      {...TRADING_BOTS_TABLE_MOTION}
                    >
                      <TradingBotsCardContext.Provider value={cardContextValue}>
                        {dcaBots.length === 0 ? (
                          <div className="h-full w-full flex items-center justify-center">
                            <EmptyState
                              size="page"
                              icon={<Bot className="w-6 h-6" />}
                              title={
                                showArchived
                                  ? 'No archived DCA bots'
                                  : 'No DCA bots yet'
                              }
                              description={
                                showArchived
                                  ? 'Bots you archive move here. Un-archive one to bring it back to your active list.'
                                  : 'DCA bots dollar-cost-average into a position and take profit at your defined targets. Create one to start trading.'
                              }
                              action={
                                showArchived
                                  ? {
                                      label: 'Back to active bots',
                                      onClick: toggleArchived,
                                    }
                                  : readOnly
                                    ? undefined
                                    : {
                                        label: 'Create DCA bot',
                                        onClick: handleCreateBot,
                                        icon: <Plus className="w-5 h-5" />,
                                      }
                              }
                              secondaryAction={
                                showArchived
                                  ? undefined
                                  : {
                                      label: 'View archived bots',
                                      onClick: toggleArchived,
                                    }
                              }
                            />
                          </div>
                        ) : (
                        <DataTable
                          tableId="trading-bots"
                          columns={columns}
                          data={orderedFilteredData}
                          enableGlobalFilter={true}
                          enableColumnFilters={true}
                          enableSorting={true}
                          enableColumnVisibility={true}
                          defaultColumnVisibility={
                            TRADING_BOTS_DEFAULT_COLUMN_VISIBILITY
                          }
                          enableGrouping={true}
                          enableCardView={true}
                          defaultView="cards"
                          defaultPinnedColumns={
                            TRADING_BOTS_DEFAULT_PINNED_COLUMNS
                          }
                          showPagination={true}
                          cardComponent={BotCardWrapper}
                          cardViewBreakpoints={
                            TRADING_BOTS_CARD_VIEW_BREAKPOINTS
                          }
                          cardViewGap={16}
                          emptyMessage="No trading bots found"
                          className="h-full min-h-[400px]"
                          onViewModeChange={setCurrentViewMode}
                          enableQuickFilterBar={true}
                          quickFilterBarStorageKey="trading-bots-filters"
                          betweenToolbarAndContent={null}
                          onRowClick={handleRowClick}
                          getRowId={getRowId}
                          bulkActions={bulkActions}
                          firstToolbarActions={null}
                          customToolbarActions={customToolbarActions}
                          customToolbarActionsCompact={
                            customToolbarActionsCompact
                          }
                          customToolbarActionsOverflow={
                            customToolbarActionsOverflow
                          }
                          // New button moved to widget header - remove DataTable overflow entry
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
                          additionalInfo={bulkDeleteAdditionalInfo}
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
                      </TradingBotsCardContext.Provider>
                    </motion.div>
                  </TabsContent>

                  <TabsContent
                    value="deals"
                    className="flex-1 min-h-[400px] overflow-hidden mt-0"
                  >
                    <OpenOrdersWidget
                      widgetId="dca-bot-deals"
                      data={{ trades: dcaDealsAsOpenTrades }}
                      rawDeals={dcaDealsForTab}
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
          {selectedBotData && (
            <BotDetailsDrawer
              type={BotTypesEnum.dca}
              bot={selectedBotData}
              open={true}
              privacyMode={privacyMode}
              onClone={onClone}
              onToggleStatus={onToggleStatus}
              onClose={onCloseBot}
              viewOnly={viewOnly}
              ownerUserId={
                (sharedBotResult.bot as { userId?: string } | null)?.userId
              }
            >
              {/* Empty trigger - drawer is controlled by URL parameters */}
              <div />
            </BotDetailsDrawer>
          )}
        </WidgetContainer>
      </div>
    </MainLayout>
  );
};

export default TradingBots;
