/**
 * IndexedDB storage adapter for Zustand persist middleware
 * Provides much larger storage capacity than localStorage (typically 50MB-1GB+)
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { liveStoreHydrationQueue } from '@/stores/hydrationQueue';
import logger from './loggerInstance';
import {
  cancelAllPersistWrites,
  createPersistWriter,
} from './persistWriteScheduler';

const DB_NAME = 'ZustandStorage';
const DB_VERSION = 1;
const STORE_NAME = 'state';

/**
 * Return a structured-clone-safe deep copy of `input`, dropping values that
 * IndexedDB's structured-clone algorithm rejects (functions, symbols, and
 * anything left after those are removed) and breaking circular references.
 *
 * This is the recovery path for `setItem`: if a persisted blob picks up a
 * non-cloneable value at runtime (e.g. a stray function/handle attached to a
 * cached object), `store.put` throws `DataCloneError` and the write silently
 * fails — which previously froze ALL persistence for that store (deletes and
 * new items never landed). Sanitizing and retrying strips the offending data
 * so the write succeeds and the cache self-heals.
 */
function makeCloneable<T>(input: T, seen: WeakSet<object> = new WeakSet()): T {
  if (input === null) return input;
  const t = typeof input;
  if (t === 'function' || t === 'symbol' || t === 'undefined') {
    return undefined as unknown as T;
  }
  if (t !== 'object') return input; // string | number | boolean | bigint
  // Structured-clone supports these object types directly.
  if (
    input instanceof Date ||
    input instanceof RegExp ||
    input instanceof ArrayBuffer ||
    ArrayBuffer.isView(input as unknown as ArrayBufferView)
  ) {
    return input;
  }
  if (seen.has(input as unknown as object)) {
    return undefined as unknown as T; // break cycle
  }
  seen.add(input as unknown as object);
  if (Array.isArray(input)) {
    return input.map((v) => makeCloneable(v, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>)) {
    const cleaned = makeCloneable(
      (input as Record<string, unknown>)[key],
      seen
    );
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out as unknown as T;
}

class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error(
          '[IndexedDBStorage] Failed to open database:',
          request.error
        );
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.dbPromise;
  }

  async getItem<S>(name: string): Promise<StorageValue<S> | null> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(name);

        request.onsuccess = () => {
          const value = request.result;
          if (value === undefined) {
            logger.debug(`[IndexedDBStorage] No data found for key: ${name}`);
            resolve(null);
          } else {
            logger.debug(`[IndexedDBStorage] Retrieved data for key: ${name}`);
            // Value is already the parsed object
            resolve(value as StorageValue<S>);
          }
        };

        request.onerror = () => {
          console.error(
            '[IndexedDBStorage] Failed to get item:',
            request.error
          );
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] getItem error:', error);
      // Fallback to localStorage if IndexedDB fails
      try {
        const str = localStorage.getItem(name);
        if (str) {
          logger.debug(
            `[IndexedDBStorage] Falling back to localStorage for key: ${name}`
          );
          return JSON.parse(str);
        }
        return null;
      } catch {
        return null;
      }
    }
  }

  async setItem<S>(name: string, value: StorageValue<S>): Promise<void> {
    try {
      logger.debug(
        `[IndexedDBStorage] Attempting to save data for key: ${name}`
      );
      const db = await this.getDB();

      // Single put attempt. `store.put` can throw DataCloneError *synchronously*
      // (the structured clone happens before the request is queued), so we guard
      // the put call itself, not just the async onerror.
      const putValue = (val: unknown): Promise<void> =>
        new Promise((resolve, reject) => {
          let request: IDBRequest;
          try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            request = transaction.objectStore(STORE_NAME).put(val, name);
            // Commit now rather than when the task ends, so a write flushed
            // from pagehide is handed to the backend before the page goes.
            (transaction as IDBTransaction & { commit?: () => void }).commit?.();
          } catch (syncErr) {
            reject(syncErr);
            return;
          }
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

      try {
        await putValue(value);
        logger.debug(
          `[IndexedDBStorage] Successfully saved data for key: ${name}`
        );
        return;
      } catch (putError) {
        // A non-cloneable value poisoned the blob — strip it and retry so the
        // write (e.g. a session delete/create) actually lands instead of
        // silently failing and freezing all persistence for this key.
        console.warn(
          `[IndexedDBStorage] put failed for key "${name}" (${
            (putError as Error)?.name || 'error'
          }); sanitizing non-cloneable values and retrying`,
          putError
        );
        await putValue(makeCloneable(value));
        logger.debug(
          `[IndexedDBStorage] Saved sanitized data for key: ${name}`
        );
        return;
      }
    } catch (error) {
      console.error('[IndexedDBStorage] setItem error:', error);
      // Fallback to localStorage if IndexedDB fails
      try {
        logger.debug(
          `[IndexedDBStorage] Falling back to localStorage for saving key: ${name}`
        );
        localStorage.setItem(name, JSON.stringify(value));
      } catch (lsError) {
        // Typically QuotaExceededError: the origin's ~5 MB localStorage cannot
        // hold a blob that was meant for IndexedDB. Losing this cache write is
        // harmless (it is refetched); throwing would surface out of the
        // store's set() and break every later action on the store.
        console.warn(
          `[IndexedDBStorage] could not persist "${name}" (IndexedDB and localStorage both failed):`,
          (lsError as Error)?.name || lsError
        );
      }
    }
  }

  async removeItem(name: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.delete(name);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(
            '[IndexedDBStorage] Failed to remove item:',
            request.error
          );
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] removeItem error:', error);
      // Fallback to localStorage
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignore
      }
    }
  }

  async clearAll(): Promise<void> {
    // A throttled write still pending would land after the wipe and
    // resurrect the data being cleared.
    cancelAllPersistWrites();
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(
            '[IndexedDBStorage] Failed to clear all items:',
            request.error
          );
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] clearAll error:', error);
      // Fallback to localStorage
      try {
        localStorage.clear();
      } catch {
        // Ignore
      }
    }
  }
}

