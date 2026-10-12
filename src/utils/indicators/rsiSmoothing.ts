import type { RsiSmoothing, RsiSmoothingCompare } from '@/types';

// One reading of an RSI indicator's smoothing settings, shared by the form
// gating, the card summary, the chart study and the payload mapper so they
// can never disagree with each other (or with the engine) about whether
// smoothing is on.
//
// Stored contract: `rsiSmoothing` is a moving-average name, case-insensitive;
// missing, 'none' or anything unrecognised means OFF. `rsiSmoothingLength`
// must be an integer >= 1; missing or 0 means OFF. `rsiSmoothingCompare` is
// 'value' | 'line', missing means 'value'. Percentile mode always compares
// against a value, so it overrides 'line'.

export type ActiveRsiSmoothing = Exclude<RsiSmoothing, 'none'>;

/** VWMA is left out on purpose: an RSI reading carries no volume. */
export const RSI_SMOOTHING_TYPES: readonly ActiveRsiSmoothing[] = [
  'sma',
  'ema',
  'wma',
  'dema',
  'tema',
  'hma',
  'rma',
];

export const DEFAULT_RSI_SMOOTHING_LENGTH = 14;

// Read loosely: the values come from the form (strings), the API (nulls) and
// hand-written payloads alike.
type RsiSmoothingParams = { readonly [key: string]: unknown };

/** The selected average, normalised; `null` when none (or unrecognised). */
export const resolveRsiSmoothingType = (
  params: RsiSmoothingParams | null | undefined
): ActiveRsiSmoothing | null => {
  const raw: unknown = params?.['rsiSmoothing'];
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return (RSI_SMOOTHING_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ActiveRsiSmoothing)
    : null;
};

/** The smoothing length when it is a usable integer >= 1, else `null`. */
export const resolveRsiSmoothingLength = (
  params: RsiSmoothingParams | null | undefined
): number | null => {
  const raw: unknown = params?.['rsiSmoothingLength'];
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim().length
        ? Number(raw)
        : Number.NaN;
  return Number.isInteger(value) && value >= 1 ? value : null;
};

/** Smoothing that is actually ON: a known average AND a usable length. */
export const resolveRsiSmoothing = (
  params: RsiSmoothingParams | null | undefined
): { type: ActiveRsiSmoothing; length: number } | null => {
  const type = resolveRsiSmoothingType(params);
  const length = resolveRsiSmoothingLength(params);
  return type && length !== null ? { type, length } : null;
};

/** What the condition effectively tests, after every override is applied. */
export const resolveRsiSmoothingCompare = (
  params: RsiSmoothingParams | null | undefined
): RsiSmoothingCompare => {
  if (!resolveRsiSmoothing(params) || params?.['percentile']) {
    return 'value';
  }
  const raw: unknown = params?.['rsiSmoothingCompare'];
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'line'
    ? 'line'
    : 'value';
};

/**
 * The params the RSI form gates on. The catalog's directives are plain
 * equality checks, so hand them the EFFECTIVE values instead of the stored
 * ones: an unrecognised average reads as 'none', and the compare mode reads
 * 'value' whenever smoothing is off or percentile is on. Without this a
 * stored `rsiSmoothingCompare: 'line'` kept Value hidden (and "Between" out
 * of the condition list) after the user switched smoothing back to None.
 */
export const deriveRsiGatingParams = <T extends RsiSmoothingParams>(
  params: T
): T => ({
  ...params,
  rsiSmoothing: resolveRsiSmoothingType(params) ?? 'none',
  rsiSmoothingCompare: resolveRsiSmoothingCompare(params),
});

/**
 * The three fields as they should be saved. Smoothing OFF drops all three, so
 * an unsmoothed RSI saves exactly what it saved before the setting existed.
 * Smoothing ON stores the normalised average, the integer length and the
 * effective compare mode.
 */
export const normalizeRsiSmoothingFields = <T extends RsiSmoothingParams>(
  params: T
): T => {
  const {
    rsiSmoothing: _type,
    rsiSmoothingLength: _length,
    rsiSmoothingCompare: _compare,
    ...rest
  } = params;
  const smoothing = resolveRsiSmoothing(params);
  if (!smoothing) {
    return rest as T;
  }
  return {
    ...rest,
    rsiSmoothing: smoothing.type,
    rsiSmoothingLength: smoothing.length,
    rsiSmoothingCompare: resolveRsiSmoothingCompare(params),
  } as unknown as T;
};
