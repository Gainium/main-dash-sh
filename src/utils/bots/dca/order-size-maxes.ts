import {
  BotMarginTypeEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
} from '@/types';
import { math } from '@/utils/math';

/**
 * Inputs for the legacy `maxAmount` / `maxTotal` computations used by the
 * trading terminal's dual Amount/Total order-size fields. Ported verbatim from
 * the legacy `TerminalBotSettings` (lines 366-484): the strategy / futures /
 * import / coinm / leverage branches encode which balance side caps the order.
 */
export interface OrderSizeMaxParams {
  /** Free balance of the base asset. */
  baseFree: number;
  /** Free balance of the quote asset. */
  quoteFree: number;
  /** Effective reference price (limit-or-market resolved). */
  price: number;
  /** Taker/maker fee fraction (spot uses the user fee, futures uses 0). */
  fee: number;
  strategy?: StrategyEnum;
  terminalDealType?: TerminalDealTypeEnum;
  futures: boolean;
  coinm: boolean;
  marginType?: BotMarginTypeEnum;
  /** Resolved leverage multiplier (>= 1). */
  leverage: number;
  /** Quote asset minimum amount for coinm contracts, else 1. */
  minAmount: number;
  precisionBase: number;
  precisionQuote: number;
}

const resolveLeverage = (
  marginType: BotMarginTypeEnum | undefined,
  leverage: number
): number => (marginType !== BotMarginTypeEnum.inherit ? (leverage ?? 1) : 1);

/** Legacy `maxTotal` (lines 366-429). Returned as a `convertFromExponential` string. */
export const computeMaxTotal = (p: OrderSizeMaxParams): string => {
  const {
    baseFree,
    quoteFree,
    price,
    fee,
    strategy,
    terminalDealType,
    futures,
    coinm,
    marginType,
    leverage: rawLeverage,
    minAmount,
    precisionQuote,
  } = p;

  if (
    (strategy === StrategyEnum.long &&
      terminalDealType !== TerminalDealTypeEnum.import) ||
    futures ||
    (strategy === StrategyEnum.short &&
      terminalDealType === TerminalDealTypeEnum.import)
  ) {
    const leverage = resolveLeverage(marginType, rawLeverage);
    if (coinm) {
      return math.convertFromExponential(
        math.round(
          ((baseFree * price) / (minAmount || 1)) * (1 - fee) * leverage,
          0,
          true
        ),
        0
      );
    }
    return math.convertFromExponential(
      math.round(quoteFree * (1 - fee) * leverage, precisionQuote, true),
      precisionQuote
    );
  }

  // Long import is fee-free (see `computeMaxAmount`), so the Total side must
  // not shave a fee off either — this value also feeds the Total field's
  // `availableBalance`, so a shaved cap flags a full-balance import as
  // insufficient and keeps the two fields disagreeing about the same position.
  if (
    strategy === StrategyEnum.long &&
    terminalDealType === TerminalDealTypeEnum.import
  ) {
    return math.convertFromExponential(
      math.round(baseFree * price, precisionQuote, true),
      precisionQuote
    );
  }

  return math.convertFromExponential(
    math.round(baseFree * price * (1 - fee), precisionQuote, true),
    precisionQuote
  );
};

/** Legacy `maxAmount` (lines 431-484). Returned as a `convertFromExponential` string. */
export const computeMaxAmount = (p: OrderSizeMaxParams): string => {
  const {
    baseFree,
    quoteFree,
    price,
    fee,
    strategy,
    terminalDealType,
    futures,
    coinm,
    marginType,
    leverage: rawLeverage,
    precisionBase,
  } = p;

  // A LONG import places no order: the base is already held, so main-app's
  // `dcaHelper.getBaseOrder` synthesizes a `status:'FILLED'`, `orderId:'-1'`,
  // `fills:[]` bookkeeping order instead of hitting the exchange. Nothing is
  // charged on the base side, so discounting the cap by the fee only strands
  // dust the user then has to sell by hand (bug #494). The whole free balance
  // is importable — main-app's own `checkBalance` requires just
  // `qty * (1 - makerFee)`, so the full balance clears it with room to spare.
  if (
    strategy === StrategyEnum.long &&
    terminalDealType === TerminalDealTypeEnum.import
  ) {
    return math.convertFromExponential(
      math.round(baseFree, precisionBase, true),
      precisionBase
    );
  }

  // A spot short DOES place a real sell order, so it keeps the fee margin.
  if (
    strategy === StrategyEnum.short &&
    terminalDealType !== TerminalDealTypeEnum.import &&
    !futures
  ) {
    return math.convertFromExponential(
      math.round(baseFree * (1 - fee), precisionBase, true),
      precisionBase
    );
  }

  const leverage = resolveLeverage(marginType, rawLeverage);
  if (coinm) {
    return math.convertFromExponential(
      math.round(baseFree * (1 - fee), precisionBase, true),
      precisionBase
    );
  }
  return math.convertFromExponential(
    math.round((quoteFree / (price || 1)) * (1 - fee) * leverage, precisionBase, true),
    precisionBase
  );
};
