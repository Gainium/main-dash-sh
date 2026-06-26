import { ExchangeEnum } from '@/types';
import { extractPairAssets } from '@/utils/pairs';

type ExchangeMarketType = 'spot' | 'futures' | 'unknown';

const FUTURES_KEYWORDS = ['futures', 'usdm', 'coinm', 'linear', 'inverse'];

const FUTURES_ENUM_SET = new Set<ExchangeEnum>([
  ExchangeEnum.binanceUsdm,
  ExchangeEnum.binanceCoinm,
  ExchangeEnum.paperBinanceUsdm,
  ExchangeEnum.paperBinanceCoinm,
  ExchangeEnum.bybitUsdm,
  ExchangeEnum.bybitCoinm,
  ExchangeEnum.paperBybitUsdm,
  ExchangeEnum.paperBybitCoinm,
  ExchangeEnum.okxLinear,
  ExchangeEnum.okxInverse,
  ExchangeEnum.paperOkxLinear,
  ExchangeEnum.paperOkxInverse,
  ExchangeEnum.kucoinLinear,
  ExchangeEnum.kucoinInverse,
  ExchangeEnum.paperKucoinLinear,
  ExchangeEnum.paperKucoinInverse,
  ExchangeEnum.bitgetUsdm,
  ExchangeEnum.bitgetCoinm,
  ExchangeEnum.paperBitgetUsdm,
  ExchangeEnum.paperBitgetCoinm,
]);

const COINM_ENUM_SET = new Set<ExchangeEnum>([
  ExchangeEnum.binanceCoinm,
  ExchangeEnum.paperBinanceCoinm,
  ExchangeEnum.bybitCoinm,
  ExchangeEnum.paperBybitCoinm,
  ExchangeEnum.bitgetCoinm,
  ExchangeEnum.paperBitgetCoinm,
  ExchangeEnum.okxInverse,
  ExchangeEnum.paperOkxInverse,
  ExchangeEnum.kucoinInverse,
  ExchangeEnum.paperKucoinInverse,
]);

const normalizeExchangeId = (
  exchange?: ExchangeEnum | string | null
): string => {
  if (!exchange) return '';
  return exchange.toString().toLowerCase();
};

export const classifyExchangeMarket = (
  exchange?: ExchangeEnum | string | null
): ExchangeMarketType => {
  if (!exchange) return 'unknown';
  if (FUTURES_ENUM_SET.has(exchange as ExchangeEnum)) {
    return 'futures';
  }
  const normalized = normalizeExchangeId(exchange);
  if (!normalized) return 'unknown';
  if (FUTURES_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'futures';
  }
  return 'spot';
};

export const isFuturesExchange = (
  exchange?: ExchangeEnum | string | null
): boolean => classifyExchangeMarket(exchange) === 'futures';

export const isCoinmExchange = (
  exchange?: ExchangeEnum | string | null
): boolean => {
  if (!exchange) return false;
  if (COINM_ENUM_SET.has(exchange as ExchangeEnum)) {
    return true;
  }
  const normalized = normalizeExchangeId(exchange);
  if (!normalized) return false;
  return normalized.includes('coinm') || normalized.includes('inverse');
};

// Hyperliquid spot bridges a few assets under synthetic / Unit symbols that
// differ from the symbol the app shows in the trading pair. The clearest case:
// the BTC spot market trades as the "BTC-USDC" pair, but the wallet holds the
// position as "UBTC" (Unit BTC) — and "SBTC"/"SUSD"/"SUSDT" are the older
// synthetic names. Because balances are matched to the pair's base/quote
// asset by symbol, a wallet asset of "UBTC" never matches a pair base of
// "BTC", so the balance reads 0 (user can't sell their spot BTC; forum #4860).
//
// Most Unit tokens KEEP their "U" prefix in the pair name too ("UETH-USDC",
// "USOL-USDC"), so those already match — only the handful below are renamed
// on one side. Hence an explicit, exact-match alias table rather than a blanket
// "strip leading U" (which would wrongly rewrite real tickers like "UP" or
// "USDC"). Mirrors the same remap already applied in `findUSDRate`.
const SPOT_BALANCE_ASSET_ALIASES: Record<string, string> = {
  UBTC: 'BTC',
  SBTC: 'BTC',
  SUSD: 'USD',
  SUSDT: 'USDT',
};

/**
 * Canonicalize a wallet balance asset symbol to the symbol the app uses in
 * trading pairs, so per-asset balances reconcile against the selected pair.
 * Exact-match only; unknown symbols pass through upper-cased.
 */
