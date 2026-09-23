/**
 * Runner note: renders the real deal Orders section in jsdom, so it is a
 * Vitest file. Run from the parent:
 *   NODE_ENV=development npx vitest run \
 *     core/tests/bug824DealOrdersExecuteNowAndTime.vitest.test.tsx
 *
 * Spec 028 — two defects the reporter saw on one deal.
 *
 * 1. "Execute now" rendered next to a 100%-filled buy order. The affordance is
 *    picked by bare row id out of the PENDING ladder, but the column set that
 *    draws it is shared with the COMPLETED table — so one order that reaches
 *    the section twice (a stale `new`-bucket copy replayed from a cached fetch
 *    snapshot, plus the real `filled` copy) lights the button on the terminal
 *    row. Two halves are covered: the store must not hand the same order back
 *    twice, and the button must not draw on a terminal row even if it does.
 *
 * 2. The TIME column rendered placement time, not execution time. Measured on
 *    the reporter's own live data: 229 of 262 filled orders (87.4%) have the
 *    two timestamps more than a second apart, the worst by ~37 hours.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MemoryRouter } from 'react-router-dom';

import { StrategyEnum, type OrderData } from '@/types';
import type { ViewOrder } from '@/types/bots';

vi.mock('@/hooks/useOrderActions', () => ({
  useCancelOrder: () => ({
    cancelTerminalOrder: async () => undefined,
    cancelPendingOrder: async () => undefined,
    isLoading: false,
  }),
}));

import { DealOrdersSection } from '@/components/trades/DealOrdersSection';
import { useOrderStore } from '@/stores/live/orderStore';

const BOT_ID = '6a8b89e98e06bef801add796';
const DEAL_ID = '6aaf5177e607ba4cdf363513';

/** The reporter's worst-drifting order: placed 2026-09-18, filled 2026-09-20. */
const PLACED_MS = Date.parse('2026-09-18T13:55:18.329Z');
const EXECUTED_MS = Date.parse('2026-09-20T02:53:18.266Z');

const viewOrder = (over: Partial<ViewOrder> & { id: string }): ViewOrder => ({
  dealId: DEAL_ID,
  type: 'buy',
  status: 'pending',
  symbol: 'DOT-USDC',
  baseAsset: 'DOT',
  quoteAsset: 'USDC',
  amount: 10,
  price: 3,
  filled: 0,
  remaining: 10,
  total: 30,
  createTime: new Date(PLACED_MS).toISOString(),
  side: 'buy',
  exchange: 'coinbase',
  origQty: '10',
  executedQty: '0',
  typeOrder: 'dealRegular',
  clientOrderId: over.id,
  time: PLACED_MS,
  ...over,
});

/** A 100%-filled safety order — the row the reporter photographed. */
const FILLED = viewOrder({
  id: 'gainium-dca-filled-1',
  status: 'filled',
  filled: 10,
  remaining: 0,
  executedQty: '10',
  executedQuantity: 10,
  time: EXECUTED_MS,
  updateTime: new Date(EXECUTED_MS).toISOString(),
});

/**
 * The phantom: the SAME order as `FILLED`, as the stale pre-fill snapshot that
 * a cached fetch replay puts back into the store's `new` bucket. Same id, so
 * it wins `nextDcaRowId` and `FILLED` then matches it on the Completed tab.
 */
const PHANTOM = viewOrder({ id: FILLED.id });

/** A genuinely resting level, lower in the ladder. */
const RESTING = viewOrder({ id: 'gainium-dca-resting-2', price: 2.5, total: 25 });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

const render = (props: {
  pendingOrders: ViewOrder[];
  completedOrders: ViewOrder[];
}) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(DealOrdersSection, {
          dealId: DEAL_ID,
          botId: BOT_ID,
          botType: 'DCA',
          exchange: 'coinbase',
          isLoadingOrders: false,
          strategy: StrategyEnum.long,
          onExecuteNextDca: () => undefined,
          ...props,
        })
      )
    );
  });
  return host;
};

const byText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLElement>('button,[role=tab]')).filter(
    (n) => (n.textContent || '').trim().toLowerCase().includes(text)
  );

const executeNowButtons = (el: HTMLElement) => byText(el, 'execute now');

const clickTab = (el: HTMLElement, label: string) => {
  const tab = Array.from(el.querySelectorAll<HTMLElement>('[role=tab]')).find(
    (n) => (n.textContent || '').toLowerCase().startsWith(label)
  );
  expect(tab, `tab "${label}" exists`).toBeTruthy();
  act(() => {
    tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    tab?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    tab?.click();
  });
};

