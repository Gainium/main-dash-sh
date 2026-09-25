/**
 * Rows for the Stats tab's per-pair table. Pure; the table renders ONLY
 * against {@link BotPairStatsRowVM}.
 *
 * Two sources, one row shape:
 *  - `getBotPairStats` — main-app folds the bot's deals per pair on request,
 *    so it answers a date range and carries fees, capital, drawdown and the
 *    open position. The normal path.
 *  - the bot's stored `symbolStats` — the incremental per-pair aggregate. Only
 *    used when the backend predates `getBotPairStats` (a self-hosted install
 *    running an older main-app); metrics it never recorded are `undefined`,
 *    which the table shows as "—" and sorts last.
 */

import type { BotSymbolsStats } from '@/types';

/** One pair as `getBotPairStats` returns it. Money is USD unless named. */
export interface BotPairStatsDTO {
  symbol: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  closedDeals: number;
  wins: number;
  losses: number;
  realizedProfitUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  /** -1 = profits and no losses. */
  profitFactor: number;
  feesQuote: number;
  /** Peak of the summed capital of the pair's deals open at the same time. */
  peakCapitalUsd: number;
  avgDealDuration: number;
  maxDealDuration: number;
  /** Fraction. */
  maxDrawdownPerc: number;
  openDeals: number;
  unrealizedProfitUsd: number;
  openCapitalUsd: number;
}

export interface BotPairStatsRowVM {
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  closedDeals: number;
  wins: number;
  losses: number;
  /** 0–100. */
  winRatePerc: number | undefined;
  realizedProfitUsd: number;
  /** Realized P&L / the pair's peak concurrent capital, 0–100. */
  roiPerc: number | undefined;
  avgProfitUsd: number | undefined;
  /** Infinity = profits and no losses. */
  profitFactor: number | undefined;
  feesQuote: number | undefined;
  peakCapitalUsd: number | undefined;
  /** Worst intra-deal drawdown, 0–100 (positive = how far it fell). */
  maxDrawdownPerc: number | undefined;
  /** ms. */
  avgDealDuration: number | undefined;
  /** ms. */
  maxDealDuration: number | undefined;
  openDeals: number | undefined;
  unrealizedProfitUsd: number | undefined;
}

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const splitPair = (symbol: string): { base: string; quote: string } => {
  const [base = '', quote = ''] = symbol.split(/[-/_]/);
  return { base, quote };
};

const pfOf = (raw: number | undefined | null): number | undefined =>
  raw === -1 ? Infinity : finite(raw) ? raw : undefined;

export const buildPairStatsRows = (
  rows: BotPairStatsDTO[] | null | undefined
): BotPairStatsRowVM[] =>
  (rows ?? []).map((r) => {
    const fallback = splitPair(r.symbol);
    const decided = r.wins + r.losses;
    return {
      pair: r.symbol,
      baseAsset: r.baseAsset || fallback.base,
      quoteAsset: r.quoteAsset || fallback.quote,
      closedDeals: r.closedDeals,
      wins: r.wins,
      losses: r.losses,
      winRatePerc: decided ? (r.wins / decided) * 100 : undefined,
      realizedProfitUsd: r.realizedProfitUsd,
      roiPerc:
        r.peakCapitalUsd > 0
          ? (r.realizedProfitUsd / r.peakCapitalUsd) * 100
          : undefined,
      avgProfitUsd: r.closedDeals
        ? r.realizedProfitUsd / r.closedDeals
        : undefined,
      // A pair that closed nothing has no factor, not a factor of 0.
      profitFactor: decided ? pfOf(r.profitFactor) : undefined,
      feesQuote: r.feesQuote,
      peakCapitalUsd: r.peakCapitalUsd || undefined,
      maxDrawdownPerc: r.maxDrawdownPerc * 100,
      avgDealDuration: r.closedDeals ? r.avgDealDuration : undefined,
      maxDealDuration: r.closedDeals ? r.maxDealDuration : undefined,
      openDeals: r.openDeals,
      unrealizedProfitUsd: r.openDeals ? r.unrealizedProfitUsd : 0,
    };
  });

/**
 * Stored `symbolStats` → the same rows, for backends without
 * `getBotPairStats`. ROI here is the engine's `netProfitPerc` (net profit over
 * the pair's allocated start balance), the closest figure it kept. Its stored
 * profit factor is omitted: until main-app computed it from money it was a
 * ratio of deal COUNTS, and an old backend still writes it that way.
 */
export const buildPairStatsRowsFromSymbolStats = (
  symbolStats: BotSymbolsStats[] | null | undefined
): BotPairStatsRowVM[] =>
  (symbolStats ?? []).map((s) => {
    const { base, quote } = splitPair(s.symbol);
    const wins = s.numerical.deals.profit ?? 0;
    const losses = s.numerical.deals.loss ?? 0;
    const decided = wins + losses;
    const realized = s.numerical.general.netProfit?.usd ?? 0;
    return {
      pair: s.symbol,
      baseAsset: base,
      quoteAsset: quote,
      closedDeals: decided,
      wins,
      losses,
      winRatePerc: decided ? (wins / decided) * 100 : undefined,
      realizedProfitUsd: realized,
      roiPerc: finite(s.numerical.general.netProfitPerc)
        ? s.numerical.general.netProfitPerc * 100
        : undefined,
      avgProfitUsd: decided ? realized / decided : undefined,
      profitFactor: undefined,
      feesQuote: undefined,
      peakCapitalUsd: undefined,
      maxDrawdownPerc: undefined,
      avgDealDuration:
        decided && finite(s.duration.avgDealDuration)
          ? s.duration.avgDealDuration
          : undefined,
      maxDealDuration: decided ? s.duration.maxDealDuration : undefined,
      openDeals: undefined,
      unrealizedProfitUsd: undefined,
    };
  });
