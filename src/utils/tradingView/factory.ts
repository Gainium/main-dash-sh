import { ExchangeEnum } from '@/types';
import { COMMON_QUOTE_ASSETS, extractPairAssets } from '@/utils/pairs';
import logger from '../../lib/loggerInstance';
import { binanceHandler } from './exchanges/binance';
import { bitgetHandler } from './exchanges/bitget';
import { bybitHandler } from './exchanges/bybit';
import { coinbaseHandler } from './exchanges/coinbase';
import { krakenHandler } from './exchanges/kraken';
import { kucoinHandler } from './exchanges/kucoin';
import { okxHandler } from './exchanges/okx';
import { getCandles } from './historyApi';
import {
  type DatafeedConfiguration,
  type ErrorCallback,
  type ExchangeHandler,
  type HistoryCallback,
  type IBasicDataFeed,
  type LibrarySymbolInfo,
  type PeriodParams,
  type ResolutionString,
  type ResolveCallback,
  type SearchSymbolsCallback,
  type SubscribeBarsCallback,
  type Symbol,
} from './types';

// Exchange handlers registry
const exchangeHandlers: Record<string, ExchangeHandler> = {
  // Binance - all market types use the same handler with config-driven URLs
  binance: binanceHandler,
  paperbinance: binanceHandler,
  binanceus: binanceHandler,
  binancecoinm: binanceHandler,
  binanceusdm: binanceHandler,
  paperbinancecoinm: binanceHandler,
  paperbinanceusdm: binanceHandler,
  binanceall: binanceHandler,
  binancespot: binanceHandler,
  paperbinanceall: binanceHandler,
  paperbinancespot: binanceHandler,

  // Bybit - all market types use the same handler with config-driven URLs
  bybit: bybitHandler,
  paperbybit: bybitHandler,
  bybitcoinm: bybitHandler,
  bybitusdm: bybitHandler,
  bybitinverse: bybitHandler,
  bybitlinear: bybitHandler,
  paperbybitcoinm: bybitHandler,
  paperbybitusdm: bybitHandler,
  paperbybitinverse: bybitHandler,
  paperbybitlinear: bybitHandler,
  bybitall: bybitHandler,
  bybitspot: bybitHandler,
  paperbybitall: bybitHandler,
  paperbybitspot: bybitHandler,

  // OKX - all market types use the same handler with config-driven URLs
  okx: okxHandler,
  paperokx: okxHandler,
  okxlinear: okxHandler,
  okxinverse: okxHandler,
  paperokxlinear: okxHandler,
  paperokxinverse: okxHandler,
  okxall: okxHandler,
  okxspot: okxHandler,
  paperokxall: okxHandler,
  paperokxspot: okxHandler,

  // Bitget - all market types use the same handler with config-driven URLs
  bitget: bitgetHandler,
  paperbitget: bitgetHandler,
  bitgetusdm: bitgetHandler,
  bitgetcoinm: bitgetHandler,
  paperbitgetusdm: bitgetHandler,
  paperbitgetcoinm: bitgetHandler,
  bitgetall: bitgetHandler,
  bitgetspot: bitgetHandler,
  paperbitgetall: bitgetHandler,
  paperbitgetspot: bitgetHandler,

  // Coinbase
  coinbase: coinbaseHandler,
  papercoinbase: coinbaseHandler,

  // KuCoin
  kucoin: kucoinHandler,
  paperkucoin: kucoinHandler,
  kucoininverse: kucoinHandler,
  kucoinlinear: kucoinHandler,
  paperkucoininverse: kucoinHandler,
  paperkucoinlinear: kucoinHandler,
  kucoinall: kucoinHandler,
  paperkucoinall: kucoinHandler,
  kucoinspot: kucoinHandler,
  paperkucoinspot: kucoinHandler,

  // Kraken — spot variants share the handler; futures (usdm) takes the
  // futures branch in `kraken.ts` based on the exchange enum string.
  kraken: krakenHandler,
  krakenall: krakenHandler,
  krakenspot: krakenHandler,
  krakenusdm: krakenHandler,
  paperkraken: krakenHandler,
  paperkrakenall: krakenHandler,
  paperkrakenspot: krakenHandler,
  paperkrakenusdm: krakenHandler,
};

