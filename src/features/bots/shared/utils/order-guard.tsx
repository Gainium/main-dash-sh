import type { BotFormData, PairPrecisionInfo } from '@/types/bots';

export interface AggregatedPrecision {
  pricePrecision: number;
  baseStep: number | null;
  minBaseAmount: number | null;
  minQuoteAmount: number | null;
}

export interface PrecisionGuard {
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  label?: string;
}

export const PERCENTAGE_GUARD: PrecisionGuard = {
  min: 0,
  max: 100,
  decimals: 2,
  unit: '%',
  label: 'percentage range (0-100%)',
};

export const computeStepDecimals = (
  step?: number | null
): number | undefined => {
  if (!step || !Number.isFinite(step) || step <= 0) {
    return undefined;
  }

  const stepString = step.toString();
  if (stepString.includes('e-')) {
    const exponent = Number(stepString.split('e-')[1]);
    return Number.isFinite(exponent) ? exponent : undefined;
  }

  const decimals = stepString.split('.')[1]?.length ?? 0;
  return decimals > 0 ? decimals : undefined;
};

/** Decimal places for an order-size / investment figure denominated in
 *  `orderSizeType`.
 *
 *  Base sizes take their scale from the exchange's amount step. Quote sizes
 *  take theirs from the exchange's minimum QUOTE amount (`quoteAsset.minAmount`)
 *  — the only quote-denominated scale the pair metadata carries, since
 *  `quoteAsset` has no `step`. On bybit ETHBTC that is 0.000065 BTC => 6
 *  decimals; on any USDT pair it is a whole number => the 2-decimal floor,
 *  so stablecoin pairs are unaffected.
 *
 *  Deliberately NOT `pricePrecision`: that is the scale of the PRICE, not of
 *  the order size. Prod SHIBUSDT/PEPEUSDT carry `pricePrecision: 9`, which
 *  would pad every USDT figure out to nine decimals (bug #467). */
export const resolveOrderSizeDecimals = (
  orderSizeType: BotFormData['dca']['orderSizeType'] | undefined,
  info: PairPrecisionInfo | undefined
): number => {
  const scale =
    orderSizeType === 'base'
      ? (computeStepDecimals(info?.baseStep) ?? 6)
      : (computeStepDecimals(info?.minQuoteAmount) ?? 2);
  return Math.min(8, Math.max(2, scale));
};

export const formatNumberWithTrim = (
  value: number,
  decimals?: number
): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (decimals === undefined) {
    const valueString = value.toString();
    return valueString.includes('e')
      ? Number(value).toFixed(8).replace(/\.0+$/, '')
      : valueString;
  }

  const fixed = value.toFixed(decimals);
  // Strip trailing zeros, not just an all-zero fraction: `/\.0+$/` left
  // "1.500000" and "0.002000" padded, which is what made a higher-precision
  // asset unreadable (bug #467). Matches BalanceInput's `formatNumber`.
  // The `includes('.')` guard is load-bearing — without it `/0+$/` would
  // turn an integer like "1200" into "12".
  return fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
};

export const selectPositiveMin = (
  current: number | null,
  next: number | null | undefined
): number | null => {
  const normalizedCurrent = current && current > 0 ? current : null;
  const normalizedNext = next && next > 0 ? next : null;

  if (normalizedCurrent === null) {
    return normalizedNext;
  }
  if (normalizedNext === null) {
    return normalizedCurrent;
  }

  return Math.min(normalizedCurrent, normalizedNext);
};

export const aggregatePrecisionConstraints = (
  pairs: readonly string[],
  precisionMap: Record<string, PairPrecisionInfo> | undefined
): AggregatedPrecision | null => {
  if (!precisionMap) {
    return null;
  }

  const entries = pairs
    .map((pair) => pair?.toUpperCase?.())
    .filter((pair): pair is string => Boolean(pair))
    .map((pair) => precisionMap[pair])
    .filter((info): info is PairPrecisionInfo => Boolean(info));

  if (entries.length === 0) {
    return null;
  }

  return entries.reduce<AggregatedPrecision>(
    (acc, info) => ({
      pricePrecision: Math.max(acc.pricePrecision, info.pricePrecision ?? 0),
      baseStep: selectPositiveMin(acc.baseStep, info.baseStep),
      minBaseAmount: Math.max(acc.minBaseAmount ?? 0, info.minBaseAmount ?? 0),
      minQuoteAmount: Math.max(
        acc.minQuoteAmount ?? 0,
        info.minQuoteAmount ?? 0
      ),
    }),
    {
      pricePrecision: 0,
      baseStep: null,
      minBaseAmount: null,
      minQuoteAmount: null,
    }
  );
};

export const createOrderGuard = (
  orderSizeType: BotFormData['dca']['orderSizeType'],
  precision: AggregatedPrecision | null,
  assets: { base?: string; quote?: string }
): PrecisionGuard | null => {
  switch (orderSizeType) {
    case 'base': {
      if (!precision && !assets.base) {
        return null;
      }

      const baseGuard: PrecisionGuard = {
        label: assets.base ? `${assets.base} minimum` : 'base asset minimum',
      };

      if (assets.base) {
        baseGuard.unit = assets.base;
      }

      if (precision) {
        if (
          typeof precision.minBaseAmount === 'number' &&
          precision.minBaseAmount > 0
        ) {
          baseGuard.min = precision.minBaseAmount;
        }

        if (typeof precision.baseStep === 'number' && precision.baseStep > 0) {
          baseGuard.step = precision.baseStep;
          const decimals = computeStepDecimals(precision.baseStep);
          if (typeof decimals === 'number') {
            baseGuard.decimals = decimals;
          }
        }
      }

      return Object.keys(baseGuard).length > 0 ? baseGuard : null;
    }
    case 'quote': {
      if (!precision && !assets.quote) {
        return null;
      }

      const quoteGuard: PrecisionGuard = {
        label: assets.quote ? `${assets.quote} minimum` : 'quote asset minimum',
      };

      if (assets.quote) {
        quoteGuard.unit = assets.quote;
      }

      if (precision) {
        if (
          typeof precision.minQuoteAmount === 'number' &&
          precision.minQuoteAmount > 0
        ) {
          quoteGuard.min = precision.minQuoteAmount;
        }

        if (
          typeof precision.pricePrecision === 'number' &&
          precision.pricePrecision > 0
        ) {
          quoteGuard.decimals = precision.pricePrecision;
        }
      }

      return Object.keys(quoteGuard).length > 0 ? quoteGuard : null;
    }
    case 'percFree':
    case 'percTotal':
      return PERCENTAGE_GUARD;
    case 'usd': {
      const usdGuard: PrecisionGuard = {
        unit: 'USD',
        label: 'USD minimum order amount',
        decimals: 2,
      };

      if (
        precision &&
        typeof precision.minQuoteAmount === 'number' &&
        precision.minQuoteAmount > 0
      ) {
        usdGuard.min = precision.minQuoteAmount;
      }

      return usdGuard;
    }
    default:
      return null;
  }
};
