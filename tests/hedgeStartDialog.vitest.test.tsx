/**
 * Runner note: `.vitest.test.tsx` because it renders a hook / dialog and mocks
 * modules. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgeStartDialog.vitest.test.tsx`.
 *
 * Hedge start on spot (main-app spec 044 phase 3):
 *  - routing: Start on a spot hedge opens the hedge start dialog and its
 *    confirm sends `hedgeConfig`; a futures hedge keeps the confirmation modal;
 *  - inputs: a leg's preview input is the sum of the example orders the bot
 *    form renders for it;
 *  - the dialog: preview per leg, a refused leg blocks Start, and an API
 *    without `previewHedgeFunding` still starts with the chosen actions.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ mutation: string; type?: string; input: Record<string, unknown> }>,
  requests: [] as Array<{ query: string; variables: Record<string, unknown> }>,
  respond: (() => ({})) as (variables: Record<string, unknown>) => unknown,
}));

vi.mock('../src/hooks/useBotMutations', () => {
  const mutation = (name: string, type?: string) => ({
    mutate: (input: Record<string, unknown>, options?: { onSuccess?: () => void }) => {
      captured.calls.push({ mutation: name, ...(type ? { type } : {}), input });
      options?.onSuccess?.();
    },
    mutateAsync: async (input: Record<string, unknown>) => {
      captured.calls.push({ mutation: name, input });
    },
    isPending: false,
  });
  return {
    useBotStatusToggle: (type: string) => mutation('changeStatus', type),
    useBotRestart: () => mutation('restart'),
    useBotDelete: () => mutation('delete'),
    useBotArchive: () => mutation('archive'),
  };
});

vi.mock('../src/hooks/usePaperContext', () => ({
  usePaperContext: () => ({ setLiveTrading: vi.fn() }),
}));

vi.mock('../src/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../src/hooks/useSinglePosition', () => ({
  useSinglePositionClient: () => ({
    enabled: true,
    paperContext: true,
    make: () => ({
      request: async (query: string, variables: Record<string, unknown>) => {
        captured.requests.push({ query, variables });
        return captured.respond(variables);
      },
    }),
  }),
}));

vi.mock('../src/helper/price', () => {
  const prices = [{ symbol: 'BTCUSDT', exchange: 'binance', price: 100 }];
  return {
    default: (cb: (r: { data: unknown[] }) => void) => {
      cb({ data: prices });
      return () => undefined;
    },
    getLocalPrices: () => prices,
    getPricesFetchedAt: () => Date.now(),
  };
});

import { useBotActions } from '../src/hooks/useBotActions';
import { useBulkBotRunner } from '../src/hooks/useBulkBotRunner';
import { toast } from '../src/lib/toast';
import type { BotRef } from '../src/features/bots/actions/botActions';
import { toBotRef } from '../src/features/bots/actions/botRef';
import { HedgeStartDialog } from '../src/features/bots/shared/runtime/dialogs/HedgeStartDialog';
import { computeHedgeLegTotals } from '../src/hooks/useHedgeStartFunding';
import { hedgeStartLegs } from '../src/lib/baseFunding/hedgeFunding';
import {
  fetchHedgeFundingPreview,
  resetHedgeFundingFieldSupport,
  type PreviewHedgeFundingInput,
} from '../src/lib/baseFunding/hedgeFundingApi';
import {
  createDCAOrders,
  defaultContext,
} from '../src/utils/bots/dca/example-orders-core';
import { ActionsEnum, BotTypesEnum, DCAOrderTypeEnum, StrategyEnum } from '../src/types';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
  resetHedgeFundingFieldSupport();
  vi.mocked(toast.info).mockClear();
  captured.calls = [];
  captured.requests = [];
  captured.respond = () => ({});
});

const settings = (strategy: StrategyEnum) => ({
  strategy,
  useDca: true,
  baseOrderSize: '1',
  orderSize: '1',
  orderSizeType: 'base',
  ordersCount: 2,
  activeOrdersCount: 2,
  step: '1',
  stepScale: '1',
  volumeScale: '1',
  tpPerc: '1',
  slPerc: '1',
  useTp: true,
  useSl: false,
  dcaCondition: 'percentage',
  startOrderType: 'market',
});

const leg = (strategy: StrategyEnum, exchange: string) => ({
  _id: `leg-${strategy}`,
  exchange,
  exchangeUUID: 'acc-1',
  settings: settings(strategy),
  symbol: [
    { key: 'BTCUSDT', value: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' } },
  ],
});

const hedge = (exchange: string, status = 'closed') => ({
  _id: 'hedge-1',
  status,
  bots: [leg(StrategyEnum.long, exchange), leg(StrategyEnum.short, exchange)],
});

const routerWrapper = ({ children }: { children: ReactNode }) =>
  createElement(MemoryRouter, null, children);

const statusCalls = () => captured.calls.filter((c) => c.mutation === 'changeStatus');

describe('hedge start routing', () => {
  it('spot hedge: Start opens the hedge start dialog, confirm sends hedgeConfig', () => {
    const { result } = renderHook(
      () => useBotActions(toBotRef(hedge('binance'), 'hedgeDca')),
      { wrapper: routerWrapper }
    );
    act(() => result.current.run('start'));
    expect(result.current.modalProps.statusModalOpen).toBe(false);
    expect(result.current.modalProps.hedgeStart?.open).toBe(true);
    expect(statusCalls()).toEqual([]);

    const hedgeConfig = {
      [StrategyEnum.long]: ActionsEnum.sellDiff,
      [StrategyEnum.short]: ActionsEnum.buyDiff,
    };
    act(() => result.current.modalProps.hedgeStart?.onConfirm(hedgeConfig));
    expect(statusCalls()).toEqual([
      {
        mutation: 'changeStatus',
        type: BotTypesEnum.hedgeDca,
        input: { id: 'hedge-1', status: 'open', hedgeConfig },
      },
    ]);
    expect(result.current.modalProps.hedgeStart?.open).toBe(false);
  });

  it('futures hedge: Start keeps the confirmation modal and sends no hedgeConfig', () => {
    const { result } = renderHook(
      () => useBotActions(toBotRef(hedge('binanceUsdm'), 'hedgeCombo')),
      { wrapper: routerWrapper }
    );
    act(() => result.current.run('start'));
    expect(result.current.modalProps.statusModalOpen).toBe(true);
    expect(result.current.modalProps.hedgeStart).toBeUndefined();
    act(() => result.current.modalProps.onConfirmStatusChange());
    expect(statusCalls()).toEqual([
      {
        mutation: 'changeStatus',
        type: BotTypesEnum.hedgeCombo,
        input: { id: 'hedge-1', status: 'open' },
      },
    ]);
  });

  it('stopping a running spot hedge still goes through the confirmation modal', () => {
    const { result } = renderHook(
      () => useBotActions(toBotRef(hedge('binance', 'open'), 'hedgeDca')),
      { wrapper: routerWrapper }
    );
    act(() => result.current.run('stop'));
    expect(result.current.modalProps.statusModalOpen).toBe(true);
    expect(result.current.modalProps.hedgeStart?.open).toBe(false);
  });
});

describe('hedge leg preview inputs', () => {
  it('sums the example orders the bot form renders for the leg', async () => {
    const [short] = hedgeStartLegs({ bots: [leg(StrategyEnum.short, 'binance')] });
    const totals = await computeHedgeLegTotals(short, false, 100);
    expect(totals).not.toBeNull();

    // The same generator, called directly: totals are its BO / DCA rows.
    const orders = await createDCAOrders(
      {},
      {
        ...defaultContext,
        settings: short.settings as never,
        symbol: {
          pair: 'BTCUSDT',
          exchange: 'binance',
          priceAssetPrecision: 8,
          baseAsset: { name: 'BTC', step: 1e-8, minAmount: 0, maxAmount: 0 },
          quoteAsset: { name: 'USDT', minAmount: 0 },
          maxOrders: 200,
        } as never,
        usdPrice: 1,
        inputLatestPrice: 100,
      }
    );
    const dca = orders.filter((o) => o.type === DCAOrderTypeEnum.dca);
    const bo = orders.filter((o) => o.type === DCAOrderTypeEnum.bo);
    expect(dca.length).toBe(2);
    expect(totals?.baseOrderQty).toBeCloseTo(bo.reduce((s, o) => s + o.qty, 0), 10);
    expect(totals?.safetyQty).toBeCloseTo(dca.reduce((s, o) => s + o.qty, 0), 10);
    expect(totals?.safetyQuote).toBeCloseTo(
      dca.reduce((s, o) => s + o.qty * o.price, 0),
      8
    );
    expect(totals?.safetyQty).toBeCloseTo(2, 8);
  });
});

const renderDialog = (onConfirm = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HedgeStartDialog
        open
        onOpenChange={() => undefined}
        botName="Hedge one"
        combo={false}
        hedge={hedge('binance')}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>
  );
  return onConfirm;
};

const startButton = () => screen.getByRole('button', { name: 'Start' });

describe('hedge start dialog', () => {
  it('asks for both legs jointly and shows each leg plan', async () => {
    captured.respond = () => ({
      previewHedgeFunding: {
        status: 'OK',
        data: {
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          freeBase: 0,
          freeQuote: 1000,
          reservedQuote: 0,
          reservedBase: 0,
          legs: [
            {
              side: 'SHORT',
              action: 'buyDiff',
              kind: 'fund',
              tradeSide: 'BUY',
              tradeBaseQty: 2,
              tradeQuote: 200,
              required: 2,
              held: 0,
              needAsset: 'BTC',
              reservedForEntry: 100,
            },
            { side: 'LONG', action: 'sellDiff', kind: 'none', required: 300, held: 1000, needAsset: 'USDT' },
          ],
        },
      },
    });
    const onConfirm = renderDialog();
    await screen.findByText('Bot buys at market', undefined, { timeout: 3000 });
    const sent = captured.requests.at(-1)?.variables as {
      input: { pair: string; exchangeUUID: string; price: number; legs: Array<Record<string, unknown>> };
    };
    expect(sent.input).toMatchObject({ pair: 'BTCUSDT', exchangeUUID: 'acc-1', price: 100 });
    expect(sent.input.legs.map((l) => [l.side, l.action, l.useDca])).toEqual([
      [StrategyEnum.long, ActionsEnum.sellDiff, true],
      [StrategyEnum.short, ActionsEnum.buyDiff, true],
    ]);
    expect(sent.input.legs[1]).toMatchObject({ baseOrderQty: 1 });
    expect(screen.getByText('Reserved for entry')).toBeTruthy();
    expect(screen.getByText('Held used')).toBeTruthy();

    await waitFor(() => expect((startButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(startButton());
    expect(onConfirm).toHaveBeenCalledWith({
      [StrategyEnum.long]: ActionsEnum.sellDiff,
      [StrategyEnum.short]: ActionsEnum.buyDiff,
    });
  });

  it('a refused leg shows why and blocks Start', async () => {
    captured.respond = () => ({
      previewHedgeFunding: {
        status: 'OK',
        data: {
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          freeBase: 0,
          freeQuote: 10,
          reservedQuote: 0,
          reservedBase: 0,
          legs: [
            { side: 'SHORT', action: 'buyDiff', kind: 'refuse', message: 'Not enough USDT to buy 2 BTC' },
            { side: 'LONG', action: 'sellDiff', kind: 'none' },
          ],
        },
      },
    });
    renderDialog();
    await screen.findByText('Not enough USDT to buy 2 BTC', undefined, { timeout: 3000 });
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('an API without previewHedgeFunding: no preview, still starts with the chosen actions', async () => {
    captured.respond = () => {
      throw new Error('Cannot query field "previewHedgeFunding" on type "Query".');
    };
    const onConfirm = renderDialog();
    await waitFor(() => expect(captured.requests.length).toBeGreaterThan(0), { timeout: 3000 });
    await waitFor(() => expect((startButton() as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText('Bot buys at market')).toBeNull();
    fireEvent.click(startButton());
    expect(onConfirm).toHaveBeenCalledWith({
      [StrategyEnum.long]: ActionsEnum.sellDiff,
      [StrategyEnum.short]: ActionsEnum.buyDiff,
    });
  });
});

describe('hedge start dialog — fix round 1', () => {
  it('a NOTOK preview keeps Start disabled and says why', async () => {
    captured.respond = () => ({
      previewHedgeFunding: { status: 'NOTOK', reason: 'Exchange not found', data: null },
    });
    const onConfirm = renderDialog();
    await screen.findByText('Exchange not found', undefined, { timeout: 3000 });
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(startButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the pending state until the preview has loaded', async () => {
    let release: (v: unknown) => void = () => undefined;
    captured.respond = () => new Promise((resolve) => (release = resolve));
    renderDialog();
    expect(screen.getByTestId(`hedge-start-pending-${StrategyEnum.long}`)).toBeTruthy();
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(captured.requests.length).toBeGreaterThan(0), { timeout: 3000 });
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
    release({
      previewHedgeFunding: {
        status: 'OK',
        data: {
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          freeBase: 10,
          freeQuote: 1000,
          reservedQuote: 0,
          reservedBase: 0,
          legs: [
            { side: 'SHORT', action: 'buyDiff', kind: 'none' },
            { side: 'LONG', action: 'sellDiff', kind: 'none' },
          ],
        },
      },
    });
    await waitFor(() => expect((startButton() as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId(`hedge-start-pending-${StrategyEnum.long}`)).toBeNull();
  });
});

describe('bulk start skips spot hedge bots', () => {
  const runBulk = (bots: BotRef[]) => {
    const { result } = renderHook(() => useBulkBotRunner<BotRef>((b) => b), {
      wrapper: routerWrapper,
    });
    const start = result.current.bulkActions.find((a) => a.id === 'start');
    act(() => start?.onAction(bots));
    render(createElement(MemoryRouter, null, result.current.dialogs));
    return result;
  };

  it('a spot hedge is not started in bulk and is named in a message', () => {
    const spot = toBotRef(hedge('binance'), 'hedgeDca', { name: 'Spot hedge' });
    runBulk([spot]);
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
      '"Spot hedge" was not started: start it individually to choose how each leg is funded'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(statusCalls()).toEqual([]);
  });

  it('futures hedges in the same selection still go through the bulk start', () => {
    const spot = toBotRef(hedge('binance'), 'hedgeDca', { name: 'Spot hedge' });
    const futures = {
      ...toBotRef(hedge('binanceUsdm'), 'hedgeDca', { name: 'Futures hedge' }),
      id: 'hedge-2',
    };
    const result = runBulk([spot, futures]);
    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);
    expect(result.current.dialogs).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

describe('combo leg fields (fix round 2)', () => {
  const okAnswer = {
    previewHedgeFunding: {
      status: 'OK',
      data: {
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        freeBase: 0,
        freeQuote: 0,
        reservedQuote: 0,
        reservedBase: 0,
        legs: [],
      },
    },
  };
  const comboInput: PreviewHedgeFundingInput = {
    exchangeUUID: 'acc-1',
    exchange: 'binance',
    pair: 'BTCUSDT',
    price: 100,
    legs: [
      {
        side: StrategyEnum.short,
        action: ActionsEnum.buyDiff,
        baseOrderQty: 1,
        safetyQty: 2,
        safetyQuote: 190,
        useDca: true,
        comboGridLevel: 2,
        safetyLevels: 2,
        feeOrder: true,
      },
    ],
  };
  const fakeClient = (reject: (legs: Array<Record<string, unknown>>) => string | null) => {
    const sent: Array<Array<Record<string, unknown>>> = [];
    return {
      sent,
      client: {
        request: async (_q: string, variables: { input: { legs: Array<Record<string, unknown>> } }) => {
          sent.push(variables.input.legs);
          const message = reject(variables.input.legs);
          if (message) throw new Error(message);
          return okAnswer;
        },
      } as never,
    };
  };

  it('an API that rejects the combo fields by name is asked again without them, once', async () => {
    const { client, sent } = fakeClient((legs) =>
      'comboGridLevel' in legs[0]
        ? 'Variable "$input" got invalid value; Field "comboGridLevel" is not defined by type "previewHedgeFundingLegInput".'
        : null
    );
    const first = await fetchHedgeFundingPreview(client, comboInput);
    expect(first.backend).toBe('new');
    expect(first.preview).not.toBeNull();
    expect(sent.length).toBe(2);
    expect(Object.keys(sent[1][0])).not.toContain('comboGridLevel');
    expect(Object.keys(sent[1][0])).not.toContain('safetyLevels');
    expect(Object.keys(sent[1][0])).not.toContain('feeOrder');
    // Later requests leave them out straight away.
    await fetchHedgeFundingPreview(client, comboInput);
    expect(sent.length).toBe(3);
    expect(Object.keys(sent[2][0])).not.toContain('comboGridLevel');
  });

  it('an API that knows them gets them; one without the query is still "old"', async () => {
    const ok = fakeClient(() => null);
    await fetchHedgeFundingPreview(ok.client, comboInput);
    expect(ok.sent[0][0]).toMatchObject({ comboGridLevel: 2, safetyLevels: 2, feeOrder: true });

    const old = fakeClient(() => 'Cannot query field "previewHedgeFunding" on type "Query".');
    const res = await fetchHedgeFundingPreview(old.client, comboInput);
    expect(res.backend).toBe('old');
    expect(old.sent.length).toBe(1);
  });

  it('the dialog sends the combo fields for combo legs only', async () => {
    captured.respond = () => okAnswer;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const comboHedge = {
      _id: 'hedge-c',
      status: 'closed',
      bots: [
        { ...leg(StrategyEnum.long, 'binance'), settings: { ...settings(StrategyEnum.long), gridLevel: '3', feeOrder: true } },
        { ...leg(StrategyEnum.short, 'binance'), settings: { ...settings(StrategyEnum.short), gridLevel: '3', feeOrder: true } },
      ],
    };
    render(
      <QueryClientProvider client={client}>
        <HedgeStartDialog
          open
          onOpenChange={() => undefined}
          botName="Combo hedge"
          combo
          hedge={comboHedge}
          onConfirm={() => undefined}
        />
      </QueryClientProvider>
    );
    await waitFor(() => expect(captured.requests.length).toBeGreaterThan(0), { timeout: 3000 });
    const legs = (captured.requests.at(-1)?.variables as { input: { legs: Array<Record<string, unknown>> } })
      .input.legs;
    for (const l of legs) {
      expect(l.comboGridLevel).toBe(3);
      expect(l.feeOrder).toBe(true);
      expect(typeof l.safetyLevels).toBe('number');
      expect(l.safetyLevels as number).toBeGreaterThan(0);
    }
  });

  it('DCA hedge legs omit them', async () => {
    captured.respond = () => okAnswer;
    renderDialog();
    await waitFor(() => expect(captured.requests.length).toBeGreaterThan(0), { timeout: 3000 });
    const legs = (captured.requests.at(-1)?.variables as { input: { legs: Array<Record<string, unknown>> } })
      .input.legs;
    for (const l of legs) {
      expect('comboGridLevel' in l || 'safetyLevels' in l || 'feeOrder' in l).toBe(false);
    }
  });
});

describe('ForAll legs (fix round 3)', () => {
  it('a "for all" leg shows its market trade without a held figure', async () => {
    captured.respond = () => ({
      previewHedgeFunding: {
        status: 'OK',
        data: {
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          freeBase: 0.002,
          freeQuote: 500,
          reservedQuote: 0,
          reservedBase: 0,
          legs: [
            {
              side: 'LONG',
              action: 'sellForAll',
              kind: 'fund',
              tradeSide: 'SELL',
              tradeBaseQty: 0.000748,
              tradeQuote: 61.24,
              required: 61.24,
              held: 500,
              needAsset: 'USDT',
              reservedForEntry: 0.0003,
            },
            {
              side: 'SHORT',
              action: 'buyDiff',
              kind: 'none',
              required: 2,
              held: 3,
              needAsset: 'BTC',
            },
          ],
        },
      },
    });
    renderDialog();
    await screen.findByText('Bot sells at market', undefined, { timeout: 3000 });
    const long = screen.getByTestId(`hedge-start-leg-${StrategyEnum.long}`);
    const short = screen.getByTestId(`hedge-start-leg-${StrategyEnum.short}`);
    expect(long.textContent).not.toContain('Held used');
    expect(short.textContent).toContain('Held used');
  });
});
