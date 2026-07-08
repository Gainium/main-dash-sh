import {
  BotOrderSideEnum,
  BotStartTypeEnum,
  BotTypesEnum,
  CloseConditionEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  DCAConditionEnum,
  DCAOrderTypeEnum,
  ScaleDcaTypeEnum,
  StartConditionEnum,
  DCADealStatusEnum,
  PositionSide,
  StrategyEnum,
  type AvgPrice,
  type BotStatus,
  type DCABot,
  type DCADeals,
  type HedgeBotSettings,
} from '@/types';
/* import type { DrawerBot } from '@/types/bots/drawer'; */
import { formatOrderForDisplay, useBotOrders } from '@/hooks/useBotOrders';
import { indicatorStore } from '@/stores/indicatorStore';
import { useDealStore } from '@/stores/live/dealStore';
import type { ViewOrder } from '@/types/bots';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { isFuturesExchange } from '@/utils/exchangeUtils';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { buildBotEditRoute } from '@/utils/bots/navigation';
import {
  canToggleBotStatus,
  getActionPastTense,
  getActionPresent,
  getActionText,
  getTargetStatus,
  isBotActive,
  isBotRestartable,
} from '@/utils/botStatusUtils';
import { cn } from '@/lib/utils';
import { isReadOnly } from '@/lib/demoMode';
import { getOrderTypeLabel } from '@/utils/mapOrderName';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit as EditIcon,
  Loader2,
  MoreVertical,
  Play,
  RefreshCw,
  Share2,
  Square,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { TradeDetailContent } from '../../components/trades/TradeDetailContent';
