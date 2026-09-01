import { AddFundsTypeEnum, OrderSizeTypeEnum } from '@/types';

/**
 * The Add/Reduce funds dialog folds the two payload fields the user
 * experiences as a single question — "how am I expressing this amount?" —
 * into one selector.
 *
 * `perc` is deliberately NOT an `OrderSizeTypeEnum`: it maps to
 * `AddFundsTypeEnum.perc`, which the engine sizes off the position this deal
 * currently holds (`addDealFunds` / `reduceDealFunds` in main-app core
 * `dcaHelper`). `OrderSizeTypeEnum.percFree` / `percTotal` also read as
 * "percent" but mean a percentage of an exchange BALANCE — a different
 * quantity, and picking one here would place a different order than the label
 * promises.
 *
 * Kept apart from the dialog component so the mapping can be tested without
 * pulling a React tree (and the price feed behind it) into the runner.
 */
export type AmountMode = 'base' | 'quote' | 'perc' | 'percAvailable';

export const AMOUNT_MODE_ORDER: AmountMode[] = ['base', 'quote', 'perc'];

/**
 * Add offers one extra way to size the order: a percentage of the free
 * exchange balance the funds come out of.
 *
 * It is NOT a fourth payload shape. `addDealFunds` resolves exactly two
 * things — `asset === base` means a base quantity, and everything else is
 * divided by price as a quote amount — with a single `type === perc` branch
 * that sizes off the POSITION. There is no percent-of-balance path in the
 * engine, so `OrderSizeTypeEnum.percFree` would be read as a plain quote
 * amount and silently place a wildly different order ("40" becoming 40 USDT
 * rather than 40% of the balance).
 *
 * So the percentage is resolved in the dialog, against the balance shown next
 * to it, and submitted as a fixed quote amount. The consequence worth knowing:
 * it is pinned when you confirm, not re-read at execution.
 *
 * Reduce does not offer it — a reduce is bounded by the position, which is
 * what "% of position" already expresses.
 */
export const ADD_AMOUNT_MODE_ORDER: AmountMode[] = [
  'base',
  'quote',
  'perc',
  'percAvailable',
];

/** The quote amount a "% of available" request resolves to. */
export const resolvePercentOfAvailable = (
  availableQuote: number | null,
  percent: string
): number | null => {
  const pct = Number(percent);
  if (
    availableQuote === null ||
    !Number.isFinite(availableQuote) ||
    availableQuote <= 0 ||
    !Number.isFinite(pct) ||
    pct <= 0
  ) {
    return null;
  }
  return (availableQuote * pct) / 100;
};

/**
 * Percentages above 100 have no meaning: the engine reads them against the
 * position, and a reduce of 100% already resolves to closing the deal.
 */
export const MAX_PERCENT = 100;

export const toAmountMode = (
  asset: OrderSizeTypeEnum,
  type: AddFundsTypeEnum
): AmountMode =>
  type === AddFundsTypeEnum.perc
    ? 'perc'
    : asset === OrderSizeTypeEnum.base
      ? 'base'
      : 'quote';

/**
 * `perc` still pins `asset` to a real value: `addDealFundsInput.asset` is
 * `String!`, and the public REST validator type-checks `asset` whenever it is
 * present. The engine ignores it on the percentage path.
 */
export const fromAmountMode = (
  mode: AmountMode
): { asset: OrderSizeTypeEnum; type: AddFundsTypeEnum } =>
  mode === 'perc'
    ? { asset: OrderSizeTypeEnum.base, type: AddFundsTypeEnum.perc }
    : {
        // `percAvailable` lands here on purpose: the dialog turns it into a
        // concrete quote amount before submitting, so the payload it produces
        // is an ordinary fixed quote order.
        asset:
          mode === 'base' ? OrderSizeTypeEnum.base : OrderSizeTypeEnum.quote,
        type: AddFundsTypeEnum.fixed,
      };

export const amountModeLabel = (
  mode: AmountMode,
  baseAsset?: string,
  quoteAsset?: string
) => {
  switch (mode) {
    case 'base':
      return baseAsset ? `Base (${baseAsset})` : 'Base asset';
    case 'quote':
      return quoteAsset ? `Quote (${quoteAsset})` : 'Quote asset';
    case 'perc':
      return '% of position';
    case 'percAvailable':
      return quoteAsset ? `% of available (${quoteAsset})` : '% of available';
  }
};