interface ParsedSymbolName {
  basePair: string;
  metaSegments: string[];
  exchangePart: string;
}

const parseSymbolName = (symbolName: string): ParsedSymbolName => {
  const [pairPartRaw, exchangePartRaw = ''] = symbolName.split('@');
  const pairSegments = pairPartRaw.split('~').filter(Boolean);
  if (!pairSegments.length) {
    return {
      basePair: pairPartRaw,
      metaSegments: [],
      exchangePart: exchangePartRaw,
    };
  }
  const [basePair, ...metaSegments] = pairSegments;
  return {
    basePair,
    metaSegments,
    exchangePart: exchangePartRaw,
  };
};

// Get exchange handler by exchange enum
export const getExchangeHandler = async (
  exchange: string
): Promise<ExchangeHandler> => {
  const normalizedExchange = exchange.toLowerCase();
  return exchangeHandlers[normalizedExchange] || binanceHandler; // Default to Binance
};

// Get display name for exchange (handle paper trading naming)
const getExchangeDisplayName = (exchange: ExchangeEnum): string => {
  const exchangeString = exchange.toString();

  if (exchangeString.startsWith('paper')) {
    const baseExchange = exchangeString.replace('paper', '');
    return `Paper ${baseExchange.charAt(0).toUpperCase() + baseExchange.slice(1)}`;
  }

  return exchange.charAt(0).toUpperCase() + exchange.slice(1);
};

// Map string to exchange enum
export const mapStringToExchange = (
  exchangeString: string
): ExchangeEnum | null => {
  const normalized = exchangeString.toLowerCase();

  // Check if it's a valid exchange enum value
  for (const [key, value] of Object.entries(ExchangeEnum)) {
    if (
      value.toLowerCase() === normalized ||
      key.toLowerCase() === normalized
    ) {
      return value as ExchangeEnum;
    }
  }

  return null;
};

// Global state
let availableSymbols: Symbol[] = [];
let currentSymbol: Symbol | undefined;

// In-flight candle-load cancellation. TradingView keeps the chart on the
// current symbol until its pending getBars settles, so a hung request (e.g.
// Hyperliquid, whose candle endpoint can hang for the full 30s timeout on
// some pairs) freezes the chart even after the user picks another exchange.
// When a getBars arrives for a different symbol we abort the previous load so
// it settles immediately and the newly-selected chart can render.
let activeFetchKey: string | null = null;
let activeFetchController: AbortController | null = null;

// Collapse TradingView's own symbol normalization (case, and `:` ↔ `_` for
// HIP-3 builder-perp tickers) so re-resolving the SAME selection doesn't look
// like a change and abort a legitimate in-flight load.
const fetchKeyForSymbol = (symbolInfo: LibrarySymbolInfo): string =>
  `${symbolInfo.name}@${symbolInfo.exchange}`.replace(/:/g, '_').toLowerCase();

// Proactively abort any in-flight shared-datafeed candle load. Called when the
// chart symbol changes at the React level (exchange/pair switch) so a hung
// request — notably Hyperliquid, whose candle endpoint can hang for the full
// 30s timeout — doesn't keep the chart frozen on the old symbol. TradingView
// won't issue getBars for the newly-selected symbol until the pending one
// settles, so the abort-on-next-getBars guard in getBars() can never fire on
// its own; the React layer has to kick the abort here.
export const abortActiveCandleFetch = (): void => {
  if (activeFetchController && !activeFetchController.signal.aborted) {
    activeFetchController.abort();
  }
  activeFetchKey = null;
};

// Export functions to set up the datafeed
export const setAvailableSymbols = (symbols: Symbol[]): void => {
  availableSymbols = symbols;
};

export const setCurrentSymbol = (symbol: Symbol): void => {
  currentSymbol = symbol;
};

