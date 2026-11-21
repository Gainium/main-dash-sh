/**
 * "Execute next DCA" on a deal that has taken Add Funds.
 *
 * An Add Funds fill increments `levels.complete` and grows `levels.all`, but it
 * is not one of the bot's configured DCA levels. The engine resolves the level
 * it executes with `nextLadderLevel` (complete minus the funds entries) and
 * refuses a request whose `expectedLevel` differs. So the dialog has to name
 * and send that same level, and count its "levels used" the same way.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useDealOrders', () => ({
  // Nothing resting: the dialog falls back to the projected ladder.
  useDealOrders: () => ({ orders: [] }),
}));

vi.mock('@/helper/price', () => ({ default: () => () => {} }));

const rawDeal = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/stores/live', () => ({
  useDcaBotsStore: (selector: (s: unknown) => unknown) =>
    selector({ bots: { bot1: { exchangeUUID: 'uuid', settings: {} } } }),
  useDealStore: (selector: (s: unknown) => unknown) =>
    selector({ deals: { bot1: { deal1: rawDeal.value } } }),
}));

const smartOrders = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/hooks/bots/dca/useDealSmartOrders', () => ({
  useDealSmartOrders: () => smartOrders.value,
}));

import { ExecuteNextDcaDialog } from '@/features/bots/shared/runtime/dialogs/ExecuteNextDcaDialog';
import { DCAOrderTypeEnum, OrderSizeTypeEnum } from '@/types';

/** A 43-level ladder; rung N (1-based) rests at price 1000 - N. */
const ladder = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: DCAOrderTypeEnum.dca,
    price: 1000 - (i + 1),
    qty: 1,
  }));

const renderDialog = ({
  levels,
  funds,
  ordersCount,
  rungs,
}: {
  levels: { complete: number; all: number };
  funds: { price: number; qty: number }[];
  ordersCount: number;
  rungs: number;
}) => {
  rawDeal.value = {
    _id: 'deal1',
    initialPrice: 1000,
    symbol: { symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT' },
    pendingAddFunds: [],
    levels,
    funds,
    settings: { dcaCondition: 'percentage', ordersCount },
  };
  smartOrders.value = {
    smartOrders: [],
    smartChartOrders: [],
    strategy: 'LONG',
    fullLadder: ladder(rungs),
    settings: {
      dcaCondition: 'percentage',
      orderSizeType: OrderSizeTypeEnum.base,
    },
  };
  const onConfirm = vi.fn();
  render(
    <ExecuteNextDcaDialog
      open
      onOpenChange={() => {}}
      trade={{
        id: 'deal1',
        botId: 'bot1',
        symbol: { symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT' },
        strategy: 'long',
        levels,
      }}
      currentPrice={900}
      onConfirm={onConfirm}
    />
  );
  return onConfirm;
};

const rowValue = (label: string) => {
  const cell = screen.getByText(label);
  return (cell.parentElement?.textContent ?? '').replace(label, '').trim();
};

afterEach(() => {
  cleanup();
  rawDeal.value = null;
  smartOrders.value = null;
});

describe('spec 158 — Execute next DCA does not count Add Funds as a DCA level', () => {
  it('§5.1 names and sends the level the engine resolves', () => {
    // 42 ladder fills + base + one Add Funds fill; the 43rd level rests.
    const onConfirm = renderDialog({
      levels: { complete: 44, all: 45 },
      funds: [{ price: 0.0005929, qty: 42166 }],
      ordersCount: 43,
      rungs: 43,
    });

    expect(rowValue('DCA level').replace(/\s+/g, ' ')).toBe('42 / 43→43 / 43');
    const button = screen.getByRole('button', { name: 'Execute level 43' });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith(43);
  });

  it('§5.3 quotes the next CONFIGURED rung from the ladder', () => {
    renderDialog({
      levels: { complete: 44, all: 45 },
      funds: [{ price: 0.0005929, qty: 42166 }],
      ordersCount: 43,
      rungs: 43,
    });

    // Rung 43 rests at 1000 - 43.
    expect(rowValue('Ladder price')).toBe('957');
  });

  it('§5.2 a deal without Add Funds keeps the levels arithmetic', () => {
    const onConfirm = renderDialog({
      levels: { complete: 4, all: 6 },
      funds: [],
      ordersCount: 5,
      rungs: 5,
    });

    expect(rowValue('DCA level').replace(/\s+/g, ' ')).toBe('3 / 5→4 / 5');
    expect(rowValue('Ladder price')).toBe('996');
    fireEvent.click(screen.getByRole('button', { name: 'Execute level 4' }));
    expect(onConfirm).toHaveBeenCalledWith(4);
  });
});
