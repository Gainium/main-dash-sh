/**
 * Runner note: Vitest-only (renders in jsdom, mocks a module). Run from the
 * parent: `npx vitest run core/tests/botPairStatsTable.vitest.test.tsx`.
 *
 * The Stats tab's per-pair table: rows per pair from `getBotPairStats`, a
 * fallback to the stored `symbolStats` on a backend that predates that query,
 * and the bot-wide profit factor read from money rather than deal counts.
 */
import {
  describe,
  expect,
  it,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useBotPairStats } from '@/hooks/useBotPairStats';
import { BotPairStatsTable } from '@/components/widgets/bots/stats/BotPairStatsTable';
import { buildBotStatsBreakdown } from '@/components/widgets/bots/stats/botStatsViewModel';
import {
  buildPairStatsRows,
  buildPairStatsRowsFromSymbolStats,
  type BotPairStatsDTO,
} from '@/components/widgets/bots/stats/pairStatsViewModel';
import { BotTypesEnum, type BotStats, type BotSymbolsStats } from '@/types';

const dto = (over: Partial<BotPairStatsDTO>): BotPairStatsDTO => ({
  symbol: 'BTC-USDC',
  baseAsset: 'BTC',
  quoteAsset: 'USDC',
  closedDeals: 0,
  wins: 0,
  losses: 0,
  realizedProfitUsd: 0,
  grossProfitUsd: 0,
  grossLossUsd: 0,
  profitFactor: 0,
  feesQuote: 0,
  maxDealCapitalUsd: 0,
  avgDealDuration: 0,
  maxDealDuration: 0,
  maxDrawdownPerc: 0,
  openDeals: 0,
  unrealizedProfitUsd: 0,
  openCapitalUsd: 0,
  ...over,
});

describe('buildPairStatsRows', () => {
  it('derives win rate, return on capital and average profit per deal', () => {
    const [row] = buildPairStatsRows([
      dto({
        closedDeals: 4,
        wins: 3,
        losses: 1,
        realizedProfitUsd: 8,
        maxDealCapitalUsd: 200,
        profitFactor: 3,
        maxDrawdownPerc: 0.0152,
      }),
    ]);
    expect(row?.winRatePerc).toBe(75);
    expect(row?.roiPerc).toBe(4);
    expect(row?.avgProfitUsd).toBe(2);
    expect(row?.profitFactor).toBe(3);
    expect(row?.maxDrawdownPerc).toBeCloseTo(1.52, 10);
  });

  it('reads the -1 sentinel as infinity, and has no factor for a pair that never closed', () => {
    const [won, idle] = buildPairStatsRows([
      dto({ closedDeals: 2, wins: 2, profitFactor: -1 }),
      dto({ symbol: 'ADA-USDC', baseAsset: 'ADA' }),
    ]);
    expect(won?.profitFactor).toBe(Infinity);
    expect(idle?.profitFactor).toBeUndefined();
    expect(idle?.winRatePerc).toBeUndefined();
    expect(idle?.avgDealDuration).toBeUndefined();
  });
});

describe('buildPairStatsRowsFromSymbolStats (backend without getBotPairStats)', () => {
  it('omits the stored profit factor, which an old backend computes from deal counts', () => {
    const [row] = buildPairStatsRowsFromSymbolStats([
      {
        symbol: 'ETH-USDC',
        numerical: {
          deals: { profit: 9, loss: 1 },
          general: {
            netProfit: { usd: -41, asset: -41 },
            netProfitPerc: -0.05,
            winRate: 0.9,
            profitFactor: 9,
          },
        },
        duration: { maxDealDuration: 1000, avgDealDuration: 500 },
      } as unknown as BotSymbolsStats,
    ]);
    expect(row?.profitFactor).toBeUndefined();
    expect(row?.closedDeals).toBe(10);
    expect(row?.roiPerc).toBeCloseTo(-5, 10);
    expect(row?.quoteAsset).toBe('USDC');
    expect(row?.feesQuote).toBeUndefined();
  });
});

describe('bot-wide profit factor', () => {
  const ua = (usd = 0) => ({ usd, asset: usd });
  const statsWith = (profitFactor: number, gross?: [number, number]) =>
    ({
      numerical: {
        general: { startBalance: ua(100), netProfit: ua(), avgDaily: ua() },
        profit: {
          // Real stats always carry the objects; "absent" means no usd total.
          grossProfit: gross ? ua(gross[0]) : { asset: 0 },
          avgDealProfit: ua(),
          maxDealProfit: ua(),
          maxRunUp: ua(),
        },
        loss: {
          grossLoss: gross ? ua(gross[1]) : { asset: 0 },
          avgDealLoss: ua(),
          maxDealLoss: ua(),
          maxDrawdown: ua(),
          maxEquityDrawdown: ua(),
        },
        ratios: { profitFactor, buyAndHold: {} },
        usage: {},
        deals: { profit: 9, loss: 1 },
      },
      duration: { general: {}, profit: {}, loss: {} },
      chart: [],
    }) as unknown as BotStats;

  it('comes from gross profit / gross loss, not the stored count ratio', () => {
    const vm = buildBotStatsBreakdown(statsWith(9, [9, -50]), {});
    expect(vm.ratios.profitFactor).toBe(0.18);
  });

  it('is infinite with profits and no losses', () => {
    const vm = buildBotStatsBreakdown(statsWith(-1, [12, 0]), {});
    expect(vm.ratios.profitFactor).toBe(Infinity);
  });

  it('falls back to the stored value when the gross totals are absent', () => {
    const vm = buildBotStatsBreakdown(statsWith(2.5), {});
    expect(vm.ratios.profitFactor).toBe(2.5);
  });
});