export const normalizeBalanceAsset = (asset?: string | null): string => {
  if (!asset) return '';
  const upper = asset.toUpperCase().trim();
  return SPOT_BALANCE_ASSET_ALIASES[upper] ?? upper;
};

// Exchanges whose candle API expects the dashed native pair ("BTC-USDT")
// rather than the concatenated form ("BTCUSDT") the app stores internally.
//
// - KuCoin **spot** ("BTC-USDT"). KuCoin futures (linear/inverse) use contract
//   symbols and are intentionally excluded.
// - Kraken **spot and futures** — Kraken's `/candles` backend rejects the
//   concatenated form ("Unknown asset pair" on spot, "Bad Request" on
//   krakenUsdm) and only resolves the dashed pair (`BTC-USDT`, `BTC-USD`). The
//   legacy dashboard never hit this because it carried the dashed pair through;
//   the redesign normalizes bot pairs to the concatenated form, so the dash has
//   to be restored here. Paper variants are included because callers may pass an
//   un-stripped exchange.
const DASHED_CANDLE_SYMBOL_ENUM_SET = new Set<ExchangeEnum>([
  ExchangeEnum.kucoin,
  ExchangeEnum.paperKucoin,
  ExchangeEnum.kraken,
  ExchangeEnum.krakenSpot,
  ExchangeEnum.krakenAll,
  ExchangeEnum.krakenUsdm,
  ExchangeEnum.paperKraken,
  ExchangeEnum.paperKrakenSpot,
  ExchangeEnum.paperKrakenAll,
  ExchangeEnum.paperKrakenUsdm,
]);

/**
 * Convert our normalized concatenated pair (e.g. "BTCUSDT") into the symbol an
 * exchange's candle API expects. KuCoin spot and Kraken (spot + futures)
 * identify pairs with a dash ("BTC-USDT"); Binance/Bybit/etc. use the
 * concatenated form natively and pass through unchanged, as do symbols that
 * already carry a separator.
 *
 * Applied at the single `requestCandles` chokepoint so every candle consumer
 * (chart, backtest, market-stats / quick-panel risk calc, …) is covered.
 */
export const toExchangeCandleSymbol = (
  exchange: ExchangeEnum | string | null | undefined,
  symbol: string
): string => {
  if (
    !DASHED_CANDLE_SYMBOL_ENUM_SET.has(exchange as ExchangeEnum) ||
    symbol.includes('-')
  ) {
    return symbol;
  }
  const { baseAsset, quoteAsset } = extractPairAssets(symbol);
  return baseAsset && quoteAsset ? `${baseAsset}-${quoteAsset}` : symbol;
};

// Providers that do NOT support the "ignore fee" toggle (mirrors legacy `showZeroFee`).
const ZERO_FEE_UNSUPPORTED = new Set<string>([
  'okx',
  'okxinverse',
  'okxlinear',
  'bybit',
  'bybitcoinm',
  'bybitusdm',
  'hyperliquid',
  'hyperliquidlinear',
  'kraken',
  'krakenusdm',
]);

export const showZeroFee = (provider?: string | null): boolean => {
  if (!provider) {
    return false;
  }
  const normalized = provider.toLowerCase();
  if (normalized.startsWith('paper')) {
    return false;
  }
  return !ZERO_FEE_UNSUPPORTED.has(normalized);
};

