/**
 * Pure helpers for the chunked candle cache: how a series is cut into
 * time-aligned chunks, how chunks are encoded, and which chunks or series the
 * retention rules drop. No IndexedDB here — `db.ts` is the adapter.
 *
 * A series (symbol@interval@exchange) is stored as chunks of up to
 * `CHUNK_BARS` bar slots. A chunk's start is aligned to a multiple of
 * `step * CHUNK_BARS`, so the chunks a time range needs are known without
 * reading anything, and a range read is one key-range query.
 */
import type { Bar } from '@/utils/tradingView/types';

/** Bar slots per chunk. 1000 × 48 bytes ≈ 48 KB per full chunk. */
export const CHUNK_BARS = 1000;

/** Fields per bar in the encoded chunk: time, open, high, low, close, volume. */
const FIELDS = 6;

/** Bytes one bar takes in an encoded chunk. */
export const BYTES_PER_BAR = FIELDS * Float64Array.BYTES_PER_ELEMENT;

/**
 * Retention budget. The cache only holds server data, so dropping any of it
 * is always safe: the next read refetches.
 * - Per series: a little over one year of 1m bars (~29 MB). Coarser intervals
 *   never reach it (1h × 600k bars is 68 years).
 * - Globally: 150 MB, about five symbol-years of 1m, or hundreds of series at
 *   15m and above.
 * - Idle: a series nobody read or wrote for 30 days is dropped.
 */
export const MAX_SERIES_BARS = 600_000;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

export type CandleChunkRecord = {
  /** Series id: `${symbol}@${interval}@${exchange}`. */
  s: string;
  /** Chunk start (ms), aligned to `chunkSpan`. */
  t: number;
  /** Bars in the chunk. */
  n: number;
  /** Interleaved (time, open, high, low, close, volume) × n, sorted by time. */
  d: Float64Array;
};

export type CandleSeriesMeta = {
  id: string;
  symbol: string;
  interval: string;
  exchange: string;
  baseAsset: string;
  quoteAsset: string;
  /** Earliest time the exchange serves, when an exhaustive fetch proved it. */
  firstTime?: number | undefined;
  /** Bar count per chunk start. */
  chunks: Record<string, number>;
  bars: number;
  bytes: number;
  minTime: number;
  maxTime: number;
  lastAccess: number;
};

export const chunkSpan = (stepMs: number): number => stepMs * CHUNK_BARS;

export const chunkStartOf = (time: number, stepMs: number): number => {
  const span = chunkSpan(stepMs);
  return Math.floor(time / span) * span;
};

/** Key bounds for the chunks that can hold bars in `[from, to]`. */
export const chunkBoundsForRange = (
  from: number,
  to: number,
  stepMs: number
): { lower: number; upper: number } => ({
  lower: chunkStartOf(from, stepMs),
  upper: chunkStartOf(to, stepMs),
});

export const encodeBars = (bars: Bar[]): Float64Array => {
  const out = new Float64Array(bars.length * FIELDS);
  let o = 0;
  for (const b of bars) {
    out[o++] = b.time;
    out[o++] = b.open;
    out[o++] = b.high;
    out[o++] = b.low;
    out[o++] = b.close;
    out[o++] = b.volume;
  }
  return out;
};

export const decodeBars = (
  data: Float64Array,
  from = -Infinity,
  to = Infinity,
  out: Bar[] = []
): Bar[] => {
  for (let o = 0; o + FIELDS <= data.length; o += FIELDS) {
    const time = data[o];
    if (time < from || time > to) {
      continue;
    }
    out.push({
      time,
      open: data[o + 1],
      high: data[o + 2],
      low: data[o + 3],
      close: data[o + 4],
      volume: data[o + 5],
    });
  }
  return out;
};

/** Groups bars by the chunk that holds them. */
export const splitIntoChunks = (
  bars: Bar[],
  stepMs: number
): Map<number, Bar[]> => {
  const groups = new Map<number, Bar[]>();
  for (const b of bars) {
    if (!Number.isFinite(b.time)) {
      continue;
    }
    const start = chunkStartOf(b.time, stepMs);
    const group = groups.get(start);
    if (group) {
      group.push(b);
    } else {
      groups.set(start, [b]);
    }
  }
  return groups;
};

