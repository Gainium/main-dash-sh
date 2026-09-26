import type { StoreBacktest, StoreHedgeBacktest } from '@/types';
import DB, { handleError } from '../indexedDb';
import {
  buildLocalBacktestSummary,
  clearSummaries,
  deleteSummaries,
  getAllSummaries,
  LOCAL_BACKTEST_SUMMARY_VERSION,
  localBacktestTimeFromId,
  putSummary,
  type LocalBacktestStoreKind,
  type LocalBacktestSummary,
} from './summary';

export { localBacktestTimeFromId };
export type { LocalBacktestStoreKind, LocalBacktestSummary };

export const DBCredentials = {
  version: 1,
  store: 'BacktestData',
  dbName: 'GainiumBacktest',
} as const;

export const DBHedgeCredentials = {
  version: 1,
  store: 'BacktestData',
  dbName: 'GainiumHedgeBacktest',
} as const;

const initDb = async () => {
  const db = new DB<StoreBacktest>(
    DBCredentials,
    async (database, _oldVersion, _newVersion, tx, _ev, he) => {
      database.onerror = (event) =>
        he(
          // @ts-expect-error – IndexedDB typings expose a very loose event target
          `Error updating DB ${(event?.target?.error as Error)?.message ?? ''}`
        );
      tx.onerror = (event) => {
        he(
          // @ts-expect-error – IndexedDB typings expose a very loose event target
          `Backtest TX upgrade error ${(event?.target?.error as Error)?.message ?? ''}`
        );
      };
      const stores = database.objectStoreNames;
      if (!stores.contains(DBCredentials.store)) {
        database.createObjectStore(DBCredentials.store, {
          keyPath: 'id',
        });
      }
      await tx.done;
    }
  );
  return db;
};

const initHedgeDb = async () => {
  const db = new DB<StoreHedgeBacktest>(
    DBHedgeCredentials,
    async (database, _oldVersion, _newVersion, tx, _ev, he) => {
      database.onerror = (event) =>
        he(
          // @ts-expect-error – IndexedDB typings expose a very loose event target
          `Error updating hedge DB ${(event?.target?.error as Error)?.message ?? ''}`
        );
      tx.onerror = (event) => {
        he(
          // @ts-expect-error – IndexedDB typings expose a very loose event target
          `Hedge TX upgrade error ${(event?.target?.error as Error)?.message ?? ''}`
        );
      };
      const stores = database.objectStoreNames;
      if (!stores.contains(DBHedgeCredentials.store)) {
        database.createObjectStore(DBHedgeCredentials.store, {
          keyPath: 'id',
        });
      }
      await tx.done;
    }
  );
  return db;
};

export const getAll = async (): Promise<StoreBacktest[]> => {
  try {
    const db = await initDb();
    return await db.getAll();
  } catch (e) {
    handleError(
      `Catch error in get all ${(e as Error).message}`,
      DBCredentials.store
    );
    return [];
  }
};

// Every local backtest WITH its `data` payload, read in one transaction.
// Holds the whole store in memory at once — for bulk export or sync only;
// lists use `listLocalBacktestSummaries`. (`getAll()` masks `data` in the
// result but still reads every payload.)
export const getAllFull = async (): Promise<StoreBacktest[]> => {
  try {
    const db = await initDb();
    return await db.getAllFull();
  } catch (e) {
    handleError(
      `Catch error in get all full ${(e as Error).message}`,
      DBCredentials.store
    );
    return [];
  }
};

// How many local backtests a list page loads — the same page the server
// lists return (`pageSize: 50` in useDca/Combo/GridBacktests).
export const LOCAL_BACKTEST_LIST_LIMIT = 50;

export interface ListLocalBacktestSummariesOptions {
  matches?: (summary: LocalBacktestSummary) => boolean;
  /** Stop after this many entries that satisfy `matches`. */
  limit?: number;
  /** Read and index entries that have no summary yet (default). With
   *  `false` they are skipped, so no payload is ever read. */
  backfill?: boolean;
}

