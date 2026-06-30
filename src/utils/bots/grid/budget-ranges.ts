/**
 * Grid minimum-budget computation — a faithful port of the legacy
 * `BotHelper.budgetRanges()` from main-dash (`helper/botFunctions.ts`).
 *
 * The legacy dashboard showed "Min budget is X" under the grid budget
 * input. The redesigned dashboard dropped that signal; this util brings
 * it back so the form (manual mode) and the Quick Setup can surface the
 * minimum investment a grid actually needs to place every level above
 * the exchange's per-order minimum.
 *
 * The math is replicated 1:1 from the legacy helper, including its
 * bespoke `round(num, precision, down, up)` and base-asset precision
 * derivation, so the displayed minimum matches what users saw before.
 * The only structural change is making it a pure function over explicit
 * inputs instead of reading off a stateful `BotHelper` instance.
 */

import type { PairPrecisionInfo, UserFeeInfo } from '@/types/bots/form';

export type GridProfitCurrency = 'base' | 'quote';
export type GridOrderFixedIn = 'base' | 'quote';
export type GridType = 'geometric' | 'arithmetic';

export interface GridBudgetRangeInput {
  lowPrice: number | string;
  topPrice: number | string;
  levels: number | string;
  /** Percent (e.g. 0.1 means 0.1%). Optional; only affects sell-side ladder. */
  sellDisplacement?: number | string;
  gridType: GridType;
  profitCurrency: GridProfitCurrency;
  orderFixedIn: GridOrderFixedIn;
  futures?: boolean;
  coinm?: boolean;
  useStartPrice?: boolean;
  startPrice?: number | string;
  /** Latest market price for the pair. Used by base/coinm branches. */
  latestPrice?: number;
  /** Initial price used to split the ladder into buys/sells. Falls back to latestPrice. */
  initialPrice?: number;
  /** Taker fee as a fraction (e.g. 0.001 for 0.1%). */
  userFee?: number;
  /** Exchange precision/limits for the pair (from pairPrecisionMap / pairMetadata). */
  pricePrecision: number;
  /** Quote-asset minimum notional (symbol.quoteAsset.minAmount). */
  quoteMinAmount: number;
  /** Base-asset minimum quantity (symbol.baseAsset.minAmount). */
  baseMinAmount?: number;
  /** Base-asset quantity step (symbol.baseAsset.step). */
  baseStep?: number;
  /** kucoin / paperKucoin count trailing step digits differently. */
  isKucoin?: boolean;
}

export interface GridBudgetRange {
  min: number;
  max: number;
}

const toNumber = (value: number | string | undefined | null): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/** Faithful port of MathHelper.convertFromExponential. */
const convertFromExponential = (num: number | string, precision = 2): string =>
  Number(num)
    .toFixed(Math.min(precision, 20))
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.*$/, '');

/**
 * Faithful port of MathHelper.round(num, precision, down, up).
 * `down` floors, `up` ceils, otherwise rounds — all at `precision`
 * decimal places via exponential-notation shifting.
 */
const round = (
  _num: number,
  precision = 2,
  down = false,
  up = false
): number => {
  let num = `${_num}`;
  if (`${_num}`.indexOf('e') !== -1) {
    num = convertFromExponential(_num, precision + 2);
  }
  const intPart = num.split('.')[0] ?? '';
  if (intPart.length + precision > 20) {
    precision = 20 - intPart.length;
  }
  if (down) {
    const res = Number(`${Math.floor(Number(`${num}e${precision}`))}e-${precision}`);
    return Number.isNaN(res) ? 0 : res;
  }
  if (up) {
    const res = Number(`${Math.ceil(Number(`${num}e${precision}`))}e-${precision}`);
    return Number.isNaN(res) ? 0 : res;
  }
  const res = Number(`${Math.round(Number(`${num}e${precision}`))}e-${precision}`);
  return Number.isNaN(res) ? 0 : res;
};

/**
 * Faithful port of BotUtils.getAssetPrecision(symbol, 'base'): derive the
 * base-asset decimal precision from its quantity step string.
 */
const getBaseAssetPrecision = (baseStep?: number, isKucoin = false): number => {
  if (!baseStep || !Number.isFinite(baseStep)) {
    return 8;
  }
  let use = `${baseStep}`;
  if (use.indexOf('e-') !== -1) {
    const split = use.split('e-')[1];
    use = Number(baseStep).toFixed(parseFloat(split));
  }
  if (use.indexOf('1') === -1) {
    const dec = use.replace('0.', '');
    const numbers = dec.replace(/0/g, '');
    const place = dec.indexOf(numbers);
    if (place <= 1) {
      return place;
    }
    use = `0.${'0'.repeat(place)}1`;
  }
  return use.indexOf('1') === 0
    ? 0
    : isKucoin
      ? use.replace('0.', '').length
      : use.replace('0.', '').indexOf('1') + 1;
};

