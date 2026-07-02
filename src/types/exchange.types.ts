export type ExchangeInUser = {
  provider: ExchangeEnum;
  name: string;
  key: string;
  secret: string;
  uuid: string;
  passphrase?: string;
  status?: boolean;
  balance?: number;
  hedge?: boolean;
  linkedTo?: string;
  lastUpdated?: number;
  keysType?: CoinbaseKeysType;
  okxSource?: OKXSource;
  bybitHost?: string;
  affiliate?: boolean;
  waitingForConfirmation?: boolean;
  zeroFee?: boolean;
  subaccount?: boolean;
};

export enum OKXSource {
  my = 'my',
  app = 'app',
  com = 'com',
}

export enum CoinbaseKeysType {
  legacy = 'legacy',
  cloud = 'cloud',
}
export type ExchangesTotal = {
  uuid: string;
  totalUsd: number;
};
export enum ExchangeEnum {
  binance = 'binance',
  kucoin = 'kucoin',
  ftx = 'ftx',
  bybit = 'bybit',
  binanceUS = 'binanceUS',
  ftxUS = 'ftxUS',
  paperBinance = 'paperBinance',
  paperKucoin = 'paperKucoin',
  paperFtx = 'paperFtx',
  paperBybit = 'paperBybit',
  binanceCoinm = 'binanceCoinm',
  binanceUsdm = 'binanceUsdm',
  paperBinanceCoinm = 'paperBinanceCoinm',
  paperBinanceUsdm = 'paperBinanceUsdm',
  binanceAll = 'binanceAll',
  binanceSpot = 'binanceSpot',
  paperBinanceAll = 'paperBinanceAll',
  paperBinanceSpot = 'paperBinanceSpot',
  bybitCoinm = 'bybitInverse',
  bybitUsdm = 'bybitLinear',
  paperBybitCoinm = 'paperBybitInverse',
  paperBybitUsdm = 'paperBybitLinear',
  bybitAll = 'bybitAll',
  bybitSpot = 'bybitSpot',
  paperBybitAll = 'paperBybitAll',
  paperBybitSpot = 'paperBybitSpot',
  okx = 'okx',
  okxLinear = 'okxLinear',
  okxInverse = 'okxInverse',
  paperOkx = 'paperOkx',
  paperOkxLinear = 'paperOkxLinear',
  paperOkxInverse = 'paperOkxInverse',
  okxAll = 'okxAll',
  okxSpot = 'okxSpot',
  paperOkxAll = 'paperOkxAll',
  paperOkxSpot = 'paperOkxSpot',
  coinbase = 'coinbase',
  paperCoinbase = 'paperCoinbase',
  kucoinInverse = 'kucoinInverse',
  kucoinLinear = 'kucoinLinear',
  paperKucoinInverse = 'paperKucoinInverse',
  paperKucoinLinear = 'paperKucoinLinear',
  kucoinAll = 'kucoinAll',
  kucoinSpot = 'kucoinSpot',
  paperKucoinAll = 'paperKucoinAll',
  paperKucoinSpot = 'paperKucoinSpot',
  bitget = 'bitget',
  paperBitget = 'paperBitget',
  bitgetUsdm = 'bitgetUsdm',
  bitgetCoinm = 'bitgetCoinm',
  paperBitgetUsdm = 'paperBitgetUsdm',
  paperBitgetCoinm = 'paperBitgetCoinm',
  bitgetAll = 'bitgetAll',
  bitgetSpot = 'bitgetSpot',
  paperBitgetAll = 'paperBitgetAll',
  paperBitgetSpot = 'paperBitgetSpot',
  mexc = 'mexc',
  paperMexc = 'paperMexc',
  hyperliquid = 'hyperliquid',
  hyperliquidLinear = 'hyperliquidLinear',
  paperHyperliquid = 'paperHyperliquid',
  paperHyperliquidLinear = 'paperHyperliquidLinear',
  hyperliquidAll = 'hyperliquidAll',
  paperHyperliquidAll = 'paperHyperliquidAll',
  // Kraken — mirrors the legacy dashboard's variant set. `kraken` is the
  // legacy "umbrella" id retained for backward compat; `krakenAll` is the
  // spot+futures selection; `krakenSpot` and `krakenUsdm` pin a single
  // market type. Coinm futures are intentionally omitted (legacy keeps
  // them commented out).
  kraken = 'kraken',
  krakenAll = 'krakenAll',
  krakenSpot = 'krakenSpot',
  krakenUsdm = 'krakenUsdm',
  paperKraken = 'paperKraken',
  paperKrakenAll = 'paperKrakenAll',
  paperKrakenSpot = 'paperKrakenSpot',
  paperKrakenUsdm = 'paperKrakenUsdm',
  // ManualBacktesting exchange for trading simulator
  ManualBacktesting = 'manualbacktesting',
  krakenCoinm = 'krakenCoinm',
  paperKrakenCoinm = 'paperKrakenCoinm',
}

export enum TradeTypeEnum {
  all = 'all',
  margin = 'margin',
  spot = 'spot',
  futures = 'futures',
}

/**
 * A single active Binance Futures "Quantitative Rules" (-4400) cooldown, as
 * returned by the `getQuantRulesStatus` GraphQL query. When Binance trips its
 * quantitative rules the account/symbol is forced reduce-only temporarily; the
 * backend pauses new (non-reduceOnly) orders for the window and retries them
 * automatically after `until`.
 *
 * `symbol` is null for a whole-account restriction (`scope === 'account'`).
 * `until` is serialized by main-app as an ISO-8601 string (see main-app
 * `core/src/graphql/handlers/quantRules.handler.ts`), but parse defensively
 * (ISO string or epoch-ms) on the client.
 */
export interface QuantRulesCooldown {
  exchangeUUID: string | null;
  exchange: string | null;
  /** null => whole-account restriction (scope 'account') */
  symbol: string | null;
  /** 'symbol' | 'account' */
  scope: string | null;
  /** 1 | 2 | 3 */
  level: number | null;
  /** cooldown expiry — ISO string (or epoch-ms) of a Date */
  until: string | null;
  violationCount24h: number | null;
}
