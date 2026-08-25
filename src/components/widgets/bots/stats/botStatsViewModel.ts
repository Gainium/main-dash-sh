/**
 * Adapter between a live bot's `stats` / `symbolStats` block and the
 * Statistics tab UI. Pure, framework-free — the components render ONLY
 * against the interfaces below.
 *
 * This is the redesign's port of legacy `main-dash`'s
 * `components/dcabot/components/botStats.tsx` memo chain
 * (`generalBlockData` / `profitLossBlockData` / `performanceBlockData` /
 * `dcaBlockData` / `symbolStatsData`), which fed the BACKTEST result blocks
 * with live-bot data. Same idea here: the numbers below map onto the same
 * visual templates the backtest results modal uses.
 *
 * Two conventions inherited from the backend that are easy to get wrong:
 *  - every `*Perc` on `BotStats` is a FRACTION (0.0009 = 0.09%), so each one
 *    is multiplied by 100 exactly once, here.
 *  - `ratios.profitFactor === -1` is the sentinel for "no losses" → Infinity.
 */

import { formatDuration } from '@/utils/formatters';
import { math } from '@/utils/math';
import { StrategyEnum, type BotStats, type BotSymbolsStats } from '@/types';

/** The subset of the drawer bot this adapter reads. Kept structural so it
 *  accepts DCA / combo / hedge drawer bots without a union import. */
export interface BotStatsSourceBot {
  profit?: { total?: number; totalUsd?: number };
  settings?: {
    strategy?: string;
    futures?: unknown;
    coinm?: unknown;
    profitCurrency?: string;
    useDca?: boolean;
    useMulti?: boolean;
  };
  /** Flat assets when the adapter set them; otherwise read off `symbol[0]`. */
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
  /** The bot's pairs — `transformDcaBotToBot` leaves the flat asset fields
   *  unset, so this is the actual source for single-pair bots. */
  symbol?: Array<{ value?: { baseAsset?: string; quoteAsset?: string } }>;
  /** Precomputed by transformDcaBotToBot — avg daily profit in USD. */
  avgDaily?: number | undefined;
  /** Precomputed by transformDcaBotToBot — avg daily as a PERCENT (already ×100). */
  avgDailyPerc?: number | undefined;
  /** Precomputed by transformDcaBotToBot — annualized return as a PERCENT. */
  annualizedReturn?: number | undefined;
  /** Unrealized (open) P&L in USD and as a PERCENT. */
  unPnl?: number | undefined;
  unPnlPerc?: number | undefined;
  /** Open deal count. */
  dealsInBot?: { active?: number; all?: number };
}

export interface BotStatsHeadlineVM {
  /** Backend letter grade (A+ … F). */
  confidenceGrade: string;
  /** Total closed deals — drives the confidence-grade scale position. */
  closedDeals: number;

  netPerc: number;
  netUsd: number;
  netAsset: number;

  avgDailyPerc: number;
  avgDailyUsd: number;

  openPnlPerc: number;
  openPnlUsd: number;

  maxEquityDdPerc: number | null;
  maxEquityDdUsd: number | null;

  maxDealDuration: string;
  workingTime: string;
  dealsPerDay: number;

  annualizedPerc: number | null;
  profitFactor: number;

  wins: number;
  losses: number;
  open: number;
}

export interface BotStatsBreakdownVM {
  profitSign: string;
  usdOnly: boolean;
  showDca: boolean;

  general: {
    netPerc: number;
    netText: string;
    avgDailyPerc: number;
    avgDailyText: string;
    annualizedPerc: number | null;
    dealsText: string;
    maxDealDuration: string;
    dealsPerDay: number;
    openPnlPerc: number;
    openPnlText: string;
    workingTime: string;
  };

  winners: {
    count: number;
    winRate: number;
    grossProfitPerc: number;
    grossProfitText: string;
    maxDealProfitPerc: number;
    maxDealProfitText: string;
    avgDealProfitPerc: number;
    avgDealProfitText: string;
    maxRunUpPerc: number;
    maxRunUpText: string;
    maxConsecutiveWins: number;
    avgWinningTradeDuration: string;
    maxWinningTradeDuration: string;
  };

