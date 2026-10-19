/**
 * Runner note: run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgeCloses.vitest.test.tsx`.
 *
 * Hedge backtest "Hedge closes": which long and short deals the hedge take
 * profit / stop loss closed together, numbered as the Deals rail numbers them.
 */
import { describe, expect, it } from 'vitest';

import { buildHedgeCloseIndex } from '@/components/widgets/bots/backtest/HedgeClosesTab';
import type { HedgeBacktestingResult } from '@/types';

const deal = (id: string, perc: number, number?: number) =>
  ({ id, profit: { perc, total: 0, totalUsd: 0 }, ...(number ? { number } : {}) }) as never;

const result = (
  hedgeCloses?: HedgeBacktestingResult['hedgeCloses']
): HedgeBacktestingResult =>
  ({
    longResult: { deals: [deal('L1', 1.7), deal('L2', -3.2)] },
    shortResult: { deals: [deal('S1', 0.4, 7)] },
    hedgeResult: {},
    ...(hedgeCloses ? { hedgeCloses } : {}),
  }) as never;

describe('buildHedgeCloseIndex', () => {
  it('is null for results recorded before hedge closes existed', () => {
    expect(buildHedgeCloseIndex(result())).toBeNull();
    expect(buildHedgeCloseIndex(null)).toBeNull();
  });

  it('pairs each closed deal with the other leg, by rail number', () => {
    const index = buildHedgeCloseIndex(
      result([
        { pair: 'ENAUSDT', time: 1, reason: 'sl', perc: -2.1, longDealIds: ['L2'], shortDealIds: ['S1'] },
        { pair: 'BTCUSDT', time: 2, reason: 'tp', perc: 3.2, longDealIds: ['L1'], shortDealIds: [] },
      ])
    );
    expect(index?.rows[0]).toMatchObject({
      long: [{ no: 2, perc: -3.2 }],
      short: [{ no: 7, perc: 0.4 }],
    });
    expect(index?.byDealId.get('L2')).toMatchObject({ leg: 'long', partnerNos: [7] });
    expect(index?.byDealId.get('S1')).toMatchObject({ leg: 'short', partnerNos: [2] });
    // a long closed with no short open
    expect(index?.byDealId.get('L1')).toMatchObject({ leg: 'long', partnerNos: [] });
  });
});