// Summary reads and writes for a store run one at a time, in call order:
// pages that mount several lists at once (e.g. DCA + Combo + Grid) do not
// each backfill the same missing summaries, and a save's invalidation cannot
// be overtaken by a listing that read the entry before the save.
const summaryQueue: Record<LocalBacktestStoreKind, Promise<unknown>> = {
  backtest: Promise.resolve(),
  hedge: Promise.resolve(),
};

const enqueueSummaryTask = <T>(
  kind: LocalBacktestStoreKind,
  task: () => Promise<T>
): Promise<T> => {
  const next = summaryQueue[kind].then(task, task);
  summaryQueue[kind] = next.catch(() => undefined);
  return next;
};

// Not awaited by writers: the queue orders it before any later listing.
const invalidateSummaries = (kind: LocalBacktestStoreKind, ids: string[]) => {
  void enqueueSummaryTask(kind, () =>
    deleteSummaries(kind, ids).catch(() => undefined)
  );
};

const resetSummaries = (kind: LocalBacktestStoreKind) => {
  void enqueueSummaryTask(kind, () =>
    clearSummaries(kind).catch(() => undefined)
  );
};

const readSummaries = async (
  kind: LocalBacktestStoreKind,
  { matches, limit, backfill = true }: ListLocalBacktestSummariesOptions
): Promise<LocalBacktestSummary[]> => {
  const db = kind === 'hedge' ? await initHedgeDb() : await initDb();
  const keys = (await db.getAllKeys()).map((key) => `${key}`);
  const existing = await getAllSummaries(kind);
  const byId = new Map(existing.map((summary) => [summary.id, summary]));

  // Summaries whose entry is gone (removed by a build that does not know
  // about the index) are dropped.
  const keySet = new Set(keys);
  const orphans = existing
    .filter((summary) => !keySet.has(summary.id))
    .map((summary) => summary.id);
  if (orphans.length > 0) {
    await deleteSummaries(kind, orphans).catch(() => undefined);
  }

  const timeOf = (key: string) =>
    byId.get(key)?.time ?? localBacktestTimeFromId(key);
  keys.sort((a, b) => timeOf(b) - timeOf(a));

  const result: LocalBacktestSummary[] = [];
  for (const key of keys) {
    if (limit !== undefined && result.length >= limit) break;
    let summary = byId.get(key);
    if (!summary || summary.v !== LOCAL_BACKTEST_SUMMARY_VERSION) {
      if (!backfill) continue;
      // Written before the index existed, or invalidated by a save: read the
      // payload once, one entry at a time, and index it.
      const entry = await db.getById(key, true);
      if (!entry) continue;
      summary = buildLocalBacktestSummary(
        entry as unknown as Parameters<typeof buildLocalBacktestSummary>[0]
      );
      await putSummary(kind, summary).catch(() => undefined);
    }
    if (!matches || matches(summary)) result.push(summary);
  }
  return result;
};

// List rows for local backtests, newest first, WITHOUT their payloads.
// Pages that list backtests must use this rather than `getAllFull`: the store
// is never pruned and each entry carries the complete engine result (a point
// per candle), so a heavy backtester's store can run to gigabytes once read.
// Open one backtest with `getById(id, true)` / `getHedgeById(id, true)`.
export const listLocalBacktestSummaries = (
  kind: LocalBacktestStoreKind,
  options: ListLocalBacktestSummariesOptions = {}
): Promise<LocalBacktestSummary[]> => {
  return enqueueSummaryTask(kind, () =>
    readSummaries(kind, options).catch((e: unknown) => {
      handleError(
        `Catch error in list summaries ${(e as Error).message}`,
        kind === 'hedge' ? DBHedgeCredentials.store : DBCredentials.store
      );
      return [] as LocalBacktestSummary[];
    })
  );
};

