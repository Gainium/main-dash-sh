import { FuturesStrategyEnum, type BotSettings, type BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export interface GridFormValidationResult {
  errors: Record<string, string>;
  alerts?: import('@/types/bots/form').BotFormAlerts;
}

/**
 * Read a grid number field. The grid inputs are free text, so the value
 * arrives exactly as typed: a decimal comma (`1,5`) is read as a decimal
 * point when it is the only separator. `undefined` means the field was left
 * blank; anything else that is not a number (`1abc`, `1,000.5`) is `NaN`
 * rather than the leading digits `parseFloat` would keep. The save mapper
 * reads the fields with this too, so a value this accepts is the value saved.
 */
export const parseGridNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return Number(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return Number(
    /^[^.,]*,[^.,]*$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed
  );
};

const isPositiveNumber = (value?: string | number | null): boolean => {
  const parsed = parseGridNumber(value);
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0;
};

// A blank optional field saves as 0; one holding text that is not a number
// must not.
const isInvalidNumber = (value?: string | number | null): boolean => {
  const parsed = parseGridNumber(value);
  return parsed !== undefined && !Number.isFinite(parsed);
};

// Grid stop loss is expressed as a negative percentage (a drawdown), the
// same sign convention as DCA bots — the SL trigger multiplies it by -1.
// So a valid SL percentage is any non-zero finite number, not a positive
// one. (See bug 865bne405: forcing positive SL caused immediate triggers.)
const isNonZeroNumber = (value?: string | number | null): boolean => {
  const parsed = parseGridNumber(value);
  return parsed !== undefined && Number.isFinite(parsed) && parsed !== 0;
};

const isNonEmptyString = (value?: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const GRID_LEVELS_ERROR = 'Levels must be a positive integer.';

const GRID_BACKTEST_NUMBER_FIELDS = {
  budget: 'Budget',
  topPrice: 'Top price',
  lowPrice: 'Low price',
  levels: 'Levels',
  gridStep: 'Grid step',
  sellDisplacement: 'Sell displacement',
  ordersInAdvance: 'Active orders',
  leverage: 'Leverage',
  tpPerc: 'Take profit',
  slPerc: 'Stop loss',
  tpTopPrice: 'Take profit price',
  slLowPrice: 'Stop loss price',
} as const;

/**
 * Read the grid number fields for a local backtest, which does not go through
 * the save mapper: the engine reads them with `parseFloat` / `+`, so `1,5`
 * would run as 1 (or NaN) and `1000abc` would run at all. Each field is read
 * with `parseGridNumber` and kept in the form's units (no percent /100 — the
 * engine does that itself). A blank field is passed through untouched; one
 * that is not a number is returned as an error keyed by the field.
 */
export const readGridBacktestNumbers = <T extends object>(
  grid: T
): { grid: T; errors: Record<string, string> } => {
  const out = { ...grid } as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const [field, label] of Object.entries(GRID_BACKTEST_NUMBER_FIELDS)) {
    const parsed = parseGridNumber(out[field]);
    if (parsed === undefined) {
      continue;
    }
    if (Number.isFinite(parsed)) {
      out[field] = parsed;
    } else {
      errors[field] = `${label} must be a number.`;
    }
  }
  return { grid: out as T, errors };
};

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
    | 'gridStep'
    | 'sellDisplacement'
    | 'tpSl'
    | 'tpSlCondition'
    | 'tpPerc'
    | 'tpTopPrice'
    | 'sl'
    | 'slCondition'
    | 'slLowPrice'
    | 'slPerc'
    | 'strategy'
    | 'futuresStrategy'
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
    errors['levels'] = GRID_LEVELS_ERROR;
  }

  if (isInvalidNumber(grid.gridStep)) {
    errors['gridStep'] = 'Grid step must be a number.';
  }

  if (isInvalidNumber(grid.sellDisplacement)) {
    errors['sellDisplacement'] = 'Sell displacement must be a number.';
  }

  if (grid.topPrice && grid.lowPrice) {
    const top = parseGridNumber(grid.topPrice) ?? NaN;
    const low = parseGridNumber(grid.lowPrice) ?? NaN;
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
  // other way round. The side is the engine's (`get isShort()`): a futures
  // grid's position side, falling back to `strategy` only when it is NEUTRAL.
  const rangeTop = parseGridNumber(grid.topPrice) ?? NaN;
  const rangeLow = parseGridNumber(grid.lowPrice) ?? NaN;
  const hasRange =
    Number.isFinite(rangeTop) && Number.isFinite(rangeLow) && rangeTop > rangeLow;
  const isShortGrid =
    grid.futures &&
    grid.futuresStrategy &&
    grid.futuresStrategy !== FuturesStrategyEnum.neutral
      ? grid.futuresStrategy === FuturesStrategyEnum.short
      : grid.strategy === 'SHORT';

  if (
    hasRange &&
    grid.tpSl &&
    grid.tpSlCondition === 'priceReached' &&
    isPositiveNumber(grid.tpTopPrice)
  ) {
    const tp = parseGridNumber(grid.tpTopPrice) ?? NaN;
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
    const stop = parseGridNumber(grid.slLowPrice) ?? NaN;
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
