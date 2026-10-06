import { test, expect } from '@playwright/test';
import GridBacktesterModule from '@gainium/backtester/dist/grid';

import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { readGridBacktestNumbers } from '@/utils/bots/grid/validation';

/**
 * A local grid backtest run from the bot form handed the form's free-text
 * values straight to the engine, which reads them with `parseFloat` / `+`:
 * `1,5` ran as 1 (or NaN) with no message, and `1000abc` ran at all.
 *
 * Spec: main-dash-redesign specs/083.grid-backtest-decimal-comma.md
 */

const grid = (over: Record<string, unknown>) => ({
  ...GRID_FORM_DEFAULTS,
  lowPrice: '100',
  topPrice: '200',
  budget: '1000',
  ...over,
});

// §1.1 — a decimal comma reaches the engine as the number save would store,
// in the form's units (no /100 on percent fields)
for (const field of [
  'sellDisplacement',
  'budget',
  'topPrice',
  'lowPrice',
  'tpPerc',
  'slPerc',
] as const) {
  test(`${field} 1,5 reaches the backtest as 1.5`, () => {
    const { grid: out, errors } = readGridBacktestNumbers(
      grid({ [field]: '1,5' }),
    );
    expect(errors).toEqual({});
    expect(out[field]).toBe(1.5);
  });
}

// §1.2 — not a number refuses the run with an error on the field
test('budget 1000abc is refused with a budget error', () => {
  const { errors } = readGridBacktestNumbers(grid({ budget: '1000abc' }));
  expect(Object.keys(errors)).toEqual(['budget']);
});

test('top price 1,000.5 is refused, not guessed', () => {
  const { errors } = readGridBacktestNumbers(grid({ topPrice: '1,000.5' }));
  expect(Object.keys(errors)).toEqual(['topPrice']);
});

// §1.3 — empty fields are passed through untouched; dot values are the
// same number the engine read before
test('empty fields are passed through untouched', () => {
  const { grid: out, errors } = readGridBacktestNumbers(
    grid({ budget: '', sellDisplacement: '', tpPerc: undefined }),
  );
  expect(errors).toEqual({});
  expect(out.budget).toBe('');
  expect(out.sellDisplacement).toBe('');
  expect(out.tpPerc).toBeUndefined();
});

test('non-numeric settings are left alone', () => {
  const input = grid({ gridType: 'arithmetic', startPrice: '' });
  const { grid: out } = readGridBacktestNumbers(input);
  expect(out.gridType).toBe('arithmetic');
  expect(out.startPrice).toBe('');
});

// §1.1 / §1.3 end to end through the real engine
const FROM = Date.UTC(2026, 0, 1);
const candles = Array.from({ length: 600 }, (_, i) => {
  const p = 150 + 40 * Math.sin(i / 15);
  return {
    time: FROM + i * 3_600_000,
    open: p,
    high: p * 1.01,
    low: p * 0.99,
    close: p,
    volume: 1,
    symbol: 'BTCUSDT',
  };
});

// The dist is CommonJS; under the test loader its default export arrives wrapped.
const GridBacktester = ((
  GridBacktesterModule as unknown as { default?: unknown }
).default ?? GridBacktesterModule) as typeof GridBacktesterModule;

const runEngine = async (settings: Record<string, unknown>) => {
  const engine = new GridBacktester({
    exchange: 'binance',
    symbols: [
      {
        pair: 'BTCUSDT',
        baseAsset: {
          name: 'BTC',
          minAmount: 0.00001,
          maxAmount: 1000,
          step: 0.00001,
        },
        quoteAsset: { name: 'USDT', minAmount: 1 },
        exchange: 'binance',
        maxOrders: 200,
        priceAssetPrecision: 2,
      },
    ],
    settings: { ...settings, pair: 'BTCUSDT', name: 'x', updatedBudget: true },
    userFee: 0.001,
    prices: [],
    balances: [],
    interval: '1h',
    from: FROM,
    to: FROM + (candles.length - 1) * 3_600_000,
    slippage: 0,
  } as never);
  const result = await engine.test(candles as never, () => undefined);
  return result?.financial?.profitTotalPerc;
};

test('sell displacement 1,5 backtests exactly like 1.5', async () => {
  const comma = readGridBacktestNumbers(grid({ sellDisplacement: '1,5' }));
  const dot = grid({ sellDisplacement: '1.5' });
  expect(await runEngine(comma.grid)).toBe(await runEngine(dot));
});

test('dot-decimal fields backtest exactly as they did raw', async () => {
  const raw = grid({
    sellDisplacement: '0.7',
    topPrice: '200.5',
    budget: '999.5',
  });
  expect(await runEngine(readGridBacktestNumbers(raw).grid)).toBe(
    await runEngine(raw),
  );
});
