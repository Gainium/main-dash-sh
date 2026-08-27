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
