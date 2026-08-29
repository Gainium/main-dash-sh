/* eslint-disable @typescript-eslint/no-explicit-any */
import { percentBasisFromDeal } from '@/types/dcaDeal';
import { tpSLConfig } from '@/utils/bots/dca/tpSlConfig';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { Activity, ExternalLink, Loader2, Play, Square } from 'lucide-react';
import EmptyState from '../components/ui/empty-state';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import { TradeDetailDrawer } from '../components/trades/TradeDetailDrawer';
import {
  DataTable,
  type BulkAction,
} from '../components/ui/data-table/data-table';
import BotListStatsBoxes from '../components/ui/BotListStatsBoxes';
import {
  combineBotListStats,
  computeBotListStats,
  usageCurrentUsd,
  usageMaxUsd,
  type BotForStats,
} from '../hooks/useBotListStats';
// No longer required; trades tab removed switch from UI
import {
  BotTypeChip,
  ExchangeChip,
  StatusChip,
  StrategyChip,
} from '../components/ui/chip';
import { useBotStatusToggle } from '../hooks/useBotMutations';
// useDealActions not currently used (placeholder)
import { buildBotViewRoute } from '@/utils/bots/navigation';
import { BotCard } from '../components/bots/BotCard';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import Widget from '../components/ui/widget';
import CoinPair from '../components/widgets/shared/CoinPair';
// Trades tab uses the shared OpenOrdersWidget (not the bot drawer deals table).
import OpenOrdersWidget, {
  type OpenTrade,
} from '../components/widgets/shared/OpenOrdersWidget';
import { CARD_VIEW_COLUMNS } from '../config/responsive';
import { useComboBots } from '../hooks/useComboBots';
import { useComboDeals } from '../hooks/useComboDeals';
import { useDcaBots } from '../hooks/useDcaBots';
import { useDcaDeals } from '../hooks/useDcaDeals';
import { useGridBots } from '../hooks/useGridBots';
/* import { useHedgeComboBots } from '../hooks/useHedgeComboBots';
import { useHedgeComboDeals } from '../hooks/useHedgeComboDeals';
import { useHedgeDcaBots } from '../hooks/useHedgeDcaBots';
import { useHedgeDcaDeals, type HedgeDcaDeal } from '../hooks/useHedgeDcaDeals'; */
import { isReadOnly } from '../lib/demoMode';
import { logger } from '../lib/loggerInstance';
import { toast } from '../lib/toast';
import { formatCurrency } from '../lib/utils';
import {
  calculateDealCost,
  calculateDealOuterGaugePercentage,
  calculateDealSize,
  calculateDealValue,
  calculatePnlPercentage,
  calculateUsagePercentage,
  dealWorkingMs,
} from '../lib/utils/tradingMetrics';
import { useUIStore } from '../stores/uiStore';
import { useBotStatsStore } from '../stores/live';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import {
  ACTIVE_ONLY_DEFAULT_STATUSES,
  dealStatusGroup,
} from '@/lib/utils/dealStatusFilter';
import { transformDcaBotToBot } from '@/types/dcaBot';
import type { BotStatus, DCADeals, Prices } from '../types';
import {
  type ComboBot,
  type DCABot,
  BotTypesEnum,
  DCADealStatusEnum,
  StrategyEnum,
} from '@/types';

// Types for trade data
interface TradeItem {
  id: string;
  type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  strategy: string;
  status: string;
  exchange: string;
  exchangeUUID?: string | undefined;
  botId?: string | undefined; // Added to support orders fetching
  botName?: string | undefined;
  currentBalance: {
    base: number;
    quote: number;
  };
  initialBalance?:
    | {
        base: number;
        quote: number;
      }
    | undefined;
  usage: {
    current: {
      base: number;
      quote: number;
    };
    currentUsd?: number | undefined;
    max?:
      | {
          base: number;
          quote: number;
        }
      | undefined;
    maxUsd?: number | undefined;
  };
  profit?:
    | {
        total: number;
        totalUsd: number;
        pureBase: number;
        pureQuote: number;
      }
    | undefined;
  funding?:
    | {
        total: number;
        totalUsd: number;
        lastTime?: number;
      }
    | undefined;
  unrealizedProfit?: number | undefined;
  avgPrice?: number | undefined;
  levels: {
    complete: number;
    all: number;
  };
  created?: number | undefined;
  /**
   * Deal end timestamps, carried so a CLOSED deal's Working Time can stop at
   * its close instead of counting on to now (bug #567). Absent on the grid-BOT
   * rows that also enter this list — for a bot, "trading time" legitimately
   * keeps running.
   */
  closeTime?: number | undefined;
  updateTime?: number | undefined;
  initialPrice?: number | undefined;
  // Gauge properties
  outerGaugePercent?: number;
  centerText?: string;
  showInnerGauge?: boolean;
  stats?: DCADeals['stats'];
  settings?: DCADeals['settings'];
  futures?: boolean;
  coinm?: boolean;
  note?: string;
}

