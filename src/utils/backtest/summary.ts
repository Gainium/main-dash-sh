import { openDB } from 'idb/with-async-ittr';

// A small index kept next to the local backtest stores, one record per
// backtest, so list pages never have to read the full payloads.
//
// Each local backtest keeps the complete engine result as one JSON string
// (a buy-and-hold point per candle, every deal, portfolio curve, indicator
// events, grid orders and transactions). Reading one record from IndexedDB
// deserializes that whole string, so a list built from the records costs the
// size of the payloads however few fields it shows. The summary holds only
// the fields a list row renders; the payload is read with `getById(id, true)`
// when a single backtest is opened.
//
// It lives in its own database so the backtest stores keep their schema and
// version: an older build that does not know about it still opens them.

// Bump to rebuild every summary on next read (e.g. when a list starts
// rendering a field the summary does not carry).
export const LOCAL_BACKTEST_SUMMARY_VERSION = 1;

const SUMMARY_DB_NAME = 'GainiumBacktestSummary';
const SUMMARY_DB_VERSION = 1;

export type LocalBacktestStoreKind = 'backtest' | 'hedge';

const SUMMARY_STORE: Record<LocalBacktestStoreKind, string> = {
  backtest: 'BacktestSummary',
  hedge: 'HedgeBacktestSummary',
};

// Top-level fields a list row keeps: what the server list queries return
// (getBacktests / getComboBacktests / getGridBacktests). A local row replaces
// the server row with the same `_id`, so anything the tables read has to be
// here and anything the server rows lack is detail.
const LIST_ROW_FIELDS = [
  '_id',
  'maxLeverage',
  'noData',
  'serverSide',
  'financial',
  'duration',
  'usage',
  'numerical',
  'ratios',
  'interval',
  'quoteRate',
  'symbol',
  'baseAsset',
  'quoteAsset',
  'time',
  'exchange',
  'exchangeUUID',
  'settings',
  'savePermanent',
  'shareId',
  'userId',
  'value',
  'author',
  'sent',
  'config',
  'note',
  'multi',
  'multiPairs',
  'symbolStats',
  'messages',
  'periodicStats',
  'position',
] as const;

export interface LocalBacktestSummary {
  id: string;
  v: number;
  /** The entry's `type` ('DCA' | 'Combo' | 'Grid' | 'HedgeDca' | …). */
  type: string;
  /** Creation time (ms): the payload's `time`, else read from the id. */
  time: number;
  /** Serialized payload size, as stored on the entry. */
  size: number;
  /** The entry's own fields except `data` (exchange/symbol/assets, or the
   *  long/short legs for hedge entries). */
  meta: Record<string, unknown>;
  /** List fields of the parsed payload; null when it did not parse. */
  row: Record<string, unknown> | null;
  /** The payload carries per-deal / per-order detail. */
  hasDetails: boolean;
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

// Creation time of a local entry, read from its id. Saved backtests are keyed
// by their server ObjectId (seconds in the first 4 bytes); unsaved ones by
// `${symbol}-${time}` or `local-${time}-${random}`. Unknown shapes sort last.
export const localBacktestTimeFromId = (id: string): number => {
  if (OBJECT_ID_RE.test(id)) return parseInt(id.slice(0, 8), 16) * 1000;
  const local = id.match(/^local-(\d+)-/);
  if (local) return Number(local[1]);
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const nonEmptyArray = (value: unknown) =>
  Array.isArray(value) && value.length > 0;

export const pickListRowFields = (
  source: Record<string, unknown>
): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const field of LIST_ROW_FIELDS) {
    if (source[field] !== undefined) row[field] = source[field];
  }
  return row;
};

// Whether a parsed payload carries detail a list row does not: DCA/Combo
// deals, grid orders/transactions, or the per-leg results of a hedge run.
export const payloadHasDetails = (source: Record<string, unknown>): boolean =>
  nonEmptyArray(source['deals']) ||
  nonEmptyArray(source['transaction']) ||
  nonEmptyArray(source['orders']) ||
  isRecord(source['longResult']);

export const buildLocalBacktestSummary = (entry: {
  id: string;
  data?: unknown;
  size?: number;
  type?: string;
  [key: string]: unknown;
}): LocalBacktestSummary => {
  const { data, ...meta } = entry;
  let parsed: unknown = null;
  if (typeof data === 'string' && data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = null;
    }
  }
  const source = isRecord(parsed) ? parsed : null;
  // Hedge payloads keep the combined figures under `hedgeResult`.
  const listSource =
    source && isRecord(source['hedgeResult'])
      ? { ...source['hedgeResult'], config: source['config'] }
      : source;
  const payloadTime = source?.['time'];
  return {
    id: entry.id,
    v: LOCAL_BACKTEST_SUMMARY_VERSION,
    type: typeof entry.type === 'string' ? entry.type : '',
    time:
      typeof payloadTime === 'number'
        ? payloadTime
        : localBacktestTimeFromId(entry.id),
    size:
      typeof entry.size === 'number'
        ? entry.size
        : typeof data === 'string'
          ? data.length
          : 0,
    meta,
    row: listSource ? pickListRowFields(listSource) : null,
    hasDetails: !!source && payloadHasDetails(source),
  };
};

const openSummaryDb = () =>
  openDB(SUMMARY_DB_NAME, SUMMARY_DB_VERSION, {
    upgrade(database) {
      for (const store of Object.values(SUMMARY_STORE)) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: 'id' });
        }
      }
    },
  });

export const getAllSummaries = async (
  kind: LocalBacktestStoreKind
): Promise<LocalBacktestSummary[]> => {
  const db = await openSummaryDb();
  try {
    return (await db.getAll(SUMMARY_STORE[kind])) as LocalBacktestSummary[];
  } finally {
    db.close();
  }
};

export const putSummary = async (
  kind: LocalBacktestStoreKind,
  summary: LocalBacktestSummary
): Promise<void> => {
  const db = await openSummaryDb();
  try {
    await db.put(SUMMARY_STORE[kind], summary);
  } finally {
    db.close();
  }
};

export const deleteSummaries = async (
  kind: LocalBacktestStoreKind,
  ids: string[]
): Promise<void> => {
  if (ids.length === 0) return;
  const db = await openSummaryDb();
  try {
    const tx = db.transaction(SUMMARY_STORE[kind], 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  } finally {
    db.close();
  }
};

export const clearSummaries = async (
  kind: LocalBacktestStoreKind
): Promise<void> => {
  const db = await openSummaryDb();
  try {
    await db.clear(SUMMARY_STORE[kind]);
  } finally {
    db.close();
  }
};
