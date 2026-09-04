import type { Fields } from '@/features/bots';
import type { PrecisionGuard } from '@/features/bots/shared/utils/order-guard';
import type { VarBindingPath } from '@/hooks/bots/global-variables/useBotVarBinding';
import type { TradingPair } from '@/hooks/useTradingPairs';
import {
  BotTypesEnum,
  CloseConditionEnum,
  ComboTpBase,
  IndicatorEnum,
  InitialPriceFromEnum,
  type BotSettings,
  type ComboBotSettings,
  type DCABotSettings,
  type ExchangeInUser,
} from '@/types';

export interface PairPrecisionInfo {
  pricePrecision: number;
  baseStep: number;
  minBaseAmount: number;
  minQuoteAmount: number;
}

export interface UserFeeInfo {
  symbol: string;
  makerCommission: number;
  takerCommission: number;
}

export type DCAErrorAdditionalField =
  | 'stopIndicators'
  | 'startIndicators'
  | 'indicatorsClose'
  | 'indicatorsDca'
  | 'indicatorsCloseSL';

export type BotFormErrors = Partial<
  Record<DCAErrorAdditionalField | Fields | VarBindingPath, string>
>;

export type AlertVariant = 'error' | 'warning' | 'info';

export interface BotFormAlert {
  variant: AlertVariant;
  /** Title shown inline in the chip */
  title?: string;
  /** Short description shown in a tooltip */
  description?: string;
  /** Backwards-compatible: message will be used as title if title is not provided */
  message: string;
  /** Optional navigation id used to link from the footer summary */
  navId?: string;
}

export type BotFormAlerts = Partial<
  Record<DCAErrorAdditionalField | Fields | VarBindingPath, BotFormAlert[]>
>;

type DCABot = Omit<DCABotSettings, 'pair' | 'name'> & {
  //TODO: remove when backend will be updated
  useExperimental?: boolean;
  /** Deal-edit only: manual breakeven price override for an open deal. */
  avgPrice?: number;
  /** Deal-edit only: uuids of `multiTp`/`multiSl` targets that already filled. */
  tpSlTargetFilled?: string[];
};

type ComboBot = Omit<ComboBotSettings, 'pair' | 'name'> & {
  //TODO: remove when backend will be updated
  useExperimental?: boolean;
  /** Deal-edit only: manual breakeven price override for an open deal. */
  avgPrice?: number;
  /** Deal-edit only: uuids of `multiTp`/`multiSl` targets that already filled. */
  tpSlTargetFilled?: string[];
};

type GridBot = Omit<BotSettings, 'pair' | 'name'>;

export interface BotFormData {
  exchangeUUID?: string;
  [BotTypesEnum.dca]: DCABot;
  [BotTypesEnum.combo]: ComboBot;
  [BotTypesEnum.grid]: GridBot;
  /* hedge: {
    long: {
      type: BotTypesEnum;
      settings: Omit<DCABotSettings, 'pair' | 'name'>;
    };
    short: {
      type: BotTypesEnum;
      settings: Omit<DCABotSettings, 'pair' | 'name'>;
    };
  }; */
  originalBot?:
    | {
        type: BotTypesEnum.dca;
        settings: DCABot;
      }
    | {
        type: BotTypesEnum.combo;
        settings: ComboBot;
      }
    | {
        type: BotTypesEnum.grid;
        settings: GridBot;
      };
  type: BotTypesEnum;
  userFee: UserFeeInfo | null;
  pairMetadata: Record<string, TradingPair>;
  pairPrecisionMap: Record<string, PairPrecisionInfo>;
  favoriteIndicators: IndicatorEnum[];
  pair: string | string[];
  name: string;
  orderSizeReference?: 'notional' | 'cost';
  initialPrice?: string;
  initialPriceFrom?: InitialPriceFromEnum;
  askToReset?: boolean;
  dcaOrderGuard?: PrecisionGuard | null | undefined;
  terminal: boolean;
}

/* export type HedgeLegFormDraft = Partial<
  Pick<BotFormData, 'hedge'>['hedge']['long']
>; */

/* export interface HedgeLegFormState {
  type: NonNullable<BotFormData['type']>;
  form: HedgeLegFormDraft;
} */

export interface HedgeSharedSettingsState {
  useTp: boolean;
  tpPerc: string;
  dealCloseCondition: CloseConditionEnum;
  useSl: boolean;
  slPerc: string;
  comboTpLimit: boolean;
  comboTpBase: ComboTpBase;
  comboSlLimit: boolean;
  dealCloseConditionSL: CloseConditionEnum;
}

/* export interface HedgeFormState {
  shared: HedgeSharedSettingsState;
  long: HedgeLegFormState;
  short: HedgeLegFormState;
} */

export type ExchangeBotForm = ExchangeInUser;
