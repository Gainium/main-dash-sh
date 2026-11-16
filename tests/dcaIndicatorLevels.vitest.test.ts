/**
 * Several indicator conditions per DCA level: the dashboard reads levels the
 * way the engine does (main-app spec 244), so the projected ladder and the
 * frozen per-deal sizes line up with what trades.
 */
import { describe, expect, it } from 'vitest';
import { IndicatorAction, type SettingsIndicators } from '@/types';
import {
  startDcaLevelAnchors,
  startDcaLevels,
} from '@/utils/bots/dca/indicatorLevels';
import { applyFrozenIndicatorLevels } from '@/utils/bots/dca/frozen-indicator-levels';
import { billableIndicators } from '@/utils/bots/credits';
import { DCAConditionEnum } from '@/types';

const dca = (
  uuid: string,
  dcaLevel?: string,
  extra: Partial<SettingsIndicators> = {}
) =>
  ({
    uuid,
    groupId: 'g',
    indicatorAction: IndicatorAction.startDca,
    ...(dcaLevel ? { dcaLevel } : {}),
    ...extra,
  }) as SettingsIndicators;

describe('DCA indicator levels', () => {
  it('a legacy bot has one level per startDca indicator', () => {
    expect(
      startDcaLevels([dca('a'), dca('b')]).map((l) => l.key)
    ).toEqual(['a', 'b']);
  });

  it('indicators sharing dcaLevel are one level, anchored on the key', () => {
    const anchors = startDcaLevelAnchors([
      dca('L1', 'L1', { orderSize: '30' }),
      dca('x', 'L1'),
      dca('L2', 'L2', { orderSize: '50' }),
      dca('y', 'L1'),
    ]);
    expect(anchors.map((a) => [a.uuid, a.orderSize])).toEqual([
      ['L1', '30'],
      ['L2', '50'],
    ]);
  });

  it('frozen deal levels apply to each level anchor only', () => {
    const settings = applyFrozenIndicatorLevels({
      indicators: [
        dca('L1', 'L1', { orderSize: '30' }),
        dca('x', 'L1'),
        dca('L2', 'L2', { orderSize: '50' }),
      ],
      dcaIndicatorLevels: [{ orderSize: '10' }, { orderSize: '20' }],
    });
    expect(settings.indicators?.map((i) => i.orderSize)).toEqual([
      '10',
      undefined,
      '20',
    ]);
  });

  it('credits count the ladder as its largest level', () => {
    const ladder = [
      dca('L1', 'L1'),
      dca('L2', 'L2'),
      dca('x', 'L2'),
      dca('y', 'L2'),
      { uuid: 's', indicatorAction: IndicatorAction.startDeal },
    ];
    expect(billableIndicators(ladder, DCAConditionEnum.indicators)).toBe(4);
    expect(
      billableIndicators([dca('a'), dca('b'), dca('c')], DCAConditionEnum.indicators)
    ).toBe(1);
  });
});
