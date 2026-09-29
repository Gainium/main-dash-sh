import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { serializeCrashMeta } from '@/lib/crashBreadcrumbs';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useTradingViewStore } from '@/stores/tradingViewStore';
import { getPendingBarRequests } from '@/utils/tradingView/barRequestTracker';
import type { TradingViewWidgetInstance } from './types';

/**
 * Chart-ready watchdog.
 *
 * The chart overlay and every price line wait for TradingView's
 * `onChartReady`. When it never arrives nothing throws, so the chart can sit on
 * "Loading chart..." with no trace anywhere. This module snapshots what the
 * widget was waiting on and reports it once through the frontend error channel,
 * so the next occurrence explains itself.
 */

export const CHART_READY_WATCHDOG_MS = 30_000;

const attempt = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

// One report per page load, whichever chart stalls first.
let reportedThisPage = false;

type LibraryScriptStatus = 'not-requested' | 'loading' | 'loaded' | 'error';

// The charting_library script is loaded once per page and shared by every
// chart, so its outcome is page state.
const libraryScript: {
  status: LibraryScriptStatus;
  startedAt: number;
  loadMs: number | null;
} = { status: 'not-requested', startedAt: 0, loadMs: null };

/** Record the outcome of the charting_library script tag. */
export function traceLibraryScript(script: HTMLScriptElement): void {
  libraryScript.status = 'loading';
  libraryScript.startedAt = Date.now();
  libraryScript.loadMs = null;
  const settle = (status: LibraryScriptStatus) => () => {
    libraryScript.status = status;
    libraryScript.loadMs = Date.now() - libraryScript.startedAt;
  };
  script.addEventListener('load', settle('loaded'), { once: true });
  script.addEventListener('error', settle('error'), { once: true });
}

/**
 * How far one widget's boot got, in ms from its construction (null = never).
 * In same-origin mode the frame loads `sameorigin.html`, which fires
 * `sameOriginLoad`; the library then writes itself into the frame and fires
 * `innerWindowLoad` once it has booted.
 */
export interface ChartBootTrace {
  iframeLoadMs: number | null;
  /** False when the frame's first load was a browser error page. */
  iframeAccessible: boolean | null;
  sameOriginLoadMs: number | null;
  innerWindowLoadMs: number | null;
}

/**
 * Start timing a widget's boot. Call right after construction: the library
 * creates its chart frame inside the constructor, so the frame's `load` cannot
 * have fired yet.
 */
export function traceChartBoot(
  widget: TradingViewWidgetInstance,
  container: HTMLElement,
  createdAt: number
): ChartBootTrace {
  const trace: ChartBootTrace = {
    iframeLoadMs: null,
    iframeAccessible: null,
    sameOriginLoadMs: null,
    innerWindowLoadMs: null,
  };
  try {
    const iframe = container.querySelector('iframe');
    iframe?.addEventListener(
      'load',
      () => {
        trace.iframeLoadMs = Date.now() - createdAt;
        trace.iframeAccessible = attempt(
          () => Boolean(iframe.contentDocument),
          false
        );
      },
      { once: true }
    );
    // The same window object the library listens on for this event.
    iframe?.contentWindow?.addEventListener(
      'sameOriginLoad',
      () => {
        trace.sameOriginLoadMs = Date.now() - createdAt;
      },
      { once: true }
    );
    // Private to the library: resolved by the frame's `innerWindowLoad`.
    const loaded = (widget as unknown as { _innerWindowLoaded?: unknown })
      ._innerWindowLoaded;
    if (loaded && typeof (loaded as Promise<void>).then === 'function') {
      (loaded as Promise<void>).then(
        () => {
          trace.innerWindowLoadMs = Date.now() - createdAt;
        },
        () => undefined
      );
    }
  } catch {
    // Diagnostics only.
  }
  return trace;
}

/**
 * Run `onFire` after `ms` of time the page was visible. Hidden time does not
 * count (background tabs throttle timers and nobody is looking), and it never
 * fires while the page is hidden.
 */
export function startVisibleTimer(
  ms: number,
  onFire: (hiddenMs: number) => void
): () => void {
  let remaining = ms;
  let runningSince = 0;
  let hiddenSince: number | null = null;
  let hiddenMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const isHidden = () => document.visibilityState === 'hidden';
  const run = () => {
    runningSince = Date.now();
    timer = setTimeout(() => {
      stop();
      onFire(hiddenMs);
    }, remaining);
  };
  const onVisibility = () => {
    if (isHidden()) {
      if (hiddenSince !== null) return;
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (Date.now() - runningSince));
      hiddenSince = Date.now();
    } else if (hiddenSince !== null) {
      hiddenMs += Date.now() - hiddenSince;
      hiddenSince = null;
      run();
    }
  };
  const stop = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };

  document.addEventListener('visibilitychange', onVisibility);
  if (isHidden()) hiddenSince = Date.now();
  else run();
  return stop;
}

export interface ChartStallContext {
  widget: TradingViewWidgetInstance;
  container: HTMLElement;
  symbol: string;
  interval: string;
  createdAt: number;
  attempt: number;
  mounted: boolean;
  loadLastChart: boolean;
  customDatafeed: boolean;
  /** Layout TradingView restored at boot through `load_last_chart`, if any. */
  bootLayout: { symbol: string | null; resolution: string | null } | null;
  boot: ChartBootTrace;
  /** Time the page spent hidden since creation; not counted in `elapsedMs`. */
  hiddenMs: number;
}

