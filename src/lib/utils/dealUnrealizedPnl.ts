/**
 * The ONE unrealized-P&L definition for an open deal, fees included.
 *
 * Every client surface that shows a deal's unrealized P&L (deal tables, the
 * bot drawer, TopDeals, the sidebar, useDcaDeals) goes through this function,
 * and the server's stats worker implements the same formula
 * (`stats.unrealizedProfitNet`). Before, four copies disagreed on whether
 * fees were subtracted, which fee (maker vs taker) and which price source.
 *
 * Pure: no I/O, no price feed, no stores. Callers resolve the market inputs
 * (last price on the deal's own exchange, quote→USD rate, maker fee) and pass
 * them in; `computeDealUnrealizedPnlFromPrices` does that resolution against a
 * price snapshot for the common case.
 *
 * DCA (non-combo):
 *   gross   = long ? cb.base*price + cb.quote - ib.quote
 *                  : cb.quote - (ib.base - cb.base)*price           (quote)
 *   usage   = futures ? (coinm ? usageBase*price : usageQuote)
 *                     : (long  ? usageQuote       : usageBase*price)
 *             where usageQuote/Base = usage.current + reduce-funds + (new
 *             multi-TP) filled-TP amounts, then × usdRate
 *   upnl    = gross*usdRate - 2*fee*usage                              (USD)
 *   percent = upnl / usage * 100
 * Combo: the whole deal's P&L (grid proceeds included — see
 * 0-knowledge/domain/pnl-accounting-policy.md), minus the fees actually paid
 * when the deal tracks them, else minus the closing fee.
 */
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import { findPrice, findUSDRate, type PriceData } from './unrealizedPnL';

export interface DealPnlBalances {
  base?: number | null;
  quote?: number | null;
}

/** The subset of a DCA/combo deal the formula reads. */
export interface DealPnlInput {
  status?: string | null;
  strategy?: string | null;
  exchange?: string | null;
  exchangeUUID?: string | null;
  symbol?: { symbol?: string; quoteAsset?: string } | string | null;
  avgPrice?: number | null;
  currentBalances?: DealPnlBalances | null;
  initialBalances?: DealPnlBalances | null;
  usage?: {
    current?: DealPnlBalances | null;
    max?: DealPnlBalances | null;
  } | null;
  reduceFunds?: { qty: number; price: number }[] | null;
  tpFilledHistory?: { qty: number; price: number }[] | null;
  flags?: string[] | null;
  settings?: {
    futures?: boolean | null;
    coinm?: boolean | null;
    comboTpBase?: string | null;
    profitCurrency?: string | null;
  } | null;
  profit?: {
    total?: number | null;
    pureBase?: number | null;
    pureQuote?: number | null;
  } | null;
  feePaid?: { base?: number | null; quote?: number | null } | null;
}

export interface DealPnlMarket {
  /** Last price of the deal's symbol on the deal's own exchange. */
  price?: number;
  /** Quote asset → USD. */
  usdRate?: number;
  /** Maker fee rate as a decimal (0.001 = 0.1 %). `undefined` = unknown. */
  fee?: number;
}

export interface DealPnlResult {
  /** Fee-inclusive unrealized P&L in USD. */
  unrealizedUsd: number;
  /** The capital the percentage is measured against, in USD. */
  usageUsd: number;
  /** unrealizedUsd / usageUsd × 100 (0 when there is no usage). */
  percent: number;
}

const ACTIVE_STATUSES = new Set(['open', 'start', 'error']);

export const isActiveDealStatus = (status?: string | null): boolean =>
  ACTIVE_STATUSES.has(String(status ?? '').toLowerCase());

const n = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

const sumQty = (rows?: { qty: number }[] | null) =>
  (rows ?? []).reduce((acc, r) => acc + n(r.qty), 0);
const sumQuote = (rows?: { qty: number; price: number }[] | null) =>
  (rows ?? []).reduce((acc, r) => acc + n(r.qty) * n(r.price), 0);

/**
 * `settings.futures/coinm` win when set; a null/absent flag falls back to the
 * exchange's market type (same resolution transformDealToTrade always used).
 */
export const resolveDealMarket = (
  deal: Pick<DealPnlInput, 'settings' | 'exchange'>
): { futures: boolean; coinm: boolean } => {
  const futuresFlag = deal.settings?.futures;
  const coinmFlag = deal.settings?.coinm;
  const futures =
    futuresFlag === null || futuresFlag === undefined
      ? isFuturesExchange(deal.exchange ?? undefined)
      : !!futuresFlag;
  const coinm =
    coinmFlag === null || coinmFlag === undefined
      ? isCoinmExchange(deal.exchange ?? undefined)
      : !!coinmFlag;
  return { futures, coinm };
};