afterEach(() => {
  const r = root;
  if (r) {
    act(() => r.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  useOrderStore.getState().clearAllOrders();
});

describe('order store dedupe (spec 028 §3.2 / §4.2a)', () => {
  const asOrderData = (o: ViewOrder, status: string): OrderData =>
    ({
      clientOrderId: o.clientOrderId,
      dealId: o.dealId,
      botId: BOT_ID,
      status,
      origQty: o.origQty,
      executedQty: o.executedQty,
      price: String(o.price),
      typeOrder: o.typeOrder,
      symbol: o.symbol,
    }) as unknown as OrderData;

  it('returns one row per clientOrderId, preferring the terminal copy', () => {
    const store = useOrderStore.getState();
    // Pre-fill snapshot replayed into `new` AFTER the socket already filed the
    // fill under `filled` — the order is now in both buckets at once.
    store.updateOrders(BOT_ID, [asOrderData(FILLED, 'FILLED')], 'filled');
    store.updateOrders(BOT_ID, [asOrderData(PHANTOM, 'NEW')], 'new');

    const rows = useOrderStore.getState().getOrders(BOT_ID);
    expect(rows.map((r) => r.clientOrderId)).toEqual([FILLED.clientOrderId]);
    expect(rows[0]?.status).toBe('FILLED');
  });

  it('keeps an order that lives in only one bucket', () => {
    const store = useOrderStore.getState();
    store.updateOrders(BOT_ID, [asOrderData(RESTING, 'NEW')], 'new');
    store.updateOrders(BOT_ID, [asOrderData(FILLED, 'FILLED')], 'filled');

    const rows = useOrderStore.getState().getOrders(BOT_ID);
    expect(new Set(rows.map((r) => r.clientOrderId))).toEqual(
      new Set([RESTING.clientOrderId, FILLED.clientOrderId])
    );
  });

  it('getAllOrders dedupes the same way', () => {
    const store = useOrderStore.getState();
    store.updateOrders(BOT_ID, [asOrderData(FILLED, 'FILLED')], 'filled');
    store.updateOrders(BOT_ID, [asOrderData(PHANTOM, 'NEW')], 'new');

    const all = useOrderStore.getState().getAllOrders();
    expect(all[BOT_ID]?.length).toBe(1);
    expect(all[BOT_ID]?.[0]?.status).toBe('FILLED');
  });
});

describe('Execute now scope (spec 028 §2 / §4.2b)', () => {
  it('offers the action on the resting level (control)', () => {
    const el = render({ pendingOrders: [RESTING], completedOrders: [FILLED] });
    expect(executeNowButtons(el).length).toBe(1);
  });

  it('never offers it on the Completed tab, even for the duplicated order', () => {
    const el = render({
      pendingOrders: [PHANTOM],
      completedOrders: [FILLED],
    });
    clickTab(el, 'completed');
    const onCompleted = executeNowButtons(el).filter(
      (b) => !!b.closest('[role=tabpanel][data-state="active"]')
    );
    expect(onCompleted.length).toBe(0);
  });

  it('never offers it on a terminal row', () => {
    // Both copies land in the pending table (the defensive case: whatever put
    // the terminal row there, it has nothing left to execute).
    const el = render({
      pendingOrders: [FILLED, RESTING],
      completedOrders: [],
    });
    const buttons = executeNowButtons(el);
    expect(buttons.length).toBe(1);
    const row = buttons[0]?.closest('tr');
    expect(row?.textContent).toContain('2.5');
  });

  it('still offers it on a near-100% partial fill, which is still resting', () => {
    const partial = viewOrder({
      id: 'gainium-dca-partial-3',
      status: 'partial',
      filled: 9.98,
      remaining: 0.02,
      executedQty: '9.98',
      executedQuantity: 9.98,
    });
    const el = render({ pendingOrders: [partial], completedOrders: [] });
    expect(executeNowButtons(el).length).toBe(1);
  });
});

describe('TIME column (spec 028 §1)', () => {
  it('renders execution time, not placement time', () => {
    const el = render({ pendingOrders: [], completedOrders: [FILLED] });
    clickTab(el, 'completed');
    const text = el.textContent || '';
    expect(text).toContain(new Date(EXECUTED_MS).toLocaleString());
    expect(text).not.toContain(new Date(PLACED_MS).toLocaleString());
  });
});
