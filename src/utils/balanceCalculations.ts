/* eslint-disable @typescript-eslint/no-explicit-any */
// Enhanced balance calculation utilities
// Based on legacy dashboard balance calculation system

import {
  type EnhancedBalanceData,
  type BalanceCalculationInput,
  type BotLegendItem,
  MARKET_CAP_TYPES,
} from '../types/enhancedBalance.types';
import { oldestUpdated } from './balanceStaleness';

// Math helper for consistent rounding
class MathHelper {
  round(value: number, precision: number = 2): number {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  convertFromExponential(value: number, precision: number = 8): string {
    return value.toFixed(precision).replace(/\.?0+$/, '');
  }
}

const math = new MathHelper();

// Check if value is between min and max (inclusive)
const between = (x: number, min: number, max: number): boolean => {
  return x >= min && x <= max;
};

// Get asset categories from coin metadata
const getCategories = (
  assetName: string,
  coins: BalanceCalculationInput['coins'] = []
): string[] => {
  const foundCoin = coins.find(
    (coin) => coin.symbol === assetName.toLowerCase()
  );
  return foundCoin?.categories.filter((category) => category) ?? [];
};

// Get market cap category from coin metadata
const getMarketCapCategory = (
  assetName: string,
  coins: BalanceCalculationInput['coins'] = []
): string => {
  const foundCoin = coins.find(
    (coin) => coin.symbol === assetName.toLowerCase()
  );

  if (!foundCoin) {
    return '';
  }

  const foundCategory = MARKET_CAP_TYPES.find((type) =>
    between(foundCoin.market_cap_rank, type.min, type.max)
  );

  return foundCategory?.title ?? '';
};

// Find USD rate for an asset
const findUSDRate = (
  assetName: string,
  prices: BalanceCalculationInput['prices'] = []
): number => {
  const priceData = prices.find(
    (p) => p.symbol.toLowerCase() === assetName.toLowerCase()
  );
  return priceData?.price ?? 0;
};

// Parse a rate that may arrive as a string, null or undefined (the GraphQL
// `price` field is a String). Only a finite, strictly positive number counts as
// a price - zero and missing both mean "not priced", never a valid valuation.
const parseRate = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// Calculate USD prices for balance data
const calculateUSDPrices = (
  balance: Partial<EnhancedBalanceData>,
  prices: BalanceCalculationInput['prices'] = [],
  rateOverride?: number
) => {
  const usdRate = rateOverride ?? findUSDRate(balance.token || '', prices);

  return {
    freeUsd: math.round((balance.free || 0) * usdRate, 2),
    usedUsd: math.round((balance.used || 0) * usdRate, 2),
    requiredUsd: math.round((balance.required || 0) * usdRate, 2),
    totalUsd: math.round((balance.total || 0) * usdRate, 2),
    plannedUsd: math.round((balance.planned || 0) * usdRate, 2),
    freeAndOverUsd: math.round((balance.freeAndOver || 0) * usdRate, 2),
    usdRate: math.convertFromExponential(math.round(usdRate, 8), 8),
    currentPrice: usdRate,
  };
};

// Helper to set values in nested maps
const setInMap = (
  map: Map<string, Map<string, number>>,
  keyFirst: string,
  keySecond: string,
  value: number
) => {
  const mapSecond = map.get(keyFirst) ?? new Map();
  mapSecond.set(keySecond, (mapSecond.get(keySecond) ?? 0) + value);
  map.set(keyFirst, mapSecond);
};

// Helper to set arrays in nested maps
const setInMapArray = <T = unknown>(
  map: Map<string, Map<string, T[]>>,
  keyFirst: string,
  keySecond: string,
  value: T
) => {
  const mapSecond = map.get(keyFirst) ?? new Map();
  mapSecond.set(keySecond, (mapSecond.get(keySecond) ?? []).concat(value));
  map.set(keyFirst, mapSecond);
};

// Check if bot is a grid bot (simplified version)
const checkGridBot = (bot: any): boolean => {
  return bot.type === 'grid' || bot.settings?.strategy === 'grid';
};

// Check if bot is a DCA bot (simplified version)
const checkDcaBot = (bot: any): boolean => {
  return (
    bot.type === 'dca' ||
    bot.type === 'combo' ||
    bot.settings?.strategy === 'dca'
  );
};

// Main function to calculate enhanced balance data
export const calculateEnhancedBalances = (
  input: BalanceCalculationInput,
  shouldSumBalance: boolean = false
): EnhancedBalanceData[] => {
  const {
    portfolioAssets = [],
    bots = [],
    prices = [],
    coins = [],
    exchanges = [],
  } = input;

  // Maps to store bot usage data
  const assets: Map<string, Map<string, number>> = new Map();
  const assetsPlanned: Map<string, Map<string, number>> = new Map();
  const legend: Map<string, Map<string, BotLegendItem[]>> = new Map();

  // Process bot data to calculate required balances (REAL BOT DATA INTEGRATION)
  bots.forEach((bot) => {
    if (
      !bot.exchangeUUID ||
      bot.status === 'archive' ||
      bot.status === 'closed'
    ) {
      return;
    }

    const exchangeId = bot.exchangeUUID;

    // Process Grid bots (simplified - most bots are DCA/Combo)
    if (checkGridBot(bot)) {
      // Handle base assets (array format)
      const baseRequiredArray = bot.assets?.required?.base || [];
      const baseUsedArray = bot.assets?.used?.base || [];

      baseRequiredArray.forEach((baseReq) => {
        if (baseReq.value > 0) {
          const baseUsed =
            baseUsedArray.find((u) => u.key === baseReq.key)?.value || 0;

          setInMap(assets, exchangeId, baseReq.key, baseReq.value);
          setInMap(
            assetsPlanned,
            exchangeId,
            baseReq.key,
            Math.max(0, baseReq.value - baseUsed)
          );

          setInMapArray(legend, exchangeId, baseReq.key, {
            id: bot._id,
            name: bot.settings.name,
            type: 'grid',
            amount: `${baseReq.value}`,
          });
        }
      });

      // Handle quote assets (array format)
      const quoteRequiredArray = bot.assets?.required?.quote || [];
      const quoteUsedArray = bot.assets?.used?.quote || [];

      quoteRequiredArray.forEach((quoteReq) => {
        if (quoteReq.value > 0) {
          const quoteUsed =
            quoteUsedArray.find((u) => u.key === quoteReq.key)?.value || 0;

          setInMap(assets, exchangeId, quoteReq.key, quoteReq.value);
          setInMap(
            assetsPlanned,
            exchangeId,
            quoteReq.key,
            Math.max(0, quoteReq.value - quoteUsed)
          );

          setInMapArray(legend, exchangeId, quoteReq.key, {
            id: bot._id,
            name: bot.settings.name,
            type: 'grid',
            amount: `${quoteReq.value}`,
          });
        }
      });
    }

    // Process DCA/Combo bots (MAIN BOT TYPE - Real Integration)
    if (checkDcaBot(bot)) {
      const maxQuote = bot.usage?.max?.quote || 0;
      const currentQuote = bot.usage?.current?.quote || 0;
      const maxBase = bot.usage?.max?.base || 0;
      const currentBase = bot.usage?.current?.base || 0;

      // Get asset symbols from bot symbol array
      const symbolData = bot.symbol?.[0]?.value;
      if (!symbolData) return;

      const quoteAsset = symbolData.quoteAsset;
      const baseAsset = symbolData.baseAsset;

      // Handle quote asset (most common for DCA bots)
      if (quoteAsset && maxQuote > 0) {
        const requiredAmount = maxQuote; // Total max usage
        const plannedAmount = Math.max(0, maxQuote - currentQuote); // Available for new deals

        setInMap(assets, exchangeId, quoteAsset, requiredAmount);
        setInMap(assetsPlanned, exchangeId, quoteAsset, plannedAmount);

        setInMapArray(legend, exchangeId, quoteAsset, {
          id: bot._id,
          name: bot.settings.name,
          type: bot.type === 'combo' ? 'combo' : 'dca',
          amount: `${requiredAmount}`,
        });
      }

      // Handle base asset (for futures/short strategies)
      if (baseAsset && maxBase > 0) {
        const requiredAmount = maxBase; // Total max usage
        const plannedAmount = Math.max(0, maxBase - currentBase); // Available for new deals

        setInMap(assets, exchangeId, baseAsset, requiredAmount);
        setInMap(assetsPlanned, exchangeId, baseAsset, plannedAmount);

        setInMapArray(legend, exchangeId, baseAsset, {
          id: bot._id,
          name: bot.settings.name,
          type: bot.type === 'combo' ? 'combo' : 'dca',
          amount: `${requiredAmount}`,
        });
      }
    }
  });

  // Convert portfolio assets to enhanced balance data
  // If raw balances are available (getBalances), prefer them to avoid mocked splits
  let balancesTable: EnhancedBalanceData[] = [];
  if (input.balances && input.balances.length > 0) {
    balancesTable = input.balances
      .map((balance, index) => {
        const freeValue =
          parseFloat((balance.free as unknown as string) ?? '0') || 0;
        const usedValue =
          parseFloat((balance.locked as unknown as string) ?? '0') || 0;
        const total = freeValue + usedValue;

        // Determine required/planned for this asset (sum across exchanges if needed)
        let totalRequired = 0;
        let totalPlanned = 0;

        if (!balance.exchangeUUID) {
          for (const value of assets.values()) {
            totalRequired += value.get(balance.asset) ?? 0;
          }
          for (const value of assetsPlanned.values()) {
            totalPlanned += value.get(balance.asset) ?? 0;
          }
        } else {
          totalRequired +=
            assets.get(balance.exchangeUUID ?? '')?.get(balance.asset) ?? 0;
          totalPlanned +=
            assetsPlanned.get(balance.exchangeUUID ?? '')?.get(balance.asset) ??
            0;
        }

        const assetLegend = (
          legend.get(balance.exchangeUUID ?? '')?.get(balance.asset) ?? []
        ).map((p) => ({
          ...p,
          amount: `${math.round(+p.amount, 8)} ${balance.asset}`,
        }));

        const freeAndOver =
          totalPlanned === 0
            ? freeValue + usedValue - totalRequired
            : freeValue - totalPlanned;

        const requiredRatio =
          total === 0
            ? totalRequired === 0
              ? 0
              : Infinity
            : math.round((totalRequired / total) * 100, 2);

        // Prefer the venue's own rate for this exact holding, supplied by
        // `getBalances(input: { includeUsdValues: true })`. The screener-derived
        // `prices` list stays as a fallback only: it matches on coin symbol, so
        // an asset the venue names differently from the screener (an upstream
        // rebrand) or one the screener does not carry matches nothing and would
        // otherwise be valued at 0 - indistinguishable from actually worthless.
        const price =
          parseRate(balance.price) ?? findUSDRate(balance.asset, prices);
        const priceUnavailable = price <= 0;

        const baseBalance: Partial<EnhancedBalanceData> = {
          id: `${balance.asset.toLowerCase()}-${index}`,
          token: balance.asset.toUpperCase(),
          tokenName: balance.asset.toUpperCase(),
          exchange: (balance.exchange as string) || '',
          exchangeName: (balance.exchangeName as string) || '',
          exchangeUUID: balance.exchangeUUID || '',
          free: math.round(freeValue, 8),
          used: math.round(usedValue, 8),
          total: math.round(total, 8),
          required: math.round(totalRequired, 8),
          planned: math.round(totalPlanned, 8),
          freeAndOver: math.round(freeAndOver, 8),
          requiredRatio,
          currentPrice: price,
          usdRate: '0',
          priceUnavailable,
          updatedAt: balance.updated ?? null,
          categories: getCategories(balance.asset, coins),
          marketCapCategory: getMarketCapCategory(balance.asset, coins),
          legend: assetLegend,
          icon: '🪙',
          color: `hsl(${(index * 60) % 360}, 70%, 60%)`,
        };

        return {
          ...baseBalance,
          ...calculateUSDPrices(
            baseBalance as Partial<EnhancedBalanceData>,
            prices,
            price
          ),
        } as EnhancedBalanceData;
      })
      .filter((b) => b.free > 0 || b.used > 0 || b.required > 0);
  } else {
    balancesTable = portfolioAssets
      .map((asset, index) => {
        const amount = asset.amount || 0;
        const amountUsd = asset.amountUsd || 0;
        const price = amount > 0 ? amountUsd / amount : 0;

        // Calculate bot usage for this asset
        let totalRequired = 0;
        let totalPlanned = 0;
        let assetLegend: BotLegendItem[] = [];

        // Sum up requirements from all exchanges for this asset
        for (const [, exchangeAssets] of assets.entries()) {
          totalRequired += exchangeAssets.get(asset.name) ?? 0;
        }

        for (const [, exchangeAssets] of assetsPlanned.entries()) {
          totalPlanned += exchangeAssets.get(asset.name) ?? 0;
        }

        // Collect legend items
        for (const [, exchangeLegends] of legend.entries()) {
          const legends = exchangeLegends.get(asset.name) ?? [];
          assetLegend = assetLegend.concat(legends);
        }

        // Mock free/used split (in real implementation, this would come from exchange API)
        const mockUsedRatio = 0.7; // 70% used in orders
        const free = amount * (1 - mockUsedRatio);
        const used = amount * mockUsedRatio;
        const total = amount;

        // Calculate free and over balance
        const freeAndOver =
          totalPlanned === 0 ? total - totalRequired : free - totalPlanned;

        // Calculate required ratio
        const requiredRatio =
          total === 0
            ? totalRequired === 0
              ? 0
              : Infinity
            : math.round((totalRequired / total) * 100, 2);

        // Get exchange info from first exchange in asset (if available)
        const firstExchange = asset.exchanges?.[0];
        const exchangeInfo = firstExchange
          ? exchanges.find((ex) => ex.id === firstExchange.uuid)
          : undefined;

        const baseBalance: EnhancedBalanceData = {
          id: `${asset.name.toLowerCase()}-${index}`,
          token: asset.name.toUpperCase(),
          tokenName: asset.name.toUpperCase(),

          // Use real exchange data from asset metadata when available
          exchange: exchangeInfo?.id || '',
          exchangeName: exchangeInfo?.name || '',
          exchangeUUID: firstExchange?.uuid || '',

          // Balance breakdown
          free: math.round(free, 8),
          used: math.round(used, 8),
          total: math.round(total, 8),

          // Bot integration
          required: math.round(totalRequired, 8),
          planned: math.round(totalPlanned, 8),
          freeAndOver: math.round(freeAndOver, 8),
          requiredRatio,

          // USD values (will be calculated below)
          freeUsd: 0,
          usedUsd: 0,
          totalUsd: 0,
          requiredUsd: 0,
          plannedUsd: 0,
          freeAndOverUsd: 0,

          // Price information
          currentPrice: price,
          usdRate: '0',

          // Asset metadata
          categories: getCategories(asset.name, coins),
          marketCapCategory: getMarketCapCategory(asset.name, coins),

          // Bot legend
          legend: assetLegend,

          // UI helpers
          icon: '🪙',
          color: `hsl(${(index * 60) % 360}, 70%, 60%)`,
        };

        // Calculate USD prices
        const usdPrices = calculateUSDPrices(baseBalance, prices);

        return {
          ...baseBalance,
          ...usdPrices,
        };
      })
      .filter(
        // Only include assets with some balance or bot requirements
        (balance) =>
          balance.free > 0 || balance.used > 0 || balance.required > 0
      );
  }

  // Handle balance aggregation if requested
  if (shouldSumBalance) {
    const balancesMap: Map<string, EnhancedBalanceData> = new Map();

    balancesTable.forEach((balance) => {
      const current = balancesMap.get(balance.token);

      if (current) {
        // Aggregate balances for the same token
        const aggregated: EnhancedBalanceData = {
          ...balance,
          exchange: '',
          exchangeName: '',
          exchangeUUID: '',

          free: math.round(current.free + balance.free, 8),
          used: math.round(current.used + balance.used, 8),
          updatedAt: oldestUpdated([current.updatedAt, balance.updatedAt]),
          total: math.round(current.total + balance.total, 8),
          required: math.round(current.required + balance.required, 8),
          planned: math.round(current.planned + balance.planned, 8),
          freeAndOver: math.round(current.freeAndOver + balance.freeAndOver, 8),

          freeUsd: math.round(current.freeUsd + balance.freeUsd, 2),
          usedUsd: math.round(current.usedUsd + balance.usedUsd, 2),
          totalUsd: math.round(current.totalUsd + balance.totalUsd, 2),
          requiredUsd: math.round(current.requiredUsd + balance.requiredUsd, 2),
          plannedUsd: math.round(current.plannedUsd + balance.plannedUsd, 2),
          freeAndOverUsd: math.round(
            current.freeAndOverUsd + balance.freeAndOverUsd,
            2
          ),

          // A row priced by at least one venue carries that rate for the
          // aggregate; the aggregate is only unpriced when every row feeding it
          // was, so one unpriceable venue cannot zero out the whole holding.
          currentPrice: current.currentPrice || balance.currentPrice,
          priceUnavailable: Boolean(
            current.priceUnavailable && balance.priceUnavailable
          ),

          // Combine legends
          legend: [...(current.legend || []), ...(balance.legend || [])],
        };

        // Recalculate required ratio for aggregated balance
        aggregated.requiredRatio =
          aggregated.total === 0
            ? aggregated.required === 0
              ? 0
              : Infinity
            : math.round((aggregated.required / aggregated.total) * 100, 2);

        balancesMap.set(balance.token, aggregated);
      } else {
        balancesMap.set(balance.token, balance);
      }
    });

    return Array.from(balancesMap.values());
  }

  return balancesTable;
};

// Helper function to format token amounts
export const formatTokenAmount = (amount: number): string => {
  if (amount == null || isNaN(amount)) {
    return 'N/A';
  }
  if (amount < 0.001) {
    return amount.toFixed(8);
  } else if (amount < 1) {
    return amount.toFixed(6);
  } else if (amount < 100) {
    return amount.toFixed(4);
  } else {
    return amount.toFixed(2);
  }
};

// Helper function to format USD values
export const formatUSDValue = (value: number): string => {
  if (value == null || isNaN(value)) {
    return '$0.00';
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Helper function to format percentages
export const formatPercentage = (value: number): string => {
  if (value == null || isNaN(value)) {
    return '0%';
  }
  if (value === Infinity) {
    return '∞%';
  }
  return `${value.toFixed(2)}%`;
};
