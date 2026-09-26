import { useSyncExternalStore } from 'react';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
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

const publish = (next: Prices) => {
  if (next === snapshot) return;
  snapshot = next;
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
