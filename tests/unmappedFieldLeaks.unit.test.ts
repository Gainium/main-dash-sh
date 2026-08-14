import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToBackend } from '@/mappers/bots/dca/field-mapping';
import {
  BotTypesEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorsLogicEnum,
  RRSlTypeEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Three features whose controls were reachable but whose fields no mapper ever
 * wrote. Because the payload is `{ ...DCA_FORM_DEFAULTS, ...mappedFields }`,
 * "not mapped" is not "not sent" — it is "sent as the factory default", so the
 * user's choice was silently replaced with no validation error to warn them.
 *
 * Each case asserts the value reaches the payload AND that the mapper reports
 * having written it, because the first is satisfied by accident whenever the
 * chosen value happens to equal the default.
 */

const build = (
  type: BotTypesEnum.dca | BotTypesEnum.combo,
  overrides: Record<string, unknown>
): BotFormData => {
  const section = type === BotTypesEnum.combo ? COMBO_FORM_DEFAULTS : DCA_FORM_DEFAULTS;
  return {
    ...SHARED_FORM_DEFAULTS,
    type,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS, ...overrides },
    combo: { ...section, ...overrides },
    grid: {},
  } as unknown as BotFormData;
};

const map = (type: BotTypesEnum.dca | BotTypesEnum.combo, overrides: Record<string, unknown>) => {
  const result = mapFormDataToBackend(build(type, overrides), null);
  return {
    errors: result.errors,
    wrote: new Set<string>((result.debugInfo?.fieldsMapped ?? []) as string[]),
    data: (result.data ?? {}) as Record<string, unknown>,
  };
};

const BOT_TYPES = [BotTypesEnum.dca, BotTypesEnum.combo] as const;

test.describe('fixed stop-loss price', () => {
  for (const type of BOT_TYPES) {
    test(`${type}: a fixed SL price reaches the payload`, () => {
      const { errors, wrote, data } = map(type, {
        useSl: true,
        useFixedSLPrices: true,
        fixedSlPrice: '25000',
      });
      expect(errors).toEqual([]);
      expect(wrote.has('useFixedSLPrices'), 'useFixedSLPrices mapped').toBe(true);
      expect(wrote.has('fixedSlPrice'), 'fixedSlPrice mapped').toBe(true);
      expect(data['useFixedSLPrices']).toBe(true);
      expect(data['fixedSlPrice']).toBe('25000');
    });

    test(`${type}: leaving fixed SL off keeps it off`, () => {
      const { data } = map(type, { useSl: true, useFixedSLPrices: false });
      expect(data['useFixedSLPrices']).toBe(false);
    });
  }

  test('the take-profit twin still behaves as before', () => {
    // The TP half was already correct; this pins that the SL addition did not
    // disturb it, since both now run in the same block.
    const { data } = map(BotTypesEnum.dca, {
      useFixedTPPrices: true,
      fixedTpPrice: '31000',
      useFixedSLPrices: true,
      fixedSlPrice: '25000',
    });
    expect(data['fixedTpPrice']).toBe('31000');
    expect(data['fixedSlPrice']).toBe('25000');
  });

  test('enabling fixed SL without a price disables the mode instead of losing it', () => {
    const { data } = map(BotTypesEnum.dca, {
      useSl: true,
      useFixedSLPrices: true,
      fixedSlPrice: '',
    });
    expect(data['useFixedSLPrices']).toBe(false);
  });
});

