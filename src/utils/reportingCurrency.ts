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

/**
 * Extra input for `getProfitByUser`: with it the backend returns realized
 * profit in the reporting currency — the part made in that currency at face
 * value, the rest at the rate of the day it was made — divided by THIS rate,
 * so the usual USD → reporting multiplication shows exactly that amount.
 * Empty for USD (and while the rate is unknown), which keeps plain USD.
 */
export const reportingProfitInput = (
  currency: Currency = getReportingCurrency()
): { reportingCurrency?: string; reportingRate?: number } =>
  reportingProfitUnsupported ||
  currency.code === 'USD' ||
  !(currency.rate > 0)
    ? {}
    : { reportingCurrency: currency.code, reportingRate: currency.rate };

/**
 * Set for the rest of the page's life once a backend has refused the
 * `reportingProfitInput` fields (one that predates them): later requests
 * stop sending them and the profit figures fall back to plain USD.
 */
let reportingProfitUnsupported = false;
const REPORTING_INPUT_KEYS = ['reportingCurrency', 'reportingRate'] as const;

/** Test hook. */
export const __resetReportingProfitSupportForTests = () => {
  reportingProfitUnsupported = false;
};

/** Whether a failed request was refused for the `reportingProfitInput` fields. */
export const isReportingInputRejection = (error: unknown): boolean =>
  /Field "reporting(Currency|Rate)" is not defined by type/.test(
    String((error as { message?: unknown })?.message ?? error)
  );

/**
 * `variables` without the `reportingProfitInput` fields (in a single `input`
 * or in a batch's `v0`, `v1`… inputs), or null when it carries none. Marks
 * the backend as not supporting them, so it is called only on a rejection.
 */
export const withoutReportingProfitInput = (
  variables: unknown
): Record<string, unknown> | null => {
  if (!variables || typeof variables !== 'object') return null;
  let found = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(variables as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const input = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(([key]) => {
          const drop = (REPORTING_INPUT_KEYS as readonly string[]).includes(key);
          if (drop) found = true;
          return !drop;
        })
      );
      out[k] = input;
    } else out[k] = v;
  }
  if (!found) return null;
  reportingProfitUnsupported = true;
  return out;
};

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
