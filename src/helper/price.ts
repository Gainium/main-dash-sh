import { useUsdRateStore } from '@/stores/usdRateStore';
import { GraphQLClient } from '../lib/api/GraphQLClient';
import { otherQueries } from '../lib/api/GraphQLQueries-other-queries';
import { logger } from '../lib/loggerInstance';
import { getCachedPrices, saveCachedPrices } from '../lib/priceCache';
import { waitForUsdRateStoreHydration } from '../lib/storeUtils';
import {
  ExchangeEnum,
  StatusEnum,
  type GetLatestPricesResult,
  type Prices,
} from '../types';

// Generate random ID utility function
function generateId(length: number): string {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Get exchanges that have active trades (this will be populated dynamically)
let activeExchanges: Set<ExchangeEnum> = new Set();

// Function to set active exchanges based on current trades
export const setActiveExchanges = (exchanges: string[]) => {
  activeExchanges = new Set(exchanges.map((ex) => ex as ExchangeEnum));
  logger.debug('[Price] Active exchanges set:', Array.from(activeExchanges));
};

// Get exchanges to fetch prices from (only active exchanges + essential ones)
const getExchangesToFetch = (loadUs: boolean) => {
  const essential = [
    ExchangeEnum.binance,
    ExchangeEnum.binanceCoinm,
    ExchangeEnum.binanceUsdm,
    ExchangeEnum.kucoin,
    ExchangeEnum.kucoinInverse,
    ExchangeEnum.kucoinLinear,
    ExchangeEnum.bybit,
    ExchangeEnum.bybitUsdm,
    ExchangeEnum.bybitCoinm,
    ExchangeEnum.okx,
    ExchangeEnum.okxInverse,
    ExchangeEnum.okxLinear,
    ExchangeEnum.bitget,
    ExchangeEnum.bitgetUsdm,
    ExchangeEnum.bitgetCoinm,
    ExchangeEnum.coinbase,
    ExchangeEnum.hyperliquid,
    ExchangeEnum.hyperliquidLinear,
    // Kraken (incl. tokenized-stock "xStocks") was missing here, and the
    // dynamic activeExchanges effect (useDcaDeals) is commented out — so the
    // dashboard never fetched Kraken prices, leaving every Kraken deal's
    // unrealized P&L stuck on "Price unavailable".
    ExchangeEnum.kraken,
    ExchangeEnum.krakenUsdm,
  ];

  // Combine essential exchanges with active exchanges
  const exchangesToFetch = new Set([
    ...essential,
    ...Array.from(activeExchanges),
  ]);

  // Apply existing filters - only exclude binanceUS if not requested
  const filtered = Array.from(exchangesToFetch).filter((v) =>
    loadUs ? true : v !== ExchangeEnum.binanceUS
  );

  logger.debug('[Price] Exchanges to fetch:', filtered);
  return filtered;
};

let pricesStorage: Prices = [];
let lastUpdate = 0;
let usdRate = 1;
let usdRateRequested = false;
const interval = 60 * 1000; // 60 seconds

type CBType = {
  fn: (data: GetLatestPricesResult) => void;
  id: string;
  once?: boolean;
};

let cbs: CBType[] = [];

const handleResult = (data: GetLatestPricesResult) => {
  for (const cb of cbs) {
    cb.fn(data);
  }
  cbs = cbs.filter((cb) => !cb.once);
};

const requestPrices = async (exchange: ExchangeEnum) => {
  const baseUrl = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000';
  // Use REST API endpoint as described in the guide
  const url = `${baseUrl}/tickers?exchange=${exchange}`;

  try {
    logger.debug(`[Price] Fetching prices for ${exchange} from:`, url);
    logger.debug(`[Price] API endpoint:`, import.meta.env.VITE_API_ENDPOINT);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.json();
    logger.debug(`[Price] API response for ${exchange}:`, {
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      url: url,
    });

    if (response.ok) {
      // Handle the response structure from REST API
      // Expected format: { status: "OK", data: Array<{ pair: string, price: number }> }
      if (responseData.status === 'OK' && Array.isArray(responseData.data)) {
        return {
          status: StatusEnum.ok,
          data: responseData.data,
          reason: null,
        };
      }

      // Handle direct array response (fallback)
      if (Array.isArray(responseData)) {
        return {
          status: StatusEnum.ok,
          data: responseData,
          reason: null,
        };
      }

      // Handle error response
      if (responseData.status === 'NOTOK') {
        return {
          status: StatusEnum.notok,
          data: null,
          reason: responseData.reason || 'Unknown error',
        };
      }
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  } catch (error) {
    logger.error(`[Price] Error fetching prices for ${exchange}:`, error);
    return {
      status: StatusEnum.notok,
      data: null,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

let inWork = false;

export async function getPrices(
  loadUs: boolean,
  returnPrice: false
): Promise<void>;
export async function getPrices(
  loadUs: boolean,
  returnPrice: true
): Promise<Prices>;
export async function getPrices(loadUs: boolean, returnPrice: boolean) {
  if (import.meta.env.DEV) {
    logger.debug('[Price] getPrices called', {
      loadUs,
      returnPrice,
      pricesStorageLength: pricesStorage.length,
      lastUpdate,
      timeSinceLastUpdate: new Date().getTime() - lastUpdate,
      interval,
      inWork,
    });
  }

  if (
    pricesStorage.length > 0 &&
    new Date().getTime() - lastUpdate < interval
  ) {
    if (import.meta.env.DEV) {
      logger.debug('[Price] Using existing cache');
    }
    return returnPrice ? pricesStorage : undefined;
  }
  if (inWork) {
    if (import.meta.env.DEV) {
      logger.debug('[Price] Already in work, returning existing cache');
    }
    return returnPrice ? pricesStorage : undefined;
  }
  inWork = true;
  try {
    if (import.meta.env.DEV) {
      logger.debug('[Price] Starting price fetch process');
    }
    const latestPricesUpdate: Prices = [];
    if (!usdRateRequested) {
      try {
        // Wait for USD rate store to hydrate from IndexedDB before accessing
        const storeRate = await waitForUsdRateStoreHydration(useUsdRateStore);

        if (storeRate && storeRate > 0) {
          usdRate = storeRate;
          usdRateRequested = true;
          if (import.meta.env.DEV) {
            logger.debug(
              '[Price] USD rate loaded from hydrated store:',
              usdRate
            );
          }
        }
      } catch (error) {
        logger.warn(
          '[Price] Failed to wait for USD rate store hydration:',
          error
        );
      }
    }
    // Get USD rate if not already requested
    if (!usdRateRequested) {
      try {
        const graphQLClient = new GraphQLClient(
          import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000'
        );
        const usdRateRequest = await graphQLClient.request<{
          getUsdRate: {
            status: string;
            reason: string | null;
            data: number;
          };
        }>(otherQueries.getUsdRate().query);

        if (usdRateRequest.getUsdRate.status === 'OK') {
          usdRateRequested = true;
          usdRate = usdRateRequest.getUsdRate.data;
          useUsdRateStore.getState().setRate(usdRate);
          if (import.meta.env.DEV) {
            logger.debug('[Price] USD rate fetched:', usdRate);
          }
        }
      } catch (error) {
        logger.warn('[Price] Failed to fetch USD rate:', error);
        // Use default rate of 1 for USD
        usdRate = 1;
      }
    }

    // Add USD rate to prices
    latestPricesUpdate.push({
      symbol: 'USDTZUSD',
      price: usdRate,
      exchange: 'all',
    });

    // Fetch prices from all exchanges
    const exchangesToFetch = getExchangesToFetch(loadUs);

    if (import.meta.env.DEV) {
      logger.debug('[Price] Fetching prices from exchanges:', exchangesToFetch);
    }

    await Promise.all(
      exchangesToFetch.map((exchange) =>
        requestPrices(exchange)
          .then((res) => {
            if (res.status === StatusEnum.ok && res.data) {
              res.data.forEach(
                (d: { pair: string; price: number | string }) => {
                  // Handle the AllPricesResponse structure: { pair: string, price: number }
                  const data = {
                    symbol: d.pair,
                    price:
                      typeof d.price === 'number'
                        ? d.price
                        : parseFloat(d.price),
                  };

                  if (data.price && !isNaN(data.price)) {
                    latestPricesUpdate.push({
                      ...data,
                      exchange: exchange as ExchangeEnum,
                    });

                    // Add paper exchange version
                    if (exchange !== ExchangeEnum.binanceUS) {
                      latestPricesUpdate.push({
                        ...data,
                        exchange: `paper${exchange
                          .at(0)
                          ?.toUpperCase()}${exchange.slice(
                          1,
                          exchange.length
                        )}` as ExchangeEnum,
                      });
                    }

                    // Special handling for OKX inverse
                    if (exchange === ExchangeEnum.okxInverse) {
                      latestPricesUpdate.push({
                        ...data,
                        exchange: ExchangeEnum.okxLinear,
                      });
                      latestPricesUpdate.push({
                        ...data,
                        exchange: ExchangeEnum.paperOkxLinear,
                      });
                    }
                  }
                }
              );
            } else {
              if (import.meta.env.DEV) {
                logger.warn(
                  `[Price] Failed to fetch prices from ${exchange}:`,
                  res.reason
                );
              }
            }
          })
          .catch((error) => {
            if (import.meta.env.DEV) {
              logger.error(
                `[Price] Error fetching prices from ${exchange}:`,
                error
              );
            }
          })
      )
    );

    if (import.meta.env.DEV) {
      logger.debug('[Price] Total prices fetched:', latestPricesUpdate.length);
      logger.debug(
        '[Price] Unique symbols:',
        [...new Set(latestPricesUpdate.map((p) => p.symbol))].length
      );
    }

    pricesStorage = [...latestPricesUpdate];
    lastUpdate = new Date().getTime();
    inWork = false;

    const result: GetLatestPricesResult = {
      status: StatusEnum.ok,
      data: latestPricesUpdate,
      reason: null,
    };

    // Save to cache for next page load
    saveCachedPrices(result).catch((error) => {
      logger.warn('[Price] Failed to save prices to cache:', error);
    });

    if (returnPrice) {
      return pricesStorage;
    }

    return handleResult(result);
  } catch (error) {
    inWork = false;
    logger.error('Error fetching prices:', error);

    // Send error result to callbacks
    handleResult({
      status: StatusEnum.notok,
      data: null,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });

    if (returnPrice) {
      return pricesStorage;
    }
  }
}

let timer: NodeJS.Timeout | null = null;

const setTimer = (loadUs: boolean) => {
  timer = setInterval(() => getPrices(loadUs, false), interval);
};

const unsubscribePrices = (idCB: string) => {
  cbs = cbs.filter((cb) => cb.id !== idCB);
  if (cbs.length === 0) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
};

/**
 * Get latest prices
 *
 * First returns cached prices immediately if available (even from previous session),
 * then fetches updated prices in background and publishes to listeners.
 *
 * @param {(data: GetLatestPricesResult) => void} cb Callback to process result
 * @param {boolean} loadUs Whether to load Binance US exchange
 */
const getLatestPrices = (
  cb: (data: GetLatestPricesResult) => void,
  loadUs: boolean
) => {
  const idCB = generateId(20);

  // First, try to return cached prices immediately
  const returnCachedPrices = async () => {
    try {
      const cached = await getCachedPrices();
      if (cached && cached.status === StatusEnum.ok && cached.data) {
        if (import.meta.env.DEV) {
          logger.debug('[Price] Returning cached prices from IndexedDB', {
            count: cached.data.length,
          });
        }
        cb(cached);
      }
    } catch (error) {
      logger.warn('[Price] Failed to load cached prices:', error);
    }
  };

  // Return cached prices immediately on first call
  returnCachedPrices();

  // Check if we have fresh prices in memory
  if (
    pricesStorage.length > 0 &&
    new Date().getTime() - lastUpdate < interval
  ) {
    if (import.meta.env.DEV) {
      logger.debug('[Price] Using fresh in-memory prices');
    }
    cb({
      status: StatusEnum.ok,
      data: pricesStorage,
      reason: null,
    });
  }

  // Register callback for background updates
  cbs.push({
    fn: cb,
    id: idCB,
    once: false,
  });

  // Start fetching if not already in progress
  if (!timer) {
    if (import.meta.env.DEV) {
      logger.debug('[Price] Starting price fetching timer');
    }
    getPrices(loadUs, false);
    setTimer(loadUs);
  }

  return () => unsubscribePrices(idCB);
};

/**
 * Get specific price
 */
export const getSymbolPrice = async (
  symbol: string,
  exchange: ExchangeEnum
) => {
  if (pricesStorage.length > 0) {
    return pricesStorage.find(
      (p) => p.symbol === symbol && p.exchange === exchange
    );
  }
  const prices = await getPrices(exchange === ExchangeEnum.binanceUS, true);
  return prices?.find((p) => p.symbol === symbol);
};

/**
 * Get locally cached prices (synchronous)
 */
export const getLocalPrices = () => pricesStorage;

export default getLatestPrices;
