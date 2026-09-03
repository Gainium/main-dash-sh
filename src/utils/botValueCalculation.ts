import { StrategyEnum, type Bot, type DCABot, type Prices } from '../types';
import { findUSDRate } from '../lib/utils/unrealizedPnL';

// Define helper functions inline since they're specific to this calculation
const sumBalances = (
  balances: { key: string; value: number }[],
  rates: { [key: string]: Prices[number] },
  symbols: {
    key: string;
    value: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
  }[],
  base?: boolean
): number => {
  return balances.reduce((acc, { key, value }) => {
    const sym = symbols.filter(
      (s) => s.value.baseAsset === key || s.value.quoteAsset === key
    );
    if (!sym.length) return acc;
    const rate = sym.map((s) => rates[s.value.symbol]).filter(Boolean)[0];
    if (!rate) return acc;
    return acc + value * (base ? 1 / rate.price : rate.price);
  }, 0);
};

const sumPureBalances = (
  balances: { key: string; value: number }[]
): number => {
  return balances.reduce((acc, { value }) => {
    return acc + value;
  }, 0);
};

// `findUSDRate` (and its underlying `findRate`) is the canonical, separator-
// aware implementation in `lib/utils/unrealizedPnL`. It used to be duplicated
// here; consolidated so both call sites share one bridge-resolution path.

/**
 * Math helper class for consistent calculations
 * Matches the MathHelper from old dashboard
 */
class MathHelper {
  round(
    value: number,
    precision: number = 2,
    _isNegative?: boolean,
    _isPositive?: boolean
  ): number {
    const factor = Math.pow(10, precision);
    const rounded = Math.round(value * factor) / factor;
    return rounded;
  }

  friendly(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toFixed(2);
  }

  getPrecision(value: number): number {
    if (!isFinite(value)) return 0;
    let e = 1;
    let p = 0;
    while (Math.round(value * e) / e !== value) {
      e *= 10;
      p++;
    }
    return p;
  }
}

const math = new MathHelper();

/**
 * Result interface for bot value calculation
 */
export interface BotValueResult {
  /** Net PnL: realized + unrealized. */
  value: number;
  /** Unrealized PnL on its own — open positions only. */
  unrealizedValue: number;
  valuePercentage: number;
  valueFriendly: string;
  currentValue: number;
  maxValue: number;
  isActive: boolean;
  loadedPrices: boolean;
  realizedProfit: number; // Realized profit from deals
}

/**
 * Types for calculation inputs
 */
interface AllFees {
  exchange: string;
  symbol: string;
  fee: number;
}

export interface ExchangeInUser {
  uuid: string;
  name?: string;
  provider?: string;
}

/**
 * Calculate bot value using the authoritative old dashboard logic
 * Based on: gainium-dev/main-dash/components/dcabot/components/utils.tsx prepareDCABot function
 */
