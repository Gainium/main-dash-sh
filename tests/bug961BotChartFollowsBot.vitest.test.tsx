import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  act,
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  createRef,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * The bot list pages share ONE details drawer across bots. Opening bot B
 * after bot A must put B's chart on B's pair with B's open-deal lines
 * (TP / DCA orders). Three things broke that:
 *  1. `useBotOrders` took the global `placeholderData: (prev) => prev`, so the
 *     moment `botId` changed it committed A's orders to the store as B's —
 *     and the drawer then auto-selected A's deal (and pair) for bot B.
 *  2. The core called `activeChart().setSymbol(symbol, interval, cb)`; the
 *     real signature is `setSymbol(symbol, options | cb)`, so "loaded" was
 *     never reported.
 *  3. An order line asked for while the new symbol is still loading is not
 *     created, yet the wrapper recorded it as drawn — so it never appeared.
 */

// ---------------------------------------------------------------- useBotOrders

const fetchOrders = vi.hoisted(() =>
  vi.fn<(vars: { input: { id: string } }) => Promise<unknown>>()
);
vi.mock('../src/hooks/useGraphQL', () => ({
  useGraphQL: (
    key: string,
    gql: { variables: { input: { id: string } } },
    options: Record<string, unknown>
  ) =>
    // Same react-query call shape as the real hook: caller options spread
    // over the client's defaults, keyed by the variables.
    useQuery({
      ...options,
      queryKey: [key, JSON.stringify(gql.variables)],
      queryFn: () => fetchOrders(gql.variables),
    }),
}));

import { queryClient } from '@/lib/queryClient';
import { useOrderStore } from '@/stores/live';
import { useBotOrders } from '../src/hooks/useBotOrders';

// ------------------------------------------------------------ chart wrapper

type FakeHandle = Record<string, ReturnType<typeof vi.fn>> & {
  isReady: () => boolean;
};
const chart = vi.hoisted(() => ({
  dataLoaded: true,
  onLoaded: undefined as undefined | (() => void),
  handle: null as unknown as FakeHandle,
}));
vi.mock(
  '@/components/widgets/shared/TradingViewChart/TradingViewWidgetRenderer',
  () => ({
    default: forwardRef<unknown, { onChartReady?: () => void }>(
      function FakeRenderer(props, ref) {
        useImperativeHandle(ref, () => chart.handle);
        useEffect(() => {
          props.onChartReady?.();
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }
    ),
  })
);

import TradingViewChart from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import { TradingViewChartCore } from '@/components/widgets/shared/TradingViewChart/TradingViewChartCore';
import type { TradingViewChartCoreRef } from '@/components/widgets/shared/TradingViewChart/types';

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
  vi.useRealTimers();
});

const order = (botId: string, dealId: string, price: string) => ({
  clientOrderId: `${botId}-${price}`,
  botId,
  dealId,
  symbol: botId === 'botA' ? 'GNOT-USD' : 'XMR-USD',
  price,
  origQty: '1',
  executedQty: '0',
  side: 'SELL',
  status: 'NEW',
  time: 1,
  updateTime: 1,
  type: 'LIMIT',
});

describe('bug #961 — the bot drawer chart follows the bot it shows', () => {
  test("switching bots never files the previous bot's orders under the new one", async () => {
    vi.useFakeTimers();
    queryClient.clear();
    useOrderStore.getState().clearAllOrders();
    fetchOrders.mockImplementation(async (vars) =>
      vars.input.id === 'botA'
        ? {
            status: 'OK',
            data: { orders: [order('botA', 'dealA', '0.12')], total: 1 },
          }
        : // bot B's answer is still in flight — the window the defect lives in
          new Promise(() => undefined)
    );

    // Query → state → 50ms debounced store write: let every hop run.
    const settle = async () => {
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200);
        });
      }
    };

    function Harness({ botId }: { botId: string }) {
      useBotOrders(botId, undefined, { status: 'NEW' });
      return null;
    }
    const render = (botId: string) =>
      act(async () => {
        root.render(
          createElement(
            MemoryRouter,
            null,
            createElement(
              QueryClientProvider,
              { client: queryClient },
              createElement(Harness, { botId })
            )
          )
        );
      });

    await render('botA');
    await settle();
    expect(useOrderStore.getState().getOrders('botA')).toHaveLength(1);

    await render('botB');
    await settle();

    expect(useOrderStore.getState().getOrders('botB')).toEqual([]);
  });

  test('the core reports "symbol loaded" through the documented setSymbol options', async () => {
    const setSymbol = vi.fn();
    class FakeWidget {
      private ready: Array<() => void> = [];
      constructor(config: { container: HTMLElement }) {
        const iframe = document.createElement('iframe');
        config.container.appendChild(iframe);
      }
      onChartReady(cb: () => void) {
        this.ready.push(cb);
      }
      fireReady() {
        this.ready.forEach((cb) => cb());
      }
      activeChart() {
        return {
          setSymbol,
          dataReady: () => true,
          onSymbolChanged: () => ({ subscribe: () => undefined }),
          onIntervalChanged: () => ({ subscribe: () => undefined }),
        };
      }
      chart() {
        return this.activeChart();
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
    expect(widgets).toHaveLength(1);
    await act(async () => widgets[0].fireReady());
    expect(ref.current?.isReady()).toBe(true);

    const onLoaded = vi.fn();
    ref.current?.updateSymbol('XMR-USD@kraken', onLoaded);

    expect(setSymbol).toHaveBeenCalledTimes(1);
    const [symbol, options] = setSymbol.mock.calls[0];
    expect(symbol).toBe('XMR-USD@kraken');
    expect(typeof options?.dataReady).toBe('function');
    options.dataReady();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  test("a deal opened on another pair hands its TP line to the chart core", async () => {
    // Drawing it only once the new pair has loaded is the core's job — see
    // chartOverlaysSurviveReload.vitest.test.tsx. The wrapper must pass the
    // new bot's lines on, even though they arrive mid-switch.
    const updateOrderLines = vi.fn();
    chart.handle = {
      isReady: () => true,
      updateSymbol: vi.fn(),
      updateOrderLines,
      addOrderLine: vi.fn(),
      clearAllOrderLines: vi.fn(),
      removeOrderLine: vi.fn(),
      updateOrderDrawings: vi.fn(),
      updatePastEntries: vi.fn(),
      updateAveragePriceLines: vi.fn(),
      updateTransactions: vi.fn(),
      updateIndicators: vi.fn(async () => undefined),
      updateInterval: vi.fn(),
      getWidget: vi.fn(() => null),
      centerAtTimestampMs: vi.fn(),
    } as unknown as FakeHandle;

    // A custom datafeed keeps the wrapper off the shared live symbol state.
    const datafeed = {} as never;
    const renderChart = (symbol: string, orders: unknown[]) =>
      act(async () => {
        root.render(
          createElement(TradingViewChart, {
            symbol,
            orders,
            datafeed,
            widgetId: 'drawer-market-chart-test',
          } as never)
        );
      });

    // Drawer opened on bot A's pair, no deal selected yet.
    await renderChart('GNOT-USD@kraken', []);

    // Bot B: its latest deal is auto-selected → new pair + its TP order.
    const tp = { price: 582.14, side: 'SELL', qty: 1.42, label: 'TP order' };
    await renderChart('XMRUSD@kraken', [tp]);

    expect(chart.handle.updateSymbol).toHaveBeenLastCalledWith('XMRUSD@kraken');
    expect(updateOrderLines).toHaveBeenLastCalledWith([tp]);
  });
});
