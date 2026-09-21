import type { BotSettings, BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export interface GridFormValidationResult {
  errors: Record<string, string>;
  alerts?: import('@/types/bots/form').BotFormAlerts;
}

const isPositiveNumber = (value?: string | number | null): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0;
  }

  return false;
};

// Grid stop loss is expressed as a negative percentage (a drawdown), the
// same sign convention as DCA bots — the SL trigger multiplies it by -1.
// So a valid SL percentage is any non-zero finite number, not a positive
// one. (See bug 865bne405: forcing positive SL caused immediate triggers.)
const isNonZeroNumber = (value?: string | number | null): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed !== 0;
  }

  return false;
};

const isNonEmptyString = (value?: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const validateGridFormData = ({
  name,
  exchangeUUID,
  pair,
  grid,
}: Omit<
  Pick<BotFormData, 'name' | 'exchangeUUID' | 'pair' | BotTypesEnum.grid>,
  'grid'
> & {
  grid: Pick<
    BotSettings,
    | 'budget'
    | 'topPrice'
    | 'lowPrice'
    | 'levels'
    | 'tpSl'
    | 'tpSlCondition'
    | 'tpPerc'
    | 'tpTopPrice'
    | 'sl'
    | 'slCondition'
    | 'slLowPrice'
    | 'slPerc'
    | 'strategy'
    | 'useStartPrice'
    | 'startPrice'
    | 'useOrderInAdvance'
    | 'ordersInAdvance'
    | 'futures'
    | 'leverage'
    | 'marginType'
  >;
}): GridFormValidationResult => {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(name)) {
    errors['name'] = 'Bot name is required.';
  }

  if (!isNonEmptyString(exchangeUUID)) {
    errors['exchange'] = 'Select an exchange account.';
  }

  const primaryPair = Array.isArray(pair) ? pair[0] : '';
  if (!isNonEmptyString(primaryPair)) {
    errors['pairs'] = 'Provide at least one trading pair.';
  }

  if (!isPositiveNumber(grid.budget)) {
    errors['budget'] = 'Budget must be greater than zero.';
  }

  if (!isPositiveNumber(grid.topPrice)) {
    errors['topPrice'] = 'Set a valid top price.';
  }

  if (!isPositiveNumber(grid.lowPrice)) {
    errors['lowPrice'] = 'Set a valid low price.';
  }

  if (!Number.isInteger(Number(grid.levels)) || Number(grid.levels) <= 0) {
    errors['levels'] = 'Levels must be a positive integer.';
  }

  if (grid.topPrice && grid.lowPrice) {
    const top = parseFloat(String(grid.topPrice));
    const low = parseFloat(String(grid.lowPrice));
    if (Number.isFinite(top) && Number.isFinite(low) && top <= low) {
      errors['priceRange'] = 'Top price must be greater than low price.';
    }
  }

  if (
    grid.tpSl &&
    (((!grid.tpSlCondition || grid.tpSlCondition === 'valueChanged') &&
      !isPositiveNumber(grid.tpPerc)) ||
      (grid.tpSlCondition === 'priceReached' &&
        !isPositiveNumber(grid.tpTopPrice)))
  ) {
    errors['tpSl'] = 'Configure take profit percentage or target price.';
  }

  if (
    grid.sl &&
    (((!grid.slCondition || grid.slCondition === 'valueChanged') &&
      !isNonZeroNumber(grid.slPerc)) ||
      (grid.slCondition === 'priceReached' &&
        !isPositiveNumber(grid.slLowPrice)))
  ) {
    errors['sl'] = 'Configure stop loss percentage or target price.';
  }

  // A `priceReached` trigger that every price in the grid range already
  // satisfies stops the bot on its first candle, before a single level fills.
  // A backtest of it comes back with no results and no transactions, and a
  // live bot closes immediately — in both cases with nothing to say why.
  // A long grid takes profit on the way up and stops out on the way down, so
  // a take profit at or below the low price, or a stop loss at or above the
  // top price, is true everywhere inside the range. A short grid runs the
  // other way round.
  const rangeTop = parseFloat(String(grid.topPrice));
  const rangeLow = parseFloat(String(grid.lowPrice));
  const hasRange =
    Number.isFinite(rangeTop) && Number.isFinite(rangeLow) && rangeTop > rangeLow;
  const isShortGrid = grid.strategy === 'SHORT';

  if (
    hasRange &&
    grid.tpSl &&
    grid.tpSlCondition === 'priceReached' &&
    isPositiveNumber(grid.tpTopPrice)
  ) {
    const tp = parseFloat(String(grid.tpTopPrice));
    if (isShortGrid ? tp >= rangeTop : tp <= rangeLow) {
      errors['tpSl'] = isShortGrid
        ? 'Take profit price must be below the top price — a short grid takes profit as the price falls.'
        : 'Take profit price must be above the low price — a long grid takes profit as the price rises.';
    }
  }

  if (
    hasRange &&
    grid.sl &&
    grid.slCondition === 'priceReached' &&
    isPositiveNumber(grid.slLowPrice)
  ) {
    const stop = parseFloat(String(grid.slLowPrice));
    if (isShortGrid ? stop <= rangeLow : stop >= rangeTop) {
      errors['sl'] = isShortGrid
        ? 'Stop loss price must be above the low price — a short grid stops out as the price rises.'
        : 'Stop loss price must be below the top price — a long grid stops out as the price falls.';
    }
  }

  if (grid.useStartPrice && !isPositiveNumber(grid.startPrice)) {
    errors['startPrice'] = 'Provide a valid activation price.';
  }

  if (
    grid.useOrderInAdvance &&
    (!Number.isInteger(Number(grid.ordersInAdvance)) ||
      Number(grid.ordersInAdvance) <= 0)
  ) {
    errors['ordersInAdvance'] = 'Active orders must be a positive integer.';
  }

  if (grid.futures) {
    if (!isPositiveNumber(grid.leverage)) {
      errors['leverage'] = 'Set a leverage greater than 1x.';
    }
    if (!isNonEmptyString(grid.marginType)) {
      errors['marginType'] = 'Select a margin type.';
    }
  }

  // Ensure alerts are populated from errors
  const alerts: import('@/types/bots/form').BotFormAlerts = {};
  for (const [k, v] of Object.entries(errors)) {
    if (v) {
      if (!alerts[k as keyof typeof alerts]) {
        alerts[k as keyof typeof alerts] = [];
      }
      (
        alerts[
          k as keyof typeof alerts
        ] as import('@/types/bots/form').BotFormAlert[]
      ).push({
        variant: 'error',
        message: String(v),
        navId: String(k),
      });
    }
  }

  return { errors, alerts };
};
