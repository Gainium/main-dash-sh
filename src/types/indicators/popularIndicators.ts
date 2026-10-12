import { IndicatorEnum, type IndicatorAction } from '@/types';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorDefinition } from '@/types/indicators/indicatorTypes';

/** The indicators most traders reach for first, in menu order. */
const POPULAR_INDICATOR_TYPES: IndicatorEnum[] = [
  IndicatorEnum.rsi,
  IndicatorEnum.macd,
  IndicatorEnum.bb,
  IndicatorEnum.ma,
  IndicatorEnum.stochRSI,
  IndicatorEnum.st,
  IndicatorEnum.tv,
];

/** Popular indicators that support `action` (all of them when omitted). */
export const getPopularIndicators = (
  action?: IndicatorAction
): IndicatorDefinition[] =>
  POPULAR_INDICATOR_TYPES.map((type) => getIndicatorDefinition(type)).filter(
    (definition) =>
      !definition.pendingPort &&
      (!action || definition.supportedActions.includes(action))
  );
