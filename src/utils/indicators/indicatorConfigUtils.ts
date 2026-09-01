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

// `uuid`, `maUUID` and `xoUUID` are minted in the SAME tick, so the
// `indicator-${Date.now()}` scheme below cannot be reused for them — all three
// would collide. Same guarded idiom as the section-local helpers in
// BotControllerSettings.tsx / DCASettings.tsx / DynamicArIndicatorPanel.tsx.
export const createChildIndicatorId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `indicator-child-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

  // Mint the child-series ids for EVERY indicator, the way legacy does it
  // (`useSettingsComponent.ts` writes `maUUID: v4(), xoUUID: v4()` on every
  // add AND every type change). They address the SECOND series a Moving
  // Averages crossing or a Crossing Oscillator needs: with a Reference other
  // than "Current price", both the backtester
  // (`@gainium/backtester` dca/strategy/ti — `maCrossingValue !== price &&
  // maCrossingInterval && maCrossingLength && maUUID && …`) and the live
  // engine (main-app `dcaHelper` `maChild`) only CREATE the comparison
  // indicator when the id is present, then look it back up as
  // `${maUUID}@${symbol}`. With the id missing the lookup misses, the
  // comparison value collapses to 0, no crossing ever fires — the bot
  // reports zero deals in the editor's backtest and never opens one live,
  // with nothing on screen to say why.
  //
  // Only BotControllerSettings passed them in; deal start, take profit, stop
  // loss, risk-reward, dynamic AR and the DCA ladder all left them
  // undefined. This factory is the one path all of them share, so seed the
  // default here — an explicit option still wins.
  config.maUUID = options.maUUID ?? createChildIndicatorId();
  config.xoUUID = options.xoUUID ?? createChildIndicatorId();

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
