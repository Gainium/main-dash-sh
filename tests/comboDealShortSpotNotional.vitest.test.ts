import { describe, expect, test } from 'vitest';

import { comboDealToOpenTrade } from '@/lib/utils/comboDealToOpenTrade';
import type { ComboDeal } from '@/hooks/useComboDeals';

/**
 * A SHORT spot combo deal carries its usage on the BASE side
 * (`usage.current.quote` is 0). The Combo deals table read only the quote
 * side, so Cost came out 0, Notional Value became cost + profit = just the
 * deal's profit, and Size showed the wallet's base balance instead of the
 * short position.
 */

const shortSpot = {
  _id: 'd1',
  botId: 'b1',
  status: 'open',
  strategy: 'SHORT',
  exchange: 'binance',
  avgPrice: 2000,
  symbol: { symbol: 'AAAUSDT', baseAsset: 'AAA', quoteAsset: 'USDT' },
  currentBalances: { base: 0.3, quote: 100 },
  initialBalances: { base: 0.35, quote: 0 },
  usage: {
    current: { base: 0.05, quote: 0 },
    max: { base: 0.4, quote: 0 },
  },
  profit: { total: 0.08, totalUsd: 0.08 },
  settings: { futures: false, leverage: 1 },
} as unknown as ComboDeal;

const longSpot = {
  ...shortSpot,
  strategy: 'LONG',
  avgPrice: 10,
  usage: {
    current: { base: 0, quote: 300 },
    max: { base: 0, quote: 1000 },
  },
  profit: { total: 3, totalUsd: 3 },
} as unknown as ComboDeal;

describe('comboDealToOpenTrade — SHORT spot', () => {
  test('Cost / Notional / Size come from the base-side usage', () => {
    const t = comboDealToOpenTrade(shortSpot);
    expect(t.cost).toBeCloseTo(0.05 * 2000, 6);
    expect(t.value).toBeCloseTo(0.05 * 2000, 6);
    expect(t.size).toBeCloseTo(0.05, 9);
    expect(t.usagePercentage).toBeCloseTo((0.05 / 0.4) * 100, 6);
  });

  test('Notional is the position value, not cost + profit', () => {
    const t = comboDealToOpenTrade(longSpot);
    expect(t.cost).toBeCloseTo(300, 6);
    expect(t.value).toBeCloseTo(300, 6);
    expect(t.size).toBeCloseTo(300 / 10, 9);
  });
});
