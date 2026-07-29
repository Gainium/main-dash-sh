import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CHART_COLORS } from '@/lib/colors';
import { Search } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartColors } from '../../../hooks/useChartColors';
import { useComboBots } from '../../../hooks/useComboBots';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useWidgetSettings } from '../../../hooks/useWidgetSettings';
import {
  GraphQLClient,
  getGraphQLConfig,
  LONG_READ_TIMEOUT_MS,
  type ReturnResult,
} from '../../../lib/api';
import { botQueries } from '../../../lib/api/GraphQLQueries-bot-queries';
import { logger } from '../../../lib/loggerInstance';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import {
  BotTypesEnum,
  type BotStats,
  type ComboBot,
  type DCABot,
} from '../../../types';
import { getBotTypeConfig } from '../../../utils/botUtils';
import { useWidgetDisplayName } from '../../../utils/widgetUtils';
import CustomTooltip from '../../charts/CustomTooltip';
import { BotTypeChip } from '../../ui/chip/BotTypeChip';
import { Input } from '../../ui/input';
import { type FilterItem } from '../shared/WidgetFilterArea';
import WidgetStats from '../shared/WidgetStats';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import { getWidgetMetadata } from './index';

// Extended filter item for bot type support
interface BotFilterItem extends FilterItem {
  botType?: BotTypesEnum;
}

/**
 * One selected bot's chart + stat aggregates, extracted from the full
 * by-id bot payload. The bot LIST fragments deliberately strip `stats`
 * (slim payloads), so the USD chart series and win/loss counters are only
 * available via `getDCABot`/`getComboBot` — the same path the bot drawer
 * uses.
 */
interface SelectedBotStats {
  botId: string;
  /**
   * Sorted series in epoch ms. `profit` is `stats.chart.realizedProfit`
   * minus the `startBalance` seed the backend bakes into that series (see
   * DrawerPerformanceChart for the full story); `equity` is absolute USD.
   */
  series: Array<{ time: number; profit: number; equity: number }>;
  winDeals: number;
  lossDeals: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  maxDealDurationMs: number;
}

const normalizeTimeMs = (t: number): number => (t < 1e11 ? t * 1000 : t);

function extractSelectedBotStats(
  botId: string,
  bot: (DCABot | ComboBot) | null
): SelectedBotStats | null {
  const stats = bot?.stats as BotStats | undefined;
  if (!stats) return null;

  const startBalanceUsd = stats.numerical?.general?.startBalance?.usd ?? 0;
  const series = (Array.isArray(stats.chart) ? stats.chart : [])
    .filter((p) => typeof p?.time !== 'undefined')
    .map((p) => ({
      time: normalizeTimeMs(
        typeof p.time === 'number' ? p.time : new Date(p.time).getTime()
      ),
      profit:
        (typeof p.realizedProfit === 'number' ? p.realizedProfit : 0) -
        startBalanceUsd,
      equity: typeof p.equity === 'number' ? p.equity : 0,
    }))
    .filter((p) => Number.isFinite(p.time))
    // The backend builds stats.chart via filter/push churn, so points can
    // arrive unsorted — sort or the area chart zigzags.
    .sort((a, b) => a.time - b.time);

  return {
    botId,
    series,
    winDeals: stats.numerical?.deals?.profit ?? 0,
    lossDeals: stats.numerical?.deals?.loss ?? 0,
    grossProfitUsd: stats.numerical?.profit?.grossProfit?.usd ?? 0,
    grossLossUsd: stats.numerical?.loss?.grossLoss?.usd ?? 0,
    maxDealDurationMs: stats.duration?.general?.maxDealDuration ?? 0,
  };
}

