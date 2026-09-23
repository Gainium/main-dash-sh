/**
 * Runner note: `.vitest.test.tsx` (not `.unit.test.ts`) because this renders the
 * real widget in jsdom and mocks modules — Playwright's core suite never
 * collects it. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/dealHistoryWidgetAdjustFunds.vitest.test.tsx`.
 * (`NODE_ENV=development` is required on the VPS, where the shell exports
 * `NODE_ENV=production`: Vite then resolves React's production build, which has
 * no `act`, and every test dies with `act is not a function`.)
 *
 * Spec 047. Bug #910 — the "Deal History" widget's per-row Add funds / Reduce
 * funds / Edit buttons were dead UI for every bot type.
 *
 * `handleDealAction` implemented only `close` and `cancel`; every other type
 * fell into an `else` whose whole body was `setActionDialog({open: true, …})`.
 * The confirmation dialog's confirm button then called that SAME function with
 * the SAME type, so it re-entered the same `else` and re-set the identical
 * state — a self-loop. The dialog stayed open and no request was ever made.
 * The file imported no funds mutation at all.
 *
 * The observation point is the `useAdjustFunds` mutation, because placing the
 * order IS the behaviour under test: a dialog that closes but sends nothing
 * would be the same defect with better manners.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// OBSERVATION POINT — the adjust-funds mutation. `mutate` calls are captured so
// the test can assert both THAT a request is made and WHAT it carries.
// `vi.hoisted` because vi.mock factories are hoisted above the imports.
// ---------------------------------------------------------------------------
const captured = vi.hoisted(() => ({
  adjust: [] as Array<Record<string, unknown>>,
  closed: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/hooks/useDealActions', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useDealActions: () => ({
      closeDeal: vi.fn(async (dealId: string, botId: string, type: string) => {
        captured.closed.push({ dealId, botId, type });
      }),
      isLoading: false,
      error: null,
    }),
    useAdjustFunds: () => ({
      mutate: (input: Record<string, unknown>) => {
        captured.adjust.push(input);
      },
      isPending: false,
    }),
    useRestoreDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

const OPEN_DEAL = {
  _id: 'deal-1',
  botId: 'bot-1',
  status: 'open',
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  strategy: 'LONG',
  exchange: 'binance',
  exchangeUUID: 'acct-1',
  settings: { futures: false, coinm: false },
  currentBalances: { base: 0.5 },
  initialBalances: { base: 0.5 },
  usage: { current: { base: 0.5, quote: 30000 }, max: { quote: 30000 } },
  avgPrice: 60000,
  lastPrice: 60000,
  initialPrice: 60000,
  profit: { totalUsd: 12.34 },
  createTime: 1758500000000,
  levels: { complete: 1, all: 3 },
};

vi.mock('../src/hooks/useBotSpecificDeals', () => ({
  useBotSpecificDeals: ({ status }: { status: string }) => ({
    deals: status === 'open' ? [OPEN_DEAL] : [],
    total: status === 'open' ? 1 : 0,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    data: null,
    refetch: vi.fn(),
    fetchAllDeals: vi.fn(),
  }),
}));

vi.mock('../src/hooks/useDcaBots', () => ({
  useDcaBots: () => ({
    bots: [{ _id: 'bot-1', name: 'Test bot', settings: { pair: ['BTCUSDT'] } }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../src/hooks/useGridBots', () => ({
  useGridBots: () => ({ bots: [], isLoading: false, error: null }),
}));

vi.mock('../src/hooks/useBotTransactions', () => ({
  useBotTransactions: () => ({
    transactions: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../src/contexts/bots/grid/GridPageProvider', () => ({
  useOptionalGridPageContext: () => undefined,
}));

import EditDealHistory from '../src/components/widgets/bots/EditDealHistory';
import { BotTypesEnum, CloseDCATypeEnum } from '../src/types';

let container: HTMLDivElement;
let root: Root;

const mount = async (botType: BotTypesEnum) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          MemoryRouter,
          null,
          createElement(EditDealHistory, {
            widgetId: 'w1',
            botId: 'bot-1',
            botType,
          })
        )
      )
    );
  });
};

const byTitle = (title: string) =>
  Array.from(container.querySelectorAll<HTMLElement>(`[title="${title}"]`));

// The dialog is a Radix portal, so it lands on document.body rather than
// inside the widget's own container.
const buttonByText = (text: string) =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter(
    (b) => b.textContent?.trim() === text
  );

const click = async (el: HTMLElement | undefined) => {
  if (!el) {
    throw new Error('nothing to click');
  }
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

/** The one enabled button carrying this exact label. */
const enabledButton = (text: string): HTMLButtonElement => {
  const matches = buttonByText(text).filter((b) => !b.disabled);
  expect(matches).toHaveLength(1);
  const [only] = matches;
  if (!only) {
    throw new Error(`no enabled "${text}" button`);
  }
  return only;
};

/**
 * Type into a React-controlled input: assigning `.value` directly is swallowed
 * because React's own value tracker sees no change, so go through the native
 * setter first.
 */