  losers: {
    count: number;
    grossLossPerc: number;
    grossLossText: string;
    maxDealLossPerc: number;
    maxDealLossText: string;
    avgDealLossPerc: number;
    avgDealLossText: string;
    maxRealizedDdPerc: number;
    maxRealizedDdText: string;
    maxEquityDdPerc: number | null;
    maxEquityDdText: string | null;
    maxConsecutiveLosses: number;
    avgLosingTradeDuration: string;
    maxLosingTradeDuration: string;
  };

  ratios: {
    profitFactor: number;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    cwr: number | null;
    buyAndHoldPerc: number;
    buyAndHoldText: string;
  };

  dca: {
    maxUsagePerc: number;
    maxTheoreticalUsage: string;
    maxRealUsage: string;
    avgDealUsage: string | null;
    maxDcaTriggered: number;
    avgDcaTriggered: number | null;
    coveredPriceDeviation: number;
    actualPriceDeviation: number;
  };
}

export interface BotSymbolStatsRowVM {
  pair: string;
  deals: { profit: number; loss: number };
  netProfitPerc: number;
  dailyReturnPerc: number;
  winRatePerc: number;
  profitFactor: number;
  maxDealDuration: string;
  avgDealDuration: string | null;
}

const PERC = (v: number | undefined | null): number =>
  typeof v === 'number' && Number.isFinite(v) ? math.round(v * 100) : 0;

const roundUsd = (v: number | undefined | null): number =>
  typeof v === 'number' && Number.isFinite(v) ? math.round(v, 3) : 0;

/**
 * Asset amounts need far more precision than USD ones — an ETH bot's gross
 * profit is `0.001553 ETH`, which 3 dp flattens to `0`. Legacy used the
 * exchange's own base/quote precision + 2; the drawer bot doesn't carry that,
 * so format to 8 dp (the widest any supported venue uses, and what
 * `BacktestStatsTab.formatBase` does) and trim the trailing zeros.
 */
const fmtAsset = (v: number | undefined | null): string => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) return '0';
  return v.toFixed(8).replace(/\.?0+$/, '');
};

/** `-1` is the backend's "no losing deals" sentinel for profit factor. */
const profitFactorOf = (raw: number | undefined | null): number =>
  raw === -1 ? Infinity : typeof raw === 'number' ? math.round(raw, 3) : 0;

const assetsOf = (bot: BotStatsSourceBot): { base: string; quote: string } => ({
  base: bot.baseAsset ?? bot.symbol?.[0]?.value?.baseAsset ?? '',
  quote: bot.quoteAsset ?? bot.symbol?.[0]?.value?.quoteAsset ?? '',
});

/** `StrategyEnum` is `'LONG'` / `'SHORT'` on the wire — never lowercase. */
const isShort = (bot: BotStatsSourceBot): boolean =>
  bot.settings?.strategy === StrategyEnum.short;
const isLong = (bot: BotStatsSourceBot): boolean =>
  bot.settings?.strategy === StrategyEnum.long;

/**
 * Which asset the bot books profit in. Mirrors legacy `botStats.tsx`:
 * futures inverse → base, futures linear → quote, spot → the bot's
 * configured profit currency.
 */
export const resolveProfitSign = (bot: BotStatsSourceBot): string => {
  const s = bot.settings;
  const { base, quote } = assetsOf(bot);
  if (!s) return quote;
  if (s.futures) return s.coinm ? base : quote;
  return s.profitCurrency === 'base' ? base : quote;
};

/**
 * Which asset DCA usage is denominated in. NOT the same as the profit sign on
 * spot shorts — a short bot spends base, not quote. Mirrors legacy's
 * `usageSign`.
 */
const resolveUsageSign = (bot: BotStatsSourceBot): string => {
  const s = bot.settings;
  const { base, quote } = assetsOf(bot);
  if (!s) return quote;
  if (s.futures) return s.coinm ? base : quote;
  return isShort(bot) ? base : quote;
};

