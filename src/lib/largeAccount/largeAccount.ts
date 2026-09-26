/**
 * Large-account mode: the shape the UI keys on, and the pure rules that turn a
 * server answer (or its absence) into it.
 *
 * The server computes the flag per trading context from bot and deal counts
 * and exposes it as its own root query (`largeAccount`). Older backends do not
 * have that query; the UI must then behave exactly as before (mode off), never
 * crash. A local flag can force the mode ON — for testing, and as the fallback
 * when the backend cannot store the user's own "turn on". Nothing can force it
 * OFF from the client: users may turn the mode on, not off.
 *
 * Correctness never depends on this flag. A list whose response is partial
 * (`total > rows`) pages on the server whether the mode is on or not.
 */

export type LargeAccountReason = 'bots' | 'openDeals' | 'terminalBots' | 'override';

export interface LargeAccountCounts {
  activeBots: number;
  openDeals: number;
  terminalBots: number;
}

export interface LargeAccountThreshold {
  enter: number;
  leave: number;
}

export interface LargeAccountThresholds {
  activeBots: LargeAccountThreshold;
  openDeals: LargeAccountThreshold;
  terminalBots: LargeAccountThreshold;
}

/** Server payload of `largeAccount { data { … } }`. */
export interface LargeAccountServerData {
  active: boolean;
  source: 'auto' | 'override';
  reason: LargeAccountReason | null;
  override: 'auto' | 'on' | 'off';
  overrideBy: 'user' | 'admin' | null;
  canUserEnable: boolean;
  canUserRevert: boolean;
  paperContext: boolean;
  counts: LargeAccountCounts;
  thresholds: LargeAccountThresholds;
  computedAt: string | null;
}

/** What the UI reads. */
export interface LargeAccountState {
  /** The one flag every mode-gated surface keys on. */
  active: boolean;
  /**
   * Where `active` came from:
   * - `server`: the backend's answer;
   * - `local`: the local force-on flag (the backend said off or is too old);
   * - `unsupported`: the backend has no `largeAccount` query (mode off);
   * - `loading`: no answer yet (mode off until one arrives).
   */
  source: 'server' | 'local' | 'unsupported' | 'loading';
  reason: LargeAccountReason | null;
  counts: LargeAccountCounts | null;
  thresholds: LargeAccountThresholds | null;
  /** The user may turn the mode on (it is off and not admin-pinned off). */
  canUserEnable: boolean;
  computedAt: string | null;
}

/** Default thresholds (enter / leave) when the server gives none. */
export const DEFAULT_LARGE_ACCOUNT_THRESHOLDS: LargeAccountThresholds = {
  activeBots: { enter: 400, leave: 320 },
  openDeals: { enter: 1000, leave: 800 },
  terminalBots: { enter: 1000, leave: 800 },
};

/** localStorage key of the local force-on flag. Only the value `'on'` counts. */
export const LARGE_ACCOUNT_FORCE_KEY = 'gainium:large-account-force';

export function readLocalForceOn(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof window !==
  'undefined'
    ? window.localStorage
    : null
): boolean {
  try {
    return storage?.getItem(LARGE_ACCOUNT_FORCE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeLocalForceOn(
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof window !==
  'undefined'
    ? window.localStorage
    : null
): void {
  try {
    storage?.setItem(LARGE_ACCOUNT_FORCE_KEY, 'on');
  } catch {
    // Storage unavailable (private window). The server mutation is the
    // durable path; the local flag is only its fallback.
  }
}

/** A GraphQL/network error that means "this backend has no such field". */
export function isSchemaRejection(message: string | undefined | null): boolean {
  return /GRAPHQL_VALIDATION_FAILED|Cannot query field|Unknown argument|is not defined by type|Unknown type|Cannot return null/i.test(
    message ?? ''
  );
}

/**
 * Resolve the UI state from the server answer (or its absence) and the local
 * force-on flag. Pure.
 */
export function resolveLargeAccount(input: {
  data?: LargeAccountServerData | null;
  /** The query finished without usable data (error, NOTOK, old backend). */
  failed?: boolean;
  loading?: boolean;
  localForceOn?: boolean;
}): LargeAccountState {
  const { data, failed, loading, localForceOn } = input;
  if (data) {
    const serverActive = !!data.active;
    const adminPinnedOff = data.override === 'off';
    // The local flag forces ON unless an admin pinned the account off for
    // support debugging (the one legitimate OFF).
    const active = serverActive || (!!localForceOn && !adminPinnedOff);
    return {
      active,
      source: serverActive ? 'server' : active ? 'local' : 'server',
      reason: serverActive
        ? data.reason
        : active
          ? 'override'
          : null,
      counts: data.counts ?? null,
      thresholds: data.thresholds ?? null,
      canUserEnable: !active && !!data.canUserEnable,
      computedAt: data.computedAt ?? null,
    };
  }
  if (localForceOn) {
    return {
      active: true,
      source: 'local',
      reason: 'override',
      counts: null,
      thresholds: null,
      canUserEnable: false,
      computedAt: null,
    };
  }
  return {
    active: false,
    source: loading && !failed ? 'loading' : 'unsupported',
    reason: null,
    counts: null,
    thresholds: null,
    // An old backend cannot store the choice, but the local flag can.
    canUserEnable: !loading || !!failed,
    computedAt: null,
  };
}

/** Which signals are over their enter threshold (for the popover). */
export function describeLargeAccountSignals(
  counts: LargeAccountCounts,
  thresholds: LargeAccountThresholds = DEFAULT_LARGE_ACCOUNT_THRESHOLDS
): Array<{
  key: keyof LargeAccountCounts;
  label: string;
  count: number;
  enter: number;
  over: boolean;
}> {
  const rows: Array<[keyof LargeAccountCounts, string]> = [
    ['activeBots', 'Active bots'],
    ['openDeals', 'Open deals'],
    ['terminalBots', 'Terminal trades'],
  ];
  return rows.map(([key, label]) => ({
    key,
    label,
    count: counts[key] ?? 0,
    enter: thresholds[key]?.enter ?? DEFAULT_LARGE_ACCOUNT_THRESHOLDS[key].enter,
    over:
      (counts[key] ?? 0) >=
      (thresholds[key]?.enter ?? DEFAULT_LARGE_ACCOUNT_THRESHOLDS[key].enter),
  }));
}

/** "1,497" — grouped thousands, locale-independent so tests are stable. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const NOT_CALCULATED_TOOLTIP =
  'Not calculated for large accounts, to keep the dashboard fast.';

export function partialCountTooltip(
  shown: number,
  total: number,
  noun = 'items'
): string {
  return `Based on ${formatCount(shown)} of ${formatCount(total)} ${noun}. The rest are on the server — page through, sort or search to reach them.`;
}

/** What changes in the mode, in plain words. Shared with any help surface. */
export const LARGE_ACCOUNT_CHANGES: readonly string[] = [
  'Bot and deal lists load one page at a time from our servers, and sort and search there.',
  'Numbers that would need every bot or deal in your browser show “—” with a Large account tag. Where it is cheap, “Calculate now” works them out once.',
  'Totals built from part of a list say so, e.g. “500 of 1,497”.',
  'Live updates apply to the bot you have open and the rows on screen; other lists refresh when you view them.',
];
