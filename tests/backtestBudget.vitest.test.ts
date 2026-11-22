/**
 * Runner note: Vitest. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/backtestBudget.vitest.test.ts`.
 *
 * Spec 162: an optional Budget on the full backtest dialog runs the engine
 * with `enforceBalances` over the spend asset's budget.
 */
import { describe, expect, it } from 'vitest';

import { buildBacktestViewModel } from '@/components/widgets/bots/backtest/redesign/viewModel';
import {
  applyBacktestBudget,
  backtestBudgetAsset,
} from '@/features/bots/widgets/BotForm/localBacktestSettings';
import { sanitizeResult } from '@/hooks/useBacktestPersistence';
import {
  BotTypesEnum,
  StrategyEnum,
  type DCABacktestingResult,
  type DCABotSettings,
} from '@/types';

const form = (
  over: Partial<{
    type: BotTypesEnum;
    pair: string | string[];
    strategy: StrategyEnum;
    futures: boolean;
  }> = {}
) =>
  ({
    type: over.type ?? BotTypesEnum.dca,
    pair: over.pair ?? 'BTC/USDT',
    pairMetadata: {},
    dca: {
      strategy: over.strategy ?? StrategyEnum.long,
      futures: over.futures ?? false,
    },
  }) as unknown as Parameters<typeof backtestBudgetAsset>[0];

describe('backtestBudgetAsset (spec 162 §2)', () => {
  it('§2.1 a long spends the quote, a short the base', () => {
    expect(backtestBudgetAsset(form())).toEqual({ asset: 'USDT' });
    expect(
      backtestBudgetAsset(form({ strategy: StrategyEnum.short }))
    ).toEqual({ asset: 'BTC' });
  });

  it('§2.2 a multi-pair bot shares one budget when its pairs spend one asset', () => {
    expect(
      backtestBudgetAsset(form({ pair: ['BTC/USDT', 'ETH/USDT'] }))
    ).toEqual({ asset: 'USDT' });
    expect(
      backtestBudgetAsset(form({ pair: ['BTC/USDT', 'ETH/USDC'] }))
    ).toHaveProperty('unsupported');
  });

  it('§2.3 combo and futures say why; grid has no field at all', () => {
    const combo = backtestBudgetAsset(form({ type: BotTypesEnum.combo }));
    expect(combo).toHaveProperty('unsupported');
    expect(combo).not.toHaveProperty('hidden');
    const futures = backtestBudgetAsset(form({ futures: true }));
    expect(futures).toHaveProperty('unsupported');
    expect(futures).not.toHaveProperty('hidden');
    expect(backtestBudgetAsset(form({ type: BotTypesEnum.grid }))).toHaveProperty(
      'hidden',
      true
    );
  });
});

describe('applyBacktestBudget (spec 162 §3)', () => {
  const balances = [
    { asset: 'BTC', free: '2', locked: '0' },
    { asset: 'USDT', free: '5000', locked: '100' },
  ];
  it('§3.1 replaces the spend asset row with the budget', () => {
    expect(applyBacktestBudget(balances, 'USDT', 1000)).toEqual([
      { asset: 'BTC', free: '2', locked: '0' },
      { asset: 'USDT', free: '1000', locked: '0' },
    ]);
  });
  it('§3.1 adds the row when the account holds none of it', () => {
    expect(applyBacktestBudget([], 'USDC', 250)).toEqual([
      { asset: 'USDC', free: '250', locked: '0' },
    ]);
  });
});

describe('budget result (spec 162 §4)', () => {
  const budgetLimit = {
    asset: 'USDT',
    budget: 1000,
    dealsSkipped: 12,
    dcaRefused: 3,
    dcaRefusedAttempts: 40,
  };
  const result = {
    deals: [],
    financial: {},
    numerical: {},
    ratios: {},
    duration: {},
    messages: ['Budget limit: …'],
    budgetLimit,
  } as unknown as DCABacktestingResult;

  it('§4.1 the view model carries the counts; none without a budget', () => {
    const settings = { pair: ['BTC/USDT'] } as unknown as DCABotSettings;
    expect(buildBacktestViewModel(result, settings).budget).toEqual({
      asset: 'USDT',
      amount: 1000,
      dealsSkipped: 12,
      dcaRefused: 3,
      dcaRefusedAttempts: 40,
    });
    const { budgetLimit: _drop, ...plain } = result;
    expect(
      buildBacktestViewModel(plain as DCABacktestingResult, settings).budget
    ).toBeNull();
  });

  it('§4.2 the remote save drops budgetLimit but keeps the message', () => {
    const saved = sanitizeResult(result);
    expect(saved).not.toHaveProperty('budgetLimit');
    expect(saved.messages).toEqual(['Budget limit: …']);
  });
});
