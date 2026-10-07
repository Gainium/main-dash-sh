import { BotTypesEnum, DCATypeEnum } from '@/types';

const coinFactor = 0.5;
// Each extra combo coin runs its own grid, so it costs a whole combo.
export const comboCoinFactor = 200;
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
    botType === BotTypesEnum.grid ||
    type === DCATypeEnum.terminal ||
    _pairs <= 1
      ? 0
      : (_pairs - 1) *
        (botType === BotTypesEnum.combo ? comboCoinFactor : coinFactor);

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
