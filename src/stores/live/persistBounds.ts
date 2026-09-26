/**
 * Size bounds for what the live stores write to IndexedDB (and, for the
 * websocket-appended maps, keep in memory). Pure functions: they take the
 * persisted slice and return a bounded copy, reusing untouched sub-objects.
 *
 * Everything dropped here is server data the pages refetch on mount; the
 * persisted copy only exists to paint the last known state quickly.
 */

type Timed = { updateTime?: number | string | null; status?: string };

const timeOf = (x: Timed | undefined): number => {
  const t = x?.updateTime;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
};

/** Newest `cap` entries of a keyed map by updateTime (same object if within cap). */
export function newestEntries<T extends Timed>(
  map: Record<string, T>,
  cap: number
): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= cap) return map;
  keys.sort((a, b) => timeOf(map[b]) - timeOf(map[a]));
  const out: Record<string, T> = {};
  for (const k of keys.slice(0, cap)) {
    const v = map[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const CLOSED_DEAL_STATUSES = new Set(['closed', 'canceled']);

export interface DealBoundsOptions {
  /** How many most-recently viewed bots keep closed deals. */
  closedBots: number;
  /** Closed deals kept per such bot (newest first). */
  closedPerBot: number;
}

export const DEFAULT_DEAL_BOUNDS: DealBoundsOptions = {
  closedBots: 10,
  closedPerBot: 200,
};

/**
 * Persisted deals: every non-closed deal, plus the newest closed deals of the
 * `closedBots` bots whose closed list was viewed most recently.
 */
export function boundPersistedDeals<D extends Timed>(
  deals: Record<string, Record<string, D>>,
  closedViewedAt: Record<string, number>,
  opts: DealBoundsOptions = DEFAULT_DEAL_BOUNDS
): {
  deals: Record<string, Record<string, D>>;
  closedViewedAt: Record<string, number>;
} {
  const recent = Object.entries(closedViewedAt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.closedBots);
  const keepClosed = new Set(recent.map(([id]) => id));
  const out: Record<string, Record<string, D>> = {};
  for (const [botId, bucket] of Object.entries(deals)) {
    const open: Record<string, D> = {};
    const closed: Record<string, D> = {};
    let closedCount = 0;
    for (const [id, d] of Object.entries(bucket)) {
      if (d && CLOSED_DEAL_STATUSES.has(String(d.status))) {
        closed[id] = d;
        closedCount++;
      } else {
        open[id] = d;
      }
    }
    if (closedCount === 0) {
      out[botId] = bucket;
    } else if (keepClosed.has(botId)) {
      out[botId] = { ...open, ...newestEntries(closed, opts.closedPerBot) };
    } else if (Object.keys(open).length > 0) {
      out[botId] = open;
    }
  }
  return { deals: out, closedViewedAt: Object.fromEntries(recent) };
}

/** Newest `cap` filled orders across all bots. */
export function boundFilledOrders<O extends Timed>(
  filled: Record<string, Record<string, O>>,
  cap: number
): Record<string, Record<string, O>> {
  let total = 0;
  for (const b of Object.values(filled)) total += Object.keys(b).length;
  if (total <= cap) return filled;
  const all: Array<[string, string, number]> = [];
  for (const [botId, b] of Object.entries(filled)) {
    for (const [id, o] of Object.entries(b)) all.push([botId, id, timeOf(o)]);
  }
  all.sort((a, b) => b[2] - a[2]);
  const out: Record<string, Record<string, O>> = {};
  for (const [botId, id] of all.slice(0, cap)) {
    const o = filled[botId]?.[id];
    if (o !== undefined) (out[botId] ??= {})[id] = o;
  }
  return out;
}

/** Per-bot cap on a botId → id → item map. */
export function boundPerBot<T extends Timed>(
  byBot: Record<string, Record<string, T>>,
  capPerBot: number
): Record<string, Record<string, T>> {
  let changed = false;
  const out: Record<string, Record<string, T>> = {};
  for (const [botId, b] of Object.entries(byBot)) {
    const bounded = newestEntries(b, capPerBot);
    if (bounded !== b) changed = true;
    out[botId] = bounded;
  }
  return changed ? out : byBot;
}
