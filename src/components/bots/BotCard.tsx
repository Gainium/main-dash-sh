import { cardHoverVariants } from '@/lib/animations/variants';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  /*  DCADealStatusEnum, */
  type AdditionalBotData,
  type Bot,
  type BotStats,
  type BotStatus,
  type ComboBot,
  type DCABot,
} from '@/types';
import { buildBotEditRoute, buildBotViewRoute } from '@/utils/bots/navigation';
import {
  getActionPastTense,
  getTargetStatus,
  isBotActive,
} from '@/utils/botStatusUtils';
import { motion } from 'framer-motion';
import { ExternalLink, MoreVertical } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useBotClone,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from '../../hooks/useBotMutations';
import { useChartColors } from '../../hooks/useChartColors';
import logger from '../../lib/loggerInstance';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '../modals';
import { Button } from '../ui/button';
// Use a plain container for the bot card to avoid nested Card components
// Avoid using the shared Card here to prevent nested cards; use a plain div instead
import {
  BotTypeChip,
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
  StrategyChip,
  TimeChip,
} from '../ui/chip';
import { DropdownMenu, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { DualArcProgressGauge } from '../ui/DualArcProgressGauge';
import CoinPair from '../widgets/shared/CoinPair';
import { BotActionsMenuItems } from './BotActionsMenuItems';
/* import { useBotSpecificDeals } from '@/hooks/useBotSpecificDeals'; */

// Common bot interface that covers DCA, Combo, Hedge, etc.
type BotLike = (DCABot | ComboBot | Bot) & AdditionalBotData; /* {
  id: string;
  name: string;
  type: 'signal' | 'grid' | 'dca' | 'combo';
  exchange: string;
  symbol: string;
  profit: number;
  profitUsd: number;
  totalProfitUsd?: number; // Add missing property
  pnlPercent: number;
  totalProfitPercent?: number; // Add missing property
  invested: number;
  investedUsd: number;
  runtime: string;
  status: 'active' | 'paused' | 'stopped' | 'error';
  scanner: string;
  color: string;
  // Additional optional properties used by different bot types
  exchangeUUID?: string;
  pair?: string;
  symbols?: string[];
  coinPair?: string;
  strategy?: string;
  dailyProfit?: number;
  avgDaily?: number;
  avgDailyPerc?: number;
  annualizedReturn?: number;
  usage?: number;
  unrealizedPnl?: number;
  unrealizedPnlUsd?: number;
  unrealizedPnlPercent?: number;
  uPnL?: number;
  openTrades?: number;
  closedTrades?: number;
  value?: number;
  // For usage calculations
  currentCost?: number;
  maxCost?: number;
  currentBaseUsage?: number;
  maxBaseUsage?: number;
  // New gauge fields
  outerGaugePercent?: number;
  innerGaugePercent?: number;
  isLongStrategy?: boolean;
  // Raw data access for chart data
  rawData?: {
    stats?: {
      chart?: Array<{
        equity: number;
        time: number;
      }>;
    };
  };
} */

type BaseBotCardProps = {
  item: BotLike; // Use the specific bot interface
  index: number;
  onClick?: (bot: BotLike) => void;
  isSelected?: boolean;
  // Add original bot data to access baseAsset/quoteAsset
  //originalBotData?: DCABot | undefined;
  privacyMode?: boolean;
  type: BotTypesEnum;
};

interface BotCardProps extends BaseBotCardProps {
  //botDealsOverride?: DCADeals[];
  // Optional hedge-aware status toggle override
  onToggleStatus?: (
    bot: BotLike,
    targetStatus: BotStatus,
    closeType?: string
  ) => Promise<void> | void;
  isTogglingStatus?: boolean;
}

/* interface BotCardComponentProps extends BotCardProps {
  botDeals: DCADeals[];
} */

const BotCardComponent: React.FC</* BotCardComponentProps */ BotCardProps> = ({
  type,
  item: bot,
  onClick,
  isSelected = false,
  index,
  //bot,
  /* botDeals, */
  onToggleStatus,
  isTogglingStatus,
  privacyMode = false,
}) => {
  const colors = useChartColors();
  const navigate = useNavigate();

  const statsChart = useMemo(() => (bot.stats as BotStats)?.chart, [bot.stats]);

  // Process equity data from backend stats, fallback to bot deals if needed
  const equityChartData = useMemo(() => {
    if (Array.isArray(statsChart) && statsChart.length > 0) {
      // Sanitize and sort incoming points: accept number or string timestamps; drop invalid points
      const sanitized = statsChart
        .map((point) => {
          const t =
            typeof point.time === 'number'
              ? point.time
              : Date.parse(String(point.time));
          const timeMs = Number.isFinite(t) ? t : NaN;
          const eqNum = Number(point.equity);
          const equity = Number.isFinite(eqNum) ? eqNum : NaN;
          return { time: timeMs, equity };
        })
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.equity))
        .sort((a, b) => (a.time as number) - (b.time as number));

      return sanitized.map((p) => ({
        time: p.time as number,
        equity: p.equity as number,
        formattedTime: new Date(p.time as number).toLocaleDateString(),
      }));
    }

    /*  if (!botDeals || botDeals.length === 0) return [];

    // Filter completed deals with profit data
    const completedDeals = botDeals.filter(
      (deal) =>
        deal.status === DCADealStatusEnum.closed &&
        deal.profit?.totalUsd !== undefined
    );

    if (completedDeals.length === 0) return [];

    // Sort deals by creation time
    const sortedDeals = [...completedDeals].sort(
      (a, b) =>
        new Date(a.createTime).getTime() - new Date(b.createTime).getTime()
    );

    // Calculate running equity (cumulative profit over time)
    let runningTotal = 0;
    const chartData = sortedDeals
      .map((deal) => {
        const dealProfit = deal.profit?.totalUsd ?? 0;
        runningTotal += dealProfit;
        const timestamp = new Date(deal.createTime).getTime();
        if (!Number.isFinite(timestamp)) return null;
        return {
          time: timestamp,
          equity: runningTotal,
          formattedTime: new Date(timestamp).toLocaleDateString(),
        };
      })
      .filter(
        (p): p is { time: number; equity: number; formattedTime: string } =>
          Boolean(p)
      );

    return chartData; */
    return [];
  }, [statsChart /* , botDeals */]);

  // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    type: 'clone' | 'delete';
    newItemId?: string;
    botTypeId?: string;
  } | null>(null);

  // Bot mutations
  const _botTypeEnum = (() => {
    const t = bot.type as string;
    switch (t) {
      case 'combo':
        return BotTypesEnum.combo;
      case 'grid':
        return BotTypesEnum.grid;
      case 'hedgeCombo':
        return BotTypesEnum.hedgeCombo;
      case 'hedgeDca':
        return BotTypesEnum.hedgeDca;
      default:
        return BotTypesEnum.dca;
    }
  })();
  const statusToggleMutation = useBotStatusToggle(_botTypeEnum);
  const restartMutation = useBotRestart();
  const cloneMutation = useBotClone();
  const deleteMutation = useBotDelete();

  // Helper function to determine gauge color based on percentage
  const getGaugeColor = (percentage: number): string => {
    const roundedPercentage = Math.round(percentage);
    if (roundedPercentage >= 100) return colors.destructive; // Error color for 100%
    if (roundedPercentage > 80) return colors.warning; // Caution color for >80%
    return colors.success; // Default success color
  };

  // Helper function to format time to show only the biggest unit
  const formatTimeToBiggestUnit = (timeStr: string): string => {
    if (!timeStr) return '0d';

    // Parse different formats like "2d 23h", "45m", "1h 30m", etc.
    const timeRegex = /(\d+)([dhms])/g;
    const matches = [...timeStr.matchAll(timeRegex)];

    if (matches.length === 0) return timeStr;

    // Find the biggest unit (d > h > m > s)
    const unitPriority = { d: 4, h: 3, m: 2, s: 1 };
    let biggestMatch = matches[0];

    for (const match of matches) {
      if (
        unitPriority[match[2] as keyof typeof unitPriority] >
        unitPriority[biggestMatch[2] as keyof typeof unitPriority]
      ) {
        biggestMatch = match;
      }
    }

    return `${biggestMatch[1]}${biggestMatch[2]}`;
  };

  // Mobile-only: reveal action chip via long-press or swipe-left.
  // On desktop the chip is hover/focus driven via group-hover classes.
  const cardRef = useRef<HTMLDivElement>(null);
  const [actionsRevealed, setActionsRevealed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suppressClickRef = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    suppressClickRef.current = false;
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      setActionsRevealed(true);
      suppressClickRef.current = true;
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress();
    if (dx < -30 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setActionsRevealed(true);
      suppressClickRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
    touchStartRef.current = null;
  };

  useEffect(() => {
    if (!actionsRevealed) return;
    const handler = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setActionsRevealed(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [actionsRevealed]);

  useEffect(() => () => cancelLongPress(), []);

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (onClick) {
      onClick(bot);
    }
  };

  // Real bot actions
  const handleEdit = () => {
    navigate(buildBotEditRoute(type, bot.id));
  };

  const handleClone = () => {
    logger.info('[BotCard] Clone clicked:', {
      botId: bot.id,
      botName: bot.name,
      mutationLoading: cloneMutation.isPending,
    });

    // Parity with legacy: clone opens an unsaved, pre-filled create form so
    // the exchange (and everything else) is still editable before saving.
    // Landing on the edit page instead locks the exchange (`isExchangeLocked
    // = !!id`), which is the regression users hit when cloning combo/grid.
    if (type === BotTypesEnum.dca) {
      navigate(`/bot/new?load=${bot.id}`);
      return;
    }
    if (type === BotTypesEnum.combo) {
      navigate(`/combo/new?load=${bot.id}`);
      return;
    }
    if (type === BotTypesEnum.grid) {
      navigate(`/grid/new?load=${bot.id}`);
      return;
    }

    cloneMutation.mutate(
      {
        id: bot.id,
        name: `${bot.name} (Clone)`,
        botData: bot as DCABot,
        type,
      },
      {
        onSuccess: (data) => {
          logger.info('[BotCard] Clone success:', data);
          setSuccessData({
            type: 'clone',
            newItemId: data?._id || `clone_${Date.now()}`,
            botTypeId: bot.type,
          });
          setSuccessModalOpen(true);
        },
        onError: (error) => {
          console.error('[BotCard] Clone error:', error);
        },
      }
    );
  };

  const handleStatusToggle = () => {
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = (closeType?: string) => {
    // Check if bot is currently active (using centralized utility)
    const isActive = isBotActive(bot.status);
    const newStatus = getTargetStatus(bot.status);

    logger.info('[BotCard] Status toggle confirmed:', {
      botId: bot.id,
      currentStatus: bot.status,
      isActive,
      newStatus,
      closeType,
      mutationLoading: statusToggleMutation.isPending,
    });

    if (onToggleStatus) {
      Promise.resolve(onToggleStatus(bot, newStatus, closeType))
        .then(() => {
          setStatusModalOpen(false);
          toast.success(
            `Bot "${bot.name}" ${getActionPastTense(bot.status)} successfully`
          );
        })
        .catch((error) => {
          console.error('[BotCard] Status toggle failed (override):', error);
          toast.error(
            `Failed to ${isActive ? 'stop' : 'start'} bot "${bot.name}"`
          );
        });
      return;
    }

    statusToggleMutation.mutate(
      {
        id: bot.id,
        status: newStatus,
        closeType: closeType as CloseDCATypeEnum | undefined,
      },
      {
        onSuccess: () => {
          setStatusModalOpen(false);
          toast.success(
            `Bot "${bot.name}" ${getActionPastTense(bot.status)} successfully`
          );
        },
        onError: (error) => {
          console.error('[BotCard] Status toggle failed:', error);
          toast.error(
            `Failed to ${newStatus === 'open' ? 'start' : 'stop'} bot "${bot.name}"`
          );
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
        id: bot.id,
        type,
      },
      {
        onSuccess: () => {
          toast.success(`Bot "${bot.name}" restarted successfully`);
        },
        onError: () => {
          toast.error(`Failed to restart bot "${bot.name}"`);
        },
      }
    );
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: bot.id, type });
      setSuccessData({ type: 'delete' });
      setSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  };

  const currentValue = useMemo(
    () => +((type === BotTypesEnum.grid ? bot.value : bot.unPnl) || 0),
    [bot.unPnl, bot.value, type]
  );
  const valueChangePercent = useMemo(
    () =>
      +((type === BotTypesEnum.grid ? bot.valueChange : bot.unPnlPerc) || 0),
    [bot.valueChange, bot.unPnlPerc, type]
  );
  // True while the page is still waiting for a fresh price snapshot for this
  // bot's exchange. The displayed value during this window is a server-side
  // liveStats fallback (or 0 if the bot has no liveStats), and will refresh
  // to the locally-computed number once `latestPrices` populates.
  const valuePending = useMemo(
    () => Boolean(bot.isActive) && bot.loadedPrices === false,
    [bot.isActive, bot.loadedPrices]
  );
  const avgDaily = useMemo(() => bot.avgDaily || 0, [bot.avgDaily]);
  const avgDailyPerc = useMemo(() => bot.avgDailyPerc || 0, [bot.avgDailyPerc]);
  const annualizedReturn = useMemo(
    () => bot.annualizedReturn || 0,
    [bot.annualizedReturn]
  );
  const hasEquityData = useMemo(
    () => Boolean(equityChartData && equityChartData.length > 0),
    [equityChartData]
  );

  if (import.meta.env.DEV && hasEquityData && equityChartData) {
    logger.info(
      '[BotCard] Equity chart data (using bot-specific profit data):',
      {
        botId: bot.id,
        chartDataLength: equityChartData.length,
        samplePoint: equityChartData[0] || null,
        lastPoint: equityChartData[equityChartData.length - 1] || null,
        equityRange:
          equityChartData.length > 0
            ? {
                min: Math.min(...equityChartData.map((p) => p.equity)),
                max: Math.max(...equityChartData.map((p) => p.equity)),
              }
            : null,
      }
    );
  }

  return (
    <div
      ref={cardRef}
      className="p-1 w-full sm:max-w-sm max-w-[400px] overflow-visible"
    >
      <motion.div
        layoutId={`bot-card-${bot.id}`}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{
          duration: 0.4,
          delay: index * 0.05, // Much faster sequential timing
          ease: [0.34, 1.56, 0.64, 1], // Bouncy ease for more dynamic feel
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
        whileHover="hover"
        whileTap="tap"
        variants={cardHoverVariants}
        className={`p-0 cursor-pointer bg-transparent border-none rounded-lg group shadow-none transition-colors duration-200 min-h-[120px] touch-manipulation ${
          isSelected ? 'ring-2 ring-primary/20' : 'hover:bg-accent/5'
        }`}
        // allow the card's scale and shadow to overflow, so hover grow shows properly
        style={{ transformOrigin: 'center', overflow: 'visible' }}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Inner container — surface contrast (bg-muted vs page bg) does the
            separation; no border per the design system.
            Padding uses --spacing-* tokens so it shrinks in compact mode. */}
        <div
          data-slot="card"
          className="bg-muted rounded-lg p-sm md:p-md space-y-sm md:space-y-md transition-all duration-200"
        >
          {/* Header — name gets full width; chips flow with wrap.
                Floating actions slide in over the right edge on hover (desktop)
                or are always visible on mobile (matches WidgetWrapper pattern).
                No inner padding — outer card already provides spacing-aware padding. */}
          <div className="relative">
            {/* Floating actions pill — slides in from right, covers content
                rather than reserving space. */}
            <div
              className={cn(
                'absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border/60 bg-muted/95 px-1 py-0.5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out z-10',
                // Mobile: hidden by default; revealed by long-press or swipe-left
                actionsRevealed
                  ? 'opacity-100 translate-x-0 pointer-events-auto'
                  : 'opacity-0 translate-x-3 pointer-events-none',
                // Desktop: hover/focus on the card reveals (overrides mobile state above)
                'sm:opacity-0 sm:translate-x-3 sm:pointer-events-none sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:translate-x-0 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:translate-x-0'
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(buildBotViewRoute(type, bot.id), '_blank');
                }}
                aria-label="Open in new tab"
                className="shrink-0 p-1 rounded hover:bg-muted/60"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <BotActionsMenuItems
                  align="end"
                  className="w-56 z-50"
                  bot={{
                    id: bot.id,
                    name: bot.name,
                    type: type,
                    status: bot.status,
                  }}
                  pending={{
                    statusToggle: onToggleStatus
                      ? !!isTogglingStatus
                      : statusToggleMutation.isPending,
                    restart: restartMutation.isPending,
                    clone: cloneMutation.isPending,
                    delete: deleteMutation.isPending,
                  }}
                  onToggleStatus={() => {
                    handleStatusToggle();
                  }}
                  onRestart={() => handleRestart()}
                  onEdit={() => handleEdit()}
                  onClone={() => handleClone()}
                  onViewClosedTrades={() => navigate(`/trades?botId=${bot.id}`)}
                  onShareConfig={async () => {
                    try {
                      const source = bot ?? bot;
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
                    const base = {
                      name: `${bot.settings?.name || bot.name} (Live)`,
                      type: bot.type,
                      exchange: bot.exchange,
                      symbol: bot.pair,
                      settings: bot.settings || {},
                    };
                    try {
                      sessionStorage.setItem('botConfig', JSON.stringify(base));
                      navigate('/bot/new');
                    } catch (err) {
                      console.error(
                        'Failed to stage config for live trading:',
                        err
                      );
                      toast.error('Failed to stage configuration');
                    }
                  }}
                  onDelete={() => handleDelete()}
                />
              </DropdownMenu>
            </div>

            {/* Content — no right padding reservation. Floating pill covers
                the right edge on hover, not pushes content. */}
            <div className="space-y-2 min-w-0">
              {/* Row 1: status dot + bot name (full width) */}
              <div className="flex items-center gap-2 min-w-0">
                <StatusChip
                  status={bot.status}
                  size="xs"
                  dotOnly
                  className="shrink-0"
                  tooltip={
                    bot.status === 'error' &&
                    typeof bot.statusReason === 'string'
                      ? bot.statusReason
                      : undefined
                  }
                />
                <h3
                  className="text-xl font-bold text-card-foreground truncate flex-1 min-w-0"
                  title={bot.name}
                >
                  {bot.name}
                </h3>
              </div>

              {/* Chip row — flex-wrap so type/direction/pair flow inline when
                  they fit, and wrap to a new line only when they don't. */}
              <div className="flex items-center gap-2 flex-wrap">
                <BotTypeChip
                  botType={type}
                  size="xs"
                  chipStyle="soft"
                  className="shrink-0"
                />
                {bot.settings?.strategy && (
                  <StrategyChip
                    strategy={bot.settings.strategy}
                    size="xs"
                    chipStyle="solid"
                    className="shrink-0"
                  />
                )}
                <CoinPair
                  baseAsset={
                    bot.baseAsset ??
                    (Array.isArray(bot.symbol)
                      ? bot.symbol[0]?.value?.baseAsset
                      : bot.symbol?.baseAsset)
                  }
                  quoteAsset={
                    bot.quoteAsset ??
                    (Array.isArray(bot.symbol)
                      ? bot.symbol[0]?.value?.quoteAsset
                      : bot.symbol?.quoteAsset)
                  }
                  symbols={bot.settings?.pair ? [bot.settings.pair].flat() : []}
                  maxDisplay={1}
                  iconSize="sm"
                  showText={true}
                  layout="horizontal"
                  className="text-sm font-medium text-muted-foreground"
                />
              </div>
            </div>
          </div>

          {/* Main Content — no inner padding; outer card handles it. */}
          <div>
            {/* Usage, Value, and Profit Section */}
            {bot.usage !== undefined && (
              <div className="mb-4">
                <div className="flex items-start gap-3 mb-4">
                  {/* Left side - Usage gauge section (smaller) */}
                  <div className="shrink-0 w-20">
                    <div className="text-xs text-muted-foreground mb-2">
                      Usage
                    </div>
                    <DualArcProgressGauge
                      size={70}
                      outerPercentage={bot.usageTotal || 0}
                      innerPercentage={0}
                      outerProgressColor={getGaugeColor(bot.usageTotal || 0)}
                      innerProgressColor={colors.warning}
                      trailColor="var(--color-border)"
                      centerText={`${(bot.usageTotal || 0).toFixed(0)}%`}
                      label={
                        bot.type === BotTypesEnum.dca ||
                        bot.type === BotTypesEnum.combo
                          ? `${(bot as DCABot)?.dealsInBot?.active || 0}/${(bot as DCABot)?.dealsInBot?.all || 0}`
                          : ''
                      }
                      animate={true}
                      showInnerGauge={false}
                    />
                  </div>

                  {/* Middle - Value section (same as table view) */}
                  <div
                    className={cn(
                      'flex-1 min-w-0 transition-opacity',
                      valuePending && 'opacity-50 animate-pulse'
                    )}
                    title={
                      valuePending
                        ? 'Updating value with latest prices…'
                        : undefined
                    }
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      Value
                    </div>
                    <ProfitAndPerc
                      value={currentValue}
                      percentage={valueChangePercent}
                      privacyMode={privacyMode}
                      chipPosition="bottom"
                      size="md"
                    />
                  </div>

                  {/* Right side - Total Profit */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">
                      Total Profit
                    </div>
                    <ProfitAndPerc
                      value={bot.totalProfitUsd || 0}
                      percentage={bot.profitPerc || 0}
                      privacyMode={privacyMode}
                      chipPosition="bottom"
                      size="lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Equity Chart - Using bot-specific profit data (hidden for Grid bots) */}
            {bot.type !== 'grid' && (
              <div className="mb-6 h-16 relative" style={{ minHeight: '64px' }}>
                {hasEquityData ? (
                  <ResponsiveContainer width="100%" height={64}>
                    <AreaChart
                      data={equityChartData}
                      margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                    >
                      <defs>
                        <linearGradient
                          id={`equityGradient-${bot.id}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={colors.success}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={colors.success}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="formattedTime" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-popover rounded-lg shadow-lg p-2">
                                <p className="text-xs text-muted-foreground">
                                  {label}
                                </p>
                                <p className="text-sm font-semibold">
                                  Bot Equity: $
                                  {Number(payload[0]?.value || 0).toFixed(2)}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {/* Animation stays off: recharts' JavascriptAnimate
                          setStates from unmount cleanup, so a batch of cards
                          unmounting mid-animation crashes with React #185. */}
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke={colors.success}
                        strokeWidth={2}
                        fill={`url(#equityGradient-${bot.id})`}
                        name="Bot Equity"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-muted-foreground">
                      <div className="w-4 h-4 mx-auto mb-1 opacity-50 bg-muted rounded"></div>
                      <p className="text-xs">No data</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats Grid - Consistent with Drawer and Table */}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              {/* Grid bot specific fields */}
              {bot.type === 'grid' ? (
                <>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Budget
                    </div>
                    <div
                      className="text-card-foreground font-semibold text-sm truncate"
                      title={
                        privacyMode ? '***' : `$${(bot.budget || 0).toFixed(2)}`
                      }
                    >
                      {privacyMode ? '***' : `$${(bot.budget || 0).toFixed(2)}`}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Levels
                    </div>
                    <div className="text-card-foreground font-semibold text-sm truncate">
                      {((bot as Bot).levels?.active?.buy || 0) +
                        ((bot as Bot).levels?.active?.sell || 0)}{' '}
                      /{' '}
                      {((bot as Bot).levels?.all?.buy || 0) +
                        ((bot as Bot).levels?.all?.sell || 0)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Active / Total
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Transactions
                    </div>
                    <div className="text-card-foreground font-semibold text-sm truncate">
                      {((bot as Bot).transactionsCount?.buy || 0) +
                        ((bot as Bot).transactionsCount?.sell || 0)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Total Buy + Sell
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Value Change
                    </div>
                    <ProfitAndPerc
                      value={+(bot.valueChangeUsd || 0)}
                      percentage={+(bot.valueChange || 0)}
                      privacyMode={privacyMode}
                      chipPosition="bottom"
                      size="xs"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Avg Daily
                    </div>
                    <ProfitAndPerc
                      value={avgDaily}
                      percentage={avgDailyPerc}
                      privacyMode={privacyMode}
                      chipPosition="bottom"
                      size="xs"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Annualized
                    </div>
                    <ProfitLossPercChip value={annualizedReturn} size="xs" />
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Annual Return
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Cost
                    </div>
                    <div
                      className="text-card-foreground font-semibold text-sm truncate"
                      title={
                        privacyMode
                          ? '***'
                          : `$${(bot.currentValue || 0).toFixed(2)}`
                      }
                    >
                      {privacyMode
                        ? '***'
                        : `$${(bot.currentValue || 0).toFixed(2)}`}
                    </div>
                    <div className="text-muted-foreground text-xs truncate">
                      {privacyMode
                        ? '***'
                        : `Max: $${(bot.maxValue || 0).toFixed(2)}`}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Deals
                    </div>
                    <div className="text-card-foreground font-semibold text-sm truncate">
                      {(bot as DCABot)?.dealsInBot?.active || 0} /{' '}
                      {(bot as DCABot)?.dealsInBot?.all || 0}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Open / Total
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Avg Daily
                    </div>
                    <ProfitAndPerc
                      value={avgDaily}
                      percentage={avgDailyPerc}
                      privacyMode={privacyMode}
                      chipPosition="bottom"
                      size="xs"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Annualized
                    </div>
                    <ProfitLossPercChip value={annualizedReturn} size="xs" />
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Annual Return
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer with exchange chip and duration chip */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <ExchangeChip
                exchangeId={bot.exchangeUUID || bot.exchange}
                provider={bot.exchange}
                size="xs"
                chipStyle="ghost"
                layout="stacked"
              />
              <TimeChip
                time={formatTimeToBiggestUnit(bot.workingTime || '0d')}
                size="xs"
                chipStyle="ghost"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Bot"
        description="Are you sure you want to delete this bot? This action cannot be undone."
        itemName={bot.name}
        itemType="bot"
        additionalInfo={{
          activeDeals: (bot as DCABot)?.dealsInBot?.active || 0,
          totalValue: bot?.usage?.current?.quote || 0,
          currency: Array.isArray(bot.symbol)
            ? bot.symbol[0].value.quoteAsset
            : bot.symbol.quoteAsset,
          lastActivity: bot?.created || 'Unknown',
        }}
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
        details={
          successData?.type === 'clone'
            ? {
                originalName: bot.name,
                newName: `${bot.name} (Clone)`,
                botTypeId: successData?.botTypeId ?? bot.type,
              }
            : undefined
        }
      />

      <BotStatusConfirmationModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        onConfirm={handleConfirmStatusChange}
        botName={bot.name}
        currentStatus={bot.status}
        targetStatus={getTargetStatus(bot.status)}
        hasActiveDeals={((bot as DCABot)?.dealsInBot?.active || 0) > 0}
        isLoading={statusToggleMutation.isPending}
      />
    </div>
  );
};

const BotCardBase: React.FC<BotCardProps> = (props) => {
  const {
    /*  botDealsOverride, */ onToggleStatus,
    isTogglingStatus,
    ...baseProps
  } = props;
  const safeBaseProps = baseProps as BaseBotCardProps;

  const extraProps: Record<string, unknown> = {};
  if (onToggleStatus) {
    (extraProps['onToggleStatus'] as unknown) = onToggleStatus;
  }
  if (typeof isTogglingStatus === 'boolean') {
    (extraProps['isTogglingStatus'] as unknown) = isTogglingStatus;
  }

  return (
    <BotCardComponent {...(safeBaseProps as BotCardProps)} {...extraProps} />
  );
};

// Memoize BotCard to prevent unnecessary re-renders
export const BotCard = React.memo(BotCardBase, (prevProps, nextProps) => {
  // Early exit if basic properties don't match
  const propsEqual =
    prevProps.item.id === nextProps.item.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.index === nextProps.index &&
    prevProps.type === nextProps.type &&
    prevProps.privacyMode === nextProps.privacyMode;

  if (!propsEqual) {
    return false;
  }

  // Only update if these critical values actually changed significantly
  // Use loose comparison to ignore minor decimal changes from price feeds
  const statusChanged = prevProps.item.status !== nextProps.item.status;
  const profitChanged =
    Math.abs(
      Number(prevProps.item.totalProfitUsd ?? 0) -
        Number(nextProps.item.totalProfitUsd ?? 0)
    ) > 0.01; // Only if change is > $0.01
  const usageChanged =
    Math.abs(
      Number(prevProps.item.usage ?? 0) - Number(nextProps.item.usage ?? 0)
    ) > 0.5; // Only if change is > 0.5%
  const chartChanged =
    (prevProps.item?.stats as BotStats)?.chart !==
    (nextProps.item?.stats as BotStats)?.chart;
  // VALUE column source. Without these checks the card stays stale when the
  // unrealized P&L recomputes (e.g. once latestPrices populate), even though
  // the freshly-transformed `item` has the correct number — it gets skipped
  // because none of the other gated fields changed.
  const unPnlChanged =
    Math.abs(
      Number(prevProps.item.unPnl ?? 0) - Number(nextProps.item.unPnl ?? 0)
    ) > 0.01;
  const valueChanged =
    Math.abs(
      Number(prevProps.item.value ?? 0) - Number(nextProps.item.value ?? 0)
    ) > 0.01;
  const currentValueChanged =
    Math.abs(
      Number(prevProps.item.currentValue ?? 0) -
        Number(nextProps.item.currentValue ?? 0)
    ) > 0.01;

  // Toggling the price-loaded flag drives the "Updating value…" pending tint,
  // so the card has to re-render when it flips.
  const loadedPricesChanged =
    prevProps.item.loadedPrices !== nextProps.item.loadedPrices;

  if (
    statusChanged ||
    profitChanged ||
    usageChanged ||
    chartChanged ||
    unPnlChanged ||
    valueChanged ||
    currentValueChanged ||
    loadedPricesChanged
  ) {
    return false;
  }

  // Handle deals override
  /* if (prevProps.botDealsOverride || nextProps.botDealsOverride) {
    return prevProps.botDealsOverride === nextProps.botDealsOverride;
  } */

  // Props are effectively the same, skip rerender
  return true;
});
