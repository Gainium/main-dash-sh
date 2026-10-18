import {
  useBotFormSelector,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { useHedgeBotFormOptional } from '@/contexts/bots/form/HedgeBotFormProvider';
import { toBaseFundingMode } from '@/lib/baseFunding/baseFundingApi';
import {
  BaseFundingEnum,
  BotTypesEnum,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  StrategyEnum,
} from '@/types';

/**
 * Base funding for the bot form (main-app spec 044): whether the setting
 * applies to this form (`applies` — where the engine uses it, and only once the
 * backend is known to have it), and whether it is switched on (`active`). With
 * it on, the deal does not need the base coin in the account, so order-size
 * inputs must not flag a size above the free base balance.
 */
export function useBaseFundingState() {
  const supported = useBotFormTopLevelSelector('baseFundingSupported');
  const terminal = useBotFormTopLevelSelector('terminal');
  const botType = useBotFormTopLevelSelector('type');
  const isHedgeContext = useHedgeBotFormOptional() !== undefined;
  const baseFunding = useBotFormSelector('baseFunding');
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const startOrderType = useBotFormSelector('startOrderType');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const applies =
    !!supported &&
    !terminal &&
    !isHedgeContext &&
    !futures &&
    !useRiskReward &&
    strategy === StrategyEnum.short &&
    // Combo always enters at market, whatever `startOrderType` it carries.
    (botType === BotTypesEnum.combo ||
      startOrderType === OrderTypeEnum.market) &&
    [
      OrderSizeTypeEnum.base,
      OrderSizeTypeEnum.quote,
      OrderSizeTypeEnum.usd,
    ].includes(orderSizeType as OrderSizeTypeEnum);
  const mode = toBaseFundingMode(baseFunding);
  return { applies, mode, active: applies && mode !== BaseFundingEnum.require };
}
