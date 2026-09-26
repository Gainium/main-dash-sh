/* eslint-disable @typescript-eslint/ban-ts-comment */

import {
  type StoreNames,
  openDB,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreKey,
  type StoreValue,
} from 'idb/with-async-ittr';
/* import GraphQlFetch, { GraphQlQuery } from 'fetch'
import { initStore } from 'store' */

type Credentials<T> = {
  version: number;
  store: StoreNames<T>;
  dbName: string;
};

type UpgradeFn<T> = (
  database: IDBPDatabase<T>,
  oldVersion: number,
  newVersion: number | null,
  transaction: IDBPTransaction<T, StoreNames<T>[], 'versionchange'>,
  event: IDBVersionChangeEvent,
  handleError: (error: string) => void
) => void;

export const handleError = async (error: string, _subType: string) => {
  /* if (
    `${error}`.includes('QuotaExceededError') ||
    `${error}`.includes(
      'The operation failed for reasons unrelated to the database itself and not covered by any other error code',
    ) ||
    `${error}`.includes('Connection to Indexed Database server lost') ||
    `${error}`.includes("Can't find variable: indexedDB") ||
    `${error}`.includes('Internal error') ||
    `${error}`.includes('not enough space for domain')
  ) {
    return
  }
  const token = initStore.getState().token ?? ''
  const fetch = new GraphQlFetch(token)
  await fetch.fetch<unknown>(
    GraphQlQuery.sendError({
      error: {
        message: `${error}`,
        stack: `${new Error().stack}`,
      },
      errorInfo: { componentStack: '' },
      subType,
    }),
    'sendError',
  ) */

  console.error(error);
};

class DB<T extends Record<string, unknown>> {
  private DBCredentials: Credentials<T> | null = null;

  private upgrade: UpgradeFn<T> | null = null;

  constructor(DBCredentials: Credentials<T>, upgrade: UpgradeFn<T>) {
    this.DBCredentials = DBCredentials;
    this.upgrade = upgrade;
  }

  private async handleError(error: string) {
    handleError(error, this.DBCredentials?.store ?? 'IndexedDB');
  }

  public async initDb() {
    if (!this.DBCredentials) {
      return;
    }
    const db = await openDB<T>(
      this.DBCredentials.dbName,
      this.DBCredentials.version,
      {
        upgrade: async (database, oldVersion, newVersion, tx, ev) => {
          if (this.upgrade) {
            this.upgrade(
              database,
              oldVersion,
              newVersion,
              tx,
              ev,
              this.handleError.bind(this)
            );
          }
        },
      }
    );
    db.onerror = (event) => {
      this.handleError(
        // @ts-ignore
        `DB error ${event.target?.error}.`
      );
    };
    return db;
  }

  public async getAll(): Promise<T[]> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readonly');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX get all error ${event.target?.error}.`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);
      const result = (await objectStore.getAll()) as T[] | null;
      await tx.done;
      db.close();
      return (result ?? []).map((r) => ({ ...r, data: '' }));
    } catch (e) {
      this.handleError(`Catch error in get all ${(e as Error).message}`);
      return [];
    }
  }

  // Every entry WITH its `data` payload, read in one transaction.
  public async getAllFull(): Promise<T[]> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readonly');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX get all full error ${event.target?.error}.`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);
      const result = (await objectStore.getAll()) as T[] | null;
      await tx.done;
      db.close();
      return result ?? [];
    } catch (e) {
      this.handleError(`Catch error in get all full ${(e as Error).message}`);
      return [];
    }
  }

  // Every primary key, without reading any value. Values here can be
  // megabytes each; reading keys lets a caller decide which few to load.
  public async getAllKeys(): Promise<StoreKey<T, StoreNames<T>>[]> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readonly');
      const keys = (await tx
        .objectStore(this.DBCredentials.store)
        .getAllKeys()) as StoreKey<T, StoreNames<T>>[];
      await tx.done;
      db.close();
      return keys;
    } catch (e) {
      this.handleError(`Catch error in get all keys ${(e as Error).message}`);
      return [];
    }
  }

  public async getById(
    id: StoreKey<T, StoreNames<T>>,
    full = false
  ): Promise<T | undefined | null> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readonly');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX get by id error ${event.target?.error}.`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);

      const result = (await objectStore.get(id)) as T | null;
      await tx.done;
      db.close();
      return result ? (full ? result : { ...result, data: '' }) : null;
    } catch (e) {
      this.handleError(`Catch error in get by id ${(e as Error).message}`);
      return null;
    }
  }

  // Delete one entry without re-reading the rest of the store (removeId
  // returns every remaining entry, which reads all of their values).
  public async deleteKey(id: StoreKey<T, StoreNames<T>>): Promise<boolean> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readwrite');
      await tx.objectStore(this.DBCredentials.store).delete(id);
      await tx.done;
      db.close();
      return true;
    } catch (e) {
      this.handleError(
        `Catch error in delete key ${(e as Error).message}. ID: ${id}`
      );
      return false;
    }
  }

  // Empty the store without reading it.
  public async clear(): Promise<boolean> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readwrite');
      await tx.objectStore(this.DBCredentials.store).clear();
      await tx.done;
      db.close();
      return true;
    } catch (e) {
      this.handleError(`Catch error in clear ${(e as Error).message}`);
      return false;
    }
  }

  public async removeId(id: StoreKey<T, StoreNames<T>>): Promise<T[]> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readwrite');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX remove id error ${event.target?.error}. ID: ${id}`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);
      await objectStore.delete(id);
      const all = (await objectStore.getAll()) as T[] | null;
      await tx.done;
      db.close();
      return (all ?? []).map((r) => ({ ...r, data: '' }));
    } catch (e) {
      this.handleError(
        `Catch error in remove id ${(e as Error).message}. ID: ${id}`
      );
      return [];
    }
  }

  public async removeAll(): Promise<T[]> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readwrite');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX remove all error ${event.target?.error}`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);
      const all = (await objectStore.getAll()) as T[] | null;
      await Promise.all(
        (all ?? []).map(async (a) => {
          await objectStore.delete(a['id'] as StoreKey<T, StoreNames<T>>);
        })
      );
      const allAfter = (await objectStore.getAll()) as T[] | null;
      await tx.done;
      db.close();
      return (allAfter ?? []).map((r) => ({ ...r, data: '' }));
    } catch (e) {
      this.handleError(`Catch error in remove all ${(e as Error).message}`);
      return [];
    }
  }

  public async save(data: StoreValue<T, StoreNames<T>>): Promise<boolean> {
    try {
      const db = await this.initDb();
      if (!db || !this.DBCredentials) {
        throw new Error(`DB not found`);
      }
      const tx = db.transaction(this.DBCredentials.store, 'readwrite');
      tx.onerror = (event) => {
        this.handleError(
          // @ts-ignore
          `TX save error ${event.target?.error}`
        );
      };
      const objectStore = tx.objectStore(this.DBCredentials.store);
      await objectStore.delete(data.id as StoreKey<T, StoreNames<T>>);
      await objectStore.add(data);
      await tx.done;
      db.close();
      return true;
    } catch (e) {
      const error = (e as Error)?.message || e;
      if (error && `${error}` !== 'QuotaExceededError') {
        this.handleError(`Catch error in save ${error}`);
      }
      return false;
    }
  }
}

export default DB;
