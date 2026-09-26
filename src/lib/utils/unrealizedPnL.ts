import {
  DCADealStatusEnum,
  ExchangeEnum,
  type DCADeals,
} from '../../types';
import { logger } from '../loggerInstance';

// Price data structure
export interface PriceData {
  symbol: string;
  price: number;
  exchange: string;
}

/**
 * Check if a deal is active (should have unrealized PnL calculated)
 */
export const isActiveDeal = (deal: DCADeals): boolean => {
  if (!deal?.status) return false;

  // Convert status to lowercase for comparison
  const status = deal.status.toLowerCase();

  // Active statuses based on DCA Deal Status Enum and common active statuses
  const activeStatuses = [
    DCADealStatusEnum.error.toLowerCase(),
    DCADealStatusEnum.open.toLowerCase(),
    DCADealStatusEnum.start.toLowerCase(),
    // Add other common active statuses
    'active',
    'running',
    'range',
    'monitoring',
  ];

  const isActive = activeStatuses.includes(status);

  logger.debug('[UnrealizedPnL] Deal status check:', {
    dealId: deal._id || deal.botId,
    status: deal.status,
    statusLower: status,
    activeStatuses,
    isActive,
  });

  return isActive;
};

/**
 * Match a price entry for a base/quote pair across every symbol separator
 * exchanges use: concatenated (`BTCUSDT`), dash (`BTC-USDT`), slash
 * (`BTC/USDT`), and the `Z` form used by the synthetic `USDTZUSD` USD rate.
 * Dated-futures symbols (`BTCUSDT_240628`) are reduced to their spot form.
 *
 * The previous implementation only matched the concatenated form with an
 * exact `===`, so dash-separated exchanges (Coinbase, Kraken, OKX, KuCoin)
 * never resolved a bridge — `findUSDRate` returned 0 for any non-USD quote
 * asset (e.g. a SOL-EUR grid), zeroing out current-funds value / unrealized
 * PnL. This mirrors legacy main-dash `findAsset`.
 */
const pairKeys = (base: string, quote: string): string[] => [
  `${base}${quote}`,
  `${base}-${quote}`,
  `${base}/${quote}`,
  `${base}Z${quote}`,
];

/**
 * One index per price snapshot. The price array holds every ticker of every
 * exchange (tens of thousands of rows), and `findRate`/`findUSDRate` used to
 * scan it linearly — allocating a `split('_')` array per row — for every bot
 * and every deal on every price tick. The index is built once per array and
 * answers the same questions in O(1), preserving the linear scan's semantics
 * exactly: the FIRST row (in array order) whose normalised symbol matches any
 * of the separator forms wins, even if its price is not positive.
 */
type IndexedPrice = { price: number; pos: number };
interface PriceIndex {
  size: number;
  /** normalised symbol → first row, per exchange ('' = no exchange). */
  byExchange: Map<string, Map<string, IndexedPrice>>;
  /** normalised symbol → first row over the whole array. */
  anyExchange: Map<string, IndexedPrice>;
  /** exact (un-normalised) symbol → first price, per exchange. */
  exactByExchange: Map<string, Map<string, number>>;
  exactAny: Map<string, number>;
  usdRates: Map<string, number>;
}

const priceIndexCache = new WeakMap<readonly PriceData[], PriceIndex>();

export const getPriceIndex = (prices: readonly PriceData[]): PriceIndex => {
  const cached = priceIndexCache.get(prices);
  if (cached && cached.size === prices.length) return cached;
  const index: PriceIndex = {
    size: prices.length,
    byExchange: new Map(),
    anyExchange: new Map(),
    exactByExchange: new Map(),
    exactAny: new Map(),
    usdRates: new Map(),
  };
  for (let pos = 0; pos < prices.length; pos++) {
    const p = prices[pos];
    if (!p || !p.symbol) continue;
    const exchange = p.exchange ?? '';
    const sym = p.symbol.split('_')[0];
    const entry = { price: p.price, pos };
    let exMap = index.byExchange.get(exchange);
    if (!exMap) {
      exMap = new Map();
      index.byExchange.set(exchange, exMap);
    }
    if (!exMap.has(sym)) exMap.set(sym, entry);
    if (!index.anyExchange.has(sym)) index.anyExchange.set(sym, entry);
    let exactMap = index.exactByExchange.get(exchange);
    if (!exactMap) {
      exactMap = new Map();
      index.exactByExchange.set(exchange, exactMap);
    }
    if (!exactMap.has(p.symbol)) exactMap.set(p.symbol, p.price);
    if (!index.exactAny.has(p.symbol)) index.exactAny.set(p.symbol, p.price);
  }
  priceIndexCache.set(prices, index);
  return index;
};