/**
 * Multi-pair spot bots whose profit currency is the leg that varies per pair
 * can only be summed in USD — the asset column would be adding apples to
 * oranges. Legacy calls this `usdOnly`.
 */
const resolveUsdOnly = (bot: BotStatsSourceBot): boolean => {
  const s = bot.settings;
  if (!s?.useMulti || s.futures) return false;
  return (
    (isLong(bot) && s.profitCurrency === 'base') ||
    (isShort(bot) && s.profitCurrency === 'quote')
  );
};

/** `12.34 BTC ($1,234.00)`, or just the USD half for usd-only bots. */
const dualValue = (
  asset: number | undefined,
  usd: number | undefined,
  profitSign: string,
  usdOnly: boolean
): string =>
  usdOnly
    ? `$${roundUsd(usd)}`
    : `${fmtAsset(asset)}${profitSign ? ` ${profitSign}` : ''} ($${roundUsd(usd)})`;


/**
 * Net profit in the bot's profit currency.
 *
 * `bot.profit.total` is the direct field, but COMBO bots leave it at 0 and
 * book their profit into `pureBase`/`pureQuote`/`gridProfit` instead — which
 * rendered a misleading "0 ETH ($1.55)". Fall back to the stats block's own
 * gross profit − gross loss: the same quantity, and it agrees with the USD
 * figure beside it.
 */
const netAssetOf = (stats: BotStats, bot: BotStatsSourceBot): number => {
  const direct = bot.profit?.total ?? 0;
  if (direct !== 0) return direct;
  return (
    (stats.numerical.profit.grossProfit?.asset ?? 0) -
    (stats.numerical.loss.grossLoss?.asset ?? 0)
  );
};

export const buildBotStatsHeadline = (
  stats: BotStats,
  bot: BotStatsSourceBot
): BotStatsHeadlineVM => {
  const n = stats.numerical;
  const wins = n.deals.profit ?? 0;
  const losses = n.deals.loss ?? 0;
  const open = Math.max((bot.dealsInBot?.active ?? 0) | 0, 0);

  const hasEquityDd =
    typeof n.loss.maxEquityDrawdown !== 'undefined' &&
    typeof n.loss.maxEquityDrawdownPerc !== 'undefined';

  return {
    confidenceGrade: n.general.confidenceGrade || 'F',
    closedDeals: wins + losses,

    netPerc: PERC(n.general.netProfitPerc),
    netUsd: roundUsd(bot.profit?.totalUsd),
    netAsset: netAssetOf(stats, bot),

    // avgDaily* are already percent/USD on the transformed drawer bot.
    avgDailyPerc: math.round(bot.avgDailyPerc ?? 0),
    avgDailyUsd: roundUsd(bot.avgDaily),

    openPnlPerc: math.round(bot.unPnlPerc ?? 0),
    openPnlUsd: roundUsd(bot.unPnl),

    // Drawdown reads as a negative number in the UI.
    maxEquityDdPerc: hasEquityDd
      ? -Math.abs(PERC(n.loss.maxEquityDrawdownPerc))
      : null,
    maxEquityDdUsd: hasEquityDd ? roundUsd(n.loss.maxEquityDrawdown.usd) : null,

    maxDealDuration: formatDuration(stats.duration.general.maxDealDuration ?? 0),
    workingTime: formatDuration(stats.duration.general.workingTime ?? 0),
    dealsPerDay: math.round(stats.duration.general.dealsPerDay ?? 0, 2),

    annualizedPerc:
      typeof bot.annualizedReturn === 'number' &&
      Number.isFinite(bot.annualizedReturn)
        ? math.round(bot.annualizedReturn, 2)
        : null,
    profitFactor: profitFactorOf(n.ratios.profitFactor),

    wins,
    losses,
    open,
  };
};

