/**
 * Runner note: `.vitest.test.tsx` (not `.unit.test.ts`) because this renders the
 * real component in jsdom and mocks modules — Playwright's core suite never
 * collects it. Run from the parent:
 * `npx vitest run core/tests/tradeCardShortFills.vitest.test.tsx`.
 */

/**
 * Bug #553 — "Deal card not updated / the DCA level in the chart has
 * disappeared".
 *
 * The deal card's sparkline picked its averaging-in fills with a hardcoded
 * `o.side === 'BUY'`. A SHORT deal averages in with SELLs, so `fills` came back
 * empty on every short: the running `qty` never left 0, which nulls `tp` for
 * every candle, and `buyFilledHere` never flipped, which nulls `fillMarker` for
 * every candle. The card rendered a bare price line — no fill dots, no TP curve
 * — which is exactly the screenshot on the report.
 *
 * The orders below are the REAL ones from the reporter's open deal
 * `6a7df453d7a57481be857dfa` (Bitget BTC/USDT spot, "Orca - SHORT v3.1"), read
 * from prod via the dashboard GraphQL: three FILLED SELL MARKET orders (1 base
 * + 2 DCA) and NOT ONE resting order. Their quantity-weighted average is
 * 69747.2446, which is the deal's own `avgPrice` — i.e. these three fills ARE
 * the position.
 *
 * The assertion is on the data recharts is handed, because that is what decides
 * whether a dot is drawn: `fillMarker` non-null on the candle at/after each
 * fill. A long deal is checked alongside so the direction split cannot regress
 * the case that already worked.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExchangeDataProvider } from '@/contexts/ExchangeDataContext';

// ---------------------------------------------------------------------------
// recharts: capture the `data` the chart actually receives, render nothing.
// ResponsiveContainer has no size in jsdom, so a real render would draw no
// dots regardless of the fix — the data prop is the honest observation point.
// ---------------------------------------------------------------------------
// OBSERVATION POINT — `withAxisIndex`, the last call inside the card's
// `chartData` useMemo, so its argument IS the row set the chart is handed.
//
// Why not mock `recharts` and read the ComposedChart `data` prop: mocking a
// node_modules package does not take effect in this project's vitest setup (the
// factory registers but the real module still loads), and real recharts renders
// NOTHING in jsdom because ResponsiveContainer measures 0x0. Both routes give a
// silent empty capture. Mocking a first-party source module works reliably here.
//
// `vi.hoisted` because vi.mock factories are hoisted above the imports — a
// factory closing over a plain top-level `const` hits it in the TDZ.
const captured = vi.hoisted(() => ({
  rows: null as Array<Record<string, unknown>> | null,
}));

vi.mock('../src/lib/charts/axisIndex', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = actual.withAxisIndex as (r: unknown[]) => unknown[];
  return {
    ...actual,
    withAxisIndex: (rows: Array<Record<string, unknown>>) => {
      captured.rows = rows;
      return real(rows);
    },
  };
});

// The three real FILLED SELL MARKET orders on the reporter's deal.
const SHORT_ORDERS = [
  {
    side: 'SELL',
    status: 'FILLED',
    type: 'MARKET',
    typeOrder: 'dealStart',
    price: '62889.14',
    origQty: '0.000524',
    executedQty: '0.000524',
    updateTime: 1786639443733,
    dealId: 'deal-short',
  },
  {
    side: 'SELL',
    status: 'FILLED',
    type: 'MARKET',
    typeOrder: 'dealRegular',
    price: '64183.2',
    origQty: '0.005141',
    executedQty: '0.005141',
    updateTime: 1787025604144,
    dealId: 'deal-short',
  },
  {
    side: 'SELL',
    status: 'FILLED',
    type: 'MARKET',
    typeOrder: 'dealRegular',
    price: '77289.62',
    origQty: '0.004269',
    executedQty: '0.004269',
    updateTime: 1787385602546,
    dealId: 'deal-short',
  },
];

// Same shape, mirrored to the buy side — the long case that already worked.
const LONG_ORDERS = SHORT_ORDERS.map((o, i) => ({
  ...o,
  side: 'BUY',
  dealId: 'deal-long',
  updateTime: o.updateTime + i,
}));

let ordersForTest: Array<Record<string, unknown>> = [];

vi.mock('../src/hooks/useDealOrders', () => ({
  useDealOrders: () => ({ orders: ordersForTest, isLoading: false }),
}));

// A candle every 6h spanning the three fills, so each fill has a candle
// at/after it for its marker to land on.
const FIRST = 1786639443733;
const LAST = 1787385602546;
const STEP = 6 * 60 * 60 * 1000;
const PRICE_SERIES = (() => {
  const pts = [];
  for (let ts = FIRST - STEP; ts <= LAST + STEP; ts += STEP) {
    pts.push({ ts, time: new Date(ts).toISOString(), price: 70000 });
  }
  return pts;
})();

vi.mock('../src/hooks/useDealPriceHistory', () => ({
  useDealPriceHistory: () => ({ priceData: PRICE_SERIES, isLoading: false }),
}));

// `useDealActions` is left REAL — its mutations are inert without a click, and
// stubbing it means enumerating every export the card imports (the module grows
// them; a partial stub just fails the next time one is added).

const makeTrade = (long: boolean) => ({
  active: true,
  id: long ? 'deal-long' : 'deal-short',
  type: 'DCA' as const,
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  strategy: long ? 'LONG' : 'SHORT',
  status: 'open',
  exchange: 'bitget',
  botId: 'bot-1',
  side: long ? ('BUY' as const) : ('SELL' as const),
  currentBalance: { base: 0, quote: 0 },
  usage: { current: { base: 0, quote: 0 } },
  levels: { complete: 3, all: 6 },
  avgPrice: 69747.2446486813,
  entryPrice: 62889.14,
});

async function renderCard(long: boolean) {
  const { TradeCard } = await import('@/components/trades/TradeCard');
  ordersForTest = long ? LONG_ORDERS : SHORT_ORDERS;
  captured.rows = null;

  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root | null = null;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // SYNCHRONOUS act on purpose. `chartData` is a useMemo evaluated DURING
  // render, so the ComposedChart data prop is captured on the first pass. An
  // `await act(async …)` never settles here: the persisted zustand stores
  // (order/deal) retry their IndexedDB rehydration forever in jsdom, so the
  // microtask queue never drains and the test just times out.
  act(() => {
    root = createRoot(host, {
      onUncaughtError: (e: unknown) => {
        // Surface a render throw instead of failing with a bare null capture.
        console.error('RENDER THREW:', e);
      },
    } as never);
    root.render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(
          MemoryRouter,
          null,
          createElement(
            ExchangeDataProvider,
            null,
            createElement(TradeCard as never, {
              trade: makeTrade(long),
              enableEnhancedView: true,
              showChart: true,
              handleEdit: () => {},
            })
          )
        )
      )
    );
  });
  act(() => {
    root?.unmount();
  });
  host.remove();
  return captured.rows;
}

const markerCount = (data: Array<Record<string, unknown>> | null) =>
  (data ?? []).filter((p) => p.fillMarker != null).length;

describe('bug #553 — deal card sparkline marks averaging fills on shorts', () => {
  it('a SHORT deal whose 3 averaging fills are SELLs gets 3 fill markers', async () => {
    const data = await renderCard(false);
    expect(data, 'the chart received no data at all').not.toBeNull();
    // One marker per fill. Before the fix this was 0 — the reported symptom.
    expect(markerCount(data)).toBe(3);
  });

  it('a LONG deal still gets its 3 fill markers (no regression)', async () => {
    const data = await renderCard(true);
    expect(data).not.toBeNull();
    expect(markerCount(data)).toBe(3);
  });
});
