/**
 * IndexedDB adapter for the candle cache. Layout and retention rules live in
 * `chunks.ts`; this file only moves chunk records in and out of the browser.
 *
 * Stores (database `Gainium`, version 3):
 * - `CandleChunks`, key `[seriesId, chunkStart]`: up to 1000 bars each, as a
 *   Float64Array, so a range read is one key-range query and no text parse.
 * - `CandleSeries`, key `seriesId`: per-series metadata (chunk counts, bytes,
 *   last access, firstTime). Retention reads only this store.
 */
import { ExchangeIntervals, timeIntervalMap, type StoreCandles } from '@/types';
import { dispatchCandlesDbEvent } from '@/constants/backtest';
import type { Bar } from '@/utils/tradingView/types';
import { handleError } from '@/utils/indexedDb';
import {
  CHUNKS_STORE,
  SERIES_STORE,
  barsToCsv,
  chunkBoundsForRange,
  csvToBars,
  decodeBars,
  encodeBars,
  mergeChunkBars,
  planGlobalEviction,
  planSeriesTrim,
  seriesTotals,
  splitIntoChunks,
  upgradeCandleDb,
  type CandleChunkRecord,
  type CandleSeriesMeta,
} from './chunks';

export const DBCredentials = {
  version: 3,
  store: CHUNKS_STORE,
  dbName: 'Gainium',
};

/** A read touches lastAccess at most this often, so reads rarely write. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
/** The global/idle sweep runs at most this often per tab. */
const SWEEP_INTERVAL_MS = 60 * 1000;

const reportError = (message: string) =>
  handleError(message, DBCredentials.store);

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

let dbPromise: Promise<IDBDatabase> | null = null;

const openCandleDb = (): Promise<IDBDatabase> => {
  if (dbPromise) {
    return dbPromise;
  }
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error("Can't find variable: indexedDB"));
      return;
    }
    const request = indexedDB.open(DBCredentials.dbName, DBCredentials.version);
    request.onupgradeneeded = () => upgradeCandleDb(request.result);
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version in another tab upgrade instead of blocking it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  dbPromise = opening;
  opening.catch(() => {
    if (dbPromise === opening) {
      dbPromise = null;
    }
  });
  return opening;
};

const stepOf = (interval: string): number =>
  timeIntervalMap[interval as ExchangeIntervals] ?? 60_000;

const seriesRange = (id: string, lower: number, upper: number) =>
  IDBKeyRange.bound([id, lower], [id, upper]);

export type CandleRangeRead = {
  bars: Bar[];
  firstTime?: number | undefined;
  /** Earliest cached time of the whole series, if anything is cached. */
  minTime?: number | undefined;
};

/**
 * Reads the cached bars of one series in `[from, to]` (ms), touching only the
 * chunks that range needs. Omit the range to read the whole series.
 */
export const readRange = async (
  id: string,
  interval: string,
  from = -Infinity,
  to = Infinity
): Promise<CandleRangeRead> => {
  const db = await openCandleDb();
  const step = stepOf(interval);
  const bounds = chunkBoundsForRange(from, to, step);
  const tx = db.transaction([CHUNKS_STORE, SERIES_STORE], 'readonly');
  const [chunks, meta] = await Promise.all([
    promisify(
      tx
        .objectStore(CHUNKS_STORE)
        .getAll(
          seriesRange(
            id,
            Number.isFinite(from) ? bounds.lower : -Infinity,
            Number.isFinite(to) ? bounds.upper : Infinity
          )
        )
    ) as Promise<CandleChunkRecord[]>,
    promisify(tx.objectStore(SERIES_STORE).get(id)) as Promise<
      CandleSeriesMeta | undefined
    >,
  ]);
  const bars: Bar[] = [];
  for (const chunk of chunks) {
    decodeBars(chunk.d, from, to, bars);
  }
  if (meta && Date.now() - meta.lastAccess > TOUCH_INTERVAL_MS) {
    void touch(id);
  }
  return {
    bars,
    firstTime: meta?.firstTime,
    minTime: meta?.bars ? meta.minTime : undefined,
  };
};

const touch = async (id: string) => {
  try {
    const db = await openCandleDb();
    const tx = db.transaction(SERIES_STORE, 'readwrite');
    const store = tx.objectStore(SERIES_STORE);
    const meta = (await promisify(store.get(id))) as
      | CandleSeriesMeta
      | undefined;
    if (meta) {
      store.put({ ...meta, lastAccess: Date.now() });
    }
    await txDone(tx);
  } catch {
    // lastAccess only steers eviction; a missed touch is harmless.
  }
};