export const getHedgeAll = async (): Promise<StoreHedgeBacktest[]> => {
  try {
    const db = await initHedgeDb();
    return await db.getAll();
  } catch (e) {
    handleError(
      `Catch error in hedge get all ${(e as Error).message}`,
      DBHedgeCredentials.store
    );
    return [];
  }
};

// Returns all hedge backtest entries with full `data` payloads
export const getHedgeAllFull = async (): Promise<StoreHedgeBacktest[]> => {
  try {
    const db = await initHedgeDb();
    return await db.getAllFull();
  } catch (e) {
    handleError(
      `Catch error in hedge get all full ${(e as Error).message}`,
      DBHedgeCredentials.store
    );
    return [];
  }
};

export const getById = async (
  id: string,
  full = false
): Promise<StoreBacktest | undefined | null> => {
  try {
    const db = await initDb();
    return await db.getById(id, full);
  } catch (e) {
    handleError(
      `Catch error in get by id ${(e as Error).message}`,
      DBCredentials.store
    );
    return null;
  }
};

export const getHedgeById = async (
  id: string,
  full = false
): Promise<StoreHedgeBacktest | undefined | null> => {
  try {
    const db = await initHedgeDb();
    return await db.getById(id, full);
  } catch (e) {
    handleError(
      `Catch error in hedge get by id ${(e as Error).message}`,
      DBHedgeCredentials.store
    );
    return null;
  }
};

export const removeId = async (id: string): Promise<boolean> => {
  try {
    const db = await initDb();
    const removed = await db.deleteKey(id);
    invalidateSummaries('backtest', [id]);
    return removed;
  } catch (e) {
    handleError(
      `Catch error in remove id ${(e as Error).message}. ID: ${id}`,
      DBCredentials.store
    );
    return false;
  }
};

export const removeAll = async (): Promise<boolean> => {
  try {
    const db = await initDb();
    const cleared = await db.clear();
    resetSummaries('backtest');
    return cleared;
  } catch (e) {
    handleError(
      `Catch error in remove all ${(e as Error).message}`,
      DBCredentials.store
    );
    return false;
  }
};

export const removeHedgeId = async (id: string): Promise<boolean> => {
  try {
    const db = await initHedgeDb();
    const removed = await db.deleteKey(id);
    invalidateSummaries('hedge', [id]);
    return removed;
  } catch (e) {
    handleError(
      `Catch error in hedge remove id ${(e as Error).message}. ID: ${id}`,
      DBHedgeCredentials.store
    );
    return false;
  }
};

export const removeHedgeAll = async (): Promise<boolean> => {
  try {
    const db = await initHedgeDb();
    const cleared = await db.clear();
    resetSummaries('hedge');
    return cleared;
  } catch (e) {
    handleError(
      `Catch error in hedge remove all ${(e as Error).message}`,
      DBHedgeCredentials.store
    );
    return false;
  }
};

export const save = async (data: StoreBacktest): Promise<boolean> => {
  try {
    const db = await initDb();
    const saved = await db.save(data);
    // Drop the list summary; the next listing rebuilds it from the new
    // payload (writers such as a sync pull save many entries in a row, so
    // parsing each payload here would be wasted work).
    invalidateSummaries('backtest', [data.id]);
    return saved;
  } catch (e) {
    const error = (e as Error)?.message || `${e}`;
    if (error && `${error}` !== 'QuotaExceededError') {
      handleError(`Catch error in save ${error}`, DBCredentials.store);
    }
    return false;
  }
};

export const saveHedge = async (data: StoreHedgeBacktest): Promise<boolean> => {
  try {
    const db = await initHedgeDb();
    const saved = await db.save(data);
    invalidateSummaries('hedge', [data.id]);
    return saved;
  } catch (e) {
    const error = (e as Error)?.message || `${e}`;
    if (error && `${error}` !== 'QuotaExceededError') {
      handleError(
        `Catch error in save hedge ${error}`,
        DBHedgeCredentials.store
      );
    }
    return false;
  }
};
