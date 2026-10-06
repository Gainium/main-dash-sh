/**
 * Lifetime / Since-last-change views of the Statistics tab.
 *
 * A sizing or profit-currency change resets the engine's `bot.stats` and
 * stamps `resetStatsAfter`. main-app's `getBotWindowStats` folds the bot's
 * deals into the figures over its whole life and since that stamp; these
 * helpers lay those figures over the engine-built view models.
 *
 * - Since: every deal-derived field comes from the fold (it counts a deal
 *   opened before the change and closed after it, the engine does not); the
 *   rest — equity DD, run-up, ratios, buy-and-hold, DCA usage — is the
 *   engine's, which already covers exactly this window.
 * - Lifetime: the same deal-derived fields; the engine-only rows are hidden,
 *   since the engine no longer has them for the whole life, and the drawdown
 *   KPI shows the realized drawdown instead.
 *
 * Money is USD; percentages are over the peak capital the bot had committed
 * at once (`returnOnPeakCapital`), not the sizing-derived start balance.
 */

import { formatDuration } from '@/utils/formatters';
import { math } from '@/utils/math';

import {
  PERC,
  profitFactorOf,
  roundUsd,
  type BotStatsBreakdownVM,
  type BotStatsHeadlineVM,
} from './botStatsViewModel';

export interface BotWindowStatsDTO {
  from: number | null;
  closedDeals: number;
  wins: number;
  losses: number;
  winRate: number;
  realizedProfitUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  profitFactor: number;
  peakCapitalUsd: number;
  returnOnPeakCapital: number;
  maxDrawdownUsd: number;
  maxDrawdownPerc: number;
  avgDealDuration: number;
  maxDealDuration: number;
  maxDealProfitUsd: number;
  maxDealLossUsd: number;
  avgDealProfitUsd: number;
  avgDealLossUsd: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgWinningDealDuration: number;
  maxWinningDealDuration: number;
  avgLosingDealDuration: number;
  maxLosingDealDuration: number;
  firstCloseTime: number | null;
}

export interface BotWindowStatsData {
  resetStatsAfter: number | null;
  lifetime: BotWindowStatsDTO | null;
  sinceChange: BotWindowStatsDTO | null;
}

export type StatsWindow = 'lifetime' | 'since';

const usd = (v: number | undefined | null): string => {
  const r = roundUsd(v);
  return r < 0 ? `-$${Math.abs(r)}` : `$${r}`;
};

/** -1 = profits and no losses, as the stats documents encode it. */
const pf = (raw: number): number => profitFactorOf(raw);

const overCapital = (w: BotWindowStatsDTO, v: number): number =>
  w.peakCapitalUsd > 0 ? PERC(v / w.peakCapitalUsd) : 0;

export const windowHeadline = (
  base: BotStatsHeadlineVM,
  w: BotWindowStatsDTO,
  window: StatsWindow
): BotStatsHeadlineVM => ({
  ...base,
  netPerc: PERC(w.returnOnPeakCapital),
  netUsd: roundUsd(w.realizedProfitUsd),
  maxDealDuration: formatDuration(w.maxDealDuration),
  profitFactor: pf(w.profitFactor),
  wins: w.wins,
  losses: w.losses,
  ...(window === 'lifetime'
    ? {
        maxEquityDdPerc: -Math.abs(PERC(w.maxDrawdownPerc)),
        maxEquityDdUsd: roundUsd(w.maxDrawdownUsd),
        ddLabel: 'Max Realized DD',
      }
    : {}),
});

export const windowBreakdown = (
  base: BotStatsBreakdownVM,
  w: BotWindowStatsDTO,
  window: StatsWindow,
  open: number
): BotStatsBreakdownVM => {
  const lifetime = window === 'lifetime';
  return {
    ...base,
    hideEngineOnly: lifetime,
    showDca: base.showDca && !lifetime,
    general: {
      ...base.general,
      netPerc: PERC(w.returnOnPeakCapital),
      netText: usd(w.realizedProfitUsd),
      dealsText: `${w.closedDeals + open} (profit - ${w.wins}, loss - ${w.losses}, open - ${open})`,
      maxDealDuration: formatDuration(w.maxDealDuration),
    },
    winners: {
      ...base.winners,
      count: w.wins,
      // Over decided deals, as the engine and the Win Rate donut count it: a
      // break-even deal is neither a win nor a loss.
      winRate:
        w.wins + w.losses > 0
          ? math.round((w.wins / (w.wins + w.losses)) * 100)
          : 0,
      grossProfitPerc: overCapital(w, w.grossProfitUsd),
      grossProfitText: usd(w.grossProfitUsd),
      maxDealProfitPerc: overCapital(w, w.maxDealProfitUsd),
      maxDealProfitText: usd(w.maxDealProfitUsd),
      avgDealProfitPerc: overCapital(w, w.avgDealProfitUsd),
      avgDealProfitText: usd(w.avgDealProfitUsd),
      maxConsecutiveWins: w.maxConsecutiveWins,
      avgWinningTradeDuration: formatDuration(w.avgWinningDealDuration),
      maxWinningTradeDuration: formatDuration(w.maxWinningDealDuration),
    },
    losers: {
      ...base.losers,
      count: w.losses,
      grossLossPerc: overCapital(w, w.grossLossUsd),
      grossLossText: usd(w.grossLossUsd),
      maxDealLossPerc: overCapital(w, w.maxDealLossUsd),
      maxDealLossText: usd(w.maxDealLossUsd),
      avgDealLossPerc: overCapital(w, w.avgDealLossUsd),
      avgDealLossText: usd(w.avgDealLossUsd),
      maxRealizedDdPerc: -Math.abs(PERC(w.maxDrawdownPerc)),
      maxRealizedDdText: usd(-Math.abs(w.maxDrawdownUsd)),
      ...(lifetime ? { maxEquityDdPerc: null, maxEquityDdText: null } : {}),
      maxConsecutiveLosses: w.maxConsecutiveLosses,
      avgLosingTradeDuration: formatDuration(w.avgLosingDealDuration),
      maxLosingTradeDuration: formatDuration(w.maxLosingDealDuration),
    },
    ratios: {
      ...base.ratios,
      profitFactor: pf(w.profitFactor),
      ...(lifetime ? { sharpeRatio: null, sortinoRatio: null, cwr: null } : {}),
    },
  };
};

const day = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Toggle label for the since view, e.g. "Since 2 Oct". */
export const sinceLabel = (resetStatsAfter: number): string =>
  `Since ${new Date(resetStatsAfter).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })}`;

/** The info-icon tooltip text for the active window. */
export const windowTooltip = (
  window: StatsWindow,
  resetStatsAfter: number
): string =>
  window === 'lifetime'
    ? `All deals since the bot started. Settings changed on ${day(resetStatsAfter)}; lifetime figures keep counting across changes. Return and drawdown are over the peak capital the bot used at once. Run-up, ratios, buy-and-hold and DCA usage are only available since the last change.`
    : `Deals closed since the settings change on ${day(resetStatsAfter)}. A deal opened before the change and closed after it counts here, with its old sizing.`;