// Bot Selection Dialog Component - moved outside to prevent recreation on every render
const BotSelectionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  items: BotFilterItem[];
  selectedItems: string[];
  onItemToggle: (itemId: string) => void;
}> = ({ isOpen, onClose, items, selectedItems, onItemToggle }) => {
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  if (!isOpen) return null; // Filter items based on search term
  const filteredItems = items.filter((item) => {
    if (!localSearchTerm) return true;
    return item.name.toLowerCase().includes(localSearchTerm.toLowerCase());
  });

  const dialogContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg p-md w-full max-w-lg mx-4 max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold">Select Bots</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="mb-4">
          <Input
            placeholder="Search bots..."
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            endAdornment={<Search size={16} />}
            className="w-full"
          />
        </div>

        {/* Bot List */}
        <div className="space-y-xs overflow-y-auto flex-1">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-sm p-sm rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => {
                logger.info('[BotSelectionDialog] Clicked on bot', {
                  id: item.id,
                  name: item.name,
                });
                onItemToggle(item.id);
              }}
            >
              <div className="flex items-center gap-sm flex-1 min-w-0">
                <BotTypeChip
                  botType={item.botType || BotTypesEnum.dca}
                  iconOnly={true}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-foreground font-medium text-sm truncate">
                    {item.name}
                  </div>
                  {item.subtitle && (
                    <div className="text-muted-foreground text-xs">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>
              {selectedItems.includes(item.id) && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Render dialog through a portal to document.body to avoid z-index/overflow issues
  return createPortal(dialogContent, document.body);
};

export interface BotStatsAdvancedProps {
  widgetId?: string;
  isEditable?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

export type BotStatsAdvancedSettings = {
  selectedBots: string[];
  timeFilter: string;
  customName: string;
  chartTab: 'profit' | 'equity';
};

export const BotStatsAdvanced: React.FC<BotStatsAdvancedProps> = ({
  widgetId = 'bot-stats-advanced',
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Get chart colors for consistent theming
  const colors = useChartColors();

  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<BotStatsAdvancedSettings>(widgetId);

  // Persisted settings for this widget instance
  const [selectedBots, setSelectedBots] = usePersistedState(
    'selectedBots',
    [] as string[]
  );
  const [timeFilter, setTimeFilter] = usePersistedState('timeFilter', '30D');
  const [customName, setCustomName] = usePersistedState('customName', '');
  const [chartTab, setChartTab] = usePersistedState(
    'chartTab',
    'profit' as BotStatsAdvancedSettings['chartTab']
  );

  // Local UI state (not persisted)
  const [showBotDialog, setShowBotDialog] = useState(false);

  // Get DCA bots using the hook from TradingBots page
  const {
    bots: dcaBots,
    isLoading: dcaLoading,
    isError: dcaError,
  } = useDcaBots({
    status: ['open', 'range', 'monitoring'], // Include all active statuses
    all: false,
  });

  // Get Combo bots using the useComboBots hook (only open status)
  const {
    bots: comboBots,
    isLoading: comboLoading,
    isError: comboError,
  } = useComboBots({
    // Align statuses with DCA so Combo bots show up properly
    status: ['open', 'range', 'monitoring'],
    all: false,
  });

  // Combine DCA and Combo bots with loading and error states
  const allBots = useMemo(() => {
    const combined = [...(dcaBots || []), ...(comboBots || [])];
    return combined;
  }, [dcaBots, comboBots]);

  const isLoading = dcaLoading || comboLoading;
  const hasError = dcaError || comboError;

  // Create ID sets for bot type detection
  const dcaIdSet = useMemo(
    () => new Set((dcaBots || []).map((b) => b._id)),
    [dcaBots]
  );
  const comboIdSet = useMemo(
    () => new Set((comboBots || []).map((b) => b._id)),
    [comboBots]
  );

  // Process available bots for selection
  const availableBots = useMemo(() => {
    const bots: BotFilterItem[] = [];

    // Use combined allBots which includes DCA, Terminal, and Combo bots
    if (allBots && Array.isArray(allBots)) {
      allBots.forEach((bot) => {
        // Handle case where bot name might be empty
        const botName =
          bot.settings?.name?.trim() || `Bot ${bot._id.slice(-8)}`;
        const pairName = Array.isArray(bot.settings?.pair)
          ? bot.settings.pair.join(',')
          : bot.settings?.pair || 'Unknown';

        // Determine bot type for icon display based on origin set first
        const botType = comboIdSet.has(bot._id)
          ? BotTypesEnum.combo
          : dcaIdSet.has(bot._id)
            ? BotTypesEnum.dca
            : BotTypesEnum.grid;
        const typeConfig = getBotTypeConfig(botType);

        bots.push({
          id: bot._id,
          name: `${botName} (${pairName})`,
          icon: botType, // Store bot type key
          color: typeConfig.color,
          botType: botType, // Add bot type for chip rendering
        });
      });
    }
    return bots;
  }, [allBots, dcaIdSet, comboIdSet]);

  // Per-bot stats fetched by id (chart series + win/loss aggregates)
  const [botStatsData, setBotStatsData] = useState<
    Map<string, SelectedBotStats>
  >(new Map());
  const [isChartDataLoading, setIsChartDataLoading] = useState(false);

  // Ref to prevent concurrent fetches
  const fetchingRef = useRef(false);
  const lastFetchedKey = useRef<string>('');

  // Create a stable key for selected bots to prevent infinite re-renders
  const selectedBotsKey = useMemo(() => {
    return selectedBots.slice().sort().join(',');
  }, [selectedBots]);

  // Fetch full bot payloads (with `stats`) when selected bots change
  useEffect(() => {
    if (selectedBots.length === 0) {
      setBotStatsData(new Map());
      setIsChartDataLoading(false);
      fetchingRef.current = false;
      lastFetchedKey.current = '';
      return;
    }

    // Wait for the bot lists so each selection's type (DCA vs Combo) is
    // known. `isLoading` is in the deps, so the effect re-runs when the
    // lists land — with only the key as dependency a page load with a
    // persisted selection never fetched at all.
    if (isLoading) {
      return;
    }

    // Prevent fetching if already fetching the same data
    if (fetchingRef.current || lastFetchedKey.current === selectedBotsKey) {
      return;
    }

    fetchingRef.current = true;
    lastFetchedKey.current = selectedBotsKey;
    setIsChartDataLoading(true);

    // Authenticated client — same construction as useGraphQL's queryFn.
    // (The old implementation POSTed to the frontend origin's `/graphql`
    // with cookie auth; that path doesn't exist, so the chart never got
    // data.)
    const { tokens } = useAuthStore.getState();
    const { isLiveTrading } = useUIStore.getState();
    const config = getGraphQLConfig(tokens, isLiveTrading);
    const client = new GraphQLClient(
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000',
      config.token,
      config.paperContext
    );

    const botsToFetch = selectedBots.map((botId) => {
      const bot = allBots.find((b) => b._id === botId);
      const settingsType = bot?.settings?.type?.toLowerCase();
      const isCombo = comboIdSet.has(botId) || settingsType === 'combo';
      return { id: botId, isCombo };
    });

    logger.info('[BotStatsAdvanced] Fetching bot stats', { botsToFetch });

    Promise.all(
      botsToFetch.map(async ({ id, isCombo }) => {
        try {
          const builder = isCombo
            ? botQueries.getComboBot
            : botQueries.getDCABot;
          const resultKey = isCombo ? 'getComboBot' : 'getDCABot';
          const { query, variables } = builder({ id });
          const result = await client.request<
            Record<string, ReturnResult<DCABot | ComboBot>>
          >(query, variables, { timeoutMs: LONG_READ_TIMEOUT_MS });
          const resp = result?.[resultKey];
          const fullBot =
            resp?.status === 'OK'
              ? ((resp.data ?? null) as (DCABot | ComboBot) | null)
              : null;
          if (!fullBot) {
            logger.warn(`[BotStatsAdvanced] No bot payload for ${id}`, {
              status: resp?.status,
              reason: resp?.reason,
            });
          }
          return extractSelectedBotStats(id, fullBot);
        } catch (error) {
          logger.error(
            `[BotStatsAdvanced] Error fetching stats for bot ${id}:`,
            error
          );
          return null;
        }
      })
    ).then((results) => {
      const next = new Map<string, SelectedBotStats>();
      results.forEach((r) => {
        if (r) next.set(r.botId, r);
      });
      setBotStatsData(next);
      setIsChartDataLoading(false);
      fetchingRef.current = false;

      logger.info('[BotStatsAdvanced] Bot stats fetched', {
        bots: [...next.values()].map((r) => ({
          botId: r.botId,
          points: r.series.length,
        })),
      });
    });
    // We read allBots and comboIdSet but don't list them as dependencies to avoid refetch churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBotsKey, isLoading]);

  // Merge per-bot series onto the union of their timestamps, forward-filling
  // each bot's last value so bots with different deal times still sum
  // correctly. A bot contributes 0 profit (and 0 equity) before its first
  // point. Summing only exact-matching timestamps — what the previous
  // implementation did — drops every bot but one from nearly every point.
  const aggregatedSeries = useMemo(() => {
    if (selectedBots.length === 0 || isChartDataLoading) {
      return [];
    }

    const seriesList = selectedBots
      .map((id) => botStatsData.get(id)?.series ?? [])
      .filter((s) => s.length > 0);
    if (seriesList.length === 0) return [];

    const allTimes = Array.from(
      new Set(seriesList.flat().map((p) => p.time))
    ).sort((a, b) => a - b);
    const cursor = seriesList.map(() => 0);
    const lastValue = seriesList.map(() => ({ profit: 0, equity: 0 }));

    return allTimes.map((time) => {
      let profit = 0;
      let equity = 0;
      seriesList.forEach((s, i) => {
        while (cursor[i] < s.length && s[cursor[i]].time <= time) {
          lastValue[i] = s[cursor[i]];
          cursor[i]++;
        }
        profit += lastValue[i].profit;
        equity += lastValue[i].equity;
      });
      return { time, profit, equity };
    });
  }, [selectedBots, botStatsData, isChartDataLoading]);

  // Apply the time filter, downsample, and shape points for the chart
  const chartSeries = useMemo(() => {
    if (aggregatedSeries.length === 0) return [];

    const dayMs = 24 * 60 * 60 * 1000;
    const timeFilterMap: Record<string, number> = {
      '7D': 7 * dayMs,
      '30D': 30 * dayMs,
      '90D': 90 * dayMs,
      '1Y': 365 * dayMs,
      All: Number.MAX_SAFE_INTEGER,
    };
    const filterMs = timeFilterMap[timeFilter] || timeFilterMap['30D'];
    const cutoff = Date.now() - filterMs;
    const inWindow = aggregatedSeries.filter((p) => p.time >= cutoff);

    // Long-lived bots can accumulate thousands of points; thin evenly but
    // always keep the last point (the current value).
    const MAX_POINTS = 500;
    const step = Math.ceil(inWindow.length / MAX_POINTS);
    const sampled =
      step > 1
        ? inWindow.filter(
            (_, i) => i % step === 0 || i === inWindow.length - 1
          )
        : inWindow;

    return sampled.map((point) => ({
      date: new Date(point.time).toISOString(),
      profit: point.profit,
      equity: point.equity,
      label: new Date(point.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      fullDate: new Date(point.time).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    }));
  }, [aggregatedSeries, timeFilter]);

  const profitSeries = useMemo(
    () => chartSeries.map((p) => ({ ...p, value: p.profit })),
    [chartSeries]
  );
  const equitySeries = useMemo(
    () => chartSeries.map((p) => ({ ...p, value: p.equity })),
    [chartSeries]
  );

  // Helper: compute allocated capital per bot from available fields
  const getAllocatedCapital = (bot: DCABot): number => {
    // Prefer assets.required.quote (array of {key,value}) when present
    const requiredQuote = bot.assets?.required?.quote;
    const requiredSum = Array.isArray(requiredQuote)
      ? requiredQuote.reduce(
          (sum: number, a: { key?: string; value?: number }) =>
            sum + (a?.value || 0),
          0
        )
      : 0;

    if (requiredSum > 0) return requiredSum;

    // Fallback to usage.max.quote or usage.current.quote
    const usageMax = bot.usage?.max?.quote || 0;
    if (usageMax > 0) return usageMax;

    const usageCurrent = bot.usage?.current?.quote || 0;
    if (usageCurrent > 0) return usageCurrent;

    // As a last resort, try initialBalances.quote sum
    const initQuoteArr = bot.initialBalances?.quote;
    const initSum = Array.isArray(initQuoteArr)
      ? initQuoteArr.reduce(
          (sum: number, a: { key?: string; value?: number }) =>
            sum + (a?.value || 0),
          0
        )
      : 0;
    return initSum || 0;
  };

  // Calculate aggregated performance stats from all bots (DCA + Combo)
  const performanceStats = useMemo(() => {
    let totalTrades = 0;
    let totalRealizedProfit = 0;
    let totalAllocatedCapital = 0; // Prefer required.quote first

    const selected = (allBots || []).filter((b) =>
      selectedBots.includes(b._id)
    );

    selected.forEach((bot) => {
      totalRealizedProfit += bot.profit?.totalUsd || 0;
      // Not all bot types return dealsInBot; default to 0 when missing
      totalTrades += bot.dealsInBot?.all || 0;
      totalAllocatedCapital += getAllocatedCapital(bot);
    });

    // Net result percent: realized profit over allocated capital
    const netResultPercent =
      totalAllocatedCapital > 0
        ? (totalRealizedProfit / totalAllocatedCapital) * 100
        : null;

    // Average daily return percent: sum(profit_i/days_i) / totalAllocated * 100
    const nowMs = Date.now();
    const totalDailyProfitUsd = selected.reduce((sum, bot) => {
      const createdMs = bot.created ? new Date(bot.created).getTime() : nowMs;
      const days = Math.max(1, (nowMs - createdMs) / (1000 * 60 * 60 * 24));
      const botProfit = bot.profit?.totalUsd || 0;
      return sum + botProfit / days;
    }, 0);

    const avgDailyReturnPercent =
      totalAllocatedCapital > 0
        ? (totalDailyProfitUsd / totalAllocatedCapital) * 100
        : null;

    // Max equity drawdown from aggregated equity series within current filter window
    const values = equitySeries.map((p) => p.value);
    let maxDrawdownPercent: number | null = null;
    if (values.length > 1) {
      let peak = values[0];
      let maxDd = 0;
      for (let i = 1; i < values.length; i++) {
        const v = values[i];
        if (v > peak) peak = v;
        const dd = peak > 0 ? (peak - v) / peak : 0;
        if (dd > maxDd) maxDd = dd;
      }
      maxDrawdownPercent = maxDd * 100;
    }

    // Win rate / profit factor / max deal duration from the per-bot stats
    // blocks fetched by id
    let winDeals = 0;
    let lossDeals = 0;
    let grossProfitUsd = 0;
    let grossLossUsd = 0;
    let maxDealDurationMs = 0;
    selectedBots.forEach((id) => {
      const s = botStatsData.get(id);
      if (!s) return;
      winDeals += s.winDeals;
      lossDeals += s.lossDeals;
      grossProfitUsd += s.grossProfitUsd;
      grossLossUsd += Math.abs(s.grossLossUsd);
      if (s.maxDealDurationMs > maxDealDurationMs) {
        maxDealDurationMs = s.maxDealDurationMs;
      }
    });
    const closedDeals = winDeals + lossDeals;

    return {
      totalTrades,
      netResultPercent,
      avgDailyReturnPercent,
      realizedProfitUsd: totalRealizedProfit,
      allocatedCapitalUsd: totalAllocatedCapital,
      maxEquityDrawdownPercent: maxDrawdownPercent,
      winRatePercent:
        closedDeals > 0 ? (winDeals / closedDeals) * 100 : null,
      profitFactor: grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null,
      maxDealDurationMinutes:
        maxDealDurationMs > 0
          ? Math.round(maxDealDurationMs / (60 * 1000))
          : null,
    };
  }, [allBots, selectedBots, botStatsData, equitySeries]);

  // Format duration from minutes to readable format
  const formatDuration = (minutes: number) => {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    const mins = minutes % 60;

    return `${days}D ${hours}H ${mins}MIN`;
  };

  // Create stats data for WidgetStats component
  const createStatsData = () => {
    const nr =
      performanceStats.netResultPercent != null
        ? `${performanceStats.netResultPercent.toFixed(1)}%`
        : '—';
    const adr =
      performanceStats.avgDailyReturnPercent != null
        ? `${performanceStats.avgDailyReturnPercent.toFixed(2)}%`
        : '—';
    const mdd =
      performanceStats.maxEquityDrawdownPercent != null
        ? `${(-Math.abs(performanceStats.maxEquityDrawdownPercent)).toFixed(2)}%`
        : '—';

    // Profit/loss coloring by sign; zero / unavailable stays neutral
    const toneBySign = (
      v: number | null
    ): 'success' | 'destructive' | 'neutral' =>
      v == null || v === 0 ? 'neutral' : v > 0 ? 'success' : 'destructive';

    return [
      {
        label: 'Total Trades',
        value: performanceStats.totalTrades,
        textValue: performanceStats.totalTrades.toString(),
        showSign: false,
      },
      {
        label: 'Net Result',
        value: 0,
        textValue: nr,
        tone: toneBySign(performanceStats.netResultPercent),
        showSign: false,
      },
      {
        label: 'Avg Daily Return',
        value: 0,
        textValue: adr,
        tone: toneBySign(performanceStats.avgDailyReturnPercent),
        showSign: false,
      },
      {
        label: 'Realized Profit',
        value: performanceStats.realizedProfitUsd || 0,
        showSign: true,
      },
      {
        label: 'Max Equity Drawdown',
        value: 0,
        textValue: mdd,
        tone:
          performanceStats.maxEquityDrawdownPercent != null &&
          performanceStats.maxEquityDrawdownPercent !== 0
            ? ('destructive' as const)
            : ('neutral' as const),
        showSign: false,
      },
      {
        label: 'Allocated Capital',
        value: performanceStats.allocatedCapitalUsd || 0,
        showSign: false,
      },
      {
        label: 'Max Deal Duration',
        value: 0,
        textValue:
          performanceStats.maxDealDurationMinutes != null
            ? formatDuration(performanceStats.maxDealDurationMinutes)
            : '—',
        showSign: false,
      },
      {
        label: 'Win Rate',
        value: 0,
        textValue:
          performanceStats.winRatePercent != null
            ? `${performanceStats.winRatePercent.toFixed(1)}%`
            : '—',
        showSign: false,
      },
      {
        label: 'Profit Factor',
        value: 0,
        textValue:
          performanceStats.profitFactor != null
            ? performanceStats.profitFactor.toFixed(2)
            : '—',
        showSign: false,
      },
    ];
  };

  // Filter handlers - only for bot selection
  const handleBotToggle = (botId: string) => {
    const isSelected = selectedBots.includes(botId);

    if (isSelected) {
      const newSelection = selectedBots.filter((id) => id !== botId);
      setSelectedBots(newSelection);
    } else {
      const newSelection = [...selectedBots, botId];
      setSelectedBots(newSelection);
    }
  };

  const handleRemoveBot = (botId: string) => {
    const updated = selectedBots.filter((id) => id !== botId);
    setSelectedBots(updated);
  };

  // Use the widget display name hook for dynamic names
  const dynamicDisplayName = useWidgetDisplayName({
    id: widgetId,
    type: 'bot-stats-advanced',
    title:
      typeof customName === 'string'
        ? customName || 'Advanced Bot Stats'
        : 'Advanced Bot Stats',
  });

  // Calculate header value: fall back to sums when no series exists
  const activeSeries = chartTab === 'profit' ? profitSeries : equitySeries;

  // Sums for fallback
  const selected = (allBots || []).filter((b) => selectedBots.includes(b._id));
  const sumRealizedProfit = selected.reduce(
    (sum, b) => sum + (b.profit?.totalUsd || 0),
    0
  );
  const sumAllocated = selected.reduce(
    (sum, b) => sum + getAllocatedCapital(b),
    0
  );

  const computedCurrent =
    activeSeries.length > 0
      ? activeSeries[activeSeries.length - 1].value
      : chartTab === 'profit'
        ? sumRealizedProfit
        : sumAllocated;
  const computedPrev =
    activeSeries.length > 1
      ? activeSeries[activeSeries.length - 2].value
      : computedCurrent;
  const change = computedCurrent - computedPrev;
  const changePercent = computedPrev > 0 ? (change / computedPrev) * 100 : 0;

  const headerValue = {
    primary: computedCurrent,
    secondary: 'USD',
    change: {
      value: change,
      percentage: changePercent,
      isPositive: change >= 0,
    },
  };

  const content = (
    <>
      <div className="flex flex-col h-full p-md bg-card @container">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">
              Loading bot data...
            </span>
          </div>
        ) : hasError ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <p className="text-destructive">Error loading bot data</p>
              <p className="text-sm mt-1">
                Please check your connection and try again
              </p>
              <button
                onClick={() => {
                  // The generic refresh system will handle this
                  window.location.reload();
                }}
                className="mt-3 px-4 py-2 text-sm bg-muted rounded hover:bg-muted/80 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : selectedBots.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <p>Start by adding a bot</p>
              <p className="text-sm mt-1">
                Select individual DCA and Combo bots to view stats
              </p>
              <button
                onClick={() => {
                  setShowBotDialog(true);
                }}
                className="mt-3 px-4 py-2 text-sm bg-muted rounded hover:bg-muted/80 transition-colors"
              >
                Add Bots
              </button>
            </div>
          </div>
        ) : allBots.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <p>No bots found</p>
              <p className="text-sm mt-1">
                Create some bots to see statistics here
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Section - always shown when bots are selected */}
            <WidgetStats stats={createStatsData()} className="mb-6" />

            {/* Chart with Tabs (shown only if data exists) */}
            <div className="flex-1 mb-6 min-h-[200px]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-muted-foreground text-sm font-medium">
                  {chartTab === 'profit' ? 'Accumulated Profit' : 'Equity'} (
                  {selectedBots.length} Selected)
                </h4>
                <Tabs
                  value={chartTab as string}
                  onValueChange={(v: string) =>
                    setChartTab(v === 'equity' ? 'equity' : 'profit')
                  }
                >
                  <TabsList>
                    <TabsTrigger value="profit">Profit</TabsTrigger>
                    <TabsTrigger value="equity">Equity</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="w-full h-full">
                {activeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={activeSeries}
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="equityGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={
                              chartTab === 'profit'
                                ? colors.success
                                : colors.info
                            }
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={
                              chartTab === 'profit'
                                ? colors.success
                                : colors.info
                            }
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_COLORS.stroke}
                        opacity={0.3}
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: 'currentColor',
                          fontSize: 10,
                          className: 'text-muted-foreground',
                        }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: 'currentColor',
                          fontSize: 8,
                          className: 'text-muted-foreground',
                        }}
                        tickFormatter={(value) =>
                          Math.abs(value) >= 1000
                            ? `$${(value / 1000).toFixed(1)}k`
                            : `$${value.toFixed(Math.abs(value) < 10 ? 2 : 0)}`
                        }
                        width={50}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="value"
                        stroke={
                          chartTab === 'profit' ? colors.success : colors.info
                        }
                        strokeWidth={2}
                        fill="url(#equityGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <div className="text-center">
                      <p>No chart data available</p>
                      <p className="text-sm mt-1">
                        Historical data is not available for the selected bots
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center justify-center gap-1">
              {['7D', '30D', '90D', '1Y', 'All'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    filter === timeFilter
                      ? 'bg-muted text-foreground border border-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {/* Global Bot Selection Dialog (always mounted) */}
      <BotSelectionDialog
        isOpen={showBotDialog}
        onClose={() => setShowBotDialog(false)}
        items={availableBots}
        selectedItems={selectedBots}
        onItemToggle={handleBotToggle}
      />
    </>
  );

  // Check if any filters are active (not default state)
  const filtersActive = selectedBots.length > 0;

  // Clear all filters to default state
  const clearAllFilters = () => {
    setSelectedBots([]);
  };

  // Create filter content with custom bot section using bot type chips
  const filterContent = (
    <div className="space-y-md">
      {/* Custom Bot Filter Section */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">
          Selected Bots (DCA & Combo)
        </h4>
        <div className="flex flex-wrap gap-xs">
          {/* Display selected items */}
          {selectedBots.map((itemId) => {
            const item = availableBots.find((i) => i.id === itemId);
            if (!item) return null;

            return (
              <div
                key={itemId}
                className="bg-card border border-border rounded-lg p-xs flex items-center gap-xs min-w-0"
              >
                <div className="flex items-center gap-xs flex-1 min-w-0">
                  <BotTypeChip
                    botType={item.botType || BotTypesEnum.dca}
                    iconOnly={true}
                    size="xs"
                  />
                  <span className="text-foreground text-xs font-medium truncate">
                    {item.name}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveBot(itemId)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Add Button */}
          <button
            onClick={() => {
              setShowBotDialog(true);
            }}
            className="border border-border rounded-lg p-xs flex items-center gap-xs text-muted-foreground hover:text-foreground bg-card hover:border-primary transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs">Add specific bots</span>
          </button>
        </div>
      </div>

      {/* Selection dialog rendered globally above */}
    </div>
  );

  const wrapperProps = {
    metadata: {
      ...getWidgetMetadata('bot-stats-advanced'), // Using correct metadata for advanced bot stats
      id: widgetId,
      title:
        typeof customName === 'string'
          ? customName || 'Advanced Bot Stats'
          : 'Advanced Bot Stats',
      displayName: dynamicDisplayName,
      value: headerValue,
      hasOptions: true,
      hasFilters: true,
      filterContent,
      filtersActive,
      onClearFilters: clearAllFilters,
    },
    isEditable,
    customName: typeof customName === 'string' ? customName : '',
    onCustomNameChange: (value: string) => setCustomName(value),
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && {
      menuActions: {
        ...menuActions,
      },
    }),
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default BotStatsAdvanced;