export const calculateBotValue = (
  bot: DCABot | Bot,
  combo: boolean,
  latestPrices: Prices,
  allFees: AllFees[],
  _userExchanges?: ExchangeInUser[]
): BotValueResult => {
  const isDca = 'dealsInBot' in bot; // Determine if bot is DCABot or generic Bot
  let unPnl = 0;
  let unPnlPerc = 0;
  let currentValues = 0;

  const symbolEntries = Array.isArray(bot.symbol)
    ? bot.symbol
    : [{ key: bot.symbol.symbol, value: bot.symbol }];

  const usageCurrent = bot.usage?.current ?? { quote: 0, base: 0 };
  const usageMax = bot.usage?.max ?? { quote: 0, base: 0 };

  // Early return if essential data is missing
  if (!bot.usage || symbolEntries.length === 0 || !isDca) {
    return {
      value: 0,
      unrealizedValue: 0,
      valuePercentage: 0,
      valueFriendly: '$0.00',
      currentValue: 0,
      maxValue: 0,
      isActive: false,
      loadedPrices: false,
      realizedProfit: 0,
    };
  }
  const dcaBot = bot as DCABot;

  // Check if bot is active (has current balances)
  const active =
    (usageCurrent.quote ?? 0) !== 0 || (usageCurrent.base ?? 0) !== 0;

  // Early return for inactive bots or missing prices - MATCH OLD DASHBOARD EXACTLY
  if (!active || !latestPrices || latestPrices.length === 0) {
    return {
      value: 0,
      unrealizedValue: 0,
      valuePercentage: 0,
      valueFriendly: '$0.00',
      currentValue: 0,
      maxValue: 0,
      isActive: false,
      loadedPrices: latestPrices.length > 0,
      realizedProfit: 0,
    };
  }

  // Strategy determination
  const long = dcaBot.settings?.strategy === StrategyEnum.long;

  // Fee lookup
  const fee =
    allFees.find(
      (f) =>
        f.exchange === dcaBot.exchangeUUID &&
        f.symbol === dcaBot.settings?.pair?.[0]
    )?.fee ?? 0;

  // USD rate calculation (strategy and futures-aware)
  const primarySymbol = symbolEntries[0]?.value;
  const usdRate = dcaBot.settings?.futures
    ? dcaBot.settings?.coinm
      ? findUSDRate(
          primarySymbol?.baseAsset ?? '',
          latestPrices,
          dcaBot.exchange
        )
      : findUSDRate(
          primarySymbol?.quoteAsset ?? '',
          latestPrices,
          dcaBot.exchange
        )
    : long
      ? findUSDRate(
          primarySymbol?.quoteAsset ?? '',
          latestPrices,
          dcaBot.exchange
        )
      : findUSDRate(
          primarySymbol?.baseAsset ?? '',
          latestPrices,
          dcaBot.exchange
        );

  // Max value calculation (strategy and futures-aware)
  let maxValue = 0;
  if (dcaBot.usage?.max) {
    const maxValueCalc = dcaBot.settings?.futures
      ? dcaBot.settings?.coinm
        ? usageMax.base || 0
        : usageMax.quote || 0
      : long
        ? usageMax.quote || 0
        : usageMax.base || 0;

    maxValue = maxValueCalc * usdRate;
  }

  let findRates: { [key: string]: Prices[number] } = {};

  // CRITICAL: Only calculate if active and prices available - MATCH OLD DASHBOARD EXACTLY
  if (active && latestPrices.length > 0) {
    // Current values calculation
    const currentValueCalc = dcaBot.settings?.futures
      ? dcaBot.settings?.coinm
        ? usageCurrent.base || 0
        : usageCurrent.quote || 0
      : long
        ? usageCurrent.quote || 0
        : usageCurrent.base || 0;

    currentValues = math.round(currentValueCalc * usdRate);

    // Symbol processing
    const botSymbols = symbolEntries;

    // Helper function to normalize exchange names for matching
    const normalizeExchange = (exchange: string): string => {
      return exchange
        .toLowerCase()
        .replace(/usdm$/, '')
        .replace(/coinm$/, '');
    };

    // Find current market rates for relevant symbols
    findRates = latestPrices
      .filter(
        (lp) =>
          botSymbols.map((bs) => bs.key).includes(lp.symbol) &&
          dcaBot.exchange &&
          lp.exchange &&
          normalizeExchange(lp.exchange) === normalizeExchange(dcaBot.exchange)
      )
      .reduce((acc, lp) => ({ ...acc, [lp.symbol]: lp }), {}) as {
      [key: string]: Prices[number];
    };

    if (Object.values(findRates).some((r) => r.price !== 0)) {
      // STRATEGY-SPECIFIC CALCULATIONS (simplified version)
      if (long) {
        // Long strategy: current base value + current quote - initial quote
        const currentBaseBalances = dcaBot.currentBalances?.base || [];
        const currentQuoteBalances = dcaBot.currentBalances?.quote || [];
        const initialQuoteBalances = dcaBot.initialBalances?.quote || [];

        // CRITICAL: Check if balances need conversion to {key, value} format
        const convertToKeyValue = (
          balances: unknown[]
        ): { key: string; value: number }[] => {
          if (!balances || !Array.isArray(balances)) return [];
          // If already in {key, value} format, return as-is
          if (
            balances.length > 0 &&
            typeof balances[0] === 'object' &&
            balances[0] !== null &&
            'key' in balances[0] &&
            'value' in balances[0]
          ) {
            return balances as { key: string; value: number }[];
          }
          // If just numbers or other format, try to convert
          return balances.map((balance, index) => {
            if (typeof balance === 'number') {
              return { key: `balance_${index}`, value: balance };
            }
            if (typeof balance === 'object' && balance !== null) {
              // Try different possible property names using any-cast for flexibility
              const balanceObj = balance as Record<string, unknown>;
              const value =
                balanceObj['value'] ??
                balanceObj['amount'] ??
                balanceObj['balance'] ??
                balance;
              const key =
                balanceObj['key'] ??
                balanceObj['symbol'] ??
                balanceObj['asset'] ??
                `item_${index}`;
              return { key: String(key), value: Number(value) || 0 };
            }
            return { key: `unknown_${index}`, value: 0 };
          });
        };

        const convertedCurrentBase = convertToKeyValue(currentBaseBalances);
        const convertedCurrentQuote = convertToKeyValue(currentQuoteBalances);
        const convertedInitialQuote = convertToKeyValue(initialQuoteBalances);

        const currentBaseValue = sumBalances(
          convertedCurrentBase,
          findRates,
          botSymbols
        );
        const currentQuoteValue = sumPureBalances(convertedCurrentQuote);
        const initialQuoteValue = sumPureBalances(convertedInitialQuote);

        unPnl = currentBaseValue + currentQuoteValue - initialQuoteValue;
      } else {
        // Short strategy: current quote value - (initial base - current base)
        const currentQuoteBalances = dcaBot.currentBalances?.quote || [];
        const initialBaseBalances = dcaBot.initialBalances?.base || [];
        const currentBaseBalances = dcaBot.currentBalances?.base || [];

        const currentQuoteValue = sumBalances(
          currentQuoteBalances,
          findRates,
          botSymbols,
          true
        );
        const initialBaseValue = sumPureBalances(initialBaseBalances);
        const currentBaseValue = sumPureBalances(currentBaseBalances);

        unPnl = currentQuoteValue - (initialBaseValue - currentBaseValue);
      }

      // FUTURES HANDLING
      if (dcaBot.settings.futures) {
        if (dcaBot.settings.coinm) {
          // Coin-margined futures logic
          if (long) {
            const currentBaseValue = sumPureBalances(
              dcaBot.currentBalances?.base || []
            );
            const currentQuoteValue = sumBalances(
              dcaBot.currentBalances?.quote || [],
              findRates,
              botSymbols,
              true
            );
            const initialQuoteValue = sumBalances(
              dcaBot.initialBalances?.quote || [],
              findRates,
              botSymbols,
              true
            );

            unPnl = currentBaseValue + currentQuoteValue - initialQuoteValue;
          } else {
            const currentQuoteValue = sumBalances(
              dcaBot.currentBalances?.quote || [],
              findRates,
              botSymbols,
              true
            );
            const initialBaseValue = sumPureBalances(
              dcaBot.initialBalances?.base || []
            );
            const currentBaseValue = sumPureBalances(
              dcaBot.currentBalances?.base || []
            );

            unPnl = currentQuoteValue - (initialBaseValue - currentBaseValue);
          }
        } else {
          // USD-margined futures logic
          if (long) {
            // Get the balance arrays
            const currentBaseBalances = dcaBot.currentBalances?.base || [];
            const currentQuoteBalances = dcaBot.currentBalances?.quote || [];
            const initialQuoteBalances = dcaBot.initialBalances?.quote || [];

            // CRITICAL: Check if balances need conversion to {key, value} format
            const convertToKeyValue = (
              balances: unknown[]
            ): { key: string; value: number }[] => {
              if (!balances || !Array.isArray(balances)) return [];
              // If already in {key, value} format, return as-is
              if (
                balances.length > 0 &&
                typeof balances[0] === 'object' &&
                balances[0] !== null &&
                'key' in balances[0] &&
                'value' in balances[0]
              ) {
                return balances as { key: string; value: number }[];
              }
              // If just numbers or other format, try to convert
              return balances.map((balance, index) => {
                if (typeof balance === 'number') {
                  return { key: `balance_${index}`, value: balance };
                }
                if (typeof balance === 'object' && balance !== null) {
                  // Try different possible property names using any-cast for flexibility
                  const balanceObj = balance as Record<string, unknown>;
                  const value =
                    balanceObj['value'] ??
                    balanceObj['amount'] ??
                    balanceObj['balance'] ??
                    balance;
                  const key =
                    balanceObj['key'] ??
                    balanceObj['symbol'] ??
                    balanceObj['asset'] ??
                    `item_${index}`;
                  return { key: String(key), value: Number(value) || 0 };
                }
                return { key: `unknown_${index}`, value: 0 };
              });
            };

            const convertedCurrentBase = convertToKeyValue(currentBaseBalances);
            const convertedCurrentQuote =
              convertToKeyValue(currentQuoteBalances);
            const convertedInitialQuote =
              convertToKeyValue(initialQuoteBalances);

            const currentBaseValue = sumBalances(
              convertedCurrentBase,
              findRates,
              botSymbols
            );
            const currentQuoteValue = sumPureBalances(convertedCurrentQuote);
            const initialQuoteValue = sumPureBalances(convertedInitialQuote);

            unPnl = currentBaseValue + currentQuoteValue - initialQuoteValue;
          } else {
            const currentQuoteValue = sumPureBalances(
              dcaBot.currentBalances?.quote || []
            );
            const initialBaseValue = sumBalances(
              dcaBot.initialBalances?.base || [],
              findRates,
              botSymbols
            );
            const currentBaseValue = sumBalances(
              dcaBot.currentBalances?.base || [],
              findRates,
              botSymbols
            );

            unPnl = currentQuoteValue - (initialBaseValue - currentBaseValue);
          }
        }
      }

      // USD rate conversion
      unPnl *= usdRate;

      // Basic fee calculation
      const usage = currentValues;
      if (!combo) {
        unPnlPerc = unPnl / usage;
        unPnlPerc -= fee * 2; // Double fee deduction
        unPnl = usage * unPnlPerc;
      }

      unPnlPerc = math.round(unPnlPerc * 100, 2);
    } else {
      // No valid prices found in findRates, unPnl will be 0
    }
  }

  // FINAL PROCESSING
  unPnl = active ? math.round(unPnl, 2, unPnl < 0, unPnl > 0) : 0;
  maxValue = math.round(maxValue, 2);

  // GET REALIZED PROFITS FROM DEALS
  const realizedProfit = dcaBot.profit?.totalUsd || 0;

  // NET PNL = UNREALIZED + REALIZED
  const totalProfit = unPnl + realizedProfit;

  const result = {
    value: totalProfit, // Net PnL — realized + unrealized
    unrealizedValue: unPnl, // Unrealized PnL on its own
    valuePercentage: unPnlPerc,
    valueFriendly:
      (totalProfit || 0) < 0
        ? `-$${math.friendly((totalProfit || -0) * -1)}`
        : `$${math.friendly(totalProfit || 0)}`,
    currentValue: currentValues,
    maxValue,
    isActive: active,
    loadedPrices: !!Object.keys(findRates || {}).length,
    realizedProfit: realizedProfit, // Include realized profit for reference
  };

  return result;
};