// Provider to icon mapping for exchanges
export const PROVIDER_ICONS: Record<string, string> = {
  all: '🌐', // All exchanges icon
  // Binance variants
  binance: '/images/exchanges/binance.svg',
  binancePaper: '/images/exchanges/binance.svg',
  binanceUS: '/images/exchanges/binance.svg',
  binanceCoinm: '/images/exchanges/binance.svg',
  binanceUsdm: '/images/exchanges/binance.svg',
  binanceAll: '/images/exchanges/binance.svg',
  binanceSpot: '/images/exchanges/binance.svg',
  paperBinance: '/images/exchanges/binance.svg',
  paperBinanceCoinm: '/images/exchanges/binance.svg',
  paperBinanceUsdm: '/images/exchanges/binance.svg',
  paperBinanceAll: '/images/exchanges/binance.svg',
  paperBinanceSpot: '/images/exchanges/binance.svg',
  // KuCoin variants
  kucoin: '/images/exchanges/kucoin.svg',
  kucoinPaper: '/images/exchanges/kucoin.svg',
  kucoinInverse: '/images/exchanges/kucoin.svg',
  kucoinLinear: '/images/exchanges/kucoin.svg',
  kucoinAll: '/images/exchanges/kucoin.svg',
  kucoinSpot: '/images/exchanges/kucoin.svg',
  paperKucoin: '/images/exchanges/kucoin.svg',
  paperKucoinInverse: '/images/exchanges/kucoin.svg',
  paperKucoinLinear: '/images/exchanges/kucoin.svg',
  paperKucoinAll: '/images/exchanges/kucoin.svg',
  paperKucoinSpot: '/images/exchanges/kucoin.svg',
  // Bybit variants
  bybit: '/images/exchanges/bybit.svg',
  bybitPaper: '/images/exchanges/bybit.svg',
  bybitLinear: '/images/exchanges/bybit.svg',
  bybitInverse: '/images/exchanges/bybit.svg',
  bybitAll: '/images/exchanges/bybit.svg',
  bybitSpot: '/images/exchanges/bybit.svg',
  paperBybit: '/images/exchanges/bybit.svg',
  paperBybitLinear: '/images/exchanges/bybit.svg',
  paperBybitInverse: '/images/exchanges/bybit.svg',
  paperBybitAll: '/images/exchanges/bybit.svg',
  paperBybitSpot: '/images/exchanges/bybit.svg',
  // OKX variants
  okx: '/images/exchanges/okx.svg',
  okxPaper: '/images/exchanges/okx.svg',
  okxLinear: '/images/exchanges/okx.svg',
  okxInverse: '/images/exchanges/okx.svg',
  okxAll: '/images/exchanges/okx.svg',
  okxSpot: '/images/exchanges/okx.svg',
  paperOkx: '/images/exchanges/okx.svg',
  paperOkxLinear: '/images/exchanges/okx.svg',
  paperOkxInverse: '/images/exchanges/okx.svg',
  paperOkxAll: '/images/exchanges/okx.svg',
  paperOkxSpot: '/images/exchanges/okx.svg',
  // Bitget variants
  bitget: '/images/exchanges/bitget.svg',
  bitgetPaper: '/images/exchanges/bitget.svg',
  bitgetUsdm: '/images/exchanges/bitget.svg',
  bitgetCoinm: '/images/exchanges/bitget.svg',
  bitgetAll: '/images/exchanges/bitget.svg',
  bitgetSpot: '/images/exchanges/bitget.svg',
  paperBitget: '/images/exchanges/bitget.svg',
  paperBitgetUsdm: '/images/exchanges/bitget.svg',
  paperBitgetCoinm: '/images/exchanges/bitget.svg',
  paperBitgetAll: '/images/exchanges/bitget.svg',
  paperBitgetSpot: '/images/exchanges/bitget.svg',
  // Coinbase variants
  coinbase: '/images/exchanges/coinbase.svg',
  coinbasePaper: '/images/exchanges/coinbase.svg',
  paperCoinbase: '/images/exchanges/coinbase.svg',
  // Hyperliquid variants
  hyperliquid: '/images/exchanges/hyperliquid.svg',
  hyperliquidPaper: '/images/exchanges/hyperliquid.svg',
  hyperliquidLinear: '/images/exchanges/hyperliquid.svg',
  hyperliquidAll: '/images/exchanges/hyperliquid.svg',
  paperHyperliquid: '/images/exchanges/hyperliquid.svg',
  paperHyperliquidLinear: '/images/exchanges/hyperliquid.svg',
  paperHyperliquidAll: '/images/exchanges/hyperliquid.svg',
  // Kraken variants
  kraken: '/images/exchanges/kraken.svg',
  krakenAll: '/images/exchanges/kraken.svg',
  krakenSpot: '/images/exchanges/kraken.svg',
  krakenUsdm: '/images/exchanges/kraken.svg',
  paperKraken: '/images/exchanges/kraken.svg',
  paperKrakenAll: '/images/exchanges/kraken.svg',
  paperKrakenSpot: '/images/exchanges/kraken.svg',
  paperKrakenUsdm: '/images/exchanges/kraken.svg',
};

