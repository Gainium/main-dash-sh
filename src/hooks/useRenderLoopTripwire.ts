import { useRef } from 'react';
import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/loggerInstance';
import { serializeCrashMeta } from '@/lib/crashBreadcrumbs';

/**
 * Render-loop tripwire.
 *
 * React's "Maximum update depth exceeded" (minified #185) kills the whole tree
 * the instant it fires — by then the props that were oscillating are gone, so
 * the crash report can't say WHICH prop destabilized the loop. This hook watches
 * a component's own render cadence and, when it approaches React's update-depth
 * limit, captures the changed-prop history and reports it as a NON-FATAL event
 * BEFORE the crash. One report per session per componentName, then it disarms.
 *
 * Cost when idle is a counter + one timestamp compare per render; it allocates
 * a small diff only while renders are already firing abnormally fast. It never
 * throws — a tripwire bug must never itself crash the tree.
 *
 * Kill switch: set `localStorage['gainium:tripwire'] = 'off'`.
 *
 * @param componentName Stable label used to dedupe reports and identify the
 *                      component in the crash log.
 * @param props         The component's props (or the subset worth watching).
 *                      Only key names + value types / brief primitives are
 *                      captured — never full objects.
 */

// >WINDOW_LIMIT renders within WINDOW_MS marks a window as "elevated". React's
// own limit is ~50 nested updates; 25/1s is well inside that so we still report
// before the crash.
const WINDOW_MS = 1000;
const WINDOW_LIMIT = 25;
// Require the elevated rate to persist across at least this many CONSECUTIVE
// windows before reporting. A single mount/hydration burst reliably settles
// within ~1s (one window) — investigation confirmed ResponsiveButtonRow etc.
// always settle — so a one-off spike no longer trips the wire. A genuine
// runaway loop keeps blowing past WINDOW_LIMIT window after window, so it still
// trips almost immediately (a real infinite loop exceeds the limit far faster
// than one window, so requiring 2 barely delays real-loop detection).
const CONSECUTIVE_WINDOWS = 2;
// How many render diffs to keep for the report.
const HISTORY_LEN = 10;

// Session-scoped dedupe: at most one report per componentName per page load.
const reportedComponents = new Set<string>();

type ChangedKeys = Array<{ key: string; from: string; to: string }>;

interface TripwireState {
  windowStart: number;
  count: number;
  // Number of consecutive closed windows whose render count exceeded
  // WINDOW_LIMIT. Reset to 0 whenever a window closes under the limit.
  elevatedWindows: number;
  prevProps: Record<string, unknown> | undefined;
  history: ChangedKeys[];
  disarmed: boolean;
}

/** Brief, privacy-safe description of a value: its type, or a short primitive. */
function describeValue(v: unknown): string {
  try {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string') {
      const s = v as string;
      return `string(${s.length <= 20 ? JSON.stringify(s) : `len ${s.length}`})`;
    }
    if (t === 'number' || t === 'boolean' || t === 'bigint') {
      return `${t}(${String(v)})`;
    }
    if (t === 'function') return 'function';
    if (Array.isArray(v)) return `array(${v.length})`;
    if (t === 'object') return 'object';
    return t;
  } catch {
    return 'unknown';
  }
}

/** Shallow-diff prop keys, returning changed keys with brief value shapes. */
function diffProps(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): ChangedKeys {
  const changed: ChangedKeys = [];
  try {
    if (!prev) return changed;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      if (!Object.is(prev[key], next[key])) {
        changed.push({
          key,
          from: describeValue(prev[key]),
          to: describeValue(next[key]),
        });
      }
    }
  } catch {
    /* noop */
  }
  return changed;
}

export function useRenderLoopTripwire(
  componentName: string,
  props: Record<string, unknown>
): void {
  const stateRef = useRef<TripwireState>({
    windowStart: 0,
    count: 0,
    elevatedWindows: 0,
    prevProps: undefined,
    history: [],
    disarmed: false,
  });

  try {
    const state = stateRef.current;
    if (state.disarmed) return;

    // Kill switch — cheap, checked before doing any work.
    try {
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('gainium:tripwire') === 'off'
      ) {
        return;
      }
    } catch {
      /* localStorage may throw in some sandboxed contexts */
    }

    const now = Date.now();

    // Record which props changed since the previous render.
    const changed = diffProps(state.prevProps, props);
    state.prevProps = props;
    if (state.prevProps) {
      state.history.push(changed);
      if (state.history.length > HISTORY_LEN) state.history.shift();
    }

    // Fixed-window render counter. When a window closes, decide whether it was
    // "elevated" (over WINDOW_LIMIT) and carry a consecutive-elevated streak so
    // a single settling burst doesn't trip the wire.
    if (now - state.windowStart > WINDOW_MS) {
      // The window that just closed had `state.count` renders in it.
      if (state.count > WINDOW_LIMIT) {
        state.elevatedWindows += 1;
      } else {
        state.elevatedWindows = 0;
      }
      state.windowStart = now;
      state.count = 1;
      return;
    }
    state.count += 1;

    // Trip only once the current window is itself elevated AND at least one
    // prior consecutive window was already elevated — i.e. the burst is
    // SUSTAINED, not a one-off mount/hydration spike that settles within a
    // single window. A genuine runaway loop satisfies this almost immediately.
    if (state.count <= WINDOW_LIMIT) return;
    if (state.elevatedWindows < CONSECUTIVE_WINDOWS - 1) return;

    // Tripped. Disarm immediately so the report path runs exactly once, even
    // if it throws or the loop keeps going.
    state.disarmed = true;
    if (reportedComponents.has(componentName)) return;
    reportedComponents.add(componentName);

    const history = state.history.slice();

    try {
      const token = useAuthStore.getState().tokens?.accessToken;
      const message = `[RenderLoopTripwire] ${componentName} — ${state.count} renders in ${now - state.windowStart}ms`;
      const stack =
        `Changed prop keys per render (oldest → newest):\n` +
        history
          .map(
            (diff, i) =>
              `#${i}: ${
                diff.length
                  ? diff.map((d) => `${d.key} ${d.from}→${d.to}`).join(', ')
                  : '(no prop change)'
              }`
          )
          .join('\n') +
        serializeCrashMeta({ tripwire: componentName });

      logger.error(message, { history });

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, token);
      const { query, variables } = otherQueries.sendError({
        error: { message, stack },
        errorInfo: { componentStack: '' },
        subType: 'Browser',
        source: 'v2',
      });
      void client.request(query, variables).catch((err) => {
        logger.error('[RenderLoopTripwire] Failed to report:', err);
      });
    } catch (err) {
      try {
        logger.error('[RenderLoopTripwire] Report path threw:', err);
      } catch {
        /* noop */
      }
    }
  } catch {
    // The tripwire must never crash the component it is guarding.
  }
}

export default useRenderLoopTripwire;
