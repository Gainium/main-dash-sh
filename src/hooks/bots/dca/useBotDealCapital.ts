import { useMemo } from 'react';
import { useDealOverviewData } from '@/components/widgets/trading/DealOverview';
import { BotTypesEnum, DCAOrderTypeEnum, StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { DcaTradingContext } from './useDcaTradingContext';

const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** A single safety/DCA order in the per-step capital breakdown. */
export interface BotDealDcaStep {
  /** 1-based DCA order number (DCA 1, DCA 2, …). */
  index: number;
  /** Price-deviation label from the example order, e.g. "2%". */
  deviation: string;
  /** Capital this DCA step needs across all deals, in the deposit currency. */
  amount: number;
}

export interface BotDealCapital {
  /** Deposit-side currency symbol (base coin for spot short / COIN-M, quote
   *  otherwise). */
  currency: string | undefined;
  /** True when the deposit side is the base coin. */
  useBase: boolean;
  /** Max open deals — the per-deal figures are scaled by this for the bot. */
  maxDeals: number;
  /** Whole-bot capital required (margin), in the deposit currency. */
  total: number;
  /** Base-order portion of the whole-bot capital. */
  baseOrders: number;
  /** DCA/safety-order portion of the whole-bot capital. */
  dcaOrders: number;
  /** Per-safety-order breakdown that sums (for pure DCA) to `dcaOrders`. */
  dcaSteps: BotDealDcaStep[];
  /** Available balance on the deposit side. */
  availableBalance: number;
  /** `total / availableBalance` as a percentage, or `null` with no balance. */
  pctRequired: number | null;
  /** Whether the required capital exceeds the available balance. */
  overspend: boolean;
}

export interface UseBotDealCapitalOptions {
  /** Hedge bots fund both legs; pass the legs multiplier. Defaults to 1. */
  creditsMultiplier?: number;
}

// Derives the whole-bot "Capital required" figure from the example-orders deal
// summary — the SAME source the DCA overview "Total Funds" tile reads. The
// example orders mirror the backend's order generation, so a base-referenced
// order size is interpreted correctly (as base units), unlike the previous
// standalone recompute. The footer chip and the overview tile now agree by
// construction. Returns `null` when no deal is available to size against.
export const useBotDealCapital = (
  formData: BotFormData,
  tradingContext: DcaTradingContext,
  options?: UseBotDealCapitalOptions
): BotDealCapital | null => {
  const { orders, summary } = useDealOverviewData();
  const creditsMultiplier = options?.creditsMultiplier ?? 1;

  const isCombo = formData.type === BotTypesEnum.combo;
  const slice = isCombo ? formData.combo : formData.dca;
  const strategy = slice.strategy;
  const futures = !!slice.futures;
  const coinm = !!slice.coinm;
  // A terminal order is always a single deal; its form never shows Max open
  // deals, so a value carried in from a loaded template must not scale it.
  const maxDeals = formData.terminal
    ? 1
    : Math.max(1, toPositiveInt(slice.maxNumberOfOpenDeals, 1));
  const leverage = futures ? Math.max(1, Number(slice.leverage) || 1) : 1;

  const aggregated = tradingContext.aggregatedBalances;
  const baseAsset = tradingContext.baseAsset;
  const quoteAsset = tradingContext.quoteAsset;

  return useMemo(() => {
    // Deposit side: base for spot short / COIN-M futures, quote otherwise.
    const useBase = futures ? coinm : strategy === StrategyEnum.short;

    const perDealTotal = useBase
      ? summary.totalCapitalBase
      : summary.totalCapital;
    if (
      !perDealTotal ||
      perDealTotal <= 0 ||
      !Number.isFinite(perDealTotal)
    ) {
      return null;
    }
    const perDealBase = useBase
      ? summary.baseOrderCapitalBase
      : summary.baseOrderCapital;

    // Per-deal → per-bot (× maxDeals × legs), then margin (notional / leverage).
    const factor = (maxDeals * creditsMultiplier) / leverage;
    const total = perDealTotal * factor;
    const baseOrders = Math.max(0, perDealBase) * factor;
    const dcaOrders = Math.max(0, perDealTotal - perDealBase) * factor;

    // Per-safety-order breakdown, taken from the same example orders. Each
    // order's per-order notional (qty × price for quote, qty for base) is
    // scaled by the same factor, so for pure DCA the steps sum to `dcaOrders`.
    // Smart/greyed orders keep the DCA type, so this covers active + inactive.
    const dcaSteps: BotDealDcaStep[] = orders
      .filter(
        (o) => !o.hide && ((o.type as string) || '') === DCAOrderTypeEnum.dca
      )
      .map((o, idx) => {
        const perOrder = useBase ? o.qty : o.qty * o.price;
        return {
          index: idx + 1,
          deviation: o.priceDeviation || '',
          amount: Math.max(0, perOrder) * factor,
        };
      });

    const availableBalance = useBase
      ? (aggregated?.base?.free ?? 0)
      : (aggregated?.quote?.free ?? 0);
    const pctRequired =
      availableBalance > 0 ? (total / availableBalance) * 100 : null;
    const overspend = availableBalance > 0 && total > availableBalance;

    return {
      currency: useBase ? baseAsset : quoteAsset,
      useBase,
      maxDeals,
      total,
      baseOrders,
      dcaOrders,
      dcaSteps,
      availableBalance,
      pctRequired,
      overspend,
    };
  }, [
    orders,
    summary,
    futures,
    coinm,
    strategy,
    maxDeals,
    leverage,
    creditsMultiplier,
    aggregated,
    baseAsset,
    quoteAsset,
  ]);
};
