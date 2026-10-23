/**
 * Runner note: Vitest-only (renders in jsdom). Run from the parent:
 * `npx vitest run core/tests/tradingCosts.vitest.test.tsx`.
 *
 * Fees + slippage: the deal cost waterfall's geometry and rendering, the
 * per-order fee and slippage cells and the overlay that keeps them across
 * socket order replacements, and the period start the account-level cost
 * tiles ask for.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  buildCostWaterfall,
  costShareOfGross,
  formatCost,
  formatPnlBps,
} from '@/utils/tradingCosts';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { BotTypesEnum } from '@/types';
import { withFetchedOrderCosts } from '@/utils/orders/orderCosts';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { DealCostWaterfall } from '@/components/trades/DealCostsSection';
import { OrderFee, OrderSlippage } from '@/components/trades/OrderCostCells';
import { periodStart } from '@/components/widgets/dashboard/useAccountTradingCostStats';
import type { OrderData } from '@/types';

const span = (w: { min: number; max: number }, ...xs: number[]) =>
  xs.every((x) => x >= w.min && x <= w.max);

describe('buildCostWaterfall', () => {
  it('chains each cost from where the previous step ended', () => {
    const w = buildCostWaterfall({ gross: 100, fees: 10, slippage: 5, net: 85 });
    expect(w).not.toBeNull();
    const [gross, fees, slippage, net] = w!.steps;
    expect(gross).toMatchObject({ key: 'gross', from: 0, to: 100, value: 100 });
    expect(fees).toMatchObject({ key: 'fees', from: 100, to: 90, value: -10 });
    expect(slippage).toMatchObject({ from: 90, to: 85, value: -5 });
    expect(net).toMatchObject({ key: 'net', from: 0, to: 85, value: 85 });
    expect(span(w!, 0, 100, 85)).toBe(true);
    // Padded beyond the endpoints, and 0 is a tick.
    expect(w!.min).toBeLessThan(0);
    expect(w!.max).toBeGreaterThan(100);
    expect(w!.ticks).toContain(0);
  });

  it('keeps 0 and every endpoint in the domain when gross is a loss', () => {
    const w = buildCostWaterfall({ gross: -20, fees: 5, slippage: 2, net: -27 });
    const [, fees, slippage] = w!.steps;
    expect(fees).toMatchObject({ from: -20, to: -25 });
    expect(slippage).toMatchObject({ from: -25, to: -27 });
    expect(span(w!, 0, -20, -27)).toBe(true);
  });

  it('runs a price improvement back toward the gross (net > gross)', () => {
    const w = buildCostWaterfall({ gross: 100, fees: 10, slippage: -15, net: 105 });
    const slippage = w!.steps.find((s) => s.key === 'slippage')!;
    expect(slippage).toMatchObject({ from: 90, to: 105, value: 15 });
    expect(span(w!, 105)).toBe(true);
  });

  it('turns a positive gross into a negative net when costs exceed it', () => {
    const w = buildCostWaterfall({ gross: 4, fees: 3, slippage: 2, net: -1 });
    expect(w!.steps.at(-1)).toMatchObject({ from: 0, to: -1 });
    expect(span(w!, 0, 4, -1)).toBe(true);
  });

  it('derives gross from net + costs, and returns null with neither', () => {
    const w = buildCostWaterfall({ fees: 2, slippage: 1, net: 7 });
    expect(w!.steps[0]).toMatchObject({ key: 'gross', to: 10 });
    expect(buildCostWaterfall({ fees: 2, slippage: 1 })).toBeNull();
  });

  it('omits a step the backend did not send', () => {
    const w = buildCostWaterfall({ gross: 10, fees: 1, net: 9 });
    expect(w!.steps.map((s) => s.key)).toEqual(['gross', 'fees', 'net']);
  });
});

describe('costShareOfGross / formatCost', () => {
  it('is a share of a positive gross only', () => {
    expect(
      costShareOfGross({ feesQuote: 3, slippageQuote: 1, grossQuote: 40 })
    ).toBeCloseTo(10);
    expect(
      costShareOfGross({ feesQuote: 3, slippageQuote: 1, grossQuote: -5 })
    ).toBeUndefined();
  });

  it('shows a cost as its negative effect on P&L', () => {
    expect(formatCost(3.21, 'USDT')).toBe('-$3.21');
    expect(formatCost(-0.5, 'USDT')).toBe('+$0.50');
  });

  it('keeps two decimals for a currency quote, significant digits otherwise', () => {
    expect(formatCost(0.000032, 'USDT')).toBe('$0.00');
    expect(formatCost(0.000032, 'BTC')).toBe('-0.000032 BTC');
  });

  it('signs bps by their effect on P&L', () => {
    expect(formatPnlBps(4.94)).toBe('-4.9 bps');
    expect(formatPnlBps(-2)).toBe('+2.0 bps');
    expect(formatPnlBps(0.04)).toBe('0.0 bps');
    expect(formatPnlBps(-0.04)).toBe('0.0 bps');
  });
});

describe('withFetchedOrderCosts', () => {
  const order = (over: Partial<OrderData>): OrderData =>
    ({ clientOrderId: 'a', ...over }) as OrderData;

  it('lays fetched slippage back over a socket copy that lacks it', () => {
    const fetched = [
      order({
        clientOrderId: 'a',
        slippageBps: 12,
        slippageQuote: 0.4,
        slippageSource: 'recorded',
        refPrice: '100',
      }),
    ];
    const [merged] = withFetchedOrderCosts([order({ price: '101' })], fetched);
    expect(merged).toMatchObject({
      price: '101',
      slippageBps: 12,
      slippageSource: 'recorded',
    });
  });

  it('keeps a store copy that already carries the fields', () => {
    const own = order({ slippageSource: null, slippageBps: null });
    const fetched = [order({ slippageSource: 'recorded', slippageBps: 9 })];
    expect(withFetchedOrderCosts([own], fetched)[0]).toBe(own);
  });

  it('carries the fee with the slippage, null where the backend sent none', () => {
    const fetched = [
      order({ feeQuote: 0.12, feeEstimated: true, slippageSource: null }),
    ];
    const [merged] = withFetchedOrderCosts([order({})], fetched);
    expect(merged).toMatchObject({
      feeQuote: 0.12,
      feeEstimated: true,
      slippageBps: null,
      slippageSource: null,
    });
  });

  it('is a no-op against a backend without the fields', () => {
    const orders = [order({})];
    expect(withFetchedOrderCosts(orders, [order({})])).toBe(orders);
  });
});

describe('deal orders query', () => {
  const input = { id: 'b', dealId: 'd', all: true };

  it('selects fee + slippage only in the extended document', () => {
    for (const build of [dealQueries.getDealOrders, dealQueries.getComboDealOrders]) {
      const extended = build(input, true).query;
      for (const f of ['feeQuote', 'feeEstimated', 'slippageBps', 'slippageSource']) {
        expect(extended).toContain(f);
      }
      // The fallback an older backend is served with asks for none of them.
      expect(build(input).query).not.toMatch(/feeQuote|slippage/);
    }
  });

  it('does the same for the bot orders query (bot drawer deal view)', () => {
    const bot = { id: 'b', type: BotTypesEnum.dca };
    expect(botQueries.getBotOrders(bot, true).query).toMatch(
      /feeQuote[\s\S]*feeEstimated|feeEstimated[\s\S]*feeQuote/
    );
    expect(botQueries.getBotOrders(bot, true).query).toContain('slippageBps');
    expect(botQueries.getBotOrders(bot).query).not.toMatch(/feeQuote|slippage/);
  });
});

describe('periodStart', () => {
  // Thursday 2026-10-22 15:00 UTC.
  const now = new Date(Date.UTC(2026, 9, 22, 15, 0));

  it('is the start of the current day / week / month in the account zone', () => {
    expect(periodStart('Daily', 'UTC', now)).toBe(Date.UTC(2026, 9, 22));
    expect(periodStart('Weekly', 'UTC', now)).toBe(Date.UTC(2026, 9, 19));
    expect(periodStart('Monthly', 'UTC', now)).toBe(Date.UTC(2026, 9, 1));
    expect(periodStart('Total', 'UTC', now)).toBeUndefined();
  });

  it('follows the account zone, not UTC', () => {
    // 15:00 UTC is already the 23rd in Tokyo (UTC+9).
    expect(periodStart('Daily', 'Asia/Tokyo', new Date(Date.UTC(2026, 9, 22, 16)))).toBe(
      Date.UTC(2026, 9, 22, 15)
    );
  });
});

describe('OrderFee / OrderSlippage cells', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const show = (el: ReturnType<typeof createElement>) => {
    act(() => root.render(el));
    return container;
  };

  it('shows a known fee as a cost in the quote asset', () => {
    const c = show(
      createElement(OrderFee, { order: { quoteAsset: 'USDT', feeQuote: 0.42 } })
    );
    expect(c.textContent).toMatch(/^-.*0\.42/);
    expect(c.querySelector('.text-loss')).not.toBeNull();
    expect(c.querySelector('.opacity-50')).toBeNull();
  });

  it('dims an estimated fee', () => {
    const c = show(
      createElement(OrderFee, {
        order: { quoteAsset: 'USDT', feeQuote: 0.42, feeEstimated: true },
      })
    );
    expect(c.querySelector('.opacity-50')).not.toBeNull();
  });

  it('leaves the cell empty for an unknown fee, never 0', () => {
    expect(
      show(createElement(OrderFee, { order: { quoteAsset: 'USDT', feeQuote: null } }))
        .innerHTML
    ).toBe('');
    expect(
      show(createElement(OrderFee, { order: { quoteAsset: 'USDT' } })).innerHTML
    ).toBe('');
  });

  it('shows adverse slippage as a P&L cost on both lines; dims a reconstructed one', () => {
    const c = show(
      createElement(OrderSlippage, {
        order: {
          quoteAsset: 'USDT',
          slippageBps: 4.9,
          slippageQuote: 0.05,
          slippageSource: 'reconstructed',
        },
      })
    );
    expect(c.textContent).toContain('-4.9 bps');
    expect(c.textContent).toContain('-$0.05');
    expect(c.querySelectorAll('.text-loss')).toHaveLength(2);
    expect(c.querySelector('.text-profit')).toBeNull();
    expect(c.querySelector('.opacity-50')).not.toBeNull();
  });

  it('shows a price improvement as a gain on both lines', () => {
    const c = show(
      createElement(OrderSlippage, {
        order: {
          quoteAsset: 'USDT',
          slippageBps: -3.2,
          slippageQuote: -0.12,
          slippageSource: 'recorded',
        },
      })
    );
    expect(c.textContent).toContain('+3.2 bps');
    expect(c.textContent).toContain('+$0.12');
    expect(c.querySelectorAll('.text-profit')).toHaveLength(2);
    expect(c.querySelector('.opacity-50')).toBeNull();
  });

  it('shows values that round to zero unsigned and neutral', () => {
    const c = show(
      createElement(OrderSlippage, {
        order: {
          quoteAsset: 'USDT',
          slippageBps: 0.03,
          slippageQuote: 0.000032,
          slippageSource: 'recorded',
        },
      })
    );
    expect(c.textContent).toBe('0.0 bps$0.00');
    expect(c.querySelector('.text-loss, .text-profit')).toBeNull();
    const fee = show(
      createElement(OrderFee, { order: { quoteAsset: 'USDT', feeQuote: 0.001 } })
    );
    expect(fee.textContent).toBe('$0.00');
    expect(fee.querySelector('.text-loss')).toBeNull();
  });

  it('leaves the cell empty for a LIMIT order (null slippage)', () => {
    expect(
      show(
        createElement(OrderSlippage, {
          order: {
            quoteAsset: 'USDT',
            slippageBps: null,
            slippageQuote: null,
            slippageSource: null,
          },
        })
      ).innerHTML
    ).toBe('');
  });

  it('shows nothing on a projected (smart) level', () => {
    expect(
      show(
        createElement(OrderFee, {
          order: { quoteAsset: 'USDT', feeQuote: 1, __smart: true },
        })
      ).innerHTML
    ).toBe('');
  });
});

describe('DealCostWaterfall', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Parameters<typeof DealCostWaterfall>[0]) =>
    act(() => root.render(createElement(DealCostWaterfall, props)));

  it('renders Gross → Fees → Slippage → Net with signed values and a summary', () => {
    render({
      breakdown: {
        grossQuote: 2,
        feesQuote: 1.5,
        slippageQuote: 1,
        netQuote: -0.5,
        feesEstimated: false,
      },
      slippage: { quote: 1, bps: 8.4, orders: 3, reconstructed: false },
      quoteAsset: 'USDT',
    });
    const text = container.textContent ?? '';
    for (const label of ['Gross P&L', 'Fees', 'Slippage', 'Net P&L']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('USDT');
    expect(text).toMatch(/-8\.4 bps over 3 market orders/);
    // Costs (2.5) exceed the positive gross (2): the net went negative.
    expect(text).toMatch(/125\.0% of gross/);
    expect(container.querySelectorAll('.opacity-50')).toHaveLength(0);
  });

  it('dims an estimated step (fees estimated, slippage reconstructed)', () => {
    render({
      breakdown: {
        grossQuote: 10,
        feesQuote: 1,
        slippageQuote: 0.5,
        netQuote: 8.5,
        feesEstimated: true,
      },
      slippage: { quote: 0.5, reconstructed: true },
      quoteAsset: 'USDT',
    });
    // Bar + value for each of the two estimated steps.
    expect(container.querySelectorAll('.opacity-50').length).toBe(4);
  });

  it('hides every amount in privacy mode', () => {
    render({
      breakdown: { grossQuote: 10, feesQuote: 1, netQuote: 9 },
      slippage: null,
      quoteAsset: 'USDT',
      privacyMode: true,
    });
    const text = container.textContent ?? '';
    expect(text).toContain('***');
    expect(text).not.toMatch(/\d/);
  });

  it('renders nothing without a gross or net', () => {
    render({ breakdown: { feesQuote: 1 }, slippage: null, quoteAsset: 'USDT' });
    expect(container.innerHTML).toBe('');
  });
});
