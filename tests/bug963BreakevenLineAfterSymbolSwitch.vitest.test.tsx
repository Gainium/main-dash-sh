import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TradingViewChartCore } from '@/components/widgets/shared/TradingViewChart/TradingViewChartCore';
import type { TradingViewChartCoreRef } from '@/components/widgets/shared/TradingViewChart/types';

/**
 * The shared bot drawer switches its chart to the next bot's pair in place.
 * The breakeven (avg-price) line for the new bot's deal is usually asked for
 * while that pair is still loading. TradingView drops a `dataReady` callback
 * queued across a `setSymbol`, so the line is never created — and because the
 * core recorded the payload's signature before the draw landed, every later
 * render of the same breakeven was skipped as "already drawn".
 */

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

describe('bug #963 — breakeven line survives an in-place symbol switch', () => {
  test("a breakeven asked for mid-switch is drawn once the new pair's data loads", async () => {
    const live: number[] = [];
    const state = {
      loading: false,
      pending: [] as Array<() => void>,
      loaded: undefined as undefined | (() => void),
    };
    const chartApi = {
      setSymbol: (_symbol: string, options?: { dataReady?: () => void }) => {
        // TradingView discards the old series (and its lines) and whatever
        // was waiting on its data.
        state.loading = true;
        state.pending = [];
        live.length = 0;
        state.loaded = () => {
          state.loading = false;
          options?.dataReady?.();
        };
      },
      dataReady: (cb: () => void) => {
        if (state.loading) {
          state.pending.push(cb);
        } else {
          cb();
        }
        return true;
      },
      createOrderLine: () => {
        const line = {
          price: 0,
          setPrice(p: number) {
            this.price = p;
            live.push(p);
            return line;
          },
          remove() {
            const i = live.indexOf(line.price);
            if (i >= 0) live.splice(i, 1);
          },
        };
        return new Proxy(line, {
          get: (target, key) =>
            key in target ? target[key as keyof typeof target] : () => line,
        });
      },
      onSymbolChanged: () => ({ subscribe: () => undefined }),
      onIntervalChanged: () => ({ subscribe: () => undefined }),
    };
    class FakeWidget {
      private ready: Array<() => void> = [];
      constructor(config: { container: HTMLElement }) {
        config.container.appendChild(document.createElement('iframe'));
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
    const widgets: FakeWidget[] = [];
    (window as unknown as { TradingView: unknown }).TradingView = {
      widget: class extends FakeWidget {
        constructor(config: { container: HTMLElement }) {
          super(config);
          widgets.push(this);
        }
      },
    };

    const ref = createRef<TradingViewChartCoreRef>();
    await act(async () => {
      root.render(
        createElement(TradingViewChartCore, {
          ref,
          initialSymbol: 'GNOT-USD@kraken',
          enableLoadLastChart: false,
          enableAutoSave: false,
        })
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => widgets[0].fireReady());
    expect(ref.current?.isReady()).toBe(true);

    // Previous bot: no open deal, no breakeven.
    ref.current?.updateAveragePriceLines([]);

    // Next bot: the pair switch starts, then its deal's breakeven arrives.
    const onLoaded = vi.fn();
    ref.current?.updateSymbol('XMRUSD@kraken', onLoaded);
    ref.current?.updateAveragePriceLines([
      { price: 570.68, symbol: 'XMR-USD', label: 'Breakeven' },
    ]);
    expect(live).toEqual([]); // dropped with the load

    await act(async () => state.loaded?.());

    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(live).toEqual([570.68]);

    // Re-sending the same payload stays a no-op (no duplicate line).
    ref.current?.updateAveragePriceLines([
      { price: 570.68, symbol: 'XMR-USD', label: 'Breakeven' },
    ]);
    expect(live).toEqual([570.68]);
  });
});
