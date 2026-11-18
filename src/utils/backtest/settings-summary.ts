import {
  CloseConditionEnum,
  closeConditionsMap,
  DCAConditionEnum,
  type DCABotSettings,
} from '@/types';
import { sizeUnit } from '@/utils/bots/dca/order-size-unit';

/**
 * One-line summaries of a backtested bot's take profit, stop loss and DCA, as
 * shown in the backtest Stats tab's "Full settings".
 *
 * A percentage target is only shown when the deal really closes on it: the
 * engine prices a TP/SL from `tpPerc`/`slPerc` only when the close condition
 * is `tp`. With any other condition (indicators, webhook, …) those fields
 * keep whatever was saved last and are not used, so the condition is shown
 * instead. Move SL applies under every SL condition, so it is always listed.
 */
export type BacktestSettingsSummaryInput = Partial<
  Pick<
    DCABotSettings,
    | 'useTp'
    | 'tpPerc'
    | 'dealCloseCondition'
    | 'useMultiTp'
    | 'multiTp'
    | 'useSl'
    | 'slPerc'
    | 'dealCloseConditionSL'
    | 'useMultiSl'
    | 'multiSl'
    | 'moveSL'
    | 'moveSLTrigger'
    | 'moveSLValue'
    | 'useDca'
    | 'dcaCondition'
    | 'ordersCount'
    | 'orderSize'
    | 'orderSizeType'
    | 'step'
  >
>;

// Labels of the DCA mode tabs in the bot form (DCASettings).
const dcaConditionLabels: Record<DCAConditionEnum, string> = {
  [DCAConditionEnum.percentage]: 'Scaled',
  [DCAConditionEnum.indicators]: 'Indicators',
  [DCAConditionEnum.custom]: 'Custom',
  [DCAConditionEnum.dynamicAr]: 'Dynamic ATR/ADR',
};

const conditionLabel = (condition: CloseConditionEnum) =>
  closeConditionsMap[condition] ?? condition;

const targets = (list: { target: string }[] | undefined) =>
  (list ?? []).map((t) => `${t.target}%`).join(', ');

export const describeBacktestTp = (s?: BacktestSettingsSummaryInput) => {
  if (!s?.useTp) return 'Not use TP';
  const condition = s.dealCloseCondition ?? CloseConditionEnum.tp;
  if (condition !== CloseConditionEnum.tp) {
    return `TP: ${conditionLabel(condition)}`;
  }
  if (s.useMultiTp && s.multiTp?.length) return `TP ${targets(s.multiTp)}`;
  return `TP ${s.tpPerc || '0'}%`;
};

export const describeBacktestSl = (s?: BacktestSettingsSummaryInput) => {
  if (!s?.useSl) return 'Not use SL';
  const condition = s.dealCloseConditionSL ?? CloseConditionEnum.tp;
  let text =
    condition !== CloseConditionEnum.tp
      ? `SL: ${conditionLabel(condition)}`
      : s.useMultiSl && s.multiSl?.length
        ? `SL ${targets(s.multiSl)}`
        : `SL ${s.slPerc || '0'}%`;
  if (s.moveSL && s.moveSLTrigger != null && s.moveSLValue != null) {
    text = `${text}, Move SL ${s.moveSLTrigger}% → ${s.moveSLValue}%`;
  }
  return text;
};

export const describeBacktestDca = (
  s: BacktestSettingsSummaryInput | undefined,
  quoteAsset?: string,
  baseAsset?: string
) => {
  if (!s?.useDca) return 'DCA not used';
  const condition = s.dcaCondition ?? DCAConditionEnum.percentage;
  if (condition !== DCAConditionEnum.percentage) {
    return `DCA: ${dcaConditionLabels[condition] ?? condition}`;
  }
  const unit = sizeUnit(s.orderSizeType, quoteAsset, baseAsset);
  return `DCA max/grid's ${s.ordersCount || 5} orders each ${s.orderSize || '0.0005'}${unit} step ${s.step || '5'}% levels`;
};
