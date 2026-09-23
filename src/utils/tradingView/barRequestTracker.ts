/**
 * In-flight `getBars` bookkeeping for the shared datafeed.
 *
 * TradingView fires `onChartReady` only once the main series' history request
 * has been answered. A request that never answers leaves the chart on its
 * loading state with nothing in the console, so the chart-ready watchdog reads
 * this registry to say which requests were still outstanding when it fired.
 */

export interface BarRequestInfo {
  ticker: string;
  resolution: string;
  /** Requested range, UNIX seconds (as TradingView passes it). */
  from: number;
  to: number;
  countBack: number | undefined;
  firstDataRequest: boolean;
}

export interface PendingBarRequest extends BarRequestInfo {
  ageMs: number;
}

const pending = new Map<number, BarRequestInfo & { startedAt: number }>();
let nextId = 0;

/** Register a request; the returned function removes it (idempotent). */
export const trackBarRequest = (info: BarRequestInfo): (() => void) => {
  const id = ++nextId;
  pending.set(id, { ...info, startedAt: Date.now() });
  return () => {
    pending.delete(id);
  };
};

export const getPendingBarRequests = (
  now: number = Date.now()
): PendingBarRequest[] =>
  Array.from(pending.values()).map(({ startedAt, ...info }) => ({
    ...info,
    ageMs: now - startedAt,
  }));
