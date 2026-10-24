import { formatQuoteAmount, quoteUnits } from '@/utils/formatters';
import type { TradingCosts } from '@/types';
import type { Currency } from '@/utils/currencyUtils';
import { formatFiat } from '@/utils/reportingCurrency';

/** Tooltips for the figures that are not exact. */
export const FEES_ESTIMATED_TOOLTIP =
  'Estimate. Part of the fees was worked out from the exchange fee rate.';
export const SLIPPAGE_RECONSTRUCTED_TOOLTIP =
  'Estimate reconstructed from order data.';

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Decimals for a quote amount: 2 for a currency-glyph quote (USD-likes, fiat),
 * else two significant digits of a sub-unit amount (a BTC-quoted cost), up to
 * 8.
 */
const quoteDecimals = (abs: number, quoteAsset?: string | null): number =>
  quoteUnits(quoteAsset).suffix === '' || abs === 0 || abs >= 1
    ? 2
    : Math.min(8, Math.max(2, 1 - Math.floor(Math.log10(abs))));

/** The value as it is displayed, so a sign or colour never disagrees with
 *  the digits shown (no "-$0.00"). */
const shownQuote = (value: number, quoteAsset?: string | null): number =>
  Number(value.toFixed(quoteDecimals(Math.abs(value), quoteAsset)));

/**
 * A quote amount with an explicit sign, in the pair's quote asset (never
 * converted: it is not a USD figure). A value that rounds to zero shows no
 * sign.
 */
export const formatSignedQuote = (
  value: number,
  quoteAsset?: string | null
): string => {
  const shown = shownQuote(value, quoteAsset);
  const sign = shown > 0 ? '+' : shown < 0 ? '-' : '';
  return `${sign}${formatQuoteAmount(
    Math.abs(shown),
    quoteAsset,
    quoteDecimals(Math.abs(value), quoteAsset)
  )}`;
};

/** A cost (positive = paid) as its effect on P&L: shown negative. */
export const formatCost = (cost: number, quoteAsset?: string | null): string =>
  formatSignedQuote(-cost, quoteAsset);

/** Tone of a signed P&L figure as displayed; zero after rounding is neutral. */
export const pnlTone = (
  value: number,
  quoteAsset?: string | null
): 'up' | 'down' | 'neutral' => {
  const shown = shownQuote(value, quoteAsset);
  return shown > 0 ? 'up' : shown < 0 ? 'down' : 'neutral';
};

/** Tone of a cost (positive = paid) as its effect on P&L. */
export const costTone = (
  cost: number,
  quoteAsset?: string | null
): 'up' | 'down' | 'neutral' => pnlTone(-cost, quoteAsset);

const shownPnlBps = (adverseBps: number): number =>
  Math.round(-adverseBps * 10) / 10 || 0;

/** Slippage bps (positive = adverse) as its effect on P&L: adverse shows
 *  negative, improvement positive, one decimal; zero after rounding has no
 *  sign. */
export const formatPnlBps = (adverseBps: number): string => {
  const shown = shownPnlBps(adverseBps);
  if (shown === 0) return '0.0 bps';
  return `${shown > 0 ? '+' : '-'}${Math.abs(shown).toFixed(1)} bps`;
};

/** Tone of slippage bps as displayed by `formatPnlBps`. */
export const bpsTone = (adverseBps: number): 'up' | 'down' | 'neutral' => {
  const shown = shownPnlBps(adverseBps);
  return shown > 0 ? 'up' : shown < 0 ? 'down' : 'neutral';
};

/**
 * Fees + slippage as a share of gross profit, in percent. Undefined when the
 * gross is not positive — a share of a loss has no meaning.
 */
export const costShareOfGross = (
  costs: Pick<TradingCosts, 'feesQuote' | 'slippageQuote' | 'grossQuote'>
): number | undefined => {
  const gross = costs.grossQuote;
  if (!isFiniteNumber(gross) || gross <= 0) return undefined;
  const fees = isFiniteNumber(costs.feesQuote) ? costs.feesQuote : 0;
  const slippage = isFiniteNumber(costs.slippageQuote)
    ? costs.slippageQuote
    : 0;
  return ((fees + slippage) / gross) * 100;
};

/** True when the row carries at least one cost figure worth showing. */
export const hasCostFigures = (
  costs: Pick<TradingCosts, 'feesQuote' | 'slippageQuote'> | null | undefined
): boolean =>
  !!costs &&
  (isFiniteNumber(costs.feesQuote) || isFiniteNumber(costs.slippageQuote));

// ── deal cost waterfall ─────────────────────────────────────────────────────

export type WaterfallStepKey = 'gross' | 'fees' | 'tokenFees' | 'slippage' | 'net';