const isLong = (strategy?: string | null) =>
  String(strategy ?? '').toUpperCase() === 'LONG';

const finiteResult = (r: DealPnlResult): DealPnlResult | undefined =>
  Number.isFinite(r.unrealizedUsd) &&
  Number.isFinite(r.usageUsd) &&
  Number.isFinite(r.percent)
    ? r
    : undefined;

/**
 * Fee-inclusive unrealized P&L of one deal, or `undefined` when it has none
 * (closed deal) or it cannot be computed from the given market inputs (no
 * price, no USD rate, unknown fee). Callers show the server's stored value in
 * that case — never a confident zero.
 */
export const computeDealUnrealizedPnl = (
  deal: DealPnlInput,
  market: DealPnlMarket,
  options: { combo?: boolean } = {}
): DealPnlResult | undefined => {
  if (!isActiveDealStatus(deal.status)) return undefined;
  if (!deal.strategy) return undefined;
  const { price, usdRate, fee } = market;
  if (!price || !(price > 0) || !usdRate || fee === undefined) {
    return undefined;
  }
  const cb = deal.currentBalances;
  const ib = deal.initialBalances;
  if (!cb || !ib) return undefined;

  const long = isLong(deal.strategy);
  const { futures, coinm } = resolveDealMarket(deal);

  if (options.combo) {
    return computeComboPnl(deal, { price, usdRate, fee }, long, futures, coinm);
  }

  const gross = long
    ? n(cb.base) * price + n(cb.quote) - n(ib.quote)
    : n(cb.quote) - (n(ib.base) - n(cb.base)) * price;

  const newMultiTp = (deal.flags ?? []).includes('newMultiTp');
  const usageQuote =
    n(deal.usage?.current?.quote) +
    sumQuote(deal.reduceFunds) +
    (newMultiTp ? sumQuote(deal.tpFilledHistory) : 0);
  const usageBase =
    n(deal.usage?.current?.base) +
    sumQty(deal.reduceFunds) +
    (newMultiTp ? sumQty(deal.tpFilledHistory) : 0);
  const usageNative = futures
    ? coinm
      ? usageBase * price
      : usageQuote
    : long
      ? usageQuote
      : usageBase * price;
  const usageUsd = usageNative * usdRate;
  const unrealizedUsd = gross * usdRate - 2 * fee * usageUsd;
  return finiteResult({
    unrealizedUsd,
    usageUsd,
    percent: usageUsd > 0 ? (unrealizedUsd / usageUsd) * 100 : 0,
  });
};

const computeComboPnl = (
  deal: DealPnlInput,
  { price, usdRate, fee }: { price: number; usdRate: number; fee: number },
  long: boolean,
  futures: boolean,
  coinm: boolean
): DealPnlResult | undefined => {
  const cb = deal.currentBalances ?? {};
  const ib = deal.initialBalances ?? {};
  const profitBase =
    (futures && coinm) ||
    (!futures && deal.settings?.profitCurrency === 'base');
  const sign = long ? 1 : -1;
  const profitTotal = n(deal.profit?.total);
  const qty = long ? n(cb.base) : n(ib.base) - n(cb.base);
  const quoteTp = qty * price;

  const hasPaidFees =
    deal.profit?.pureBase !== undefined &&
    deal.profit?.pureBase !== null &&
    deal.profit?.pureQuote !== undefined &&
    deal.profit?.pureQuote !== null &&
    deal.feePaid !== undefined &&
    deal.feePaid !== null &&
    n(cb.quote) >= 0 &&
    n(cb.base) >= 0;

  let total: number;
  if (hasPaidFees) {
    const quote = long ? n(ib.quote) - n(cb.quote) : n(cb.quote);
    const base = quote / price;
    const avgPrice = n(deal.avgPrice);
    const paidBase = n(deal.feePaid?.base);
    const paidQuote = n(deal.feePaid?.quote);
    const commission = profitBase
      ? paidBase + (avgPrice > 0 ? paidQuote / avgPrice : 0)
      : paidBase * avgPrice + paidQuote;
    total = (profitBase ? qty - base : quoteTp - quote) * sign - commission;
  } else {
    const quote =
      (long ? n(ib.quote) - n(cb.quote) : n(cb.quote)) +
      (profitBase ? 0 : profitTotal * sign);
    const base = quote / price + (profitBase ? profitTotal * sign : 0);
    const commission = profitBase ? qty * fee : qty * price * fee;
    total =
      profitTotal +
      (profitBase ? qty - base : quoteTp - quote) * sign -
      commission;
  }

  const toUsd = usdRate * (profitBase ? price : 1);
  const filledBasis = deal.settings?.comboTpBase === 'filled';
  const basis = filledBasis ? deal.usage?.current : deal.usage?.max;
  const denominator = futures
    ? coinm
      ? n(basis?.base)
      : n(basis?.quote)
    : long
      ? n(basis?.quote) * (profitBase ? 1 / price : 1)
      : n(basis?.base) * (profitBase ? 1 : price);
  return finiteResult({
    unrealizedUsd: total * toUsd,
    usageUsd: denominator * toUsd,
    percent: denominator > 0 ? (total / denominator) * 100 : 0,
  });
};

