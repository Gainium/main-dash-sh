import type { StoreBacktest, StoreHedgeBacktest } from '@/types';
import DB, { handleError } from '../indexedDb';

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

// Returns all local backtests with full `data` payload, read in one
// transaction (`getAll()` alone masks `data` to keep list reads cheap).
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

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

// Creation time of a local entry, read from its id so the payload never has
// to be loaded to order entries. Saved backtests are keyed by their server
// ObjectId (seconds in the first 4 bytes); unsaved ones by
// `${symbol}-${time}`. Unknown shapes sort last.
export const localBacktestTimeFromId = (id: string): number => {
  if (OBJECT_ID_RE.test(id)) return parseInt(id.slice(0, 8), 16) * 1000;
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

// The `limit` newest local backtests that satisfy `matches`, with full `data`.
// Pages that list backtests must use this rather than `getAllFull`: the store
// is never pruned and each entry carries the complete engine result (a point
// per candle), so a heavy backtester's store can run to gigabytes once parsed.
export const getRecentFull = async (
  matches: (entry: StoreBacktest) => boolean,
  limit: number
): Promise<StoreBacktest[]> => {
  try {
    const db = await initDb();
    return await db.getNewestFull(matches, limit, localBacktestTimeFromId);
  } catch (e) {
    handleError(
      `Catch error in get recent full ${(e as Error).message}`,
      DBCredentials.store
    );
    return [];
  }
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

export const removeId = async (id: string): Promise<StoreBacktest[]> => {
  try {
    const db = await initDb();
    return await db.removeId(id);
  } catch (e) {
    handleError(
      `Catch error in remove id ${(e as Error).message}. ID: ${id}`,
      DBCredentials.store
    );
    return [];
  }
};

export const removeAll = async (): Promise<StoreBacktest[]> => {
  try {
    const db = await initDb();
    return await db.removeAll();
  } catch (e) {
    handleError(
      `Catch error in remove all ${(e as Error).message}`,
      DBCredentials.store
    );
    return [];
  }
};

export const removeHedgeId = async (
  id: string
): Promise<StoreHedgeBacktest[]> => {
  try {
    const db = await initHedgeDb();
    return await db.removeId(id);
  } catch (e) {
    handleError(
      `Catch error in hedge remove id ${(e as Error).message}. ID: ${id}`,
      DBHedgeCredentials.store
    );
    return [];
  }
};

export const removeHedgeAll = async (): Promise<StoreHedgeBacktest[]> => {
  try {
    const db = await initHedgeDb();
    return await db.removeAll();
  } catch (e) {
    handleError(
      `Catch error in hedge remove all ${(e as Error).message}`,
      DBHedgeCredentials.store
    );
    return [];
  }
};

export const save = async (data: StoreBacktest): Promise<boolean> => {
  try {
    const db = await initDb();
    return await db.save(data);
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
    return await db.save(data);
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
