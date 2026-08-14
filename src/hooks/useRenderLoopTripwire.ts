import { useRef } from 'react';
import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/loggerInstance';
import { serializeCrashMeta } from '@/lib/crashBreadcrumbs';
import {
  HISTORY_LEN,
  WINDOW_MS,
  isReportableBurst,
  renderLimit,
} from './renderLoopTripwire.rules';

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

const limitForEnv = (): number => renderLimit(Boolean(import.meta.env.DEV));

// Session-scoped dedupe: at most one report per componentName per page load.
const reportedComponents = new Set<string>();

type ChangedKeys = Array<{ key: string; from: string; to: string }>;

interface TripwireState {
  windowStart: number;
  count: number;
  // Renders in the CURRENT window that changed no props (see SELF_DRIVEN_RATIO).
  selfDriven: number;
  // Number of consecutive closed windows whose render count exceeded
  // WINDOW_LIMIT. Reset to 0 whenever a window closes under the limit.
  elevatedWindows: number;
  // Renders in the window that closed most recently, so the report can state the
  // burst that actually happened. The message used to print `count`, which at
  // the moment of tripping is always WINDOW_LIMIT + 1 — every report this wire
  // ever sent read "26 renders", and eight issue titles quoted that constant as
  // if it were a measurement.
  lastWindowCount: number;
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
    selfDriven: 0,
    elevatedWindows: 0,
    lastWindowCount: 0,
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

    // Record which props changed since the previous render. `hadPrev` is read
    // BEFORE prevProps is overwritten: the old code assigned first and then
    // tested the value it had just written, which is always truthy, so the very
    // first render — where diffProps returns [] because there is nothing to
    // compare against — was pushed as a genuine "(no prop change)" entry. That
    // is cosmetic in the history, but SELF_DRIVEN_RATIO now counts the same
    // signal, so the phantom has to go.
    const hadPrev = state.prevProps !== undefined;
    const changed = diffProps(state.prevProps, props);
    state.prevProps = props;
    if (hadPrev) {
      state.history.push(changed);
      if (state.history.length > HISTORY_LEN) state.history.shift();
      if (changed.length === 0) state.selfDriven += 1;
    }

    const limit = limitForEnv();

    // Fixed-window render counter. When a window closes, decide whether it was
    // "elevated" (over the limit) and carry a consecutive-elevated streak so a
    // single settling burst doesn't trip the wire.
    if (now - state.windowStart > WINDOW_MS) {
      // The window that just closed had `state.count` renders in it.
      if (state.count > limit) {
        state.elevatedWindows += 1;
      } else {
        state.elevatedWindows = 0;
      }
      state.lastWindowCount = state.count;
      state.windowStart = now;
      state.count = 1;
      state.selfDriven = 0;
      return;
    }
    state.count += 1;

    // Elevated, sustained across consecutive windows, and mostly self-driven —
    // see renderLoopTripwire.rules.ts, where all three live together with the
    // measurements that set them. A genuine runaway satisfies all three almost
    // immediately; fast-arriving data satisfies only the first.
    if (!isReportableBurst(state, limit)) return;

    // Tripped. Disarm immediately so the report path runs exactly once, even
    // if it throws or the loop keeps going.
    state.disarmed = true;
    if (reportedComponents.has(componentName)) return;
    reportedComponents.add(componentName);

    const history = state.history.slice();

    try {
      const token = useAuthStore.getState().tokens?.accessToken;
      // State the sustained burst, not the trip constant: the previous window
      // is what established the streak, and `selfDriven` is the discriminator
      // the triage downstream actually needs.
      const message =
        `[RenderLoopTripwire] ${componentName} — ${state.count} renders in ${now - state.windowStart}ms` +
        ` (prior window ${state.lastWindowCount}; ${state.selfDriven}/${state.count} with no prop change` +
        `${import.meta.env.DEV ? '; DEV build, StrictMode doubles this' : ''})`;
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
