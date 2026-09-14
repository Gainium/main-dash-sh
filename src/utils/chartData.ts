const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Earliest timestamp (ms) a bot `stats.chart` point can plausibly carry
 * (2001-09-09). A point at or before it is a corrupt write — e.g. a daily
 * point stamped `-86400000` (1969-12-31) — not history. Plotted, the time
 * axis would span ~56 years and squeeze the real series against one edge.
 */
export const MIN_CHART_POINT_TIME = 1e12;

export type TimeframeKey = '1d' | '3d' | '1w' | '1m' | '3m' | '1y' | 'all';

export const TIMEFRAME_WINDOWS: Record<TimeframeKey, number | null> = {
  '1d': DAY_IN_MS,
  '3d': 3 * DAY_IN_MS,
  '1w': 7 * DAY_IN_MS,
  '1m': 30 * DAY_IN_MS,
  '3m': 90 * DAY_IN_MS,
  '1y': 365 * DAY_IN_MS,
  all: null,
};

export interface RawChartPoint {
  time?: number | string | Date | null;
  equity?: number | null;
  realizedProfit?: number | null;
  buyAndHold?: number | null;
  price?: number | null;
}

export interface SanitizedChartPoint {
  time: number;
  equity?: number;
  realizedProfit?: number;
  buyAndHold?: number;
  price?: number;
}

type NumericLike = number | string | null | undefined;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const coerceNumber = (value: NumericLike): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

export const coerceToTimestamp = (value: RawChartPoint['time']): number => {
  // Numeric epoch support: detect seconds vs milliseconds
  if (isFiniteNumber(value)) {
    const n = value as number;
    // Heuristic: anything before year ~5138 in ms, or typical epoch seconds < 1e12
    // If it's less than 10^11, treat as seconds and convert to ms
    return n < 1e11 ? n * 1000 : n;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === 'string' && value.trim()) {
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) {
      return milliseconds;
    }

    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      // Same numeric seconds heuristic for string numbers
      return numeric < 1e11 ? numeric * 1000 : numeric;
    }
  }

  return Number.NaN;
};

export const sanitizeChartPoints = (
  points: readonly RawChartPoint[]
): SanitizedChartPoint[] => {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const deduped = new Map<number, SanitizedChartPoint>();

  points.forEach((point) => {
    const timestamp = coerceToTimestamp(point?.time);

    if (!Number.isFinite(timestamp) || timestamp <= MIN_CHART_POINT_TIME) {
      return;
    }

    const result: SanitizedChartPoint = { time: timestamp };
    const equity = coerceNumber(point?.equity);
    const realizedProfit = coerceNumber(point?.realizedProfit);
    const buyAndHold = coerceNumber(point?.buyAndHold);
    const price = coerceNumber(point?.price);

    if (typeof equity === 'number') {
      result.equity = equity;
    }

    if (typeof realizedProfit === 'number') {
      result.realizedProfit = realizedProfit;
    }

    if (typeof buyAndHold === 'number') {
      result.buyAndHold = buyAndHold;
    }

    if (typeof price === 'number') {
      result.price = price;
    }

    deduped.set(timestamp, result);
  });

  return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
};

export const filterByTimeframe = <T extends { time: number }>(
  points: readonly T[],
  timeframe: TimeframeKey,
  now: number = Date.now()
): T[] => {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const window = TIMEFRAME_WINDOWS[timeframe];

  if (window === null) {
    return [...points];
  }

  const threshold = now - window;

  const filtered = points.filter((point) => point.time >= threshold);

  if (filtered.length === 0) {
    return [points[points.length - 1] as T];
  }

  return filtered;
};

export const downsamplePoints = <T>(
  points: readonly T[],
  maxPoints = 500
): T[] => {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  if (points.length <= maxPoints) {
    return [...points];
  }

  const step = Math.ceil(points.length / maxPoints);
  const sampled: T[] = [];

  for (let index = 0; index < points.length; index += step) {
    sampled.push(points[index] as T);
  }

  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1] as T);
  }

  return sampled;
};

export const mergeChartSources = (
  primary?: readonly RawChartPoint[],
  fallback?: readonly RawChartPoint[]
): RawChartPoint[] => {
  if (Array.isArray(primary) && primary.length > 0) {
    return [...primary];
  }

  if (Array.isArray(fallback) && fallback.length > 0) {
    return [...fallback];
  }

  return [];
};

export const getLastTimestamp = (
  points: readonly { time: number }[]
): number | null => {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  return points[points.length - 1].time;
};
