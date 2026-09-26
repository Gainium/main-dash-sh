import { getById, type LocalBacktestSummary } from './db';
import { localBacktestTimeFromId, payloadHasDetails } from './summary';

// Local backtests as history rows: the shape of the server list rows
// (DCABacktestingResultHistory / GRIDBacktestingResultHistory), plus
// `hasLocalDetails` when this browser holds the full result.

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const mapLocalBacktestToHistory = (
  id: string,
  meta: Record<string, unknown>,
  base: Record<string, unknown>,
  hasLocalDetails: boolean
): Record<string, unknown> | null => {
  // Without a financial block this is not a backtest payload.
  if (!base['financial']) return null;
  // Older entries may lack history metadata (exchangeUUID, userId, …);
  // backfill from the entry's own fields where possible.
  return {
    ...base,
    _id: (base['_id'] as string | undefined) ?? id,
    time:
      (base['time'] as number | undefined) ??
      (localBacktestTimeFromId(id) || Date.now()),
    exchange: base['exchange'] ?? meta['exchange'],
    exchangeUUID: (base['exchangeUUID'] as string | undefined) ?? '',
    symbol: base['symbol'] ?? meta['symbol'],
    baseAsset: base['baseAsset'] ?? meta['baseAsset'],
    quoteAsset: base['quoteAsset'] ?? meta['quoteAsset'],
    userId: (base['userId'] as string | undefined) ?? 'local',
    savePermanent: (base['savePermanent'] as boolean | undefined) ?? false,
    serverSide: (base['serverSide'] as boolean | undefined) ?? false,
    hasLocalDetails,
  };
};

/** A list row from a summary — no payload is read. */
export const localSummaryToHistory = <T>(
  summary: LocalBacktestSummary
): T | null =>
  summary.row
    ? (mapLocalBacktestToHistory(
        summary.id,
        summary.meta,
        summary.row,
        summary.hasDetails
      ) as T | null)
    : null;

/**
 * The full local result for one backtest (deals, buy-and-hold curve, …) as a
 * history row, or null when this browser has no usable copy. Reads and
 * parses one payload; call it when a backtest is opened, never per row.
 */
export const loadLocalBacktestHistory = async <T>(
  id: string
): Promise<T | null> => {
  const entry = await getById(id, true);
  if (!entry || typeof entry.data !== 'string' || !entry.data) return null;
  const parsed = safeParseJson(entry.data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const { data: _data, ...meta } = entry;
  const base = parsed as Record<string, unknown>;
  return mapLocalBacktestToHistory(
    id,
    meta,
    base,
    payloadHasDetails(base)
  ) as T | null;
};