test.describe('bot controller AND/OR logic', () => {
  for (const type of BOT_TYPES) {
    test(`${type}: switching both lists to OR reaches the payload`, () => {
      const { errors, wrote, data } = map(type, {
        useBotController: true,
        startBotLogic: IndicatorsLogicEnum.or,
        stopBotLogic: IndicatorsLogicEnum.or,
      });
      expect(errors).toEqual([]);
      expect(wrote.has('startBotLogic'), 'startBotLogic mapped').toBe(true);
      expect(wrote.has('stopBotLogic'), 'stopBotLogic mapped').toBe(true);
      expect(data['startBotLogic']).toBe(IndicatorsLogicEnum.or);
      expect(data['stopBotLogic']).toBe(IndicatorsLogicEnum.or);
    });
  }

  test('AND survives too, so the fix is not just writing OR', () => {
    const { data } = map(BotTypesEnum.dca, {
      useBotController: true,
      startBotLogic: IndicatorsLogicEnum.and,
      stopBotLogic: IndicatorsLogicEnum.and,
    });
    expect(data['startBotLogic']).toBe(IndicatorsLogicEnum.and);
    expect(data['stopBotLogic']).toBe(IndicatorsLogicEnum.and);
  });

  test('an unrecognised value falls back to AND rather than shipping garbage', () => {
    const { data } = map(BotTypesEnum.dca, {
      useBotController: true,
      startBotLogic: 'xor',
    });
    expect(data['startBotLogic']).toBe(IndicatorsLogicEnum.and);
  });

  test('the controller being off still sends no controller fields', () => {
    // The early return in mapBotControllerFields must keep winning; the logic
    // fields are mapped after it, not before.
    const { wrote } = map(BotTypesEnum.dca, {
      useBotController: false,
      startBotLogic: IndicatorsLogicEnum.or,
    });
    expect(wrote.has('startBotLogic')).toBe(false);
  });
});

test.describe('Risk:Reward stop-loss type', () => {
  const withIndicator = (extra: Record<string, unknown>) => ({
    useRiskReward: true,
    indicators: [
      {
        uuid: 'rr-1',
        type: IndicatorEnum.atr,
        indicatorAction: IndicatorAction.riskReward,
        timeframe: '1h',
        period: '14',
      },
    ],
    ...extra,
  });

  for (const type of BOT_TYPES) {
    test(`${type}: choosing a fixed SL type and value reaches the payload`, () => {
      const { errors, wrote, data } = map(
        type,
        withIndicator({ rrSlType: RRSlTypeEnum.fixed, rrSlFixedValue: '9' })
      );
      expect(errors).toEqual([]);
      expect(wrote.has('rrSlType'), 'rrSlType mapped').toBe(true);
      expect(wrote.has('rrSlFixedValue'), 'rrSlFixedValue mapped').toBe(true);
      expect(data['rrSlType']).toBe(RRSlTypeEnum.fixed);
      expect(data['rrSlFixedValue']).toBe('9');
    });
  }

  test('the indicator type survives as well', () => {
    const { data } = map(
      BotTypesEnum.dca,
      withIndicator({ rrSlType: RRSlTypeEnum.indicator })
    );
    expect(data['rrSlType']).toBe(RRSlTypeEnum.indicator);
  });

  test('a negative fixed value is kept — an SL offset is signed', () => {
    const { data } = map(
      BotTypesEnum.dca,
      withIndicator({ rrSlType: RRSlTypeEnum.fixed, rrSlFixedValue: '-3.5' })
    );
    expect(data['rrSlFixedValue']).toBe('-3.5');
  });

  test('a non-numeric fixed value is not shipped, and warns when it matters', () => {
    const result = mapFormDataToBackend(
      build(
        BotTypesEnum.dca,
        withIndicator({ rrSlType: RRSlTypeEnum.fixed, rrSlFixedValue: 'abc' })
      ),
      null
    );
    const wrote = new Set<string>((result.debugInfo?.fieldsMapped ?? []) as string[]);
    expect(wrote.has('rrSlFixedValue')).toBe(false);
    expect(result.warnings?.some((w) => w.includes('rrSlFixedValue'))).toBe(true);
  });

  test('Risk:Reward off still sends no risk fields', () => {
    const { wrote } = map(BotTypesEnum.dca, {
      useRiskReward: false,
      rrSlType: RRSlTypeEnum.fixed,
    });
    expect(wrote.has('rrSlType')).toBe(false);
  });
});