export interface ChartStallDiagnostics {
  symbol: string;
  interval: string;
  /** Visible time since creation. */
  elapsedMs: number;
  hiddenMs: number;
  attempt: number;
  mounted: boolean;
  containerConnected: boolean;
  iframeConnected: boolean;
  /** The library's own ready flag (private field — diagnostics only). */
  libraryReady: boolean | null;
  /** The chart API inside the iframe exists. */
  chartApiAvailable: boolean;
  /** The main series reports its data loaded (`activeChart().dataReady()`). */
  mainSeriesDataReady: boolean | null;
  pendingBarRequests: Array<{
    ticker: string;
    resolution: string;
    from: string;
    to: string;
    countBack: number | undefined;
    firstDataRequest: boolean;
    ageMs: number;
  }>;
  loadLastChart: boolean;
  bootLayout: { symbol: string | null; resolution: string | null } | null;
  savedLayouts: number | null;
  layoutStoreHydrated: boolean | null;
  datafeed: 'shared' | 'custom';
  visibility: string | null;
  libraryScript: { status: LibraryScriptStatus; loadMs: number | null };
  /** `window.TradingView.widget` exists. */
  tradingViewGlobal: boolean;
  /** The chart frame's src without query/hash. */
  iframeSrc: string | null;
  iframeLoadMs: number | null;
  iframeAccessible: boolean | null;
  sameOriginLoadMs: number | null;
  innerWindowLoadMs: number | null;
}

const isoOrRaw = (seconds: number): string =>
  attempt(() => new Date(seconds * 1000).toISOString(), String(seconds));

export function collectChartStallDiagnostics(
  ctx: ChartStallContext,
  now: number = Date.now()
): ChartStallDiagnostics {
  const iframe = attempt(() => ctx.container.querySelector('iframe'), null);
  const innerApi = attempt(
    () =>
      (iframe?.contentWindow as { tradingViewApi?: unknown } | null)
        ?.tradingViewApi,
    undefined
  );
  const mainSeriesDataReady = attempt(() => {
    if (!innerApi) return null;
    const chart = (
      ctx.widget as unknown as {
        activeChart?: () => { dataReady?: (cb: () => void) => boolean };
      }
    ).activeChart?.();
    const ready = chart?.dataReady?.(() => undefined);
    return typeof ready === 'boolean' ? ready : null;
  }, null);
  const store = attempt(() => useTradingViewStore.getState(), null);

  return {
    symbol: ctx.symbol,
    interval: ctx.interval,
    elapsedMs: now - ctx.createdAt - ctx.hiddenMs,
    hiddenMs: ctx.hiddenMs,
    attempt: ctx.attempt,
    mounted: ctx.mounted,
    containerConnected: attempt(() => ctx.container.isConnected, false),
    iframeConnected: attempt(() => iframe?.isConnected ?? false, false),
    libraryReady: attempt(() => {
      const flag = (ctx.widget as unknown as { _ready?: unknown })._ready;
      return typeof flag === 'boolean' ? flag : null;
    }, null),
    chartApiAvailable: Boolean(innerApi),
    mainSeriesDataReady,
    pendingBarRequests: attempt(
      () =>
        getPendingBarRequests(now)
          .slice(0, 10)
          .map((r) => ({
            ticker: r.ticker,
            resolution: r.resolution,
            from: isoOrRaw(r.from),
            to: isoOrRaw(r.to),
            countBack: r.countBack,
            firstDataRequest: r.firstDataRequest,
            ageMs: r.ageMs,
          })),
      []
    ),
    loadLastChart: ctx.loadLastChart,
    bootLayout: ctx.bootLayout,
    savedLayouts: store ? store.charts.length : null,
    layoutStoreHydrated: store ? store._hasHydrated : null,
    datafeed: ctx.customDatafeed ? 'custom' : 'shared',
    visibility: attempt(() => document.visibilityState, null),
    libraryScript: {
      status: libraryScript.status,
      loadMs: libraryScript.loadMs,
    },
    tradingViewGlobal: attempt(
      () =>
        Boolean(
          (window as unknown as { TradingView?: { widget?: unknown } })
            .TradingView?.widget
        ),
      false
    ),
    iframeSrc: attempt(
      () => iframe?.getAttribute('src')?.split(/[?#]/)[0] ?? null,
      null
    ),
    iframeLoadMs: ctx.boot.iframeLoadMs,
    iframeAccessible: ctx.boot.iframeAccessible,
    sameOriginLoadMs: ctx.boot.sameOriginLoadMs,
    innerWindowLoadMs: ctx.boot.innerWindowLoadMs,
  };
}

/** True when the chart has its data and only the ready signal is missing. */
export const canRecoverWithoutReady = (d: ChartStallDiagnostics): boolean =>
  d.mounted &&
  d.chartApiAvailable &&
  (d.libraryReady === true || d.mainSeriesDataReady === true);

export function reportChartStall(
  diagnostics: ChartStallDiagnostics,
  recovered: boolean
): void {
  try {
    if (reportedThisPage) return;
    reportedThisPage = true;

    const message =
      `[ChartReadyWatchdog] chart not ready ${Math.round(diagnostics.elapsedMs / 1000)}s after creation` +
      ` (${diagnostics.symbol} ${diagnostics.interval})` +
      (recovered ? ' — recovered: data loaded, ready signal missing' : '');
    const stack =
      JSON.stringify(diagnostics, null, 2) +
      serializeCrashMeta({ watchdog: 'chart-ready' });

    logger.error(message, diagnostics);

    const token = useAuthStore.getState().tokens?.accessToken;
    if (!token) return;
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
      logger.error('[ChartReadyWatchdog] Failed to report:', err);
    });
  } catch {
    // A diagnostics bug must never affect the chart.
  }
}

/** Test hook: forget what was reported and traced this page load. */
export const resetChartStallReports = (): void => {
  reportedThisPage = false;
  libraryScript.status = 'not-requested';
  libraryScript.loadMs = null;
};
