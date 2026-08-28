import {
  BotMarginTypeEnum,
  DCADealStatusEnum,
  StrategyEnum,
} from '../../types';

const STRATEGY_LONG_MARKERS = ['LONG', 'BUY'];

export const toFiniteNumber = (value: number | undefined | null): number => {
  return Number.isFinite(value) ? Number(value) : 0;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

// --------------------------------------------------------------------------
// Deal cost / size / value helpers – ported from legacy terminal/utils.ts
// These reproduce the exact formulas the old dashboard uses so that LONG and
// SHORT deals (spot & futures, USD-M & COIN-M) display identical numbers.
// --------------------------------------------------------------------------

export interface DealMetricsInput {
  strategy: StrategyEnum | string;
  status?: DCADealStatusEnum | string;
  avgPrice: number;
  usage: {
    current: { base: number; quote: number };
    max?: { base?: number; quote?: number };
  };
  currentBalances?: { base: number; quote: number };
  initialBalances?: { base: number; quote: number };
  futures?: boolean;
  coinm?: boolean;
  marginType?: BotMarginTypeEnum | string;
  leverage?: number;
}

const getLeverage = (input: DealMetricsInput): number => {
  if (!input.futures) return 1;
  if (input.marginType === BotMarginTypeEnum.inherit) return 1;
  return input.leverage ?? 1;
};

/**
 * Calculate the COST of a deal in quote-asset terms.
 *
 * Legacy formula (terminal/utils.ts):
 *   LONG  spot  → usage.current.quote
 *   SHORT spot  → usage.current.base × avgPrice
 *   futures usdm → usage.current.quote (÷ leverage when displayed)
 *   futures coinm → usage.current.base × avgPrice (÷ leverage when displayed)
 */
export const calculateDealCost = (input: DealMetricsInput): number => {
  const {
    strategy,
    status,
    avgPrice,
    usage,
    futures = false,
    coinm = false,
  } = input;
  const leverage = getLeverage(input);
  const long = isLongStrategy(strategy);

  let costValue: number;

  if (futures && String(status).toLowerCase() === DCADealStatusEnum.closed) {
    costValue = coinm
      ? toFiniteNumber(usage.current.base) * toFiniteNumber(avgPrice) * leverage
      : toFiniteNumber(usage.current.quote) * leverage;
  } else {
    costValue = Math.max(
      (futures
        ? coinm
          ? toFiniteNumber(usage.current.base) * toFiniteNumber(avgPrice)
          : toFiniteNumber(usage.current.quote)
        : long
          ? toFiniteNumber(usage.current.quote)
          : toFiniteNumber(usage.current.base)) * leverage,
      0
    );
  }

  const costMultiplier = futures ? 1 : long ? 1 : toFiniteNumber(avgPrice);

  return (costValue * costMultiplier) / leverage;
};

/**
 * Calculate the SIZE of a deal in base-asset terms.
 *
 * Legacy formula:
 *   LONG  spot  → usage.current.quote / avgPrice
 *   SHORT spot  → usage.current.base
 *   futures usdm → currentBalances.base (long) or initialBase - currentBase (short)
 *   futures coinm → usage.current.base
 */
export const calculateDealSize = (input: DealMetricsInput): number => {
  const {
    strategy,
    status,
    avgPrice,
    usage,
    currentBalances,
    initialBalances,
    futures = false,
    coinm = false,
  } = input;
  const leverage = getLeverage(input);
  const long = isLongStrategy(strategy);

  let sizeValue: number;

  if (futures && !coinm) {
    if (String(status).toLowerCase() === DCADealStatusEnum.closed) {
      sizeValue =
        toFiniteNumber(avgPrice) > 0
          ? (toFiniteNumber(usage.current.quote) * leverage) /
            toFiniteNumber(avgPrice)
          : 0;
    } else {
      sizeValue = long
        ? toFiniteNumber(currentBalances?.base)
        : toFiniteNumber(initialBalances?.base) -
          toFiniteNumber(currentBalances?.base);
    }
  } else {
    sizeValue = Math.max(
      (futures
        ? coinm
          ? toFiniteNumber(usage.current.base)
          : toFiniteNumber(usage.current.quote)
        : long
          ? toFiniteNumber(usage.current.quote)
          : toFiniteNumber(usage.current.base)) * leverage,
      0
    );
  }

  const sizeDenominator = futures
    ? 1
    : long
      ? toFiniteNumber(avgPrice) || 1
      : 1;

  return sizeValue / sizeDenominator;
};

/**
 * Calculate the notional VALUE of a deal in quote-asset terms.
 *
 * Legacy formula: same numerator as cost but WITHOUT dividing by leverage.
 */
export const calculateDealValue = (input: DealMetricsInput): number => {
  const {
    strategy,
    status,
    avgPrice,
    usage,
    futures = false,
    coinm = false,
  } = input;
  const leverage = getLeverage(input);
  const long = isLongStrategy(strategy);

  let costValue: number;

  if (futures && String(status).toLowerCase() === DCADealStatusEnum.closed) {
    costValue = coinm
      ? toFiniteNumber(usage.current.base) * toFiniteNumber(avgPrice) * leverage
      : toFiniteNumber(usage.current.quote) * leverage;
  } else {
    costValue = Math.max(
      (futures
        ? coinm
          ? toFiniteNumber(usage.current.base) * toFiniteNumber(avgPrice)
          : toFiniteNumber(usage.current.quote)
        : long
          ? toFiniteNumber(usage.current.quote)
          : toFiniteNumber(usage.current.base)) * leverage,
      0
    );
  }

  const costMultiplier = futures ? 1 : long ? 1 : toFiniteNumber(avgPrice);

  return costValue * costMultiplier;
};

export const isLongStrategy = (strategy?: string): boolean => {
  if (!strategy) {
    return true;
  }

  const normalized = strategy.toUpperCase();
  return STRATEGY_LONG_MARKERS.some((marker) => normalized.includes(marker));
};

export const calculatePnlPercentage = (
  pnlUsd: number,
  capitalUsd: number
): number => {
  const pnl = toFiniteNumber(pnlUsd);
  const capital = toFiniteNumber(capitalUsd);

  if (capital <= 0) {
    return 0;
  }

  return (pnl / capital) * 100;
};

/**
 * Total P&L for one deal — what the "Net P&L" column reports.
 *
 * `unrealizedProfit` is NOT the open position's mark-to-market. It is the whole
 * deal's P&L: both producers compute `base*price + quote - initialQuote` (the
 * client hook in `unrealizedPnL.ts`, and main-app's `stats.unrealizedProfit` in
 * `dealMonitor.ts`), and grid sale proceeds land back in `quote`. So anything
 * the deal has already banked is ALREADY inside it.
 *
 * Adding the realized figure on top therefore counts every banked grid sell
 * twice. On a combo deal with an active grid that roughly doubles the number —
 * one live deal read ~162 against a true total of ~80.
 *
 * While a deal is active its total IS `unrealizedProfit`; once it closes there
 * is no position left and the total is the realized figure. (For active deals
 * this makes Net P&L equal the Unrealized P&L column — they are genuinely the
 * same quantity under this model; the columns only diverge once closed.)
 *
 * Do NOT "simplify" this back to `unrealized + realized`.
 * See 0-knowledge/domain/pnl-accounting-policy.md.
 */
export const calculateDealNetPnl = ({
  active,
  unrealizedProfit,
  realizedProfit,
}: {
  active?: boolean;
  unrealizedProfit?: number | null;
  realizedProfit?: number | null;
}): number =>
  active ? toFiniteNumber(unrealizedProfit) : toFiniteNumber(realizedProfit);

export const calculatePnlPercentageNullable = (
  pnlUsd?: number | null,
  capitalUsd?: number | null
): number | undefined => {
  const pnl = Number(pnlUsd);
  if (!Number.isFinite(pnl)) {
    return undefined;
  }

  const capital = toFiniteNumber(capitalUsd);
  if (capital <= 0) {
    return 0;
  }

  return (pnl / capital) * 100;
};

export const isMetricUnavailable = (value?: number | null): boolean => {
  return !Number.isFinite(Number(value));
};

export const toSortableMetricValue = (
  value?: number | null,
  unavailableValue = Number.NEGATIVE_INFINITY
): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : unavailableValue;
};

