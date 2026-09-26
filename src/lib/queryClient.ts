import { MutationCache, QueryClient } from '@tanstack/react-query';
import {
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { toast } from './toast';

// Opt-in global error feedback for mutations. A mutation that sets
// `meta: { errorToast: true }` surfaces its thrown error message (the backend
// `reason`) as a toast; `meta: { errorToast: 'message' }` toasts a fixed
// string instead. Mutations whose call sites already show their own error
// feedback simply omit the meta, so this never double-toasts existing flows.
// This is the redesign's equivalent of the legacy dashboard's central fetch
// wrapper, which funnelled every NOTOK response into a snackbar.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      errorToast?: boolean | string;
    };
  }
}

// Cache duration constants
const FIVE_SECONDS = 1000 * 5;
const FIFTEEN_SECONDS = 1000 * 15;
const THIRTY_SECONDS = 1000 * 30;
const ONE_MINUTE = 1000 * 60;
const FIVE_MINUTES = 1000 * 60 * 5;
const ONE_HOUR = 1000 * 60 * 60;

// ⚠️ IMPORTANT: This is a TRADING PLATFORM
// Data like bots, orders, deals, balances, statuses change FREQUENTLY
// Pattern: Show cache immediately on component mount, refetch if stale
// No continuous polling - only fetch when user navigates to a view

