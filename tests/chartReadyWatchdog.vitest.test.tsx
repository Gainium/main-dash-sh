import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, createElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The chart overlay and every price line wait for TradingView's
 * `onChartReady`. When it never arrives nothing throws: the chart sits on
 * "Loading chart..." indefinitely and leaves no trace. The watchdog must
 * report what the widget was waiting on, recover a chart whose data did load,
 * and otherwise replace the endless spinner with a retry.
 */

const report = vi.hoisted(() => vi.fn());
vi.mock(
  '@/components/widgets/shared/TradingViewChart/chartReadyWatchdog',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/components/widgets/shared/TradingViewChart/chartReadyWatchdog')
    >()),
    reportChartStall: report,
  })
);

import {
  CHART_READY_WATCHDOG_MS,
  resetChartStallReports,
} from '@/components/widgets/shared/TradingViewChart/chartReadyWatchdog';
import { logger } from '@/lib/loggerInstance';
import { useInitializeWidget } from '@/components/widgets/shared/TradingViewChart/useInitializeWidget';

class FakeWidget {
  static instances: FakeWidget[] = [];
  _ready = false;
  seriesHasData = false;
  removed = false;
  private readyCallbacks: Array<() => void> = [];
  iframe: HTMLIFrameElement;
  _innerWindowLoaded: Promise<void>;
  innerWindowLoad!: () => void;
  constructor(config: { container: HTMLElement }) {
    FakeWidget.instances.push(this);
    this._innerWindowLoaded = new Promise<void>((resolve) => {
      this.innerWindowLoad = resolve;
    });
    // Like the library: the frame is created and appended by the constructor.
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute(
      'src',
      '/static/charting_library/sameorigin.html?symbol=SOLEUR#frame'
    );
    config.container.appendChild(this.iframe);
    (
      this.iframe.contentWindow as unknown as { tradingViewApi: object }
    ).tradingViewApi = {};
  }
  onChartReady(cb: () => void) {
    this.readyCallbacks.push(cb);
  }
  fireReady() {
    this._ready = true;
    this.readyCallbacks.forEach((cb) => cb());
  }
  activeChart() {
    return { dataReady: () => this.seriesHasData };
  }
  remove() {
    this.removed = true;
    this.iframe.remove();
  }
}

const latest: { current: ReturnType<typeof useInitializeWidget> | null } = {
  current: null,
};
function Harness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const result = useInitializeWidget({
    initialSymbol: 'SOLEUR@KRAKEN',
    initialInterval: '60',
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  });
  useEffect(() => {
    latest.current = result;
  });
  return createElement('div', { ref: containerRef });
}
const hook = new Proxy({} as ReturnType<typeof useInitializeWidget>, {
  get: (_target, key) =>
    latest.current?.[key as keyof ReturnType<typeof useInitializeWidget>],
});

let root: Root;
let host: HTMLDivElement;

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (state: DocumentVisibilityState) =>
  act(async () => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  });
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibility,
});
Object.defineProperty(document, 'hidden', {
  configurable: true,
  get: () => visibility === 'hidden',
});

