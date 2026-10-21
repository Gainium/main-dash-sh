// Types for real Hedge DCA Bot data from GraphQL API
import { logger } from '@/lib/loggerInstance';
import { formatUsdAsReporting } from '@/utils/reportingCurrency';
import type { DcaBotStats } from './dcaBot';
import {
  StrategyEnum,
  type ComboBot,
  type DCABot,
  type HedgeBot,
  type Prices,
} from './index';

/**
 * Helper function to calculate working time from working shifts
 * @param workingShift - Array of working shifts with start and end times
 * @returns Total working time in milliseconds
 */
export function calculateWorkingTime(
  workingShift?: Array<{ start?: number; end?: number }>
): number {
  if (!workingShift || workingShift.length === 0) {
    return 0;
  }

  return workingShift.reduce((acc, shift) => {
    if (shift.start) {
      if (shift.end) {
        return acc + (shift.end - shift.start);
      } else {
        // Active shift - use current time
        return acc + (Date.now() - shift.start);
      }
    }
    return acc;
  }, 0);
}

/**
 * Helper function to format working time to human-readable string
 * @param workingTimeMs - Working time in milliseconds
 * @returns Formatted string like "5 days" or "3 hours"
 */
export function formatWorkingTime(workingTimeMs: number): string {
  if (workingTimeMs <= 0) {
    return 'N/A';
  }

  const diffDays = Math.floor(workingTimeMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(
    (workingTimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const diffMinutes = Math.floor(workingTimeMs / (1000 * 60));

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day' : `${diffDays} days`;
  } else if (diffHours > 0) {
    return diffHours === 1 ? '1 hour' : `${diffHours} hours`;
  } else {
    return diffMinutes === 1 ? '1 minute' : `${diffMinutes} minutes`;
  }
}

/**
 * Helper function to calculate invested amount for a bot (handles futures vs spot)
 * Based on old dashboard logic from botData.tsx lines 1900-1920
 */
type StrategyType = 'LONG' | 'SHORT' | StrategyEnum;

type BotSettings = {
  futures?: boolean;
  coinm?: boolean;
  strategy?: StrategyType;
  name?: string;
};

interface ProfitStats {
  grossProfit?: number;
  maxDealProfit?: number;
}

interface LossStats {
  grossLoss?: number;
  maxDealLoss?: number;
  maxDrawdown?: number;
}

interface DealsCounts {
  profit?: number;
  loss?: number;
}

interface NumericalStats {
  profit?: ProfitStats;
  loss?: LossStats;
  deals?: DealsCounts;
  // Other fields may exist (e.g., general, chart aggregations), but are not required here
}

function calculateBotInvestedAmount(
  bot: DCABot | ComboBot,
  usdRate: number
): number {
  const strategy = bot.settings?.strategy as StrategyType | undefined;
  const strategyStr = String(strategy ?? '').toLowerCase();
  const isLongStrategy = strategyStr === 'long';

  const settings = bot.settings as unknown as BotSettings;

  if (settings?.futures) {
    // Futures bot
    if (settings.coinm) {
      return (bot.usage?.max?.base ?? 0) * usdRate;
    } else {
      return (bot.usage?.max?.quote ?? 0) * usdRate;
    }
  } else {
    // Spot bot
    if (isLongStrategy) {
      return (bot.usage?.max?.quote ?? 0) * usdRate;
    } else {
      return (bot.usage?.max?.base ?? 0) * usdRate;
    }
  }
}

/**
 * Helper function to get USD rate from prices
 */
function getUsdRate(symbol: string | undefined, latestPrices?: Prices): number {
  if (!symbol || !latestPrices) {
    return 1;
  }

  // Try to find exact symbol match
  const priceData = latestPrices.find(
    (p) => p.symbol === symbol || `${p.symbol}USDT` === symbol
  );

  return priceData?.price ?? 1;
}

/**
 * Helper function to aggregate stats from long and short bots
 */
function aggregateStats(
  longBot: DCABot | ComboBot,
  shortBot: DCABot | ComboBot
) {
  const longStats = longBot.stats?.numerical as unknown as
    | NumericalStats
    | undefined;
  const shortStats = shortBot.stats?.numerical as unknown as
    | NumericalStats
    | undefined;

  const longProfit = longStats?.profit;
  const shortProfit = shortStats?.profit;
  const longLoss = longStats?.loss;
  const shortLoss = shortStats?.loss;

  // Aggregate deal counts
  const dealsProfit =
    (longStats?.deals?.profit ?? 0) + (shortStats?.deals?.profit ?? 0);
  const dealsLoss =
    (longStats?.deals?.loss ?? 0) + (shortStats?.deals?.loss ?? 0);

  // Aggregate profit/loss values
  const grossProfit =
    (longProfit?.grossProfit ?? 0) + (shortProfit?.grossProfit ?? 0);
  const grossLoss = (longLoss?.grossLoss ?? 0) + (shortLoss?.grossLoss ?? 0);

  // Use max/min for extremes
  const maxDealProfit = Math.max(
    longProfit?.maxDealProfit ?? 0,
    shortProfit?.maxDealProfit ?? 0
  );
  const maxDealLoss = Math.min(
    longLoss?.maxDealLoss ?? 0,
    shortLoss?.maxDealLoss ?? 0
  );
  const maxDrawdown = Math.min(
    longLoss?.maxDrawdown ?? 0,
    shortLoss?.maxDrawdown ?? 0
  );

  return {
    deals: {
      profit: dealsProfit,
      loss: dealsLoss,
    },
    profit: {
      grossProfit,
      maxDealProfit,
    },
    loss: {
      grossLoss,
      maxDealLoss,
      maxDrawdown,
    },
  };
}

/**
 * Transform HedgeBot to the format expected by the UI
 * Aggregates long + short bot data following old dashboard logic (botData.tsx lines 1883-1990)
 */
export function transformHedgeBotToBot(
  hedgeBot: HedgeBot,
  latestPrices?: Prices,
  _userExchanges?: Array<{ uuid: string; name?: string; provider?: string }>
): {
  id: string;
  name: string;
  type: 'signal' | 'grid' | 'dca' | 'combo';
  exchange: string;
  exchangeUUID: string;
  symbol: string;
  symbols: string[];
  profit: number;
  profitUsd: number;
  pnlPercent: number;
  invested: number;
  investedUsd: number;
  runtime: string;
  status: 'active' | 'paused' | 'stopped' | 'error';
  scanner: string;
  color: string;
  // Additional fields to match transformDcaBotToBot structure
  pair: string;
  coinPair: string;
  strategy: string;
  currentCost: number;
  maxCost: number;
  totalProfitUsd: number;
  totalProfitPercent: number;
  value: number;
  unrealizedValue: number;
  avgDaily: number;
  avgDailyPerc: number;
  annualizedReturn: number;
  tradingTime: string;
  created: string;
  usage: number;
  usageTooltip?: string;
  deals: number;
  activeDeals?: number;
  outerGaugePercent: number;
  // Combo-specific properties for drawer integration
  openTrades: number;
  closedTrades: number;
  currentBaseUsage: number;
  maxBaseUsage: number;
  rawData: {
    stats: {
      numerical?: NumericalStats;
      chart?: DcaBotStats['chart'];
    };
  };
} {
  // Extract long and short bots from hedgeBot.bots array
  const longBot = hedgeBot.bots?.find(
    (b) => String(b.settings?.strategy ?? '').toLowerCase() === 'long'
  );
  const shortBot = hedgeBot.bots?.find(
    (b) => String(b.settings?.strategy ?? '').toLowerCase() === 'short'
  );

  if (!longBot || !shortBot) {
    if (import.meta.env.DEV) {
      logger.warn(
        '[transformHedgeBotToBot] Hedge bot missing long or short bot',
        {
          botId: hedgeBot._id,
          hasLongBot: !!longBot,
          hasShortBot: !!shortBot,
        }
      );
    }
    // Fallback: use old simple calculation if bots array is incomplete
    const symbolData = hedgeBot.symbol?.[0]?.value?.symbol || 'Unknown';
    const allSymbols: string[] = [];
    if (Array.isArray(hedgeBot.symbol)) {
      allSymbols.push(...hedgeBot.symbol.map((s) => s.value?.symbol || s.key));
    }
    const uniqueSymbols = [...new Set(allSymbols.filter(Boolean))];

    const totalUsd = hedgeBot.profit?.totalUsd || 0;
    const sumQuote = (
      q: number | Array<{ value?: number }> | undefined
    ): number => {
      if (typeof q === 'number') return q || 0;
      if (Array.isArray(q))
        return q.reduce((sum, item) => sum + (item?.value ?? 0), 0);
      return 0;
    };
    const longInvestment = sumQuote(hedgeBot.initialBalances?.long?.quote);
    const shortInvestment = sumQuote(hedgeBot.initialBalances?.short?.quote);
    const totalInvestment = longInvestment + shortInvestment;

    return {
      id: hedgeBot._id || 'unknown',
      name: hedgeBot._id ? `Hedge Bot ${hedgeBot._id.slice(-6)}` : 'Hedge Bot',
      type: 'dca',
      exchange: hedgeBot.bots?.[0]?.exchange || 'Unknown',
      exchangeUUID: hedgeBot.bots?.[0]?.exchangeUUID || '',
      symbol: symbolData,
      symbols: uniqueSymbols,
      profit: totalUsd * 100000000,
      profitUsd: totalUsd,
      pnlPercent: totalInvestment > 0 ? (totalUsd / totalInvestment) * 100 : 0,
      invested: totalInvestment * 100000000,
      investedUsd: totalInvestment,
      runtime: formatWorkingTime(calculateWorkingTime(hedgeBot.workingShift)),
      status: hedgeBot.status === 'closed' ? 'stopped' : 'active',
      scanner: 'Hedge Strategy',
      color: 'gray',
      pair: symbolData,
      coinPair: symbolData,
      strategy: 'hedge',
      currentCost: totalInvestment,
      maxCost: totalInvestment,
      totalProfitUsd: totalUsd,
      totalProfitPercent:
        totalInvestment > 0 ? (totalUsd / totalInvestment) * 100 : 0,
      value: totalInvestment + totalUsd,
      unrealizedValue: 0,
      avgDaily: 0,
      avgDailyPerc: 0,
      annualizedReturn: 0,
      tradingTime: formatWorkingTime(
        calculateWorkingTime(hedgeBot.workingShift)
      ),
      created: hedgeBot.created || new Date().toISOString(),
      usage: totalInvestment,
      deals: hedgeBot.dealsInBot?.all ?? 0,
      activeDeals: hedgeBot.dealsInBot?.active ?? 0,
      outerGaugePercent: 0,
      // Combo-specific properties for drawer integration
      openTrades: hedgeBot.dealsInBot?.active ?? 0,
      closedTrades:
        (hedgeBot.dealsInBot?.all ?? 0) - (hedgeBot.dealsInBot?.active ?? 0),
      currentBaseUsage: 0,
      maxBaseUsage: 0,
      rawData: {
        stats: {
          chart: [],
        },
      },
    };
  }

  // === AGGREGATION LOGIC (following old dashboard botData.tsx lines 1883-1990) ===

  // 1. Get profit - EXACTLY as old dashboard (line 1886)
  // Aggregate profit from both child bots
  const totalProfitUsd =
    (longBot.profit?.totalUsd ?? 0) + (shortBot.profit?.totalUsd ?? 0);

  // 2. Get symbols
  const symbolLong = longBot.symbol?.[0]?.value?.symbol || '';
  const symbolShort = shortBot.symbol?.[0]?.value?.symbol || '';
  const primarySymbol = symbolLong || symbolShort || 'Unknown';
  // Use Set to ensure unique symbols (avoid duplicate keys in React)
  const allSymbols = [...new Set([symbolLong, symbolShort].filter(Boolean))];

  // 3. Get USD rates (use latestPrices if provided, otherwise default to 1)
  const usdRateLong = getUsdRate(symbolLong, latestPrices);
  const usdRateShort = getUsdRate(symbolShort, latestPrices);

  // 4. Calculate invested amounts (EXACT same as old dashboard)
  const investedLongUsd = calculateBotInvestedAmount(longBot, usdRateLong);
  const investedShortUsd = calculateBotInvestedAmount(shortBot, usdRateShort);
  const investedUsd = investedLongUsd + investedShortUsd;

  // 5. Calculate current value
  const value = investedUsd + totalProfitUsd;

  // 6. Calculate PnL percentage
  const pnlPercent = investedUsd > 0 ? (totalProfitUsd / investedUsd) * 100 : 0;

  // 7. Aggregate deals
  const activeDeals =
    (longBot.dealsInBot?.active ?? 0) + (shortBot.dealsInBot?.active ?? 0);
  const totalDeals =
    (longBot.dealsInBot?.all ?? 0) + (shortBot.dealsInBot?.all ?? 0);
  const closedDeals = totalDeals - activeDeals;

  // 8. Aggregate usage (for combo bots)
  const longUsage = 'usage' in longBot ? longBot.usage : null;
  const shortUsage = 'usage' in shortBot ? shortBot.usage : null;
  const currentBaseUsage =
    (longUsage?.current?.base || 0) + (shortUsage?.current?.base || 0);
  const maxBaseUsage =
    (longUsage?.max?.base || 0) + (shortUsage?.max?.base || 0);

  // 9. Calculate working time (use longest, EXACT same as old dashboard)
  const longWorkingTime = calculateWorkingTime(longBot.workingShift);
  const shortWorkingTime = calculateWorkingTime(shortBot.workingShift);
  const workingTimeMs = Math.max(longWorkingTime, shortWorkingTime);
  const workingDays = Math.max(1, workingTimeMs / (1000 * 60 * 60 * 24));

  // 10. Calculate avg daily and annualized return
  const avgDaily = workingDays > 0 ? totalProfitUsd / workingDays : 0;
  const avgDailyPerc = investedUsd > 0 ? (avgDaily / investedUsd) * 100 : 0;
  const annualizedReturn = avgDailyPerc * 365;

  // 10. Aggregate stats (if available)
  const aggregatedStats = aggregateStats(longBot, shortBot);

  // 11. Map status
  const mapStatus = (
    status: string
  ): 'active' | 'paused' | 'stopped' | 'error' => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'range':
      case 'monitoring':
        return 'active';
      case 'closed':
        return 'stopped';
      case 'error':
        return 'error';
      default:
        return 'stopped';
    }
  };

  // 12. Generate name
  const generateName = (): string => {
    if (longBot.settings?.name) {
      return `Hedge ${longBot.settings.name}`;
    }
    if (hedgeBot._id) {
      return `Hedge Bot ${hedgeBot._id.slice(-6)}`;
    }
    return 'Hedge Bot';
  };

  // 11b. Derive final status with leg-aware fallback
  const longRaw = (longBot as DCABot | ComboBot).status as string | undefined;
  const shortRaw = (shortBot as DCABot | ComboBot).status as string | undefined;
  const isLegActive = (s?: string) =>
    ['open', 'range', 'monitoring'].includes(String(s ?? '').toLowerCase());
  const anyLegError =
    String(longRaw ?? '').toLowerCase() === 'error' ||
    String(shortRaw ?? '').toLowerCase() === 'error';
  const anyLegActive = isLegActive(longRaw) || isLegActive(shortRaw);
  let finalStatus = mapStatus(hedgeBot.status);
  if (anyLegError) {
    finalStatus = 'error';
  } else if (finalStatus !== 'active' && anyLegActive) {
    // Parent says stopped/unknown but legs are active → show active
    finalStatus = 'active';
  }

  return {
    id: hedgeBot._id,
    name: generateName(),
    type: hedgeBot.type === 'hedgeCombo' ? 'combo' : 'dca',
    exchange: longBot.exchange,
    exchangeUUID: longBot.exchangeUUID || '',
    symbol: primarySymbol,
    symbols: allSymbols,
    profit: totalProfitUsd * 100000000, // Convert to base units
    profitUsd: totalProfitUsd,
    pnlPercent: pnlPercent,
    invested: investedUsd * 100000000,
    investedUsd: investedUsd,
    runtime: formatWorkingTime(workingTimeMs),
    status: finalStatus,
    scanner: 'Hedge Strategy',
    color: totalProfitUsd >= 0 ? 'green' : 'red',

    // Additional fields matching transformDcaBotToBot structure
    pair: primarySymbol,
    coinPair: primarySymbol,
    strategy: 'hedge',
    currentCost: investedUsd,
    maxCost: investedUsd,
    totalProfitUsd: totalProfitUsd,
    totalProfitPercent: pnlPercent,
    value: value,
    unrealizedValue: 0, // TODO: Calculate if needed
    avgDaily: avgDaily,
    avgDailyPerc: avgDailyPerc,
    annualizedReturn: annualizedReturn,
    tradingTime: formatWorkingTime(workingTimeMs),
    created: hedgeBot.created || new Date().toISOString(),
    usage: investedUsd,
    usageTooltip: `Long: ${formatUsdAsReporting(investedLongUsd)} | Short: ${formatUsdAsReporting(investedShortUsd)}`,
    deals: totalDeals,
    activeDeals: activeDeals,
    outerGaugePercent: investedUsd > 0 ? (value / investedUsd) * 100 : 0,

    // Combo-specific properties for drawer integration
    openTrades: activeDeals, // Number of active trades
    closedTrades: closedDeals, // Number of closed trades
    currentBaseUsage: currentBaseUsage, // Current base usage (for combo bots)
    maxBaseUsage: maxBaseUsage, // Max base usage (for combo bots)

    // Raw data for charts and additional stats
    rawData: {
      stats: {
        numerical: {
          ...aggregatedStats,
          general: {
            avgDaily: { usd: avgDaily },
            avgDailyPerc: avgDailyPerc / 100, // Convert back to decimal
            netProfitPerc: pnlPercent / 100, // Convert back to decimal
          },
        } as NumericalStats,
        chart: longBot.stats?.chart || [], // Use long bot's chart for now
      },
    },
  };
}

export interface HedgeDcaBotListResponse {
  status: string;
  reason: string | null;
  total: number;
  data: HedgeBot[];
}

export interface HedgeDcaBotListData {
  hedgeDCABotList: HedgeDcaBotListResponse;
}
