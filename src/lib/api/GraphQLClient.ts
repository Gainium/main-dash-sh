import { IdMutex } from '@/utils/mutex';
import logger from '../loggerInstance';

export interface GraphQLHttpErrorDetails {
  status: number;
  statusText: string;
  endpoint: string;
  responseBody?: string;
  graphQLErrors?: string[];
  querySnippet?: string;
  variables?: unknown;
}

export class GraphQLHttpError extends Error {
  readonly details: GraphQLHttpErrorDetails;

  constructor(message: string, details: GraphQLHttpErrorDetails) {
    super(message);
    this.name = 'GraphQLHttpError';
    this.details = details;
  }
}

// Thrown when a request exceeds its caller-supplied `timeoutMs` and is
// aborted client-side. Used by bot lifecycle mutations so a stalled queue
// RPC (worker down / restarting) surfaces as a fast, actionable error
// instead of an indefinite spinner. `name` is distinct so callers can
// tell a timeout apart from an HTTP/GraphQL error if they need to.
export class GraphQLTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphQLTimeoutError';
  }
}

export interface GraphQLRequestOptions {
  // When set, the underlying fetch is aborted after this many ms and the
  // request rejects with a GraphQLTimeoutError. Omitted = no client timeout
  // (default for queries; long-running reads must not be capped here).
  timeoutMs?: number;
}

// Default client-side timeout for interactive dashboard reads routed through
// `useGraphQL`. Sits above the p99 of even exchange-fan-out reads
// (getPortfolioByUser / getBalances aggregate across every connected account,
// and HeroBalance/BotStatus fire 10+ parallel reads) yet far below the
// backend's ~5-minute server cutoff, so a degraded backend surfaces a fast,
// actionable error instead of an indefinite stale-indicator spinner. Also
// matches the ApiClient REST default (apiClient.ts), keeping the two transports
// consistent.
export const DEFAULT_READ_TIMEOUT_MS = 30_000;

// Generous cap for genuinely-heavy but still-bounded reads: full-lifetime bot
// profit charts, backtest-history list payloads, and archived (cold-store /
// ClickHouse) bot lists. High enough not to false-timeout a healthy-but-slow
// aggregation, low enough that a truly-dead backend still eventually errors
// instead of spinning to the server cutoff. NOTE: backtest *runs*
// (requestServerSideBacktest) legitimately take minutes and stay fully
// uncapped — they never use this.
export const LONG_READ_TIMEOUT_MS = 60_000;

// Global request deduplication system
const requestMutex = new IdMutex();
const requestCache = new Map<
  string,
  { result: unknown; timestamp: number; refCount: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for request cache

// Helper function to create request signature
function createRequestSignature(
  query: string,
  variables?: unknown,
  headers?: Record<string, string>
): string {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const keyData = {
    query: normalizedQuery,
    variables: variables || {},
    // Include relevant headers that affect the response
    token: headers?.['token'],
    paperContext: headers?.['paper-context'],
    demoContext: headers?.['demo-context'],
  };

  const keyString = JSON.stringify(keyData);
  // Use a simple hash function for browser compatibility
  let hash = 0;
  for (let i = 0; i < keyString.length; i++) {
    const char = keyString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Cleanup expired cache entries
function cleanupExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of requestCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS && entry.refCount === 0) {
      requestCache.delete(key);
      logger.debug('Cleaned up expired cache entry:', {
        key: key.substring(0, 8),
      });
    }
  }
}

// Run cleanup every 2 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredCache, 2 * 60 * 1000);
}

// TODO: Authentication will be handled through context-based token injection