// Create datafeed factory
export const createDatafeed = (): IBasicDataFeed => ({
  onReady: (callback) => {
    // Get all unique exchanges from available symbols
    const uniqueExchanges = Array.from(
      new Set(availableSymbols.map((s) => s.exchange))
    );

    const exchanges = uniqueExchanges.map((exchange) => ({
      value: exchange.toUpperCase(),
      name: getExchangeDisplayName(exchange),
      desc: `${getExchangeDisplayName(exchange)} Exchange`,
    }));

    // Get all supported resolutions from all exchanges
    const allResolutions = new Set<string>();
    Object.values(exchangeHandlers).forEach((handler) => {
      handler.config.supportedResolutions.forEach((res) =>
        allResolutions.add(res)
      );
    });

    const config: DatafeedConfiguration = {
      exchanges,
      symbols_types: [
        {
          name: 'Cryptocurrency',
          value: 'crypto',
        },
      ],
      supported_resolutions: Array.from(allResolutions),
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    };

    setTimeout(() => callback(config), 0);
  },

  searchSymbols: (
    userInput: string,
    exchange: string,
    _symbolType: string,
    onResult: SearchSymbolsCallback
  ) => {
    // If no user input, show predefined symbols for better UX
    if (!userInput || userInput.length < 2) {
      const filteredSymbols = availableSymbols.filter(
        (symbol) =>
          !exchange || symbol.exchange.toUpperCase() === exchange.toUpperCase()
      );

      const searchResults = filteredSymbols.map((symbol) => ({
        symbol: `${symbol.pair}@${symbol.exchange.toUpperCase()}`,
        full_name: symbol.pair,
        description: `${symbol.baseAsset.name} / ${symbol.quoteAsset.name}`,
        exchange: symbol.exchange.toUpperCase(),
        ticker: `${symbol.pair}@${symbol.exchange.toUpperCase()}`,
        type: 'crypto' as const,
      }));

      return onResult(searchResults);
    }

    // For user input, search in predefined symbols first
    const predefinedResults = availableSymbols
      .filter((symbol) => {
        const matchesInput =
          symbol.pair.toLowerCase().includes(userInput.toLowerCase()) ||
          userInput.toLowerCase().includes(symbol.pair.toLowerCase()) ||
          symbol.baseAsset.name
            .toLowerCase()
            .includes(userInput.toLowerCase()) ||
          symbol.quoteAsset.name
            .toLowerCase()
            .includes(userInput.toLowerCase());

        const matchesExchange =
          !exchange || symbol.exchange.toUpperCase() === exchange.toUpperCase();

        return matchesInput && matchesExchange;
      })
      .map((symbol) => ({
        symbol: `${symbol.pair}@${symbol.exchange.toUpperCase()}`,
        full_name: symbol.pair,
        description: `${symbol.baseAsset.name} / ${symbol.quoteAsset.name}`,
        exchange: symbol.exchange.toUpperCase(),
        ticker: `${symbol.pair}@${symbol.exchange.toUpperCase()}`,
        type: 'crypto' as const,
      }));

    // Generate additional search results for common symbol patterns
    const dynamicResults: Array<{
      symbol: string;
      full_name: string;
      description: string;
      exchange: string;
      ticker: string;
      type: 'crypto';
    }> = [];
    const input = userInput.toUpperCase();

    // Common quote assets
    const commonQuotes = COMMON_QUOTE_ASSETS;
    // Common exchanges for dynamic symbols
    const targetExchanges = exchange
      ? [exchange.toLowerCase()]
      : [
          ExchangeEnum.binance,
          ExchangeEnum.bybit,
          ExchangeEnum.okx,
          ExchangeEnum.coinbase,
        ];

    // If input looks like a symbol pair (contains common patterns)
    if (
      input.length >= 3 &&
      !predefinedResults.some((r) => r.symbol.includes(input))
    ) {
      // Try to match as direct symbol
      targetExchanges.forEach((targetExchange) => {
        const normalizedExchange =
          typeof targetExchange === 'string'
            ? targetExchange.toLowerCase()
            : targetExchange;

        // Direct match
        dynamicResults.push({
          symbol: `${input}@${normalizedExchange.toUpperCase()}`,
          full_name: input,
          description: `${input} Trading Pair`,
          exchange: normalizedExchange.toUpperCase(),
          ticker: `${input}@${normalizedExchange.toUpperCase()}`,
          type: 'crypto' as const,
        });

        // Try common quote asset combinations if input doesn't end with known quote
        if (!commonQuotes.some((quote) => input.endsWith(quote))) {
          ['USDT', 'USDC', 'USD'].forEach((quote) => {
            const pair = `${input}${quote}`;
            dynamicResults.push({
              symbol: `${pair}@${normalizedExchange.toUpperCase()}`,
              full_name: pair,
              description: `${input} / ${quote}`,
              exchange: normalizedExchange.toUpperCase(),
              ticker: `${pair}@${normalizedExchange.toUpperCase()}`,
              type: 'crypto' as const,
            });
          });
        }

        // Try as base asset with common quotes
        commonQuotes.forEach((quote) => {
          const pair = `${input}${quote}`;
          if (pair !== input) {
            // Avoid duplicates
            dynamicResults.push({
              symbol: `${pair}@${normalizedExchange.toUpperCase()}`,
              full_name: pair,
              description: `${input} / ${quote}`,
              exchange: normalizedExchange.toUpperCase(),
              ticker: `${pair}@${normalizedExchange.toUpperCase()}`,
              type: 'crypto' as const,
            });
          }
        });
      });
    }

    // Combine results, prioritizing predefined symbols
    const allResults = [...predefinedResults, ...dynamicResults];

    // Remove duplicates and limit results
    const uniqueResults = allResults
      .filter(
        (result, index, array) =>
          array.findIndex((r) => r.symbol === result.symbol) === index
      )
      .slice(0, 50); // Limit to 50 results to avoid overwhelming the UI

    onResult(uniqueResults);
  },

  resolveSymbol: (
    symbolName: string,
    onResolve: ResolveCallback,
    onError?: ErrorCallback
  ) => {
    const parsed = parseSymbolName(symbolName);
    const symbolPair = parsed.basePair;
    const exchangeString = parsed.exchangePart?.toLowerCase() || '';

    const exchange = mapStringToExchange(exchangeString);
    let symbol: Symbol | undefined;

    // Look up by exact pair first; for HIP-3 builder-perp tickers the
    // pair held in `availableSymbols` keeps the `:` form (`flx:CRCL-USDH`)
    // but TV may re-ask us with a sanitized form (`flx_CRCL-USDH`) after
    // parsing the colon as its exchange separator. Match both shapes
    // and also do a case-insensitive fallback for TV's uppercase
    // normalization of the pair prefix.
    const pairMatches = (candidate: string): boolean => {
      if (candidate === symbolPair) return true;
      const normalizedCandidate = candidate.replace(/:/g, '_').toLowerCase();
      const normalizedRequested = symbolPair.replace(/:/g, '_').toLowerCase();
      return normalizedCandidate === normalizedRequested;
    };

    if (exchange) {
      symbol = availableSymbols.find(
        (s) => pairMatches(s.pair) && s.exchange === exchange
      );
    }

    if (!symbol) {
      symbol =
        availableSymbols.find((s) => pairMatches(s.pair)) || currentSymbol;
    }

    // If still no symbol found, create a dynamic one
    if (!symbol) {
      // Parse symbol pair to extract base and quote assets
      const parseSymbolPair = (pair: string) => {
        const { baseAsset, quoteAsset } = extractPairAssets(pair);
        if (baseAsset && quoteAsset) {
          return { base: baseAsset, quote: quoteAsset };
        }

        // Fallback: assume last 3-4 characters are quote
        if (pair.length >= 6) {
          const quote = pair.slice(-4); // Try 4 characters first
          const base = pair.slice(0, -4);
          if (['USDT', 'USDC'].includes(quote)) {
            return { base, quote };
          }

          // Try 3 characters
          const quote3 = pair.slice(-3);
          const base3 = pair.slice(0, -3);
          if (['USD', 'BTC', 'ETH', 'BNB', 'EUR'].includes(quote3)) {
            return { base: base3, quote: quote3 };
          }
        }

        // Default fallback
        return { base: pair, quote: 'USDT' };
      };

      // Recovery heuristic for stale TradingView saved-layout tickers:
      // if the requested symbolPair looks like a sanitized HIP-3
      // builder-perp identifier — uppercase prefix followed by `_` and
      // then a base — restore the `:` and re-extract assets. Without
      // this, TV reconnecting from a previously-saved sanitized ticker
      // (e.g. `FLX_GAS-USDH`) would lock that form into `symbolInfo.name`
      // and the candles URL would never match the real HIP-3 pair.
      const recoveredPair = /^[A-Z]+_[A-Z]/u.test(symbolPair)
        ? symbolPair.replace('_', ':')
        : symbolPair;
      const { base, quote } = parseSymbolPair(recoveredPair);
      const targetExchange = exchange || ExchangeEnum.binance;

      // Create a dynamic symbol
      symbol = {
        symbol: recoveredPair,
        pair: recoveredPair,
        exchange: targetExchange,
        baseAsset: {
          name: base,
          minAmount: 0,
          maxAmount: 1000000,
          step: 0.00001,
        },
        quoteAsset: {
          name: quote,
          minAmount: 0,
        },
        maxOrders: 100,
        priceAssetPrecision: quote === 'USD' || quote === 'EUR' ? 2 : 8,
      };

      logger.info('Created dynamic symbol:', symbol);
    }

    if (!symbol) {
      const errorMsg = `Symbol not found: ${symbolName}`;
      console.error(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
      return;
    }

    // Get exchange handler to get supported resolutions
    getExchangeHandler(symbol.exchange)
      .then((handler) => {
        // Use dynamic price scale based on typical price ranges for the symbol
        // This allows TradingView to use appropriate decimal places automatically
        const getDynamicPriceScale = (quoteAsset: string, symbol: string) => {
          // For fiat currencies, use minimal decimal places for high-value pairs
          if (['USD', 'EUR', 'GBP', 'JPY'].includes(quoteAsset)) {
            // For high-value pairs like BTC, use 1 decimal place
            if (symbol.startsWith('BTC') || symbol.includes('BTC')) {
              return 10; // 1 decimal place
            }
            return 100; // 2 decimal places for other fiat pairs
          }

          // For USDT/USDC stablecoins, adjust based on typical price ranges
          if (['USDT', 'USDC', 'BUSD', 'DAI'].includes(quoteAsset)) {
            // For high-value pairs like BTC, use 1 decimal place
            if (symbol.startsWith('BTC') || symbol.includes('BTC')) {
              return 10; // 1 decimal place for prices like 45234.5
            }
            // For medium-value pairs like ETH, use 2 decimal places
            if (symbol.startsWith('ETH') || symbol.includes('ETH')) {
              return 100; // 2 decimal places for prices like 2345.67
            }
            // For low-value altcoins, use more decimals but not excessive
            return 100000000; // 8 decimal places (formatter will handle the display)
          }

          // For BTC pairs, use 8 decimal places
          if (quoteAsset === 'BTC') {
            return 100000000; // 8 decimal places
          }

          // Default for other cases
          return 10000; // 4 decimal places
        };
        const symbolInfo: LibrarySymbolInfo = {
          ticker: parsed.metaSegments.length
            ? symbolName
            : `${symbol.pair}@${symbol.exchange.toUpperCase()}`,
          name: symbol.pair,
          full_name: symbol.pair,
          description: `${symbol.baseAsset.name} / ${symbol.quoteAsset.name}`,
          exchange: symbol.exchange.toUpperCase(),
          listed_exchange: symbol.exchange.toUpperCase(),
          type: 'crypto',
          currency_code: symbol.quoteAsset.name,
          session: '24x7',
          timezone: 'UTC',
          minmov: 1,
          pricescale: getDynamicPriceScale(symbol.quoteAsset.name, symbol.pair),
          supported_resolutions: handler.config.supportedResolutions,
          has_intraday: true,
          has_daily: true,
          has_weekly_and_monthly: true,
          data_status: 'streaming',
          format: 'price',
        };

        setTimeout(() => onResolve(symbolInfo), 0);
      })
      .catch((error) => {
        console.error('Error getting exchange handler:', error);
        if (onError) {
          onError('Failed to resolve symbol');
        }
      });
  },

  getBars: async (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: ErrorCallback
  ) => {
    try {
      logger.info('[ScrollLoadBars] getBars called', {
        symbol: symbolInfo.name,
        exchange: symbolInfo.exchange,
        resolution,
        from: new Date(periodParams.from * 1000).toISOString(),
        to: new Date(periodParams.to * 1000).toISOString(),
        countBack: periodParams.countBack,
        firstDataRequest: periodParams.firstDataRequest,
      });

      if (periodParams.to < 0) {
        return onResult([], { noData: true });
      }

      const exchange = mapStringToExchange(symbolInfo.exchange);
      if (!exchange) {
        onError('Invalid exchange');
        return;
      }

      // Cancel any in-flight load for a different symbol/exchange. Requests
      // for the SAME selection (initial load + scroll-back history) share the
      // controller and don't abort each other.
      const fetchKey = fetchKeyForSymbol(symbolInfo);
      if (activeFetchKey !== null && activeFetchKey !== fetchKey) {
        activeFetchController?.abort();
      }
      if (
        !activeFetchController ||
        activeFetchController.signal.aborted ||
        activeFetchKey !== fetchKey
      ) {
        activeFetchController = new AbortController();
      }
      activeFetchKey = fetchKey;
      const signal = activeFetchController.signal;

      const handler = await getExchangeHandler(exchange);
      const bars = await getCandles(
        symbolInfo,
        resolution,
        periodParams,
        handler,
        signal
      );

      // Selection changed while we were loading — drop this stale result so
      // TradingView doesn't cache a no-data/partial response for the old
      // symbol (it already discarded this request's callback on the switch).
      if (signal.aborted) {
        onError('aborted');
        return;
      }

      logger.info('[ScrollLoadBars] getBars result (Exchange)', {
        barsCount: bars.length,
        noData: bars.length === 0,
        oldestBar:
          bars.length > 0 ? new Date(bars[0].time).toISOString() : null,
        newestBar:
          bars.length > 0
            ? new Date(bars[bars.length - 1].time).toISOString()
            : null,
      });

      console.warn('[DEBUG_GETBARS] getBars result', JSON.stringify({
        barsCount: bars.length,
        noData: bars.length === 0,
        oldestBar: bars.length > 0 ? new Date(bars[0].time).toISOString() : null,
        newestBar: bars.length > 0 ? new Date(bars[bars.length - 1].time).toISOString() : null,
      }));
      onResult(bars, { noData: bars.length === 0 });
    } catch (error) {
      console.error('Error in getBars:', error);
      onError('Failed to fetch bars');
    }
  },

  subscribeBars: async (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
    //onResetCacheNeededCallback: () => void
  ) => {
    try {
      const exchange = mapStringToExchange(symbolInfo.exchange);
      if (!exchange) {
        console.error(
          'Invalid exchange for subscription:',
          symbolInfo.exchange
        );
        return;
      }

      // Register the reset callback for this symbol+resolution
      /* const { registerResetCallback } = await import('./historyApi');
      registerResetCallback(
        symbolInfo.name,
        resolution,
        onResetCacheNeededCallback
      ); */

      const handler = await getExchangeHandler(exchange);
      await handler.subscribe(symbolInfo, resolution, onTick, listenerGuid);
    } catch (error) {
      console.error('Error in subscribeBars:', error);
    }
  },

  unsubscribeBars: async (listenerGuid: string) => {
    // Try to unsubscribe from all possible exchanges
    // This is safer than trying to determine which exchange was used
    Object.values(exchangeHandlers).forEach((handler) => {
      try {
        handler.unsubscribe(listenerGuid);
      } catch (_error) {
        // Ignore errors - the subscription might not exist on this exchange
      }
    });

    // Note: We can't easily determine which symbol/resolution to unregister
    // without tracking the listenerGuid -> symbol/resolution mapping.
    // For now, callbacks will remain registered but this is harmless as they
    // will just be no-ops if the chart is unmounted.
  },
});