/** Everything the engine reads to turn a percentage into a base quantity. */
export interface PercentBasisInput {
  usageCurrentBase: number;
  usageCurrentQuote: number;
  /** The deal's VWAP over its filled orders — the basis divisor. See below. */
  avgPrice: number;
  /**
   * The deal's own `lastPrice`. NOT the market price and NOT an average — a
   * running extreme of fill prices. Only a fallback for a deal with no fills.
   */
  lastPrice: number;
  /** Base currently held by the deal, i.e. what a full close would sell. */
  remainingBase: number;
  long: boolean;
  futures: boolean;
  coinm: boolean;
  leverage?: number | undefined;
  marginType?: string | undefined;
}

/** What one percentage point of the deal's position is worth, in base units. */
export interface PercentBasis {
  /** Base quantity a 100% request resolves to. */
  perHundred: number;
  /** Base the deal still holds; at or above it, the engine closes the deal. */
  remainingBase: number;
  /**
   * The same 100% position expressed in quote, so a reduce entered in quote
   * has a ceiling too. Derived as `perHundred * costPrice` — the exact inverse
   * of how `perHundred` is obtained on the long-spot path, so it round-trips
   * back to the deal's cost basis rather than being a second, differently
   * sourced number that could disagree with it.
   */
  perHundredQuote: number;
}

/**
 * `getLeverageMultipler` in main-app core `dcaHelper`: an inherited margin type
 * means the bot did not set leverage of its own, so the multiplier is 1.
 */
const leverageMultiplier = (input: PercentBasisInput) =>
  input.futures && input.marginType && input.marginType !== 'inherit'
    ? input.leverage || 1
    : 1;

/**
 * The base quantity behind a percentage request, computed the way the ENGINE
 * computes it — `percentFundsBasis` in main-app core `dcaHelper`, shared by
 * `addDealFunds` and `reduceDealFunds`.
 *
 * This must stay a faithful mirror: the number shown here is a promise about
 * the order that will be placed, so if the two ever disagree the preview lies,
 * which is worse than showing nothing.
 *
 * `usage.current.quote` is the deal's cost basis, and the only price that turns
 * a cost basis back into the quantity it bought is the price it was bought at —
 * `avgPrice`, the deal's VWAP. It used to divide by `lastPrice`, which reads
 * like a live price but is a running MINIMUM (long) / MAXIMUM (short) of fill
 * prices, so a long resolved to MORE base than the deal held, by exactly the
 * drawdown ratio `avgPrice/lastPrice`, and the gap widened as the ladder
 * filled — 1.9% three levels deep, 8.0% eight levels deep, at which point the
 * engine's `tpQty` guard closed the deal outright instead of reducing it.
 * Fixed in the engine and here together; see
 * `0-knowledge/domain/add-reduce-funds-percentage-basis.md`.
 *
 * The branches that already hold a base amount (spot short, coin-M) never
 * needed a price and are unchanged.
 *
 * Returns null when an input is missing or unusable, which the caller must
 * render as no preview rather than as a zero.
 */
export const percentBasis = (
  input: PercentBasisInput
): PercentBasis | null => {
  const lev = leverageMultiplier(input);

  // Mirrors the engine's fallback: a deal with no filled orders has no
  // avgPrice, and also no position, so the guard below rejects it either way.
  const costPrice = input.avgPrice || input.lastPrice;

  const perHundred = input.futures
    ? (input.coinm
        ? input.usageCurrentBase
        : input.usageCurrentQuote / costPrice) * lev
    : input.long
      ? input.usageCurrentQuote / costPrice
      : input.usageCurrentBase;

  if (!Number.isFinite(perHundred) || perHundred <= 0) {
    return null;
  }

  return {
    perHundred,
    remainingBase: input.remainingBase,
    perHundredQuote: perHundred * costPrice,
  };
};

/** The base quantity a given percentage resolves to, or null if unknowable. */
export const resolvePercentQuantity = (
  basis: PercentBasis | null | undefined,
  percent: string
): number | null => {
  const pct = Number(percent);
  if (!basis || !Number.isFinite(pct) || pct <= 0) {
    return null;
  }
  return basis.perHundred * (pct / 100);
};

/**
 * True when the engine would close the deal rather than reduce it. Mirrors the
 * `tpQty <= origQty` branch: at or above the remaining position there is
 * nothing left to keep. Only meaningful for a reduce.
 */
export const percentClosesDeal = (
  basis: PercentBasis | null | undefined,
  quantity: number | null
): boolean =>
  !!basis &&
  basis.remainingBase > 0 &&
  quantity !== null &&
  quantity >= basis.remainingBase;