export interface GraphQLError {
  message: string;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  path?: string[];
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

/**
 * Backend-authored messages that mean "this token is dead, for good".
 *
 * main-app answers a failed `jwt.verify` with HTTP **200** and an `errors`
 * array (server/index.ts `authenticateJWT`), not a 401 — so nothing in the
 * transport layer can tell this apart from an ordinary query error. Matching
 * the message is the only signal available, and it is exactly what the legacy
 * dashboard has always done (`main-dash/fetch/index.ts` `logOutReasons`).
 *
 * Keep this list to messages the *backend* emits on token rejection. Network
 * failures, timeouts and 5xx must never land here — treating those as a dead
 * session is what caused the boot session-wipe regression.
 */
export const SESSION_DEAD_REASONS = [
  'Session is expired, please login again',
  'User not found',
] as const;

export const isSessionDeadMessage = (message: string): boolean =>
  SESSION_DEAD_REASONS.some((reason) => message.includes(reason));

/**
 * Public share pages render without a session on purpose — a rejected token
 * there must not bounce the visitor to a login screen.
 */
const isPublicShareView = (): boolean => {
  if (typeof window === 'undefined') return false;
  const href = window.location.href;
  return href.includes('share=') || href.includes('backtestShare=');
};

let onSessionDead: (() => void) | null = null;

/**
 * Registered once by the auth store. Kept as a callback rather than a direct
 * import so this module stays free of a GraphQLClient → authStore cycle.
 */
export const setSessionDeadHandler = (handler: () => void): void => {
  onSessionDead = handler;
};

const parseResponseBodyAsJson = (rawBody: string): unknown | null => {
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
};

const extractGraphQLErrorMessages = (rawBody: string): string[] => {
  const parsed = parseResponseBodyAsJson(rawBody) as {
    errors?: Array<{ message?: unknown }>;
    error?: unknown;
  } | null;

  const messages: string[] = [];

  if (parsed?.errors && Array.isArray(parsed.errors)) {
    for (const entry of parsed.errors) {
      if (typeof entry?.message === 'string') {
        const trimmed = entry.message.trim();
        if (trimmed) messages.push(trimmed);
      }
    }
  }

  // Some gateway/auth error responses use the non-standard `{"error": "..."}`
  // shape (e.g. changePassword returns this on validation failure). Surface it
  // so callers don't fall back to the generic "HTTP error! status: 4xx".
  if (messages.length === 0 && typeof parsed?.error === 'string') {
    const trimmed = parsed.error.trim();
    if (trimmed) messages.push(trimmed);
  }

  return messages;
};

export class GraphQLClient {
  private endpoint: string;
  private token: string | null | undefined;
  private paperContext: boolean | undefined;
  private shareId: string | undefined;

  constructor(
    endpoint: string,
    token?: string | null,
    paperContext?: boolean,
    shareId?: string
  ) {
    this.endpoint = endpoint;
    this.token = token;
    this.paperContext = paperContext;
    this.shareId = shareId;
  }

