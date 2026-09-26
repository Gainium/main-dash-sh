import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Chunked candle cache. A range read and a
 * write cost the requested range, not the whole cached history; the cache is
 * bounded; the legacy one-blob-per-series store is dropped unread.
 */

import type { Bar } from '@/utils/tradingView/types';
import {
  BYTES_PER_BAR,
  CHUNKS_STORE,
  CHUNK_BARS,
  LEGACY_CANDLES_STORE,
  SERIES_STORE,
  barsToCsv,
  chunkBoundsForRange,
  chunkStartOf,
  csvToBars,
  decodeBars,
  encodeBars,
  mergeChunkBars,
  planGlobalEviction,
  planSeriesTrim,
  seriesTotals,
  splitIntoChunks,
  upgradeCandleDb,
} from '@/utils/candles/chunks';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const bar = (time: number, close = 1): Bar => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
});

const series = (from: number, count: number, step = MIN): Bar[] =>
  Array.from({ length: count }, (_, i) => bar(from + i * step, i));

describe('§5.1 chunking', () => {
  test('chunk starts are aligned to step × CHUNK_BARS', () => {
    const span = MIN * CHUNK_BARS;
    expect(chunkStartOf(0, MIN)).toBe(0);
    expect(chunkStartOf(span - 1, MIN)).toBe(0);
    expect(chunkStartOf(span, MIN)).toBe(span);
    expect(chunkStartOf(span * 7 + 123, MIN)).toBe(span * 7);
  });

  test('a year of 1m splits into ~526 chunks of at most CHUNK_BARS bars', () => {
    const bars = series(Date.UTC(2025, 0, 1), 365 * 24 * 60);
    const groups = splitIntoChunks(bars, MIN);
    expect(groups.size).toBeGreaterThanOrEqual(526);
    expect(groups.size).toBeLessThanOrEqual(527);
    let misplaced = 0;
    let oversized = 0;
    for (const [start, group] of groups) {
      if (group.length > CHUNK_BARS) oversized++;
      for (const b of group) {
        if (chunkStartOf(b.time, MIN) !== start) misplaced++;
      }
    }
    expect(oversized).toBe(0);
    expect(misplaced).toBe(0);
  });

  test('encode/decode round-trips and decode filters to a range', () => {
    const bars = series(1_000 * MIN, 50);
    const encoded = encodeBars(bars);
    expect(encoded.byteLength).toBe(bars.length * BYTES_PER_BAR);
    expect(decodeBars(encoded)).toEqual(bars);
    const inRange = decodeBars(encoded, 1_010 * MIN, 1_019 * MIN);
    expect(inRange.map((b) => b.time)).toEqual(
      bars.slice(10, 20).map((b) => b.time)
    );
  });

  test('merge: a new bar replaces the stored one, result is sorted and unique', () => {
    const stored = [bar(3 * MIN, 1), bar(1 * MIN, 1), bar(2 * MIN, 1)];
    const merged = mergeChunkBars(stored, [bar(2 * MIN, 9), bar(4 * MIN, 9)]);
    expect(merged.map((b) => [b.time, b.close])).toEqual([
      [1 * MIN, 1],
      [2 * MIN, 9],
      [3 * MIN, 1],
      [4 * MIN, 9],
    ]);
  });

  test('series totals come from chunk counts alone', () => {
    expect(seriesTotals({ 0: 1000, 60000000: 250 })).toEqual({
      bars: 1250,
      bytes: 1250 * BYTES_PER_BAR,
    });
  });
});

describe('§5.2 range reads', () => {
  test('the key range of a one-day window at 1m spans 2-3 chunks, not the series', () => {
    const to = Date.UTC(2026, 8, 1);
    const { lower, upper } = chunkBoundsForRange(to - DAY, to, MIN);
    const chunks = (upper - lower) / (MIN * CHUNK_BARS) + 1;
    expect(chunks).toBeGreaterThanOrEqual(2);
    expect(chunks).toBeLessThanOrEqual(3);
  });
});

describe('§5.4 retention', () => {
  const span = MIN * CHUNK_BARS;
  const counts = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [String(i * span), CHUNK_BARS])
    );

  test('§5.4.1 under the cap nothing is trimmed', () => {
    expect(
      planSeriesTrim(counts(5), { from: 0, to: span }, MIN, 5 * CHUNK_BARS)
    ).toEqual([]);
  });

  test('§5.4.1 over the cap, chunks farthest from the used range go first', () => {
    // 10 chunks, cap 6 chunks, used range is chunks 4..5.
    const keep = { from: 4 * span, to: 6 * span - 1 };
    const drop = planSeriesTrim(counts(10), keep, MIN, 6 * CHUNK_BARS);
    expect(drop).toHaveLength(4);
    // Farthest: 9 (dist 3 spans), 0 (3 spans... tie broken by order), 8, 1.
    expect(new Set(drop)).toEqual(
      new Set([0, 1, 8, 9].map((i) => i * span))
    );
  });

  test('§5.4.1 chunks overlapping the used range are never dropped', () => {
    const keep = { from: 0, to: 10 * span };
    expect(planSeriesTrim(counts(10), keep, MIN, CHUNK_BARS)).toEqual([]);
  });

  test('§5.4.3 idle series are evicted', () => {
    const now = 100 * DAY;
    const evict = planGlobalEviction(
      [
        { id: 'fresh', bytes: 10, lastAccess: now - DAY },
        { id: 'idle', bytes: 10, lastAccess: now - 31 * DAY },
      ],
      { now, maxBytes: 1000 }
    );
    expect(evict).toEqual(['idle']);
  });

  test('§5.4.2 over the byte budget, least recently used go first, never the protected one', () => {
    const now = 100 * DAY;
    const evict = planGlobalEviction(
      [
        { id: 'a', bytes: 40, lastAccess: now - 5 * DAY },
        { id: 'b', bytes: 40, lastAccess: now - 4 * DAY },
        { id: 'current', bytes: 40, lastAccess: now - 9 * DAY },
        { id: 'c', bytes: 40, lastAccess: now - DAY },
      ],
      { now, maxBytes: 100, protectIds: ['current'] }
    );
    expect(evict).toEqual(['a', 'b']);
  });
});