/** Merges new bars into a chunk's bars. A new bar replaces a stored one. */
export const mergeChunkBars = (existing: Bar[], incoming: Bar[]): Bar[] => {
  const byTime = new Map<number, Bar>();
  for (const b of existing) {
    byTime.set(b.time, b);
  }
  for (const b of incoming) {
    byTime.set(b.time, b);
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
};

/** Bar and byte totals of a series from its chunk counts. */
export const seriesTotals = (
  chunks: Record<string, number>
): Pick<CandleSeriesMeta, 'bars' | 'bytes'> => {
  let bars = 0;
  for (const n of Object.values(chunks)) {
    bars += n;
  }
  return { bars, bytes: bars * BYTES_PER_BAR };
};

/**
 * Chunks to drop so a series fits `maxBars`. Farthest from the range just
 * used goes first; a chunk overlapping that range is never dropped.
 */
export const planSeriesTrim = (
  chunks: Record<string, number>,
  keep: { from: number; to: number },
  stepMs: number,
  maxBars = MAX_SERIES_BARS
): number[] => {
  const entries = Object.entries(chunks).map(([k, n]) => ({
    start: Number(k),
    n,
  }));
  let total = entries.reduce((sum, e) => sum + e.n, 0);
  if (total <= maxBars) {
    return [];
  }
  const span = chunkSpan(stepMs);
  const distance = (start: number) => {
    const end = start + span;
    if (end <= keep.from) {
      return keep.from - end;
    }
    if (start > keep.to) {
      return start - keep.to;
    }
    return -1; // overlaps the kept range
  };
  const candidates = entries
    .map((e) => ({ ...e, dist: distance(e.start) }))
    .filter((e) => e.dist >= 0)
    .sort((a, b) => b.dist - a.dist);
  const drop: number[] = [];
  for (const c of candidates) {
    if (total <= maxBars) {
      break;
    }
    drop.push(c.start);
    total -= c.n;
  }
  return drop;
};

/**
 * Series to evict: idle ones first, then least recently used until the total
 * fits `maxBytes`. The series in `protectIds` is never evicted.
 */
export const planGlobalEviction = (
  metas: Pick<CandleSeriesMeta, 'id' | 'bytes' | 'lastAccess'>[],
  {
    now,
    maxBytes = MAX_TOTAL_BYTES,
    maxIdleMs = MAX_IDLE_MS,
    protectIds = [],
  }: {
    now: number;
    maxBytes?: number;
    maxIdleMs?: number;
    protectIds?: string[];
  }
): string[] => {
  const protectedSet = new Set(protectIds);
  const evict: string[] = [];
  let total = 0;
  const remaining: typeof metas = [];
  for (const m of metas) {
    if (!protectedSet.has(m.id) && now - m.lastAccess > maxIdleMs) {
      evict.push(m.id);
    } else {
      total += m.bytes;
      remaining.push(m);
    }
  }
  if (total <= maxBytes) {
    return evict;
  }
  const lru = remaining
    .filter((m) => !protectedSet.has(m.id))
    .sort((a, b) => a.lastAccess - b.lastAccess);
  for (const m of lru) {
    if (total <= maxBytes) {
      break;
    }
    evict.push(m.id);
    total -= m.bytes;
  }
  return evict;
};

/** Legacy / export format: `open;high;low;close;volume;time` per line. */
export const barsToCsv = (bars: Bar[]): string =>
  bars
    .map((d) => `${d.open};${d.high};${d.low};${d.close};${d.volume};${d.time}`)
    .join('\n');

/** Parses the legacy CSV format (import). Drops malformed and duplicate rows. */
export const csvToBars = (data: string): Bar[] => {
  const bars: Bar[] = [];
  const seen = new Set<number>();
  for (const line of data.split('\n')) {
    const parts = line.split(';');
    if (parts.length !== 6) {
      continue;
    }
    const nums = parts.map((p) => +p);
    if (nums.some((n) => isNaN(n))) {
      continue;
    }
    const time = nums[5];
    if (seen.has(time)) {
      continue;
    }
    seen.add(time);
    bars.push({
      open: nums[0],
      high: nums[1],
      low: nums[2],
      close: nums[3],
      volume: nums[4],
      time,
    });
  }
  return bars.sort((a, b) => a.time - b.time);
};

/**
 * Upgrade step for the `Gainium` database. The legacy one-blob-per-series
 * store is dropped without being read: it only ever held server data, and
 * reading it is exactly the multi-second parse this layout replaces.
 */
export const LEGACY_CANDLES_STORE = 'Candles';
export const CHUNKS_STORE = 'CandleChunks';
export const SERIES_STORE = 'CandleSeries';

export type UpgradeTarget = {
  objectStoreNames: { contains(name: string): boolean };
  deleteObjectStore(name: string): void;
  createObjectStore(
    name: string,
    options: { keyPath: string | string[] }
  ): unknown;
};

export const upgradeCandleDb = (db: UpgradeTarget): void => {
  if (db.objectStoreNames.contains(LEGACY_CANDLES_STORE)) {
    db.deleteObjectStore(LEGACY_CANDLES_STORE);
  }
  if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
    db.createObjectStore(CHUNKS_STORE, { keyPath: ['s', 't'] });
  }
  if (!db.objectStoreNames.contains(SERIES_STORE)) {
    db.createObjectStore(SERIES_STORE, { keyPath: 'id' });
  }
};