const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    const cfg = mutation.meta?.errorToast;
    if (!cfg) return;
    const message =
      typeof cfg === 'string'
        ? cfg
        : error instanceof Error && error.message
          ? error.message
          : 'Something went wrong';
    toast.error(message);
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      // SHORT stale time: data becomes stale quickly in trading context
      // When component mounts, if data is stale, trigger refetch
      staleTime: FIFTEEN_SECONDS,

      // Keep in memory for 5 minutes max to avoid excessive memory usage.
      // Matches the persisted-cache maxAge (also 5 min) so a backgrounded
      // query can't hand back a much older snapshot (e.g. a stale deal list)
      // when its view is re-opened.
      gcTime: FIVE_MINUTES,

      // Retry logic for failed requests
      retry: (failureCount, error) => {
        // A client-side read timeout is a deliberate fail-fast. Retrying it
        // just re-hangs against the same degraded backend for another full cap
        // window — 3 retries would stretch a 30s cap to ~100s before the UI
        // ever sees the error it needs to render. Surface it immediately.
        // `GraphQLTimeoutError` is thrown by GraphQLClient's abort;
        // `TimeoutError` is the DOMException from fetchWithTimeout's abort.
        // Checked by name to avoid importing the classes (and a module cycle).
        if (
          error instanceof Error &&
          (error.name === 'GraphQLTimeoutError' ||
            error.name === 'TimeoutError')
        )
          return false;
        if (failureCount >= 3) return false;
        if (error && 'status' in error && error.status === 401) return false;
        return true;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on component mount if data is stale (don't poll in background)
      refetchOnWindowFocus: false, // User switching tabs doesn't trigger refetch
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchOnMount: true, // KEY: Refetch when component mounts if stale

      // No background polling - only fetch when needed
      refetchInterval: false,

      // Show cached data immediately while fetching fresh data (best UX)
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

// ---------------------------------------------------------------------------
// Persisted React Query cache
//
// Only a small allowlist of cheap, useful-on-reload queries is persisted —
// bot/deal/order lists, messages, portfolio history and anything else large
// or volatile live in the zustand live stores or are simply refetched.
// Writes are throttled (the library's persistQueryClientSubscribe calls
// persistClient on EVERY query-cache event); the stored blob is byte-capped
// and expires after `PERSIST_MAX_AGE`. A tiny meta record is checked before
// the blob is read, so a cold start never deserializes an expired cache, and
// the restore itself is time-boxed so it can never hold the app's first
// queries back for long.
// ---------------------------------------------------------------------------

const RQ_KEY = 'reactQuery';
const RQ_META_KEY = 'reactQuery:meta';
const PERSIST_THROTTLE_MS = 3000;
const RESTORE_TIMEOUT_MS = 1500;
/** A single query larger than this is not persisted. */
const MAX_PERSISTED_QUERY_BYTES = 256 * 1024;
/** Total budget for the persisted blob. */
const MAX_PERSISTED_BYTES = 2 * 1024 * 1024;
export const PERSIST_MAX_AGE = FIVE_MINUTES;

/** First queryKey element of the queries that are worth persisting. */
export const PERSISTED_QUERY_KEYS: ReadonlySet<string> = new Set([
  'user',
  'user-settings',
  'getUnreadChangeLogs',
  'getPlatformNotifications',
  'getChangeLogs',
  'isTrialAvailable',
  'getSubscriptionPlanList',
  'global-variable',
]);

/** `dehydrateOptions.shouldDehydrateQuery` for the persister. */
export function shouldPersistQuery(query: {
  queryKey: readonly unknown[];
  state: { status: string };
}): boolean {
  const head = query.queryKey[0];
  return (
    query.state.status === 'success' &&
    typeof head === 'string' &&
    PERSISTED_QUERY_KEYS.has(head)
  );
}

const jsonSize = (v: unknown): number => {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/** Drop oversized queries and stop at the total byte budget. Exported for tests. */
export function capPersistedClient(client: PersistedClient): PersistedClient {
  let total = 0;
  const queries = client.clientState.queries
    .map((q) => ({ q, size: jsonSize(q.state.data) }))
    .filter(({ size }) => size <= MAX_PERSISTED_QUERY_BYTES)
    .filter(({ size }) => (total += size) <= MAX_PERSISTED_BYTES)
    .map(({ q }) => {
      // meta can carry callbacks, which IndexedDB cannot clone.
      const { meta: _meta, ...rest } = q;
      return rest;
    });
  return {
    ...client,
    clientState: { mutations: [], queries: queries as typeof client.clientState.queries },
  };
}

let pendingClient: PersistedClient | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function writePendingClient(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const client = pendingClient;
  pendingClient = null;
  if (!client) return;
  try {
    const capped = capPersistedClient(client);
    await set(RQ_KEY, capped);
    await set(RQ_META_KEY, { timestamp: capped.timestamp, buster: capped.buster });
  } catch (error) {
    console.warn('Failed to persist query client:', error);
  }
}

if (typeof window !== 'undefined') {
  const flush = () => {
    void writePendingClient();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);

export const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    // Keep only the latest snapshot; write it at most once per window.
    pendingClient = client;
    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        persistTimer = null;
        void writePendingClient();
      }, PERSIST_THROTTLE_MS);
    }
  },
  restoreClient: async () => {
    const restore = async (): Promise<PersistedClient | undefined> => {
      try {
        const meta = await get<{ timestamp?: number }>(RQ_META_KEY);
        if (
          !meta?.timestamp ||
          Date.now() - meta.timestamp > PERSIST_MAX_AGE
        ) {
          // Expired or written by an older build (no meta): discard WITHOUT
          // reading the blob.
          void del(RQ_KEY).catch(() => undefined);
          void del(RQ_META_KEY).catch(() => undefined);
          return undefined;
        }
        return await get<PersistedClient>(RQ_KEY);
      } catch (error) {
        console.warn('Failed to restore query client:', error);
        return undefined;
      }
    };
    return withTimeout(restore(), RESTORE_TIMEOUT_MS);
  },
  removeClient: async () => {
    pendingClient = null;
    try {
      await del(RQ_KEY);
      await del(RQ_META_KEY);
    } catch (error) {
      console.warn('Failed to remove query client:', error);
    }
  },
};

export { FIVE_MINUTES, FIVE_SECONDS, ONE_HOUR, ONE_MINUTE, THIRTY_SECONDS };