/**
 * Faithful port of BotHelper.getPrices(): build the grid order ladder
 * (buy/sell price per level) from the range, level count and grid type.
 */
const getPrices = (
  input: GridBudgetRangeInput
): { buy: number; sell: number }[] => {
  const low = toNumber(input.lowPrice);
  const top = toNumber(input.topPrice);
  const levels = toNumber(input.levels);
  const { pricePrecision } = input;
  const prices: { buy: number; sell: number }[] = [];

  if (!(low > 0) || !(top > 0) || !(levels > 0)) {
    return prices;
  }

  let sellD = toNumber(input.sellDisplacement);
  sellD = Number.isNaN(sellD) ? 0 : sellD / 100;

  if (input.gridType === 'arithmetic') {
    const step = (top - low) / levels;
    for (let i = 0; i <= levels; i++) {
      const p = round(low + step * i, pricePrecision);
      prices.push({
        buy: round(p, pricePrecision),
        sell: round(p * (1 + sellD), pricePrecision),
      });
    }
  } else {
    const newGS = (top / low) ** (1 / levels) - 1;
    const initial = round(low, pricePrecision);
    if (!initial) {
      return prices;
    }
    for (
      let i = round(low, pricePrecision);
      i <= top * (1 + newGS / 2);
      i *= 1 + newGS
    ) {
      prices.push({
        buy: round(i, pricePrecision),
        sell: round(i * (1 + sellD), pricePrecision),
      });
    }
  }
  return prices;
};

/**
 * Faithful port of BotHelper.getSellBuyCount(): split the ladder into
 * buys/sells around the init price and balance the side nearest to it.
 */
const getSellBuyCount = (
  prices: { buy: number; sell: number }[],
  input: GridBudgetRangeInput
) => {
  const startPrice = toNumber(input.startPrice);
  const useStart =
    Boolean(input.useStartPrice) && startPrice !== 0;
  const initPrice = useStart
    ? startPrice
    : toNumber(input.initialPrice ?? input.latestPrice);

  const sells = prices.filter((p) => p.sell > initPrice);
  const buys = prices.filter((p) => p.buy < initPrice);
  const sellCount0 = sells.length;
  const buyCount0 = buys.length;
  if (sellCount0 > 0 && buyCount0 > 0) {
    if (
      Math.abs(sells[0].sell - initPrice) >
      Math.abs(buys[buys.length - 1].buy - initPrice)
    ) {
      buys.splice(buys.length - 1, 1);
    } else {
      sells.splice(0, 1);
    }
  }
  if (sellCount0 > 0 && buyCount0 === 0) {
    sells.splice(0, 1);
  }
  if (buyCount0 > 0 && sellCount0 === 0) {
    buys.splice(buys.length - 1, 1);
  }
  return { sellCount: sells.length, buyCount: buys.length, buys, sells };
};

/**
 * Faithful port of BotHelper.budgetRanges(): the minimum (and max)
 * budget a grid needs so every level clears the exchange minimum.
 * Returns `null` when the range/levels aren't valid enough to compute.
 */
