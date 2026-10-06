import { test, expect } from '@playwright/test';

import {
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  StrategyEnum,
} from '@/types';
import { INDICATOR_CATALOG } from '@/types/indicators/indicatorCatalog';
import { validateIndicatorParams } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import { convertIndicatorConfigsToChart } from '@/utils/indicators/chartIndicatorUtils';
import { shouldHideField } from '@/utils/indicators/indicatorFieldGating';

/**
 * Indicator condition "between" (`bw`): offered on value-type indicators
 * only, with an "Upper value" input that shows only for it, both bounds
 * required, and a chart band drawn between them.
 */

const fieldsOf = (type: IndicatorEnum) => INDICATOR_CATALOG[type].fields;
const conditionField = (type: IndicatorEnum) =>
  fieldsOf(type).find((f) => f.key === 'indicatorCondition');
const upperField = (type: IndicatorEnum) =>
  fieldsOf(type).find((f) => f.key === 'indicatorValue2');

const offers = (type: IndicatorEnum) =>
  (conditionField(type)?.options ?? []).some(
    (o) => o.value === IndicatorStartConditionEnum.bw
  );

test('RSI, CCI, MFI, WR, ATR offer Between; MACD and MA do not', () => {
  for (const t of [
    IndicatorEnum.rsi,
    IndicatorEnum.cci,
    IndicatorEnum.mfi,
    IndicatorEnum.wr,
    IndicatorEnum.atr,
  ]) {
    expect(offers(t), t).toBe(true);
    expect(upperField(t), t).toBeDefined();
  }
  for (const t of [IndicatorEnum.macd, IndicatorEnum.ma]) {
    expect(offers(t), t).toBe(false);
    expect(upperField(t), t).toBeUndefined();
  }
});

test('Between is not offered once percentile is on', () => {
  const pct = conditionField(IndicatorEnum.rsi)?.optionsWhen?.find(
    (o) => o.field === 'percentile' && o.equals === true
  );
  expect(pct).toBeDefined();
  expect(
    pct!.options.some((o) => o.value === IndicatorStartConditionEnum.bw)
  ).toBe(false);
});

test('the upper value shows only for Between', () => {
  const field = upperField(IndicatorEnum.rsi)!;
  const params = (condition: IndicatorStartConditionEnum) =>
    ({ indicatorCondition: condition }) as IndicatorParamsState;
  expect(shouldHideField(field, params(IndicatorStartConditionEnum.gt))).toBe(
    true
  );
  expect(shouldHideField(field, params(IndicatorStartConditionEnum.bw))).toBe(
    false
  );
});

test('Between needs both bounds and no percentile', () => {
  const base = {
    indicatorCondition: IndicatorStartConditionEnum.bw,
    indicatorValue: '30',
    indicatorLength: 14,
    indicatorInterval: ExchangeIntervals.oneH,
  };
  expect(
    validateIndicatorParams(IndicatorEnum.rsi, {
      ...base,
      indicatorValue2: '60',
    })
  ).not.toContain('indicatorValue2');
  expect(validateIndicatorParams(IndicatorEnum.rsi, base)).toContain(
    'indicatorValue2'
  );
  expect(
    validateIndicatorParams(IndicatorEnum.rsi, {
      ...base,
      indicatorValue2: '60',
      percentile: true,
    })
  ).toContain('indicatorCondition');
});

test('the chart band runs from the lower to the upper bound', () => {
  const [chart] = convertIndicatorConfigsToChart(
    [
      {
        type: IndicatorEnum.rsi,
        indicatorLength: 14,
        indicatorValue: '60',
        indicatorValue2: '30',
        indicatorCondition: IndicatorStartConditionEnum.bw,
        indicatorInterval: ExchangeIntervals.oneH,
        indicatorAction: IndicatorAction.startDeal,
        groupId: 'g',
        uuid: 'u',
      } as IndicatorConfig,
    ],
    {
      scaleAr: false,
      tpAr: false,
      slAr: false,
      chartInterval: '60',
      strategy: StrategyEnum.long,
      indicatorGroupsToUse: ['g'],
      useCloseIndicators: false,
      useStartDealIndicators: true,
      useStartDCAIndicators: false,
      useStopBotIndicators: false,
      useStartBotIndicators: false,
      useRiskRewardIndicators: false,
    } as never
  );
  expect(chart).toBeDefined();
  expect(chart.upperLimit).toBe(60);
  expect(chart.lowerLimit).toBe(30);
});
