/**
 * Crash breadcrumbs — a tiny, dependency-free ring buffer of the last few
 * user-visible events (route changes, clicks, resizes, inbound socket event
 * names). AppErrorBoundary and the render-loop tripwire append the buffer to
 * their crash reports so a production crash that can't be reproduced in a
 * browser session becomes self-localizing: we can see what the user was doing
 * in the ~30 events before the tree died.
 *
 * Design constraints (all deliberate):
 * - No dependencies, no allocations on the hot path beyond one small object
 *   per event, and NEVER throws — every handler is wrapped in try/catch so a
 *   breadcrumb bug can never itself crash the app.
 * - Records event *shapes*, never payloads or text content (privacy): click
 *   selectors carry tag/id/data-testid/aria-label/first-class only, socket
 *   breadcrumbs carry the event NAME only.
 * - `initCrashBreadcrumbs()` is idempotent and guards against double-patching
 *   under Vite HMR.
 */

export type CrashBreadcrumbType = 'route' | 'click' | 'resize' | 'socket';

export interface CrashBreadcrumb {
  /** epoch milliseconds */
  t: number;
  type: CrashBreadcrumbType;
  detail: string;
}

const MAX_BREADCRUMBS = 30;
const RESIZE_DEBOUNCE_MS = 250;
const MAX_DETAIL_LEN = 80;

const ring: CrashBreadcrumb[] = [];

/** Push an entry, evicting the oldest when the ring is full. Never throws. */
function push(type: CrashBreadcrumbType, detail: string): void {
  try {
    ring.push({
      t: Date.now(),
      type,
      detail: detail.length > MAX_DETAIL_LEN
        ? detail.slice(0, MAX_DETAIL_LEN)
        : detail,
    });
    if (ring.length > MAX_BREADCRUMBS) ring.shift();
  } catch {
    // never let breadcrumb bookkeeping surface an error
  }
}

/**
 * Record an inbound socket event by NAME only. Exported so the central socket
 * dispatch (BotWebSocketManager.emitToSubscribers) can call it with one line;
 * payloads are intentionally never captured.
 */
export function recordSocketBreadcrumb(eventName: string): void {
  if (typeof eventName !== 'string' || !eventName) return;
  push('socket', eventName);
}

/** Snapshot of the current breadcrumb ring (oldest → newest). Never throws. */
export function getBreadcrumbs(): CrashBreadcrumb[] {
  try {
    return ring.slice();
  } catch {
    return [];
  }
}

/**
 * Build a concise, privacy-safe selector for a click target:
 * `tag#id`, `tag[data-testid="…"]`, `tag[aria-label="…"]`, or `tag.firstClass`.
 * No text content. Capped at MAX_DETAIL_LEN by push().
 */
function describeTarget(el: Element): string {
  const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';

  const id = el.id;
  if (id) return `${tag}#${id}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `${tag}[data-testid="${testId}"]`;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`;

  const className =
    typeof el.className === 'string' ? el.className.trim() : '';
  if (className) {
    const first = className.split(/\s+/)[0];
    if (first) return `${tag}.${first}`;
  }

  return tag;
}

/**
 * Best-effort deployed bundle id from the DOM. Production builds emit
 * `/assets/index-<hash>.js`; the hashed filename is what the triage pipeline
 * needs to pick the matching source map. Falls back to scanning all scripts.
 * Never throws.
 */
