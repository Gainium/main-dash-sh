import { useReportingCurrencyStore } from '@/stores/reportingCurrencyStore';
import type { Currency } from '@/utils/currencyUtils';

/**
 * Reporting-currency conversion. Every fiat value the dashboard shows is held
 * in USD (backend `*Usd` fields, or a USDT value × the USDT→USD rate on the
 * client), so showing it in the user's currency is a single multiplication by
 * that currency's units-per-USD. Convert exactly once, at display time.
 *
 * These read the store directly so plain formatting functions can use them;
 * components that must re-render on a currency change use
 * `useReportingCurrency`, and the app shell remounts the page when the code
 * changes (see `ReportingCurrencySync`).
 */
export const getReportingCurrency = (): Currency =>
  useReportingCurrencyStore.getState().currency;

/** A USD value in the reporting currency. */
export const usdToReporting = (
  usd: number,
  currency: Currency = getReportingCurrency()
): number => usd * currency.rate;

/**
 * The reporting-currency value of a holding. A balance that is ALREADY in the
 * reporting currency (EUR held on Kraken while reporting in EUR) is shown at
 * its face amount — round-tripping it through USD would apply two different
 * rates (the venue's EUR price and our FX rate) and show €999.73 for €1,000.
 * Everything else goes through its USD value.
 */
export const holdingToReporting = (
  asset: string | null | undefined,
  amount: number,
  usdValue: number,
  currency: Currency = getReportingCurrency()
): number => {
  const a = asset?.toUpperCase();
  if (a && a === currency.code) return amount;
  if (currency.code === 'USD' && a === 'USD') return amount;
  return usdValue * currency.rate;
};

export interface FiatFormatOptions {
  /** Fraction digits (default 2). Capped for zero-decimal currencies. */
  decimals?: number;
  /** 'always' prefixes + on positives; 'never' drops the minus too. */
  sign?: 'auto' | 'always' | 'never';
  /** 1.5K / 3.2M / 1.1B above 1,000. */
  compact?: boolean;
}

/**
 * Format an amount that is ALREADY in `currency` (no conversion). Output for
 * USD matches the `Intl` en-US currency format the dashboard used before:
 * `$1,234.56`, `-$1,234.56`.
 */
export const formatFiat = (
  value: number,
  currency: Currency = getReportingCurrency(),
  { decimals = 2, sign = 'auto', compact = false }: FiatFormatOptions = {}
): string => {
  const digits =
    currency.decimals === undefined
      ? decimals
      : Math.min(decimals, currency.decimals);
  const abs = Math.abs(value);
  const prefix =
    sign === 'never'
      ? ''
      : value < 0
        ? '-'
        : sign === 'always' && value > 0
          ? '+'
          : '';
  let body: string;
  if (compact && abs >= 1_000_000_000) body = `${(abs / 1e9).toFixed(1)}B`;
  else if (compact && abs >= 1_000_000) body = `${(abs / 1e6).toFixed(1)}M`;
  else if (compact && abs >= 1_000) body = `${(abs / 1e3).toFixed(1)}K`;
  else
    body = abs.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  return `${prefix}${currency.symbol}${body}`;
};

/** Convert a USD value to the reporting currency and format it. */
export const formatUsdAsReporting = (
  usd: number,
  options?: FiatFormatOptions,
  currency: Currency = getReportingCurrency()
): string => formatFiat(usdToReporting(usd, currency), currency, options);