/**
 * First row matching the pair, restricted to `exchange` + the synthetic
 * `'all'` rows when an exchange is given (the old `_prices.filter(...)`).
 */
const lookupPair = (
  index: PriceIndex,
  base: string,
  quote: string,
  exchange?: string
): IndexedPrice | undefined => {
  const maps = exchange
    ? [index.byExchange.get(exchange), index.byExchange.get('all')]
    : [index.anyExchange];
  let best: IndexedPrice | undefined;
  for (const key of pairKeys(base, quote)) {
    for (const m of maps) {
      const hit = m?.get(key);
      if (hit && (!best || hit.pos < best.pos)) best = hit;
    }
  }
  return best;
};

const findRateIndexed = (
  fromAsset: string,
  toAsset: string,
  index: PriceIndex,
  exchange?: string,
  reverse = false
): number | null => {
  const match = lookupPair(index, fromAsset, toAsset, exchange);
  if (match && match.price > 0) {
    return reverse ? 1 / match.price : match.price;
  }
  if (!reverse) {
    return findRateIndexed(toAsset, fromAsset, index, exchange, true);
  }
  return null;
};

/**
 * Find rate for asset pair conversion. Tries the direct pair first, then the
 * inverse pair (returning its reciprocal), across all symbol separators.
 */
export const findRate = (
  fromAsset: string,
  toAsset: string,
  prices: PriceData[],
  reverse = false
): number | null =>
  findRateIndexed(fromAsset, toAsset, getPriceIndex(prices), undefined, reverse);

/**
 * Exact-symbol price lookup: the deal's own exchange (or an `'all'` row) first,
 * the same order `calculateUnrealizedPnL` / `transformDealToTrade` used.
 */
export const findPrice = (
  prices: readonly PriceData[],
  symbol: string,
  exchange?: string
): number | undefined => {
  const index = getPriceIndex(prices);
  if (!exchange) return index.exactAny.get(symbol);
  const own = index.exactByExchange.get(exchange)?.get(symbol);
  const all = index.exactByExchange.get('all')?.get(symbol);
  return own ?? all;
};

/**
 * Calculate USD rate for a given asset. Memoised per price snapshot.
 */
export const findUSDRate = (
  asset: string,
  _prices: PriceData[],
  exchange?: ExchangeEnum | 'all'
): number => {
  const index = getPriceIndex(_prices);
  const cacheKey = `${exchange ?? ''}\u001f${asset}`;
  const cachedRate = index.usdRates.get(cacheKey);
  if (cachedRate !== undefined) return cachedRate;
  const rate = computeUSDRate(asset, index, exchange || undefined);
  index.usdRates.set(cacheKey, rate);
  return rate;
};

const computeUSDRate = (
  rawAsset: string,
  index: PriceIndex,
  exchange?: string
): number => {
  const findRate = (from: string, to: string) =>
    findRateIndexed(from, to, index, exchange);
  const asset = rawAsset
    .replace('SBTC', 'BTC')
    .replace('SUSD', 'USD')
    .replace('SUSDT', 'USDT')
    .replace('UBTC', 'BTC');
  if (asset === 'USD') {
    return 1;
  }
  let usdRate = Number(asset === 'USDT' || asset === 'USDC');
  let usdtRate = Number(asset === 'USDT' || asset === 'USDC');
  if (asset !== 'USDT') {
    const findUsdtRate = findRate(asset, 'USDT') || findRate(asset, 'USDC');
    if (findUsdtRate) {
      usdtRate = findUsdtRate;
      usdRate = usdtRate;
    } else {
      const _findUsdRate = findRate(asset, 'USD');
      if (_findUsdRate) {
        return _findUsdRate;
      }
      const findBtcRate = findRate(asset, 'BTC');
      if (findBtcRate) {
        const findBtcUsdtRate = findRate('BTC', 'USDT');
        if (findBtcUsdtRate) {
          usdtRate = findBtcRate * findBtcUsdtRate;
          usdRate = usdtRate;
        }
      }
    }
  }
  const findUsdtUsdRate = findRate('USDT', 'USD');
  if (findUsdtUsdRate) {
    usdRate = usdtRate * findUsdtUsdRate;
  }
  return usdRate;
};
