/**
 * Runner note: renders the real dialog in jsdom and mocks modules, so it is a
 * Vitest file. Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/gridStartDialogCreatedBot.vitest.test.tsx
 *
 * Starting a grid from the post-create dialog opens the grid start dialog
 * while the form is still in create mode, where the form query has no `bot`.
 * The dialog read `bot.initialPrice` unguarded in its open effect, so the
 * page crashed the moment Start was pressed. It must render, price the grid
 * off the latest/start price, and still offer the buy-the-difference option
 * an existing bot gets.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { PAIR, SYMBOL, FORM, BALANCES } = vi.hoisted(() => {
  const PAIR = 'BTCUSDT';
  const SYMBOL = {
    pair: PAIR,
    exchange: 'binance',
    baseAsset: { name: 'BTC', minAmount: 0.00001, maxAmount: 1000, step: 0.00001 },
    quoteAsset: { name: 'USDT', minAmount: 1 },
    priceAssetPrecision: 2,
  };
  return {
    PAIR,
    SYMBOL,
    FORM: {} as { state: unknown; query: unknown },
    BALANCES: [
      // Some BTC, less than a 90–110 grid at 100 needs, and plenty of USDT:
      // the existing-bot path offers to buy the difference here.
      { asset: 'BTC', free: 1, locked: 0, exchangeUUID: 'ex-1' },
      { asset: 'USDT', free: 100000, locked: 0, exchangeUUID: 'ex-1' },
    ],
  };
});

// Stable references, as the real providers give: a fresh object per render
// would re-run the dialog's effects forever.
vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useTrackedBotFormState: () => FORM.state,
}));
// Create mode: the provider has no bot yet.
vi.mock('@/features/bots/widgets/BotForm/providers/BotFormQueryProvider', () => ({
  useBotFormQuery: () => FORM.query,
}));
vi.mock('@/helper/price', () => ({
  default: (cb: (r: { status: string; data: unknown[] }) => void) => {
    cb({ status: 'OK', data: [{ symbol: PAIR, exchange: 'binance', price: 100 }] });
    return () => undefined;
  },
}));
vi.mock('@/stores/live', () => ({
  useBalanceStore: (selector: (s: { balances: unknown[] }) => unknown) =>
    selector({ balances: BALANCES }),
}));
vi.mock('@/hooks/bots/dca/usePooledMarginUsd', () => ({
  poolCoversQuote: () => false,
  usePooledMarginUsd: () => ({ pooledUsd: null }),
}));

import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { GridStartBotDialog } from '@/features/bots/shared/runtime/dialogs/GridStartBotDialog';

FORM.state = {
  formData: {
    pair: [PAIR],
    pairMetadata: { [PAIR]: SYMBOL },
    exchangeUUID: 'ex-1',
    grid: {
      ...GRID_FORM_DEFAULTS,
      topPrice: 110,
      lowPrice: 90,
      levels: 10,
      budget: 1000,
    },
    userFee: { makerCommission: 0, takerCommission: 0 },
  },
  errors: {},
};
FORM.query = { bot: null, currentExchange: { provider: 'binance' } };

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const renderDialog = (props: Record<string, unknown> = {}) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(GridStartBotDialog, {
        open: true,
        onOpenChange: () => undefined,
        onConfirm: () => undefined,
        ...props,
      })
    );
  });
};

describe('GridStartBotDialog for a bot just created from the form', () => {
  it('opens with no bot in the form query instead of crashing', () => {
    expect(() => renderDialog({ botCreated: true })).not.toThrow();
    expect(document.body.textContent).toContain('Start bot confirmation');
  });

  it('prices the grid off the latest price and offers to buy the difference', () => {
    renderDialog({ botCreated: true });
    expect(document.body.textContent).toMatch(/Buy difference \d/);
  });
});
