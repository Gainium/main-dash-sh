import { useMemo } from 'react';
import type { BotFormData, PairPrecisionInfo } from '@/types/bots/form';
import { useBotFormDcaTradingContext } from './useDcaTradingContext';
import { useRiskRewardRuntime } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import {
  calculateRiskReward,
  parseNumeric,
  type RuntimeInputs,
  type RiskRewardCalculations,
} from './riskRewardEngine';
import { BotMarginTypeEnum, IndicatorAction, RRSlTypeEnum } from '@/types';
import {
  useBotFormSelector,
  useBotFormTopLevelSelector,
} from '@/features/bots';

const resolvePrecision = (
  precisionMap: BotFormData['pairPrecisionMap'],
  pairKey?: string
): PairPrecisionInfo | undefined => {
  if (!precisionMap || !pairKey) {
    return undefined;
  }

  const normalizedKey = pairKey.toUpperCase();
  return precisionMap[normalizedKey];
};

interface UseRiskRewardOptions {
  // ATR multiplier for dynamic SL calculation
  atrMultiplier?: number;
  // Current ATR value (will be integrated with indicator system later)
  atrValue?: number;
  // Whether to use ATR for SL calculation
  useAtrForSl?: boolean;
}
export const useRiskReward = (
  options: UseRiskRewardOptions = {}
): RiskRewardCalculations => {
  const tradingContext = useBotFormDcaTradingContext();
  const formPairPrecisionMap = useBotFormTopLevelSelector('pairPrecisionMap');
  const formPair = useBotFormTopLevelSelector('pair');
  const formTerminal = useBotFormTopLevelSelector('terminal');
  const { runtime } = useRiskRewardRuntime();

  const precisionInfo = useMemo(() => {
    const activePairKey = tradingContext.activePair?.pair;
    if (activePairKey) {
      const resolved = resolvePrecision(
        formPairPrecisionMap,
        activePairKey
      );
      if (resolved) {
        return resolved;
      }
    }

    const fallbackPair = Array.isArray(formPair)
      ? formPair[0]
      : undefined;
    return resolvePrecision(formPairPrecisionMap, fallbackPair);
  }, [
    formPairPrecisionMap,
    formPair,
    tradingContext.activePair?.pair,
  ]);

  const indicators = useBotFormSelector('indicators');

  const riskIndicatorMeta = useMemo(() => {
    const i = indicators.filter(
      (i) => i.indicatorAction === IndicatorAction.riskReward
    );

    const atrIndicator = i.find(
      (indicator) =>
        typeof indicator?.type === 'string' &&
        indicator.type.toLowerCase() === 'atr'
    );

    const parsedMultiplier = atrIndicator
      ? parseNumeric(atrIndicator['riskAtrMult'])
      : undefined;

    return {
      usesAtr: Boolean(atrIndicator),
      atrMultiplier:
        parsedMultiplier && parsedMultiplier > 0 ? parsedMultiplier : undefined,
    };
  }, [indicators]);

  const effectiveOptions = useMemo(() => {
    if (!riskIndicatorMeta.usesAtr) {
      return options;
    }

    return {
      ...options,
      useAtrForSl: options.useAtrForSl ?? true,
      atrMultiplier:
        options.atrMultiplier ?? riskIndicatorMeta.atrMultiplier ?? 1,
    } satisfies UseRiskRewardOptions;
  }, [options, riskIndicatorMeta]);
  const riskSlType = useBotFormSelector('riskSlType');
  const riskSlAmountPerc = useBotFormSelector('riskSlAmountPerc');
  const riskSlAmountValue = useBotFormSelector('riskSlAmountValue');
  const riskTpRatio = useBotFormSelector('riskTpRatio');
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const riskUseTpRatio = useBotFormSelector('riskUseTpRatio');
  const riskMinSl = useBotFormSelector('riskMinSl');
  const riskMaxSl = useBotFormSelector('riskMaxSl');
  const riskMinPositionSize = useBotFormSelector('riskMinPositionSize');
  const riskMaxPositionSize = useBotFormSelector('riskMaxPositionSize');
  const leverageInput = useBotFormSelector('leverage');
  const marginType = useBotFormSelector('marginType');
  const rrSlType = useBotFormSelector('rrSlType');
  const rrSlFixedValue = useBotFormSelector('rrSlFixedValue');

  const calculations = useMemo(() => {
    const runtimePayload: RuntimeInputs = {};
    if (typeof runtime.stopLossPrice === 'number') {
      runtimePayload.stopLossPrice = runtime.stopLossPrice;
    }
    if (typeof runtime.atrValue === 'number') {
      runtimePayload.atrValue = runtime.atrValue;
    }
    if (typeof runtime.atrMultiplier === 'number') {
      runtimePayload.atrMultiplier = runtime.atrMultiplier;
    }
    if (typeof runtime.useAtrForSl === 'boolean') {
      runtimePayload.useAtrForSl = runtime.useAtrForSl;
    }

    const indicatorPayload =
      riskIndicatorMeta.atrMultiplier !== undefined
        ? {
            usesAtr: riskIndicatorMeta.usesAtr,
            atrMultiplier: riskIndicatorMeta.atrMultiplier,
          }
        : {
            usesAtr: riskIndicatorMeta.usesAtr,
          };

    return calculateRiskReward({
      latestPrice: tradingContext.latestPrice,
      baseAsset: tradingContext.baseAsset,
      quoteAsset: tradingContext.quoteAsset,
      aggregatedBalances: tradingContext.aggregatedBalances,
      precisionInfo,
      strategy,
      futures: !!futures,
      coinm: !!coinm,
      leverageInput: leverageInput || 1,
      marginType: marginType || BotMarginTypeEnum.isolated,
      riskSlType,
      riskSlAmountPerc,
      riskSlAmountValue,
      riskTpRatio,
      riskUseTpRatio,
      riskMinSl,
      riskMaxSl,
      riskMinPositionSize,
      riskMaxPositionSize,
      useRiskReward,
      indicatorMeta: indicatorPayload,
      runtime: runtimePayload,
      effectiveOptions,
      rrSlType: rrSlType || RRSlTypeEnum.indicator,
      rrSlFixedValue: rrSlFixedValue || '2',
      terminal: !!formTerminal,
    });
  }, [
    tradingContext.latestPrice,
    tradingContext.baseAsset,
    tradingContext.quoteAsset,
    tradingContext.aggregatedBalances,
    precisionInfo,
    strategy,
    futures,
    coinm,
    leverageInput,
    marginType,
    riskSlType,
    riskSlAmountPerc,
    riskSlAmountValue,
    riskTpRatio,
    riskUseTpRatio,
    riskMinSl,
    riskMaxSl,
    riskMinPositionSize,
    riskMaxPositionSize,
    useRiskReward,
    riskIndicatorMeta,
    runtime.stopLossPrice,
    runtime.atrValue,
    runtime.atrMultiplier,
    runtime.useAtrForSl,
    effectiveOptions,
    rrSlType,
    rrSlFixedValue,
    formTerminal,
  ]);

  return calculations;
};