// Create singleton instance
export const indexedDBStorage = new IndexedDBStorage();

export interface IndexedDBStorageOptions {
  /** Trailing write throttle (ms). Default 2000. */
  throttleMs?: number;
  /** Plain-object levels compared by reference for the dirty check. Default 2. */
  compareDepth?: number;
  /** Applied to the persisted state right before it is written (e.g. to
   *  bound a cache). Runs once per actual write, never per `set()`. */
  prepare?: (state: unknown) => unknown;
}

const DEFAULT_THROTTLE_MS = 2000;

function readLegacyLocalStorage(name: string): StorageValue<unknown> | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as StorageValue<unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * zustand `PersistStorage` over IndexedDB. Writes go through a
 * {@link createPersistWriter}: dirty-checked, throttled (trailing), gated on
 * hydration and flushed on page hide — see persistWriteScheduler.ts.
 */
export const createIndexedDBStorage = (
  storageKey: string,
  options: IndexedDBStorageOptions = {}
): PersistStorage<unknown> => {
  // Set when the saved value came from a pre-IndexedDB localStorage copy; that
  // copy is removed once the first IndexedDB write has landed.
  let legacyLocalStorageKey: string | null = null;
  const writer = createPersistWriter({
    name: storageKey,
    throttleMs: options.throttleMs ?? DEFAULT_THROTTLE_MS,
    compareDepth: options.compareDepth ?? 2,
    ...(options.prepare ? { prepare: options.prepare } : {}),
    write: async (name, value) => {
      await indexedDBStorage.setItem<unknown>(
        name,
        value as StorageValue<unknown>
      );
      if (legacyLocalStorageKey) {
        try {
          localStorage.removeItem(legacyLocalStorageKey);
        } catch {
          // ignore
        }
        legacyLocalStorageKey = null;
      }
    },
  });

  return {
    getItem: async (name: string) => {
      try {
        const saved = await indexedDBStorage.getItem<unknown>(name);
        if (saved === null) {
          // One-time migration of a store persisted to localStorage by an old
          // build. A synchronous key lookup — no extra IndexedDB read.
          const legacy = readLegacyLocalStorage(name);
          if (legacy) {
            legacyLocalStorageKey = name;
            // Baseline null: the first change writes it to IndexedDB.
            writer.markHydrated(null);
            return legacy;
          }
        }
        writer.markHydrated(saved);
        return saved;
      } catch (error) {
        writer.markHydrated(null);
        throw error;
      }
    },
    setItem: (_name: string, value: StorageValue<unknown>) =>
      writer.setItem(value),
    removeItem: (name: string) => {
      writer.cancel();
      return indexedDBStorage.removeItem(name);
    },
  };
};

/**
 * Same as `createIndexedDBStorage` but routes `getItem` through
 * `liveStoreHydrationQueue` so heavy live stores (dca/combo/grid/hedge
 * bots, transactions, deals, orders, minigrids) hydrate one at a time
 * with an idle-callback yield between each. Prevents the simultaneous
 * structured-clone spike that triggers OOM crashes on Windows Chrome
 * for users with large persisted state.
 *
 * Use this for any store whose persisted payload can grow into the
 * tens of MB. Lightweight stores (UI settings, theme, etc.) can keep
 * using `createIndexedDBStorage` directly — the queue overhead isn't
 * worth it for small blobs. Heavy stores default to a longer throttle.
 */
export const createQueuedIndexedDBStorage = (
  storageKey: string,
  options: IndexedDBStorageOptions = {}
): PersistStorage<unknown> => {
  const base = createIndexedDBStorage(storageKey, {
    throttleMs: 4000,
    ...options,
  });
  return {
    ...base,
    getItem: (name: string) =>
      liveStoreHydrationQueue.enqueue(`store:${storageKey}`, async () =>
        // `getItem` on PersistStorage is typed to allow sync or async
        // returns. Our IDB-backed implementation is always async; force
        // the result through `await` so the queue's Promise<T> resolves
        // to the concrete value rather than Promise<Promise<...>>.
        await base.getItem(name)
      ),
  };
};
