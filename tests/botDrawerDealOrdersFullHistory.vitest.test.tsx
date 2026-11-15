/**
 * Runner note: Vitest (jsdom), run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/botDrawerDealOrdersFullHistory.vitest.test.tsx`
 *
 * Spec 152 (parent repo `specs/152.bot-drawer-deal-orders-full-history.md`).
 *
 * A deal opened from the bot drawer must list every order the deal has, not
 * only the ones that fall inside the bot-level order pool (`useBotOrders`,
 * capped at 2 pages × 500 most recent fills for performance). On a bot with
 * thousands of fills an old deal's base order and early DCA levels sit outside
 * that window.
 *
 * §1/§2: the bot-level pool holds only part of the deal (the old source of the
 *        drawer's deal tabs) — documents the cap, which stays as it is (§4).
 * §3:    the deal-scoped source the drawer now reads (`useDealOrders`, split by
 *        `splitDealOrders`) returns the whole deal and keeps live socket
 *        fills merging in.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { BotTypesEnum, type OrderData } from '@/types';
import { useOrderStore } from '@/stores/live';
import { useBotOrders } from '@/hooks/useBotOrders';
import { useDealOrders } from '@/hooks/useDealOrders';
import { splitDealOrders } from '@/utils/orders/viewOrder';

const BOT = 'bot-1';
const DEAL = 'deal-old';
const DEAL_FILLS = 60; // 1 base + 59 DCA
const IN_POOL = 23; // the deal's fills that are among the bot's 1,000 newest

const order = (
  id: string,
  dealId: string,
  typeOrder: string,
  status: string,
  t: number
): OrderData =>
  ({
    clientOrderId: id,
    dealId,
    botId: BOT,
    typeOrder,
    status,
    side: typeOrder === 'dealTP' ? 'SELL' : 'BUY',
    price: '1',
    origQty: '1',
    executedQty: status === 'FILLED' ? '1' : '0',
    time: t,
    transactTime: t,
    updateTime: t,
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    exchange: 'binance',
    type: 'LIMIT',
  }) as unknown as OrderData;

// The deal's full order set (what `getDealOrders {all: true}` returns).
const dealOrders: OrderData[] = [
  order('D-BO-0', DEAL, 'dealStart', 'FILLED', 1_000),
  ...Array.from({ length: DEAL_FILLS - 1 }, (_, i) =>
    order(`D-RO-${i + 1}`, DEAL, 'dealRegular', 'FILLED', 1_001 + i)
  ),
  order('D-TP-0', DEAL, 'dealTP', 'PARTIALLY_FILLED', 2_000),
];
// The bot's 1,000 newest fills: the deal's last IN_POOL levels plus other deals.
const poolOrders: OrderData[] = [
  ...dealOrders.slice(DEAL_FILLS - IN_POOL, DEAL_FILLS),
  ...Array.from({ length: 1000 - IN_POOL }, (_, i) =>
    order(`O-${i}`, `deal-${i % 50}`, 'dealRegular', 'FILLED', 10_000 + i)
  ),
];

// Stable result objects per query (hooks memo on their identity).
const results = new Map<string, unknown>();
const ok = (data: unknown) => ({
  data: { status: 'OK', reason: null, data },
  isLoading: false,
  isError: false,
  error: null,
  refetch: async () => undefined,
});
vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: (
    key: string,
    gql: { variables?: { input?: { page?: number; status?: string } } }
  ) => {
    const input = gql.variables?.input ?? {};
    const k =
      key === 'getBotOrders' ? `${key}:${input.status}:${input.page}` : key;
    if (!results.has(k)) {
      if (key === 'getBotOrders') {
        const page = input.page ?? 0;
        const rows =
          input.status === 'FILLED'
            ? poolOrders.slice(page * 500, page * 500 + 500)
            : [];
        results.set(k, ok({ orders: rows, total: 33_412, page }));
      } else {
        results.set(k, ok(dealOrders));
      }
    }
    return results.get(k);
  },
}));

// The hooks page and debounce on timers; one `act` scope flushes React only at
// its end, so advance in short ticks to let each step commit.
const settle = async (ms = 1000) => {
  for (let t = 0; t < ms; t += 25) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
};

describe('Bot drawer deal view — full order history (spec 152)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    results.clear();
    useOrderStore.setState({
      orders: { new: {}, filled: {} },
      _hasHydrated: true,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (Harness: () => null) =>
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(Harness))
      );
    });

  it('§1/§2 the bot-level pool holds only the deal fills inside its 2×500 window', async () => {
    const sink: { seen: OrderData[] } = { seen: [] };
    const Harness = () => {
      const { orders } = useBotOrders(BOT, BotTypesEnum.dca, {
        status: 'FILLED',
        autoPaginate: true,
      });
      useEffect(() => {
        sink.seen = orders.filter((o) => o.dealId === DEAL);
      }, [orders]);
      return null;
    };
    mount(Harness);
    await settle();
    expect(sink.seen).toHaveLength(IN_POOL);
    expect(sink.seen.some((o) => o.typeOrder === 'dealStart')).toBe(false);
  });

  it('§3 the deal-scoped source lists every order of the deal, base order included', async () => {
    const sink = { tabs: splitDealOrders([]) };
    const Harness = () => {
      // The pool is mounted too, as in the drawer.
      useBotOrders(BOT, BotTypesEnum.dca, {
        status: 'FILLED',
        autoPaginate: true,
      });
      const { orders } = useDealOrders(BOT, DEAL, BotTypesEnum.dca);
      useEffect(() => {
        sink.tabs = splitDealOrders(orders, 'binance');
      }, [orders]);
      return null;
    };
    mount(Harness);
    await settle();
    expect(sink.tabs.completedOrders).toHaveLength(DEAL_FILLS);
    expect(
      sink.tabs.completedOrders.filter((o) => o.typeOrder === 'dealStart')
    ).toHaveLength(1);
    expect(sink.tabs.pendingOrders.map((o) => o.id)).toEqual(['D-TP-0']);

    // A live fill for the deal still arrives through the order store.
    act(() => {
      useOrderStore.getState().applyOrderEvents([
        {
          botId: BOT,
          data: order('D-RO-live', DEAL, 'dealRegular', 'FILLED', 3_000) as unknown as Record<
            string,
            unknown
          >,
        },
      ]);
    });
    await settle(50);
    expect(sink.tabs.completedOrders).toHaveLength(DEAL_FILLS + 1);
  });
});