/**
 * Sort accessors for the deal tables (Trading Bots → Deals and the bot
 * drawer's Deals table).
 *
 * Follow-up to bug #561: those columns render a human-readable STRING —
 * "3D 4H", "12.3%", a locale date — and the column defs sorted on that
 * rendered text. So "3D 4H" ranked below "4H", 12.3% below 9.5%, and
 * Jan 2026 below Dec 2025. Each accessor below returns the NUMBER the
 * column is actually meant to be ordered by; every cell keeps rendering
 * exactly what it rendered before.
 */

/** Epoch ms for a deal timestamp that may arrive as ms, ISO string or Date. */
export const toDealSortEpochMs = (
  value?: string | number | Date | null
): number => {
  if (value === null || value === undefined || value === '') return 0;
  const epoch =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(epoch) ? epoch : 0;
};

/**
 * Working Time as total MINUTES, so the column orders by real elapsed time
 * instead of comparing "3D 4H" with "4H" as text.
 */
export const dealWorkingTimeSortValue = (row: {
  created?: number | null;
  createdTime?: Date | string | null;
}): number => {
  const startedAt = row.created
    ? toDealSortEpochMs(row.created)
    : toDealSortEpochMs(row.createdTime);
  if (!startedAt) return 0;
  return Math.max(0, Date.now() - startedAt) / 60_000;
};