const typeAmount = async (value: string) => {
  // The amount field is the dialog's first input. It is a `BalanceInput` on the
  // add path, which does not forward the `adjust-funds-amount` id, so address it
  // by position within the dialog rather than by id.
  const dialog = document.body.querySelector('[role="dialog"]');
  if (!dialog) {
    throw new Error('the funds dialog is not open');
  }
  const input = dialog.querySelector<HTMLInputElement>('input');
  if (!input) {
    throw new Error('the funds dialog has no amount field');
  }
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeAll(() => {
  // jsdom has neither; the widget's Tabs measure with a ResizeObserver and the
  // dialog primitives read matchMedia.
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

beforeEach(() => {
  captured.adjust.length = 0;
  captured.closed.length = 0;
});

// Unmount between tests so a dialog left open by one cannot be found by the
// next one's document-wide button lookup.
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('Deal History widget — per-row deal actions', () => {
  // §3.1 — the defect. Open the funds flow from the row, confirm it, and a
  // request must actually be made. Before the fix nothing was ever sent.
  it('places an add-funds request when the row button is confirmed', async () => {
    await mount(BotTypesEnum.dca);

    const addButtons = byTitle('Add funds');
    expect(addButtons.length).toBe(1);

    await click(addButtons[0]);

    // The real AdjustFundsDialog is now mounted; fill it in and confirm.
    await typeAmount('25');
    await click(enabledButton('Add funds'));

    expect(captured.adjust.length).toBe(1);
    expect(captured.adjust[0]).toMatchObject({
      dealId: 'deal-1',
      botId: 'bot-1',
      mode: 'add',
    });
    expect(
      (captured.adjust[0] as { settings: { qty: string } }).settings.qty
    ).toBe('25');
  });

  // §3.2 — the reduce side of the same flow.
  it('places a reduce-funds request when the row button is confirmed', async () => {
    await mount(BotTypesEnum.dca);

    const reduceButtons = byTitle('Reduce funds');
    expect(reduceButtons.length).toBe(1);
    await click(reduceButtons[0]);

    await typeAmount('10');
    await click(enabledButton('Reduce funds'));

    expect(captured.adjust.length).toBe(1);
    expect(captured.adjust[0]).toMatchObject({
      dealId: 'deal-1',
      botId: 'bot-1',
      mode: 'reduce',
    });
  });

  // §3.3 — Edit had no flow behind it anywhere in the product, so the control
  // must be gone rather than opening a dialog that cannot do anything.
  it('offers no Edit button', async () => {
    await mount(BotTypesEnum.dca);
    expect(byTitle('Edit deal').length).toBe(0);
  });

  // §5.2 — the combo gate (#909's rule): addDealFunds/reduceDealFunds resolve
  // the bot out of the DCA bots only, so on a combo bot the control can only
  // fail. The widget's deal rows carry no bot type of their own — `deal.type`
  // is 'active'/'completed' here — so the gate must read the WIDGET's botType.
  it('offers no funds buttons on a combo bot', async () => {
    await mount(BotTypesEnum.combo);
    expect(byTitle('Add funds').length).toBe(0);
    expect(byTitle('Reduce funds').length).toBe(0);
  });

  // Spec 048 §5.1/§5.2 — bug #911. Cancel used to fire `closeDeal` on the
  // first click, with no confirmation of any kind. It must now ask first, with
  // the copy the widget's author wrote for it, and cancel only on confirm.
  it('asks before cancelling a deal, and cancels only on confirm', async () => {
    await mount(BotTypesEnum.dca);

    const cancelButtons = byTitle('Cancel deal');
    expect(cancelButtons.length).toBe(1);
    await click(cancelButtons[0]);

    expect(captured.closed.length).toBe(0);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      'Cancel this deal? This action cannot be undone.'
    );

    await click(enabledButton('Cancel Deal'));

    expect(captured.closed).toEqual([
      { dealId: 'deal-1', botId: 'bot-1', type: CloseDCATypeEnum.cancel },
    ]);
  });

  // Spec 048 §5.3 — backing out must send nothing.
  it('sends nothing when the cancel confirmation is dismissed', async () => {
    await mount(BotTypesEnum.dca);

    await click(byTitle('Cancel deal')[0]);
    await click(enabledButton('Keep Deal'));

    expect(captured.closed.length).toBe(0);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  // Spec 048 §5.4/§5.5 — Close opens the shared close-options dialog, and its
  // default still sends exactly what the one-click button used to: a market
  // close.
  it('asks before closing a deal, and closes at market by default', async () => {
    await mount(BotTypesEnum.dca);

    const closeButtons = byTitle('Close deal');
    expect(closeButtons.length).toBe(1);
    await click(closeButtons[0]);

    expect(captured.closed.length).toBe(0);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Close deal options');

    await click(enabledButton('Close deal'));

    expect(captured.closed).toEqual([
      {
        dealId: 'deal-1',
        botId: 'bot-1',
        type: CloseDCATypeEnum.closeByMarket,
      },
    ]);
  });
});
