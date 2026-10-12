import {
  IndicatorEnum,
  type IndicatorSmoothing,
  type IndicatorSmoothingCompare,
} from '@/types';

// One reading of an indicator's optional smoothing, shared by the form gating,
// the card summary, the chart studies and the payload mapper so they can never
// disagree with each other (or with the engine) about whether it is on.
//
// Smoothing applies to the single-line value oscillators — the indicators
// whose conditions compare ONE line against a value or its percentile. It
// replaces that line R with S = MA(R).
//
// Stored contract: `smoothing` is a moving-average name, case-insensitive;
// missing, 'none' or anything unrecognised means OFF. `smoothingLength` must
// be an integer 1..1000; missing or 0 means OFF. `smoothingCompare` is
// 'value' | 'line', missing means 'value'. Percentile mode always compares
// against a value, so it overrides 'line'. On any other indicator type the
// fields mean nothing and read as OFF.

export const SMOOTHING_INDICATOR_TYPES: ReadonlySet<string> = new Set<string>([
  IndicatorEnum.rsi,
  IndicatorEnum.cci,
  IndicatorEnum.mfi,
  IndicatorEnum.wr,
  IndicatorEnum.uo,
  IndicatorEnum.mom,
  IndicatorEnum.ao,
  IndicatorEnum.adx,
  IndicatorEnum.bbpb,
  IndicatorEnum.kcpb,
  IndicatorEnum.bbw,
  IndicatorEnum.vo,
  IndicatorEnum.mar,
]);

export const supportsSmoothing = (type: unknown): boolean =>
  typeof type === 'string' && SMOOTHING_INDICATOR_TYPES.has(type);

export type ActiveSmoothing = Exclude<IndicatorSmoothing, 'none'>;

/** VWMA is left out on purpose: an oscillator reading carries no volume. */
export const SMOOTHING_TYPES: readonly ActiveSmoothing[] = [
  'sma',
  'ema',
  'wma',
  'dema',
  'tema',
  'hma',
  'rma',
];

export const DEFAULT_SMOOTHING_LENGTH = 14;
export const MAX_SMOOTHING_LENGTH = 1000;

export const SMOOTHING_FIELD_KEYS = [
  'smoothing',
  'smoothingLength',
  'smoothingCompare',
] as const;

// Read loosely: the values come from the form (strings), the API (nulls) and
// hand-written payloads alike.
type SmoothingParams = { readonly [key: string]: unknown };

// A params object that names its type only counts when the type is in scope.
const inScope = (params: SmoothingParams | null | undefined): boolean =>
  params?.['type'] === undefined || supportsSmoothing(params['type']);

/** The selected average, normalised; `null` when none (or unrecognised). */
export const resolveSmoothingType = (
  params: SmoothingParams | null | undefined
): ActiveSmoothing | null => {
  const raw: unknown = params?.['smoothing'];
  if (typeof raw !== 'string' || !inScope(params)) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return (SMOOTHING_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ActiveSmoothing)
    : null;
};

/** The smoothing length when it is a usable integer 1..1000, else `null`. */
export const resolveSmoothingLength = (
  params: SmoothingParams | null | undefined
): number | null => {
  const raw: unknown = params?.['smoothingLength'];
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim().length
        ? Number(raw)
        : Number.NaN;
  return Number.isInteger(value) && value >= 1 && value <= MAX_SMOOTHING_LENGTH
    ? value
    : null;
};

/** Smoothing that is actually ON: a known average AND a usable length. */
export const resolveSmoothing = (
  params: SmoothingParams | null | undefined
): { type: ActiveSmoothing; length: number } | null => {
  const type = resolveSmoothingType(params);
  const length = resolveSmoothingLength(params);
  return type && length !== null ? { type, length } : null;
};

/** What the condition effectively tests, after every override is applied. */
export const resolveSmoothingCompare = (
  params: SmoothingParams | null | undefined
): IndicatorSmoothingCompare => {
  if (!resolveSmoothing(params) || params?.['percentile']) {
    return 'value';
  }
  const raw: unknown = params?.['smoothingCompare'];
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'line'
    ? 'line'
    : 'value';
};

/**
 * The params the form gates on. The catalog's directives are plain equality
 * checks, so hand them the EFFECTIVE values instead of the stored ones: an
 * unrecognised average reads as 'none', and the compare mode reads 'value'
 * whenever smoothing is off or percentile is on. Without this a stored
 * `smoothingCompare: 'line'` kept Value hidden (and "Between" out of the
 * condition list) after the user switched smoothing back to None.
 */
export const deriveSmoothingGatingParams = <T extends SmoothingParams>(
  params: T
): T => ({
  ...params,
  smoothing: resolveSmoothingType(params) ?? 'none',
  smoothingCompare: resolveSmoothingCompare(params),
});

/** The params without any of the three smoothing fields. */
export const withoutSmoothingFields = <T extends SmoothingParams>(
  params: T
): T => {
  const {
    smoothing: _type,
    smoothingLength: _length,
    smoothingCompare: _compare,
    ...rest
  } = params;
  return rest as T;
};

/**
 * The three fields as they should be saved. Smoothing OFF (or a type outside
 * the scope) drops all three, so an unsmoothed indicator saves exactly what it
 * saved before the setting existed. Smoothing ON stores the normalised
 * average, the integer length and the effective compare mode.
 */
export const normalizeSmoothingFields = <T extends SmoothingParams>(
  params: T
): T => {
  const smoothing = resolveSmoothing(params);
  if (!smoothing) {
    return withoutSmoothingFields(params);
  }
  return {
    ...withoutSmoothingFields(params),
    smoothing: smoothing.type,
    smoothingLength: smoothing.length,
    smoothingCompare: resolveSmoothingCompare(params),
  } as unknown as T;
};
