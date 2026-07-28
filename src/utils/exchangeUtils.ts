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
  ExchangeEnum.krakenUsdm,
  ExchangeEnum.paperKrakenUsdm,
  ExchangeEnum.krakenCoinm,
  ExchangeEnum.paperKrakenCoinm,
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
  ExchangeEnum.krakenCoinm,
  ExchangeEnum.paperKrakenCoinm,
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

// The generic bot-form seed pair is `BTCUSDT` (SHARED_FORM_DEFAULTS), which is
// invalid on exchanges that don't quote BTC in USDT. On such an exchange a
// freshly-opened form would ask the chart for an unsupported pair — e.g.
// `toExchangeCandleSymbol` turns `BTCUSDT` into `BTC-USDT` on Kraken futures,
// which the candle API rejects (`NOTOK`) — leaving the chart blank until the
// aggregate `getAllPairs` query lands and the pair auto-corrects. That window
// can be long (or never close) when the pairs fetch is slow. Return an
// exchange-appropriate BTC default so the chart never starts on an invalid
// pair; the reactive pair-metadata correction still refines it once the real
// pair list loads, so an imperfect guess is at worst prior behavior.
//   • Kraken futures (usdm/linear) is USD-margined → `BTCUSD`
//   • Hyperliquid (spot + linear) quotes in USDC   → `BTCUSDC`
//   • Everyone else keeps the USDT default (Binance/Bybit/OKX-linear/…).
export const getDefaultSeedPair = (
  exchange?: ExchangeEnum | string | null
): string => {
  const normalized = normalizeExchangeId(exchange);
  if (!normalized) return 'BTCUSDT';
  if (normalized.includes('hyperliquid')) return 'BTCUSDC';
  if (
    normalized.includes('kraken') &&
    (normalized.includes('usdm') || normalized.includes('linear'))
  ) {
    return 'BTCUSD';
  }
  return 'BTCUSDT';
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

// Candle-symbol wire form for EVERY `ExchangeEnum` member.
//
// HISTORY / RATIONALE — this used to be an *allowlist* of dashed exchanges
// (`DASHED_CANDLE_SYMBOL_ENUM_SET`), i.e. "concatenated is the default, dash
// only the venues we've been burned by". That default is backwards: every
// venue we ever had to add (KuCoin spot, Kraken, OKX, Coinbase, Hyperliquid)
// was added *after* a user-visible outage, because a missing entry fails
// silently — the venue simply can't resolve the fabricated compact symbol and
// the chart/backtest comes back blank (bug #153: Hyperliquid `BTCUSDC` sent a
// market-archive backfill chasing a coin that doesn't exist, ~93s per
// request). Dashed is also the majority form and what the platform's own
// symbol codec calls canonical, so it is the safe default for any exchange we
// add next.
//
// So the polarity is inverted: **dash by default**, and enumerate only the
// venues whose candle API genuinely wants a NON-dashed string:
//   • `compact` — the exchange-native concatenated pair, e.g. Binance/Bybit/
//     Bitget/MEXC `BTCUSDT`, Bybit inverse `BTCUSD`. Dashing these is fatal:
//     Binance klines answers -1121 "Invalid symbol", and the dashed string
//     also misses every existing archive row (main-app keys the ClickHouse
//     lookup on the raw symbol) and triggers a backfill for a symbol that
//     does not exist.
//   • `compact` also covers **contract-symbol** venues, where the connector
//     re-encodes the compact pair into a contract id: KuCoin futures turns
//     `BTCUSDT` into `XBTUSDTM`, so a dashed input yields the invalid
//     `XBT-USDTM`; Binance COIN-M stores the raw dapi contract `BTCUSD_PERP`.
//   • Pseudo-exchanges (`*All` / `*Spot` account-connection provider values,
//     `ftx*`, `ManualBacktesting`) never reach a real candle API — the
//     connector rejects them on the `exchange` param before the symbol is
//     read. They are classified with their family so the flip is a no-op for
//     them.
//
// The map is an exhaustive `Record<ExchangeEnum, …>` on purpose: adding a new
// enum member is a COMPILE ERROR until it is classified, so a new exchange can
// never silently inherit a wire form nobody checked.
type CandleSymbolForm = 'compact' | 'dashed';

const CANDLE_SYMBOL_FORM_BY_EXCHANGE: Record<ExchangeEnum, CandleSymbolForm> = {
  // ---- Binance family — compact (`BTCUSDT`); COIN-M is a contract id ----
  [ExchangeEnum.binance]: 'compact',
  [ExchangeEnum.binanceUS]: 'compact',
  [ExchangeEnum.binanceUsdm]: 'compact',
  [ExchangeEnum.binanceCoinm]: 'compact',
  [ExchangeEnum.binanceAll]: 'compact',
  [ExchangeEnum.binanceSpot]: 'compact',
  [ExchangeEnum.paperBinance]: 'compact',
  [ExchangeEnum.paperBinanceUsdm]: 'compact',
  [ExchangeEnum.paperBinanceCoinm]: 'compact',
  [ExchangeEnum.paperBinanceAll]: 'compact',
  [ExchangeEnum.paperBinanceSpot]: 'compact',

  // ---- Bybit family — compact (linear `BTCUSDT`, inverse `BTCUSD`) ----
  [ExchangeEnum.bybit]: 'compact',
  [ExchangeEnum.bybitUsdm]: 'compact',
  [ExchangeEnum.bybitCoinm]: 'compact',
  [ExchangeEnum.bybitAll]: 'compact',
  [ExchangeEnum.bybitSpot]: 'compact',
  [ExchangeEnum.paperBybit]: 'compact',
  [ExchangeEnum.paperBybitUsdm]: 'compact',
  [ExchangeEnum.paperBybitCoinm]: 'compact',
  [ExchangeEnum.paperBybitAll]: 'compact',
  [ExchangeEnum.paperBybitSpot]: 'compact',

  // ---- Bitget family — compact ----
  [ExchangeEnum.bitget]: 'compact',
  [ExchangeEnum.bitgetUsdm]: 'compact',
  [ExchangeEnum.bitgetCoinm]: 'compact',
  [ExchangeEnum.bitgetAll]: 'compact',
  [ExchangeEnum.bitgetSpot]: 'compact',
  [ExchangeEnum.paperBitget]: 'compact',
  [ExchangeEnum.paperBitgetUsdm]: 'compact',
  [ExchangeEnum.paperBitgetCoinm]: 'compact',
  [ExchangeEnum.paperBitgetAll]: 'compact',
  [ExchangeEnum.paperBitgetSpot]: 'compact',

  // ---- MEXC — compact ----
  [ExchangeEnum.mexc]: 'compact',
  [ExchangeEnum.paperMexc]: 'compact',

  // ---- KuCoin FUTURES — contract ids (`XBTUSDTM`); dashing is fatal ----
  [ExchangeEnum.kucoinLinear]: 'compact',
  [ExchangeEnum.kucoinInverse]: 'compact',
  [ExchangeEnum.paperKucoinLinear]: 'compact',
  [ExchangeEnum.paperKucoinInverse]: 'compact',

  // ---- Dead / synthetic venues — kept compact so the flip is a no-op ----
  [ExchangeEnum.ftx]: 'compact',
  [ExchangeEnum.ftxUS]: 'compact',
  [ExchangeEnum.paperFtx]: 'compact',
  [ExchangeEnum.ManualBacktesting]: 'compact',

  // ---- KuCoin SPOT — dashed (`BTC-USDT`) ----
  [ExchangeEnum.kucoin]: 'dashed',
  [ExchangeEnum.kucoinSpot]: 'dashed',
  [ExchangeEnum.kucoinAll]: 'dashed',
  [ExchangeEnum.paperKucoin]: 'dashed',
  [ExchangeEnum.paperKucoinSpot]: 'dashed',
  [ExchangeEnum.paperKucoinAll]: 'dashed',

  // ---- OKX (spot + linear/inverse perps) — dashed instIds ----
  [ExchangeEnum.okx]: 'dashed',
  [ExchangeEnum.okxLinear]: 'dashed',
  [ExchangeEnum.okxInverse]: 'dashed',
  [ExchangeEnum.okxAll]: 'dashed',
  [ExchangeEnum.okxSpot]: 'dashed',
  [ExchangeEnum.paperOkx]: 'dashed',
  [ExchangeEnum.paperOkxLinear]: 'dashed',
  [ExchangeEnum.paperOkxInverse]: 'dashed',
  [ExchangeEnum.paperOkxAll]: 'dashed',
  [ExchangeEnum.paperOkxSpot]: 'dashed',

  // ---- Coinbase — dashed product ids (`BTC-USD`) ----
  [ExchangeEnum.coinbase]: 'dashed',
  [ExchangeEnum.paperCoinbase]: 'dashed',

  // ---- Hyperliquid (spot + linear perps) — dashed (`BTC-USDC`) ----
  [ExchangeEnum.hyperliquid]: 'dashed',
  [ExchangeEnum.hyperliquidLinear]: 'dashed',
  [ExchangeEnum.hyperliquidAll]: 'dashed',
  [ExchangeEnum.paperHyperliquid]: 'dashed',
  [ExchangeEnum.paperHyperliquidLinear]: 'dashed',
  [ExchangeEnum.paperHyperliquidAll]: 'dashed',

  // ---- Kraken (spot + futures) — dashed (`BTC-USDT`, `BTC-USD`) ----
  [ExchangeEnum.kraken]: 'dashed',
  [ExchangeEnum.krakenAll]: 'dashed',
  [ExchangeEnum.krakenSpot]: 'dashed',
  [ExchangeEnum.krakenUsdm]: 'dashed',
  [ExchangeEnum.krakenCoinm]: 'dashed',
  [ExchangeEnum.paperKraken]: 'dashed',
  [ExchangeEnum.paperKrakenAll]: 'dashed',
  [ExchangeEnum.paperKrakenSpot]: 'dashed',
  [ExchangeEnum.paperKrakenUsdm]: 'dashed',
  [ExchangeEnum.paperKrakenCoinm]: 'dashed',
};

// The keep-list: exchanges whose candle symbol must be passed through
// VERBATIM. Everything not in here (including an unrecognised / future
// exchange string) is dashed.
const COMPACT_CANDLE_SYMBOL_ENUM_SET = new Set<ExchangeEnum>(
  (Object.keys(CANDLE_SYMBOL_FORM_BY_EXCHANGE) as ExchangeEnum[]).filter(
    (exchange) => CANDLE_SYMBOL_FORM_BY_EXCHANGE[exchange] === 'compact'
  )
);

/**
 * Convert our normalized concatenated pair (e.g. "BTCUSDT") into the symbol an
 * exchange's candle API expects.
 *
 * Dashed (`BTC-USDT`) is the DEFAULT — it is the canonical platform form and
 * what most venues (KuCoin spot, Kraken, OKX, Coinbase, Hyperliquid, and any
 * exchange added in future) require. Only the venues enumerated as `compact`
 * in `CANDLE_SYMBOL_FORM_BY_EXCHANGE` — the Binance / Bybit / Bitget / MEXC
 * families plus the contract-symbol markets (KuCoin futures, Binance COIN-M) —
 * pass through unchanged, as do symbols that already carry a separator.
 *
 * Applied at the single `requestCandles` chokepoint so every candle consumer
 * (chart, backtest, market-stats / quick-panel risk calc, …) is covered, plus
 * the handful of live-update subscriptions that build their own requests.
 */
export const toExchangeCandleSymbol = (
  exchange: ExchangeEnum | string | null | undefined,
  symbol: string
): string => {
  // Already exchange-native (dashed, or an xStock like `AAPLx-USD`, or an
  // OKX/HIP-3 multi-segment id) — never re-split it.
  if (symbol.includes('-')) {
    return symbol;
  }
  if (COMPACT_CANDLE_SYMBOL_ENUM_SET.has(exchange as ExchangeEnum)) {
    return symbol;
  }
  const { baseAsset, quoteAsset } = extractPairAssets(symbol);
  if (baseAsset && quoteAsset) {
    return `${baseAsset}-${quoteAsset}`;
  }
  // Unsplittable on a dashed venue: the quote is not in COMMON_QUOTE_ASSETS.
  // Ship the input unchanged (prior behavior) but say so — silent
  // passthrough here is exactly how bug #153 stayed invisible for weeks.
  // Callers with pair metadata in scope should pass the native
  // `pairMetadata[key].pair` instead of relying on this heuristic.
  console.warn(
    `[toExchangeCandleSymbol] Cannot derive the dashed pair for "${symbol}" on ${String(
      exchange
    )} — quote not in COMMON_QUOTE_ASSETS; sending unconverted.`
  );
  return symbol;
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
