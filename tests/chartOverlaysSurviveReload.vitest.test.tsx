import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TradingViewChartCore } from '@/components/widgets/shared/TradingViewChart/TradingViewChartCore';
import type { TradingViewChartCoreRef } from '@/components/widgets/shared/TradingViewChart/types';

/**
 * Chart overlays (order lines, breakeven, trade markers, past-order segments,
 * signals) must end up on the chart whatever moment they arrive at:
 *
 * - before the main series has a price scale — TradingView refuses order lines
 *   and markers then, which is common when a chart opens fast because the
 *   library and candles are already cached;
 * - while the chart loads another pair — TradingView drops the lines and never
 *   creates anything asked for mid-load, and may drop a `dataReady` callback
 *   queued across the switch.
 *
 * The fake chart below behaves that way; the core must keep every overlay and
 * draw it once the chart can hold it — without duplicating it.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FakeChartState {
  symbol: string;
  loading: boolean;
  hasPriceScale: boolean;
  lines: number[];
  shapes: Map<number, string>;
  pendingDataReady: Array<() => void>;
  dataLoadedSubscribers: Array<() => void>;
  finishLoad?: () => void;
}

const buildFakeTradingView = (options: { dropDataReadyAcrossSwitch: boolean }) => {
  const state: FakeChartState = {
    symbol: 'GNOTUSD@KRAKEN',
    loading: false,
    hasPriceScale: false,
    lines: [],
    shapes: new Map(),
    pendingDataReady: [],
    dataLoadedSubscribers: [],
  };
  let nextShapeId = 1;
  const canDraw = () => !state.loading && state.hasPriceScale;
  const createShape = (_point: unknown, opts: { shape?: string }) => {
    if (!canDraw()) return null;
    const id = nextShapeId++;
    state.shapes.set(id, opts?.shape ?? 'shape');
    return id;
  };

  const chartApi = {
    symbol: () => state.symbol,
    resolution: () => '60',
    setSymbol: (symbol: string, opts?: { dataReady?: () => void }) => {
      state.symbol = symbol.toUpperCase();
      state.loading = true;
      // TradingView throws away the previous series' lines and shapes...
      state.lines.length = 0;
      state.shapes.clear();
      // ...and, in the worst case, whatever was waiting on its data.
      if (options.dropDataReadyAcrossSwitch) state.pendingDataReady = [];
      state.finishLoad = () => {
        state.loading = false;
        state.pendingDataReady.splice(0).forEach((cb) => cb());
        opts?.dataReady?.();
        state.dataLoadedSubscribers.forEach((cb) => cb());
      };
    },
    dataReady: (cb: () => void) => {
      if (state.loading) {
        state.pendingDataReady.push(cb);
        return false;
      }
      return true;
    },
    onDataLoaded: () => ({
      subscribe: (_ctx: null, cb: () => void) => {
        state.dataLoadedSubscribers.push(cb);
      },
      unsubscribe: (_ctx: null, cb: () => void) => {
        state.dataLoadedSubscribers = state.dataLoadedSubscribers.filter(
          (s) => s !== cb
        );
      },
    }),
    onSymbolChanged: () => ({ subscribe: () => undefined }),
    onIntervalChanged: () => ({ subscribe: () => undefined }),
    getVisiblePriceRange: () =>
      canDraw() ? { from: 1, to: 1000 } : null,
    getVisibleRange: () => null,
    createOrderLine: () => {
      let price = 0;
      let placed = false;
      const line: Record<string, unknown> = {
        setPrice(p: number) {
          price = p;
          // A line created while the chart can't hold it never shows up.
          if (canDraw() && !placed) {
            state.lines.push(p);
            placed = true;
          }
          return proxy;
        },
        getPrice: () => price,
        remove() {
          const i = state.lines.indexOf(price);
          if (placed && i >= 0) state.lines.splice(i, 1);
          placed = false;
        },
      };
      const proxy: Record<string, unknown> = new Proxy(line, {
        get: (target, key) =>
          key in target ? target[key as string] : () => proxy,
      });
      return proxy;
    },
    createShape,
    createMultipointShape: createShape,
    removeEntity: (id: number) => {
      state.shapes.delete(id);
    },
  };

  const widgets: Array<{ fireReady: () => void }> = [];
  class FakeWidget {
    private ready: Array<() => void> = [];
    constructor(config: { container: HTMLElement }) {
      config.container.appendChild(document.createElement('iframe'));
      widgets.push(this);
    }
    onChartReady(cb: () => void) {
      this.ready.push(cb);
    }
    fireReady() {
      this.ready.forEach((cb) => cb());
    }
    activeChart() {
      return chartApi;
    }
    chart() {
      return chartApi;
    }
    remove() {}
  }
  (window as unknown as { TradingView: unknown }).TradingView = {
    widget: FakeWidget,
  };
  return { state, widgets };
};

const shapeCount = (state: FakeChartState, name: string) =>
  [...state.shapes.values()].filter((s) => s === name).length;

const NOW = 1_790_000_000_000;
const overlaysForBot = (price: number) => ({
  orders: [{ price, side: 'SELL', qty: 1, label: 'TP order' }],
  avgPrices: [{ price: price - 10, symbol: 'XMR-USD', label: 'Breakeven' }],
  transactions: [{ id: 't1', time: NOW, price: price - 20, side: 'BUY' }],
  drawings: [
    {
      side: 'BUY',
      price: price - 30,
      startTime: NOW - 10 * 3_600_000,
      endTime: NOW,
    },
  ],
  signals: [{ time: NOW, price: price - 40, side: 'buy', type: 'entry' }],
});

const pushOverlays = (
  core: TradingViewChartCoreRef,
  o: ReturnType<typeof overlaysForBot>
) => {
  core.updateOrderLines(o.orders as never);
  core.updateAveragePriceLines(o.avgPrices as never);
  core.updateTransactions(o.transactions as never);
  core.updateOrderDrawings(o.drawings as never);
  core.updatePastEntries(o.signals as never);
};

const expectAllDrawn = (state: FakeChartState, price: number) => {
  expect([...state.lines].sort()).toEqual([price - 10, price].sort());
  // one trade marker, one past-order segment, one signal icon
  expect(state.shapes.size).toBe(3);
  expect(shapeCount(state, 'trend_line')).toBe(1);
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mountReadyChart = async (fake: ReturnType<typeof buildFakeTradingView>) => {
  const ref = createRef<TradingViewChartCoreRef>();
  await act(async () => {
    root.render(
      createElement(TradingViewChartCore, {
        ref,
        initialSymbol: 'GNOTUSD@KRAKEN',
        enableLoadLastChart: false,
        enableAutoSave: false,
      })
    );
  });
  await act(async () => {
    await sleep(0);
  });
  await act(async () => fake.widgets[0].fireReady());
  expect(ref.current?.isReady()).toBe(true);
  return ref.current as TradingViewChartCoreRef;
};

describe('chart overlays survive the chart (re)loading', () => {
  test('overlays sent before the price scale exists are drawn once it does', async () => {
    const fake = buildFakeTradingView({ dropDataReadyAcrossSwitch: false });
    const core = await mountReadyChart(fake);

    pushOverlays(core, overlaysForBot(500));
    expect(fake.state.lines).toEqual([]);
    expect(fake.state.shapes.size).toBe(0);

    fake.state.hasPriceScale = true;
    await act(async () => {
      await sleep(400);
    });

    expectAllDrawn(fake.state, 500);
  });

  test.each([
    ['delivered', false],
    ['dropped by TradingView', true],
  ])(
    'every overlay of the next pair is drawn after the switch (dataReady %s)',
    async (_label, dropDataReadyAcrossSwitch) => {
      const fake = buildFakeTradingView({ dropDataReadyAcrossSwitch });
      fake.state.hasPriceScale = true;
      const core = await mountReadyChart(fake);

      // First bot: drawn straight away.
      pushOverlays(core, overlaysForBot(100));
      expectAllDrawn(fake.state, 100);

      // Next bot: the switch starts, then its overlays arrive mid-load.
      core.updateSymbol('XMRUSD@KRAKEN');
      pushOverlays(core, overlaysForBot(500));
      expect(fake.state.lines).toEqual([]);
      expect(fake.state.shapes.size).toBe(0);

      await act(async () => fake.state.finishLoad?.());
      expectAllDrawn(fake.state, 500);

      // Re-sending the same overlays never duplicates them.
      pushOverlays(core, overlaysForBot(500));
      expectAllDrawn(fake.state, 500);
    }
  );

  test('switching to the pair already shown still draws the overlays', async () => {
    const fake = buildFakeTradingView({ dropDataReadyAcrossSwitch: false });
    fake.state.hasPriceScale = true;
    const core = await mountReadyChart(fake);

    const onLoaded = () => undefined;
    core.updateSymbol('GNOTUSD@KRAKEN', onLoaded);
    pushOverlays(core, overlaysForBot(300));

    expectAllDrawn(fake.state, 300);
  });
});