const Trading: React.FC = () => {
  logger.debug('[Trades] Component mounting/rendering');

  // Get privacy mode state (selector to avoid re-renders on unrelated UI changes)
  const privacyMode = useUIStore((s) => s.privacyMode);
  const privacyModeRef = useRef(privacyMode);
  privacyModeRef.current = privacyMode;

  // State for filtering open/closed trades
  const [showClosedTrades] = useState(false);

  // State for selected trade drawer
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Subscribe to latest prices so combo/dca bot Value (unrealized PnL) can be
  // computed locally via transformDcaBotToBot — the backend leaves
  // liveStats.value at 0 for SHORT spot combos, so without prices the card
  // would display $0 even though /combo (which uses prices) shows a real
  // value. Throttled the same way ComboBots.tsx throttles its updates.
  const [latestPrices, setLatestPrices] = useState<Prices>(() =>
    getLocalPrices()
  );
  const lastPriceUpdateRef = useRef(0);
  const lastAcceptedPricesLengthRef = useRef(0);
  useEffect(() => {
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) {
        const now = Date.now();
        const since = now - lastPriceUpdateRef.current;
        const bypassThrottle =
          result.data.length > 0 &&
          (lastAcceptedPricesLengthRef.current === 0 ||
            result.data.length > lastAcceptedPricesLengthRef.current * 1.1);
        if (bypassThrottle || since > 10_000) {
          setLatestPrices(result.data);
          lastPriceUpdateRef.current = now;
          lastAcceptedPricesLengthRef.current = result.data.length;
        }
      }
    }, false);
    return unsubscribe;
  }, []);
  const liveBotStats = useBotStatsStore((state) => state.botStats);

  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const currentPaperContext = tradingMode === 'demo' ? true : !isLiveTrading;

  // Fetch all deal/trade data using new hooks
  // Note: paperContext is automatically derived from useUIStore in each hook
  const {
    deals: dcaDeals,
    isLoading: dcaLoading,
    isError: dcaError,
  } = useDcaDeals({ terminal: false, paperContext: currentPaperContext });

  const {
    deals: comboDeals,
    isLoading: comboLoading,
    isError: comboError,
  } = useComboDeals({ paperContext: currentPaperContext });

  /* const {
    deals: hedgeComboDeals,
    isLoading: hedgeComboLoading,
    isError: hedgeComboError,
  } = useHedgeComboDeals();

  const {
    deals: hedgeDcaDeals,
    isLoading: hedgeDcaLoading,
    isError: hedgeDcaError,
  } = useHedgeDcaDeals();
 */
  // Fetch terminal deals
  const {
    deals: terminalDeals,
    isLoading: terminalLoading,
    isError: terminalError,
  } = useDcaDeals({ terminal: true, paperContext: currentPaperContext });

  // Defensive split: ensure terminal deals never appear in DCA list even if
  // backend/query layer returns mixed records.
  const terminalDealIds = useMemo(() => {
    return new Set(
      (terminalDeals || [])
        .map((deal) => deal._id || deal.botId)
        .filter((id): id is string => Boolean(id))
    );
  }, [terminalDeals]);

  const dcaDealsOnly = useMemo(() => {
    return (dcaDeals || []).filter((deal) => {
      const dealId = deal._id || deal.botId;
      const directType = String(deal.type || '').toLowerCase();
      const hasTerminalSettings = Boolean(
        (deal.settings as { terminalDealType?: unknown } | undefined)
          ?.terminalDealType
      );
      const hasTerminalBotSettings = Boolean(
        deal.dcaBot?.settings?.terminalDealType
      );

      const isTerminalLike =
        directType === 'terminal' ||
        hasTerminalSettings ||
        hasTerminalBotSettings;

      if (isTerminalLike) {
        return false;
      }

      if (dealId && terminalDealIds.has(dealId)) {
        return false;
      }

      return true;
    });
  }, [dcaDeals, terminalDealIds]);

  // Fetch grid bots (these are different from deals)
  // Use dynamic status based on showClosedTrades state
  const gridBotStatus: BotStatus[] | undefined = showClosedTrades
    ? (['closed', 'error'] as BotStatus[]) // Only closed/error bots when showing closed trades
    : (['open', 'range', 'monitoring'] as BotStatus[]); // Only open bots when hiding closed trades

  const {
    bots: gridBotsForDeals,
    isLoading: gridLoading,
    isError: gridError,
  } = useGridBots({
    status: gridBotStatus,
    paperContext: currentPaperContext,
  });

  // Removed USD rate fetching; no local unrealized PnL calculation here

  // Check loading states – only show the full-page spinner on the very first
  // load when we have zero cached data from ANY source.  Once at least one
  // hook has resolved (or the store already has data), render the page
  // immediately so hooks resolving at different times don't cause flicker.
  const hasSomeData =
    (dcaDeals && dcaDeals.length > 0) ||
    (comboDeals && comboDeals.length > 0) ||
    (terminalDeals && terminalDeals.length > 0) ||
    (gridBotsForDeals && gridBotsForDeals.length > 0);

  const allHooksLoading =
    dcaLoading &&
    comboLoading &&
    /* hedgeComboLoading &&
    hedgeDcaLoading && */
    terminalLoading &&
    gridLoading;

  // Only block the UI when every hook is still loading AND we have nothing cached
  const isLoading = !hasSomeData && allHooksLoading;

  // Only show the error state when every hook errored (not just one)
  const hasError =
    dcaError &&
    comboError &&
    /* hedgeComboError &&
    hedgeDcaError && */
    terminalError &&
    gridError;

  // Helper function to calculate gauge values for deals (adapted from combo bot logic)
  type GaugeDeal = {
    usage?: {
      current?: { base?: number; quote?: number };
      max?: { base?: number; quote?: number };
      currentUsd?: number;
      maxUsd?: number;
    };
    strategy?: string;
    initialBalances?: { base?: number; quote?: number };
    currentBalances?: { base?: number; quote?: number };
    unrealizedProfit?: number;
  };
  const calculateDealGaugeValues = useCallback(
    (deal: GaugeDeal, unrealizedProfit?: number) => {
      const outerGaugePercent = calculateDealOuterGaugePercentage({
        strategy: deal.strategy,
        initialBalances: deal.initialBalances,
        currentBalances: deal.currentBalances,
        usage: deal.usage,
        min: 0,
        max: 200,
      });

      // Calculate unrealized PnL percentage for center text display
      const finalUnrealizedProfit =
        unrealizedProfit !== undefined
          ? unrealizedProfit
          : deal.unrealizedProfit || 0;
      const currentUsageUsd =
        deal.usage?.currentUsd || deal.usage?.current?.quote || 0;

      // Calculate unrealized PnL percentage (unrealizedProfit / currentUsageUsd)
      const unrealizedPnlPercent = calculatePnlPercentage(
        finalUnrealizedProfit,
        currentUsageUsd
      );

      // Format center text
      const centerText =
        finalUnrealizedProfit !== 0
          ? `${unrealizedPnlPercent >= 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2)}%`
          : '0%';

      return {
        outerGaugePercent,
        centerText,
        showInnerGauge: false, // Remove inner gauge as requested
      };
    },
    []
  );

  // Transform and combine all trade data (unfiltered)
  const allTradesUnfiltered = useMemo(() => {
    const trades: TradeItem[] = [];

    // No local price/USDRate usage for unrealized PnL; rely on hooks

    logger.debug('[Trades] Raw data:', {
      dcaDeals: dcaDealsOnly?.length || 0,
      comboDeals: comboDeals?.length || 0,
      /* hedgeComboDeals: hedgeComboDeals?.length || 0,
      hedgeDcaDeals: hedgeDcaDeals?.length || 0, */
      terminalDeals: terminalDeals?.length || 0,
      gridBots: gridBotsForDeals?.length || 0,
      sampleDcaDeals: dcaDealsOnly?.slice(0, 2) || [],
    });

    // Collect all deals for unrealized PnL calculation with source tracking
    type DealCalc = DCADeals & { dealSource?: string };
    const allDeals: DealCalc[] = [];

    // Add DCA deals
    if (dcaDealsOnly && dcaDealsOnly.length > 0) {
      // DCA deals handled directly below using hook-provided unrealizedUsd
    }

    // Add Combo deals
    if (comboDeals && comboDeals.length > 0) {
      comboDeals.forEach((deal) => {
        // Add debug logging to see what ID the deal has when added to allDeals
        logger.debug('[Trades] Adding combo deal to allDeals:', {
          dealObject: deal,
          dealId: deal._id,
          dealBotId: deal.botId,
          dealExchangeUUID: deal.exchangeUUID,
          availableKeys: Object.keys(deal),
        });
        allDeals.push({
          ...(deal as unknown as DCADeals),
          dealSource: 'Combo',
        });
        // No exchange tracking needed here
      });
    }

    // Add Hedge Combo deals
    /*  if (hedgeComboDeals && hedgeComboDeals.length > 0) {
      hedgeComboDeals.forEach((deal) => {
        allDeals.push({
          ...(deal as unknown as DCADeals),
          dealSource: 'HedgeCombo',
        });
        // No exchange tracking needed here
      });
    }

    // Add Hedge DCA deals
    if (hedgeDcaDeals && hedgeDcaDeals.length > 0) {
      hedgeDcaDeals.forEach((deal) => {
        allDeals.push({
          ...(deal as unknown as DCADeals),
          dealSource: 'HedgeDCA',
        });
        // No exchange tracking needed here
      });
    } */

    // Add Terminal deals
    if (terminalDeals && terminalDeals.length > 0) {
      terminalDeals.forEach((deal) => {
        allDeals.push({
          ...(deal as unknown as DCADeals),
          dealSource: 'Terminal',
        });
        // No exchange tracking needed here
      });
    }

    // Add Grid bots
    // No exchange tracking needed here
    // Removed local unrealized PnL calculation and mapping

    // Transform DCA deals using hook-provided unrealized
    if (dcaDealsOnly && dcaDealsOnly.length > 0) {
      dcaDealsOnly.forEach((deal, index: number) => {
        try {
          // Get calculated unrealized PnL using actual deal ID
          const actualDealId = deal._id || deal.botId;
          // Use hook-provided unrealizedUsd for parity with Treemap and single source of truth
          const hookUnrealized = (deal as { unrealizedUsd?: number })
            .unrealizedUsd;
          const unrealizedProfit =
            typeof hookUnrealized === 'number'
              ? hookUnrealized
              : (deal.stats.unrealizedProfit ?? 0);
          const displayAvg = (deal as { displayAvg?: number }).displayAvg;
          const avgPrice =
            Number.isFinite(displayAvg) && (displayAvg || 0) > 0
              ? displayAvg
              : deal.avgPrice;

          if (index === 0) {
            logger.debug('[Trades] Sample DCA deal transformation:', {
              actualDealId,
              finalUnrealizedProfit: unrealizedProfit,
              dealSymbol: deal.symbol?.symbol,
              dealCurrentBalances: deal.currentBalances,
              dealInitialBalances: deal.initialBalances,
              dealKeys: { _id: deal._id, botId: deal.botId },
              botName: deal.botName,
              dcaBotSettingsName: deal.dcaBot?.settings?.name,
            });
          }

          // Calculate gauge values for this deal (cast to compatible type)
          const gaugeValues = calculateDealGaugeValues(
            deal as unknown as GaugeDeal,
            unrealizedProfit
          );

          trades.push({
            id: actualDealId || `dca-${index}`,
            type: 'DCA',
            symbol: deal.symbol?.symbol || 'Unknown',
            ...(() => {
              const basis = percentBasisFromDeal(deal as never);
              return basis ? { percentBasis: basis } : {};
            })(),
            baseAsset: deal.symbol?.baseAsset || '',
            quoteAsset: deal.symbol?.quoteAsset || '',
            strategy: deal.strategy || 'DCA',
            status: deal.status || 'Unknown',
            exchange: deal.exchange || 'Unknown',
            exchangeUUID: deal.exchangeUUID,
            botId: deal.botId, // Add botId for orders fetching
            botName: deal.botName || undefined,
            currentBalance: {
              base: deal.currentBalances?.base || 0,
              quote: deal.currentBalances?.quote || 0,
            },
            initialBalance: deal.initialBalances
              ? {
                  base: deal.initialBalances.base || 0,
                  quote: deal.initialBalances.quote || 0,
                }
              : undefined,
            usage: {
              current: {
                base: deal.usage?.current?.base || 0,
                quote: deal.usage?.current?.quote || 0,
              },
              currentUsd: deal.usage?.currentUsd,
              max: deal.usage?.max
                ? {
                    base: deal.usage.max.base || 0,
                    quote: deal.usage.max.quote || 0,
                  }
                : undefined,
              maxUsd: deal.usage?.maxUsd,
            },
            unrealizedProfit,
            avgPrice,
            levels: {
              complete: deal.levels?.complete || 0,
              all: deal.levels?.all || 0,
            },
            initialPrice: deal.initialPrice,
            created: deal.createTime,
            // Carried so a CLOSED deal's Working Time can stop at its close
            // instead of counting on to now (bug #567) — see `dealWorkingMs`.
            closeTime: deal.closeTime,
            updateTime: deal.updateTime,
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
            stats: deal.stats,
            settings: deal.settings,
            futures: Boolean(deal.settings?.futures),
            coinm: Boolean(deal.settings?.coinm),
            note: deal.note,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming DCA deal:', error);
        }
      });
    }

    // Transform Combo deals
    if (comboDeals && comboDeals.length > 0) {
      comboDeals.forEach((deal, index: number) => {
        try {
          // Use hook-provided unrealizedUsd or fall back to backend stats
          const dealWithId = deal as unknown as Record<string, unknown>; // lightweight typing
          const actualDealId =
            deal._id ||
            deal.botId ||
            (dealWithId['id'] as string | undefined) ||
            (dealWithId['dealId'] as string | undefined) ||
            deal.exchangeUUID;
          const hookUnrealized = (deal as { unrealizedUsd?: number })
            .unrealizedUsd;
          const unrealizedProfit =
            typeof hookUnrealized === 'number'
              ? hookUnrealized
              : (deal.stats?.unrealizedProfit ?? 0);

          // Calculate gauge values for this deal (cast to compatible type)
          const gaugeValues = calculateDealGaugeValues(
            deal as unknown as DCADeals,
            unrealizedProfit
          );

          if (index === 0) {
            logger.debug('[Trades] Sample Combo deal transformation:', {
              actualDealId,
              finalUnrealizedProfit: unrealizedProfit,
              dealSymbol: deal.symbol?.symbol,
              allDealProperties: Object.keys(deal),
              exchangeUUID: deal.exchangeUUID,
              botName: deal.botName,
              dcaBotType: Array.isArray(deal.dcaBot)
                ? 'array'
                : typeof deal.dcaBot,
              dcaBotSettingsName: Array.isArray(deal.dcaBot)
                ? deal.dcaBot[0]?.settings?.name
                : deal.dcaBot?.settings?.name,
            });
          }

          trades.push({
            id: (actualDealId as string | undefined) || `combo-${index}`,
            type: 'Combo',
            symbol: deal.symbol?.symbol || 'Unknown',
            ...(() => {
              const basis = percentBasisFromDeal(deal as never);
              return basis ? { percentBasis: basis } : {};
            })(),
            baseAsset: deal.symbol?.baseAsset || '',
            quoteAsset: deal.symbol?.quoteAsset || '',
            strategy: deal.strategy || 'Combo',
            status: deal.status || 'Unknown',
            exchange: deal.dcaBot?.exchange || deal.exchangeUUID || 'Unknown',
            exchangeUUID: deal.exchangeUUID,
            botId: deal.botId, // Add botId for orders fetching
            botName: deal.botName || deal.dcaBot?.settings?.name || undefined,
            currentBalance: {
              base: deal.currentBalances?.base || 0,
              quote: deal.currentBalances?.quote || 0,
            },
            initialBalance: deal.initialBalances
              ? {
                  base: deal.initialBalances.base || 0,
                  quote: deal.initialBalances.quote || 0,
                }
              : undefined,
            usage: {
              current: {
                base: deal.usage?.current?.base || 0,
                quote: deal.usage?.current?.quote || 0,
              },
              currentUsd: deal.usage?.current?.quote || 0, // Fallback since ComboDeal doesn't have currentUsd
              max: deal.usage?.max
                ? {
                    base: deal.usage.max.base || 0,
                    quote: deal.usage.max.quote || 0,
                  }
                : undefined,
              maxUsd: deal.usage?.max?.quote || 0, // Fallback since ComboDeal doesn't have maxUsd
            },
            profit: {
              total: deal.profit?.total || 0,
              totalUsd: deal.profit?.totalUsd || 0,
              pureBase: deal.profit?.pureBase || 0,
              pureQuote: deal.profit?.pureQuote || 0,
            },
            unrealizedProfit,
            avgPrice: deal.avgPrice,
            levels: {
              complete: deal.levels?.complete || 0,
              all: deal.levels?.all || 0,
            },
            initialPrice: deal.initialPrice,
            created: deal.createTime,
            // Carried so a CLOSED deal's Working Time can stop at its close
            // instead of counting on to now (bug #567) — see `dealWorkingMs`.
            closeTime: deal.closeTime,
            updateTime: deal.updateTime,
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
            stats: deal.stats,
            settings: deal.settings,
            futures: Boolean(deal.settings?.futures),
            coinm: Boolean(deal.settings?.coinm),
            note: deal.note,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming Combo deal:', error);
        }
      });
    }

    // Transform Hedge Combo deals
    /* if (hedgeComboDeals && hedgeComboDeals.length > 0) {
      hedgeComboDeals.forEach((deal, index: number) => {
        try {
          // No local unrealized PnL calculation; set to 0
          const actualDealId = deal._id || deal.botId;
          const unrealizedProfit = 0;

          // Calculate gauge values for this deal (cast to compatible type)
          const gaugeValues = calculateDealGaugeValues(
            deal as unknown as DCADeals,
            unrealizedProfit
          );

          trades.push({
            id: actualDealId || `hedge-combo-${index}`,
            type: 'Hedge Combo',
            symbol: deal.symbol?.symbol || 'Unknown',
            ...(() => {
              const basis = percentBasisFromDeal(deal as never);
              return basis ? { percentBasis: basis } : {};
            })(),
            strategy: deal.strategy || 'Hedge Combo',
            status: deal.status || 'Unknown',
            exchange: deal.dcaBot?.exchange || deal.exchangeUUID || 'Unknown',
            exchangeUUID: deal.exchangeUUID,
            botId: deal.botId, // Add botId for orders fetching
            botName: deal.botName || deal.dcaBot?.settings?.name || undefined,
            currentBalance: {
              base: deal.currentBalances?.base || 0,
              quote: deal.currentBalances?.quote || 0,
            },
            initialBalance: deal.initialBalances
              ? {
                  base: deal.initialBalances.base || 0,
                  quote: deal.initialBalances.quote || 0,
                }
              : undefined,
            usage: {
              current: {
                base: deal.usage?.current?.base || 0,
                quote: deal.usage?.current?.quote || 0,
              },
              currentUsd: deal.usage?.current?.quote || 0, // Fallback since HedgeComboDeal doesn't have currentUsd
              max: deal.usage?.max
                ? {
                    base: deal.usage.max.base || 0,
                    quote: deal.usage.max.quote || 0,
                  }
                : undefined,
              maxUsd: deal.usage?.max?.quote || 0, // Fallback since HedgeComboDeal doesn't have maxUsd
            },
            profit: deal.profit
              ? {
                  total: deal.profit.total,
                  totalUsd: deal.profit.totalUsd,
                  pureBase: deal.profit.pureBase,
                  pureQuote: deal.profit.pureQuote,
                }
              : undefined,
            unrealizedProfit,
            avgPrice: deal.avgPrice,
            levels: {
              complete: deal.levels?.complete || 0,
              all: deal.levels?.all || 0,
            },
            initialPrice: deal.initialPrice,
            created: deal.createTime,
            // Carried so a CLOSED deal's Working Time can stop at its close
            // instead of counting on to now (bug #567) — see `dealWorkingMs`.
            closeTime: deal.closeTime,
            updateTime: deal.updateTime,
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming Hedge Combo deal:', error);
        }
      });
    } */

    // Transform Hedge DCA deals
    /* if (hedgeDcaDeals && hedgeDcaDeals.length > 0) {
      hedgeDcaDeals.forEach((deal: HedgeDcaDeal, index: number) => {
        try {
          // No local unrealized PnL; fall back to hedgeDcaDeal profit
          const actualDealId = deal._id || deal.botId;
          const unrealizedProfit = deal.profit?.totalUsd || 0;

          // Calculate gauge values for this deal (cast to compatible type)
          const gaugeValues = calculateDealGaugeValues(
            deal as unknown as DCADeals,
            unrealizedProfit
          );

          trades.push({
            id: actualDealId || `hedge-dca-${index}`,
            type: 'Hedge DCA',
            symbol: deal.symbol?.symbol || 'Unknown',
            ...(() => {
              const basis = percentBasisFromDeal(deal as never);
              return basis ? { percentBasis: basis } : {};
            })(),
            strategy: deal.strategy || 'Hedge DCA',
            status: deal.status || 'Unknown',
            exchange: deal.dcaBot?.exchange || deal.exchangeUUID || 'Unknown',
            exchangeUUID: deal.exchangeUUID,
            botId: deal.botId, // Add botId for orders fetching
            botName: deal.botName || deal.dcaBot?.settings?.name || undefined,
            currentBalance: {
              base: deal.currentBalances?.base || 0,
              quote: deal.currentBalances?.quote || 0,
            },
            initialBalance: deal.initialBalances
              ? {
                  base: deal.initialBalances.base || 0,
                  quote: deal.initialBalances.quote || 0,
                }
              : undefined,
            usage: {
              current: {
                base: deal.usage?.current?.base || 0,
                quote: deal.usage?.current?.quote || 0,
              },
              currentUsd: deal.usage?.current?.quote || 0, // Fallback since HedgeDcaDeal doesn't have currentUsd
              max: deal.usage?.max
                ? {
                    base: deal.usage.max.base || 0,
                    quote: deal.usage.max.quote || 0,
                  }
                : undefined,
              maxUsd: deal.usage?.max?.quote || 0, // Fallback since HedgeDcaDeal doesn't have maxUsd
            },
            profit: deal.profit?.totalUsd
              ? {
                  total: deal.profit.total || 0,
                  totalUsd: deal.profit.totalUsd,
                  pureBase: deal.profit.pureBase || 0,
                  pureQuote: deal.profit.pureQuote || 0,
                }
              : undefined,
            unrealizedProfit,
            avgPrice: deal.avgPrice,
            levels: {
              complete: deal.levels?.complete || 0,
              all: deal.levels?.all || 0,
            },
            initialPrice: deal.initialPrice,
            created: deal.createTime,
            // Carried so a CLOSED deal's Working Time can stop at its close
            // instead of counting on to now (bug #567) — see `dealWorkingMs`.
            closeTime: deal.closeTime,
            updateTime: deal.updateTime,
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming Hedge DCA deal:', error);
        }
      });
    } */

    // Transform Terminal deals using hook-provided unrealized (likely zero for closed)
    if (terminalDeals && terminalDeals.length > 0) {
      terminalDeals.forEach((deal: DCADeals, index: number) => {
        try {
          // Get calculated unrealized PnL using actual deal ID
          const actualDealId = deal._id || deal.botId;
          // Terminal deals are typically closed; hook returns undefined for inactive -> default to 0
          const hookUnrealized = (deal as { unrealizedUsd?: number })
            .unrealizedUsd;
          const unrealizedProfit =
            typeof hookUnrealized === 'number'
              ? hookUnrealized
              : (deal.stats.unrealizedProfit ?? 0);
          const displayAvg = (deal as { displayAvg?: number }).displayAvg;
          const avgPrice =
            Number.isFinite(displayAvg) && (displayAvg || 0) > 0
              ? displayAvg
              : deal.avgPrice;

          // Calculate gauge values for this deal (cast to compatible type)
          const gaugeValues = calculateDealGaugeValues(
            deal as unknown as GaugeDeal,
            unrealizedProfit
          );

          trades.push({
            id: actualDealId || `terminal-${index}`,
            type: 'Terminal',
            symbol: deal.symbol?.symbol || 'Unknown',
            ...(() => {
              const basis = percentBasisFromDeal(deal as never);
              return basis ? { percentBasis: basis } : {};
            })(),
            baseAsset: deal.symbol?.baseAsset || '',
            quoteAsset: deal.symbol?.quoteAsset || '',
            strategy: deal.strategy || 'Terminal',
            status: deal.status || 'Unknown',
            exchange: deal.exchange || 'Unknown',
            botId: deal.botId, // Add botId for orders fetching
            botName: deal.botName || undefined,
            currentBalance: {
              base: deal.currentBalances?.base || 0,
              quote: deal.currentBalances?.quote || 0,
            },
            initialBalance: deal.initialBalances
              ? {
                  base: deal.initialBalances.base || 0,
                  quote: deal.initialBalances.quote || 0,
                }
              : undefined,
            usage: {
              current: {
                base: deal.usage?.current?.base || 0,
                quote: deal.usage?.current?.quote || 0,
              },
              currentUsd: deal.usage?.currentUsd,
              max: deal.usage?.max
                ? {
                    base: deal.usage.max.base || 0,
                    quote: deal.usage.max.quote || 0,
                  }
                : undefined,
              maxUsd: deal.usage?.maxUsd,
            },
            profit: deal.profit
              ? {
                  total: deal.profit.total,
                  totalUsd: deal.profit.totalUsd,
                  pureBase: deal.profit.pureBase || 0,
                  pureQuote: deal.profit.pureQuote || 0,
                }
              : undefined,
            unrealizedProfit,
            avgPrice,
            levels: {
              complete: deal.levels?.complete || 0,
              all: deal.levels?.all || 0,
            },
            initialPrice: deal.initialPrice,
            created: deal.createTime,
            // Carried so a CLOSED deal's Working Time can stop at its close
            // instead of counting on to now (bug #567) — see `dealWorkingMs`.
            closeTime: deal.closeTime,
            updateTime: deal.updateTime,
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
            stats: deal.stats,
            settings: deal.settings,
            futures: Boolean(deal.settings?.futures),
            coinm: Boolean(deal.settings?.coinm),
            note: deal.note,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming Terminal deal:', error);
        }
      });
    }

    // Transform Grid bots
    if (gridBotsForDeals && gridBotsForDeals.length > 0) {
      gridBotsForDeals.forEach((bot) => {
        try {
          // For Grid bots, we need to create a compatible deal object for gauge calculations
          const dealForGauge: Partial<DCADeals> & {
            usage?: {
              current: { base: number; quote: number };
              currentUsd?: number;
              max?: { base: number; quote: number };
              maxUsd?: number;
            };
            unrealizedProfit?: number;
          } = {
            botId: bot._id,
            status:
              bot.status === 'open' ||
              bot.status === 'range' ||
              bot.status === 'monitoring'
                ? DCADealStatusEnum.open
                : bot.status === 'closed' || bot.status === 'error'
                  ? DCADealStatusEnum.closed
                  : DCADealStatusEnum.start,
            currentBalances: {
              base: bot.currentBalances?.base || 0,
              quote: bot.currentBalances?.quote || 0,
            },
            usage: {
              current: {
                base: bot.assets?.used?.base || 0,
                quote: bot.assets?.used?.quote || 0,
              },
              currentUsd: bot.assets?.used?.quote || 0,
              max: {
                base: bot.assets?.used?.base || 0,
                quote: bot.assets?.used?.quote || 0,
              },
              maxUsd: bot.assets?.used?.quote || 0,
            },
            strategy: StrategyEnum.long,
            unrealizedProfit: 0,
          };

          // Calculate gauge values for this bot
          const gaugeValues = calculateDealGaugeValues(dealForGauge);

          trades.push({
            id: `grid-${bot._id}`,
            type: 'Grid',
            symbol: bot.symbol?.symbol || 'Unknown',
            baseAsset: bot.symbol?.baseAsset || '',
            quoteAsset: bot.symbol?.quoteAsset || '',
            strategy: 'Grid Trading',
            status: bot.status || 'Unknown',
            exchange: bot.exchange || 'Unknown',
            botId: bot._id, // Add botId for orders fetching
            botName: bot.settings?.name || undefined,
            currentBalance: {
              base: bot.currentBalances?.base || 0,
              quote: bot.currentBalances?.quote || 0,
            },
            usage: {
              current: {
                base: bot.assets?.used?.base || 0,
                quote: bot.assets?.used?.quote || 0,
              },
              currentUsd: bot.assets?.used?.quote || 0, // Fallback to quote for USD
              max: {
                base: bot.assets?.used?.base || 0, // Use current as max since no max available
                quote: bot.assets?.used?.quote || 0,
              },
              maxUsd: bot.assets?.used?.quote || 0, // Fallback to quote for USD
            },
            ...(bot.profit && {
              profit: {
                total: bot.profit.total || 0,
                totalUsd: bot.profit.totalUsd || 0,
                pureBase: 0,
                pureQuote: 0,
              },
            }),
            levels: {
              complete:
                (bot.levels?.active?.buy || 0) +
                (bot.levels?.active?.sell || 0),
              all: (bot.levels?.all?.buy || 0) + (bot.levels?.all?.sell || 0),
            },
            initialPrice: bot.initialPrice,
            created: +new Date(bot.created),
            // Add gauge values
            outerGaugePercent: gaugeValues.outerGaugePercent,
            centerText: gaugeValues.centerText,
            showInnerGauge: gaugeValues.showInnerGauge,
          });
        } catch (error) {
          logger.error('[Trades] Error transforming Grid bot:', error);
        }
      });
    }
    // Final defensive dedupe by id across all sources.
    // If a duplicate exists, prefer Terminal classification.
    const dedupedTradesMap = new Map<string, TradeItem>();
    trades.forEach((trade) => {
      const existing = dedupedTradesMap.get(trade.id);
      if (!existing || trade.type === 'Terminal') {
        dedupedTradesMap.set(trade.id, trade);
      }
    });
    const dedupedTrades = Array.from(dedupedTradesMap.values());

    logger.debug('[Trades] Final trades:', {
      count: dedupedTrades.length,
      sample: dedupedTrades.slice(0, 3),
    });

    return dedupedTrades;
  }, [
    dcaDealsOnly,
    comboDeals,
    /*  hedgeComboDeals,
    hedgeDcaDeals, */
    terminalDeals,
    gridBotsForDeals,
    calculateDealGaugeValues,
    // Note: showClosedTrades is intentionally not included as dependency
    // since gridBotsForDeals query already handles the filtering based on this state
  ]);

  // Transform TradeItem to OpenTrade for the widget
  const transformTradeItemToOpenTrade = (trade: TradeItem): OpenTrade => {
    let createdTime: number;

    if (trade.created) {
      createdTime = +new Date(trade.created);
    } else {
      createdTime = +new Date(); // Fallback to now if created time is missing
    }

    // How long it ran. A closed/canceled DEAL stops at its close instead of
    // counting on to now — see `dealWorkingMs` (V1 parity, bug #567). Grid-BOT
    // rows carry no closeTime, so they keep counting as before.
    const workingHours = Math.floor(
      dealWorkingMs({
        status: trade.status,
        createTime: createdTime,
        closeTime: trade.closeTime,
        updateTime: trade.updateTime,
      }) /
        (1000 * 60 * 60)
    );
    const workingDays = Math.floor(workingHours / 24);
    const remainingHours = workingHours % 24;
    const workingTime =
      workingDays > 0
        ? `${workingDays}D ${remainingHours}H`
        : `${remainingHours}H`;

    const baseSymbol =
      trade.symbol.split('/')[0] ||
      trade.symbol.replace(/USDT|USDC|BUSD|USD/, '');
    const quoteSymbol = trade.symbol.includes('/')
      ? trade.symbol.split('/')[1]
      : trade.symbol.replace(baseSymbol, '') || 'USD';
    const pair = `${baseSymbol}/${quoteSymbol}`;

    const currentUsageUsd =
      trade.usage.currentUsd !== undefined
        ? trade.usage.currentUsd
        : trade.usage.current.quote;
    const maxUsageUsd =
      trade.usage.maxUsd !== undefined
        ? trade.usage.maxUsd
        : trade.usage.max?.quote;

    // Strategy-aware cost/value/size matching legacy (terminal/utils.ts)
    const metricsInput = {
      strategy: trade.strategy,
      avgPrice: trade.avgPrice || 0,
      usage: {
        current: {
          base: trade.usage.current.base,
          quote: trade.usage.current.quote,
        },
      },
      currentBalances: trade.currentBalance,
      initialBalances: trade.initialBalance,
      futures: trade.futures,
      coinm: trade.coinm,
      leverage: trade.settings?.leverage,
      marginType: trade.settings?.marginType,
    };

    const cost = calculateDealCost(metricsInput);
    const size = calculateDealSize(metricsInput);
    const value = calculateDealValue(metricsInput);
    const usagePercentage =
      maxUsageUsd && maxUsageUsd > 0
        ? calculateUsagePercentage(currentUsageUsd, maxUsageUsd)
        : cost > 0
          ? Math.min(calculateUsagePercentage(value, cost), 100)
          : 0;

    const normalizedStatus = String(trade.status || '').toLowerCase();
    const isClosedTrade = ['closed', 'cancelled', 'canceled'].includes(
      normalizedStatus
    );

    return {
      baseAsset: trade.baseAsset || '',
      quoteAsset: trade.quoteAsset || '',
      active: !isClosedTrade,
      id: trade.id,
      type: trade.type,
      symbol: trade.symbol,
      strategy: trade.strategy,
      status: trade.status,
      exchange: trade.exchange,
      exchangeUUID: trade.exchangeUUID,
      botId: trade.botId, // Pass botId for orders fetching
      botName: trade.botName,
      currentBalance: trade.currentBalance,
      usage: {
        current: trade.usage.current,
        currentUsd: trade.usage.currentUsd || trade.usage.current.quote,
        max: trade.usage.max || trade.usage.current,
        maxUsd:
          trade.usage.maxUsd ||
          trade.usage.max?.quote ||
          trade.usage.current.quote,
      },
      profit: trade.profit || {
        total: 0,
        totalUsd: 0,
        pureBase: 0,
        pureQuote: 0,
      },
      funding: trade.funding,
      unrealizedProfit: trade.unrealizedProfit || 0,
      avgPrice: trade.avgPrice || 0,
      levels: trade.levels,
      created: createdTime,
      initialPrice: trade.initialPrice,
      notes: trade.note || '',
      pair,
      dealType: trade.type.includes('Hedge') ? 'FUTURES' : 'SPOT',
      side: trade.strategy?.toUpperCase().includes('LONG') ? 'BUY' : 'SELL',
      orders: trade.levels.complete,
      entryPrice: trade.initialPrice || trade.avgPrice || 0,
      pnl: trade.profit?.totalUsd || 0,
      cost,
      value,
      size,
      usagePercentage,
      createdTime: new Date(createdTime),
      workingTime,
      drawdown: trade.stats?.drawdownPercent
        ? trade.stats.drawdownPercent * 100
        : 0,
      runUp: trade.stats?.runUpPercent ? trade.stats.runUpPercent * 100 : 0,
      timeInLoss:
        trade.stats?.timeInLoss && trade.stats?.trackTime
          ? `${((trade.stats.timeInLoss / trade.stats.trackTime) * 100).toFixed(1)}%`
          : '-',
      timeInProfit:
        trade.stats?.timeInProfit && trade.stats?.trackTime
          ? `${((trade.stats.timeInProfit / trade.stats.trackTime) * 100).toFixed(1)}%`
          : '-',
      takeProfitConfig: trade.settings ? tpSLConfig(trade.settings, 'tp') : '-',
      stopLossConfig: trade.settings ? tpSLConfig(trade.settings, 'sl') : '-',
      // Pass gauge properties
      outerGaugePercent: trade.outerGaugePercent || 0,
      centerText: trade.centerText || '0%',
      showInnerGauge: trade.showInnerGauge || false,
    };
  };

  // Filter trades based on showClosedTrades
  const filteredTrades = useMemo(() => {
    // DCA / combo / terminal deals reach this list from hooks that send NO
    // status filter, so the backend applies its active-only default
    // (`open`/`start`/`error` — ACTIVE_ONLY_DEFAULT_STATUSES). The open view
    // must therefore accept every one of those or an active deal silently
    // disappears from Trades while the Bots tab still counts it: a single
    // `start` deal is what made 50 active pairs render as 49 (bug #505).
    //
    // Grid bots enter the same list carrying their raw BOT status and are
    // already filtered server-side via `gridBotStatus`, so their statuses are
    // unioned in separately. `error` deliberately appears in BOTH groups: an
    // errored DEAL is still active, while an errored GRID BOT is fetched as
    // part of the closed set.
    const openStatuses = [
      ...ACTIVE_ONLY_DEFAULT_STATUSES,
      'active',
      'range',
      'monitoring',
    ];
    const closedStatuses = [
      ...(dealStatusGroup(DCADealStatusEnum.closed) ?? []),
      'error',
      'stopped',
      'completed',
    ];

    if (showClosedTrades) {
      return allTradesUnfiltered.filter((trade) =>
        closedStatuses.includes(trade.status.toLowerCase())
      );
    } else {
      return allTradesUnfiltered.filter((trade) =>
        openStatuses.includes(trade.status.toLowerCase())
      );
    }
  }, [allTradesUnfiltered, showClosedTrades]);

  // Transform filtered trades for the widget
  const transformedTrades = useMemo(() => {
    return filteredTrades.map(transformTradeItemToOpenTrade);
  }, [filteredTrades]);

  // The bot-list KPI strip is wired up further down once dcaBots / comboBots
  // / gridBots are in scope.

  // Fetch all bots for the Bots tab
  // Note: paperContext is automatically derived from useUIStore in each hook
  const { bots: dcaBots = [] } = useDcaBots({
    status: ['open', 'range', 'monitoring', 'error'] as BotStatus[],
    terminal: false,
    paperContext: currentPaperContext,
  });

  const { bots: comboBots = [] } = useComboBots({
    status: ['open', 'range', 'monitoring', 'error'] as BotStatus[],
    paperContext: currentPaperContext,
  });

  const { bots: gridBots = [] } = useGridBots({
    status: ['open', 'range', 'monitoring', 'error'] as BotStatus[],
    paperContext: currentPaperContext,
  });

  /** Unified KPI stats aggregated across DCA + Combo + Grid for the
   * current Live/Demo context. Each per-type adapter normalises into the
   * same BotForStats shape; combineBotListStats sums them and recomputes
   * the utilization ratio cleanly from the totals. */
  const botListStats = useMemo(() => {
    const dcaPart = computeBotListStats(
      dcaBots.map<BotForStats>((b) => ({
        status: b.status,
        totalProfitUsd: b.profit?.totalUsd || 0,
        todayProfitUsd: b.profitToday?.totalTodayUsd || 0,
        usedQuote: usageCurrentUsd(b.usage),
        requiredQuote: usageMaxUsd(b.usage),
        activeDeals: b.dealsInBot?.active || 0,
      }))
    );
    const comboPart = computeBotListStats(
      comboBots.map<BotForStats>((b) => ({
        status: b.status,
        totalProfitUsd: b.profit?.totalUsd || 0,
        todayProfitUsd: b.profitToday?.totalTodayUsd || 0,
        usedQuote: usageCurrentUsd(b.usage),
        requiredQuote: usageMaxUsd(b.usage),
        activeDeals: b.dealsInBot?.active || 0,
      }))
    );
    const gridPart = computeBotListStats(
      gridBots.map<BotForStats>((b) => ({
        status: b.status,
        totalProfitUsd: b.profit?.totalUsd || 0,
        todayProfitUsd: b.profitToday?.totalTodayUsd || 0,
        // Grid's `assets.used.quote` already reflects live used capital
        // (no separate `usage` block like DCA/Combo), so it stays the basis.
        usedQuote: b.assets?.used?.quote || 0,
        requiredQuote: b.assets?.required?.quote || 0,
        // Grid bots have no `dealsInBot`; aggregated subtitle uses the
        // DCA + Combo deal count only.
        activeDeals: 0,
      }))
    );
    return combineBotListStats([dcaPart, comboPart, gridPart]);
  }, [dcaBots, comboBots, gridBots]);

  /* const { bots: hedgeDcaBots = [] } = useHedgeDcaBots({
    status: ['open', 'range', 'monitoring', 'error'] as BotStatus[],
    terminal: false,
  });

  const { bots: hedgeComboBots = [] } = useHedgeComboBots({
    status: ['open', 'range', 'monitoring', 'error'] as BotStatus[],
    terminal: false,
  }); */

  // Interface for bot data table
  interface BotTableRow {
    id: string;
    name: string;
    botType: BotTypesEnum;
    exchange: string;
    exchangeId?: string | undefined;
    pair?: string | undefined;
    strategy?: string;
    status?: string;
    profit: number;
    value: number;
    // Store original bot data for card view
    originalBot: any;
  }

  // Transform and combine all bot data
  const allBots = useMemo(() => {
    const bots: BotTableRow[] = [];

    logger.debug('[TradingPage-Bots] Aggregating bots:', {
      dcaCount: dcaBots.length,
      comboCount: comboBots.length,
      gridCount: gridBots.length,
      /* hedgeDcaCount: hedgeDcaBots.length,
      hedgeComboCount: hedgeComboBots.length, */
    });

    // Pick the first positive USD-valued candidate. For SHORT spot and
    // COIN-M futures the quote-side of usage is zero, so we need backend's
    // pre-computed USD value (usage.currentUsd) or liveStats.currentCost.
    const resolveBotValueUsd = (bot: {
      settings?: { strategy?: string; futures?: boolean; coinm?: boolean };
      usage?: {
        current?: { base?: number; quote?: number };
        currentUsd?: number;
      };
      liveStats?: { currentCost?: number };
    }): number => {
      const candidates: Array<number | undefined> = [
        bot.usage?.currentUsd,
        bot.liveStats?.currentCost,
      ];
      const strategy = (bot.settings?.strategy as string) || '';
      const isLongSide = strategy.toUpperCase().includes('LONG');
      const isFutures = Boolean(bot.settings?.futures);
      const isCoinm = Boolean(bot.settings?.coinm);
      const usesBaseSide = isFutures ? isCoinm : !isLongSide;
      candidates.push(
        usesBaseSide ? bot.usage?.current?.base : bot.usage?.current?.quote
      );
      for (const v of candidates) {
        if (typeof v === 'number' && v > 0) return v;
      }
      return 0;
    };

    // Add DCA bots
    dcaBots.forEach((bot) => {
      const symbol = Array.isArray(bot.symbol)
        ? bot.symbol[0]?.value?.symbol
        : (bot.symbol as { symbol?: string })?.symbol;
      bots.push({
        id: bot._id,
        name: bot.settings?.name || 'Unnamed Bot',
        botType: BotTypesEnum.dca,
        exchange: bot.exchange || 'Unknown',
        exchangeId: bot.exchangeUUID || bot.exchange,
        pair: symbol || undefined,
        strategy: (bot.settings?.strategy as string) || undefined,
        status: bot.status || 'unknown',
        profit: bot.profit?.totalUsd || 0,
        value: resolveBotValueUsd(bot),
        originalBot: bot,
      });
    });

    // Add Combo bots
    comboBots.forEach((bot) => {
      const symbol = bot.symbol[0]?.value?.symbol;
      bots.push({
        id: bot._id,
        name: bot.settings?.name || 'Unnamed Bot',
        botType: BotTypesEnum.combo,
        exchange: bot.exchange || 'Unknown',
        exchangeId: bot.exchangeUUID || bot.exchange,
        pair: symbol || undefined,
        strategy: (bot.settings?.strategy as string) || undefined,
        status: bot.status || 'unknown',
        profit: bot.profit?.totalUsd || 0,
        value: resolveBotValueUsd(bot),
        originalBot: bot,
      });
    });

    // Add Grid bots
    gridBots.forEach((bot) => {
      const symbol = bot.symbol.symbol;
      bots.push({
        id: bot._id,
        name: bot.settings?.name || 'Unnamed Bot',
        botType: BotTypesEnum.grid,
        exchange: bot.exchange || 'Unknown',
        exchangeId: bot.exchangeUUID || bot.exchange,
        pair: symbol || undefined,
        strategy: (bot.settings?.strategy as string) || undefined,
        status: bot.status || 'unknown',
        profit: bot.profit?.totalUsd || 0,
        value: bot.assets?.used?.quote || 0,
        originalBot: bot,
      });
    });

    // Add Hedge DCA bots
    /*  hedgeDcaBots.forEach((bot) => {
      const symbol = Array.isArray(bot.symbol)
        ? bot.symbol[0]?.value?.symbol
        : (bot.symbol as { symbol?: string })?.symbol || 'Unknown';
      // Hedge bots may reference a dca bot for exchange/settings
      const dcaBot = (bot as any).dcaBot;
      bots.push({
        id: bot._id,
        name: bot._id.slice(-8), // Use truncated ID as name for now
        botType: 'hedgeDca',
        exchange: dcaBot?.exchange || 'Unknown', // Exchange from nested dca bot if available
        exchangeId:
          dcaBot?.exchangeUUID ||
          dcaBot?.exchange ||
          (bot as any).exchange ||
          undefined,
        pair: symbol,
        strategy:
          (dcaBot?.settings?.strategy as string) ||
          (bot as any).strategy ||
          undefined,
        profit: bot.profit?.totalUsd || 0,
        value: (bot.currentBalances as { quote?: number })?.quote || 0,
        status: (bot as any).status || 'unknown',
      });
    }); */

    // Add Hedge Combo bots
    /* hedgeComboBots.forEach((bot) => {
      const symbol = Array.isArray(bot.symbol)
        ? bot.symbol[0]?.value?.symbol
        : (bot.symbol as { symbol?: string })?.symbol || 'Unknown';
      const dcaBot = (bot as any).dcaBot;
      bots.push({
        id: bot._id,
        name: bot._id.slice(-8), // Use truncated ID as name for now
        botType: 'hedgeCombo',
        exchange: dcaBot?.exchange || 'Unknown',
        exchangeId:
          dcaBot?.exchangeUUID ||
          dcaBot?.exchange ||
          (bot as any).exchange ||
          undefined,
        pair: symbol,
        strategy:
          (dcaBot?.settings?.strategy as string) ||
          (bot as any).strategy ||
          undefined,
        profit: bot.profit?.totalUsd || 0,
        value: (bot.currentBalances as { quote?: number })?.quote || 0,
        status: (bot as any).status || 'unknown',
      });
    }); */

    return bots;
  }, [dcaBots, comboBots, gridBots /* , hedgeDcaBots, hedgeComboBots */]);

  // Define columns for the bots table
  const botColumns: ColumnDef<BotTableRow>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const id = row.original.id;
          const botType = row.original.botType;
          return (
            <div className="flex items-center gap-xs">
              <div className="font-medium truncate">{row.getValue('name')}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(buildBotViewRoute(botType, id), '_blank');
                }}
                className="p-1 rounded hover:bg-muted/30"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'botType',
        header: 'Type',
        cell: ({ row }) => (
          <div className="flex items-center">
            <BotTypeChip
              botType={
                (row.getValue('botType') as BotTypesEnum) || BotTypesEnum.dca
              }
              size="xs"
              chipStyle="solid"
            />
          </div>
        ),
      },
      {
        accessorKey: 'pair',
        header: 'Pair',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            const pair = (bot['pair'] as string) || '';
            return [pair, pair.replace('/', '')].filter(Boolean);
          },
        },
        cell: ({ row }) => {
          const pair = row.getValue('pair') as string | undefined;
          if (!pair) {
            return <div className="text-muted-foreground text-sm">No pair</div>;
          }
          return (
            <div>
              <CoinPair pair={pair} iconSize="sm" />
            </div>
          );
        },
      },
      {
        accessorKey: 'exchange',
        header: 'Exchange',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            return [bot['exchange'], bot['exchangeId']].filter(
              Boolean
            ) as string[];
          },
        },
        cell: ({ row }) => {
          const exchange = (row.getValue('exchange') as string) || 'Unknown';
          const exchangeId =
            (row.getValue('exchangeId') as string) || exchange || 'Unknown';
          return (
            <ExchangeChip
              exchangeId={exchangeId}
              size="sm"
              layout="stacked"
              chipStyle="soft"
            />
          );
        },
      },
      {
        accessorKey: 'strategy',
        header: 'Strategy',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const bot = row as Record<string, unknown>;
            return (bot['strategy'] as string) || '';
          },
        },
        cell: ({ row }) => {
          const rawStrategy = (row.getValue('strategy') as string) || '';
          const s = rawStrategy.toLowerCase();
          const strategyLabel = s.includes('long')
            ? 'long'
            : s.includes('short')
              ? 'short'
              : 'neutral';
          return (
            <div>
              {rawStrategy ? (
                <StrategyChip
                  strategy={strategyLabel as any}
                  size="xs"
                  chipStyle="solid"
                />
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { filterType: 'array' },
        cell: ({ row }) => {
          const status = (row.getValue('status') as string) || 'unknown';
          return <StatusChip status={status} size="xs" chipStyle="soft" />;
        },
      },
      {
        accessorKey: 'profit',
        header: 'Profit',
        cell: ({ row }) => {
          const profit = row.getValue('profit') as number;
          return (
            <div
              className={`font-medium ${
                profit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {privacyMode ? '***' : formatCurrency(profit, 2)}
            </div>
          );
        },
      },
      {
        accessorKey: 'value',
        header: 'Value',
        cell: ({ row }) => (
          <div className="font-medium">
            {privacyMode ? '***' : formatCurrency(row.getValue('value'), 2)}
          </div>
        ),
      },
    ],
    [privacyMode]
  );

  const statusToggleMutation = useBotStatusToggle(BotTypesEnum.dca);
  // react-query's `mutate` is a stable reference across renders; the mutation
  // object itself is not. Bind the stable fn so downstream memos can depend on
  // it without rebuilding every render.
  const toggleBotStatus = statusToggleMutation.mutate;
  // placeholder: useDealActions not required for now; kept for future trade bulk actions
  const readOnly = isReadOnly();

  // Stable refs read by the BotCardWrapper so it can stay memoised across
  // re-renders (otherwise every price tick would remount every card and the
  // DataTable would flash). The actual prices/stats live in component state
  // — refs are updated each render and the wrapper reads .current at call
  // time.
  const latestPricesRef = useRef(latestPrices);
  latestPricesRef.current = latestPrices;
  const liveBotStatsRef = useRef(liveBotStats);
  liveBotStatsRef.current = liveBotStats;

  // BotCard wrapper to render BotCard inside DataTable's card view.
  // useMemo with empty deps keeps the component type reference stable across
  // Trading re-renders (data hooks resolving, store updates, etc.), preventing
  // DataTable from remounting every card whenever the parent re-renders.
  // privacyMode is read via ref so the rendered value is always current.
  const BotCardWrapper = useMemo(
    () =>
      ({ item, index }: { item: BotTableRow; index: number }) => {
        const bot = item.originalBot;
        if (!bot) return null;

        // Calculate working time from workingShift if available
        let workingTime = '';
        const workingMs =
          bot.workingShift && bot.workingShift.length > 0
            ? bot.workingShift.reduce(
                (acc: number, v: { start: number; end?: number }) => {
                  if (v.end) {
                    return acc + (v.end - v.start);
                  }
                  return acc + (Date.now() - v.start);
                },
                0
              )
            : 0;

        if (workingMs > 0) {
          const days = Math.floor(workingMs / (24 * 60 * 60 * 1000));
          const hours = Math.floor(workingMs / (60 * 60 * 1000)) % 24;
          if (days >= 1) workingTime = `${days}d`;
          else if (hours >= 1) workingTime = `${hours}h`;
          else workingTime = '0d';
        } else {
          workingTime = '0d';
        }

        // Strategy-aware usage side: SHORT spot and COIN-M futures track usage
        // in BASE; LONG spot and USDM futures track usage in QUOTE. The
        // backend leaves the unused side at 0, so we must pick the correct
        // side for each market type — otherwise SHORT spot combos show 0
        // value/cost/usage on this tab even though the /combo page renders
        // them correctly.
        const botStrategy = (bot.settings?.strategy as string) || '';
        const isLongSide = botStrategy.toUpperCase().includes('LONG');
        const isFutures = Boolean(bot.settings?.futures);
        const isCoinm = Boolean(bot.settings?.coinm);
        const usesBaseSide = isFutures ? isCoinm : !isLongSide;
        const usageQuote = bot.usage?.current?.quote || 0;
        const usageBase = bot.usage?.current?.base || 0;
        const maxQuote = bot.usage?.max?.quote || 0;
        const maxBase = bot.usage?.max?.base || 0;

        const maxUsage =
          item.botType === BotTypesEnum.grid
            ? bot.assets?.used?.quote || 0
            : usesBaseSide
              ? maxBase
              : maxQuote;
        const currentUsage =
          item.botType === BotTypesEnum.grid
            ? bot.assets?.used?.quote || 0
            : usesBaseSide
              ? usageBase
              : usageQuote;
        const usageTotal = maxUsage > 0 ? (currentUsage / maxUsage) * 100 : 0;

        // Pick the first positive USD-valued candidate. usage.currentUsd is
        // populated by the backend even for SHORT spot (where current.quote
        // is 0); liveStats.currentCost is sometimes 0 for SHORT spot, so we
        // can't simply rely on it.
        const pickUsd = (...candidates: Array<number | undefined>): number => {
          for (const v of candidates) {
            if (typeof v === 'number' && v > 0) return v;
          }
          return 0;
        };

        // Use liveStats if available (pre-computed by backend), otherwise calculate
        const liveStats = bot.liveStats;
        const currentValue = pickUsd(
          (bot.usage as { currentUsd?: number } | undefined)?.currentUsd,
          liveStats?.currentCost,
          currentUsage
        );
        const maxValue = pickUsd(
          (bot.usage as { maxUsd?: number } | undefined)?.maxUsd,
          liveStats?.maxCost,
          maxUsage
        );
        // Compute card-level metrics via the canonical transformer that
        // /combo, /dca, /grid all use. The backend leaves several liveStats
        // fields at 0 for some bot configurations (notably SHORT spot combos
        // get liveStats.value=0; some DCA bots get liveStats.avgDaily=0 and
        // liveStats.annualizedReturn=0). Without this fallback the Bots tab
        // card shows $0 / 0% even though the bot-type list pages render real
        // numbers.
        let unPnl = liveStats?.value || 0;
        let unPnlPerc = liveStats?.relativeValue
          ? liveStats.relativeValue * 100
          : 0;
        let avgDaily = liveStats?.avgDaily || 0;
        let avgDailyPerc = liveStats?.avgDailyRelative
          ? liveStats.avgDailyRelative * 100
          : 0;
        let annualizedReturn = liveStats?.annualizedReturn || 0;
        if (
          (item.botType === BotTypesEnum.combo ||
            item.botType === BotTypesEnum.dca) &&
          latestPricesRef.current.length > 0
        ) {
          try {
            const transformed = transformDcaBotToBot(
              bot as DCABot | ComboBot,
              [],
              latestPricesRef.current,
              item.botType === BotTypesEnum.combo,
              [],
              liveBotStatsRef.current[bot._id]
            );
            if (
              typeof transformed.unPnl === 'number' &&
              transformed.unPnl !== 0
            ) {
              unPnl = transformed.unPnl;
            }
            if (
              typeof transformed.unPnlPerc === 'number' &&
              transformed.unPnlPerc !== 0
            ) {
              unPnlPerc = transformed.unPnlPerc;
            }
            if (
              typeof transformed.avgDaily === 'number' &&
              transformed.avgDaily !== 0
            ) {
              avgDaily = transformed.avgDaily;
            }
            if (
              typeof transformed.avgDailyPerc === 'number' &&
              transformed.avgDailyPerc !== 0
            ) {
              avgDailyPerc = transformed.avgDailyPerc;
            }
            if (
              typeof transformed.annualizedReturn === 'number' &&
              transformed.annualizedReturn !== 0 &&
              Number.isFinite(transformed.annualizedReturn)
            ) {
              annualizedReturn = transformed.annualizedReturn;
            }
          } catch (error) {
            logger.warn(
              '[Trading] Failed to compute bot metrics via transformDcaBotToBot',
              { botId: bot._id, error }
            );
          }
        }

        const transformedBot = {
          ...bot,
          id: bot._id,
          name: bot.settings?.name || 'Unnamed Bot',
          type: item.botType,
          totalProfitUsd: bot.profit?.totalUsd || 0,
          profitPerc:
            maxValue > 0 ? ((bot.profit?.totalUsd || 0) / maxValue) * 100 : 0,
          usageTotal,
          usage: usageTotal,
          workingTime,
          unPnl,
          unPnlPerc,
          value: currentValue,
          valueChange: 0,
          currentValue,
          maxValue,
          avgDaily,
          avgDailyPerc,
          annualizedReturn,
          dealsInBot: bot.dealsInBot || { active: 0, all: 0 },
        };

        return (
          <BotCard
            type={item.botType}
            item={transformedBot}
            index={index}
            onClick={() => null}
            privacyMode={privacyModeRef.current}
          />
        );
      },

    [] // Never recreate — privacyModeRef keeps the value current
  );

  const botsBulkActions: BulkAction<BotTableRow>[] = useMemo(
    () => [
      {
        id: 'start',
        label: 'Start',
        icon: Play,
        destructive: false,
        disabled: readOnly,
        onAction: (selected) => {
          const stopped = selected.filter((b) => b.status !== 'active');
          if (stopped.length === 0) {
            toast.info('No stopped bots selected');
            return;
          }
          stopped.forEach((b) =>
            toggleBotStatus({ id: b.id, status: 'open' })
          );
          toast.success(`Starting ${stopped.length} bot(s)`);
        },
      },
      {
        id: 'stop',
        label: 'Stop',
        icon: Square,
        destructive: true,
        disabled: readOnly,
        onAction: (selected) => {
          const active = selected.filter((b) => b.status === 'active');
          if (active.length === 0) {
            toast.info('No active bots selected');
            return;
          }
          active.forEach((b) =>
            toggleBotStatus({ id: b.id, status: 'closed' })
          );
          toast.success(`Stopping ${active.length} bot(s)`);
        },
      },
    ],
    // Depend on the stable `mutate` fn, NOT the whole mutation object —
    // react-query returns a fresh mutation object every render, which made
    // this memo (and therefore the data-table toolbar's button array) rebuild
    // on every parent re-render, re-rendering ResponsiveButtonRow ~26x/s under
    // live bot-stats churn (RenderLoopTripwire on /trading).
    [readOnly, toggleBotStatus]
  );

  if (hasError) {
    return (
      <MainLayout pageTitle="Trading" activePage="/trading">
        <WidgetContainer layout="flex" verticalGap>
          <Widget className="p-lg text-card-foreground" noPadding>
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Activity className="w-12 h-12 text-destructive mx-auto" />
                <h3 className="text-lg font-semibold">
                  Error Loading Trades
                </h3>
                <p className="text-muted-foreground">
                  There was an error loading the trades data. Please try again
                  later.
                </p>
              </div>
            </div>
          </Widget>
        </WidgetContainer>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout pageTitle="Trading" activePage="/trading">
        <WidgetContainer layout="flex" verticalGap>
          <Widget className="p-lg text-card-foreground" noPadding>
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <h3 className="text-lg font-semibold">Loading Trades</h3>
                <p className="text-muted-foreground">
                  Fetching your open trades and active positions...
                </p>
              </div>
            </div>
          </Widget>
        </WidgetContainer>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Trading" activePage="/trading">
      <WidgetContainer layout="flex" verticalGap>
        {/* Main Content with Tabs */}
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
            className="text-card-foreground flex-1 min-h-[500px]"
            noPadding
            overflow="auto"
          >
            <div className="flex flex-col h-full min-h-[500px]">
              <Tabs
                defaultValue="bots"
                className="h-full flex flex-col"
                paramKey="view"
                paramSync={true}
              >
                <div className="px-4 pt-4 md:px-6 md:pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-md">
                  <TabsList
                    className="w-auto! grid max-w-md grid-cols-2"
                    fullWidth={false}
                  >
                    <TabsTrigger value="bots">
                      Bots ({allBots.length})
                    </TabsTrigger>
                    <TabsTrigger value="trades">Trades</TabsTrigger>
                  </TabsList>
                  {/* Unified KPI strip (aggregated across DCA + Combo + Grid) */}
                  <div className="min-w-0 flex-1 flex items-center justify-end">
                    <BotListStatsBoxes
                      stats={botListStats}
                      privacyMode={privacyMode}
                      isLoading={allHooksLoading && !hasSomeData}
                    />
                  </div>
                </div>

                {/* Bots Tab Content */}
                <TabsContent
                  value="bots"
                  className="flex-1 px-4 pb-4 md:px-6 md:pb-6 overflow-hidden"
                >
                  <div className="h-full">
                    <DataTable
                      tableId="active-bots"
                      columns={botColumns}
                      data={allBots}
                      enableGlobalFilter={true}
                      enableColumnFilters={true}
                      enableSorting={true}
                      enableColumnVisibility={true}
                      enableCardView={true}
                      defaultView="cards"
                      cardComponent={BotCardWrapper}
                      cardViewBreakpoints={CARD_VIEW_COLUMNS}
                      cardViewGap={16}
                      getRowId={(row) => row.id}
                      bulkActions={botsBulkActions}
                      emptyMessage="No active bots found"
                      emptyContent={
                        <EmptyState
                          size="page"
                          icon={<Activity className="w-6 h-6" />}
                          title="No active bots"
                          description="Active bots show up here while they're running. Start one from the Bots pages or adjust your filters above."
                        />
                      }
                      className="h-full"
                      enableQuickFilterBar={true}
                      quickFilterBarStorageKey="active-bots-filters"
                    />
                  </div>
                </TabsContent>

                {/* Trades Tab Content */}
                <TabsContent value="trades" className="flex-1 overflow-hidden">
                  <div className="space-y-md px-4 pb-4 md:px-6 md:pb-6 h-full flex flex-col">
                    {/* Content - Using shared OpenOrdersWidget with enhanced chips */}
                    <div className="flex-1 overflow-hidden">
                      <OpenOrdersWidget
                        widgetId="trades-main"
                        showClosedTrades={showClosedTrades}
                        emptyMessage={
                          showClosedTrades
                            ? 'No closed trades found'
                            : 'No open trades found'
                        }
                        enableCardView={true}
                        data={{ trades: transformedTrades }}
                        privacyMode={privacyMode}
                        onTradeClick={(trade) => {
                          logger.debug(
                            '[TradingPage-Trades] Trade clicked:',
                            trade.id
                          );
                          setSelectedTradeId(trade.id);
                        }}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </Widget>
        </motion.div>

        {/* Trade Detail Drawer - OPTIMIZED: Single shared drawer instead of one per trade */}
        {selectedTradeId &&
          (() => {
            const originalTrade = filteredTrades.find(
              (trade) => trade.id === selectedTradeId
            );
            if (!originalTrade) return null;

            return (
              <TradeDetailDrawer
                trade={{
                  id: originalTrade.id,
                  type: originalTrade.type,
                  symbol: originalTrade.symbol,
                  strategy: originalTrade.strategy,
                  status: originalTrade.status,
                  exchange: originalTrade.exchange,
                  ...(originalTrade.exchangeUUID && {
                    exchangeUUID: originalTrade.exchangeUUID,
                  }),
                  ...(originalTrade.botName && {
                    botName: originalTrade.botName,
                  }),
                  currentBalance: originalTrade.currentBalance,
                  usage: {
                    current: originalTrade.usage.current,
                    ...(originalTrade.usage.currentUsd !== undefined && {
                      currentUsd: originalTrade.usage.currentUsd,
                    }),
                    ...(originalTrade.usage.max && {
                      max: originalTrade.usage.max,
                    }),
                    ...(originalTrade.usage.maxUsd !== undefined && {
                      maxUsd: originalTrade.usage.maxUsd,
                    }),
                  },
                  ...(originalTrade.profit && { profit: originalTrade.profit }),
                  ...(originalTrade.funding && {
                    funding: originalTrade.funding,
                  }),
                  ...(!['closed', 'cancelled', 'canceled'].includes(
                    String(originalTrade.status || '').toLowerCase()
                  ) &&
                    originalTrade.unrealizedProfit !== undefined && {
                      unrealizedProfit: originalTrade.unrealizedProfit,
                    }),
                  ...(originalTrade.avgPrice !== undefined && {
                    avgPrice: originalTrade.avgPrice,
                  }),
                  levels: originalTrade.levels,
                  ...(originalTrade.created && {
                    created: originalTrade.created,
                  }),
                  ...(originalTrade.botId && { botId: originalTrade.botId }),
                }}
                open={true}
                onClose={() => setSelectedTradeId(null)}
                privacyMode={privacyMode}
              >
                <div />
              </TradeDetailDrawer>
            );
          })()}
      </WidgetContainer>
    </MainLayout>
  );
};

export default Trading;
