import {
  GraphQLClient,
  getGraphQLConfig,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCacheKey } from './useCacheKey';
import logger from '@/lib/loggerInstance';

/** Epoch ms at which a query response actually came from the network. Cache
 *  replays keep the original stamp (the persister and setQueriesData patches
 *  preserve enumerable fields), so consumers can tell a fresh server snapshot
 *  from a replayed one — required before treating a list response as
 *  authoritative for deletions (see reconcileDeals' snapshotAt). */
export interface FetchStamped {
  __fetchedAt?: number;
}

function stampFetchedAt<T>(payload: T): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...payload, __fetchedAt: Date.now() };
  }
  return payload;
}

export function useGraphQL<TData = unknown, TVars = unknown>(
  key: string,
  gql: { query: string; variables?: TVars },
  options?: Partial<
    UseQueryOptions<ReturnResult<TData>, Error, ReturnResult<TData>>
  > & {
    paperContext?: boolean | undefined;
    /**
     * When set, the request is sent in share-mode: token is replaced
     * with the `'demo'` sentinel (no Authorization header), the
     * shareId is forwarded to the GraphQLClient (and used by the
     * backend to look up the public-share record), and the query is
     * enabled even without an access token in the auth store.
     */
    shareId?: string | null | undefined;
    /**
     * Client-side timeout (ms) for this read. Without a cap a degraded
     * backend leaves the request pending until the ~5-minute server cutoff,
     * which the UI shows as an indefinite stale-indicator spinner.
     * - omitted / `undefined` → DEFAULT_READ_TIMEOUT_MS (interactive default)
     * - a number → that cap (e.g. LONG_READ_TIMEOUT_MS for heavy reads)
     * - `null` → uncapped (only for reads that legitimately run for minutes)
     * Because archived-bot lists reuse the same GraphQL field as active lists
     * (differing only by a `status: archive` variable), the opt-out is
     * caller-driven here rather than a field-name denylist.
     */
    requestTimeoutMs?: number | null;
  }
) {
  // Get the authentication token from the auth store
  const tokens = useAuthStore((s) => s.tokens);

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const shareId = (options as { shareId?: string | null })?.shareId ?? null;
  const isShareMode = !!shareId;

  // Resolve the per-read client timeout: caller override wins; `null` opts out
  // (uncapped); otherwise the interactive default. Read here (not inside the
  // queryFn closure) so the value is stable per render.
  const requestTimeoutMs = (
    options as { requestTimeoutMs?: number | null }
  )?.requestTimeoutMs;
  const resolvedTimeoutMs =
    requestTimeoutMs === null
      ? undefined
      : (requestTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS);

  // Generate stable cache key that persists across browser sessions
  const cacheKey = useCacheKey(
    key,
    gql.variables as Record<string, unknown>,
    (options as { paperContext?: boolean })?.paperContext
  );

  // Detect common invalid id inputs to avoid backend ObjectId cast errors
  const isIdMissing = (() => {
    try {
      const vars = (gql.variables ?? {}) as Record<string, unknown>;
      // Typical shape: { input: { id: string } } or sometimes top-level { id }
      const input = (vars as Record<string, unknown>)['input'] as
        | Record<string, unknown>
        | undefined;
      const inputId =
        typeof input?.['id'] === 'string' ? (input['id'] as string) : undefined;
      const topLevelId =
        typeof (vars as Record<string, unknown>)['id'] === 'string'
          ? ((vars as Record<string, unknown>)['id'] as string)
          : undefined;
      const idCandidate = inputId ?? topLevelId;
      return typeof idCandidate === 'string' && idCandidate.trim().length === 0;
    } catch {
      return false;
    }
  })();

  const tokensEnabled = !!tokens?.accessToken;
  const userEnabled = options?.enabled ?? true;
  // In share-mode we don't need a real token — the backend authorizes
  // the request via the shareId variable / demo-context header.
  const finalEnabled =
    (tokensEnabled || isShareMode) && !isIdMissing && userEnabled;

  if (!tokensEnabled && !isShareMode && import.meta.env.DEV) {
    // Helpful log when queries are disabled due to missing token
    // Do not log token values

    console.warn('[useGraphQL] Query disabled (no access token):', {
      key,
      hasToken: !!tokens?.accessToken,
    });
  }

  return useQuery({
    // Allow callers to override most options but always enforce our final enabled
    ...(options as object),
    queryKey: cacheKey,
    queryFn: async () => {
      // Create an authenticated GraphQL client if we have a token
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

      // Use the endpoint directly without adding /graphql suffix
      const graphqlEndpoint = endpoint;

      // Get token and paperContext based on current mode (handles demo mode)
      const config = getGraphQLConfig(tokens, isLiveTrading);

      // In demo mode, ALWAYS use paper context (demo user's paper account)
      // Otherwise allow override from options
      const { tradingMode } = useUIStore.getState();
      const isDemoMode = tradingMode === 'demo';
      const paperContext = isDemoMode
        ? true
        : ((options as { paperContext?: boolean })?.paperContext ??
          config.paperContext);

      // Share-mode: send the `'demo'` sentinel token (no Authorization
      // header) plus the shareId so the backend treats this as a public
      // read of the shared record. Mirrors main-dash/fetch/index.ts.
      const effectiveToken = isShareMode ? 'demo' : config.token;

      const client = new GraphQLClient(
        graphqlEndpoint,
        effectiveToken,
        paperContext,
        isShareMode ? (shareId as string) : undefined
      );

      if (import.meta.env.DEV) {
        logger.debug('[useGraphQL] Executing query:', {
          key,
          endpoint: graphqlEndpoint,
          tradingMode,
          isDemoMode: tradingMode === 'demo',
          paperContext,
          isLiveTrading,
          token:
            config.token === 'demo'
              ? 'demo'
              : tokens?.accessToken
                ? 'present'
                : 'missing',
          variables: gql.variables
            ? JSON.parse(JSON.stringify(gql.variables))
            : undefined,
        });
      }

      let result: { [K in string]: ReturnResult<TData> };
      try {
        result = await client.request<{
          [K in string]: ReturnResult<TData>;
        }>(
          gql.query,
          gql.variables,
          resolvedTimeoutMs !== undefined
            ? { timeoutMs: resolvedTimeoutMs }
            : undefined
        );
      } catch (e: unknown) {
        console.error('[useGraphQL] Request error:', {
          key,
          message: e instanceof Error ? e.message : 'Unknown error',
        });
        throw e;
      }

      // Extract the GraphQL operation name from the query
      // Look for pattern: "query operationName" or "mutation operationName"
      const operationMatch = gql.query.match(/(?:query|mutation)\s+(\w+)/);
      const operationName = operationMatch?.[1];

      // Try to find the field name in the query - look for field after the opening brace
      // This handles both: fieldName( and fieldName {
      const fieldMatch = gql.query.match(/{\s*(\w+)(?:\s*\(|\s*{|\s)/);
      const fieldName = fieldMatch?.[1];

      // Use field name first, then operation name, then fallback to key
      const resultKey = fieldName || operationName || key;

      // If the extracted key doesn't exist in result, fallback to original key
      if (result[resultKey] !== undefined) {
        if (import.meta.env.DEV) {
          logger.debug('[useGraphQL] Query success:', {
            key,
            resultKey,
            status: (
              result[resultKey] as ReturnResult<TData> & { status?: string }
            )?.status,
            data: 'hidden',
          });
        }
        return stampFetchedAt(result[resultKey]);
      } else if (result[key] !== undefined) {
        // Fallback to original behavior if extracted key doesn't work
        if (import.meta.env.DEV) {
          logger.debug('[useGraphQL] Query success (fallback key):', {
            key,
            status: (result[key] as ReturnResult<TData> & { status?: string })
              ?.status,
          });
        }
        return stampFetchedAt(result[key]);
      } else {
        // If neither works, log available keys and throw an error

        console.error('[useGraphQL] Unexpected result shape:', {
          key,
          availableKeys: Object.keys(result),
        });
        throw new Error(
          `GraphQL result key not found. Expected '${resultKey}' or '${key}' but got keys: ${Object.keys(result).join(', ')}`
        );
      }
    },
    enabled: finalEnabled, // Enforce token + id guards regardless of caller options
  });
}

