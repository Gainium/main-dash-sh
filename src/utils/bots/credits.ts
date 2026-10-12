import {
  BotTypesEnum,
  DCAConditionEnum,
  DCATypeEnum,
  IndicatorAction,
} from '@/types';

const coinFactor = 0.5;
// Each coin a combo can trade at the same time is its own market, so it is
// priced as one combo: min(coins, max open deals) combos. Max open deals <= 0
// is unlimited, so every coin counts. Mirrors main-app's calculateCost.
export const comboCoinFactor = 200;
export const comboParallelCoins = (pairs: number, deals: number): number =>
  Math.max(1, deals > 0 ? Math.min(pairs, deals) : pairs);
const indicatorFactor = 1;
const dealsFactor = 1;
export const gridBaseCost = 250;
export const comboBaseCost = 200;
export const dcaBaseCost = 50;
export const terminalCost = 10;

export const calculateCost = ({
  botType,
  pairs: _pairs,
  indicators: _indicators,
  deals: _deals,
  type,
  affiliate,
}: {
  botType: BotTypesEnum;
  pairs: number;
  indicators: number;
  deals: number;
  type?: DCATypeEnum | undefined;
  affiliate: boolean;
}): {
  base: number;
  indicators: number;
  pairs: number;
  total: number;
  deals: number;
} => {
  if (affiliate) {
    return {
      base: 0,
      indicators: 0,
      pairs: 0,
      total: 0,
      deals: 0,
    };
  }

  const base =
    botType === BotTypesEnum.grid
      ? gridBaseCost
      : botType === BotTypesEnum.dca
        ? type === DCATypeEnum.terminal
          ? terminalCost
          : dcaBaseCost
        : comboBaseCost;
  const indicators =
    botType === BotTypesEnum.grid
      ? 0
      : botType === BotTypesEnum.dca && type === DCATypeEnum.terminal
        ? _indicators * indicatorFactor
        : _indicators * _pairs * indicatorFactor;
  const pairs =
    botType === BotTypesEnum.combo
      ? (comboParallelCoins(_pairs, _deals) - 1) * comboCoinFactor
      : botType === BotTypesEnum.grid ||
          type === DCATypeEnum.terminal ||
          _pairs <= 1
        ? 0
        : (_pairs - 1) * coinFactor;

  const deals =
    botType === BotTypesEnum.grid ||
    type === DCATypeEnum.terminal ||
    _deals <= 10
      ? 0
      : (_deals - 10) * dealsFactor;

  return {
    base,
    indicators,
    pairs,
    deals,
    total: Math.floor(base + indicators + pairs + deals),
  };
};

/**
 * How many indicators a bot counts as, for its credits and for the
 * `indicatorsLimit` cap. With DCA by indicators each `startDca` indicator is
 * one ladder level, and a deal only listens to its next one, so the whole
 * ladder counts as ONE indicator. Every other indicator counts once.
 * Mirrors main-app-sh's `billableIndicators`.
 */
export const billableIndicators = (
  indicators: { indicatorAction?: IndicatorAction }[] | null | undefined,
  dcaCondition: DCAConditionEnum | string | null | undefined,
): number => {
  const all = indicators ?? [];
  if (dcaCondition !== DCAConditionEnum.indicators) {
    return all.length;
  }
  const ladder = all.filter(
    (i) => i.indicatorAction === IndicatorAction.startDca,
  ).length;
  return all.length - ladder + (ladder > 0 ? 1 : 0);
};
