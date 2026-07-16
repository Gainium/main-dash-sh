import { MutationCache, QueryClient } from '@tanstack/react-query';
import {
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { toast } from './toast';
// import { logger } from './loggerInstance';

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

// Mock logger to replace removed logger calls
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};

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

// Helper function to deeply remove non-serializable values
function makeSerializable(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Promise) return undefined;
  if (typeof obj === 'function') return undefined;
  if (obj instanceof Error) return { message: obj.message, name: obj.name };

  if (Array.isArray(obj)) {
    return obj.map(makeSerializable);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = makeSerializable(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }

  return obj;
}

// Create IndexedDB persister using idb-keyval
export const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      // Deep clean the client data to remove any non-serializable content
      const cleanedClient = makeSerializable(client) as PersistedClient;

      // Store the cleaned client data
      await set('reactQuery', cleanedClient);
    } catch (error) {
      console.warn('Failed to persist query client:', error);
    }
  },
  restoreClient: async () => {
    try {
      const client = await get<PersistedClient>('reactQuery');

      // Check if the cached data is too old (older than 5 minutes)
      // For trading platform, don't rely on old cached data from previous sessions
      if (
        client &&
        client.timestamp &&
        Date.now() - client.timestamp > FIVE_MINUTES
      ) {
        logger.info('Persisted cache expired, clearing old data');
        await del('reactQuery');
        return undefined;
      }

      return client;
    } catch (error) {
      console.warn('Failed to restore query client:', error);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await del('reactQuery');
    } catch (error) {
      console.warn('Failed to remove query client:', error);
    }
  },
};

export { FIVE_MINUTES, FIVE_SECONDS, ONE_HOUR, ONE_MINUTE, THIRTY_SECONDS };
