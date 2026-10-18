/**
 * Adversarial review of spec 044 phase 3 (2026-10-18) — hedge start dialog.
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgeStartDialogReview.vitest.test.tsx`.
 *
 * A FAILING case demonstrates a defect (phase3-review.md).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const captured = vi.hoisted(() => ({
  requests: [] as Array<{ query: string; variables: Record<string, unknown> }>,
}));

vi.mock('../src/hooks/useSinglePosition', () => ({
  useSinglePositionClient: () => ({
    enabled: true,
    paperContext: true,
    make: () => ({
      request: async (query: string, variables: Record<string, unknown>) => {
        captured.requests.push({ query, variables });
        return {};
      },
    }),
  }),
}));

// No price for the pair yet (the price feed has not answered).
vi.mock('../src/helper/price', () => ({
  default: (cb: (r: { data: unknown[] }) => void) => {
    cb({ data: [] });
    return () => undefined;
  },
  getLocalPrices: () => [],
  getPricesFetchedAt: () => 0,
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
  captured.requests = [];
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

describe('hedge start dialog — review', () => {
  it('[BUG] with no price yet there is no preview, yet Start is enabled and sends funding actions blind', async () => {
    const onConfirm = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HedgeStartDialog
          open
          onOpenChange={() => undefined}
          botName="Hedge one"
          combo={false}
          hedge={{ _id: 'h', status: 'closed', bots: [leg(StrategyEnum.long), leg(StrategyEnum.short)] }}
          onConfirm={onConfirm}
        />
      </QueryClientProvider>
    );
    await new Promise((r) => setTimeout(r, 600));
    expect(captured.requests.length).toBe(0);
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    fireEvent.click(start);
    // Expected: Start waits for a preview (or at least does not default to
    // the funding actions without one).
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
