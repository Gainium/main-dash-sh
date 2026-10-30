import {
  CloseConditionEnum,
  closeConditionsMap,
  type DCADealsSettings,
} from '@/types';

/**
 * Returns a human-readable description of the TP or SL configuration for a deal.
 * Ported from legacy BotDealsTable.tsx `tpSLConfig`.
 *
 * Lines are separated by '\n'. Use CSS `whitespace-pre-line` or split on '\n'
 * to render multi-line output.
 */
export const tpSLConfig = (
  settings: DCADealsSettings,
  value: 'tp' | 'sl',
  combo = false
): string => {
  const tp = value === 'tp';
  let msg = '';

  if (tp && !settings.useTp) {
    return 'Not use TP';
  }
  if (!tp && !settings.useSl) {
    return 'Not use SL';
  }

  if (combo) {
    return `Target: ${tp ? settings.tpPerc : settings.slPerc}%`;
  }

  // A deal snapshot often stores the condition as null, which the engine
  // treats as the default (Percentage). Normalise once so the label and the
  // checks below agree; comparing the raw value dropped the target line.
  const tpCondition = settings.dealCloseCondition ?? CloseConditionEnum.tp;
  const slCondition = settings.dealCloseConditionSL ?? CloseConditionEnum.tp;

  msg = `Type: ${closeConditionsMap[tp ? tpCondition : slCondition]}`;

  if (
    (tp &&
      tpCondition === CloseConditionEnum.tp &&
      !settings.useMultiTp) ||
    (!tp &&
      slCondition === CloseConditionEnum.tp &&
      !settings.useMultiSl)
  ) {
    msg = `${msg}\nTarget: ${tp ? settings.tpPerc : settings.slPerc}%`;
  }

  if (tp && settings.closeByTimer) {
    msg = `${msg}\nClose by timer: ${settings.closeByTimerValue ?? 1} ${
      settings.closeByTimerUnits
    }`;
  }

  if (
    tp &&
    tpCondition === CloseConditionEnum.tp &&
    settings.trailingTp
  ) {
    msg = `${msg}\nTrailing TP: ${settings.trailingTpPerc}%`;
  }

  if (
    !tp &&
    slCondition === CloseConditionEnum.tp &&
    settings.trailingSl
  ) {
    msg = `${msg}\nUse trailing SL`;
  }

  if (
    tp &&
    settings.multiTp &&
    settings.useMultiTp &&
    tpCondition === CloseConditionEnum.tp
  ) {
    msg = `${msg}\nMulti TP: ${settings.multiTp
      .map((_tp) => `${_tp.target}%`)
      .join(', ')}`;
  }

  if (
    !tp &&
    settings.multiSl &&
    settings.useMultiSl &&
    slCondition === CloseConditionEnum.tp
  ) {
    msg = `${msg}\nMulti SL: ${settings.multiSl
      .map((_tp) => `${_tp.target}%`)
      .join(', ')}`;
  }

  if (
    tp &&
    settings.useMinTP &&
    tpCondition !== CloseConditionEnum.tp
  ) {
    msg = `${msg}\nMin TP: ${settings.minTp}%`;
  }

  if (!tp && settings.moveSL && !settings.useMultiSl) {
    msg = `${msg}\nMove SL target: ${settings.moveSLTrigger}%\nMove SL value: ${settings.moveSLValue}%`;
  }

  return msg;
};

/**
 * True when the engine keeps a take-profit order RESTING on the exchange for
 * an open deal with these settings. Not for trailing TP (the engine closes
 * at market on its own trailing level, no order is placed) nor for indicator /
 * manual / webhook / ATR closes. Combo deals take profit through their grid,
 * so callers exclude them.
 */
export const expectsRestingTpOrder = (
  settings: Pick<
    DCADealsSettings,
    'useTp' | 'dealCloseCondition' | 'trailingTp'
  >
): boolean =>
  !!settings.useTp &&
  (settings.dealCloseCondition ?? CloseConditionEnum.tp) ===
    CloseConditionEnum.tp &&
  !settings.trailingTp;