// Provider to color mapping for exchanges
export const PROVIDER_COLORS: Record<string, string> = {
  all: '#6b7280',
  // Binance variants
  binance: '#f3ba2f',
  binancePaper: '#f3ba2f',
  binanceUS: '#f3ba2f',
  binanceCoinm: '#f3ba2f',
  binanceUsdm: '#f3ba2f',
  binanceAll: '#f3ba2f',
  binanceSpot: '#f3ba2f',
  paperBinance: '#f3ba2f',
  paperBinanceCoinm: '#f3ba2f',
  paperBinanceUsdm: '#f3ba2f',
  paperBinanceAll: '#f3ba2f',
  paperBinanceSpot: '#f3ba2f',
  // KuCoin variants
  kucoin: '#24ae8f',
  kucoinPaper: '#24ae8f',
  kucoinInverse: '#24ae8f',
  kucoinLinear: '#24ae8f',
  kucoinAll: '#24ae8f',
  kucoinSpot: '#24ae8f',
  paperKucoin: '#24ae8f',
  paperKucoinInverse: '#24ae8f',
  paperKucoinLinear: '#24ae8f',
  paperKucoinAll: '#24ae8f',
  paperKucoinSpot: '#24ae8f',
  // Bybit variants
  bybit: '#f7a600',
  bybitPaper: '#f7a600',
  bybitLinear: '#f7a600',
  bybitInverse: '#f7a600',
  bybitAll: '#f7a600',
  bybitSpot: '#f7a600',
  paperBybit: '#f7a600',
  paperBybitLinear: '#f7a600',
  paperBybitInverse: '#f7a600',
  paperBybitAll: '#f7a600',
  paperBybitSpot: '#f7a600',
  // OKX variants
  okx: '#0084ff',
  okxPaper: '#0084ff',
  okxLinear: '#0084ff',
  okxInverse: '#0084ff',
  okxAll: '#0084ff',
  okxSpot: '#0084ff',
  paperOkx: '#0084ff',
  paperOkxLinear: '#0084ff',
  paperOkxInverse: '#0084ff',
  paperOkxAll: '#0084ff',
  paperOkxSpot: '#0084ff',
  // Bitget variants
  bitget: '#00d4aa',
  bitgetPaper: '#00d4aa',
  bitgetUsdm: '#00d4aa',
  bitgetCoinm: '#00d4aa',
  bitgetAll: '#00d4aa',
  bitgetSpot: '#00d4aa',
  paperBitget: '#00d4aa',
  paperBitgetUsdm: '#00d4aa',
  paperBitgetCoinm: '#00d4aa',
  paperBitgetAll: '#00d4aa',
  paperBitgetSpot: '#00d4aa',
  // Coinbase variants
  coinbase: '#0052ff',
  coinbasePaper: '#0052ff',
  paperCoinbase: '#0052ff',
  // Hyperliquid variants
  hyperliquid: '#000000',
  hyperliquidPaper: '#000000',
  hyperliquidLinear: '#000000',
  hyperliquidAll: '#000000',
  paperHyperliquid: '#000000',
  paperHyperliquidLinear: '#000000',
  paperHyperliquidAll: '#000000',
  // Kraken variants (brand purple)
  kraken: '#5848D6',
  krakenAll: '#5848D6',
  krakenSpot: '#5848D6',
  krakenUsdm: '#5848D6',
  paperKraken: '#5848D6',
  paperKrakenAll: '#5848D6',
  paperKrakenSpot: '#5848D6',
  paperKrakenUsdm: '#5848D6',
};

export function getProviderIcon(provider: string): string {
  // Handle undefined, null, or empty provider
  if (!provider) {
    return PROVIDER_ICONS['all'] || '/assets/exchanges/default.svg';
  }

  // First try exact match
  if (PROVIDER_ICONS[provider]) {
    return PROVIDER_ICONS[provider];
  }

  // Fallback: match by contained exchange name (handles unknown variants)
  const providerLower = provider.toLowerCase();
  if (providerLower.includes('binance')) return PROVIDER_ICONS['binance'];
  if (providerLower.includes('bybit')) return PROVIDER_ICONS['bybit'];
  if (providerLower.includes('okx')) return PROVIDER_ICONS['okx'];
  if (providerLower.includes('kucoin')) return PROVIDER_ICONS['kucoin'];
  if (providerLower.includes('bitget')) return PROVIDER_ICONS['bitget'];
  if (providerLower.includes('coinbase')) return PROVIDER_ICONS['coinbase'];
  if (providerLower.includes('hyperliquid'))
    return PROVIDER_ICONS['hyperliquid'];
  if (providerLower.includes('kraken')) return PROVIDER_ICONS['kraken'];

  return '🏦'; // Default fallback icon
}

export function getProviderColor(provider: string): string {
  // Handle undefined, null, or empty provider
  if (!provider) {
    return PROVIDER_COLORS['all'] || '#6b7280';
  }
  return PROVIDER_COLORS[provider] || '#6b7280'; // Default gray color
}

