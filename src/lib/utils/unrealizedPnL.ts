import {
  DCADealStatusEnum,
  ExchangeEnum,
  StrategyEnum,
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
const matchesPair =
  (base: string, quote: string) =>
  (p: PriceData): boolean => {
    if (!p || !p.symbol) return false;
    const sym = p.symbol.split('_')[0];
    return (
      sym === `${base}${quote}` ||
      sym === `${base}-${quote}` ||
      sym === `${base}/${quote}` ||
      sym === `${base}Z${quote}`
    );
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
): number | null => {
  const match = prices.find(matchesPair(fromAsset, toAsset));
  if (match && match.price > 0) {
    return reverse ? 1 / match.price : match.price;
  }
  if (!reverse) {
    return findRate(toAsset, fromAsset, prices, true);
  }
  return null;
};

/**
 * Calculate USD rate for a given asset
 */
export const findUSDRate = (
  asset: string,
  _prices: PriceData[],
  exchange?: ExchangeEnum | 'all'
): number => {
  const prices = _prices.filter((p) =>
    exchange ? [exchange, 'all'].includes(p.exchange ?? '') : true
  );
  asset = asset
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
    const findUsdtRate =
      findRate(asset, 'USDT', prices) || findRate(asset, 'USDC', prices);
    if (findUsdtRate) {
      usdtRate = findUsdtRate;
      usdRate = usdtRate;
    } else {
      const _findUsdRate = findRate(asset, 'USD', prices);
      if (_findUsdRate) {
        return _findUsdRate;
      }
      const findBtcRate = findRate(asset, 'BTC', prices);
      if (findBtcRate) {
        const findBtcUsdtRate = findRate('BTC', 'USDT', prices);
        if (findBtcUsdtRate) {
          usdtRate = findBtcRate * findBtcUsdtRate;
          usdRate = usdtRate;
        }
      }
    }
  }
  const findUsdtUsdRate = findRate('USDT', 'USD', prices);
  if (findUsdtUsdRate) {
    usdRate = usdtRate * findUsdtUsdRate;
  }
  return usdRate;
};

/**
 * Calculate unrealized PnL for a deal
 */
export const calculateUnrealizedPnL = (
  deal: DCADeals,
  latestPrices: PriceData[],
  _globalUsdRate?: number
): number | undefined => {
  try {
    // Check if deal is active
    if (!isActiveDeal(deal)) {
      return undefined;
    }

    // Validate required data - handle both string and object symbol formats
    const symbolString =
      typeof deal.symbol === 'string' ? deal.symbol : deal.symbol?.symbol;
    if (!symbolString || !deal.currentBalances || !deal.initialBalances) {
      if (import.meta.env.DEV) {
        logger.debug('[UnrealizedPnL] Missing required data:', {
          dealId: deal._id || deal.botId,
          symbol: deal.symbol,
          symbolString,
          hasCurrentBalances: !!deal.currentBalances,
          hasInitialBalances: !!deal.initialBalances,
          currentBalances: deal.currentBalances,
          initialBalances: deal.initialBalances,
        });
      }
      return undefined;
    }

    // Get current market price
    const exchange = deal.exchange;

    // First try to find price with exact exchange match
    let price = latestPrices.find(
      (p) =>
        p.symbol === symbolString &&
        (exchange ? [exchange, 'all'].includes(p.exchange) : true)
    )?.price;

    // If not found, try to find price from any exchange
    if (!price) {
      price = latestPrices.find((p) => p.symbol === symbolString)?.price;
    }

    if (!price) {
      if (import.meta.env.DEV) {
        logger.debug('[UnrealizedPnL] No price found:', {
          dealId: deal._id || deal.botId,
          symbol: symbolString,
          exchange,
          availablePrices: latestPrices.map((p) => ({
            symbol: p.symbol,
            exchange: p.exchange,
          })),
          uniqueSymbols: [...new Set(latestPrices.map((p) => p.symbol))],
          totalPrices: latestPrices.length,
        });
      }
      return undefined;
    }

    // Calculate USD rate for this specific deal
    const baseAsset =
      typeof deal.symbol === 'object' && deal.symbol?.baseAsset
        ? deal.symbol.baseAsset
        : symbolString.replace(/USDT|USDC|BUSD|USD/g, '');
    const quoteAsset =
      typeof deal.symbol === 'object' && deal.symbol?.quoteAsset
        ? deal.symbol.quoteAsset
        : symbolString.replace(baseAsset, '') || 'USDT';

    // The unrealized-PnL formula below produces a result in quote-asset terms
    // for spot, USD-M, AND COIN-M alike, so we always convert quoteAsset → USD.
    // (Legacy parity: terminal/utils.ts and hedge/new.tsx call
    // findUSDRate(symbol.quoteAsset, …) unconditionally. For COIN-M the
    // `base * price` term already does the coin→USD conversion, so converting
    // via the base asset here double-converted by ~the coin price, inflating
    // unrealized PnL by orders of magnitude.)
    const usdRate = findUSDRate(quoteAsset, latestPrices, exchange);

    if (!usdRate) {
      if (import.meta.env.DEV) {
        logger.debug('[UnrealizedPnL] No USD rate found:', {
          dealId: deal._id || deal.botId,
          baseAsset,
          quoteAsset,
          exchange,
          futures: deal.settings?.futures,
          coinm: deal.settings?.coinm,
        });
      }
      return undefined;
    }

    // Determine if this is a long strategy
    // Default to LONG if no strategy is specified, as most DCA deals are LONG
    const isLong = !deal.strategy || deal.strategy === StrategyEnum.long;

    // Calculate unrealized PnL based on the formula from the guide
    const unrealizedPnL = isLong
      ? (deal.currentBalances.base * price +
          deal.currentBalances.quote -
          deal.initialBalances.quote) *
        usdRate
      : (deal.currentBalances.quote -
          (deal.initialBalances.base - deal.currentBalances.base) * price) *
        usdRate;

    // Validate result
    if (isNaN(unrealizedPnL) || !isFinite(unrealizedPnL)) {
      if (import.meta.env.DEV) {
        logger.debug('[UnrealizedPnL] Invalid result:', {
          dealId: deal._id || deal.botId,
          unrealizedPnL,
          currentBalances: deal.currentBalances,
          initialBalances: deal.initialBalances,
          price,
          usdRate,
          isLong,
        });
      }
      return undefined;
    }

    if (import.meta.env.DEV) {
      logger.debug('[UnrealizedPnL] Calculated:', {
        dealId: deal._id || deal.botId,
        symbol: symbolString,
        unrealizedPnL,
        isLong,
        price,
        usdRate,
        strategy: deal.strategy,
      });
    }

    return unrealizedPnL;
  } catch (error) {
    logger.error('[UnrealizedPnL] Calculation error:', {
      dealId: deal._id || deal.botId,
      error,
    });
    return undefined;
  }
};

/**
 * Calculate unrealized PnL for multiple deals
 */
export const calculateBatchUnrealizedPnL = (
  deals: DCADeals[],
  latestPrices: PriceData[],
  _globalUsdRate?: number
): Record<string, number> => {
  const results: Record<string, number> = {};

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const dealId = deal._id || deal.botId || `deal-${i}`;

    const pnl = calculateUnrealizedPnL(deal, latestPrices, _globalUsdRate);
    if (pnl !== undefined) {
      results[dealId] = pnl;
    }
  }

  logger.debug('[UnrealizedPnL] Batch calculation results:', {
    totalDeals: deals.length,
    calculatedDeals: Object.keys(results).length,
    results,
  });

  return results;
};
