/**
 * Number formatting utility for widget headers
 *
 * Formatting rules:
 * - Up to 2 decimals for small numbers (0.34)
 * - One decimal for numbers over 100
 * - No decimals for numbers over 1000
 * - Use K and M (123.4K, 1.45M)
 */

import { getReportingCurrency, usdToReporting } from '@/utils/reportingCurrency';

export function formatNumber(
  value: number | string | null | undefined,
  precise = false
): string {
  // Handle null, undefined, or invalid values
  if (value == null || value === '' || isNaN(Number(value))) {
    return '-';
  }

  const num = Number(value);

  // Handle zero and negative zero
  if (num === 0) {
    return '0';
  }

  // Handle very small numbers (less than 0.01)
  if (Math.abs(num) < 0.01 && num !== 0) {
    return num.toExponential(2);
  }

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  // When precise is true, use different formatting rules
  if (precise) {
    // For precise formatting:
    // - Numbers >= 1000: round to 2 decimals max (remove trailing zeros) with comma separators
    // - Numbers >= 100: round to 2 decimals max (remove trailing zeros) with comma separators
    // - Numbers >= 1: round to 2 decimals max (remove trailing zeros) with comma separators
    // - Numbers < 1: show as many decimals as needed (up to 8) but remove trailing zeros

    if (absNum >= 1) {
      // For numbers >= 1, use up to 2 decimals and remove trailing zeros with comma separators
      const formatted = absNum.toFixed(2).replace(/\.?0+$/, '');
      // Add comma separators using toLocaleString
      const parts = formatted.split('.');
      const integerPart = parseInt(parts[0]).toLocaleString('en-US');
      const decimalPart = parts[1] ? `.${parts[1]}` : '';
      return `${sign}${integerPart}${decimalPart}`;
    } else {
      // For numbers < 1, use up to 8 decimals but remove trailing zeros
      const formatted = absNum.toFixed(8).replace(/\.?0+$/, '');
      return `${sign}${formatted}`;
    }
  }

  // Original formatting for non-precise mode
  // Numbers >= 1,000,000 -> use M suffix
  if (absNum >= 1_000_000) {
    const millions = absNum / 1_000_000;
    if (millions >= 100) {
      return `${sign}${Math.round(millions)}M`;
    } else if (millions >= 10) {
      const formatted = millions.toFixed(1).replace(/\.0$/, '');
      return `${sign}${formatted}M`;
    } else {
      const formatted = millions.toFixed(2).replace(/\.?0+$/, '');
      return `${sign}${formatted}M`;
    }
  }

  // Numbers >= 1,000 -> use K suffix
  if (absNum >= 1_000) {
    const thousands = absNum / 1_000;
    if (thousands >= 100) {
      return `${sign}${Math.round(thousands)}K`;
    } else if (thousands >= 10) {
      const formatted = thousands.toFixed(1).replace(/\.0$/, '');
      return `${sign}${formatted}K`;
    } else {
      const formatted = thousands.toFixed(2).replace(/\.?0+$/, '');
      return `${sign}${formatted}K`;
    }
  }

  // Numbers >= 100 -> one decimal place
  if (absNum >= 100) {
    const formatted = absNum.toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}`;
  }

  // Numbers >= 1 -> up to 2 decimals (remove trailing zeros)
  if (absNum >= 1) {
    const formatted = absNum.toFixed(2);
    return `${sign}${formatted.replace(/\.?0+$/, '')}`;
  }

  // Small numbers (< 1) -> up to 2 decimals
  const formatted = absNum.toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${formatted}`;
}

/**
 * Format percentage values
 * Uses the same formatting rules but adds % suffix
 */
export function formatPercentage(
  value: number | string | null | undefined
): string {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `${formatted}%`;
}

/**
 * Format currency values
 * Uses the same formatting rules but adds a currency prefix. With the default
 * '$' the value is a USD amount and is shown in the user's reporting currency;
 * any other prefix is applied to the value as-is.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = '$'
): string {
  if (currency === '$' && value !== null && value !== undefined) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isFinite(n)) {
      const formatted = formatNumber(usdToReporting(n));
      return formatted === '-'
        ? '-'
        : `${getReportingCurrency().symbol}${formatted}`;
    }
  }
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `${currency}${formatted}`;
}

/**
 * Format with custom suffix
 */
export function formatWithSuffix(
  value: number | string | null | undefined,
  suffix: string
): string {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `${formatted}${suffix}`;
}

/**
 * Format balance values with asset-specific decimal precision
 * - USDT/USD: 2 decimal places
 * - BTC/ETH: 8 decimal places
 * - Other assets: 6 decimal places
 */
export function formatBalance(
  value: number | string | null | undefined,
  asset: string = ''
): string {
  // Handle null, undefined, or invalid values
  if (value == null || value === '' || isNaN(Number(value))) {
    return '0';
  }

  const num = Number(value);

  // Handle zero
  if (num === 0) {
    return '0';
  }

  // Determine decimal places based on asset
  let decimals: number;
  const upperAsset = asset.toUpperCase();

  if (upperAsset === 'USDT' || upperAsset === 'USD') {
    decimals = 2;
  } else if (upperAsset === 'BTC' || upperAsset === 'ETH') {
    decimals = 8;
  } else {
    decimals = 6;
  }

  // Format with appropriate decimal places
  return num.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}