export type CandleSeriesInfo = Pick<
  CandleSeriesMeta,
  'id' | 'symbol' | 'interval' | 'exchange' | 'baseAsset' | 'quoteAsset'
>;

/**
 * Merges `bars` into the series: reads and rewrites only the chunks those
 * bars fall in, plus the series metadata, in one transaction. Trims the
 * series to its cap, dropping chunks farthest from `keep` (default: the span
 * of `bars`).
 */
export const writeBars = async (
  info: CandleSeriesInfo,
  bars: Bar[],
  options: {
    firstTime?: number | undefined;
    keep?: { from: number; to: number };
  } = {}
): Promise<boolean> => {
  const hasFirstTime = options.firstTime !== undefined;
  if (!bars.length && !hasFirstTime) {
    return false;
  }
  const db = await openCandleDb();
  const step = stepOf(info.interval);
  const groups = splitIntoChunks(bars, step);
  const tx = db.transaction([CHUNKS_STORE, SERIES_STORE], 'readwrite');
  const chunkStore = tx.objectStore(CHUNKS_STORE);
  const seriesStore = tx.objectStore(SERIES_STORE);
  const starts = Array.from(groups.keys());
  const [meta, existing] = await Promise.all([
    promisify(seriesStore.get(info.id)) as Promise<
      CandleSeriesMeta | undefined
    >,
    Promise.all(
      starts.map(
        (t) =>
          promisify(chunkStore.get([info.id, t])) as Promise<
            CandleChunkRecord | undefined
          >
      )
    ),
  ]);
  let chunkCounts: Record<string, number> = { ...(meta?.chunks ?? {}) };
  let minTime = meta?.bars ? meta.minTime : Infinity;
  let maxTime = meta?.bars ? meta.maxTime : -Infinity;
  starts.forEach((t, i) => {
    const incoming = groups.get(t) ?? [];
    const prior = existing[i];
    const merged = prior
      ? mergeChunkBars(decodeBars(prior.d), incoming)
      : mergeChunkBars([], incoming);
    const record: CandleChunkRecord = {
      s: info.id,
      t,
      n: merged.length,
      d: encodeBars(merged),
    };
    chunkStore.put(record);
    chunkCounts[String(t)] = merged.length;
    if (merged.length) {
      minTime = Math.min(minTime, merged[0].time);
      maxTime = Math.max(maxTime, merged[merged.length - 1].time);
    }
  });
  const keep = options.keep ?? {
    from: bars.length ? bars[0].time : minTime,
    to: bars.length ? bars[bars.length - 1].time : maxTime,
  };
  const dropped = planSeriesTrim(chunkCounts, keep, step);
  if (dropped.length) {
    const droppedKeys = new Set(dropped.map(String));
    for (const t of dropped) {
      chunkStore.delete([info.id, t]);
    }
    chunkCounts = Object.fromEntries(
      Object.entries(chunkCounts).filter(([k]) => !droppedKeys.has(k))
    );
    // Trimmed edges: bound by what is left, at chunk precision.
    const remaining = Object.keys(chunkCounts).map(Number);
    const lowest = Math.min(...remaining);
    const highest = Math.max(...remaining);
    minTime = Math.max(minTime, lowest);
    maxTime = Math.min(maxTime, highest + step * 1000 - step);
  }
  const proposed = options.firstTime;
  const firstTime =
    proposed !== undefined &&
    (meta?.firstTime === undefined || proposed < meta.firstTime)
      ? proposed
      : meta?.firstTime;
  const next: CandleSeriesMeta = {
    ...info,
    firstTime,
    chunks: chunkCounts,
    ...seriesTotals(chunkCounts),
    minTime: Number.isFinite(minTime) ? minTime : 0,
    maxTime: Number.isFinite(maxTime) ? maxTime : 0,
    lastAccess: Date.now(),
  };
  seriesStore.put(next);
  await txDone(tx);
  scheduleSweep(info.id);
  dispatchCandlesDbEvent();
  return true;
};

let lastSweep = 0;

const scheduleSweep = (protectId: string) => {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) {
    return;
  }
  lastSweep = now;
  void sweep([protectId]).catch((e) =>
    reportError(`Candle cache sweep failed ${(e as Error)?.message}`)
  );
};

