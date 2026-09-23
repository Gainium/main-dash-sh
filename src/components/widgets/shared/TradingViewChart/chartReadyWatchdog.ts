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

// Per page load: one report per chart/outcome, and never more than a few.
const MAX_REPORTS_PER_PAGE = 3;
const reported = new Set<string>();

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
}

export interface ChartStallDiagnostics {
  symbol: string;
  interval: string;
  elapsedMs: number;
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
}

const attempt = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

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
    elapsedMs: now - ctx.createdAt,
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
    const key = `${diagnostics.symbol}|${diagnostics.interval}|${recovered}`;
    if (reported.has(key) || reported.size >= MAX_REPORTS_PER_PAGE) return;
    reported.add(key);

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

/** Test hook: forget what was reported this page load. */
export const resetChartStallReports = (): void => reported.clear();
