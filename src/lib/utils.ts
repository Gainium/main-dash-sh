import { extractPairAssets } from '@/utils/pairs';
import { formatUsdAsReporting } from '@/utils/reportingCurrency';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatting utility functions
/** A USD value, shown in the user's reporting currency. */
export function formatCurrency(value: number, decimals: number = 2): string {
  return formatUsdAsReporting(value, { decimals });
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Creates a TradingView-compatible price formatter that dynamically adjusts decimal places
 * based on price magnitude for better readability
 */
export function createDynamicPriceFormatter(maxPrecision: number = 8) {
  return {
    format: (price: number): string => {
      if (typeof price !== 'number' || !isFinite(price)) {
        return '0';
      }

      let decimals: number;

      if (price >= 1000) {
        decimals = 1; // Large prices: 1000.0
      } else if (price >= 100) {
        decimals = 2; // Medium-high prices: 100.00
      } else if (price >= 10) {
        decimals = 2; // Medium prices: 10.00
      } else if (price >= 1) {
        decimals = 2; // Unit prices: 1.00
      } else if (price >= 0.1) {
        decimals = 3; // Sub-unit prices: 0.100
      } else if (price >= 0.01) {
        decimals = 4; // Small prices: 0.0100
      } else if (price >= 0.001) {
        decimals = 5; // Smaller prices: 0.00100
      } else if (price >= 0.0001) {
        decimals = 6; // Even smaller: 0.000100
      } else {
        decimals = Math.min(maxPrecision, 8); // Very small prices: up to 8 decimals
      }

      return price.toFixed(decimals);
    },
  };
}

/**
 * Format trading symbol to pair format for CoinPair component
 * Converts symbols like "BTCUSDT" to "BTC/USDT"
 */
export function formatTradingPair(symbol: string): string {
  const { baseAsset, quoteAsset } = extractPairAssets(symbol);

  if (baseAsset && quoteAsset) {
    return `${baseAsset}/${quoteAsset}`;
  }

  // Fallback: if no known quote asset found, assume USDT
  return `${symbol}/USDT`;
}
