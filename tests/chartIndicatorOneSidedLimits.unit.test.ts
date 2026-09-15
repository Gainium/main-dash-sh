import { test, expect } from '@playwright/test';

import {
  convertIndicatorConfigsToChart,
  type ChartIndicatorsContext,
} from '@/utils/indicators/chartIndicatorUtils';
import {
  IndicatorAction,
  IndicatorEnum,
  StochRangeEnum,
  StrategyEnum,
  rsiValue2Enum,
} from '@/types';
import type { IndicatorConfig } from '@/types/indicators/indicators';

/**
 * A condition that names one level is unbounded on the other side: `less than
 * 0.05` is satisfied by every value below 0.05, so the shading has to run down
 * off the bottom of the pane. The open edge is a drawing anchor for the fill,
 * not a claim about where the indicator can go — which is why it is the same
 * number for every indicator rather than that indicator's nominal range.
 *
 * Anchoring it to a range instead (`0 … 100`) truncates the fill exactly where
 * the condition is most strongly satisfied: %B is below 0 whenever price closes
 * under the lower Bollinger band, and ATR/ADR are in price units and sit far
 * above 100, which collapses or inverts their band.
 *
 * Spec §1.1, §1.2, §3 of
 * `specs/018.one-sided-threshold-shading-clamped-to-the-nominal-range`.
 */

const context: ChartIndicatorsContext = {
  scaleAr: false,
  tpAr: false,
  slAr: false,
  chartInterval: '60',
  strategy: StrategyEnum.long,
  indicatorGroupsToUse: [],
  useCloseIndicators: false,
  useStartDealIndicators: true,
  useStartDCAIndicators: false,
  useStopBotIndicators: false,
  useStartBotIndicators: false,
  useRiskRewardIndicators: false,
};

const base = {
  enabled: true,
  condition: 'both' as const,
  indicatorAction: IndicatorAction.startDeal,
  indicatorInterval: '1h',
  indicatorLength: 20,
};

const build = (indicator: Partial<IndicatorConfig>) =>
  convertIndicatorConfigsToChart(
    [{ ...base, ...indicator } as IndicatorConfig],
    context
  )[0];

// Far enough off-pane that no indicator's real values can reach it, and finite
// so it survives the override serialisation. Same sentinel the legacy
// dashboard uses.
const OFF_PANE = 1e6;

// Spec §1.1 — the reporter's own condition: `%B less than 0.05`.
test('a `less than` condition shades downward without limit', () => {
  const chartIndicator = build({
    id: 'bbpb-lt',
    type: IndicatorEnum.bbpb,
    indicatorCondition: 'lt',
    indicatorValue: '0.05',
  });

  expect(chartIndicator.upperLimit).toBe(0.05);
  // %B goes below 0 on every close under the lower band; a floor of 0 leaves
  // those bars — the ones that satisfy the condition hardest — unshaded.
  expect(chartIndicator.lowerLimit).toBe(-OFF_PANE);
});

// Spec §1.1 — the mirror at the top.
test('a `greater than` condition shades upward without limit', () => {
  const chartIndicator = build({
    id: 'bbpb-gt',
    type: IndicatorEnum.bbpb,
    indicatorCondition: 'gt',
    indicatorValue: '0.95',
  });

  expect(chartIndicator.lowerLimit).toBe(0.95);
  expect(chartIndicator.upperLimit).toBe(OFF_PANE);
});

// Spec §1.2 / §2.2 — ATR is in price units; a ceiling of 100 put both edges on
// the same number for a level of 100, and below the level for anything higher.
test('a price-unit indicator`s `greater than` band is no longer inverted', () => {
  const chartIndicator = build({
    id: 'atr-gt',
    type: IndicatorEnum.atr,
    indicatorCondition: 'gt',
    indicatorValue: '1500',
  });

  expect(chartIndicator.lowerLimit).toBe(1500);
  expect(chartIndicator.upperLimit).toBe(OFF_PANE);
  expect(chartIndicator.upperLimit as number).toBeGreaterThan(
    chartIndicator.lowerLimit as number
  );
});

// Spec §3 — ATH drawdown is the one indicator whose assumed range IS its real
// range: it measures percent below the all-time high, so it lives in -100 … 0
// and its existing bounds already reach the edge of everything it can plot.
// They stay. This change is only about indicators that leave the assumed range.
test('ATH keeps its own bounds, which are its real domain', () => {
  const below = build({
    id: 'ath-lt',
    type: IndicatorEnum.ath,
    indicatorCondition: 'lt',
    indicatorValue: '10',
  });
  expect(below.upperLimit).toBe(-10);
  expect(below.lowerLimit).toBe(-100);

  const above = build({
    id: 'ath-gt',
    type: IndicatorEnum.ath,
    indicatorCondition: 'gt',
    indicatorValue: '10',
  });
  expect(above.lowerLimit).toBe(-10);
  expect(above.upperLimit).toBe(0);
});

// Spec §4 — the genuinely bounded oscillators keep their real limits; those
// arms sit above the condition test and must not be swept up in this change.
test('the bounded oscillators keep their real 0/100 limits', () => {
  const upper = build({
    id: 'stoch-upper',
    type: IndicatorEnum.stoch,
    stochRange: StochRangeEnum.upper,
    rsiValue2: rsiValue2Enum.overbought,
    stochLower: '20',
    indicatorCondition: 'lt',
    indicatorValue: '0.05',
  });
  expect(upper.upperLimit).toBe(100);
  expect(upper.lowerLimit).toBe(20);

  const lower = build({
    id: 'stoch-lower',
    type: IndicatorEnum.stochRSI,
    stochRange: StochRangeEnum.lower,
    rsiValue2: rsiValue2Enum.overbought,
    stochUpper: '80',
    indicatorCondition: 'gt',
    indicatorValue: '0.05',
  });
  expect(lower.upperLimit).toBe(80);
  expect(lower.lowerLimit).toBe(0);
});

// Spec §4 — `crosses up` / `crosses down` name a level to cross, not a region
// to fill. They keep exactly one edge, so the descriptor draws a single dashed
// line there and shades nothing; the opposite edge must stay absent rather
// than becoming an off-pane anchor, or the crossing turns into a band.
test('a crossing condition is unchanged', () => {
  const chartIndicator = build({
    id: 'bbpb-cu',
    type: IndicatorEnum.bbpb,
    indicatorCondition: 'cu',
    indicatorValue: '0.03',
  });

  expect(chartIndicator.upperLimit).toBe(0.03);
  expect(chartIndicator.lowerLimit).toBeUndefined();
});
