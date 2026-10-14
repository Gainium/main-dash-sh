import { useSyncExternalStore } from 'react';
import getLatestPrices, {
  getLocalPrices,
  getPricesFetchedAt,
} from '@/helper/price';
import type { Prices } from '@/types';

/**
 * One shared, throttled price feed for React consumers.
 *
 * Every hook used to open its own `getLatestPrices` subscription and keep its
 * own copy of the (tens-of-thousands-row) price array in state, so each
 * refresh re-rendered every consumer separately and each subscribe re-read
 * the IndexedDB snapshot. This keeps ONE subscription for the whole app
 * (opened while at least one component listens), publishes at most once per
 * `PUBLISH_THROTTLE_MS`, and hands every consumer the SAME array — so the
 * per-snapshot price index in `lib/utils/unrealizedPnL.ts` is built once.
 */
const PUBLISH_THROTTLE_MS = 10_000;

let snapshot: Prices = getLocalPrices();
let lastPublish = 0;
let pending: Prices | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeFeed: (() => void) | null = null;
const listeners = new Set<() => void>();

// Whether the published snapshot came from a network fetch this session, as
// opposed to the persisted snapshot seeded at startup for a fast first paint.
let snapshotIsLive = false;

const publish = (next: Prices) => {
  if (next === snapshot) return;
  snapshot = next;
  snapshotIsLive = getPricesFetchedAt() > 0;
  lastPublish = Date.now();
  for (const l of listeners) l();
};

const onPrices = (next: Prices) => {
  if (!next.length) return;
  const since = Date.now() - lastPublish;
  // First real payload (or an empty seed) goes out immediately.
  if (snapshot.length === 0 || since >= PUBLISH_THROTTLE_MS) {
    pending = null;
    publish(next);
    return;
  }
  pending = next;
  if (!pendingTimer) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (pending) {
        const p = pending;
        pending = null;
        publish(p);
      }
    }, PUBLISH_THROTTLE_MS - since);
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!unsubscribeFeed) {
    unsubscribeFeed = getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) onPrices(result.data);
    }, false);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeFeed) {
      unsubscribeFeed();
      unsubscribeFeed = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    }
  };
};

const getSnapshot = () => snapshot;
const getIsLive = () => snapshotIsLive;

/**
 * The latest price snapshot (throttled to one update per 10 s). Pass
 * `enabled: false` to read nothing and keep the feed closed for this caller.
 */
export function useLatestPrices(enabled = true): Prices {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getSnapshot : emptySnapshot,
    enabled ? getSnapshot : emptySnapshot
  );
}

/**
 * False while `useLatestPrices` still serves the persisted snapshot from a
 * previous session; true once a network fetch has been published. Figures
 * priced from the snapshot should be shown as pending (`PendingLiveValue`).
 */
export function usePricesLive(enabled = true): boolean {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getIsLive : notLive,
    enabled ? getIsLive : notLive
  );
}

const notLive = () => false;

/**
 * One pair's price from the shared feed, and whether it is live (fetched this
 * session). `price` is undefined when the feed does not carry the pair.
 */
export function useLivePairPrice(
  exchange: string | undefined,
  pair: string | undefined
): { price: number | undefined; live: boolean } {
  const enabled = !!exchange && !!pair;
  const prices = useLatestPrices(enabled);
  const live = usePricesLive(enabled);
  const hit = enabled
    ? prices.find((p) => p.symbol === pair && p.exchange === exchange)
    : undefined;
  const price = hit ? Number(hit.price) : undefined;
  return {
    price: price !== undefined && Number.isFinite(price) ? price : undefined,
    live: live && hit !== undefined,
  };
}
const EMPTY: Prices = [];
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

/** Test hook: reset module state. */
export const __resetLatestPricesForTests = () => {
  snapshot = [];
  lastPublish = 0;
  pending = null;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  unsubscribeFeed?.();
  unsubscribeFeed = null;
  listeners.clear();
};
