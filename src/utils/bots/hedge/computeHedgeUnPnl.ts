/**
 * Computes a hedge bot's unrealized PnL by transforming each leg through
 * the same `transformDcaBotToBot` formula the regular Trading-bots /
 * Combo-bots pages use, then summing the per-leg numbers. Hedge legs are
 * regular DCA / Combo bots under the wrapper, so the formula is the same
 * (current balances vs initial balances valued at latest prices, leg
 * direction-aware) — we just add the long + short sides together.
 *
 * Returns 0s when prices haven't loaded yet (or when the leg's `usage`
 * shows no active capital), matching the standalone-bot behaviour.
 */
import { transformDcaBotToBot } from '@/types/dcaBot';
import {
  type AllFees,
  type ComboBot,
  type DCABot,
  type ExchangeInUser,
  type HedgeBot,
  type Prices,
  StrategyEnum,
} from '@/types';

export interface HedgeUnPnlResult {
  unPnl: number;
  unPnlPerc: number;
  currentValue: number;
  /** Both legs' open positions at the current price, USD; undefined while a
   *  leg with an open position cannot be priced. */
  positionValue: number | undefined;
  maxValue: number;
  /** Combined daily profit in USD across both legs. */
  avgDaily: number;
  /** avgDaily / combined maxValue, expressed as a percentage. */
  avgDailyPerc: number;
  /** Annualized return derived from the combined avgDailyPerc (simple,
   *  matching the standalone trading-bots card's default when its
   *  per-leg `compound` flag isn't set on the hedge wrapper). */
  annualizedReturn: number;
  /** Per-leg utilisation percentage (0–100), keyed by leg strategy.
   *  Mirrors the per-bot `usageTotal` the standalone card renders in
   *  the dual-arc gauge — hedge legs each have their own usage so we
   *  expose both. */
  legUsage: { long?: number; short?: number };
  /** Per-leg current cost (USD), keyed by leg strategy. Same number
   *  the standalone card shows in its "Cost" tile, but resolved
   *  individually for each leg. */
  legCost: { long?: number; short?: number };
  /** Per-leg max cost (USD), keyed by leg strategy. */
  legMaxCost: { long?: number; short?: number };
  /** Per-leg unrealized PnL (USD), keyed by leg strategy. */
  legUnPnl: { long?: number; short?: number };
  /** Per-leg unrealized PnL percentage (vs the leg's own max value),
   *  keyed by leg strategy. */
  legUnPnlPerc: { long?: number; short?: number };
}

export function computeHedgeUnPnl(
  hedgeBot: HedgeBot,
  prices: Prices,
  allFees: AllFees,
  isCombo: boolean,
  exchanges: ExchangeInUser[] | undefined
): HedgeUnPnlResult {
  let unPnl = 0;
  let currentValue = 0;
  let positionValue: number | undefined = 0;
  let maxValue = 0;
  let avgDaily = 0;
  const legUsage: { long?: number; short?: number } = {};
  const legCost: { long?: number; short?: number } = {};
  const legMaxCost: { long?: number; short?: number } = {};
  const legUnPnl: { long?: number; short?: number } = {};
  const legUnPnlPerc: { long?: number; short?: number } = {};

  for (const leg of hedgeBot.bots ?? []) {
    try {
      const transformed = transformDcaBotToBot(
        leg as DCABot | ComboBot,
        allFees,
        prices,
        isCombo,
        exchanges
      );
      unPnl += transformed.unPnl ?? 0;
      currentValue += transformed.currentValue ?? 0;
      positionValue =
        positionValue === undefined || transformed.positionValue === undefined
          ? undefined
          : positionValue + transformed.positionValue;
      maxValue += transformed.maxValue ?? 0;
      avgDaily += transformed.avgDaily ?? 0;
      const usage = transformed.usageTotal ?? 0;
      const cost = transformed.currentValue ?? 0;
      const max = transformed.maxValue ?? 0;
      const legPnl = transformed.unPnl ?? 0;
      const legPnlPerc = transformed.unPnlPerc ?? 0;
      if (leg.settings?.strategy === StrategyEnum.long) {
        legUsage.long = usage;
        legCost.long = cost;
        legMaxCost.long = max;
        legUnPnl.long = legPnl;
        legUnPnlPerc.long = legPnlPerc;
      } else if (leg.settings?.strategy === StrategyEnum.short) {
        legUsage.short = usage;
        legCost.short = cost;
        legMaxCost.short = max;
        legUnPnl.short = legPnl;
        legUnPnlPerc.short = legPnlPerc;
      }
    } catch {
      // Partial transform failure on one leg shouldn't break the whole
      // list — just skip and continue with what we have.
    }
  }

  const unPnlPerc = maxValue > 0 ? (unPnl / maxValue) * 100 : 0;
  // Recompute the rate fields from the *combined* base so they
  // describe the hedge as a whole, not one leg in isolation.
  const avgDailyPercRaw = maxValue > 0 ? avgDaily / maxValue : 0;
  const avgDailyPerc = avgDailyPercRaw * 100;
  // Simple annualization (avgDailyPerc * 365). Matches the standalone
  // card's default — the compound option lives on the per-leg
  // `transformDcaBotToBot` call and the hedge wrapper has no compound
  // toggle of its own, so apply the simpler formula consistently.
  let annualizedReturn = avgDailyPercRaw * 365 * 100;
  if (!Number.isFinite(annualizedReturn)) annualizedReturn = 0;
  return {
    unPnl,
    unPnlPerc,
    currentValue,
    positionValue,
    maxValue,
    avgDaily,
    avgDailyPerc,
    annualizedReturn,
    legUsage,
    legCost,
    legMaxCost,
    legUnPnl,
    legUnPnlPerc,
  };
}
