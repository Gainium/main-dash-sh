/**
 * The same indicator used in two bot sections (e.g. deal start and a DCA
 * level) is one study on the chart, and hiding it from either section hides
 * that study.
 */
import { describe, expect, it } from 'vitest';
import {
  convertIndicatorConfigsToChart,
  sameChartIndicatorUuids,
  type ChartIndicatorsContext,
} from '@/utils/indicators/chartIndicatorUtils';
import {
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  IndicatorStartConditionEnum,
  StrategyEnum,
} from '@/types';
import type { IndicatorConfig } from '@/types/indicators/indicators';

const context: ChartIndicatorsContext = {
  scaleAr: false,
  tpAr: false,
  slAr: false,
  chartInterval: '60',
  strategy: StrategyEnum.long,
  indicatorGroupsToUse: [],
  useCloseIndicators: false,
  useStartDealIndicators: true,
  useStartDCAIndicators: true,
  useStopBotIndicators: false,
  useStartBotIndicators: false,
  useRiskRewardIndicators: false,
};

const rsi = (
  uuid: string,
  indicatorAction: IndicatorAction,
  extra: Partial<IndicatorConfig> = {}
): IndicatorConfig =>
  ({
    uuid,
    type: IndicatorEnum.rsi,
    indicatorAction,
    ...(indicatorAction === IndicatorAction.startDca
      ? { section: IndicatorSection.dca }
      : {}),
    indicatorInterval: '1h',
    indicatorLength: 14,
    indicatorValue: '30',
    indicatorCondition: IndicatorStartConditionEnum.lt,
    ...extra,
  }) as IndicatorConfig;

const start = rsi('start', IndicatorAction.startDeal);
const dca = rsi('dca', IndicatorAction.startDca, { dcaLevel: 'dca' });

describe('chart identity of indicators', () => {
  it('the same RSI in deal start and a DCA level is drawn once', () => {
    const drawn = convertIndicatorConfigsToChart([start, dca], context);
    expect(drawn.map((c) => c.uuid)).toEqual(['start']);
  });

  it('hiding either copy hides the study', () => {
    expect(
      convertIndicatorConfigsToChart(
        [start, { ...dca, hideOnChart: true }],
        context
      )
    ).toEqual([]);
    expect(
      convertIndicatorConfigsToChart(
        [{ ...start, hideOnChart: true }, dca],
        context
      )
    ).toEqual([]);
  });

  it('a copy that draws differently is its own study', () => {
    const other = { ...dca, indicatorLength: 21 } as IndicatorConfig;
    expect(
      convertIndicatorConfigsToChart([start, other], context).map(
        (c) => c.uuid
      )
    ).toEqual(['start', 'dca']);
    expect(
      convertIndicatorConfigsToChart(
        [start, { ...other, hideOnChart: true }],
        context
      ).map((c) => c.uuid)
    ).toEqual(['start']);
  });

  it('the toggle reaches every copy of the study, and only those', () => {
    const other = rsi('other', IndicatorAction.startDca, {
      indicatorLength: 21,
    });
    expect(
      sameChartIndicatorUuids([start, dca, other], 'dca', context).sort()
    ).toEqual(['dca', 'start']);
  });
});
