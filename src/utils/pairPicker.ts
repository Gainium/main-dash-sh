import { isCoinmExchange } from '@/utils/exchangeUtils';
import { isPairSymbolReconstructable } from '@/utils/pairs';

/**
 * The exchange-native symbol to show next to the base ticker, or null when
 * the pair is plainly `BASE/QUOTE`. Contract markets (`BTCUSD_261225`,
 * `BTCUSDT-25SEP26`) all read `BASE / QUOTE`; without the native symbol
 * every expiry on the venue renders as the same row.
 */
export const pairContractSymbol = (
  symbol: string,
  baseAsset: string | undefined,
  quoteAsset: string | undefined
): string | null => {
  if (!baseAsset || !quoteAsset) return null;
  return isPairSymbolReconstructable(symbol, baseAsset, quoteAsset)
    ? null
    : symbol;
};

/** The pair fields the min-order rule reads (a `TradingPair` satisfies it). */
export interface MinOrderPair {
  exchange?: string;
  baseAsset?: { minAmount?: number | null } | null;
  quoteAsset?: { minAmount?: number | null } | null;
}

const positive = (n: unknown): number | null => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * The smallest order the exchange accepts for a pair, in its quote asset:
 * the larger of the quote minimum and the base minimum at `price`.
 *
 * Null when it can't be stated exactly — a coin-margined contract (there
 * `quoteAsset.minAmount` is the contract size, not a minimum), or a base
 * minimum with no price to convert it. Never a partial guess: a figure shown
 * as the exchange minimum has to be one.
 */
export const pairMinOrderQuote = (
  pair: MinOrderPair,
  price: number | undefined
): number | null => {
  if (isCoinmExchange(pair.exchange)) return null;
  const quoteMin = positive(pair.quoteAsset?.minAmount);
  const baseMin = positive(pair.baseAsset?.minAmount);
  if (baseMin === null) return quoteMin;
  const p = positive(price);
  if (p === null) return null;
  return Math.max(quoteMin ?? 0, baseMin * p);
};

/** The DCA settings the order-size side of the fit check reads. */
export interface FitOrderSettings {
  orderSizeType?: string | null;
  baseOrderSize?: string | number | null;
  orderSize?: string | number | null;
  useDca?: boolean | null;
  allowRaiseToExchangeMin?: boolean | null;
}

/**
 * The bot's smallest order in its quote asset — the one that has to clear the
 * exchange minimum — or null when the check doesn't apply: sizes not set in
 * the quote asset, or "raise to exchange minimum" on (the engine lifts the
 * order to the minimum, so every pair works).
 */
export const resolveBotSmallestOrderQuote = (
  dca: FitOrderSettings
): number | null => {
  if (dca.orderSizeType !== 'quote') return null;
  if (dca.allowRaiseToExchangeMin) return null;
  const sizes = [
    positive(dca.baseOrderSize),
    dca.useDca === false ? null : positive(dca.orderSize),
  ].filter((v): v is number => v !== null);
  return sizes.length ? Math.min(...sizes) : null;
};

/**
 * The bot's first order (the base order) in its quote asset — what the free
 * balance has to cover for a deal to open — or null when sizes aren't set in
 * the quote asset.
 */
export const resolveBotFirstOrderQuote = (
  dca: Pick<FitOrderSettings, 'orderSizeType' | 'baseOrderSize'>
): number | null =>
  dca.orderSizeType === 'quote' ? positive(dca.baseOrderSize) : null;

export interface PairFitBot {
  /** From `resolveBotSmallestOrderQuote`; null skips the order check. */
  smallestOrderQuote: number | null;
  /** The bot's leverage on a futures account; null skips the check. */
  leverage: number | null;
  /** From `resolveBotFirstOrderQuote`; null/absent skips the balance check. */
  firstOrderQuote?: number | null;
}

export interface PairFitFacts {
  minOrder: number | null;
  maxLeverage: number | null;
  quote: string;
  /** Free balance of the pair's quote asset; absent = unknown (no check). */
  freeQuote?: number | null;
}

/** An exchange minimum for display, trimmed: 5, 0.0001, 12.35. */
export const formatMinOrder = (n: number): string =>
  Number(n.toPrecision(4)).toLocaleString('en-US', {
    maximumFractionDigits: 8,
  });

const fmt = (n: number) =>
  Number(n.toPrecision(6)).toLocaleString('en-US', {
    maximumFractionDigits: 8,
  });

/**
 * Why the bot can't trade this pair with its current settings, or null when
 * it can. Missing data never makes a pair unfit.
 */
export const pairFitReason = (
  pair: PairFitFacts,
  bot: PairFitBot
): string | null => {
  if (
    bot.smallestOrderQuote !== null &&
    pair.minOrder !== null &&
    bot.smallestOrderQuote < pair.minOrder
  ) {
    return `Exchange minimum ${fmt(pair.minOrder)} ${pair.quote} is above your ${fmt(
      bot.smallestOrderQuote
    )} ${pair.quote} order`;
  }
  if (
    bot.leverage !== null &&
    pair.maxLeverage !== null &&
    bot.leverage > pair.maxLeverage
  ) {
    return `Max leverage ${fmt(pair.maxLeverage)}× is below your bot's ${fmt(
      bot.leverage
    )}×`;
  }
  if (
    bot.firstOrderQuote != null &&
    pair.freeQuote != null &&
    pair.freeQuote < bot.firstOrderQuote
  ) {
    return `Not enough ${pair.quote}: ${fmt(pair.freeQuote)} free, the base order needs ${fmt(
      bot.firstOrderQuote
    )}`;
  }
  return null;
};
