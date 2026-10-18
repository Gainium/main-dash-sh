/**
 * Runner note: `.vitest.test.tsx` (renders the dialog, mocks the price feed).
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgeStartDialogPrice.vitest.test.tsx`.
 *
 * The global price poll replaces its prices with whatever answered that round.
 * A round that misses the hedge's pair must not drop the start dialog back to
 * "Estimating…" with Start disabled: the dialog keeps the last price it saw.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const feed = vi.hoisted(() => ({
  cb: null as null | ((r: { data: unknown[] }) => void),
  requests: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/hooks/useSinglePosition', () => ({
  useSinglePositionClient: () => ({
    enabled: true,
    paperContext: true,
    make: () => ({
      request: async (_q: string, variables: Record<string, unknown>) => {
        feed.requests.push(variables);
        return {
          previewHedgeFunding: {
            status: 'OK',
            data: {
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              freeBase: 10,
              freeQuote: 10000,
              reservedQuote: 0,
              reservedBase: 0,
              legs: [
                { side: 'SHORT', action: 'buyDiff', kind: 'none' },
                { side: 'LONG', action: 'sellDiff', kind: 'none' },
              ],
            },
          },
        };
      },
    }),
  }),
}));

vi.mock('../src/helper/price', () => ({
  default: (cb: (r: { data: unknown[] }) => void) => {
    feed.cb = cb;
    cb({ data: [{ symbol: 'BTCUSDT', exchange: 'binance', price: 100 }] });
    return () => {
      feed.cb = null;
    };
  },
  getLocalPrices: () => [],
  getPricesFetchedAt: () => Date.now(),
}));

import { HedgeStartDialog } from '../src/features/bots/shared/runtime/dialogs/HedgeStartDialog';
import { StrategyEnum } from '../src/types';

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
  feed.requests = [];
});

const leg = (strategy: StrategyEnum) => ({
  _id: `leg-${strategy}`,
  exchange: 'binance',
  exchangeUUID: 'acc-1',
  settings: {
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
    useTp: true,
    useSl: false,
    dcaCondition: 'percentage',
    startOrderType: 'market',
  },
  symbol: [
    { key: 'BTCUSDT', value: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' } },
  ],
});

const startButton = () => screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;

describe('hedge start dialog — partial price answers', () => {
  it('keeps the last price when a poll omits the pair', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HedgeStartDialog
          open
          onOpenChange={() => undefined}
          botName="Hedge one"
          combo={false}
          hedge={{ _id: 'h', status: 'closed', bots: [leg(StrategyEnum.long), leg(StrategyEnum.short)] }}
          onConfirm={() => undefined}
        />
      </QueryClientProvider>
    );
    await waitFor(() => expect(startButton().disabled).toBe(false), { timeout: 3000 });
    const sent = feed.requests.length;
    expect(sent).toBeGreaterThan(0);

    // A partial poll: one unrelated pair, no BTCUSDT.
    act(() => feed.cb?.({ data: [{ symbol: 'ETHUSDT', exchange: 'binance', price: 5 }] }));
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.queryByTestId(`hedge-start-pending-${StrategyEnum.long}`)).toBeNull();
    expect(startButton().disabled).toBe(false);
    const last = feed.requests.at(-1) as { input: { price: number } };
    expect(last.input.price).toBe(100);
  });
});
