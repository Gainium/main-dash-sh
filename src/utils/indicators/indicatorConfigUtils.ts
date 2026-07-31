import type { IndicatorConfig } from '@/types/indicators/indicators';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
  CloseConditionEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
} from '@/types';

/** The only indicator types Dynamic ATR/ADR can derive a distance from. */
export const DYNAMIC_AR_ALLOWED_TYPES: IndicatorEnum[] = [
  IndicatorEnum.atr,
  IndicatorEnum.adr,
];

/**
 * Take-profit and stop-loss close indicators share ONE array; `section`
 * splits them. Test `!== sl` for the take-profit side rather than `=== tp`:
 * the payload mapper serializes take-profit close indicators with
 * `section: undefined`, so a reloaded bot carries no stamp at all.
 */
export const isCloseIndicatorOfSection = (
  indicator: Pick<IndicatorConfig, 'indicatorAction' | 'section'>,
  section: IndicatorSection.tp | IndicatorSection.sl
): boolean =>
  indicator.indicatorAction === IndicatorAction.closeDeal &&
  (section === IndicatorSection.sl
    ? indicator.section === IndicatorSection.sl
    : indicator.section !== IndicatorSection.sl);

/**
 * Which close indicators a given close condition actually consumes —
 * the single rule the panels, the seeds, validation and the payload
 * mapper all share, so what the UI shows and what we save cannot drift.
 *
 * `groupId` splits the two indicator-bearing modes: Indicators is always
 * grouped (the backend close decision iterates groups and has no
 * ungrouped fallback), Dynamic ATR/ADR is always ungrouped. Percentage
 * and webhook consume none.
 */
export const isCloseIndicatorUsedByCondition = (
  indicator: Pick<IndicatorConfig, 'groupId' | 'type'>,
  condition: CloseConditionEnum | undefined
): boolean => {
  if (condition === CloseConditionEnum.techInd) {
    return Boolean(indicator.groupId);
  }
  if (condition === CloseConditionEnum.dynamicAr) {
    return (
      !indicator.groupId &&
      DYNAMIC_AR_ALLOWED_TYPES.includes(indicator.type as IndicatorEnum)
    );
  }
  return false;
};

type IndicatorParamRecord = IndicatorParamsState;

type CreateIndicatorConfigOptions = Partial<
  Omit<IndicatorConfig, 'uuid' | 'type' | 'params'>
> & {
  uuid?: string;
  groupId?: string;
  indicatorAction?: IndicatorAction;
  maUUID?: string;
  xoUUID?: string;
};

export const sanitizeIndicatorParams = (
  params: IndicatorParamsState
): IndicatorParamRecord => {
  return Object.entries(params).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value === undefined || value === null) {
        return acc;
      }

      const k = key as keyof IndicatorParamsState;

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed.length) {
          return acc;
        }
        acc[k as string] = trimmed;
        return acc;
      }

      acc[k as string] = value;
      return acc;
    },
    {}
  ) as IndicatorParamRecord;
};

export const buildIndicatorConfig = (
  type: IndicatorEnum,
  params: IndicatorParamsState,
  options: CreateIndicatorConfigOptions = {}
): IndicatorConfig => {
  const normalizedParams = sanitizeIndicatorParams(params);

  const config: IndicatorConfig = {
    ...normalizedParams,
    uuid: options.uuid ?? `indicator-${Date.now()}`,
    type,
  };

  if (options.groupId !== undefined) {
    config.groupId = options.groupId;
  }

  if (options.indicatorAction !== undefined) {
    config.indicatorAction = options.indicatorAction;
  }

  if (options.maUUID !== undefined) {
    config.maUUID = options.maUUID;
  }

  if (options.xoUUID !== undefined) {
    config.xoUUID = options.xoUUID;
  }

  if (options.keepConditionBars !== undefined) {
    config.keepConditionBars = options.keepConditionBars;
  }

  if (options.minPercFromLast !== undefined) {
    config.minPercFromLast = options.minPercFromLast;
  }

  if (options.orderSize !== undefined) {
    config.orderSize = options.orderSize;
  }

  return config;
};
