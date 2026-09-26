import { describe, expect, it } from 'vitest';

import { localSummaryToHistory } from '@/utils/backtest/localRows';
import {
  buildLocalBacktestSummary,
  LOCAL_BACKTEST_SUMMARY_VERSION,
  localBacktestTimeFromId,
} from '@/utils/backtest/summary';

// Local backtest lists read a small summary per entry instead of the stored
// engine result, which carries a point per candle and runs to megabytes per
// entry. These lock what the summary keeps and drops.

const heavyPayload = (overrides: Record<string, unknown> = {}) => ({
  _id: '66f0a1b2c3d4e5f6a7b8c9d0',
  time: 1727000000000,
  symbol: 'BTCUSDT',
  financial: { netProfitTotal: 12 },
  duration: { firstDataTime: 1, lastDataTime: 2, periodName: 'x' },
  settings: { name: 'My bot', startCondition: 'ASAP' },
  config: { userFee: 0.1 },
  deals: [{ id: 1 }],
  buyAndHoldEquity: Array.from({ length: 1000 }, (_, i) => [i, i]),
  portfolio: [{ x: 1, y: 2 }],
  indicatorsEvents: [{ a: 1 }],
  profits: [{ p: 1 }],
  ...overrides,
});

const entryOf = (id: string, payload: unknown, type = 'DCA') => ({
  id,
  type,
  data: JSON.stringify(payload),
  size: 123,
  exchange: 'binance',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
});

describe('buildLocalBacktestSummary', () => {
  it('keeps the list fields and drops the per-candle / per-deal detail', () => {
    const summary = buildLocalBacktestSummary(
      entryOf('66f0a1b2c3d4e5f6a7b8c9d0', heavyPayload())
    );
    expect(summary.v).toBe(LOCAL_BACKTEST_SUMMARY_VERSION);
    expect(summary.type).toBe('DCA');
    expect(summary.size).toBe(123);
    expect(summary.time).toBe(1727000000000);
    expect(summary.hasDetails).toBe(true);
    expect(summary.meta).toEqual({
      id: '66f0a1b2c3d4e5f6a7b8c9d0',
      type: 'DCA',
      size: 123,
      exchange: 'binance',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
    });
    expect(summary.row).toMatchObject({
      financial: { netProfitTotal: 12 },
      settings: { name: 'My bot', startCondition: 'ASAP' },
      config: { userFee: 0.1 },
    });
    for (const heavy of [
      'deals',
      'buyAndHoldEquity',
      'portfolio',
      'indicatorsEvents',
      'profits',
    ]) {
      expect(summary.row).not.toHaveProperty(heavy);
    }
  });

  it('reads grid detail and hedge figures', () => {
    const grid = buildLocalBacktestSummary(
      entryOf(
        'BTCUSDT-1727000000000',
        { financial: { profitTotal: 1 }, transaction: [{}], orders: [{}] },
        'Grid'
      )
    );
    expect(grid.hasDetails).toBe(true);
    expect(grid.row).toEqual({ financial: { profitTotal: 1 } });

    const hedge = buildLocalBacktestSummary(
      entryOf('local-1727000000000-ab12cd', {
        longResult: heavyPayload(),
        shortResult: heavyPayload(),
        hedgeResult: { financial: { netProfitTotal: 3 } },
        config: { userFee: 0.2 },
      })
    );
    expect(hedge.hasDetails).toBe(true);
    expect(hedge.time).toBe(1727000000000);
    expect(hedge.row).toEqual({
      financial: { netProfitTotal: 3 },
      config: { userFee: 0.2 },
    });
  });

  it('survives a payload that does not parse', () => {
    const summary = buildLocalBacktestSummary({
      id: 'ETHUSDT-1727000000000',
      type: 'DCA',
      data: '{broken',
    });
    expect(summary.row).toBeNull();
    expect(summary.hasDetails).toBe(false);
    expect(summary.time).toBe(1727000000000);
    expect(localSummaryToHistory(summary)).toBeNull();
  });
});

describe('localBacktestTimeFromId', () => {
  it('reads ObjectId seconds, symbol-time and local-time-random ids', () => {
    expect(localBacktestTimeFromId('66f0a1b2c3d4e5f6a7b8c9d0')).toBe(
      0x66f0a1b2 * 1000
    );
    expect(localBacktestTimeFromId('BTC-USDT-1727000000000')).toBe(
      1727000000000
    );
    expect(localBacktestTimeFromId('local-1727000000000-a1b2c3')).toBe(
      1727000000000
    );
    expect(localBacktestTimeFromId('unknown')).toBe(0);
  });
});

describe('localSummaryToHistory', () => {
  it('builds a list row with the local-details flag and entry fallbacks', () => {
    const payload = heavyPayload();
    delete (payload as Record<string, unknown>)['symbol'];
    const row = localSummaryToHistory<Record<string, unknown>>(
      buildLocalBacktestSummary(entryOf('66f0a1b2c3d4e5f6a7b8c9d0', payload))
    );
    expect(row).toMatchObject({
      _id: '66f0a1b2c3d4e5f6a7b8c9d0',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      exchange: 'binance',
      userId: 'local',
      hasLocalDetails: true,
    });
    expect(row).not.toHaveProperty('deals');
    expect(row).not.toHaveProperty('buyAndHoldEquity');
  });

  it('skips payloads without a financial block', () => {
    const summary = buildLocalBacktestSummary(
      entryOf('66f0a1b2c3d4e5f6a7b8c9d0', { settings: { name: 'x' } })
    );
    expect(localSummaryToHistory(summary)).toBeNull();
  });
});