export function getBundleId(): string | undefined {
  try {
    if (typeof document === 'undefined') return undefined;
    const direct = document
      .querySelector('script[src*="/assets/index-"]')
      ?.getAttribute('src');
    if (direct) return direct;
    for (const s of Array.from(document.scripts)) {
      const src = s.getAttribute('src');
      if (src && src.includes('/assets/index-')) return src;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Crash state providers
 * ------------------------------------------------------------------ */

/**
 * Returns a small, flat bag of the CONFIGURATION a feature was in. Called only
 * while a crash report is being built, so it must be cheap and must never
 * throw (a throwing provider is caught and dropped, but don't rely on it).
 */
export type CrashStateProvider = () => Record<string, unknown> | undefined;

const stateProviders = new Map<string, CrashStateProvider>();

/** Total characters the serialized state block may occupy. */
const MAX_STATE_CHARS = 1500;
/** Caps applied by the sanitizer, per value. */
const MAX_STATE_STRING_LEN = 64;
const MAX_STATE_ARRAY_LEN = 8;
/**
 * 12 was too tight and failed SILENTLY: the bot-form provider registers 14
 * fields, so `errorFields` — the single most diagnostic one for a render loop —
 * was dropped without trace, and the report looked complete. A cap that hides
 * what it removed is worse than no cap. 24 clears every provider we register
 * today, and anything over it is now named in `_truncated`.
 */
const MAX_STATE_OBJECT_KEYS = 24;

/**
 * Register a provider that contributes to the `state` block of a crash report.
 *
 * Breadcrumbs answer "what did the user DO"; this answers "what was the app
 * CONFIGURED as" — the half that made these crashes unreproducible, because a
 * componentStack cannot say which bot type, deal type or tab was selected.
 *
 * **Only register enum-ish configuration.** Values are sanitized (see
 * `sanitizeStateValue`) but the sanitizer bounds SIZE, not sensitivity: it
 * cannot tell an API key from a bot name. Never register credentials, balances,
 * addresses, or free text the user typed. The payload lands in a long-lived
 * error feed readable by anything holding `userErrorsRead`.
 *
 * @returns an unregister function, for use in an effect cleanup.
 */
export function registerCrashStateProvider(
  key: string,
  provider: CrashStateProvider
): () => void {
  try {
    stateProviders.set(key, provider);
  } catch {
    /* noop */
  }
  return () => {
    try {
      stateProviders.delete(key);
    } catch {
      /* noop */
    }
  };
}

/**
 * Bound a provider's value to something safe to serialize: primitives pass
 * through (truncated), arrays and objects are capped and flattened one level,
 * everything else is described rather than embedded. Never throws.
 */
function sanitizeStateValue(value: unknown, depth = 0): unknown {
  try {
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t === 'boolean' || t === 'number') return value;
    if (t === 'bigint') return String(value);
    if (t === 'string') {
      const s = value as string;
      return s.length > MAX_STATE_STRING_LEN
        ? `${s.slice(0, MAX_STATE_STRING_LEN)}…`
        : s;
    }
    if (t === 'function' || t === 'symbol') return `[${t}]`;
    // Providers return a bag whose values may themselves be small objects worth
    // keeping (`{a: 1}`). Collapse only from the SECOND level down: the bag is
    // depth 0, its values depth 1, and anything below that is described rather
    // than embedded — which is what stops a whole store being dumped in here.
    if (depth >= 2) return Array.isArray(value) ? '[array]' : '[object]';
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_STATE_ARRAY_LEN)
        .map((v) => sanitizeStateValue(v, depth + 1));
    }
    if (t === 'object') {
      const out: Record<string, unknown> = {};
      const allKeys = Object.keys(value as object);
      for (const k of allKeys.slice(0, MAX_STATE_OBJECT_KEYS)) {
        out[k] = sanitizeStateValue(
          (value as Record<string, unknown>)[k],
          depth + 1
        );
      }
      // Never truncate silently — a report that quietly omits fields reads as
      // "the app wasn't in that state", which is how the 12-key cap cost us
      // `errorFields` without anyone noticing.
      if (allKeys.length > MAX_STATE_OBJECT_KEYS) {
        out['_truncated'] = allKeys.slice(MAX_STATE_OBJECT_KEYS);
      }
      return out;
    }
    return `[${t}]`;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Run every registered provider and return the merged, sanitized state block,
 * or `undefined` when nothing is registered or everything failed. A provider
 * that throws is dropped individually — one bad provider must not cost us the
 * whole crash report. Never throws.
 */
export function collectCrashState(): Record<string, unknown> | undefined {
  try {
    if (stateProviders.size === 0) return undefined;
    const state: Record<string, unknown> = {};
    for (const [key, provider] of stateProviders) {
      try {
        const raw = provider();
        if (!raw || typeof raw !== 'object') continue;
        state[key] = sanitizeStateValue(raw) as Record<string, unknown>;
      } catch {
        state[key] = '[provider threw]';
      }
    }
    if (Object.keys(state).length === 0) return undefined;

    // Hard size ceiling. Drop whole providers (largest first) until the block
    // fits, rather than truncating the JSON into something unparseable.
    let serialized = JSON.stringify(state);
    if (!serialized || serialized.length <= MAX_STATE_CHARS) return state;

    const bySize = Object.keys(state).sort(
      (a, b) =>
        JSON.stringify(state[b] ?? '').length -
        JSON.stringify(state[a] ?? '').length
    );
    // Name every provider we drop, not just the last one — a report that
    // silently omits half its state reads as "that form wasn't mounted".
    const dropped = new Set<string>();
    let trimmed = state;
    for (const key of bySize) {
      dropped.add(key);
      trimmed = Object.fromEntries(
        Object.entries(state).filter(([k]) => !dropped.has(k))
      );
      trimmed['_dropped'] = [...dropped];
      serialized = JSON.stringify(trimmed);
      if (!serialized || serialized.length <= MAX_STATE_CHARS) break;
    }
    return Object.keys(trimmed).length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A compact, self-localizing metadata block appended to an otherwise-rigid
 * `sendError` payload. The `sendError` GraphQL input shape has no room for new
 * fields, so callers serialize this and append it to an existing string field
 * (error.stack / componentStack) prefixed with `\n\n[[meta]] `. Never throws.
 */
export function buildCrashMeta(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  try {
    const bundle = getBundleId();
    if (bundle) meta['bundle'] = bundle;
  } catch {
    /* noop */
  }
  try {
    meta['mode'] = import.meta.env.MODE;
  } catch {
    /* noop */
  }
  try {
    meta['url'] = window.location.pathname + window.location.search;
  } catch {
    /* noop */
  }
  try {
    meta['breadcrumbs'] = getBreadcrumbs();
  } catch {
    /* noop */
  }
  try {
    const state = collectCrashState();
    if (state) meta['state'] = state;
  } catch {
    /* noop */
  }
  if (extra) {
    for (const k of Object.keys(extra)) {
      meta[k] = extra[k];
    }
  }
  return meta;
}

/**
 * Serialize `buildCrashMeta()` as a single-line block ready to append to a
 * string field. Returns `''` on any failure so callers can concatenate freely.
 */
export function serializeCrashMeta(extra?: Record<string, unknown>): string {
  try {
    return `\n\n[[meta]] ${JSON.stringify(buildCrashMeta(extra))}`;
  } catch {
    return '';
  }
}

let initialized = false;
// Guard the history patch across HMR reloads of this module.
const HISTORY_PATCH_FLAG = '__gainiumCrashBreadcrumbsPatched';

/**
 * Wire up route / click / resize listeners and patch history. Idempotent —
 * safe to call from multiple entry points and across HMR. No-op outside the
 * browser. Never throws.
 */
export function initCrashBreadcrumbs(): void {
  try {
    if (initialized) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    initialized = true;

    // ---- route breadcrumbs ----
    const recordRoute = () => {
      try {
        push('route', window.location.pathname + window.location.search);
      } catch {
        /* noop */
      }
    };

    const historyObj = window.history as History & {
      [HISTORY_PATCH_FLAG]?: boolean;
    };
    if (historyObj && !historyObj[HISTORY_PATCH_FLAG]) {
      historyObj[HISTORY_PATCH_FLAG] = true;
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function patchedPushState(
        this: History,
        ...args: Parameters<History['pushState']>
      ) {
        const ret = origPush.apply(this, args);
        recordRoute();
        return ret;
      };
      history.replaceState = function patchedReplaceState(
        this: History,
        ...args: Parameters<History['replaceState']>
      ) {
        const ret = origReplace.apply(this, args);
        recordRoute();
        return ret;
      };
    }
    window.addEventListener('popstate', recordRoute);
    // Seed the buffer with the initial location.
    recordRoute();

    // ---- click breadcrumbs (capture phase, target selector only) ----
    document.addEventListener(
      'click',
      (e) => {
        try {
          const target = e.target;
          if (target instanceof Element) {
            push('click', describeTarget(target));
          }
        } catch {
          /* noop */
        }
      },
      true
    );

    // ---- resize breadcrumbs (debounced) ----
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    window.addEventListener('resize', () => {
      try {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            push('resize', `${window.innerWidth}x${window.innerHeight}`);
          } catch {
            /* noop */
          }
        }, RESIZE_DEBOUNCE_MS);
      } catch {
        /* noop */
      }
    });
  } catch {
    // initialization must never crash the app
  }
}
