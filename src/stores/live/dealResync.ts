/**
 * Deal-list resync.
 *
 * Deal lists fetch a snapshot when they mount and are then patched only by
 * `bot deal update` socket events. An event that never lands — the socket was
 * down across a sleep, a network drop or a backgrounded tab — leaves a finished
 * deal listed as open until the page remounts, and its Close can never succeed.
 *
 * `requestDealResync()` asks every mounted deal list for a fresh snapshot;
 * `reconcileDeals` then prunes the deals the server no longer returns.
 */

import { create } from 'zustand';
import {
  botWebSocketManager,
  type WebSocketEvent,
} from '../../services/websocket/BotWebSocketManager';
import { invalidateListCaches } from '@/lib/queryCacheUtils';
import logger from '@/lib/loggerInstance';

interface DealResyncState {
  /** Bumped on every resync request; lists that fetch by hand watch it. */
  nonce: number;
}

export const useDealResyncStore = create<DealResyncState>(() => ({
  nonce: 0,
}));

// React-query lists refetch on invalidation. `getBotDeals`/`getComboBotDeals`
// are deliberately absent: an invalidation re-fetches only their current page,
// and the reconcile would then prune the other pages' deals, so
// useBotSpecificDeals re-snapshots from page 0 on the nonce instead.
const QUERY_DEAL_LIST_KEYS = ['dcaDealList', 'comboDealList'];

export function requestDealResync(reason: string): void {
  logger.info('[dealResync] Refreshing deal lists', { reason });
  useDealResyncStore.setState((s) => ({ nonce: s.nonce + 1 }));
  invalidateListCaches(QUERY_DEAL_LIST_KEYS);
}

/** A tab hidden at least this long may have missed deal events. */
export const HIDDEN_RESYNC_AFTER_MS = 30_000;

const SUBSCRIBER_ID = 'deal-resync';
let stopTriggers: (() => void) | null = null;

/**
 * Resync on a socket REconnect — the first connect needs none, the lists fetch
 * on mount — and when a tab returns after being hidden long enough to have
 * missed events. Idempotent: a second start replaces the first.
 */
export function startDealResyncTriggers(): void {
  stopDealResyncTriggers();

  let connectedBefore = botWebSocketManager.getIsConnected();
  botWebSocketManager.subscribe('connect', {
    id: SUBSCRIBER_ID,
    callback: (_event: WebSocketEvent) => {
      if (connectedBefore) {
        requestDealResync('socket reconnected');
      }
      connectedBefore = true;
    },
  });

  let hiddenAt: number | null = document.hidden ? Date.now() : null;
  const onVisibilityChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_RESYNC_AFTER_MS) {
      requestDealResync('tab visible again');
    }
    hiddenAt = null;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  stopTriggers = () => {
    botWebSocketManager.unsubscribe('connect', SUBSCRIBER_ID);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export function stopDealResyncTriggers(): void {
  stopTriggers?.();
  stopTriggers = null;
}