import { ShareBotDialog } from '../../features/bots/shared/runtime/dialogs/ShareBotDialog';
import { useBotViewTracking } from '../../hooks/useBotAnalytics';
import {
  useBotClone,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from '../../hooks/useBotMutations';
import { useAuthStore } from '../../stores/authStore';
/* import { useCacheKey } from '../../hooks/useCacheKey'; */
/* import { useCacheStatus } from '../../hooks/useCacheStatus'; */
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { toast } from '../../lib/toast';
import type { BotType } from '../../stores/drawerPanelWidthsStore';
import {
  BotActionsMenuItems,
  type BotStatusType,
  type BotTypeId,
} from '../bots/BotActionsMenuItems';
import { DealEditDrawer } from '../deals/DealEditDrawer';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '../modals';
import { Button } from '../ui/button';
import {
  ResponsiveButtonRow,
  type ResponsiveButtonConfig,
} from '../ui/ResponsiveButtonRow';
import { StatusChip } from '../ui/chip';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';
import { DropdownMenu, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import DrawerWidgetRenderer from '../widgets/bots/drawer/DrawerWidgetRenderer';
import OpenOrdersWidget from '../widgets/shared/OpenOrdersWidget';
import StaleIndicator from '../widgets/shared/StaleIndicator';
import { getDrawerWidgetsForBot } from './drawerWidgetConfig';
import { UnfoldingChartPanel } from './panels/contents';
import HedgeOverviewPanel from './panels/HedgeOverviewPanel';
import { HedgeSharedSettingsCard } from './panels/HedgeSharedSettingsCard';
import { useHedgeDeals } from '@/hooks/useHedgeDeals';
import type { ComboDeal } from '@/hooks/useComboDeals';
import { dcaDealToOpenTrade } from '@/lib/utils/dcaDealToOpenTrade';
import { comboDealToOpenTrade } from '@/lib/utils/comboDealToOpenTrade';
import type { HedgeUnPnlResult } from '@/utils/bots/hedge/computeHedgeUnPnl';

/**
 * Combined hedge context passed by the hedge list pages. The drawer renders
 * both legs together when this is present (see the `hedge` prop docs).
 */
export interface HedgeDrawerContext {
  longBot: DrawerBot | null;
  shortBot: DrawerBot | null;
  unPnl: HedgeUnPnlResult;
  /** Combined realized profit (USD) across both legs. */
  totalProfitUsd: number;
  /** Whether the legs are combo bots (picks the combo deal query/mapper). */
  isCombo: boolean;
  /** Hedge wrapper id — scopes the combined deals query to this bot. */
  wrapperId: string;
  /**
   * Hedge-level shared TP/SL, read off the wrapper (`hedgeBot.sharedSettings`).
   * These live ONLY on the wrapper — they are NOT mirrored into either leg's
   * settings — so the read-only "Hedge" settings tab must read them from here.
   */
  sharedSettings?: HedgeBotSettings;
}

export interface TradeDetails {
  id: string;
  type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
  symbol:
    | string
    | {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
      };
  strategy: string;
  status: string;
  exchange: string;
  exchangeUUID?: string;
  botName?: string | undefined;
  currentBalance: {
    base: number;
    quote: number;
  };
  usage: {
    current: {
      base: number;
      quote: number;
    };
    currentUsd?: number;
    max?: {
      base: number;
      quote: number;
    };
    maxUsd?: number;
  };
  profit?:
    | {
        total: number;
        totalUsd: number;
        pureBase: number;
        pureQuote: number;
      }
    | undefined;
  unrealizedProfit?: number | undefined;
  avgPrice?: number | undefined;
  levels: {
    complete: number;
    all: number;
  };
  created?: number | undefined;
  botId?: string;
  pair?: string;
}

interface BotDetailsDrawerProps {
  bot: DrawerBot;
  type: BotTypesEnum;
  children: React.ReactNode;
  open?: boolean;
  privacyMode?: boolean;
  onEdit?: (botId: string) => void;
  onClone?: (botId: string) => void;
  onToggleStatus?: (botId: string, newStatus: BotStatus) => void;
  onClose?: () => void;
  /**
   * Hedge wrapper id — when the drawer is mounted for a hedge bot the
   * `bot` prop is the leg (since the drawer's queries / widgets are
   * shaped around DCA/Combo bots), but the user-facing "Bot ID" and the
   * Events widget should reference the parent hedge wrapper. Optional
   * everywhere else.
   */
  parentBotId?: string;
  /**
   * Optional UI rendered above the tabs row. Used by hedge lists to
   * inject a Long / Short leg switcher so the same drawer surface can
   * display either leg's data without remounting.
   *
   * @deprecated Superseded by `hedge` (combined view). Kept for any
   * caller still passing a switcher; ignored when `hedge` is set.
   */
  legSwitcher?: React.ReactNode;
  /**
   * Combined hedge context. When supplied the drawer renders BOTH legs
   * together (no leg switcher): Overview shows a combined block + each
   * leg's widgets, Deals/Events/Webhook stack both legs, the chart panel
   * stacks both legs, and only Settings keeps an internal Long/Short
   * toggle. `bot` should be the primary (long) leg for the header chrome.
   */
  hedge?: HedgeDrawerContext;
  /**
   * Read-only mode — true for share-link visitors and for logged-in
   * users viewing a bot they don't own. Hides edit / start-stop / clone
   * / delete actions. Mirrors main-dash useDCAPage.ts:1031.
   */
  viewOnly?: boolean;
  /**
   * Owner-only id (the bot's userId). When this matches the logged-in
   * user the drawer renders a Share button next to the actions menu.
   */
  ownerUserId?: string;
  /**
   * Stretch the drawer + chart panel to the full viewport width. Used
   * in the share-link view where the drawer is the entire page surface
   * and shouldn't leave empty backdrop space to the left.
   */
  fullWidth?: boolean;
}

// Map DrawerBotType to BotType for storage
const mapDrawerBotTypeToBotType = (type: BotTypesEnum): BotType => {
  const mapping: Record<BotTypesEnum, BotType> = {
    dca: 'dca',
    combo: 'combo',
    grid: 'grid',
    hedgeDca: 'hedge-dca',
    hedgeCombo: 'hedge-combo',
    terminal: 'dca',
  };
  return mapping[type] || 'dca';
};

const statusNew = { status: 'NEW', autoPaginate: true };
const statusFilled = { status: 'FILLED', autoPaginate: true };
type BotTab = 'deals' | 'performance' | 'events' | 'settings' | 'webhook';

export const BotDetailsDrawer: React.FC<BotDetailsDrawerProps> = React.memo(
  ({
    bot,
    type,
    children,
    open,
    privacyMode: _privacyMode,
    onEdit,
    onClone,
    //onToggleStatus,
    onClose,
    parentBotId,
    legSwitcher,
    hedge,
    viewOnly = false,
    ownerUserId,
    fullWidth = false,
  }) => {
    const privacyMode = useMemo(() => _privacyMode ?? false, [_privacyMode]);
    const isHedge = !!hedge;
    const isGrid = useMemo(() => type === BotTypesEnum.grid, [type]);
    // View state: 'bot' or 'trade' or 'edit-deal'
    type ViewMode = 'bot' | 'trade' | 'edit-deal';
    const [viewMode, setViewMode] = useState<ViewMode>('bot');
    const [selectedTrade, setSelectedTrade] = useState<TradeDetails | null>(
      null
    );
    const [editingTrade, setEditingTrade] = useState<DCADeals[] | null>(null);
    const [chartTrade, setChartTrade] = useState<TradeDetails | null>(null);

    // Hedge bots reuse this drawer with `legSwitcher` swapping the `bot`
    // prop between the long and short leg (different `_id`s). When that
    // happens, the previously-selected trade / chartTrade belong to the
    // outgoing leg — keeping them around hides the new leg's orders
    // because the order list is filtered by `selectedTrade.dealId`,
    // which never matches a deal on the other leg's bot. Reset trade /
    // view state on bot id change so leg switch lands back on the
    // overview of the new leg.
    useEffect(() => {
      setViewMode('bot');
      setSelectedTrade(null);
      setEditingTrade(null);
      setChartTrade(null);
    }, [bot._id]);

    // Get bot type for persistence
    const botType = useMemo(() => mapDrawerBotTypeToBotType(type), [type]);

    // Tab state for bot view - synced with URL parameters via Tabs component

    const [searchParams, setSearchParams] = useSearchParams();

    // Get tab from URL or default to 'deals'
    const tabParam = useMemo(() => searchParams.get('tab'), [searchParams]);
    const validTabs: BotTab[] = useMemo(
      () =>
        (
          ['performance', 'deals', 'events', 'settings', 'webhook'] as BotTab[]
        ).filter((t) => (isGrid ? t !== 'deals' && t !== 'webhook' : true)),
      [isGrid]
    );
    const activeTab: BotTab = useMemo(
      () =>
        tabParam && validTabs.includes(tabParam as BotTab)
          ? (tabParam as BotTab)
          : validTabs[0],
      [tabParam, validTabs]
    );

    // Tabs component will handle URL syncing via paramKey="tab"
    const handleTabChange = useCallback((_tab: string) => {
      // No manual URL update needed - Tabs component handles it
    }, []);

    // Combined hedge deals (both legs of THIS hedge bot). Fetched only while
    // the Deals tab is active, via the dedicated hedge query that keeps its
    // own react-query cache and never clobbers the shared deal store.
    const [hedgeDealsStatus, setHedgeDealsStatus] = useState<'open' | 'closed'>(
      'open'
    );
    // Settings is the only hedge tab with a sub-switch — Hedge (shared TP/SL)
    // / Long / Short — mirroring the new hedge bot page's tab layout.
    const [settingsLeg, setSettingsLeg] = useState<'hedge' | 'long' | 'short'>(
      'hedge'
    );
    // Fetch ALL the user's hedge deals (the wrapper-id filter isn't reliable
    // server-side) and scope to THIS bot's legs client-side via their ids.
    // Enabled whenever the drawer is a hedge bot (not just on the Deals tab):
    // the Overview's combined unrealized is derived from these deals because
    // the client-side price calc can't value bots on exchanges missing from
    // the price feed (e.g. Kraken futures) — only the server-computed deal
    // unrealized is reliable there.
    const { deals: allHedgeDeals } = useHedgeDeals(hedge?.isCombo ?? false, {
      status:
        hedgeDealsStatus === 'closed'
          ? DCADealStatusEnum.closed
          : DCADealStatusEnum.open,
      enabled: isHedge,
    });
    const hedgeLegIds = useMemo(() => {
      const ids = new Set<string>();
      // Accept either keying: deal.botId may be the leg id or the wrapper id.
      if (hedge?.wrapperId) ids.add(hedge.wrapperId);
      if (hedge?.longBot?._id) ids.add(hedge.longBot._id);
      if (hedge?.shortBot?._id) ids.add(hedge.shortBot._id);
      return ids;
    }, [hedge?.wrapperId, hedge?.longBot?._id, hedge?.shortBot?._id]);
    const hedgeRawDeals = useMemo(
      () =>
        allHedgeDeals.filter(
          (d) => !d.botId || hedgeLegIds.size === 0 || hedgeLegIds.has(d.botId)
        ),
      [allHedgeDeals, hedgeLegIds]
    );
    const hedgeDealsAsOpenTrades = useMemo(() => {
      if (!isHedge) return [];
      return hedge?.isCombo
        ? (hedgeRawDeals as ComboDeal[]).map((d) => comboDealToOpenTrade(d))
        : (hedgeRawDeals as DCADeals[]).map((d) => dcaDealToOpenTrade(d));
    }, [isHedge, hedge?.isCombo, hedgeRawDeals]);

    // Server-accurate combined unrealized for the Overview: sum the open
    // deals' unrealized (the mapper already zeroes inactive deals). Only
    // meaningful while the status toggle is on "open" (its default).
    const hedgeCombinedUnrealized = useMemo(
      () =>
        hedgeDealsStatus === 'open'
          ? hedgeDealsAsOpenTrades.reduce(
              (sum, t) => sum + (t.unrealizedProfit || 0),
              0
            )
          : 0,
      [hedgeDealsAsOpenTrades, hedgeDealsStatus]
    );

    // Enrich each leg bot with server-accurate cost / value / unrealized
    // derived from its deals. The client price calc reads 0 for bots on
    // exchanges missing from the price feed (e.g. Kraken futures), so the leg
    // summary widgets and the combined block would otherwise show 0 / flicker.
    const enrichLegFromDeals = useCallback(
      (leg: DrawerBot | null): DrawerBot | null => {
        if (!leg) return null;
        if (hedgeDealsStatus !== 'open') return leg;
        const legDeals = hedgeRawDeals.filter((d) => d.botId === leg._id);
        if (legDeals.length === 0) return leg;
        const cost = legDeals.reduce(
          (s, d) => s + (d.usage?.currentUsd ?? d.usage?.current?.quote ?? 0),
          0
        );
        const maxCost = legDeals.reduce(
          (s, d) => s + (d.usage?.maxUsd ?? d.usage?.max?.quote ?? 0),
          0
        );
        const unrealized = legDeals.reduce((s, d) => {
          const active = ['open', 'start', 'error'].includes(
            String(d.status).toLowerCase()
          );
          const u =
            (d as { unrealizedUsd?: number }).unrealizedUsd ??
            d.stats?.unrealizedProfit ??
            0;
          return s + (active ? u : 0);
        }, 0);
        return {
          ...leg,
          currentValue: cost,
          value: cost + unrealized,
          unPnl: unrealized,
          unPnlPerc: cost > 0 ? (unrealized / cost) * 100 : 0,
          usage: {
            ...leg.usage,
            currentUsd: cost,
            maxUsd:
              maxCost || (leg.usage as { maxUsd?: number } | undefined)?.maxUsd,
          },
        } as DrawerBot;
      },
      [hedgeRawDeals, hedgeDealsStatus]
    );
    const enrichedLongBot = useMemo(
      () => (isHedge ? enrichLegFromDeals(hedge?.longBot ?? null) : null),
      [isHedge, hedge?.longBot, enrichLegFromDeals]
    );
    const enrichedShortBot = useMemo(
      () => (isHedge ? enrichLegFromDeals(hedge?.shortBot ?? null) : null),
      [isHedge, hedge?.shortBot, enrichLegFromDeals]
    );

    // The events widget derives its bot type from `bot.type`; give it the
    // hedge type + wrapper id so it loads the merged hedge event feed.
    const hedgeEventsBot = useMemo(
      () =>
        hedge
          ? ({
              ...bot,
              type: hedge.isCombo
                ? BotTypesEnum.hedgeCombo
                : BotTypesEnum.hedgeDca,
            } as typeof bot)
          : null,
      [hedge, bot]
    );

    // Modal state
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [successData, setSuccessData] = useState<{
      type: 'clone' | 'delete';
      newItemId?: string;
      botTypeId?: string;
    } | null>(null);

    // Owner-only Share entry point. We resolve the owner via the
    // `ownerUserId` prop (which the list page derives from either the
    // list query result or the shared-bot fetch), falling back to the
    // raw `bot.userId` so list-mode flows keep working without the
    // caller having to thread the prop through.
    const currentUserId = useAuthStore((s) => s.user?.id);
    const resolvedOwnerId =
      ownerUserId ?? (bot as DCABot & { userId?: string }).userId ?? null;
    const isOwner =
      !viewOnly && !!currentUserId && resolvedOwnerId === currentUserId;

    // Mutations
    const deleteMutation = useBotDelete();
    const cloneMutation = useBotClone();
    const restartMutation = useBotRestart();

    const statusToggleMutation = useBotStatusToggle(type);

    // Track bot pageview when drawer opens
    const location = useLocation();
    useBotViewTracking(open ? bot._id : null, location.pathname, {
      bot_status: bot.status,
      exchange: bot.exchange,
      pair: [bot.settings.pair].flat()[0],
      strategy: 'strategy' in bot.settings ? bot.settings.strategy : '',
      is_multi_pair: 'useMulti' in bot.settings ? bot.settings.useMulti : false,
    });

    const drawerWidgets = useMemo(() => getDrawerWidgetsForBot(bot), [bot]);

    /* // Register cache keys and status for this bot's detail drawer so the StaleIndicator can show correct freshness
    const dealsOpenCacheKey = useCacheKey('getBotDeals', {
      id: bot._id,
      status: 'open',
      page: 0,
      pageSize: 50,
    });
    const dealsClosedCacheKey = useCacheKey('getBotDeals', {
      id: bot._id,
      status: 'closed',
      page: 0,
      pageSize: 50,
    });
    const eventsCacheKey = useCacheKey('getBotEvents', {
      botId: bot._id,
      page: 0,
      pageSize: 20,
    });
    const ordersCacheKey = useCacheKey('getBotOrders', {
      id: bot._id,
      status: '',
      page: 0,
      pageSize: 50,
    });
    const transactionsCacheKey = useCacheKey('getBotTransactions', {
      id: bot._id,
      page: 0,
    });
    const dcaBacktestsCacheKey = useCacheKey('getBacktests', {
      pageSize: 10,
      page: 0,
    });
    const comboBacktestsCacheKey = useCacheKey('getComboBacktests', {
      pageSize: 10,
      page: 0,
    });
    const gridBacktestsCacheKey = useCacheKey('getGridBacktests', {
      pageSize: 10,
      page: 0,
    });

    // Also register the list queries for the corresponding bot types so the drawer reflects list freshness
    const comboListCacheKey = useCacheKey('comboBotList', {
      input: {
        all: true,
        status: ['open', 'range', 'monitoring', 'error', 'closed'],
      },
    });
    const gridListCacheKey = useCacheKey('botList', {
      input: { status: ['open', 'range', 'monitoring'] },
    });
    const dcaListCacheKey = useCacheKey('dcaBotList', { input: { all: true } });

    const extraListKeys: unknown[][] = [];
    const extraQueryNames: string[] = [];

    if (type === 'combo') {
      extraListKeys.push(comboListCacheKey);
      extraQueryNames.push('comboBotList');
    } else if (type === 'grid') {
      extraListKeys.push(gridListCacheKey);
      extraQueryNames.push('botList');
    } else if (type === 'dca' || type === 'hedgeDca') {
      extraListKeys.push(dcaListCacheKey);
      extraQueryNames.push('dcaBotList');
    }

    useCacheStatus(
      `bot-details-${bot._id}`,
      [
        ...extraListKeys,
        dealsOpenCacheKey,
        dealsClosedCacheKey,
        eventsCacheKey,
        ordersCacheKey,
        transactionsCacheKey,
        dcaBacktestsCacheKey,
        comboBacktestsCacheKey,
        gridBacktestsCacheKey,
      ],
      [
        ...extraQueryNames,
        'getBotDeals',
        'getBotEvents',
        'getBotOrders',
        'getBotTransactions',
        'getBacktests',
        'getComboBacktests',
        'getGridBacktests',
      ]
    ); */

    // Removed advanced mode preference saving

    const navigate = useNavigate();

    const isControlled = typeof open === 'boolean';
    const [internalOpen, setInternalOpen] = useState(false);
    const actualOpen = isControlled ? (open as boolean) : internalOpen;

    // Left attached panel (Unfolding Chart) collapsed state with persistence
    // Store per-botType and fall back to the old global key for migration
    const leftPanelStorageKeyGlobal = `gainium:drawer:leftPanelCollapsed:global`;
    const leftPanelStorageKey = `gainium:drawer:leftPanelCollapsed:${botType}`;
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState<boolean>(
      () => {
        try {
          // Prefer per-botType key if present, otherwise fall back to global key
          const per = window.localStorage.getItem(leftPanelStorageKey);
          if (per !== null) return per === '1';
          const global = window.localStorage.getItem(leftPanelStorageKeyGlobal);
          return global === '1';
        } catch {
          return false;
        }
      }
    );

    const setLeftPanelCollapsed = (collapsed: boolean) => {
      setIsLeftPanelCollapsed(collapsed);
      try {
        window.localStorage.setItem(leftPanelStorageKey, collapsed ? '1' : '0');
      } catch {
        // ignore
      }
    };

    const handleDrawerOpenChange = (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }

      if (!nextOpen) {
        // Reset to bot view and default tab when closing
        setViewMode('bot');
        setSelectedTrade(null);
        setEditingTrade(null);
        setChartTrade(null);

        // Clear tab parameter from URL
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('tab');
        newParams.delete('editDealId');
        newParams.delete('chartDealId');
        newParams.delete('dealId');
        setSearchParams(newParams, { replace: true });

        if (onClose) {
          onClose();
        }
      }
    };

    // Deep-link: capture the `?dealId=` present when the drawer first opened,
    // exactly once. Auto-opening it is a one-shot — once consumed,
    // `autoOpenDealId` goes null so it can't re-fire and hijack Back/Close when
    // the deals list remounts. This ref/flag lives here (BotDetailsDrawer stays
    // mounted across the bot↔trade view toggle), not in the remounting list.
    const initialDeepLinkDealIdRef = useRef<string | null>(
      searchParams.get('dealId')
    );
    const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
    const autoOpenDealId = deepLinkConsumed
      ? null
      : initialDeepLinkDealIdRef.current;
    const handleAutoOpenHandled = useCallback(() => {
      setDeepLinkConsumed(true);
    }, []);

    // Handler for when a trade is clicked in the deals table
    const handleTradeSelect = useCallback(
      (trade: TradeDetails) => {
        setSelectedTrade(trade);
        setViewMode('trade');
        setChartTrade(null);
        // Reflect the open deal in the URL so it's deep-linkable / shareable.
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'deals');
            next.set('dealId', trade.id);
            return next;
          },
          { replace: true }
        );
      },
      [setSearchParams]
    );

    // Handler to go back to bot view
    const handleBackToBot = () => {
      setViewMode('bot');
      setSelectedTrade(null);
      setEditingTrade(null);
      setChartTrade(null);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('dealId');
          return next;
        },
        { replace: true }
      );
    };

    // Handler for when edit deal is clicked in the deals table
    const handleEditDeal = useCallback((deal: DCADeals[]) => {
      setEditingTrade(deal);
      setViewMode('edit-deal');
      setChartTrade(null);
    }, []);

    // Bot status management
    const isActive = isBotActive(bot.status);

    // For hedge bots, the drawer renders a leg's transformed bot — its
    // `_id` is the leg's id, while the menu actions (edit / clone /
    // delete / start-stop / restart / view backtests) need to operate on
    // the hedge wrapper. The caller passes that wrapper id via
    // `parentBotId`; everywhere we'd otherwise use `bot._id` for an
    // action that targets the bot identity, prefer the parent id when
    // it's set. The `type` prop is already the wrapper type
    // (`hedgeDca` / `hedgeCombo`) for hedge bots.
    const actionBotId = parentBotId ?? bot._id;

    // Event handlers
    const handleEdit = () => {
      const editPath = buildBotEditRoute(type, actionBotId);
      if (onEdit) {
        onEdit(actionBotId);
      } else {
        navigate(editPath);
      }
    };

    const handleClone = () => {
      if (onClone) {
        onClone(actionBotId);
      } else if (type === BotTypesEnum.dca) {
        navigate(`/bot/new?load=${actionBotId}`);
      } else {
        cloneMutation.mutate(
          {
            id: actionBotId,
            name: `${bot.settings.name} (Clone)`,
            type,
            // Note: No botData provided - will use query cache fallback
          },
          {
            onSuccess: (data) => {
              // Show success modal with clone feedback
              setSuccessData({
                type: 'clone',
                newItemId: data?._id || `clone_${Date.now()}`,
                botTypeId: type,
              });
              setSuccessModalOpen(true);
            },
          }
        );
      }
    };

    const handleStatusToggle = () => {
      setStatusModalOpen(true);
    };

    const handleConfirmStatusChange = (
      closeType?: string,
      cancelPartiallyFilled?: boolean
    ) => {
      const newStatus = getTargetStatus(bot.status);

      // Use the mutation directly with callbacks for modal close and toast.
      // Grid bots route the close decision through `closeGridType`
      // (+ cancelPartiallyFilled); DCA/combo use `closeType`.
      statusToggleMutation.mutate(
        {
          id: actionBotId,
          status: newStatus,
          ...(isGrid
            ? {
                closeGridType: closeType as CloseGRIDTypeEnum | undefined,
                cancelPartiallyFilled,
              }
            : { closeType: closeType as CloseDCATypeEnum | undefined }),
        },
        {
          onSuccess: () => {
            setStatusModalOpen(false);
            toast.success(`Bot ${getActionPastTense(bot.status)} successfully`);
            // Note: Don't call onToggleStatus here as it would trigger another mutation
            // The parent will receive updates through React Query cache invalidation
          },
          onError: (error) => {
            console.error('Failed to change bot status:', error);
            toast.error(`Failed to ${isActive ? 'stop' : 'start'} bot`);
          },
        }
      );
    };

    const handleDelete = () => {
      setDeleteModalOpen(true);
    };

    const handleRestart = () => {
      restartMutation.mutate(
        {
          id: actionBotId,
          type,
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
      try {
        await deleteMutation.mutateAsync({ id: actionBotId, type });
        setSuccessData({ type: 'delete' });
        setSuccessModalOpen(true);
      } catch (error) {
        console.error('Failed to delete bot:', error);
        // Error handling is done by the mutation
      }
    };

    const handleDrawerClose = () => {
      handleDrawerOpenChange(false);
    };

    const [dealSymbol, setDealSymbol] = useState<string | null>(null);
    const isMobile = useMediaQuery('(max-width: 767px)');
    const dealWidget = useMemo(
      () => drawerWidgets.filter((w) => w.type === 'drawer-deals-table'),
      [drawerWidgets]
    );
    const {
      orders: pendingBotOrders,
      isLoading: pendingOrdersLoading,
      hasValidResponse: hasPendingResponse,
    } = useBotOrders(bot._id, type, statusNew);

    const {
      orders: completedBotOrders,
      isLoading: completedOrdersLoading,
      hasValidResponse: hasCompletedResponse,
    } = useBotOrders(bot._id, type, statusFilled);

    // For hedge bots the drawer is mounted with `bot` = the primary leg
    // (HedgeCombo/DcaBots pass `drawerPrimaryBot = longBot ?? shortBot`), so
    // the `useBotOrders(bot._id)` calls above only ever fetch ONE leg's
    // orders. The other leg's deals then render an empty order timeline even
    // though their orders exist on the exchange (forum bug #4864 — short deal
    // had no orders shown). Fetch the other leg's orders too and merge them
    // into the pool below; orders stay filtered by dealId downstream, so each
    // deal still only shows its own orders. Empty id = disabled query.
    const otherLegId = useMemo(() => {
      if (!isHedge) return '';
      const longId = hedge?.longBot?._id;
      const shortId = hedge?.shortBot?._id;
      if (bot._id === longId) return shortId ?? '';
      if (bot._id === shortId) return longId ?? '';
      return shortId ?? longId ?? '';
    }, [isHedge, bot._id, hedge?.longBot?._id, hedge?.shortBot?._id]);

    const {
      orders: pendingOtherLegOrders,
      hasValidResponse: hasPendingOtherResponse,
    } = useBotOrders(otherLegId, type, statusNew);

    const {
      orders: completedOtherLegOrders,
      hasValidResponse: hasCompletedOtherResponse,
    } = useBotOrders(otherLegId, type, statusFilled);

    const transformOrders = useMemo(() => {
      return (backendOrders: typeof pendingBotOrders): ViewOrder[] => {
        return backendOrders.map((order) => {
          const formatted = formatOrderForDisplay(order);

          const executedQty = parseFloat(order.executedQty);
          const origQty = parseFloat(order.origQty);
          const executedPrice =
            executedQty > 0
              ? formatted.price * (executedQty / origQty)
              : formatted.price;

          // Determine the proper order type label (with DCA/add funds/reduce funds annotations)
          const orderTypeLabel = getOrderTypeLabel(
            order.typeOrder || 'regular',
            order.sl || false,
            order.clientOrderId,
            order.reduceFundsId,
            true // Real orders
          );

          return {
            id: formatted.id,
            dealId: formatted.dealId,
            type: formatted.side, // Now correctly maps to 'buy' | 'sell'
            status: formatted.status,
            symbol: formatted.symbol,
            baseAsset: formatted.baseAsset,
            quoteAsset: formatted.quoteAsset,
            amount: formatted.quantity,
            price: formatted.price,
            filled: formatted.executedQuantity,
            remaining: formatted.quantity - formatted.executedQuantity,
            total: formatted.price * formatted.quantity,
            createTime: new Date(formatted.time).toISOString(),
            ...(formatted.updateTime && {
              updateTime: new Date(formatted.updateTime).toISOString(),
            }),
            side: formatted.side, // 'buy' | 'sell'
            exchange: formatted.exchange || bot.exchange || 'Unknown',
            executedQuantity: formatted.executedQuantity,
            executedPrice: executedPrice,
            orderType: orderTypeLabel, // Use the full label with DCA/add funds/reduce funds annotations
            origQty: order.origQty,
            typeOrder: order.typeOrder,
            sl: order.sl,
            clientOrderId: order.clientOrderId,
            reduceFundsId: order.reduceFundsId,
            time: order.updateTime,
            executedQty: order.executedQty,
          };
        });
      };
    }, [bot.exchange]);

    // Get pending and completed orders for this deal. For hedge bots we merge
    // the other leg's orders so short-leg deals show their timeline too (#4864).
    const pendingOrders = useMemo(() => {
      const own = hasPendingResponse ? transformOrders(pendingBotOrders) : [];
      const other = hasPendingOtherResponse
        ? transformOrders(pendingOtherLegOrders)
        : [];
      return other.length ? [...own, ...other] : own;
    }, [
      hasPendingResponse,
      pendingBotOrders,
      hasPendingOtherResponse,
      pendingOtherLegOrders,
      transformOrders,
    ]);

    const completedOrders = useMemo(() => {
      const own = hasCompletedResponse
        ? transformOrders(completedBotOrders)
        : [];
      const other = hasCompletedOtherResponse
        ? transformOrders(completedOtherLegOrders)
        : [];
      return other.length ? [...own, ...other] : own;
    }, [
      hasCompletedResponse,
      completedBotOrders,
      hasCompletedOtherResponse,
      completedOtherLegOrders,
      transformOrders,
    ]);

    const isLoadingOrders = useMemo(
      () => pendingOrdersLoading || completedOrdersLoading,
      [pendingOrdersLoading, completedOrdersLoading]
    );

    // Raw deal carries pendingAddFunds/pendingReduceFunds so DealOrdersSection
    // can route a manual add/reduce-funds cancel through the correct mutation.
    const rawDeal = useDealStore((s) =>
      selectedTrade?.id ? (s.deals[bot._id]?.[selectedTrade.id] ?? null) : null
    );

    // Auto-select the most recent deal so TP/SL lines show on chart immediately
    const hasAutoSelectedDeal = useRef(false);
    useEffect(() => {
      if (hasAutoSelectedDeal.current || isGrid || isLoadingOrders) {
        return;
      }
      // Need at least some orders to find a deal
      const allOrders = [...pendingOrders, ...completedOrders];
      if (allOrders.length === 0) return;
      // Don't auto-select if a URL-based selection is pending
      if (searchParams.get('chartDealId') || searchParams.get('editDealId')) {
        return;
      }
      // Find the deal with the most recent order
      const dealMap = new Map<
        string,
        { id: string; symbol: string; time: number }
      >();
      for (const o of allOrders) {
        if (!o.dealId) continue;
        const existing = dealMap.get(o.dealId);
        if (
          !existing ||
          (o.time && (!existing.time || o.time > existing.time))
        ) {
          dealMap.set(o.dealId, {
            id: o.dealId,
            symbol: o.symbol,
            time: o.time,
          });
        }
      }
      if (dealMap.size === 0) return;

      // Pick the deal with the most recent order time
      let mostRecent: { id: string; symbol: string; time: number } | null =
        null;
      for (const entry of dealMap.values()) {
        if (!mostRecent || entry.time > mostRecent.time) {
          mostRecent = entry;
        }
      }
      if (!mostRecent) return;

      hasAutoSelectedDeal.current = true;
      // Set the chart trade with minimal info (only id is used for order filtering)
      setChartTrade({ id: mostRecent.id } as TradeDetails);
      setDealSymbol(mostRecent.symbol);
    }, [isGrid, isLoadingOrders, pendingOrders, completedOrders, searchParams]);

    // Reset auto-select flag when drawer closes
    useEffect(() => {
      if (!actualOpen) {
        hasAutoSelectedDeal.current = false;
      }
    }, [actualOpen]);

    const onTradeChartSelect = useCallback((trade: TradeDetails) => {
      setChartTrade(trade);
    }, []);

    // Clicking a pair chip in the drawer switches the chart to that pair.
    // Clear any selected deal first so the chart shows the plain pair rather
    // than stale deal-scoped order markers from a different symbol.
    const handleDrawerPairSelect = useCallback((symbol: string) => {
      if (!symbol) {
        return;
      }
      setChartTrade(null);
      setDealSymbol(symbol);
    }, []);
    const dealWidgetWithProps = useMemo(() => {
      if (dealWidget.length === 0) return dealWidget;
      return dealWidget.map((widget) => ({
        ...widget,
        props: {
          ...widget.props,
          symbol: dealSymbol,
          setSymbol: setDealSymbol,
          completedOrders,
          pendingOrders,
          onTradeChartSelect,
          onEditDeal: handleEditDeal,
          externalSelectedDealId: chartTrade?.id ?? null,
          autoOpenDealId,
          onAutoOpenHandled: handleAutoOpenHandled,
        },
      }));
    }, [
      dealSymbol,
      dealWidget,
      setDealSymbol,
      completedOrders,
      pendingOrders,
      onTradeChartSelect,
      handleEditDeal,
      chartTrade?.id,
      autoOpenDealId,
      handleAutoOpenHandled,
    ]);

    const chartOrders = useMemo(
      () =>
        [...pendingOrders]
          .filter((o) => {
            // Grid bots don't have deals — show all orders on the chart
            if (isGrid) return true;
            return chartTrade?.id
              ? o.dealId === chartTrade.id
              : o.dealId === selectedTrade?.id;
          })
          .map((o) => ({
            qty: +o.origQty,
            price: +o.price,
            side:
              o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
            id: o.id,
            type: o.typeOrder as DCAOrderTypeEnum,
            pair: o.symbol,
            strategy: StrategyEnum.long,
            label: isGrid
              ? o.side === 'buy'
                ? 'Grid Buy'
                : 'Grid Sell'
              : getOrderTypeLabel(
                  o.typeOrder ?? 'regular',
                  !!o.sl,
                  o.clientOrderId,
                  o.reduceFundsId,
                  false
                ), // false = not real order for display
          })),
      [pendingOrders, selectedTrade?.id, chartTrade?.id, isGrid]
    );

    const chartTransactions = useMemo(
      () =>
        [...completedOrders]
          .filter((o) => {
            // Grid bots don't have deals — show all transactions on the chart
            if (isGrid) return true;
            return chartTrade?.id
              ? o.dealId === chartTrade.id
              : o.dealId === selectedTrade?.id;
          })
          .map((o) => ({
            price: +o.price,
            side:
              o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
            id: o.id,
            time: o.time,
          })),
      [completedOrders, selectedTrade?.id, chartTrade?.id, isGrid]
    );

    // Breakeven line for the selected deal. Grid bots use their own
    // avg-price overlay through `gridPageContext`, so we leave them
    // alone here.
    const chartAvgPrices = useMemo<AvgPrice[]>(() => {
      if (isGrid) return [];
      const target = chartTrade ?? selectedTrade;
      if (!target?.avgPrice || target.avgPrice <= 0) return [];
      const symbol =
        typeof target.symbol === 'string'
          ? target.symbol
          : target.symbol.symbol;
      return [
        {
          price: target.avgPrice,
          label: 'Breakeven',
          symbol,
        },
      ];
    }, [isGrid, chartTrade, selectedTrade]);

    useEffect(() => {
      if (isGrid || chartTrade || selectedTrade) {
        exampleOrdersStore.setOrders(chartOrders);
        exampleOrdersStore.setTransactions(chartTransactions);
        exampleOrdersStore.setAvgPrices(chartAvgPrices);
      } else {
        exampleOrdersStore.setOrders([]);
        exampleOrdersStore.setTransactions([]);
        exampleOrdersStore.setAvgPrices([]);
      }
      return () => {
        exampleOrdersStore.setOrders([]);
        exampleOrdersStore.setTransactions([]);
        exampleOrdersStore.setAvgPrices([]);
      };
    }, [
      isGrid,
      chartTrade,
      selectedTrade,
      chartOrders,
      chartTransactions,
      chartAvgPrices,
    ]);

    useEffect(() => {
      if (isGrid) {
        return;
      }
      indicatorStore.setIndicators((bot as DCABot).settings.indicators);
    }, [isGrid, bot]);

    useEffect(() => {
      if (bot?.type === BotTypesEnum.grid) {
        return;
      }
      const b = bot as DCABot;
      const scaleAr =
        (b.settings.dcaCondition === DCAConditionEnum.percentage ||
          !b.settings.dcaCondition) &&
        [ScaleDcaTypeEnum.adr, ScaleDcaTypeEnum.atr].includes(
          b.settings.scaleDcaType ?? ScaleDcaTypeEnum.percentage
        ) &&
        b.settings.useDca;
      const tpAr =
        b.settings.dealCloseCondition === CloseConditionEnum.dynamicAr &&
        b.settings.useTp;
      const slAr =
        b.settings.dealCloseConditionSL === CloseConditionEnum.dynamicAr &&
        b.settings.useSl;
      indicatorStore.setChartIndicatorsContext({
        scaleAr,
        tpAr,
        slAr,
        strategy: b?.settings.strategy,
        indicatorGroupsToUse: b?.settings.indicatorGroups
          .filter(
            (ig) =>
              b.settings.indicators.filter((i) => i.groupId === ig.id).length >
              0
          )
          .map((ig) => ig.id),
        useCloseIndicators:
          (b.settings.dealCloseCondition === CloseConditionEnum.techInd &&
            (!b.settings.useRiskReward ||
              (b.settings.useRiskReward && !b.settings.riskUseTpRatio))) ||
          (b.settings.dealCloseConditionSL === CloseConditionEnum.techInd &&
            !b.settings.useRiskReward) ||
          tpAr ||
          slAr,
        useStartDealIndicators:
          b.settings.startCondition === StartConditionEnum.ti,
        useStartDCAIndicators:
          (b.settings.dcaCondition === DCAConditionEnum.indicators &&
            b.settings.useDca) ||
          scaleAr,
        useStopBotIndicators:
          b.settings.botStart === BotStartTypeEnum.indicators &&
          b.settings.useBotController,
        useStartBotIndicators:
          b.settings.botActualStart === BotStartTypeEnum.indicators &&
          b.settings.useBotController,
        useRiskRewardIndicators: b.settings.useRiskReward,
      });
    }, [bot]);

    const leftPanel = useMemo(
      () =>
        isLeftPanelCollapsed ? null : (
          // Hedge legs share the pair, so a single chart (the primary leg)
          // covers both — one chart, not two.
          <div className="h-full w-full">
            <UnfoldingChartPanel
              botId={bot._id}
              bot={bot}
              enabled
              className="h-full"
              overrideSymbol={dealSymbol}
            />
          </div>
        ),
      [isLeftPanelCollapsed, bot, dealSymbol]
    );

    const leftPanelClassName = useMemo(
      () => (isLeftPanelCollapsed ? '' : 'hidden md:block w-[640px]'),
      [isLeftPanelCollapsed]
    );

    // Bottom action bar (mirrors the edit/new bot form footer, minus the
    // backtest row). Shown for every bot type in the main "bot" view. Built
    // fresh each render; ResponsiveButtonRow keys off a content signature, not
    // array identity, so re-creating it here is cheap and loop-safe.
    const footerReadOnly = isReadOnly() || viewOnly;
    const canToggle = canToggleBotStatus(bot.status);
    const canRestart = isBotRestartable(bot.status);
    const statusTogglePending = statusToggleMutation.isPending;
    const restartPending = restartMutation.isPending;
    const toggleLabel = getActionText(bot.status);
    const footerActionButtons: ResponsiveButtonConfig[] = [];

    if (canToggle) {
      footerActionButtons.push({
        id: 'toggle',
        // Lowest priority → renders leftmost (Stop/Start).
        priority: 1,
        fullContent: (
          <Button
            onClick={() => handleStatusToggle()}
            disabled={statusTogglePending || footerReadOnly}
            variant="outline"
            className="flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2"
            aria-pressed={isActive}
            aria-label={toggleLabel}
          >
            {statusTogglePending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="truncate">{getActionPresent(bot.status)}…</span>
              </>
            ) : isActive ? (
              <>
                <Square className="w-4 h-4 shrink-0" />
                <span className="truncate">{toggleLabel}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 shrink-0" />
                <span className="truncate">{toggleLabel}</span>
              </>
            )}
          </Button>
        ),
        compactContent: (
          <Button
            onClick={() => handleStatusToggle()}
            size="icon"
            disabled={statusTogglePending || footerReadOnly}
            variant="outline"
            aria-pressed={isActive}
            aria-label={toggleLabel}
          >
            {statusTogglePending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isActive ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="sr-only">{toggleLabel}</span>
          </Button>
        ),
        menuLabel: statusTogglePending
          ? `${getActionPresent(bot.status)}…`
          : toggleLabel,
        menuIcon: isActive ? Square : Play,
        onMenuClick: () => handleStatusToggle(),
        disabled: statusTogglePending || footerReadOnly,
      });
    }

    footerActionButtons.push({
      id: 'edit',
      // Highest priority → with `highestPriorityFullWidth` it becomes the
      // full-width primary button, anchored to the right of the row.
      priority: 3,
      fullContent: (
        <Button
          onClick={() => handleEdit()}
          disabled={footerReadOnly}
          variant="default"
          className="flex w-full items-center justify-center gap-xs font-semibold uppercase px-4 py-2"
          aria-label="Edit bot"
          title={footerReadOnly ? 'Editing is not available in demo mode' : undefined}
        >
          <EditIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">Edit</span>
        </Button>
      ),
      compactContent: (
        <Button
          onClick={() => handleEdit()}
          size="icon"
          disabled={footerReadOnly}
          variant="default"
          aria-label="Edit bot"
          title={footerReadOnly ? 'Editing is not available in demo mode' : undefined}
        >
          <EditIcon className="w-4 h-4" />
          <span className="sr-only">Edit</span>
        </Button>
      ),
      menuLabel: 'Edit',
      menuIcon: EditIcon,
      onMenuClick: () => handleEdit(),
      disabled: footerReadOnly,
    });

    if (canRestart) {
      footerActionButtons.push({
        id: 'restart',
        // Middle priority → sits between Stop (left) and the full-width Edit.
        priority: 2,
        fullContent: (
          <Button
            onClick={() => handleRestart()}
            disabled={restartPending || footerReadOnly}
            variant="outline"
            className="flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2"
            aria-label="Restart bot"
          >
            <RefreshCw
              className={cn('w-4 h-4 shrink-0', restartPending && 'animate-spin')}
            />
            <span className="truncate">
              {restartPending ? 'Restarting…' : 'Restart'}
            </span>
          </Button>
        ),
        compactContent: (
          <Button
            onClick={() => handleRestart()}
            size="icon"
            disabled={restartPending || footerReadOnly}
            variant="outline"
            aria-label="Restart bot"
          >
            <RefreshCw
              className={cn('w-4 h-4', restartPending && 'animate-spin')}
            />
            <span className="sr-only">Restart</span>
          </Button>
        ),
        menuLabel: restartPending ? 'Restarting…' : 'Restart',
        menuIcon: RefreshCw,
        onMenuClick: () => handleRestart(),
        disabled: restartPending || footerReadOnly,
      });
    }

    return (
      <DetailDrawer open={actualOpen} onOpenChange={handleDrawerOpenChange}>
        <DetailDrawerTrigger asChild>{children}</DetailDrawerTrigger>

        <DetailDrawerContent
          className="w-full max-w-none"
          showCloseButton={false}
          onClose={handleDrawerClose}
          botType={botType}
          leftPanel={leftPanel}
          leftPanelClassName={leftPanelClassName}
          fullWidth={fullWidth}
        >
          {viewMode === 'bot' ? (
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              paramKey="tab"
              paramSync={true}
              className="flex flex-col h-full"
            >
              <DetailDrawerHeader className="relative">
                <div className="flex w-full flex-col gap-md">
                  {/* Top row: Title and actions */}
                  <div className="flex w-full items-center justify-between gap-md">
                    <div className="flex flex-1 min-w-0 items-center gap-2 pr-4">
                      <StatusChip
                        status={bot.status}
                        size="md"
                        chipStyle="solid"
                        dotOnly
                        className="shrink-0"
                      />
                      <DetailDrawerTitle className="text-balance text-2xl leading-tight sm:text-3xl min-w-0 truncate">
                        {bot.settings.name}
                      </DetailDrawerTitle>
                      <StaleIndicator
                        componentId={`bot-details-${bot._id}`}
                        className="ml-2 shrink-0"
                      />
                    </div>

                    <div className="flex shrink-0 items-center gap-xs sm:gap-sm">
                      {/* Toggle left-attached panel (desktop only) */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted hidden md:inline-flex"
                        aria-label={
                          isLeftPanelCollapsed
                            ? 'Show chart panel'
                            : 'Hide chart panel'
                        }
                        onClick={() =>
                          setLeftPanelCollapsed(!isLeftPanelCollapsed)
                        }
                      >
                        {isLeftPanelCollapsed ? (
                          <ChevronLeft className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label="Share bot"
                          title="Share bot"
                          onClick={() => setShareDialogOpen(true)}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label="Bot actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <BotActionsMenuItems
                          align="end"
                          className="w-56 z-50"
                          viewOnly={viewOnly}
                          hideLifecycleActions
                          bot={{
                            id: bot._id,
                            name: bot.settings.name,
                            type: type as BotTypeId,
                            status: bot.status as BotStatusType,
                          }}
                          pending={{
                            statusToggle: statusToggleMutation.isPending,
                            restart: restartMutation.isPending,
                            clone: cloneMutation.isPending,
                            delete: deleteMutation.isPending,
                          }}
                          onToggleStatus={() => handleStatusToggle()}
                          onRestart={() => handleRestart()}
                          onEdit={() => handleEdit()}
                          onClone={() => handleClone()}
                          onViewClosedTrades={() =>
                            navigate(`/trades?botId=${bot._id}`)
                          }
                          onShareConfig={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                JSON.stringify(bot, null, 2)
                              );
                              toast.success(
                                'Configuration copied to clipboard'
                              );
                            } catch (error) {
                              console.error(
                                'Failed to copy configuration:',
                                error
                              );
                              toast.error('Failed to copy configuration');
                            }
                          }}
                          onCopyToLive={() => {
                            const botConfig = {
                              name: `${bot.settings.name} (Live)`,
                              type: type,
                              exchange: bot.exchange,
                              symbol: bot.symbol,
                              settings: bot.settings,
                            };
                            try {
                              sessionStorage.setItem(
                                'botConfig',
                                JSON.stringify(botConfig)
                              );
                              navigate('/bot/new');
                            } catch (error) {
                              console.error(
                                'Failed to stage config for live trading:',
                                error
                              );
                              toast.error('Failed to stage configuration');
                            }
                          }}
                          onDelete={() => handleDelete()}
                        />
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label="Close drawer"
                        onClick={handleDrawerClose}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Optional leg switcher — supplied by the hedge list
                      pages so the same drawer can flip between long /
                      short leg data without remounting. */}
                  {legSwitcher && !isHedge && (
                    <div className="mb-sm flex items-center">{legSwitcher}</div>
                  )}

                  {/* Tabs (only in bot view) - Responsive tabs that convert to dropdown on mobile */}
                  <div className="flex items-center">
                    <TabsList
                      className="grid w-full grid-cols-5"
                      breakpoint={640}
                      value={activeTab}
                      onValueChange={handleTabChange}
                    >
                      <TabsTrigger value="performance">Overview</TabsTrigger>
                      {!isGrid && (
                        <TabsTrigger value="deals">Deals</TabsTrigger>
                      )}
                      <TabsTrigger value="events">Events</TabsTrigger>
                      <TabsTrigger value="settings">Settings</TabsTrigger>
                      {!isGrid && (
                        <TabsTrigger value="webhook">Webhook</TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                </div>
              </DetailDrawerHeader>

              <DetailDrawerBody className="px-4 py-5 sm:px-6 sm:py-6">
                <TabsContent
                  value="deals"
                  className="mt-0 flex-1 overflow-hidden"
                >
                  <motion.div
                    key="deals-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    {/* Deals widget — hedge shows both legs' deals combined
                        via the dedicated hedge query; non-hedge uses the
                        single-bot deals table. */}
                    {isHedge ? (
                      <OpenOrdersWidget
                        widgetId={`hedge-bot-${hedge?.wrapperId}-deals`}
                        data={{ trades: hedgeDealsAsOpenTrades }}
                        rawDeals={hedgeRawDeals as DCADeals[]}
                        enableStatusToggle={true}
                        onStatusFilterChange={setHedgeDealsStatus}
                        privacyMode={privacyMode}
                        // Click a deal -> open it IN-PLACE in this drawer (like
                        // the other bot drawers), not a second drawer on top.
                        onTradeClick={(t) =>
                          handleTradeSelect(t as unknown as TradeDetails)
                        }
                      />
                    ) : (
                      <DrawerWidgetRenderer
                        botId={bot._id}
                        bot={bot}
                        privacyMode={privacyMode}
                        widgets={dealWidgetWithProps}
                        onTradeSelect={handleTradeSelect}
                      />
                    )}
                  </motion.div>
                </TabsContent>

                <TabsContent value="performance" className="mt-0">
                  <motion.div
                    key="performance-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5 sm:space-y-lg"
                  >
                    {/* Performance widgets — hedge shows a combined block plus
                        each leg's widgets; non-hedge shows the single bot. */}
                    {isHedge && hedge ? (
                      <HedgeOverviewPanel
                        longBot={enrichedLongBot ?? hedge.longBot}
                        shortBot={enrichedShortBot ?? hedge.shortBot}
                        totalProfitUsd={hedge.totalProfitUsd}
                        unrealizedUsd={hedgeCombinedUnrealized}
                        privacyMode={privacyMode}
                        onTradeSelect={handleTradeSelect}
                      />
                    ) : (
                      <DrawerWidgetRenderer
                        botId={bot._id}
                        bot={bot}
                        privacyMode={privacyMode}
                        widgets={drawerWidgets.filter(
                          (w) =>
                            ![
                              'drawer-bot-events',
                              'drawer-webhook-info',
                              'drawer-bot-settings',
                              'drawer-deals-table',
                              'drawer-orders-table',
                              'drawer-backtest-results',
                              'drawer-additional-details',
                            ].includes(w.type)
                        )}
                        onTradeSelect={handleTradeSelect}
                        onPairClick={handleDrawerPairSelect}
                      />
                    )}

                    {/* Bot ID — parent (hedge wrapper) takes precedence so
                        the user sees the id that owns the bot card / list
                        row, not the leg's nested id. */}
                    <div className="flex items-center justify-between rounded-lg bg-muted p-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Bot ID
                        </span>
                        <div className="font-mono text-xs">
                          {parentBotId ?? bot._id}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              parentBotId ?? bot._id
                            );
                            toast.success('Bot ID copied');
                          } catch {
                            toast.error('Failed to copy');
                          }
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                </TabsContent>

                <TabsContent value="events" className="mt-0">
                  <motion.div
                    key="events-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5 sm:space-y-lg"
                  >
                    {/* Events — hedge fetches the MERGED hedge-level event
                        feed (the events widget keys off bot.type + wrapper id;
                        a hedge type makes the backend return both legs'
                        lifecycle events as one stream). Non-hedge shows the
                        single bot's events. */}
                    {isHedge && hedge ? (
                      <DrawerWidgetRenderer
                        botId={hedge.wrapperId}
                        bot={hedgeEventsBot ?? bot}
                        privacyMode={privacyMode}
                        widgets={[
                          {
                            type: 'drawer-bot-events',
                            botId: hedge.wrapperId,
                          },
                        ]}
                        onTradeSelect={handleTradeSelect}
                      />
                    ) : (
                      <DrawerWidgetRenderer
                        botId={parentBotId ?? bot._id}
                        bot={bot}
                        privacyMode={privacyMode}
                        widgets={drawerWidgets.filter(
                          (w) => w.type === 'drawer-bot-events'
                        )}
                        onTradeSelect={handleTradeSelect}
                      />
                    )}
                  </motion.div>
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <motion.div
                    key="settings-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="-mt-5 sm:-mt-6"
                  >
                    {/* Bot Settings — the ONE hedge tab with a sub-switch:
                        Hedge (shared TP/SL) / Long / Short, mirroring the new
                        hedge bot page. */}
                    {isHedge && hedge ? (
                      (() => {
                        const activeLegBot =
                          settingsLeg === 'short'
                            ? hedge.shortBot
                            : hedge.longBot;
                        return (
                          <div className="space-y-4 pt-5 sm:pt-6">
                            <Tabs
                              value={settingsLeg}
                              onValueChange={(v) =>
                                setSettingsLeg(v as 'hedge' | 'long' | 'short')
                              }
                            >
                              <TabsList>
                                <TabsTrigger value="hedge">Hedge</TabsTrigger>
                                <TabsTrigger value="long">Long leg</TabsTrigger>
                                <TabsTrigger value="short">
                                  Short leg
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                            {settingsLeg === 'hedge' ? (
                              <HedgeSharedSettingsCard
                                settings={hedge.sharedSettings}
                              />
                            ) : activeLegBot ? (
                              <DrawerWidgetRenderer
                                botId={activeLegBot._id}
                                bot={activeLegBot}
                                privacyMode={privacyMode}
                                widgets={[
                                  {
                                    type: 'drawer-bot-settings',
                                    botId: activeLegBot._id,
                                  },
                                ]}
                                onTradeSelect={handleTradeSelect}
                              />
                            ) : (
                              <div className="rounded-lg bg-muted p-sm text-sm text-muted-foreground">
                                This leg has no settings.
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <DrawerWidgetRenderer
                        botId={bot._id}
                        bot={bot}
                        privacyMode={privacyMode}
                        widgets={[
                          { type: 'drawer-bot-settings', botId: bot._id },
                        ]}
                        onTradeSelect={handleTradeSelect}
                      />
                    )}
                  </motion.div>
                </TabsContent>

                <TabsContent value="webhook" className="mt-0">
                  <motion.div
                    key="webhook-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5 sm:space-y-lg"
                  >
                    {/* Webhook — hedge stacks both legs' webhook configs
                        (each leg has its own); non-hedge shows the single
                        bot's webhook. */}
                    {isHedge && hedge ? (
                      <div className="space-y-5 sm:space-y-lg">
                        {[
                          { key: 'long' as const, bot: hedge.longBot },
                          { key: 'short' as const, bot: hedge.shortBot },
                        ]
                          .filter(
                            (l): l is { key: 'long' | 'short'; bot: DrawerBot } =>
                              !!l.bot
                          )
                          .map(({ key, bot: legBot }) => (
                            <section key={key} className="space-y-2">
                              <div className="text-xs font-semibold capitalize text-muted-foreground">
                                {key} leg
                                {legBot.settings?.name
                                  ? ` · ${legBot.settings.name}`
                                  : ''}
                              </div>
                              <DrawerWidgetRenderer
                                botId={legBot._id}
                                bot={legBot}
                                privacyMode={privacyMode}
                                widgets={[
                                  {
                                    type: 'drawer-webhook-info',
                                    botId: legBot._id,
                                  },
                                ]}
                                onTradeSelect={handleTradeSelect}
                              />
                            </section>
                          ))}
                      </div>
                    ) : (
                      <DrawerWidgetRenderer
                        botId={bot._id}
                        bot={bot}
                        privacyMode={privacyMode}
                        widgets={drawerWidgets.filter(
                          (w) => w.type === 'drawer-webhook-info'
                        )}
                        onTradeSelect={handleTradeSelect}
                      />
                    )}
                  </motion.div>
                </TabsContent>
              </DetailDrawerBody>

              {/* Bottom action bar — Stop (left), Restart, and a full-width
                  primary Edit (right), for every bot type. Mirrors the
                  edit/new bot form footer (without the backtest row). These
                  actions are intentionally NOT duplicated in the header ⋮
                  menu (see hideLifecycleActions above). Hidden for share-link
                  / non-owner viewers. */}
              {!viewOnly && (
                <div className="shrink-0 border-t border-border px-3 py-2 sm:px-4">
                  <ResponsiveButtonRow
                    buttons={footerActionButtons}
                    gap={8}
                    buffer={16}
                    alignment="left"
                    highestPriorityFullWidth
                    enableOverflowMenu
                    overflowMenuTriggerClassName="rounded-lg"
                  />
                </div>
              )}
            </Tabs>
          ) : viewMode === 'edit-deal' && editingTrade ? (
            <>
              <DetailDrawerHeader className="relative">
                <div className="flex w-full flex-col gap-md">
                  <div className="flex w-full items-center justify-between gap-md">
                    <div className="flex flex-1 min-w-0 items-center gap-sm pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 -ml-2"
                        onClick={handleBackToBot}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <DetailDrawerTitle className="text-balance text-2xl leading-tight sm:text-3xl">
                        Edit Deal
                      </DetailDrawerTitle>
                    </div>

                    <div className="flex shrink-0 items-center gap-xs sm:gap-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label="Close drawer"
                        onClick={handleDrawerClose}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </DetailDrawerHeader>

              <DetailDrawerBody className="px-0 py-0">
                <DealEditDrawer
                  open
                  onClose={handleBackToBot}
                  trade={editingTrade}
                  inline
                >
                  <div />
                </DealEditDrawer>
              </DetailDrawerBody>
            </>
          ) : (
            <>
              <DetailDrawerHeader className="relative">
                <div className="flex w-full flex-col gap-md">
                  <div className="flex w-full items-center justify-between gap-md">
                    <div className="flex flex-1 min-w-0 items-center gap-sm pr-4">
                      {selectedTrade && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 -ml-2"
                          onClick={handleBackToBot}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back
                        </Button>
                      )}
                      <DetailDrawerTitle className="text-balance text-2xl leading-tight sm:text-3xl">
                        {selectedTrade
                          ? typeof selectedTrade.symbol === 'string'
                            ? selectedTrade.symbol
                            : selectedTrade.symbol.symbol
                          : bot.settings.name}
                      </DetailDrawerTitle>
                      {!selectedTrade && (
                        <StaleIndicator
                          componentId={`bot-details-${bot._id}`}
                          className="ml-2"
                        />
                      )}
                      {selectedTrade && (
                        <StatusChip
                          status={selectedTrade.status}
                          size="xs"
                          chipStyle="soft"
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-xs sm:gap-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label="Close drawer"
                        onClick={handleDrawerClose}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </DetailDrawerHeader>

              {isMobile && selectedTrade ? (
                <Tabs
                  defaultValue="details"
                  className="flex flex-col flex-1 min-h-0 overflow-hidden"
                >
                  <div className="px-4 pt-3 pb-2 shrink-0">
                    <TabsList>
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="chart">Chart</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent
                    value="details"
                    className="flex-1 min-h-0 overflow-auto px-4 py-5 custom-scrollbar mt-0"
                  >
                    <motion.div
                      key="trade-view"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <TradeDetailContent
                        trade={selectedTrade}
                        completedOrders={completedOrders}
                        pendingOrders={pendingOrders}
                        isLoadingOrders={isLoadingOrders}
                        chartOrders={chartOrders}
                        chartTransactions={chartTransactions}
                        {...(rawDeal?.pendingAddFunds && {
                          pendingAddFunds: rawDeal.pendingAddFunds,
                        })}
                        {...(rawDeal?.pendingReduceFunds && {
                          pendingReduceFunds: rawDeal.pendingReduceFunds,
                        })}
                      />
                    </motion.div>
                    {/* Spacer so the last item clears the floating bottom nav. */}
                    <div
                      aria-hidden="true"
                      className="h-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
                    />
                  </TabsContent>
                  <TabsContent
                    value="chart"
                    className="flex-1 min-h-0 mt-0 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
                  >
                    <UnfoldingChartPanel
                      botId={bot._id}
                      bot={bot}
                      enabled
                      className="h-full"
                      overrideSymbol={dealSymbol}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <DetailDrawerBody className="px-4 py-5 sm:px-6 sm:py-6">
                  {selectedTrade && (
                    <motion.div
                      key="trade-view"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5 sm:space-y-lg"
                    >
                      <TradeDetailContent
                        trade={selectedTrade}
                        completedOrders={completedOrders}
                        pendingOrders={pendingOrders}
                        isLoadingOrders={isLoadingOrders}
                        chartOrders={chartOrders}
                        chartTransactions={chartTransactions}
                        {...(rawDeal?.pendingAddFunds && {
                          pendingAddFunds: rawDeal.pendingAddFunds,
                        })}
                        {...(rawDeal?.pendingReduceFunds && {
                          pendingReduceFunds: rawDeal.pendingReduceFunds,
                        })}
                      />
                    </motion.div>
                  )}
                </DetailDrawerBody>
              )}
            </>
          )}

          {/* Footer removed - all actions moved to header 3-dot menu */}
        </DetailDrawerContent>

        {/* Modals */}
        <BotStatusConfirmationModal
          open={statusModalOpen}
          onOpenChange={setStatusModalOpen}
          onConfirm={handleConfirmStatusChange}
          botName={bot.settings.name}
          currentStatus={bot.status}
          targetStatus={getTargetStatus(bot.status)}
          hasActiveDeals={((bot as DCABot)?.dealsInBot?.active || 0) > 0}
          botType={isGrid ? BotTypesEnum.grid : undefined}
          gridFutures={isGrid ? isFuturesExchange(bot.exchange) : undefined}
          gridHasOpenPosition={
            isGrid ? ((bot as GridBot).position?.price ?? 0) !== 0 : undefined
          }
          gridIsShort={
            isGrid
              ? (bot as GridBot).position?.side === PositionSide.SHORT
              : undefined
          }
          isLoading={statusToggleMutation.isPending}
        />

        <DeleteConfirmationModal
          open={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          onConfirm={handleConfirmDelete}
          title="Delete Bot"
          description="Are you sure you want to delete this bot? This action cannot be undone."
          itemName={bot.settings.name}
          itemType="bot"
          additionalInfo={{
            activeDeals: (bot as DCABot)?.dealsInBot?.active || 0,
            totalValue: (bot as DCABot)?.usage?.current?.quote || 0,
            currency: Array.isArray((bot as DCABot)?.symbol)
              ? (bot as DCABot).symbol[0]?.value?.quoteAsset || 'USDT'
              : 'USDT',
            lastActivity: bot.created || 'Unknown',
          }}
          isLoading={deleteMutation.isPending}
          requireConfirmation={false}
        />

        <SuccessFeedbackModal
          open={successModalOpen}
          onOpenChange={setSuccessModalOpen}
          type={successData?.type || 'clone'}
          itemName={bot.settings.name}
          itemType="bot"
          newItemId={successData?.newItemId || undefined}
          details={
            successData?.type === 'clone'
              ? {
                  originalName: bot.settings.name,
                  newName: `${bot.settings.name} (Clone)`,
                  botTypeId: successData?.botTypeId ?? type,
                }
              : undefined
          }
        />

        {/* Share dialog — only mounted for the bot's owner.
            ShareBotDialog handles the toggle mutation + URL build. */}
        {isOwner && (
          <ShareBotDialog
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            botId={actionBotId}
            botName={bot.settings.name}
            botType={type}
            initialShareEnabled={
              (bot as DCABot & { share?: boolean }).share ?? false
            }
            initialShareId={
              (bot as DCABot & { shareId?: string | null }).shareId ?? null
            }
          />
        )}
      </DetailDrawer>
    );
  }
);
