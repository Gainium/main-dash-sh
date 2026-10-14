import { describe, expect, it } from 'vitest';

import {
  dealMergeFigures,
  exitAlreadyReached,
  mergeDcaLadder,
  mergeDcaSupported,
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

  const ladder = {
    useDca: true,
    orderSizeType: 'quote' as never,
    ordersCount: '5' as never,
    orderSize: '100',
    step: '2',
    stepScale: '1.2',
    volumeScale: '1.5',
  };

  it('restarts the bot ladder from the merged average, as the engine does', () => {
    const l = mergeDcaLadder(ladder, { avg: 100, position: 1 }, true, 3);
    expect(l.map((x) => +x.price.toFixed(4))).toEqual([98, 95.6, 92.72]);
    expect(l.map((x) => x.cost)).toEqual([100, 150, 225]);
    expect(l[2]?.total).toBeCloseTo(100 + 475);
    expect(l[0]?.avgAfter).toBeCloseTo(200 / (1 + 100 / 98));
  });

  it('a short ladder goes up', () => {
    const l = mergeDcaLadder(ladder, { avg: 100, position: 1 }, false, 2);
    expect(l.map((x) => +x.price.toFixed(4))).toEqual([102, 104.4]);
    expect(l[1]?.deviation).toBeCloseTo(4.4);
  });

  it('base-sized levels keep their quantity', () => {
    const l = mergeDcaLadder(
      { ...ladder, orderSizeType: 'base' as never, orderSize: '2' },
      { avg: 100, position: 1 },
      true,
      1
    );
    expect(l[0]?.qty).toBe(2);
    expect(l[0]?.cost).toBeCloseTo(196);
  });

  it('carries only what the engine carries', () => {
    expect(mergeDcaSupported(ladder)).toBe(true);
    for (const over of [
      { useDca: false },
      { dcaCondition: 'indicators' },
      { dcaCondition: 'custom' },
      { scaleDcaType: 'atr' },
      { dcaVolumeBaseOn: 'change' },
      { orderSizeType: 'percFree' },
      { useRiskReward: true },
    ]) {
      expect(mergeDcaSupported({ ...ladder, ...(over as never) })).toBe(false);
    }
  });
});