/** Evicts idle series, then least-recently-used ones over the byte budget. */
export const sweep = async (
  protectIds: string[] = [],
  limits: { maxBytes?: number; maxIdleMs?: number } = {}
): Promise<string[]> => {
  const db = await openCandleDb();
  const metas = (await promisify(
    db.transaction(SERIES_STORE, 'readonly').objectStore(SERIES_STORE).getAll()
  )) as CandleSeriesMeta[];
  const evict = planGlobalEviction(metas, {
    now: Date.now(),
    protectIds,
    ...limits,
  });
  if (evict.length) {
    await deleteSeries(evict);
    dispatchCandlesDbEvent();
  }
  return evict;
};

const deleteSeries = async (ids: string[]) => {
  const db = await openCandleDb();
  const tx = db.transaction([CHUNKS_STORE, SERIES_STORE], 'readwrite');
  for (const id of ids) {
    tx.objectStore(CHUNKS_STORE).delete(seriesRange(id, -Infinity, Infinity));
    tx.objectStore(SERIES_STORE).delete(id);
  }
  await txDone(tx);
};

const toSummary = (meta: CandleSeriesMeta, data = ''): StoreCandles => ({
  id: meta.id,
  symbol: meta.symbol,
  interval: meta.interval as ExchangeIntervals,
  exchange: meta.exchange as StoreCandles['exchange'],
  baseAsset: meta.baseAsset,
  quoteAsset: meta.quoteAsset,
  firstTime: meta.firstTime,
  size: meta.bytes,
  periods: meta.bars ? [{ from: meta.minTime, to: meta.maxTime }] : [],
  data,
});

/** Every cached series, as summaries (`data` is empty). Reads metadata only. */
export const getAll = async (): Promise<StoreCandles[]> => {
  try {
    const db = await openCandleDb();
    const metas = (await promisify(
      db.transaction(SERIES_STORE, 'readonly').objectStore(SERIES_STORE).getAll()
    )) as CandleSeriesMeta[];
    return metas.map((m) => toSummary(m));
  } catch (e) {
    reportError(`Catch error in get all ${(e as Error).message}`);
    return [];
  }
};

/** One series; with `full`, `data` holds the whole series as CSV (export). */
export const getById = async (
  id: string,
  full = false
): Promise<StoreCandles | undefined | null> => {
  try {
    const db = await openCandleDb();
    const meta = (await promisify(
      db.transaction(SERIES_STORE, 'readonly').objectStore(SERIES_STORE).get(id)
    )) as CandleSeriesMeta | undefined;
    if (!meta) {
      return undefined;
    }
    if (!full) {
      return toSummary(meta);
    }
    const { bars } = await readRange(id, meta.interval);
    return toSummary(meta, barsToCsv(bars));
  } catch (e) {
    reportError(`Catch error in get by id ${(e as Error).message}`);
    return null;
  }
};

export const removeId = async (id: string): Promise<StoreCandles[]> => {
  try {
    await deleteSeries([id]);
    dispatchCandlesDbEvent();
    return await getAll();
  } catch (e) {
    reportError(`Catch error in remove id ${(e as Error).message}. ID: ${id}`);
    return [];
  }
};

export const removeAll = async (): Promise<StoreCandles[]> => {
  try {
    const db = await openCandleDb();
    const tx = db.transaction([CHUNKS_STORE, SERIES_STORE], 'readwrite');
    tx.objectStore(CHUNKS_STORE).clear();
    tx.objectStore(SERIES_STORE).clear();
    await txDone(tx);
    dispatchCandlesDbEvent();
    return [];
  } catch (e) {
    reportError(`Catch error in remove all ${(e as Error).message}`);
    return [];
  }
};

/** Imports a series in the legacy/export CSV format (Saved Data import). */
export const save = async (data: StoreCandles): Promise<boolean> => {
  try {
    const bars = csvToBars(data.data ?? '');
    return await writeBars(
      {
        id: data.id,
        symbol: data.symbol,
        interval: data.interval,
        exchange: data.exchange,
        baseAsset: data.baseAsset,
        quoteAsset: data.quoteAsset,
      },
      bars,
      { firstTime: data.firstTime }
    );
  } catch (e) {
    const error = (e as Error)?.message || e;
    if (error && `${error}` !== 'QuotaExceededError') {
      reportError(`Catch error in save ${error}`);
    }
    return false;
  }
};
