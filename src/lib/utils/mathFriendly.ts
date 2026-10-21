import { getReportingCurrency, usdToReporting } from '@/utils/reportingCurrency';

/**
 * Formats numbers in a friendly way (e.g., 1000 -> 1K, 1000000 -> 1M)
 * Matches the old dashboard's math.friendly() function
 */
export function mathFriendly(n: number): string {
  const number = Math.abs(n);
  const num = Math.abs(n)
    .toString()
    .replace(/[^0-9.]/g, '');
  let minus = '';
  if (n < 0) {
    minus = '-';
  }

  if (number < 10000) {
    return `${minus}${num}`;
  }

  const si = [
    { v: 1e3, s: 'K' },
    { v: 1e6, s: 'M' },
    { v: 1e9, s: 'B' },
    { v: 1e12, s: 'T' },
    { v: 1e15, s: 'P' },
    { v: 1e18, s: 'E' },
  ];

  let index;
  for (index = si.length - 1; index > 0; index--) {
    if (number >= si[index].v) {
      break;
    }
  }

  return `${minus}${(number / si[index].v)
    .toFixed(1)
    .replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1')}${si[index].s}`;
}

/**
 * Formats a USD VALUE field like the old dashboard, in the reporting currency
 */
export function formatValueFriendly(usd: number): string {
  const { symbol } = getReportingCurrency();
  const value = usdToReporting(usd || 0);
  return value < 0
    ? `-${symbol}${mathFriendly(value * -1)}`
    : `${symbol}${mathFriendly(value)}`;
}
