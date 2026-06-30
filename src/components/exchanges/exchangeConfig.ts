import {
  ExchangeEnum,
  CoinbaseKeysType,
  OKXSource,
} from '../../types/exchange.types';
import type {
  ExchangeProviderConfig,
  PaperTradingAsset,
  ExchangeHostOption,
} from './types';

// Exchange provider configurations - matches main-dash exchangesList
export const exchangeProviders: ExchangeProviderConfig[] = [
  // Binance variants (live)
  {
    id: ExchangeEnum.binance,
    name: 'binance',
    displayName: 'Binance',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.binanceAll,
    name: 'binance',
    displayName: 'Binance SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.binanceSpot,
    name: 'binance',
    displayName: 'Binance SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
    popular: true,
  },
  {
    id: ExchangeEnum.binanceCoinm,
    name: 'binance',
    displayName: 'Binance COIN-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.binanceUsdm,
    name: 'binance',
    displayName: 'Binance USDⓈ-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.binanceUS,
    name: 'binance',
    displayName: 'Binance US',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: false,
    isPaperExchange: false,
    category: 'spot',
  },

  // KuCoin variants (live)
  {
    id: ExchangeEnum.kucoin,
    name: 'kucoin',
    displayName: 'Kucoin',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.kucoinAll,
    name: 'kucoin',
    displayName: 'Kucoin SPOT & Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
  },
  {
    id: ExchangeEnum.kucoinSpot,
    name: 'kucoin',
    displayName: 'Kucoin SPOT',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.kucoinLinear,
    name: 'kucoin',
    displayName: 'Kucoin USDⓈ-M Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.kucoinInverse,
    name: 'kucoin',
    displayName: 'Kucoin COIN-M Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },

  // Bybit variants (live)
  {
    id: ExchangeEnum.bybit,
    name: 'bybit',
    displayName: 'Bybit',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.bybitAll,
    name: 'bybit',
    displayName: 'Bybit SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.bybitSpot,
    name: 'bybit',
    displayName: 'Bybit SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.bybitUsdm,
    name: 'bybit',
    displayName: 'Bybit Linear Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.bybitCoinm,
    name: 'bybit',
    displayName: 'Bybit Inverse Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },

  // OKX variants (live)
  {
    id: ExchangeEnum.okx,
    name: 'okx',
    displayName: 'OKX',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.okxAll,
    name: 'okx',
    displayName: 'OKX SPOT & Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
  },
  {
    id: ExchangeEnum.okxSpot,
    name: 'okx',
    displayName: 'OKX SPOT',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.okxLinear,
    name: 'okx',
    displayName: 'OKX Linear Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.okxInverse,
    name: 'okx',
    displayName: 'OKX Inverse Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: true,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },

  // Coinbase (live)
  {
    id: ExchangeEnum.coinbase,
    name: 'coinbase',
    displayName: 'Coinbase',
    requiresPassphrase: false,
    supportsKeyTypes: true,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },

  // Paper Binance variants
  {
    id: ExchangeEnum.paperBinance,
    name: 'binance',
    displayName: 'Paper Binance',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperBinanceAll,
    name: 'binance',
    displayName: 'Paper Binance SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.paperBinanceSpot,
    name: 'binance',
    displayName: 'Paper Binance SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperBinanceCoinm,
    name: 'binance',
    displayName: 'Paper Binance COIN-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperBinanceUsdm,
    name: 'binance',
    displayName: 'Paper Binance USDⓈ-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },

  // Paper KuCoin variants
  {
    id: ExchangeEnum.paperKucoin,
    name: 'kucoin',
    displayName: 'Paper Kucoin',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperKucoinAll,
    name: 'kucoin',
    displayName: 'Paper Kucoin SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
  },
  {
    id: ExchangeEnum.paperKucoinSpot,
    name: 'kucoin',
    displayName: 'Paper Kucoin SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperKucoinLinear,
    name: 'kucoin',
    displayName: 'Paper Kucoin USDⓈ-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperKucoinInverse,
    name: 'kucoin',
    displayName: 'Paper Kucoin COIN-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },

  // Paper Bybit variants
  {
    id: ExchangeEnum.paperBybit,
    name: 'bybit',
    displayName: 'Paper Bybit',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperBybitAll,
    name: 'bybit',
    displayName: 'Paper Bybit SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.paperBybitSpot,
    name: 'bybit',
    displayName: 'Paper Bybit SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperBybitCoinm,
    name: 'bybit',
    displayName: 'Paper Bybit Inverse Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperBybitUsdm,
    name: 'bybit',
    displayName: 'Paper Bybit Linear Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },

  // Paper OKX variants
  {
    id: ExchangeEnum.paperOkx,
    name: 'okx',
    displayName: 'Paper OKX',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperOkxAll,
    name: 'okx',
    displayName: 'Paper OKX SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
  },
  {
    id: ExchangeEnum.paperOkxSpot,
    name: 'okx',
    displayName: 'Paper OKX SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperOkxInverse,
    name: 'okx',
    displayName: 'Paper OKX Inverse Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperOkxLinear,
    name: 'okx',
    displayName: 'Paper OKX Linear Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },

  // Paper Coinbase
  {
    id: ExchangeEnum.paperCoinbase,
    name: 'coinbase',
    displayName: 'Paper Coinbase',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },

  // Bitget variants (live)
  {
    // Legacy "umbrella" id. `mapProviderToBackend` collapses both
    // `bitgetSpot` and `bitgetAll` to `bitget` on save, so every saved
    // Bitget account comes back as `bitget`. Without this entry
    // `getExchangeConfig('bitget')` was undefined, leaving the edit
    // dialog's exchange dropdown blank and hiding the passphrase field.
    // Hidden from the add list like the other umbrella ids.
    id: ExchangeEnum.bitget,
    name: 'bitget',
    displayName: 'Bitget',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.bitgetAll,
    name: 'bitget',
    displayName: 'Bitget SPOT & Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.bitgetSpot,
    name: 'bitget',
    displayName: 'Bitget SPOT',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.bitgetUsdm,
    name: 'bitget',
    displayName: 'Bitget Linear Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.bitgetCoinm,
    name: 'bitget',
    displayName: 'Bitget Inverse Futures',
    requiresPassphrase: true,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },

  // Hyperliquid variants (live)
  {
    id: ExchangeEnum.hyperliquid,
    name: 'hyperliquid',
    displayName: 'Hyperliquid SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.hyperliquidLinear,
    name: 'hyperliquid',
    displayName: 'Hyperliquid Linear Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },
  {
    id: ExchangeEnum.hyperliquidAll,
    name: 'hyperliquid',
    displayName: 'Hyperliquid SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
  },

  // Paper Bitget variants
  {
    id: ExchangeEnum.paperBitget,
    name: 'bitget',
    displayName: 'Paper Bitget',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperBitgetAll,
    name: 'bitget',
    displayName: 'Paper Bitget SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    popular: true,
  },
  {
    id: ExchangeEnum.paperBitgetSpot,
    name: 'bitget',
    displayName: 'Paper Bitget SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperBitgetUsdm,
    name: 'bitget',
    displayName: 'Paper Bitget Linear Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperBitgetCoinm,
    name: 'bitget',
    displayName: 'Paper Bitget Inverse Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },

  // Paper Hyperliquid
  {
    id: ExchangeEnum.paperHyperliquid,
    name: 'hyperliquid',
    displayName: 'Paper Hyperliquid SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperHyperliquidLinear,
    name: 'hyperliquid',
    displayName: 'Paper Hyperliquid Linear',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
  {
    id: ExchangeEnum.paperHyperliquidAll,
    name: 'hyperliquid',
    displayName: 'Paper Hyperliquid SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
  },

  // Kraken (live)
  {
    id: ExchangeEnum.kraken,
    name: 'kraken',
    displayName: 'Kraken',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.krakenAll,
    name: 'kraken',
    displayName: 'Kraken SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'all',
  },
  {
    id: ExchangeEnum.krakenSpot,
    name: 'kraken',
    displayName: 'Kraken SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'spot',
  },
  {
    id: ExchangeEnum.krakenUsdm,
    name: 'kraken',
    displayName: 'Kraken USDⓈ-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: false,
    category: 'futures',
  },

  // Kraken (paper)
  {
    id: ExchangeEnum.paperKraken,
    name: 'kraken',
    displayName: 'Paper Kraken',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
    hideFromProviderList: true,
  },
  {
    id: ExchangeEnum.paperKrakenAll,
    name: 'kraken',
    displayName: 'Paper Kraken SPOT & Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'all',
  },
  {
    id: ExchangeEnum.paperKrakenSpot,
    name: 'kraken',
    displayName: 'Paper Kraken SPOT',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'spot',
  },
  {
    id: ExchangeEnum.paperKrakenUsdm,
    name: 'kraken',
    displayName: 'Paper Kraken USDⓈ-M Futures',
    requiresPassphrase: false,
    supportsKeyTypes: false,
    supportsHostSelection: false,
    supportsPaperTrading: true,
    isPaperExchange: true,
    category: 'futures',
  },
];

// Paper trading top-up assets per exchange brand.
//
// The list a user can fund a paper account with must match the quote
// currencies that exchange actually trades on Gainium — otherwise you
// top up an asset with no tradeable pairs (e.g. Kraken trades USD/EUR,
// not USDT). Each list below is ordered by real pair coverage, so the
// FIRST entry is the sensible default; dead stablecoins (BUSD, TUSD,
// GUSD, PAX, DAI) have been dropped. Counts in the comments are the
// number of spot pairs quoted in that asset (Gainium `getAllPairs`,
// reviewed 2026-06). Keyed by `name` (brand) because every market-type
// variant of a brand shares one list (getPaperTradingAssets).
const USD_BAL = '10000';
export const paperTradingAssets: Record<string, PaperTradingAsset[]> = {
  // USDT 437 · USDC 288 · FDUSD 37 · BTC 54 · ETH 12
  binance: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'FDUSD', name: 'First Digital USD', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
    { symbol: 'ETH', name: 'Ethereum', defaultBalance: '10' },
  ],
  // USDT 433 · USDC 87 · EUR 18 · BTC 7
  bybit: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'EUR', name: 'Euro', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
  ],
  // USDT 300 · USD 289 · EUR 265 · USDC 262
  okx: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'USD', name: 'US Dollar', defaultBalance: USD_BAL },
    { symbol: 'EUR', name: 'Euro', defaultBalance: USD_BAL },
  ],
  // USDT 881 · BTC 64 · USDC 59 · ETH 25
  kucoin: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
    { symbol: 'ETH', name: 'Ethereum', defaultBalance: '10' },
  ],
  // USDT 1096 · USDC 32 · EUR 12
  bitget: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'EUR', name: 'Euro', defaultBalance: USD_BAL },
  ],
  // USDC 408 · USD 404 · EUR 35 · GBP 25 · BTC 24 · USDT 23
  coinbase: [
    { symbol: 'USD', name: 'US Dollar', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'EUR', name: 'Euro', defaultBalance: USD_BAL },
    { symbol: 'GBP', name: 'British Pound', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
  ],
  // USDT 2283 · USDC 76 · BTC 20 · ETH 9
  mexc: [
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
    { symbol: 'ETH', name: 'Ethereum', defaultBalance: '10' },
  ],
  // USDC 290 (Hyperliquid settles everything in USDC)
  hyperliquid: [
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
  ],
  // USD 685 · EUR 584 · USDT 48 · USDC 46 · BTC 32 · GBP 27 · ETH 19
  kraken: [
    { symbol: 'USD', name: 'US Dollar', defaultBalance: USD_BAL },
    { symbol: 'EUR', name: 'Euro', defaultBalance: USD_BAL },
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: USD_BAL },
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: USD_BAL },
    { symbol: 'GBP', name: 'British Pound', defaultBalance: USD_BAL },
    { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '1' },
    { symbol: 'ETH', name: 'Ethereum', defaultBalance: '10' },
  ],
};

// Exchange host options — mirrors main-dash exactly (bybitHostMap /
// okxHostMap in main-dash/types/exchange.types.ts). The label is the
// bare origin URL on purpose: these are API origins, not regions, so we
// do NOT decorate them with country names (e.g. my.okx.com is NOT a
// Malaysia-only host). `value` must stay the legacy enum value — the
// backend maps it to the origin and hasn't changed.
export const exchangeHostOptions: Record<string, ExchangeHostOption[]> = {
  // bybitHostMap order, with `nl` filtered out (legacy filters it too).
  bybit: [
    { value: 'eu', label: 'https://bybit.eu', url: 'https://bybit.eu' },
    { value: 'com', label: 'https://bybit.com', url: 'https://bybit.com' },
    {
      value: 'tr',
      label: 'https://bybit-tr.com',
      url: 'https://bybit-tr.com',
    },
    {
      value: 'kz',
      label: 'https://www.bybit.kz/',
      url: 'https://www.bybit.kz/',
    },
    {
      value: 'ge',
      label: 'https://www.bybitgeorgia.ge/',
      url: 'https://www.bybitgeorgia.ge/',
    },
  ],
  // okxHostMap order: my, app, com.
  okx: [
    { value: 'my', label: 'https://my.okx.com', url: 'https://my.okx.com' },
    { value: 'app', label: 'https://app.okx.com', url: 'https://app.okx.com' },
    { value: 'com', label: 'https://okx.com', url: 'https://okx.com' },
  ],
};

// Coinbase key type options
export const coinbaseKeyTypes = [
  { value: CoinbaseKeysType.legacy, label: 'Legacy Keys' },
  { value: CoinbaseKeysType.cloud, label: 'Cloud Trading Keys' },
];

// OKX source options — mirrors okxHostMap order/labels (bare URLs).
export const okxSourceOptions = [
  { value: OKXSource.my, label: 'https://my.okx.com' },
  { value: OKXSource.app, label: 'https://app.okx.com' },
  { value: OKXSource.com, label: 'https://okx.com' },
];

// Helper functions
export const getExchangeConfig = (
  provider: ExchangeEnum
): ExchangeProviderConfig | undefined => {
  return exchangeProviders.find((config) => config.id === provider);
};

// Default account name to seed the form's "Exchange Name" field when a
// provider is picked. For a `SPOT & Futures` (category 'all') selection
// the backend splits the account into two and appends " (SPOT)" /
// " (FUTURES)" to each, so seeding the decorated displayName would yield
// a confusing "Paper Kraken SPOT & Futures (SPOT)". Strip the
// `SPOT & Futures` decoration so the result reads "Paper Kraken (SPOT)".
// Single-market variants keep their descriptive name (no suffix is added
// by the backend for them).
export const getDefaultAccountName = (
  config: ExchangeProviderConfig
): string => {
  if (config.category === 'all') {
    return config.displayName.replace(/\s*SPOT & Futures\s*$/i, '').trim();
  }
  return config.displayName;
};

export const getExchangesByCategory = (
  category?: 'spot' | 'futures' | 'all'
) => {
  if (!category) return exchangeProviders;
  return exchangeProviders.filter((config) => config.category === category);
};

export const getPaperTradingAssets = (
  exchangeName: string
): PaperTradingAsset[] => {
  return paperTradingAssets[exchangeName] || paperTradingAssets['binance'];
};

// ---------------------------------------------------------------------------
// Independent per-sub-account paper funding ("SPOT & Futures" create)
//
// A paper `all` selection spawns one account per market on the backend. The
// expansion below MUST mirror main-app's addExchange resolver (tradeType=all
// branch) exactly, since each created account is funded independently and the
// frontend renders one funding row per entry. Order is display order
// (SPOT → USDⓈ-M → COIN-M).
// ---------------------------------------------------------------------------
const PAPER_ALL_SUB_ACCOUNTS: Partial<Record<ExchangeEnum, ExchangeEnum[]>> = {
  [ExchangeEnum.paperBinance]: [
    ExchangeEnum.paperBinance,
    ExchangeEnum.paperBinanceUsdm,
    ExchangeEnum.paperBinanceCoinm,
  ],
  [ExchangeEnum.paperBybit]: [
    ExchangeEnum.paperBybit,
    ExchangeEnum.paperBybitUsdm,
    ExchangeEnum.paperBybitCoinm,
  ],
  [ExchangeEnum.paperKucoin]: [
    ExchangeEnum.paperKucoin,
    ExchangeEnum.paperKucoinLinear,
    ExchangeEnum.paperKucoinInverse,
  ],
  [ExchangeEnum.paperOkx]: [
    ExchangeEnum.paperOkx,
    ExchangeEnum.paperOkxLinear,
    ExchangeEnum.paperOkxInverse,
  ],
  [ExchangeEnum.paperBitget]: [
    ExchangeEnum.paperBitget,
    ExchangeEnum.paperBitgetUsdm,
    ExchangeEnum.paperBitgetCoinm,
  ],
  [ExchangeEnum.paperKraken]: [
    ExchangeEnum.paperKraken,
    ExchangeEnum.paperKrakenUsdm,
  ],
  [ExchangeEnum.paperHyperliquid]: [
    ExchangeEnum.paperHyperliquid,
    ExchangeEnum.paperHyperliquidLinear,
  ],
};

const COIN_MARGINED_SUB_ACCOUNTS = new Set<ExchangeEnum>([
  ExchangeEnum.paperBinanceCoinm,
  ExchangeEnum.paperBybitCoinm,
  ExchangeEnum.paperOkxInverse,
  ExchangeEnum.paperKucoinInverse,
  ExchangeEnum.paperBitgetCoinm,
  ExchangeEnum.paperKrakenCoinm,
]);

const LINEAR_SUB_ACCOUNTS = new Set<ExchangeEnum>([
  ExchangeEnum.paperBinanceUsdm,
  ExchangeEnum.paperBybitUsdm,
  ExchangeEnum.paperOkxLinear,
  ExchangeEnum.paperKucoinLinear,
  ExchangeEnum.paperBitgetUsdm,
  ExchangeEnum.paperHyperliquidLinear,
  ExchangeEnum.paperKrakenUsdm,
]);

export type PaperSubAccountMarket = 'spot' | 'linear' | 'inverse';

export const getPaperSubAccountMarket = (
  id: ExchangeEnum
): PaperSubAccountMarket =>
  COIN_MARGINED_SUB_ACCOUNTS.has(id)
    ? 'inverse'
    : LINEAR_SUB_ACCOUNTS.has(id)
      ? 'linear'
      : 'spot';

// Short market label for a sub-account funding row.
export const getPaperSubAccountLabel = (id: ExchangeEnum): string => {
  const market = getPaperSubAccountMarket(id);
  return market === 'inverse'
    ? 'COIN-M Futures'
    : market === 'linear'
      ? 'USDⓈ-M Futures'
      : 'SPOT';
};

// Accounts a paper `all` selection will create. `baseProvider` is the
// backend base id (e.g. paperKraken) — map the `…All` UX id to it first.
// Returns [provider] for anything without an `all` expansion.
export const getPaperAllSubAccounts = (
  baseProvider: ExchangeEnum
): ExchangeEnum[] => PAPER_ALL_SUB_ACCOUNTS[baseProvider] ?? [baseProvider];

// COIN-M (inverse) accounts are coin-margined — funded with the base coin,
// not a stablecoin. Default mirrors the backend's 0.5 BTC seed.
const COIN_MARGIN_ASSETS: PaperTradingAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', defaultBalance: '0.5' },
  { symbol: 'ETH', name: 'Ethereum', defaultBalance: '5' },
];

// USDⓈ-M (linear) margin assets per brand, from real futures-pair coverage:
// most exchanges margin in USDT/USDC; Kraken futures settle in USD;
// Hyperliquid in USDC.
const LINEAR_MARGIN_ASSETS_BY_BRAND: Record<string, PaperTradingAsset[]> = {
  kraken: [{ symbol: 'USD', name: 'US Dollar', defaultBalance: '10000' }],
  hyperliquid: [
    { symbol: 'USDC', name: 'USD Coin', defaultBalance: '10000' },
    { symbol: 'USDT', name: 'Tether USD', defaultBalance: '10000' },
  ],
};
const DEFAULT_LINEAR_MARGIN_ASSETS: PaperTradingAsset[] = [
  { symbol: 'USDT', name: 'Tether USD', defaultBalance: '10000' },
  { symbol: 'USDC', name: 'USD Coin', defaultBalance: '10000' },
];

// Valid top-up assets for one created sub-account, by its market type.
// SPOT reuses the brand's spot list; USDⓈ-M uses the brand's margin stable;
// COIN-M uses coin-margin assets.
export const getSubAccountTopUpAssets = (
  id: ExchangeEnum,
  brand: string
): PaperTradingAsset[] => {
  const market = getPaperSubAccountMarket(id);
  if (market === 'inverse') return COIN_MARGIN_ASSETS;
  if (market === 'linear')
    return LINEAR_MARGIN_ASSETS_BY_BRAND[brand] ?? DEFAULT_LINEAR_MARGIN_ASSETS;
  return getPaperTradingAssets(brand);
};

export const getExchangeHostOptions = (
  exchangeName: string
): ExchangeHostOption[] => {
  return exchangeHostOptions[exchangeName] || [];
};

export const isPaperExchange = (provider: ExchangeEnum): boolean => {
  const config = getExchangeConfig(provider);
  return config?.isPaperExchange || false;
};

export const requiresPassphrase = (provider: ExchangeEnum): boolean => {
  const config = getExchangeConfig(provider);
  return config?.requiresPassphrase || false;
};

export const supportsKeyTypes = (provider: ExchangeEnum): boolean => {
  const config = getExchangeConfig(provider);
  return config?.supportsKeyTypes || false;
};

export const supportsHostSelection = (provider: ExchangeEnum): boolean => {
  const config = getExchangeConfig(provider);
  return config?.supportsHostSelection || false;
};
