/**
 * Random-entry band (spec 150 §2.2): the bot as the random runs test it —
 * its own settings with the start condition replaced by an always-true one,
 * so every bar asks `approveNewDeal` and the entry gate decides.
 */
import {
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  IndicatorsLogicEnum,
  StartConditionEnum,
  type DCABotSettings,
  type ExchangeIntervals,
  type SettingsIndicators,
} from '@gainium/backtester/dist/types';

const RANDOM_GROUP = 'random-entry';

/** Only a bot that waits for an indicator signal has entries to randomise (§1.3). */
export const hasRandomisableEntries = (
  s: Pick<DCABotSettings, 'startCondition'>
) => s.startCondition === StartConditionEnum.ti;

/**
 * RSI is never below 0, so `RSI(14) > -1` is true on every bar once it is
 * warm. Not ASAP: an ASAP bot opens a pair's next deal only when its last one
 * closed, so it could not stack deals the way the strategy did. Exits, DCA,
 * filters and the bot controller stay the bot's own.
 */
export function randomEntrySettings(
  s: DCABotSettings,
  interval: ExchangeIntervals
): DCABotSettings {
  const rsi = {
    type: IndicatorEnum.rsi,
    indicatorLength: 14,
    indicatorCondition: IndicatorStartConditionEnum.gt,
    indicatorValue: '-1',
    indicatorInterval: interval,
    indicatorAction: IndicatorAction.startDeal,
    groupId: RANDOM_GROUP,
    uuid: RANDOM_GROUP,
  } as SettingsIndicators;
  return {
    ...s,
    startCondition: StartConditionEnum.ti,
    indicatorGroups: [
      ...(s.indicatorGroups ?? []).filter(
        (g) => g.action !== IndicatorAction.startDeal
      ),
      {
        id: RANDOM_GROUP,
        logic: IndicatorsLogicEnum.and,
        action: IndicatorAction.startDeal,
      },
    ],
    indicators: [
      ...(s.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.startDeal
      ),
      rsi,
    ],
  };
}
