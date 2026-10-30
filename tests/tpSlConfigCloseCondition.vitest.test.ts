/**
 * Runner note: run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/tpSlConfigCloseCondition.vitest.test.ts
 *
 * A deal's settings snapshot often stores `dealCloseCondition: null`, which the
 * engine treats as the default Percentage close. The TP description labelled it
 * "Type: Percentage" but compared the raw value against `tp`, so the target
 * line ("Target: 10%") was dropped and the deals table showed no amount.
 */
import { describe, expect, it } from 'vitest';

import { CloseConditionEnum, type DCADealsSettings } from '@/types';
import {
  expectsRestingTpOrder,
  tpSLConfig,
} from '@/utils/bots/dca/tpSlConfig';

const settings = (over: Partial<DCADealsSettings>): DCADealsSettings =>
  ({
    useTp: true,
    tpPerc: '10',
    useMultiTp: false,
    multiTp: [],
    useMinTP: false,
    minTp: '1',
    trailingTp: false,
    useSl: false,
    ...over,
  }) as unknown as DCADealsSettings;

describe('tpSLConfig with an unset close condition', () => {
  it('shows the TP target when dealCloseCondition is null', () => {
    const s = settings({ dealCloseCondition: null as never });
    expect(tpSLConfig(s, 'tp')).toBe('Type: Percentage\nTarget: 10%');
  });

  it('shows the TP target when dealCloseCondition is undefined', () => {
    const s = settings({});
    expect(tpSLConfig(s, 'tp')).toBe('Type: Percentage\nTarget: 10%');
  });

  it('lists multi-TP levels instead of a single target', () => {
    const s = settings({
      dealCloseCondition: null as never,
      useMultiTp: true,
      multiTp: [
        { target: '5', amount: '50' },
        { target: '10', amount: '50' },
      ] as never,
    });
    expect(tpSLConfig(s, 'tp')).toBe('Type: Percentage\nMulti TP: 5%, 10%');
  });

  it('does not show Min TP for a null (Percentage) condition', () => {
    const s = settings({ dealCloseCondition: null as never, useMinTP: true });
    expect(tpSLConfig(s, 'tp')).not.toContain('Min TP');
  });

  it('shows the SL target when dealCloseConditionSL is null', () => {
    const s = settings({
      useSl: true,
      slPerc: '-5',
      dealCloseConditionSL: null as never,
    });
    expect(tpSLConfig(s, 'sl')).toBe('Type: Percentage\nTarget: -5%');
  });

  it('keeps indicator closes without a target', () => {
    const s = settings({ dealCloseCondition: CloseConditionEnum.techInd });
    expect(tpSLConfig(s, 'tp')).toBe('Type: Indicators');
  });
});

describe('expectsRestingTpOrder', () => {
  it('expects an order for a Percentage TP, including a null condition', () => {
    expect(expectsRestingTpOrder(settings({}))).toBe(true);
    expect(
      expectsRestingTpOrder(settings({ dealCloseCondition: null as never }))
    ).toBe(true);
    expect(
      expectsRestingTpOrder(
        settings({ dealCloseCondition: CloseConditionEnum.tp, useMultiTp: true })
      )
    ).toBe(true);
  });

  it('expects no order when TP is off, trailing, or not a Percentage close', () => {
    expect(expectsRestingTpOrder(settings({ useTp: false }))).toBe(false);
    expect(expectsRestingTpOrder(settings({ trailingTp: true }))).toBe(false);
    for (const c of [
      CloseConditionEnum.techInd,
      CloseConditionEnum.manual,
      CloseConditionEnum.webhook,
      CloseConditionEnum.dynamicAr,
    ]) {
      expect(expectsRestingTpOrder(settings({ dealCloseCondition: c }))).toBe(
        false
      );
    }
  });
});