  async request<T>(
    query: string,
    variables?: unknown,
    options?: GraphQLRequestOptions
  ): Promise<T> {
    // Check if we're in mock mode and should skip GraphQL requests
    const useMockAuth =
      import.meta.env.MODE === 'development' &&
      import.meta.env.VITE_USE_MOCK_AUTH !== 'false' &&
      import.meta.env.VITE_USE_REAL_AUTH !== 'true';

    if (useMockAuth && this.endpoint.includes('localhost:7500')) {
      // Return mock data for common queries
      return this.getMockResponse<T>(query, variables);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Treat 'demo' as a sentinel token meaning "shared/anonymous viewer".
    // Same logic applies when no token is set but a shareId is present —
    // backend reads `shareId` from variables and returns public share data.
    const isDemoMode =
      this.token === 'demo' || (!this.token && !!this.shareId);

    if (isDemoMode) {
      // Backend recognizes the literal string 'demo' in the `token` header as
      // a public-share request and pairs it with the `shareId` in variables.
      // Matches main-dash/fetch/index.ts which passes through 'demo' verbatim.
      headers['token'] = 'demo';
      logger.debug('Demo mode: sending token=demo header');
    } else if (this.token) {
      headers['token'] = `${this.token}`;
      logger.debug('Using provided token');
    } else {
      logger.debug('No authentication token provided');
    }

    // Add demo context header to explicitly mark demo requests
    // This prevents demo data from being cached as regular paper mode data
    if (isDemoMode) {
      headers['demo-context'] = 'true';
      logger.debug('Demo mode enabled, adding demo-context header');
    }

    // Add paper context header if specified
    // In demo mode, this will be true but demo-context header takes precedence
    if (this.paperContext !== undefined) {
      headers['paper-context'] = String(this.paperContext);
      logger.debug('Using paper context', { paperContext: this.paperContext });
    }

    // Create request signature for deduplication
    const requestSignature = createRequestSignature(query, variables, headers);
    logger.debug('Request signature created:', {
      signature: requestSignature.substring(0, 8),
    });

    // Increment reference count BEFORE acquiring lock to prevent cleanup
    let cachedEntry = requestCache.get(requestSignature);
    if (cachedEntry) {
      cachedEntry.refCount++;
      logger.debug('Incremented ref count for existing entry:', {
        signature: requestSignature.substring(0, 8),
        refCount: cachedEntry.refCount,
      });
    } else {
      // Create new cache entry for this request
      cachedEntry = {
        result: null,
        timestamp: Date.now(),
        refCount: 1,
      };
      requestCache.set(requestSignature, cachedEntry);
      logger.debug('Created new cache entry:', {
        signature: requestSignature.substring(0, 8),
      });
    }

    // Use mutex to queue requests with same signature
    await requestMutex.lock(requestSignature);

    try {
      // Check cache after acquiring lock - only return if we have actual data (not null)
      const currentEntry = requestCache.get(requestSignature);
      if (
        currentEntry &&
        currentEntry.result !== null &&
        Date.now() - currentEntry.timestamp < CACHE_TTL_MS
      ) {
        logger.debug('Returning cached result after lock:', {
          signature: requestSignature.substring(0, 8),
        });
        return JSON.parse(JSON.stringify(currentEntry.result)) as T;
      }

      // If result is still null, we need to make the actual request
      if (currentEntry && currentEntry.result === null) {
        logger.debug('Making request for entry with null result:', {
          signature: requestSignature.substring(0, 8),
        });
      }

      logger.debug('Making actual GraphQL request:', {
        signature: requestSignature.substring(0, 8),
      });
      const result = await this.makeActualRequest<T>(
        query,
        variables,
        headers,
        options?.timeoutMs
      );

      // Cache the successful result
      const cacheEntry = requestCache.get(requestSignature);
      if (cacheEntry) {
        cacheEntry.result = result;
        cacheEntry.timestamp = Date.now();
        logger.debug('Cached successful result:', {
          signature: requestSignature.substring(0, 8),
        });
      }

      return result;
    } finally {
      // Decrement ref count and potentially clean up
      const cacheEntry = requestCache.get(requestSignature);
      logger.debug('[GraphQLClient] Finalizing request for signature', {
        requestSignature,
        cacheEntry,
      });
      if (cacheEntry) {
        cacheEntry.refCount = Math.max(0, cacheEntry.refCount - 1);
        // If no more references and result is old, remove from cache
        if (cacheEntry.refCount === 0) {
          requestCache.delete(requestSignature);
          logger.debug('Removed unreferenced cache entry:', {
            signature: requestSignature.substring(0, 8),
          });
        }
      }

      requestMutex.release(requestSignature);
    }
  }

  private async makeActualRequest<T>(
    query: string,
    variables?: unknown,
    headers?: Record<string, string>,
    timeoutMs?: number
  ): Promise<T> {
    if (!headers) {
      throw new Error('Headers not provided to makeActualRequest');
    }

    // When a caller supplies a timeout, abort the fetch after `timeoutMs`.
    // Without this a stalled queue RPC on the backend (worker down /
    // restarting) leaves the request pending for the full ~5-minute server
    // timeout, which the UI shows as an indefinite spinner.
    const controller =
      timeoutMs !== undefined ? new AbortController() : undefined;
    const timeoutId =
      controller !== undefined
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    const body = JSON.stringify({
      query,
      variables,
    });

    logger.debug('Making GraphQL request', {
      endpoint: this.endpoint,
      query: query.substring(0, 200) + '...', // Log first 200 chars of query
      hasVariables: !!variables,
    });

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body,
        credentials: 'include',
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (!response.ok) {
        // Try to get the response body for more details
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch (_e) {
          // Ignore if we can't read the response
        }

        const graphQLErrors = extractGraphQLErrorMessages(responseBody);
        const errorMessageBase = `HTTP error! status: ${response.status}`;
        const errorMessage =
          graphQLErrors.length > 0
            ? `${errorMessageBase} - ${graphQLErrors.join('; ')}`
            : errorMessageBase;

        const errorDetails: GraphQLHttpErrorDetails = {
          status: response.status,
          statusText: response.statusText,
          endpoint: this.endpoint,
          responseBody: responseBody.substring(0, 500), // First 500 chars
          graphQLErrors,
          querySnippet: query.substring(0, 200),
          variables,
        };

        logger.error('[GraphQLClient] HTTP error', errorDetails);

        // Log to logger in development for easier debugging
        if (import.meta.env.DEV) {
          logger.error('[GraphQLClient] HTTP error full payload', {
            ...errorDetails,
            responseBody,
            query,
          });
        }

        throw new GraphQLHttpError(errorMessage, errorDetails);
      }

      let result: GraphQLResponse<T>;
      try {
        result = await response.json();
      } catch (parseError) {
        logger.error('GraphQL response parsing error', {
          parseError: parseError,
          responseStatus: response.status,
          responseStatusText: response.statusText,
          endpoint: this.endpoint,
        });
        throw new Error(`Failed to parse GraphQL response: ${parseError}`);
      }

      if (
        result.errors &&
        Array.isArray(result.errors) &&
        result.errors.length > 0 &&
        !result.data
      ) {
        logger.error('GraphQL query errors', {
          errors: result.errors,
          query: query.substring(0, 200) + '...',
        });
        const messages = result.errors.map((e) => e.message).join(', ');
        // The backend explicitly rejected the token (expired, revoked, or
        // signed with a retired secret). Tear the session down now rather
        // than leaving the user on a shell that 401s every widget.
        if (isSessionDeadMessage(messages) && !isPublicShareView()) {
          logger.warn('Backend rejected the session token — logging out');
          onSessionDead?.();
        }
        throw new Error(`GraphQL errors: ${messages}`);
      }

      if (!result.data) {
        logger.error('GraphQL response missing data', { result });
        throw new Error('GraphQL response missing data');
      }

      logger.debug('GraphQL request successful', {
        hasData: !!result.data,
      });

      // Log successful requests in development for notifications debugging
      if (import.meta.env.DEV && query.includes('getMessageBot')) {
        logger.info('✅ [GRAPHQL SUCCESS] getMessageBot request successful:', {
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
        });
      }

      return result.data;
    } catch (error) {
      // A client-side timeout aborts the fetch; surface it as a clear,
      // actionable message instead of the opaque native "AbortError" so the
      // mutation's onError toast tells the user what actually happened.
      if (controller?.signal.aborted) {
        logger.error('GraphQL request timed out', {
          endpoint: this.endpoint,
          timeoutMs,
          query: query.substring(0, 200) + '...',
        });
        throw new GraphQLTimeoutError(
          'The request timed out. The bot service may be busy or restarting — please try again in a moment.'
        );
      }
      logger.error('GraphQL request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: this.endpoint,
        query: query.substring(0, 200) + '...',
      });
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Generate mock responses for common GraphQL queries in development mode
   */
  private getMockResponse<T>(query: string, _variables?: unknown): T {
    logger.debug('Generating mock GraphQL response', {
      query: query.substring(0, 100) + '...',
    });

    // Mock user query response
    if (query.includes('query user') || query.includes('user {')) {
      return {
        user: {
          status: 'success',
          reason: null,
          data: {
            _id: '6279d23c6bf516d657d1ad0c',
            username: 'demo@gainium.io',
            name: 'Demo User',
            lastName: 'Test',
            picture:
              'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            timezone: 'UTC',
            balance: 1000,
            hasExchanges: true,
            hasPaperExchanges: true,
            hasLiveExchanges: false,
            subscription: {
              subscriptionPlanName: 'Demo',
              status: 'active',
              type: 'monthly',
            },
          },
        },
      } as T;
    }

    // Mock other common queries
    if (query.includes('getBalances') || query.includes('balances')) {
      return {
        getBalances: {
          status: 'success',
          reason: null,
          data: [],
        },
      } as T;
    }

    // Default mock response
    return {
      data: null,
      status: 'success',
      reason: 'Mock response - no real data available in development mode',
    } as T;
  }
}

// Create default instance using environment configuration
const endpoint =
  import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
// Gainium API doesn't use /graphql suffix - it's just the base URL
const graphqlEndpoint = endpoint; /* .includes('gainium.io')
  ? endpoint
  : `${endpoint}/graphql` */
export const graphQLClient = new GraphQLClient(graphqlEndpoint);