/**
 * The numeric percentage behind a formatted "12.3%" cell (Time In Loss /
 * Time In Profit). Unset cells render "-" and sort as unavailable, matching
 * how `toSortableMetricValue` already treats missing metrics elsewhere.
 */
export const dealPercentStringSortValue = (value?: string | null): number => {
  // NB: not `toSortableMetricValue(null)` — Number(null) is 0, which is
  // finite, so an unset cell would sort as a real 0% rather than as missing.
  if (!value || value === '-') return Number.NEGATIVE_INFINITY;
  return toSortableMetricValue(Number.parseFloat(value));
};

/**
 * Grid Profit as a percentage of deal cost. Only Combo / Hedge Combo deals
 * render a value; everything else shows "-" and sorts as a neutral 0.
 */
export const dealGridProfitPercentageSortValue = (row: {
  type?: string;
  gridProfitUsd?: number | null;
  cost?: number | null;
}): number => {
  if (row.type !== 'Combo' && row.type !== 'Hedge Combo') return 0;
  const gridProfitUsd = Number(row.gridProfitUsd || 0);
  const cost = Number(row.cost || 0);
  return cost > 0 ? (gridProfitUsd / cost) * 100 : 0;
};

export const calculateUsagePercentage = (
  currentValue: number,
  maxValue: number
): number => {
  const current = toFiniteNumber(currentValue);
  const max = toFiniteNumber(maxValue);

  if (max <= 0) {
    return 0;
  }

  return (current / max) * 100;
};

export const calculateDealOuterGaugePercentage = (input: {
  strategy?: string;
  initialBalances?: { base?: number; quote?: number };
  currentBalances?: { base?: number; quote?: number };
  usage?: {
    currentUsd?: number;
    maxUsd?: number;
    current?: { quote?: number };
    max?: { quote?: number };
  };
  min?: number;
  max?: number;
}): number => {
  const {
    strategy,
    initialBalances,
    currentBalances,
    usage,
    min = 0,
    max = 200,
  } = input;

  const hasInitialBalances = Boolean(initialBalances);
  let percentage = 0;

  if (!hasInitialBalances) {
    const currentUsageUsd =
      toFiniteNumber(usage?.currentUsd) ||
      toFiniteNumber(usage?.current?.quote);
    const maxUsageUsd =
      toFiniteNumber(usage?.maxUsd) || toFiniteNumber(usage?.max?.quote);
    percentage = calculateUsagePercentage(currentUsageUsd, maxUsageUsd);
    return clamp(percentage, min, max);
  }

  if (isLongStrategy(strategy)) {
    const initialQuote = toFiniteNumber(initialBalances?.quote);
    const currentQuote = toFiniteNumber(currentBalances?.quote);
    if (initialQuote > 0) {
      percentage = (1 - currentQuote / initialQuote) * 100;
    }
  } else {
    const initialBase = toFiniteNumber(initialBalances?.base);
    const currentBase = toFiniteNumber(currentBalances?.base);
    if (initialBase > 0) {
      percentage = (1 - currentBase / initialBase) * 100;
    }
  }

  return clamp(percentage, min, max);
};
