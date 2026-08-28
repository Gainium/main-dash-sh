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
export type AmountMode = 'base' | 'quote' | 'perc';

export const AMOUNT_MODE_ORDER: AmountMode[] = ['base', 'quote', 'perc'];

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
  }
};

/** Everything the engine reads to turn a percentage into a base quantity. */
export interface PercentBasisInput {
  usageCurrentBase: number;
  usageCurrentQuote: number;
  /** The deal's own `lastPrice`. NOT the market price — see below. */
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
 * computes it — `addDealFunds` / `reduceDealFunds` in main-app core
 * `dcaHelper`, whose two percentage branches are byte-identical.
 *
 * This deliberately mirrors the engine including a quirk it would be tempting
 * to "fix" here: for a long, `usage.current.quote` is the quote SPENT (cost
 * basis) while `lastPrice` is a running MINIMUM of fill prices, not the market
 * price. Cost basis over the lowest fill therefore resolves to MORE base than
 * the deal holds, and the gap widens as the ladder fills — measured at 1.9% on
 * a deal 3 levels deep and 7.4% on one 8 levels deep. Past that point the
 * engine's `tpQty` guard closes the deal outright instead of reducing it, so
 * on the deeper deal a 93% request is a full close.
 *
 * Showing the user the position they hold instead of this number would be
 * friendlier and wrong: the order placed is this one. Whether the engine's
 * basis is itself correct is a separate question, under investigation — if it
 * changes, this must change with it or the preview starts lying.
 *
 * Returns null when an input is missing or unusable, which the caller must
 * render as no preview rather than as a zero.
 */
export const percentBasis = (
  input: PercentBasisInput
): PercentBasis | null => {
  const lev = leverageMultiplier(input);

  const perHundred = input.futures
    ? (input.coinm
        ? input.usageCurrentBase
        : input.usageCurrentQuote / input.lastPrice) * lev
    : input.long
      ? input.usageCurrentQuote / input.lastPrice
      : input.usageCurrentBase;

  if (!Number.isFinite(perHundred) || perHundred <= 0) {
    return null;
  }

  return { perHundred, remainingBase: input.remainingBase };
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