describe('§5.5 migration', () => {
  test('the legacy store is dropped without being read, new stores are created', () => {
    const names = new Set([LEGACY_CANDLES_STORE]);
    const db = {
      objectStoreNames: { contains: (n: string) => names.has(n) },
      deleteObjectStore: vi.fn((n: string) => names.delete(n)),
      createObjectStore: vi.fn((n: string) => names.add(n)),
      // A read of the legacy store would go through transaction(); it must not.
      transaction: vi.fn(),
    };
    upgradeCandleDb(db);
    expect(db.deleteObjectStore).toHaveBeenCalledWith(LEGACY_CANDLES_STORE);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.createObjectStore).toHaveBeenCalledWith(CHUNKS_STORE, {
      keyPath: ['s', 't'],
    });
    expect(db.createObjectStore).toHaveBeenCalledWith(SERIES_STORE, {
      keyPath: 'id',
    });
    // Idempotent on a database that is already current.
    db.createObjectStore.mockClear();
    upgradeCandleDb(db);
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });

  test('§2.3 the export/import CSV format round-trips and drops bad rows', () => {
    const bars = series(0, 5);
    const csv = barsToCsv(bars);
    expect(csvToBars(`${csv}\nbad;row\n1;2;3;4;5;${bars[0].time}\nNaN;1;1;1;1;9`)).toEqual(bars);
  });
});

// --- Candles.getCandles against an in-memory port --------------------------

const store = vi.hoisted(() => ({
  bars: new Map<string, Map<number, Bar>>(),
  reads: [] as { from?: number; to?: number }[],
  writes: [] as Bar[][],
}));

vi.mock('@/utils/candles/db', () => ({
  DBCredentials: { version: 3, store: 'CandleChunks', dbName: 'Gainium' },
  readRange: vi.fn(
    async (id: string, _interval: string, from = -Infinity, to = Infinity) => {
      store.reads.push({ from, to });
      const all = Array.from(store.bars.get(id)?.values() ?? []);
      return {
        bars: all
          .filter((b) => b.time >= from && b.time <= to)
          .sort((a, b) => a.time - b.time),
        minTime: all.length ? Math.min(...all.map((b) => b.time)) : undefined,
      };
    }
  ),
  writeBars: vi.fn(async (info: { id: string }, bars: Bar[]) => {
    store.writes.push(bars);
    const m = store.bars.get(info.id) ?? new Map<number, Bar>();
    for (const b of bars) m.set(b.time, b);
    store.bars.set(info.id, m);
    return true;
  }),
}));

const requestCandles = vi.hoisted(() =>
  vi.fn(async ({ startAt, endAt }: { startAt: string; endAt: string }) => {
    const out = [];
    for (let t = Number(startAt); t <= Number(endAt); t += 60_000) {
      out.push({ time: t, open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' });
    }
    return out;
  })
);

vi.mock('@/utils/tradingView/historyApi', () => ({ requestCandles }));

import { ExchangeEnum, ExchangeIntervals } from '@/types';
import Candles from '@/utils/candles';

describe('§5.2/§5.3 Candles.getCandles reads and writes only the range', () => {
  beforeEach(() => {
    store.bars.clear();
    store.reads.length = 0;
    store.writes.length = 0;
    requestCandles.mockClear();
  });

  const load = (fromMs: number, toMs: number) =>
    new Candles(ExchangeEnum.binance).getCandles({
      symbol: 'BTCUSDT',
      interval: ExchangeIntervals.oneM,
      period: {
        from: fromMs / 1000,
        to: toMs / 1000,
        countBack: 300,
        firstDataRequest: true,
      },
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
    });

  test('a cached window is served from the range read with no fetch and no write', async () => {
    const start = Date.UTC(2025, 0, 1);
    // Seed a long history (30 days of 1m).
    const history = series(start, 30 * 24 * 60);
    store.bars.set(
      'BTCUSDT@1m@binance',
      new Map(history.map((b) => [b.time, b]))
    );
    const to = start + 20 * DAY;
    const from = to - 300 * MIN;
    const bars = await load(from, to);
    expect(bars).toHaveLength(301);
    expect(store.reads).toEqual([{ from, to }]);
    expect(requestCandles).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(0);
  });

  test('a scroll-back writes only the newly fetched bars, not the cached history', async () => {
    const start = Date.UTC(2025, 0, 1);
    const history = series(start + DAY, 2 * 24 * 60);
    store.bars.set(
      'BTCUSDT@1m@binance',
      new Map(history.map((b) => [b.time, b]))
    );
    const from = start + DAY - 120 * MIN;
    const to = start + DAY + 60 * MIN;
    const bars = await load(from, to);
    expect(bars[0].time).toBe(from);
    expect(bars[bars.length - 1].time).toBe(to);
    expect(store.writes).toHaveLength(1);
    // The write carries the fetched head (≈120 bars), not the 2,880 cached.
    expect(store.writes[0].length).toBeLessThan(200);
    expect(store.writes[0].every((b) => b.time <= start + DAY)).toBe(true);
  });
});
