// Currency utility functions — pure helpers, no mock data

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per 1 USD. */
  rate: number;
}

/** One cached fiat rate as the API serves it: 1 `asset` = `usdRate` USD. */
export interface FiatRate {
  asset: string;
  usdRate: number;
}

const USD: Currency = { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1 };

// Display metadata only. A currency is offered only once a live rate for it
// has arrived — there is deliberately no fallback rate, because a stale one
// (this table used to hard-code EUR 0.85, JPY 110) shows every value wrong
// while looking correct.
const FIAT_METADATA: Omit<Currency, 'rate'>[] = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF ' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
];

/**
 * USD plus every fiat that has a usable live rate, in display order. With no
 * rates (older backend, request failed) this is just USD.
 */
export const buildCurrencies = (
  rates: readonly FiatRate[] | null | undefined
): Currency[] => {
  const byAsset = new Map(
    (rates ?? [])
      .filter((r) => r?.asset && Number.isFinite(r.usdRate) && r.usdRate > 0)
      .map((r) => [r.asset.toUpperCase(), r.usdRate])
  );
  const live = FIAT_METADATA.flatMap((meta) => {
    const usdRate = byAsset.get(meta.code);
    return usdRate ? [{ ...meta, rate: 1 / usdRate }] : [];
  });
  return [USD, ...live];
};

/**
 * Look a code up in a currency list, falling back to USD — never to a guessed
 * rate — when the code is unknown or its rate has not loaded.
 */
export const getCurrencyInfo = (
  currencyCode: string,
  currencies: readonly Currency[] = [USD]
): Currency => currencies.find((c) => c.code === currencyCode) ?? USD;

export const formatValueInCurrency = (
  value: number,
  currencyCode: string = 'USD',
  currencies: readonly Currency[] = [USD]
) => {
  const currencyInfo = getCurrencyInfo(currencyCode, currencies);
  const convertedValue = value * currencyInfo.rate;

  return {
    value: convertedValue,
    formatted: convertedValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    symbol: currencyInfo.symbol,
    currency: currencyInfo.code,
  };
};