describe('chart-ready watchdog', () => {
  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    visibility = 'visible';
    report.mockReset();
    FakeWidget.instances = [];
    (window as unknown as { TradingView: unknown }).TradingView = {
      widget: FakeWidget,
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(Harness));
    });
    await advance(0);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  test('reports once and offers a retry when onChartReady never fires', async () => {
    expect(FakeWidget.instances).toHaveLength(1);

    await advance(CHART_READY_WATCHDOG_MS);

    expect(report).toHaveBeenCalledTimes(1);
    const [diagnostics, recovered] = report.mock.calls[0];
    expect(recovered).toBe(false);
    expect(diagnostics).toMatchObject({
      symbol: 'SOLEUR@KRAKEN',
      interval: '60',
      mounted: true,
      containerConnected: true,
      libraryReady: false,
      chartApiAvailable: true,
      mainSeriesDataReady: false,
      loadLastChart: true,
      datafeed: 'shared',
    });
    expect(Array.isArray(diagnostics.pendingBarRequests)).toBe(true);
    expect(hook.isLoading).toBe(true);
    expect(hook.stalled).toBe(true);

    await advance(5 * CHART_READY_WATCHDOG_MS);
    expect(report).toHaveBeenCalledTimes(1);
  });

  test('stays silent when the chart becomes ready in time', async () => {
    await act(async () => FakeWidget.instances[0].fireReady());
    await advance(CHART_READY_WATCHDOG_MS);

    expect(report).not.toHaveBeenCalled();
    expect(hook.isChartReady).toBe(true);
    expect(hook.isLoading).toBe(false);
    expect(hook.stalled).toBe(false);
  });

  test('recovers a chart whose data loaded but whose ready signal never came', async () => {
    FakeWidget.instances[0].seriesHasData = true;

    await advance(CHART_READY_WATCHDOG_MS);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][1]).toBe(true);
    expect(hook.isChartReady).toBe(true);
    expect(hook.isLoading).toBe(false);

    // A late ready signal must not run the ready path a second time.
    await act(async () => FakeWidget.instances[0].fireReady());
    expect(hook.isChartReady).toBe(true);
  });

  test('retry replaces the stalled widget with a fresh one', async () => {
    await advance(CHART_READY_WATCHDOG_MS);
    expect(hook.stalled).toBe(true);

    await act(async () => hook.retry());
    await advance(0);

    expect(FakeWidget.instances).toHaveLength(2);
    expect(FakeWidget.instances[0].removed).toBe(true);
    expect(hook.stalled).toBe(false);
    expect(hook.isLoading).toBe(true);

    await act(async () => FakeWidget.instances[1].fireReady());
    expect(hook.isChartReady).toBe(true);
    expect(hook.isLoading).toBe(false);

    // The torn-down widget's watchdog does not report afterwards.
    await advance(CHART_READY_WATCHDOG_MS);
    expect(report).toHaveBeenCalledTimes(1);
  });

  // §1.1
  test('reports how far the library boot got, timed from construction', async () => {
    const widget = FakeWidget.instances[0];
    await advance(1_000);
    widget.iframe.contentWindow?.dispatchEvent(new Event('sameOriginLoad'));
    await advance(200);
    widget.iframe.dispatchEvent(new Event('load'));
    await advance(800);
    await act(async () => widget.innerWindowLoad());

    await advance(CHART_READY_WATCHDOG_MS);

    const [diagnostics] = report.mock.calls[0];
    expect(diagnostics).toMatchObject({
      // Loaded before this page's first chart in the harness: no script tag.
      libraryScript: { status: 'not-requested', loadMs: null },
      tradingViewGlobal: true,
      iframeSrc: '/static/charting_library/sameorigin.html',
      sameOriginLoadMs: 1_000,
      iframeLoadMs: 1_200,
      iframeAccessible: true,
      innerWindowLoadMs: 2_000,
    });
  });

  // §1.1
  test('a frame that never loads reports null frame timings', async () => {
    await advance(CHART_READY_WATCHDOG_MS);

    expect(report.mock.calls[0][0]).toMatchObject({
      iframeLoadMs: null,
      iframeAccessible: null,
      sameOriginLoadMs: null,
      innerWindowLoadMs: null,
    });
  });

  // §1.2
  test('counts only visible time and records the time spent hidden', async () => {
    await advance(10_000);
    await setVisibility('hidden');
    await advance(10 * 60_000);
    expect(report).not.toHaveBeenCalled();

    await setVisibility('visible');
    await advance(CHART_READY_WATCHDOG_MS - 10_000 - 1);
    expect(report).not.toHaveBeenCalled();
    await advance(1);

    expect(report).toHaveBeenCalledTimes(1);
    const [diagnostics] = report.mock.calls[0];
    expect(diagnostics.elapsedMs).toBe(CHART_READY_WATCHDOG_MS);
    expect(diagnostics.hiddenMs).toBe(10 * 60_000);
    expect(diagnostics.visibility).toBe('visible');
    // The stalled path behaves as before once it does fire.
    expect(hook.stalled).toBe(true);
  });

  // §1.2
  test('never fires while the page stays hidden', async () => {
    await setVisibility('hidden');
    await advance(60 * 60_000);

    expect(report).not.toHaveBeenCalled();
    expect(hook.stalled).toBe(false);
  });
});

describe('charting library script trace', () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    visibility = 'visible';
    report.mockReset();
    resetChartStallReports();
    FakeWidget.instances = [];
    delete (window as unknown as { TradingView?: unknown }).TradingView;
    document
      .querySelectorAll('script[src*="charting_library"]')
      .forEach((el) => el.remove());
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  // §1.1
  test('records the script outcome and its load time', async () => {
    await act(async () => {
      root.render(createElement(Harness));
    });
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="charting_library"]'
    );
    if (!script) throw new Error('charting_library script was not added');

    await advance(700);
    (window as unknown as { TradingView: unknown }).TradingView = {
      widget: FakeWidget,
    };
    await act(async () => {
      script.dispatchEvent(new Event('load'));
    });
    await advance(0);
    expect(FakeWidget.instances).toHaveLength(1);

    await advance(CHART_READY_WATCHDOG_MS);

    expect(report.mock.calls[0][0]).toMatchObject({
      libraryScript: { status: 'loaded', loadMs: 700 },
      tradingViewGlobal: true,
    });
  });
});

// §1.3
describe('reportChartStall page cap', () => {
  beforeEach(() => resetChartStallReports());

  test('sends at most one report per page load across all charts', async () => {
    const { reportChartStall } = await vi.importActual<
      typeof import('@/components/widgets/shared/TradingViewChart/chartReadyWatchdog')
    >('@/components/widgets/shared/TradingViewChart/chartReadyWatchdog');
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const base = { interval: '60', elapsedMs: 30_000 } as Parameters<
      typeof reportChartStall
    >[0];

    reportChartStall({ ...base, symbol: 'A' }, false);
    reportChartStall({ ...base, symbol: 'B' }, false);
    reportChartStall({ ...base, symbol: 'C' }, true);

    const reports = logged.mock.calls.filter((c) =>
      String(c[0]).startsWith('[ChartReadyWatchdog] chart not ready')
    );
    expect(reports).toHaveLength(1);
    logged.mockRestore();
  });
});
