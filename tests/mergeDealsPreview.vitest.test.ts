import { describe, expect, it } from 'vitest';

import {
  dealMergeFigures,
  exitAlreadyReached,
  mergedFigures,
  mergeExit,
} from '../src/components/deals/mergeDealsPreview';

const order = (
  side: 'BUY' | 'SELL',
  price: number,
  qty: number,
  typeOrder = 'dealStart',
  status = 'FILLED'
) => ({ side, price: `${price}`, executedQty: `${qty}`, typeOrder, status });

describe('merge deals preview', () => {
  it('averages every filled entry of every deal, as the engine does', () => {
    const a = dealMergeFigures(
      [order('BUY', 100, 1), order('BUY', 80, 1, 'dealRegular')],
      true
    );
    const b = dealMergeFigures([order('BUY', 200, 2)], true);
    expect(a.avg).toBe(90);
    expect(a.position).toBe(2);
    const m = mergedFigures([a, b]);
    expect(m.avg).toBe((100 + 80 + 400) / 4);
    expect(m.position).toBe(4);
  });

  it('leaves out unfilled orders; a partial TP lowers the position, not the average', () => {
    const f = dealMergeFigures(
      [
        order('BUY', 100, 2),
        order('BUY', 50, 5, 'dealRegular', 'NEW'),
        order('SELL', 110, 0.5, 'dealTP'),
      ],
      true
    );
    expect(f.avg).toBe(100);
    expect(f.position).toBe(1.5);
  });

  it('short deals hold what they sold', () => {
    const f = dealMergeFigures([order('SELL', 100, 3)], false);
    expect(f.position).toBe(3);
  });

  it('prices a percent TP / SL from the merged average on each side', () => {
    const s = { useTp: true, tpPerc: '2', useSl: true, slPerc: '-5' };
    expect(mergeExit('tp', s, 100, true)).toMatchObject({ price: 102 });
    expect(mergeExit('sl', s, 100, true)).toMatchObject({ price: 95 });
    expect(mergeExit('tp', s, 100, false)).toMatchObject({ price: 98 });
    expect(mergeExit('sl', s, 100, false)).toMatchObject({ price: 105 });
  });

  it('offers no exit the engine would not carry', () => {
    expect(mergeExit('tp', { useTp: false }, 100, true).kind).toBe('none');
    expect(
      mergeExit('tp', { useTp: true, useRiskReward: true }, 100, true).kind
    ).toBe('none');
    expect(
      mergeExit(
        'sl',
        { useSl: true, dealCloseConditionSL: 'dynamicAr' as never },
        100,
        true
      ).kind
    ).toBe('none');
    expect(
      mergeExit(
        'tp',
        { useTp: true, dealCloseCondition: 'webhook' as never },
        100,
        true
      )
    ).toEqual({ kind: 'other', label: 'Webhook close' });
  });

  it('flags an exit the market has already passed', () => {
    expect(exitAlreadyReached('tp', 102, 103, true)).toBe(true);
    expect(exitAlreadyReached('tp', 102, 101, true)).toBe(false);
    expect(exitAlreadyReached('sl', 95, 94, true)).toBe(true);
    expect(exitAlreadyReached('tp', 98, 97, false)).toBe(true);
    expect(exitAlreadyReached('sl', 105, 106, false)).toBe(true);
  });
});
