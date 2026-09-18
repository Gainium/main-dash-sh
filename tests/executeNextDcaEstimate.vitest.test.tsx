/**
 * Spec `021` (`main-dash-redesign` `specs/021.…`) — the "Execute next DCA"
 * confirmation must quote the order the ENGINE will send.
 *
 * The client ladder sizes a quote-denominated level against its own rung price,
 * chained off `deal.initialPrice`. `executeNextDcaLevel` regenerates that ladder
 * with the market price as the sizing argument, so the quantity floats and the
 * quote spend stays the level's budget. Rendering the ladder quantity and then
 * pricing it at market counted the move twice and over-quoted the cost.
 *
 * `executeNextDcaLadder.unit.test.ts` pins the arithmetic; these pin what the
 * dialog actually renders, including the branch the arithmetic does not touch —
 * a percentage-condition deal, whose "level after this" row keeps quoting a real
 * resting order at its own price.
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useDealOrders', () => ({
  // Nothing resting: the dialog falls back to the projected ladder, which is
  // the state every indicator-condition deal is permanently in.
  useDealOrders: () => ({ orders: [] }),
}));

vi.mock('@/helper/price', () => ({
  // The dialog only subscribes when the call site passes no price; these cases
  // pass one, so the subscription never runs.
  default: () => () => {},
}));

vi.mock('@/stores/live', () => ({
  useDcaBotsStore: (selector: (s: unknown) => unknown) =>
    selector({ bots: { bot1: { exchangeUUID: 'uuid', settings: {} } } }),
  useDealStore: (selector: (s: unknown) => unknown) =>
    selector({
      deals: {
        bot1: {
          deal1: {
            _id: 'deal1',
            initialPrice: 59713.26,
            symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
            pendingAddFunds: [],
          },
        },
      },
    }),
}));

const smartOrders = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/hooks/bots/dca/useDealSmartOrders', () => ({
  useDealSmartOrders: () => smartOrders.value,
}));

import { ExecuteNextDcaDialog } from '@/features/bots/shared/runtime/dialogs/ExecuteNextDcaDialog';
import { DCAOrderTypeEnum, OrderSizeTypeEnum } from '@/types';

/** Level 4 and 5 of the reporter's shape: a 300-quote budget per level. */
const LADDER = [
  { type: DCAOrderTypeEnum.dca, price: 60095.4, qty: 300 / 60095.4 },
  { type: DCAOrderTypeEnum.dca, price: 60558.4, qty: 300 / 60558.4 },
  { type: DCAOrderTypeEnum.dca, price: 61121.6, qty: 300 / 61121.6 },
  { type: DCAOrderTypeEnum.dca, price: 61799.0, qty: 300 / 61799.0 },
  { type: DCAOrderTypeEnum.dca, price: 62620.8, qty: 300 / 62620.8 },
];

const MARKET = 80617;

const renderDialog = (settings: Record<string, unknown>) => {
  smartOrders.value = {
    smartOrders: [],
    smartChartOrders: [],
    strategy: 'SHORT',
    fullLadder: LADDER,
    settings,
  };
  render(
    <ExecuteNextDcaDialog
      open
      onOpenChange={() => {}}
      trade={{
        id: 'deal1',
        botId: 'bot1',
        symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
        strategy: 'short',
        levels: { complete: 4, all: 6 },
      }}
      currentPrice={MARKET}
      onConfirm={() => {}}
    />
  );
};

/** The figure rendered beside a row label, e.g. "Estimated cost". */
const rowValue = (label: string) => {
  const cell = screen.getByText(label);
  return (cell.parentElement?.textContent ?? '').replace(label, '').trim();
};

afterEach(() => {
  cleanup();
  smartOrders.value = null;
});

describe('spec 021 — Execute next DCA quotes the order the engine will send', () => {
  it('costs an indicator-condition quote level at its budget, not at the price move', () => {
    renderDialog({
      dcaCondition: 'indicators',
      orderSizeType: OrderSizeTypeEnum.quote,
    });

    // 300 / 80,617 — what `createInitialDealOrders` produces when handed the
    // market price as its sizing argument. The ladder's own 4.85e-3 BTC would
    // have cost ~391.
    expect(rowValue('Amount')).toBe('3.72e-3 BTC');
    expect(rowValue('Estimated cost')).toBe('300 USDT');
  });

  it('states the level after it as the budget it will still spend', () => {
    renderDialog({
      dcaCondition: 'indicators',
      orderSizeType: OrderSizeTypeEnum.quote,
    });

    // No "@ <price>": an indicator level fires on a signal, and the dialog
    // hides ladder prices everywhere else for the same reason.
    const after = rowValue('Level 5 after this');
    expect(after).toContain('USDT');
    expect(after).toContain('unchanged');
    expect(after).not.toContain('@');
  });

  it('leaves a base-denominated level at its configured quantity', () => {
    renderDialog({
      dcaCondition: 'indicators',
      orderSizeType: OrderSizeTypeEnum.base,
    });

    // `base` is a fixed quantity — the engine does not re-size it, so neither
    // may the dialog. This is the ladder's own qty for level 4.
    expect(rowValue('Amount')).toBe('4.85e-3 BTC');
  });

  it('keeps quoting a percentage-condition level at its own ladder price', () => {
    renderDialog({
      dcaCondition: 'percentage',
      orderSizeType: OrderSizeTypeEnum.quote,
    });

    // Those levels rest on the venue, so the row still names the price the user
    // can see there — only the level being executed now is re-sized.
    expect(rowValue('Ladder price')).toBe('61.8K');
    expect(rowValue('Level 5 after this')).toContain('@');
    expect(rowValue('Estimated cost')).toBe('300 USDT');
  });
});