// Format exchange provider information for display
export function formatExchangeProvider(provider: string): string {
  // Handle undefined, null, or empty provider
  if (!provider) {
    return 'Unknown Exchange\nSpot';
  }

  const providerLower = provider.toLowerCase();

  // Extract the clean provider brand name and trade type
  let cleanProviderName = '';
  let exchangeType = 'Spot';

  const isPaper = providerLower.includes('paper');
  const isFutures = isFuturesExchange(provider);
  const isCoinm = isCoinmExchange(provider);

  // Helper to pick the clean provider name
  const pickCleanName = () => {
    if (providerLower.includes('binance')) return 'Binance';
    if (providerLower.includes('bybit')) return 'Bybit';
    if (providerLower.includes('okx')) return 'OKX';
    if (providerLower.includes('kucoin')) return 'KuCoin';
    if (providerLower.includes('bitget')) return 'Bitget';
    if (providerLower.includes('coinbase')) return 'Coinbase';
    if (providerLower.includes('hyperliquid')) return 'Hyperliquid';
    if (providerLower.includes('kraken')) return 'Kraken';
    return (
      provider
        .replace(/paper|usdm|coinm|linear|inverse|futures/gi, '')
        .trim() || provider
    );
  };

  cleanProviderName = pickCleanName();

  // Determine the exchange type
  if (isFutures) {
    exchangeType = isCoinm ? 'Futures (COIN-M)' : 'Futures (USDM)';
  } else {
    exchangeType = 'Spot';
  }

  if (isPaper) {
    exchangeType = `Paper ⟡ ${exchangeType}`;
  }

  // Format as: "Brand Name\nType"
  return `${cleanProviderName}\n${exchangeType}`;
}

export const removePaperPrefix = (exchange: ExchangeEnum): ExchangeEnum => {
  const exchangeString = exchange.toString();
  if (exchangeString.startsWith('paper')) {
    const removePaper = exchangeString.replace('paper', '');

    return `${removePaper.slice(0, 1).toLowerCase()}${removePaper.slice(1, removePaper.length)}` as ExchangeEnum;
  }
  return exchange;
};

// Trade type enum to match main-dash
export enum TradeTypeEnum {
  all = 'all',
  margin = 'margin',
  spot = 'spot',
  futures = 'futures',
}

// Get exchange trade type based on provider - matches main-dash implementation
export const getExchangeTradeType = (exchange: ExchangeEnum): string => {
  if (
    [
      ExchangeEnum.binanceCoinm,
      ExchangeEnum.binanceUsdm,
      ExchangeEnum.paperBinanceCoinm,
      ExchangeEnum.paperBinanceUsdm,
      ExchangeEnum.bybitUsdm,
      ExchangeEnum.bybitCoinm,
      ExchangeEnum.paperBybitUsdm,
      ExchangeEnum.paperBybitCoinm,
      ExchangeEnum.okxInverse,
      ExchangeEnum.okxLinear,
      ExchangeEnum.paperOkxLinear,
      ExchangeEnum.paperOkxInverse,
      ExchangeEnum.kucoinInverse,
      ExchangeEnum.kucoinLinear,
      ExchangeEnum.paperKucoinInverse,
      ExchangeEnum.paperKucoinLinear,
      ExchangeEnum.bitgetCoinm,
      ExchangeEnum.bitgetUsdm,
      ExchangeEnum.paperBitgetCoinm,
      ExchangeEnum.paperBitgetUsdm,
      ExchangeEnum.hyperliquidLinear,
      ExchangeEnum.paperHyperliquidLinear,
      ExchangeEnum.krakenUsdm,
      ExchangeEnum.paperKrakenUsdm,
    ].includes(exchange)
  ) {
    return TradeTypeEnum.futures;
  }
  if (
    [
      ExchangeEnum.binanceAll,
      ExchangeEnum.paperBinanceAll,
      ExchangeEnum.bybitAll,
      ExchangeEnum.paperBybitAll,
      ExchangeEnum.okxAll,
      ExchangeEnum.paperOkxAll,
      ExchangeEnum.kucoinAll,
      ExchangeEnum.paperKucoinAll,
      ExchangeEnum.bitgetAll,
      ExchangeEnum.paperBitgetAll,
      ExchangeEnum.hyperliquidAll,
      ExchangeEnum.paperHyperliquidAll,
      ExchangeEnum.krakenAll,
      ExchangeEnum.paperKrakenAll,
    ].includes(exchange)
  ) {
    return TradeTypeEnum.all;
  }
  return TradeTypeEnum.spot;
};
