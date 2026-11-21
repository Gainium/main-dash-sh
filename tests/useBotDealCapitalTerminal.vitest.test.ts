/**
 * Runner note: `.vitest.test.ts` (renders a hook, mocks the deal summary). Run from
 * the parent: `NODE_ENV=development npx vitest run core/tests/useBotDealCapitalTerminal.vitest.test.ts`.
 *
 * A terminal order is always one deal, so its "Capital required" figure must not be
 * scaled by Max open deals (a field the terminal never shows). Bot forms keep the
 * per-deal × max open deals figure.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/components/widgets/trading/DealOverview', () => ({
  useDealOverviewData: () => ({
    orders: [],
    summary: {
      totalCapital: 500,
      totalCapitalBase: 0.3,
      baseOrderCapital: 500,
      baseOrderCapitalBase: 0.3,
    },
  }),
}));

import { useBotDealCapital } from '../src/hooks/bots/dca/useBotDealCapital';
import { BotTypesEnum, StrategyEnum } from '../src/types';
import type { BotFormData } from '../src/types/bots/form';
import type { DcaTradingContext } from '../src/hooks/bots/dca/useDcaTradingContext';

const form = (terminal: boolean): BotFormData =>
  ({
    type: BotTypesEnum.dca,
    terminal,
    dca: {
      strategy: StrategyEnum.long,
      futures: false,
      coinm: false,
      maxNumberOfOpenDeals: '5',
      leverage: '1',
    },
    combo: {},
  }) as unknown as BotFormData;

const ctx = {
  aggregatedBalances: { quote: { free: 1449 }, base: { free: 0 } },
  baseAsset: 'ETH',
  quoteAsset: 'USDC',
} as unknown as DcaTradingContext;

describe('useBotDealCapital — terminal deals are a single deal', () => {
  it('terminal: a 500 USDC order needs 500, whatever Max open deals holds', () => {
    const { result } = renderHook(() => useBotDealCapital(form(true), ctx));
    expect(result.current?.total).toBe(500);
    expect(result.current?.baseOrders).toBe(500);
    expect(result.current?.maxDeals).toBe(1);
  });

  it('DCA bot form: still per-deal × max open deals (unchanged)', () => {
    const { result } = renderHook(() => useBotDealCapital(form(false), ctx));
    expect(result.current?.total).toBe(2500);
    expect(result.current?.maxDeals).toBe(5);
  });
});
