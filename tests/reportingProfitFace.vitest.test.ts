import { describe, expect, it } from 'vitest';
import { tradeProfitFace } from '@/utils/bots/reportingProfit';
import { holdingToReporting, reportingProfitInput } from '@/utils/reportingCurrency';
import type { Currency } from '@/utils/currencyUtils';

const EUR = { code: 'EUR', symbol: '€', rate: 0.86 } as Currency;
const USD = { code: 'USD', symbol: '$', rate: 1 } as Currency;
const symbol = { baseAsset: 'LINK', quoteAsset: 'EUR' };

describe('tradeProfitFace', () => {
  it('a quote-profit EUR deal shows its own € profit at face value', () => {
    const face = tradeProfitFace({
      symbol,
      settings: { profitCurrency: 'quote' },
      profit: { native: 2000 },
    });
    expect(face).toEqual({ asset: 'EUR', amount: 2000 });
    // USD twin booked at close (EUR/USD 1.10), today's rate 0.86 EUR/USD:
    // the old path showed 2200 × 0.86 = €1,892.
    expect(holdingToReporting(face!.asset, face!.amount, 2200, EUR)).toBe(2000);
  });
  it('a base-profit deal is in base, never shown as euros', () => {
    expect(
      tradeProfitFace({
        symbol,
        settings: { profitCurrency: 'base' },
        profit: { native: 3.5 },
      })?.asset
    ).toBe('LINK');
  });
  it('coin-margined profit is in base', () => {
    expect(
      tradeProfitFace({
        symbol: { baseAsset: 'BTC', quoteAsset: 'USD' },
        settings: { profitCurrency: 'quote' },
        coinm: true,
        profit: { native: 0.01 },
      })?.asset
    ).toBe('BTC');
  });
  it('a deal that does not say its profit currency stays on USD', () => {
    expect(tradeProfitFace({ symbol, profit: { native: 2000 } })).toBeUndefined();
    expect(
      tradeProfitFace({ symbol, settings: { profitCurrency: 'quote' }, profit: {} })
    ).toBeUndefined();
  });
});

describe('reportingProfitInput', () => {
  it('asks for the reporting currency with the dashboard’s own rate', () => {
    expect(reportingProfitInput(EUR)).toEqual({
      reportingCurrency: 'EUR',
      reportingRate: 0.86,
    });
  });
  it('sends nothing for USD or an unknown rate', () => {
    expect(reportingProfitInput(USD)).toEqual({});
    expect(reportingProfitInput({ ...EUR, rate: 0 })).toEqual({});
  });
});