export const computeGridBudgetRange = (
  input: GridBudgetRangeInput
): GridBudgetRange | null => {
  const levels = toNumber(input.levels);
  const low = toNumber(input.lowPrice);
  const top = toNumber(input.topPrice);
  if (!(levels > 0) || !(low > 0) || !(top > 0) || top <= low) {
    return null;
  }

  const quoteMin = input.quoteMinAmount;
  if (!(quoteMin > 0)) {
    return null;
  }

  const profitCurrency = input.profitCurrency;
  const orderFixedIn = input.orderFixedIn;
  const futures = Boolean(input.futures);
  const latestPrice = toNumber(input.latestPrice);
  // Futures grids charge no spot fee in the legacy model.
  const UF = futures ? 0 : toNumber(input.userFee);

  const prices = getPrices(input);
  if (prices.length === 0) {
    return null;
  }
  const quotedAssetPrecision = getBaseAssetPrecision(
    input.baseStep,
    input.isKucoin
  );

  const baseMinAmount = toNumber(input.baseMinAmount);
  const baseStep = toNumber(input.baseStep);
  const highestSell =
    [...prices].sort((a, b) => b.sell - a.sell)[0]?.sell || 0;
  const minQuote = Math.max(
    quoteMin,
    (baseMinAmount || baseStep) * highestSell || 1
  );
  const lowest = [...prices].sort((a, b) => a.sell - b.sell)[0]?.buy || 1;
  const qty = minQuote / lowest;
  let minQty = round(qty, quotedAssetPrecision);
  if (minQty * lowest < quoteMin / lowest) {
    minQty = round(quoteMin / lowest, quotedAssetPrecision, false, true);
  }

  const { sellCount, buys, sells } = getSellBuyCount(prices, input);

  let minBudget = 0;
  if (profitCurrency === 'quote') {
    if (orderFixedIn === 'quote') {
      minBudget = minQuote * levels;
    }
    if (orderFixedIn === 'base') {
      minBudget = futures
        ? sells.reduce((acc, v) => acc + v.sell * minQty, 0) +
          buys.reduce((acc, v) => acc + v.buy * minQty, 0)
        : minQty * sellCount * latestPrice +
          buys.reduce((acc, v) => acc + v.buy * minQty, 0);
    }
  }
  if (profitCurrency === 'base') {
    const minBase = minQuote / lowest;
    const sellBase = round(minBase, quotedAssetPrecision, false, true);
    const buyBase = round(minBase * (1 + UF), quotedAssetPrecision, false, true);
    minBudget =
      (sellBase * sellCount * latestPrice +
        buys.reduce((acc, v) => acc + v.buy * buyBase, 0)) *
      1.05;
  }
  if (input.coinm) {
    let diff = Infinity;
    let gridIndex = -1;
    prices.forEach((p, index) => {
      if (Math.abs(p.buy - latestPrice) < diff) {
        diff = Math.abs(p.buy - latestPrice);
        gridIndex = index;
      }
    });
    const _prices = [...prices];
    // remove nearest
    if (gridIndex >= 0) {
      _prices.splice(gridIndex, 1);
    }
    minBudget =
      _prices.reduce(
        (acc, p) =>
          acc +
          round(
            quoteMin / (latestPrice > p.buy ? p.sell : p.buy),
            quotedAssetPrecision,
            false,
            true
          ),
        0
      ) * latestPrice;
  }

  const maxBudget = Infinity;
  return {
    min: round(minBudget * (1 + UF), input.pricePrecision, false, true),
    max: round(maxBudget, input.pricePrecision, false, true),
  };
};

/** Grid settings as held by the bot form (values may be strings). */
export interface GridBudgetRangeGridSettings {
  lowPrice?: number | string;
  topPrice?: number | string;
  levels?: number | string;
  sellDisplacement?: number | string;
  gridType?: GridType;
  profitCurrency?: GridProfitCurrency;
  orderFixedIn?: GridOrderFixedIn;
  futures?: boolean;
  coinm?: boolean;
  useStartPrice?: boolean;
  startPrice?: number | string;
}

export interface GridBudgetRangeFormParams {
  grid: GridBudgetRangeGridSettings;
  primaryPair: string;
  pairPrecisionMap?: Record<string, PairPrecisionInfo>;
  userFee?: UserFeeInfo | null;
  latestPrice?: number;
  initialPrice?: number;
  /** Exchange provider tag — used only to detect kucoin precision quirks. */
  provider?: string;
}

/** Resolve a precision entry tolerating separator-stripped pair keys. */
const lookupPrecision = (
  map: Record<string, PairPrecisionInfo>,
  pair: string
): PairPrecisionInfo | undefined => {
  if (!pair) {
    return undefined;
  }
  const normalized = pair.replace(/[\s\-/]/g, '').toUpperCase();
  return map[normalized] ?? map[pair];
};

/**
 * Convenience adapter: derive `computeGridBudgetRange` inputs straight
 * from bot-form state (grid settings + pairPrecisionMap + userFee).
 * Returns `null` when pair precision isn't available yet.
 */
export const computeGridBudgetRangeFromForm = (
  params: GridBudgetRangeFormParams
): GridBudgetRange | null => {
  const entry = lookupPrecision(
    params.pairPrecisionMap ?? {},
    params.primaryPair
  );
  if (!entry) {
    return null;
  }
  const quoteMin = Number(entry.minQuoteAmount ?? 0);
  if (!(quoteMin > 0)) {
    return null;
  }
  const provider = (params.provider ?? '').toLowerCase();
  return computeGridBudgetRange({
    lowPrice: params.grid.lowPrice ?? 0,
    topPrice: params.grid.topPrice ?? 0,
    levels: params.grid.levels ?? 0,
    sellDisplacement: params.grid.sellDisplacement ?? 0,
    gridType: params.grid.gridType ?? 'geometric',
    profitCurrency: params.grid.profitCurrency ?? 'quote',
    orderFixedIn: params.grid.orderFixedIn ?? 'quote',
    futures: params.grid.futures,
    coinm: params.grid.coinm,
    useStartPrice: params.grid.useStartPrice,
    startPrice: params.grid.startPrice,
    latestPrice: params.latestPrice,
    initialPrice: params.initialPrice ?? params.latestPrice,
    userFee: params.userFee?.takerCommission,
    pricePrecision: Number(entry.pricePrecision ?? 8),
    quoteMinAmount: quoteMin,
    baseMinAmount: Number(entry.minBaseAmount ?? 0),
    baseStep: Number(entry.baseStep ?? 0),
    isKucoin: provider.includes('kucoin'),
  });
};