export interface WaterfallStep {
  key: WaterfallStepKey;
  /** Signed effect on P&L (costs negative). */
  value: number;
  /** Where the bar starts and ends on the shared axis. */
  from: number;
  to: number;
}

export interface CostWaterfall {
  steps: WaterfallStep[];
  /** Axis domain: includes 0 and every step endpoint, padded. */
  min: number;
  max: number;
  ticks: number[];
}

/** 1, 2 or 5 × 10^n — the step that gives about `count` ticks over `span`. */
const niceStep = (span: number, count: number): number => {
  const raw = span / Math.max(count, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
};

/**
 * Gross → Fees → (Token fees) → Slippage → Net on one axis. Each cost bar
 * starts where the previous step ended; Gross and Net start at 0. A negative
 * slippage (price improvement) runs back toward the gross. Gross, when
 * missing, is derived from net + costs and vice versa; null when neither is
 * known. `tokenFees` (fees paid in another asset that the shown net already
 * has subtracted) is a step only when given.
 */
export const buildCostWaterfall = (input: {
  gross?: number | null | undefined;
  fees?: number | null | undefined;
  tokenFees?: number | null | undefined;
  slippage?: number | null | undefined;
  net?: number | null | undefined;
}): CostWaterfall | null => {
  const fees = isFiniteNumber(input.fees) ? input.fees : 0;
  const tokenFees = isFiniteNumber(input.tokenFees) ? input.tokenFees : 0;
  const slippage = isFiniteNumber(input.slippage) ? input.slippage : 0;
  const gross = isFiniteNumber(input.gross)
    ? input.gross
    : isFiniteNumber(input.net)
      ? input.net + fees + tokenFees + slippage
      : undefined;
  if (gross === undefined) return null;
  const afterFees = gross - fees;
  const afterTokenFees = afterFees - tokenFees;
  const afterSlippage = afterTokenFees - slippage;
  const net = isFiniteNumber(input.net) ? input.net : afterSlippage;

  const steps: WaterfallStep[] = [
    { key: 'gross', value: gross, from: 0, to: gross },
  ];
  if (isFiniteNumber(input.fees)) {
    steps.push({ key: 'fees', value: -fees, from: gross, to: afterFees });
  }
  if (isFiniteNumber(input.tokenFees)) {
    steps.push({
      key: 'tokenFees',
      value: -tokenFees,
      from: afterFees,
      to: afterTokenFees,
    });
  }
  if (isFiniteNumber(input.slippage)) {
    steps.push({
      key: 'slippage',
      value: -slippage,
      from: afterTokenFees,
      to: afterSlippage,
    });
  }
  steps.push({ key: 'net', value: net, from: 0, to: net });

  const points = [0, ...steps.flatMap((s) => [s.from, s.to])];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || Math.max(Math.abs(hi), 1);
  const pad = span * 0.06;
  const step = niceStep(span, 4);
  // Ticks inside the padded domain, on round values, always including 0.
  const ticks: number[] = [];
  for (
    let t = Math.ceil((lo - pad) / step) * step;
    t <= hi + pad + step * 1e-9;
    t += step
  ) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : +t.toPrecision(12));
  }
  return { steps, min: lo - pad, max: hi + pad, ticks };
};

/** A value's position on the waterfall axis, 0–100 (%). */
export const axisPos = (w: Pick<CostWaterfall, 'min' | 'max'>, x: number) =>
  ((x - w.min) / (w.max - w.min)) * 100;

