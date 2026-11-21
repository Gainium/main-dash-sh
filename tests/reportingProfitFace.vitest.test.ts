import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { tradeProfitFace } from '@/utils/bots/reportingProfit';
import {
  __resetReportingProfitSupportForTests,
  holdingToReporting,
  isReportingInputRejection,
  reportingProfitInput,
  withoutReportingProfitInput,
} from '@/utils/reportingCurrency';
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
    expect(holdingToReporting(face?.asset, face?.amount ?? 0, 2200, EUR)).toBe(2000);
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

describe('older backend without the reporting-currency profit input', () => {
  // Verbatim shape of what a backend without the fields answers (HTTP 400).
  const REJECTION = {
    errors: [
      {
        message:
          'Variable "$input" got invalid value <redacted>; Field "reportingCurrency" is not defined by type "getProfitByUser".',
        extensions: { code: 'BAD_USER_INPUT' },
      },
    ],
  };
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetReportingProfitSupportForTests();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetReportingProfitSupportForTests();
  });

  it('recognises the rejection, and nothing else', () => {
    expect(isReportingInputRejection(new Error(REJECTION.errors[0].message))).toBe(true);
    expect(isReportingInputRejection(new Error('Cannot query field "x"'))).toBe(false);
  });

  it('strips the fields from single and batched inputs', () => {
    expect(
      withoutReportingProfitInput({
        input: { timeframe: 3, reportingCurrency: 'EUR', reportingRate: 0.86 },
      })
    ).toEqual({ input: { timeframe: 3 } });
    __resetReportingProfitSupportForTests();
    expect(
      withoutReportingProfitInput({
        v0: { type: 'dca' },
        v1: { timeframe: 3, reportingCurrency: 'EUR', reportingRate: 0.86 },
      })
    ).toEqual({ v0: { type: 'dca' }, v1: { timeframe: 3 } });
    expect(withoutReportingProfitInput({ input: { timeframe: 3 } })).toBeNull();
  });

  it('retries in USD once, then stops sending the fields', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(REJECTION), { status: 400 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { getProfitByUser: { status: 'OK' } } }),
          { status: 200 }
        )
      );
    const client = new GraphQLClient('http://api.test', 'tok');
    const res = await client.request<{ getProfitByUser: { status: string } }>(
      'query getProfitByUser($input: getProfitByUser) { getProfitByUser(input:$input){ status } }',
      { input: { timeframe: 3, ...reportingProfitInput(EUR) } }
    );
    expect(res.getProfitByUser.status).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retried.variables).toEqual({ input: { timeframe: 3 } });
    expect(reportingProfitInput(EUR)).toEqual({});
  });

  it('does not retry an unrelated failure', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 400 })
    );
    const client = new GraphQLClient('http://api.test', 'tok');
    await expect(
      client.request('query q($input: getProfitByUser) { x }', {
        input: { reportingCurrency: 'EUR', reportingRate: 0.86 },
      })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