/** A fee row as the fee service returns it (maker is the canonical basis). */
export interface DealFeeRow {
  exchange: string;
  symbol: string;
  fee: number;
}

const dealSymbol = (deal: DealPnlInput): string | undefined =>
  typeof deal.symbol === 'string' ? deal.symbol : deal.symbol?.symbol;

const dealQuoteAsset = (deal: DealPnlInput): string | undefined =>
  typeof deal.symbol === 'object' && deal.symbol
    ? deal.symbol.quoteAsset
    : undefined;

/** Index fee rows by `exchangeUUID \u001f symbol` so a lookup is O(1). */
export const indexFees = (
  fees: readonly DealFeeRow[]
): Map<string, number> => {
  const map = new Map<string, number>();
  for (const f of fees) {
    const key = `${f.exchange}\u001f${f.symbol}`;
    if (!map.has(key)) map.set(key, f.fee);
  }
  return map;
};

const feeIndexCache = new WeakMap<readonly DealFeeRow[], Map<string, number>>();
const cachedFeeIndex = (fees: readonly DealFeeRow[]) => {
  let idx = feeIndexCache.get(fees);
  if (!idx) {
    idx = indexFees(fees);
    feeIndexCache.set(fees, idx);
  }
  return idx;
};

/**
 * Resolve the market inputs for a deal from a price snapshot + fee rows and
 * compute. The price comes from the deal's OWN exchange (or a synthetic
 * `'all'` row) — never another venue's ticker.
 */
export const resolveDealPnlMarket = (
  deal: DealPnlInput,
  prices: readonly PriceData[],
  fees: readonly DealFeeRow[] | Map<string, number>
): DealPnlMarket => {
  const symbol = dealSymbol(deal);
  const exchange = deal.exchange ?? undefined;
  const price =
    symbol && prices.length ? findPrice(prices, symbol, exchange) : undefined;
  const quoteAsset = dealQuoteAsset(deal);
  const usdRate =
    quoteAsset && prices.length
      ? findUSDRate(
          quoteAsset,
          prices as PriceData[],
          exchange as Parameters<typeof findUSDRate>[2]
        )
      : undefined;
  const feeMap = fees instanceof Map ? fees : cachedFeeIndex(fees);
  const fee = symbol
    ? feeMap.get(`${deal.exchangeUUID ?? ''}\u001f${symbol}`)
    : undefined;
  return { price, usdRate, fee };
};

export const computeDealUnrealizedPnlFromPrices = (
  deal: DealPnlInput,
  prices: readonly PriceData[],
  fees: readonly DealFeeRow[] | Map<string, number>,
  options: { combo?: boolean } = {}
): DealPnlResult | undefined => {
  if (!isActiveDealStatus(deal.status)) return undefined;
  return computeDealUnrealizedPnl(
    deal,
    resolveDealPnlMarket(deal, prices, fees),
    options
  );
};

/**
 * The server's stored per-deal value, for rows we do not compute live.
 * Prefers the fee-inclusive `stats.unrealizedProfitNet` when the backend
 * provides it; falls back to the legacy `stats.unrealizedProfit`. Closed
 * deals have none.
 */
export const serverDealUnrealizedPnl = (deal: {
  status?: string | null;
  stats?: {
    unrealizedProfit?: number | null;
    unrealizedProfitNet?: number | null;
    usage?: number | null;
  } | null;
}): { unrealizedUsd: number; percent: number } | undefined => {
  if (!isActiveDealStatus(deal.status)) return undefined;
  const stats = deal.stats;
  const value =
    typeof stats?.unrealizedProfitNet === 'number'
      ? stats.unrealizedProfitNet
      : typeof stats?.unrealizedProfit === 'number'
        ? stats.unrealizedProfit
        : undefined;
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const usage = n(stats?.usage);
  return { unrealizedUsd: value, percent: usage > 0 ? (value / usage) * 100 : 0 };
};