export const buildBotStatsBreakdown = (
  stats: BotStats,
  bot: BotStatsSourceBot
): BotStatsBreakdownVM => {
  const n = stats.numerical;
  const d = stats.duration;
  const profitSign = resolveProfitSign(bot);
  const usageSign = resolveUsageSign(bot);
  const usdOnly = resolveUsdOnly(bot);
  const dual = (asset?: number, usd?: number): string =>
    dualValue(asset, usd, profitSign, usdOnly);

  const wins = n.deals.profit ?? 0;
  const losses = n.deals.loss ?? 0;
  const open = Math.max((bot.dealsInBot?.active ?? 0) | 0, 0);
  const closed = wins + losses;

  const hasEquityDd =
    typeof n.loss.maxEquityDrawdown !== 'undefined' &&
    typeof n.loss.maxEquityDrawdownPerc !== 'undefined';

  const maxTheoretical = n.usage.maxTheoreticalUsage ?? 0;

  return {
    profitSign,
    usdOnly,
    showDca: !!bot.settings?.useDca,

    general: {
      netPerc: PERC(n.general.netProfitPerc),
      netText: dual(netAssetOf(stats, bot), bot.profit?.totalUsd),
      avgDailyPerc: math.round(bot.avgDailyPerc ?? 0),
      avgDailyText: `$${roundUsd(bot.avgDaily)}`,
      annualizedPerc:
        typeof bot.annualizedReturn === 'number' &&
        Number.isFinite(bot.annualizedReturn)
          ? math.round(bot.annualizedReturn, 2)
          : null,
      dealsText: `${closed + open} (profit - ${wins}, loss - ${losses}, open - ${open})`,
      maxDealDuration: formatDuration(d.general.maxDealDuration ?? 0),
      dealsPerDay: math.round(d.general.dealsPerDay ?? 0, 2),
      openPnlPerc: math.round(bot.unPnlPerc ?? 0),
      openPnlText: `$${roundUsd(bot.unPnl)}`,
      workingTime: formatDuration(d.general.workingTime ?? 0),
    },

    winners: {
      count: wins,
      winRate: closed > 0 ? math.round((wins / closed) * 100) : 0,
      grossProfitPerc: PERC(n.profit.grossProfitPerc),
      grossProfitText: dual(n.profit.grossProfit.asset, n.profit.grossProfit.usd),
      maxDealProfitPerc: PERC(n.profit.maxDealProfitPerc),
      maxDealProfitText: dual(
        n.profit.maxDealProfit.asset,
        n.profit.maxDealProfit.usd
      ),
      avgDealProfitPerc: PERC(n.profit.avgDealProfitPerc),
      avgDealProfitText: dual(
        n.profit.avgDealProfit.asset,
        n.profit.avgDealProfit.usd
      ),
      maxRunUpPerc: PERC(n.profit.maxRunUpPerc),
      maxRunUpText: dual(n.profit.maxRunUp.asset, n.profit.maxRunUp.usd),
      maxConsecutiveWins: n.profit.maxConsecutiveWins ?? 0,
      avgWinningTradeDuration: formatDuration(
        d.profit.avgWinningTradeDuration ?? 0
      ),
      maxWinningTradeDuration: formatDuration(
        d.profit.maxWinningTradeDuration ?? 0
      ),
    },

    losers: {
      count: losses,
      grossLossPerc: PERC(n.loss.grossLossPerc),
      grossLossText: dual(n.loss.grossLoss.asset, n.loss.grossLoss.usd),
      maxDealLossPerc: PERC(n.loss.maxDealLossPerc),
      maxDealLossText: dual(n.loss.maxDealLoss.asset, n.loss.maxDealLoss.usd),
      avgDealLossPerc: PERC(n.loss.avgDealLossPerc),
      avgDealLossText: dual(n.loss.avgDealLoss.asset, n.loss.avgDealLoss.usd),
      maxRealizedDdPerc: -Math.abs(PERC(n.loss.maxDrawdownPerc)),
      // Drawdown is reported as a positive magnitude; show it as a loss —
      // but don't render "-0" when the bot has never drawn down.
      maxRealizedDdText:
        (n.loss.maxDrawdown?.usd ?? 0) === 0 &&
        (n.loss.maxDrawdown?.asset ?? 0) === 0
          ? dual(n.loss.maxDrawdown.asset, n.loss.maxDrawdown.usd)
          : `-${dual(n.loss.maxDrawdown.asset, n.loss.maxDrawdown.usd)}`,
      maxEquityDdPerc: hasEquityDd
        ? -Math.abs(PERC(n.loss.maxEquityDrawdownPerc))
        : null,
      maxEquityDdText: hasEquityDd
        ? `$${roundUsd(n.loss.maxEquityDrawdown.usd)}`
        : null,
      maxConsecutiveLosses: n.loss.maxConsecutiveLosses ?? 0,
      avgLosingTradeDuration: formatDuration(d.loss.avgLosingTradeDuration ?? 0),
      maxLosingTradeDuration: formatDuration(d.loss.maxLosingTradeDuration ?? 0),
    },

    ratios: {
      profitFactor: profitFactorOf(n.ratios.profitFactor),
      // Sharpe / Sortino / CWR are computed for BACKTESTS, not for live bots —
      // the live stats block ships them as 0. Legacy main-dash dealt with that
      // by commenting the rows out entirely; here a falsy value means
      // "not computed" and the row is dropped, so a real ratio still shows if
      // the backend starts producing one.
      sharpeRatio: n.ratios.sharpeRatio
        ? math.round(n.ratios.sharpeRatio, 3)
        : null,
      sortinoRatio: n.ratios.sortinoRatio
        ? math.round(n.ratios.sortinoRatio, 3)
        : null,
      cwr: n.ratios.cwr ? math.round(n.ratios.cwr, 4) : null,
      buyAndHoldPerc: PERC(n.ratios.buyAndHold?.perc),
      buyAndHoldText: `$${roundUsd(n.ratios.buyAndHold?.result)}`,
    },

    dca: {
      maxUsagePerc:
        maxTheoretical !== 0
          ? math.round(((n.usage.maxActualUsage ?? 0) / maxTheoretical) * 100)
          : 0,
      maxTheoreticalUsage: `${fmtAsset(maxTheoretical)} ${usageSign}`,
      maxRealUsage: `${fmtAsset(n.usage.maxActualUsage)} ${usageSign}`,
      // Same story as the ratios above: the live block leaves avg-deal usage
      // and avg-DCA-triggered at 0, so drop the rows instead of printing 0.
      avgDealUsage: n.usage.avgDealUsage
        ? `${fmtAsset(n.usage.avgDealUsage)} ${usageSign}`
        : null,
      maxDcaTriggered: n.general.maxDCAOrdersTriggered ?? 0,
      avgDcaTriggered: n.general.avgDCAOrdersTriggered
        ? math.round(n.general.avgDCAOrdersTriggered, 1)
        : null,
      coveredPriceDeviation: PERC(n.general.coveredPriceDeviation),
      actualPriceDeviation: PERC(n.general.actualPriceDeviation),
    },
  };
};

export const buildBotSymbolStatsRows = (
  symbolStats: BotSymbolsStats[] | undefined
): BotSymbolStatsRowVM[] =>
  (symbolStats ?? []).map((s) => ({
    pair: s.symbol,
    deals: {
      profit: s.numerical.deals.profit ?? 0,
      loss: s.numerical.deals.loss ?? 0,
    },
    netProfitPerc: PERC(s.numerical.general.netProfitPerc),
    dailyReturnPerc: PERC(s.numerical.general.dailyProfitPerc),
    winRatePerc: PERC(s.numerical.general.winRate),
    profitFactor: profitFactorOf(s.numerical.general.profitFactor),
    maxDealDuration: formatDuration(s.duration.maxDealDuration ?? 0),
    avgDealDuration:
      typeof s.duration.avgDealDuration === 'number'
        ? formatDuration(s.duration.avgDealDuration)
        : null,
  }));
