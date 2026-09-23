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

import { CHART_READY_WATCHDOG_MS } from '@/components/widgets/shared/TradingViewChart/chartReadyWatchdog';
import { useInitializeWidget } from '@/components/widgets/shared/TradingViewChart/useInitializeWidget';

class FakeWidget {
  static instances: FakeWidget[] = [];
  _ready = false;
  seriesHasData = false;
  removed = false;
  private readyCallbacks: Array<() => void> = [];
  private iframe: HTMLIFrameElement;
  constructor(config: { container: HTMLElement }) {
    FakeWidget.instances.push(this);
    this.iframe = document.createElement('iframe');
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

describe('chart-ready watchdog', () => {
  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
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
});
