import logger from '@/lib/loggerInstance';

// Tombstone registry + freshness arbitration for the two-layer cache.
//
// After a local mutation (close deal, stop/delete bot), a stale React Query
// cached list response can replay through the store and resurrect the entity.
// Tombstones record "this entity was just closed/deleted at version X" so the
// stores can reject older write-backs until the server confirms something
// newer. Persisted to sessionStorage so a same-tab reload (which restores the
// RQ persisted cache) still rejects the stale replay.

const SESSION_KEY = 'gainium.staleWriteTombstones';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export interface DealTombstone {
  dealUpdateTime: number;
  status: string;
  at: number;
}

export interface BotTombstone {
  botUpdated: number;
  at: number;
}

let dealTombstones = new Map<string, DealTombstone>();
let botTombstones = new Map<string, BotTombstone>();
let loaded = false;

const dealKey = (botId: string, dealId: string): string => `${botId}::${dealId}`;

const now = (): number => Date.now();

const prune = (): void => {
  const t = now();
  for (const [key, entry] of dealTombstones) {
    if (t - entry.at > MAX_AGE_MS) dealTombstones.delete(key);
  }
  for (const [key, entry] of botTombstones) {
    if (t - entry.at > MAX_AGE_MS) botTombstones.delete(key);
  }
};

const persist = (): void => {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        deals: [...dealTombstones],
        bots: [...botTombstones],
      })
    );
  } catch (error) {
    // In-memory Maps remain authoritative when sessionStorage is unavailable.
    logger.warn('[staleWriteGuard] failed to persist tombstones', error);
  }
};

const load = (): void => {
  if (loaded) return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        deals?: Array<[string, DealTombstone]>;
        bots?: Array<[string, BotTombstone]>;
      };
      dealTombstones = new Map(parsed.deals ?? []);
      botTombstones = new Map(parsed.bots ?? []);
    }
  } catch (error) {
    dealTombstones = new Map();
    botTombstones = new Map();
    logger.warn('[staleWriteGuard] failed to load tombstones', error);
  }
  prune();
};

export function recordDealTombstone(
  botId: string,
  dealId: string,
  status: string,
  dealUpdateTime: number
): void {
  load();
  dealTombstones.set(dealKey(botId, dealId), {
    dealUpdateTime: dealUpdateTime ?? 0,
    status,
    at: now(),
  });
  prune();
  persist();
}

export function consultDealTombstone(
  botId: string,
  dealId: string,
  incoming: { updateTime?: number; status?: string }
): 'none' | 'reject' | 'accept-clear' {
  load();
  const key = dealKey(botId, dealId);
  const tomb = dealTombstones.get(key);
  if (!tomb) return 'none';
  // Accept conditions first so status-equality (echo of our own close) wins
  // even when the incoming payload omits updateTime.
  if (
    (typeof incoming.updateTime === 'number' &&
      incoming.updateTime > tomb.dealUpdateTime) ||
    (incoming.status != null && incoming.status === tomb.status)
  ) {
    dealTombstones.delete(key);
    persist();
    return 'accept-clear';
  }
  return 'reject';
}

export function recordBotTombstone(botId: string, botUpdatedMs: number): void {
  load();
  botTombstones.set(botId, { botUpdated: botUpdatedMs ?? 0, at: now() });
  prune();
  persist();
}

export function consultBotTombstone(
  botId: string,
  incomingUpdatedMs: number | undefined
): 'none' | 'reject' | 'accept-clear' {
  load();
  const tomb = botTombstones.get(botId);
  if (!tomb) return 'none';
  if (
    typeof incomingUpdatedMs === 'number' &&
    incomingUpdatedMs > tomb.botUpdated
  ) {
    botTombstones.delete(botId);
    persist();
    return 'accept-clear';
  }
  return 'reject';
}

/**
 * Drop the tombstone for a single bot. Used when a bot legitimately returns to
 * the lists (un-archive) so it is not blocked by the archive-time tombstone —
 * the timestamp-based auto-clear in `consultBotTombstone` can miss when the
 * recorded/incoming `updated` ms are equal or unparseable (0).
 */
export function clearBotTombstone(botId: string): void {
  load();
  if (botTombstones.delete(botId)) {
    persist();
  }
}

export function clearAllTombstones(): void {
  dealTombstones = new Map();
  botTombstones = new Map();
  loaded = true;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    logger.warn('[staleWriteGuard] failed to clear tombstones', error);
  }
}

export function isIncomingDealStale(
  existing: { updateTime?: number } | undefined,
  incoming: { updateTime?: number }
): boolean {
  // STRICT less: equal updateTimes must pass (optimistic writes reuse the
  // same updateTime).
  return (
    !!existing &&
    typeof existing.updateTime === 'number' &&
    typeof incoming.updateTime === 'number' &&
    incoming.updateTime < existing.updateTime
  );
}

const toMs = (v: string | number | undefined): number => {
  if (v == null) return NaN;
  return new Date(v).getTime();
};

export function isIncomingBotStale(
  existing: { updated?: string | number } | undefined,
  incoming: { updated?: string | number }
): boolean {
  const existingMs = toMs(existing?.updated);
  const incomingMs = toMs(incoming?.updated);
  if (Number.isNaN(existingMs) || Number.isNaN(incomingMs)) return false;
  return incomingMs < existingMs; // STRICT less
}