/** Short tick label: no unit, few decimals. */
export const formatTick = (v: number): string => {
  const abs = Math.abs(v);
  const decimals = abs === 0 || abs >= 10 ? 0 : abs >= 1 ? 1 : abs >= 0.01 ? 2 : 6;
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

// ── per-order cost cells ────────────────────────────────────────────────────

export const ORDER_FEE_ESTIMATED_TOOLTIP =
  'Estimate from the stored fee rate. The exchange did not report this fee.';
export const ORDER_FEE_CONVERTED_TOOLTIP =
  'Paid in another asset. Converted at its market price when the order filled.';

/** Fees paid in another asset (e.g. BNB), which the profit does not include. */
export const UNBOOKED_FEES_TOOLTIP =
  'Not deducted from profit. Converted at the market price of each fill.';
export const UNBOOKED_FEES_PARTIAL_TOOLTIP = `${UNBOOKED_FEES_TOOLTIP} Some could not be priced and are left out.`;

/** The same fees where the USD profit already has them subtracted. */
export const FEES_IN_USD_PROFIT_TOOLTIP =
  'Deducted from the USD profit only, at the market price when the deal closed.';
export const FEES_PARTLY_IN_USD_PROFIT_TOOLTIP =
  'Deducted from the USD profit of some deals only. Converted at the market price of each fill.';

export const unbookedFeesTooltip = (
  partial?: boolean | null,
  inUsdProfit?: 'all' | 'some' | 'none'
): string => {
  const base =
    inUsdProfit === 'all'
      ? FEES_IN_USD_PROFIT_TOOLTIP
      : inUsdProfit === 'some'
        ? FEES_PARTLY_IN_USD_PROFIT_TOOLTIP
        : UNBOOKED_FEES_TOOLTIP;
  return partial ? `${base} Some could not be priced and are left out.` : base;
};

/** How much of an aggregate's token fees is already inside USD profit. */
export const inUsdProfitShare = (
  costs: Pick<TradingCosts, 'unbookedFeesQuote' | 'unbookedFeesInUsdProfitQuote'>
): 'all' | 'some' | 'none' => {
  const all = costs.unbookedFeesQuote;
  const inUsd = costs.unbookedFeesInUsdProfitQuote;
  if (!isFiniteNumber(inUsd) || inUsd <= 0) return 'none';
  return isFiniteNumber(all) && inUsd >= all * (1 - 1e-9) ? 'all' : 'some';
};

/** "Fees paid in BNB" / "Fees paid in BGB, BNB" / "Fees paid in tokens". */
export const unbookedFeesLabel = (assets?: string[] | null): string =>
  `Fees paid in ${assets?.length ? assets.join(', ') : 'tokens'}`;

interface OrderCostFigures {
  /** A projected, not-yet-placed level. */
  __smart?: boolean;
  slippageBps?: number | null | undefined;
  slippageQuote?: number | null | undefined;
  slippageSource?: string | null | undefined;
  feeQuote?: number | null | undefined;
  feeEstimated?: boolean | null | undefined;
  feeConverted?: boolean | null | undefined;
}

/** A MARKET order that carries an execution-slippage figure. LIMIT orders
 *  (and backends without the field) have none. */
export const orderHasSlippage = (order: OrderCostFigures): boolean =>
  !order.__smart &&
  !!order.slippageSource &&
  (isFiniteNumber(order.slippageBps) || isFiniteNumber(order.slippageQuote));

/** An order whose fee is known in the quote asset. */
export const orderHasFee = (order: OrderCostFigures): boolean =>
  !order.__smart && isFiniteNumber(order.feeQuote);

// ── deal figures in the Realized Profit's currency ──────────────────────────

/**
 * USD per quote unit implied by the deal's own profit (`totalUsd / total`) —
 * what turns the breakdown into the very figure the deal's Realized Profit
 * shows. Only when the breakdown's net IS that profit in the same unit (a
 * deal whose profit is kept in base is not); undefined otherwise.
 */
export const dealUsdPerQuote = (
  netQuote: number | null | undefined,
  profit: { total?: number | null; totalUsd?: number | null } | null | undefined,
  /** USD already subtracted from `totalUsd` (fees paid in another asset on a
   *  fee-ledger deal): added back so the rate is a plain quote → USD rate. */
  usdDeducted?: number | null
): number | undefined => {
  const total = profit?.total;
  const totalUsd = profit?.totalUsd;
  if (
    !isFiniteNumber(netQuote) ||
    !isFiniteNumber(total) ||
    !isFiniteNumber(totalUsd) ||
    total === 0
  ) {
    return undefined;
  }
  if (Math.abs(netQuote - total) > 1e-6 * Math.max(1, Math.abs(total))) {
    return undefined;
  }
  const rate = (totalUsd + (isFiniteNumber(usdDeducted) ? usdDeducted : 0)) / total;
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
};

/**
 * A reporting-currency amount with an explicit sign, through the same
 * `formatFiat` the Realized Profit figure uses. Zero after rounding: no sign.
 */
export const formatSignedFiat = (value: number, currency: Currency): string => {
  const digits = Math.min(2, currency.decimals ?? 2);
  const shown = Number(value.toFixed(digits));
  const sign = shown > 0 ? '+' : shown < 0 ? '-' : '';
  // Format the value itself (not a pre-rounded copy): exactly the digits
  // ProfitAndPerc renders for the same number.
  return `${sign}${formatFiat(Math.abs(value), currency)}`;
};

/** Tone of a reporting-currency P&L figure as `formatSignedFiat` shows it. */
export const fiatTone = (
  value: number,
  currency: Currency
): 'up' | 'down' | 'neutral' => {
  const shown = Number(value.toFixed(Math.min(2, currency.decimals ?? 2)));
  return shown > 0 ? 'up' : shown < 0 ? 'down' : 'neutral';
};
