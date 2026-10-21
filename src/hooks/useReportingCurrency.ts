import { useReportingCurrencyStore } from '@/stores/reportingCurrencyStore';
import {
  formatFiat,
  formatUsdAsReporting,
  holdingToReporting,
  usdToReporting,
  type FiatFormatOptions,
} from '@/utils/reportingCurrency';
import { useMemo } from 'react';

/**
 * The reporting currency in effect, with converters bound to it. Components
 * using this re-render when the user switches currency or a new rate lands.
 */
export function useReportingCurrency() {
  const currency = useReportingCurrencyStore((s) => s.currency);
  return useMemo(
    () => ({
      currency,
      toReporting: (usd: number) => usdToReporting(usd, currency),
      holding: (asset: string | null | undefined, amount: number, usd: number) =>
        holdingToReporting(asset, amount, usd, currency),
      formatUsd: (usd: number, options?: FiatFormatOptions) =>
        formatUsdAsReporting(usd, options, currency),
      format: (value: number, options?: FiatFormatOptions) =>
        formatFiat(value, currency, options),
    }),
    [currency]
  );
}
