// Thin fetch wrapper for the self-hosted admin-sh service. Lives outside
// the GraphQL client because admin-sh exposes plain REST — pulling it
// through GraphQLClient would add no value.
//
// Bound at build time to `VITE_ADMIN_API_URL`. In dev / cloud builds where
// the env is unset, `isAdminApiConfigured()` returns false and the admin
// UI surfaces a "not configured" state instead of issuing failing calls.

import { useAuthStore } from '@/stores/authStore';

const baseUrl: string = (import.meta.env.VITE_ADMIN_API_URL ?? '').replace(
  /\/$/,
  ''
);

export function isAdminApiConfigured(): boolean {
  return baseUrl.length > 0;
}

/** Returns the admin-sh base URL (no trailing slash) or null when
 *  VITE_ADMIN_API_URL is unset. Needed for hand-rolled streaming
 *  clients like EventSource that can't go through `request()`. */
export function getAdminBaseUrl(): string | null {
  return baseUrl.length > 0 ? baseUrl : null;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  if (!isAdminApiConfigured()) {
    throw new AdminApiError(
      0,
      'VITE_ADMIN_API_URL is not configured for this build'
    );
  }
  const token = useAuthStore.getState().tokens?.accessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${baseUrl}${path}`, { ...init, headers });
  // 204 No Content — nothing to parse.
  if (resp.status === 204) return undefined as unknown as T;

  const text = await resp.text();
  const body: unknown = text ? safeJson(text) : null;

  if (!resp.ok) {
    const message =
      (body as { error?: string } | null)?.error ??
      resp.statusText ??
      `Admin API request failed (${resp.status})`;
    throw new AdminApiError(resp.status, message);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------
// Types — kept in lockstep with admin-sh/src/routes/*.ts. Free-form
// `Record<string, unknown>` would obscure the surface; explicit interfaces
// here document what the UI relies on.
// ---------------------------------------------------------------------

export interface AdminContainer {
  id: string;
  name: string;
  service: string;
  image: string;
  imageTag: string | null;
  state: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | null;
  createdAt: number;
  ports: {
    ip?: string;
    publicPort?: number;
    privatePort: number;
    type: string;
  }[];
}

export interface AdminUpdate {
  service: string;
  containerId: string;
  image: string;
  repo: string | null;
  current: string | null;
  latest: string | null;
  hasUpdate: boolean;
  error?: string;
}

export interface AdminExchangesResponse {
  known: readonly string[];
  /** null ⇒ all enabled (key absent in Redis). */
  enabled: string[] | null;
}

/** Per-result marker returned by POST /api/upgrade for the admin-sh row.
 *  admin-sh recreates itself asynchronously (its process dies mid-swap),
 *  so the POST can only say "pending" — the caller polls self-status. */
export interface AdminSelfUpgradePending {
  pending: true;
  targetTag: string;
  statusUrl: string;
  manualFallback: string;
}

export interface AdminUpgradeResult {
  service: string;
  oldId: string;
  newId: string;
  selfUpgrade?: AdminSelfUpgradePending;
}

/** Reconciled outcome from GET /api/upgrade/self-status. */
export interface AdminSelfUpgradeStatus {
  state: 'idle' | 'in_progress' | 'success' | 'failed';
  targetTag: string | null;
  fromTag: string | null;
  currentTag: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  error: string | null;
  manualFallback: string;
}

export interface AdminServiceHealth {
  service: string;
  state: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | null;
  imageTag: string | null;
  up: boolean;
}

export interface AdminExchangeFeed {
  exchange: string;
  enabled: boolean;
  tradeMsgs: number;
  candleMsgs: number;
  lastSymbol: string | null;
  /** true if any trade/candle arrived during the probe window */
  live: boolean;
}

export interface AdminFeedProbe {
  windowMs: number;
  perExchange: AdminExchangeFeed[];
  /** enabled exchanges that produced zero traffic — the actionable list */
  stalled: string[];
  liveCount: number;
}

export interface AdminFeedConnector {
  service: string;
  running: boolean;
  /** raw PRICEROLE (candle | all | ticker | unset) */
  role: string;
  /** produces the `trade@` ticker feed that paper/live fills consume */
  producesTicker: boolean;
  /** produces the `*Candle` streams (charts / indicators) */
  producesCandle: boolean;
  exchanges: string[];
}

export interface AdminDiagnostics {
  ts: number;
  services: AdminServiceHealth[];
  redis: { ok: boolean; latencyMs?: number; error?: string };
  feeds: AdminFeedProbe;
  // Present on admin-sh >= 1.3.0; optional so older backends degrade cleanly.
  feedConnectors?: AdminFeedConnector[];
  /** any running connector produces the ticker feed (paper/live fills need it) */
  tickerRoleRunning?: boolean;
  /** exchanges with no candle producer — need a ticker/all-role connector */
  tickerOnlyExchanges?: string[];
}

export interface AdminEncryptionKeyStatus {
  /** this installation has an encryption key of its own */
  configured: boolean;
  /** admin-sh can write the key to .env — false when it isn't mounted */
  canGenerate: boolean;
  envFileWritable: boolean;
  envFilePath: string;
}

export interface AdminGeneratedEncryptionKey {
  /** shown to the operator once; also written to .env on the host */
  key: string;
  envFilePath: string;
  /** what has to be run for the stack to pick the key up */
  applyCommand: string;
}

// ---------------------------------------------------------------------
// Endpoint helpers — one per route. Keeping them at module scope makes
// it easy to grep usages + share with react-query hook factories.
// ---------------------------------------------------------------------

export const adminApi = {
  listContainers: () => request<AdminContainer[]>('/api/containers'),
  startContainer: (name: string) =>
    request<{ ok: true }>(`/api/containers/${encodeURIComponent(name)}/start`, {
      method: 'POST',
    }),
  stopContainer: (name: string) =>
    request<{ ok: true }>(`/api/containers/${encodeURIComponent(name)}/stop`, {
      method: 'POST',
    }),
  restartContainer: (name: string) =>
    request<{ ok: true }>(
      `/api/containers/${encodeURIComponent(name)}/restart`,
      { method: 'POST' }
    ),

  fetchLogs: async (name: string, tail: number): Promise<string> => {
    if (!isAdminApiConfigured()) {
      throw new AdminApiError(0, 'VITE_ADMIN_API_URL is not configured');
    }
    const token = useAuthStore.getState().tokens?.accessToken;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `${baseUrl}/api/containers/${encodeURIComponent(
      name
    )}/logs?tail=${tail}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new AdminApiError(resp.status, await resp.text());
    }
    return resp.text();
  },

  // Live log streaming uses EventSource directly (see pages/admin/
  // LogsDialog.tsx) because EventSource's auto-reconnect + native
  // event-type routing are a better fit than a fetch+reader loop. The
  // server-side endpoint is `/api/containers/:name/logs/stream` and
  // auth comes from a `?token=…` query param (extractToken in
  // admin-sh/src/auth.ts).

  getEncryptionKeyStatus: () =>
    request<AdminEncryptionKeyStatus>('/api/encryption-key'),
  // Returns the generated key once, for the operator to save. Never store
  // it, never log it, never put it in a query string.
  generateEncryptionKey: () =>
    request<AdminGeneratedEncryptionKey>('/api/encryption-key', {
      method: 'POST',
    }),

  getExchanges: () => request<AdminExchangesResponse>('/api/exchanges'),
  setExchanges: (enabled: string[] | null) =>
    request<{ ok: true }>('/api/exchanges', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  getDiagnostics: (windowMs?: number) =>
    request<AdminDiagnostics>(
      `/api/diagnostics${windowMs ? `?window=${windowMs}` : ''}`
    ),

  listUpdates: () => request<AdminUpdate[]>('/api/updates'),
  upgrade: (service: string, tag: string) =>
    request<{ results: AdminUpgradeResult[] }>('/api/upgrade', {
      method: 'POST',
      body: JSON.stringify({ service, tag }),
    }),
  // Real outcome of the last admin-sh self-upgrade. Polled after an
  // admin-sh upgrade because the POST returns before the recreate lands.
  getSelfUpgradeStatus: () =>
    request<AdminSelfUpgradeStatus>('/api/upgrade/self-status'),
};