// ── hook + table, in jsdom ──────────────────────────────────────────────────

// CoinPair needs the exchange-data context; the pair text is all that matters here.
vi.mock('@/components/widgets/shared/CoinPair', () => ({
  default: ({
    baseAsset,
    quoteAsset,
  }: {
    baseAsset?: string;
    quoteAsset?: string;
  }) => createElement('span', null, `${baseAsset}/${quoteAsset}`),
}));

let serverRejects = false;
let lastVariables: Record<string, unknown> | undefined;

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables?: Record<string, unknown>) {
      lastVariables = variables;
      if (serverRejects) {
        // What an older main-app answers for a field its schema lacks.
        throw new Error(
          'Cannot query field "getBotPairStats" on type "Query".'
        );
      }
      return {
        getBotPairStats: {
          status: 'OK',
          data: [
            dto({
              closedDeals: 11,
              wins: 11,
              realizedProfitUsd: 36.6,
              profitFactor: -1,
              maxDealCapitalUsd: 1000,
            }),
            dto({
              symbol: 'SOL-USDC',
              baseAsset: 'SOL',
              closedDeals: 15,
              wins: 14,
              losses: 1,
              realizedProfitUsd: 50.5,
              profitFactor: 4.2,
              openDeals: 1,
              unrealizedProfitUsd: -3.25,
            }),
          ],
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = (node: ReactNode) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(QueryClientProvider, { client: queryClient }, node)
      )
    );
  });
  return el;
};

function renderHook<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  mount(createElement(Probe));
  return () => {
    if (ref.current === null) throw new Error('hook did not render');
    return ref.current;
  };
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeAll(() => {
  // jsdom has neither; the DataTable toolbar measures itself with both.
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
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  serverRejects = false;
  lastVariables = undefined;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'owner@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('useBotPairStats', () => {
  it('returns the rows and sends the range', async () => {
    const result = renderHook(() =>
      useBotPairStats({
        botId: 'bot1',
        type: BotTypesEnum.dca,
        from: 1000,
        to: 2000,
      })
    );
    await settle();
    expect(result().unavailable).toBe(false);
    expect(result().rows?.map((r) => r.symbol)).toEqual([
      'BTC-USDC',
      'SOL-USDC',
    ]);
    expect(lastVariables).toMatchObject({
      input: { id: 'bot1', type: BotTypesEnum.dca, from: 1000, to: 2000 },
    });
  });

  it('reports unavailable when the backend has no such query', async () => {
    serverRejects = true;
    const result = renderHook(() =>
      useBotPairStats({ botId: 'bot1', type: BotTypesEnum.dca })
    );
    await settle();
    expect(result().rows).toBeUndefined();
    expect(result().unavailable).toBe(true);
    expect(result().isLoading).toBe(false);
  });
});

describe('BotPairStatsTable', () => {
  it('renders one row per pair with the metric columns', async () => {
    const rows = buildPairStatsRows([
      dto({
        closedDeals: 11,
        wins: 11,
        realizedProfitUsd: 36.6,
        profitFactor: -1,
        maxDealCapitalUsd: 1000,
      }),
      dto({
        symbol: 'SOL-USDC',
        baseAsset: 'SOL',
        closedDeals: 15,
        wins: 14,
        losses: 1,
        realizedProfitUsd: 50.5,
        profitFactor: 4.2,
        openDeals: 1,
        unrealizedProfitUsd: -3.25,
      }),
    ]);
    const el = mount(
      createElement(BotPairStatsTable, {
        botId: 'bot1',
        rows,
        range: null,
        onRangeChange: () => {},
      })
    );
    await settle();
    const text = el.textContent ?? '';
    for (const header of [
      'Pair',
      'Deals',
      'Win rate',
      'Realized P&L',
      'Return on capital',
      'Profit factor',
      'Max drawdown',
      'Fees',
      'Open P&L',
    ]) {
      expect(text).toContain(header);
    }
    expect(text).toContain('All time');
    expect(text).toContain('$36.60');
    expect(text).toContain('∞');
    expect(text).toContain('4.20');
    expect(text).toContain('-$3.25');
    expect(text).toContain('14W / 1L');
  });

  it('hides the period picker and says why on a backend without the query', async () => {
    const el = mount(
      createElement(BotPairStatsTable, {
        botId: 'bot1',
        rows: [],
        range: null,
        fromStoredStats: true,
      })
    );
    await settle();
    const text = el.textContent ?? '';
    expect(text).not.toContain('All time');
    expect(text).toContain('Update the server');
  });
});
