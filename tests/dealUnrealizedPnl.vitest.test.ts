/**
 * Runner: `npx vitest run core/tests/dealUnrealizedPnl.vitest.test.ts` from the
 * cloud parent.
 *
 * Spec 067 §2 (canonical fee-inclusive unrealized P&L) and §3 (price index).
 * The DCA vectors are the ones in the shared uPnL definition the server's
 * stats worker is built against, so client and server agree by construction.
 */
import { describe, expect, it } from 'vitest';

import {
  computeDealUnrealizedPnl,
  computeDealUnrealizedPnlFromPrices,
  serverDealUnrealizedPnl,
  type DealPnlInput,
} from '@/lib/utils/dealUnrealizedPnl';
import {
  findPrice,
  findRate,
  findUSDRate,
  type PriceData,
} from '@/lib/utils/unrealizedPnL';

const longDca = (over: Partial<DealPnlInput> = {}): DealPnlInput => ({
  status: 'open',
  strategy: 'LONG',
  exchange: 'binance',
  exchangeUUID: 'ex-1',
  symbol: { symbol: 'BTCUSDT', quoteAsset: 'USDT' },
  initialBalances: { base: 0, quote: 1000 },
  currentBalances: { base: 0.02, quote: 0 },
  usage: { current: { base: 0.02, quote: 1000 }, max: { base: 0, quote: 3000 } },
  settings: { futures: false, coinm: false },
  ...over,
});

const shortDca = (over: Partial<DealPnlInput> = {}): DealPnlInput => ({
  status: 'open',
  strategy: 'SHORT',
  exchange: 'binance',
  exchangeUUID: 'ex-1',
  symbol: { symbol: 'BTCUSDT', quoteAsset: 'USDT' },
  initialBalances: { base: 1, quote: 0 },
  currentBalances: { base: 0, quote: 60000 },
  usage: { current: { base: 1, quote: 60000 }, max: { base: 3, quote: 0 } },
  settings: { futures: false, coinm: false },
  ...over,
});

const market = { price: 55000, usdRate: 1, fee: 0.001 };

describe('computeDealUnrealizedPnl — DCA (§2.1)', () => {
  it('LONG: gross minus open+close fee on the invested amount', () => {
    const r = computeDealUnrealizedPnl(longDca(), market);
    // gross = 0.02*55000 + 0 - 1000 = 100; fee = 2*0.001*1000 = 2
    expect(r?.unrealizedUsd).toBeCloseTo(98, 10);
    expect(r?.usageUsd).toBeCloseTo(1000, 10);
    expect(r?.percent).toBeCloseTo(9.8, 10);
  });

  it('SHORT: usage is the base sold, valued at the current price', () => {
    const r = computeDealUnrealizedPnl(shortDca(), market);
    // gross = 60000 - (1-0)*55000 = 5000; usage = 1*55000; fee = 110
    expect(r?.unrealizedUsd).toBeCloseTo(4890, 8);
    expect(r?.usageUsd).toBeCloseTo(55000, 8);
    expect(r?.percent).toBeCloseTo((4890 / 55000) * 100, 8);
  });

  it('LONG losing position stays negative and includes fees', () => {
    const r = computeDealUnrealizedPnl(longDca(), { ...market, price: 45000 });
    // gross = 900 - 1000 = -100; fee 2
    expect(r?.unrealizedUsd).toBeCloseTo(-102, 10);
  });

  it('SHORT losing position (price rose)', () => {
    const r = computeDealUnrealizedPnl(shortDca(), { ...market, price: 65000 });
    // gross = 60000 - 65000 = -5000; usage = 65000; fee = 130
    expect(r?.unrealizedUsd).toBeCloseTo(-5130, 8);
  });

  it('a known fee of 0 leaves the gross value', () => {
    expect(
      computeDealUnrealizedPnl(longDca(), { ...market, fee: 0 })?.unrealizedUsd
    ).toBeCloseTo(100, 10);
  });

  it('an unknown fee, price or USD rate yields no live value (caller shows the server value)', () => {
    expect(computeDealUnrealizedPnl(longDca(), { ...market, fee: undefined })).toBeUndefined();
    expect(computeDealUnrealizedPnl(longDca(), { ...market, price: undefined })).toBeUndefined();
    expect(computeDealUnrealizedPnl(longDca(), { ...market, usdRate: 0 })).toBeUndefined();
  });

  it('closed and canceled deals have no unrealized P&L', () => {
    expect(computeDealUnrealizedPnl(longDca({ status: 'closed' }), market)).toBeUndefined();
    expect(computeDealUnrealizedPnl(longDca({ status: 'canceled' }), market)).toBeUndefined();
  });

  it('start and error deals are active', () => {
    expect(computeDealUnrealizedPnl(longDca({ status: 'start' }), market)).toBeDefined();
    expect(computeDealUnrealizedPnl(longDca({ status: 'error' }), market)).toBeDefined();
  });

  it('converts a non-USD quote through the quote→USD rate (P&L and fee alike)', () => {
    const r = computeDealUnrealizedPnl(longDca(), { ...market, usdRate: 1.1 });
    expect(r?.unrealizedUsd).toBeCloseTo(98 * 1.1, 8);
    expect(r?.percent).toBeCloseTo(9.8, 8);
  });

  it('reduce-funds and new-multi-TP fills count toward the fee basis', () => {
    const deal = longDca({
      reduceFunds: [{ qty: 0.002, price: 50000 }],
      tpFilledHistory: [{ qty: 0.001, price: 60000 }],
      flags: ['newMultiTp'],
    });
    const r = computeDealUnrealizedPnl(deal, market);
    // usage = 1000 + 100 + 60 = 1160; fee = 2*0.001*1160 = 2.32
    expect(r?.usageUsd).toBeCloseTo(1160, 8);
    expect(r?.unrealizedUsd).toBeCloseTo(100 - 2.32, 8);
    // Without the newMultiTp flag the filled-TP rows are not usage
    const legacy = computeDealUnrealizedPnl(
      { ...deal, flags: [] },
      market
    );
    expect(legacy?.usageUsd).toBeCloseTo(1100, 8);
  });

  it('USD-M futures use quote usage for LONG and SHORT alike', () => {
    const r = computeDealUnrealizedPnl(
      shortDca({ settings: { futures: true, coinm: false } }),
      market
    );
    // usage = usage.current.quote = 60000
    expect(r?.usageUsd).toBeCloseTo(60000, 8);
    expect(r?.unrealizedUsd).toBeCloseTo(5000 - 120, 8);
  });

  it('COIN-M futures use base usage valued at the price', () => {
    const r = computeDealUnrealizedPnl(
      longDca({ settings: { futures: true, coinm: true } }),
      market
    );
    expect(r?.usageUsd).toBeCloseTo(0.02 * 55000, 8);
  });

  it('null market flags fall back to the exchange market type', () => {
    const r = computeDealUnrealizedPnl(
      shortDca({
        exchange: 'binanceUsdm',
        settings: { futures: null, coinm: null },
      }),
      market
    );
    expect(r?.usageUsd).toBeCloseTo(60000, 8);
  });
});

describe('computeDealUnrealizedPnl — combo (§2.2)', () => {
  const combo = (over: Partial<DealPnlInput> = {}): DealPnlInput => ({
    ...longDca(),
    avgPrice: 50000,
    profit: { total: 5 },
    usage: { current: { base: 0.02, quote: 1000 }, max: { base: 0.06, quote: 3000 } },
    ...over,
  });

  it('closing-fee path when the deal does not track paid fees', () => {
    const r = computeDealUnrealizedPnl(combo(), market, { combo: true });
    // qty 0.02, quote = 1000 + 5 = 1005, quoteTp = 1100, commission = 1.1
    // total = 5 + (1100 - 1005) - 1.1 = 98.9; denominator = max.quote 3000
    expect(r?.unrealizedUsd).toBeCloseTo(98.9, 8);
    expect(r?.usageUsd).toBeCloseTo(3000, 8);
    expect(r?.percent).toBeCloseTo((98.9 / 3000) * 100, 8);
  });

  it('paid-fee path subtracts the fees actually paid', () => {
    const r = computeDealUnrealizedPnl(
      combo({
        profit: { total: 5, pureBase: 0, pureQuote: 5 },
        feePaid: { base: 0.00001, quote: 0.5 },
      }),
      market,
      { combo: true }
    );
    // quote = 1000, quoteTp = 1100, commission = 0.00001*50000 + 0.5 = 1
    expect(r?.unrealizedUsd).toBeCloseTo(99, 8);
  });

  it('comboTpBase=filled measures the percentage against current usage', () => {
    const r = computeDealUnrealizedPnl(
      combo({ settings: { futures: false, coinm: false, comboTpBase: 'filled' } }),
      market,
      { combo: true }
    );
    expect(r?.usageUsd).toBeCloseTo(1000, 8);
  });
});

describe('computeDealUnrealizedPnlFromPrices (§2.3)', () => {
  const prices: PriceData[] = [
    { symbol: 'BTCUSDT', price: 54000, exchange: 'bybit' },
    { symbol: 'BTCUSDT', price: 55000, exchange: 'binance' },
    { symbol: 'USDTZUSD', price: 1, exchange: 'all' },
  ];
  const fees = [{ exchange: 'ex-1', symbol: 'BTCUSDT', fee: 0.001 }];

  it("prices the deal on its OWN exchange, never another venue's ticker", () => {
    const r = computeDealUnrealizedPnlFromPrices(longDca(), prices, fees);
    expect(r?.unrealizedUsd).toBeCloseTo(98, 8);
  });

  it('no fee row for the deal → undefined', () => {
    expect(
      computeDealUnrealizedPnlFromPrices(longDca({ exchangeUUID: 'other' }), prices, fees)
    ).toBeUndefined();
  });
});

describe('serverDealUnrealizedPnl (§2.4)', () => {
  it('prefers the fee-inclusive server field and ignores closed deals', () => {
    expect(
      serverDealUnrealizedPnl({
        status: 'open',
        stats: { unrealizedProfit: 100, unrealizedProfitNet: 98, usage: 1000 },
      })
    ).toEqual({ unrealizedUsd: 98, percent: 9.8 });
    expect(
      serverDealUnrealizedPnl({ status: 'open', stats: { unrealizedProfit: 100 } })
        ?.unrealizedUsd
    ).toBe(100);
    expect(
      serverDealUnrealizedPnl({ status: 'closed', stats: { unrealizedProfit: 100 } })
    ).toBeUndefined();
  });
});

// The linear implementation this change replaced, kept verbatim as the oracle.
const legacyMatches = (base: string, quote: string) => (p: PriceData) => {
  if (!p || !p.symbol) return false;
  const sym = p.symbol.split('_')[0];
  return (
    sym === `${base}${quote}` ||
    sym === `${base}-${quote}` ||
    sym === `${base}/${quote}` ||
    sym === `${base}Z${quote}`
  );
};
const legacyFindRate = (
  from: string,
  to: string,
  prices: PriceData[],
  reverse = false
): number | null => {
  const m = prices.find(legacyMatches(from, to));
  if (m && m.price > 0) return reverse ? 1 / m.price : m.price;
  if (!reverse) return legacyFindRate(to, from, prices, true);
  return null;
};
const legacyFindUSDRate = (asset: string, all: PriceData[], exchange?: string) => {
  const prices = all.filter((p) =>
    exchange ? [exchange, 'all'].includes(p.exchange ?? '') : true
  );
  asset = asset
    .replace('SBTC', 'BTC')
    .replace('SUSD', 'USD')
    .replace('SUSDT', 'USDT')
    .replace('UBTC', 'BTC');
  if (asset === 'USD') return 1;
  let usdRate = Number(asset === 'USDT' || asset === 'USDC');
  let usdtRate = Number(asset === 'USDT' || asset === 'USDC');
  if (asset !== 'USDT') {
    const a = legacyFindRate(asset, 'USDT', prices) || legacyFindRate(asset, 'USDC', prices);
    if (a) {
      usdtRate = a;
      usdRate = a;
    } else {
      const u = legacyFindRate(asset, 'USD', prices);
      if (u) return u;
      const b = legacyFindRate(asset, 'BTC', prices);
      if (b) {
        const bu = legacyFindRate('BTC', 'USDT', prices);
        if (bu) {
          usdtRate = b * bu;
          usdRate = usdtRate;
        }
      }
    }
  }
  const uu = legacyFindRate('USDT', 'USD', prices);
  if (uu) usdRate = usdtRate * uu;
  return usdRate;
};

describe('price index (§3) — identical answers to the linear scan', () => {
  const prices: PriceData[] = [
    { symbol: 'USDTZUSD', price: 0.9995, exchange: 'all' },
    { symbol: 'ETH-USDT', price: 2500, exchange: 'kucoin' },
    { symbol: 'ETHUSDT', price: 2510, exchange: 'binance' },
    { symbol: 'ETHUSDT', price: 0, exchange: 'bybit' },
    { symbol: 'SOL/EUR', price: 150, exchange: 'kraken' },
    { symbol: 'EUR-USD', price: 1.08, exchange: 'coinbase' },
    { symbol: 'EURUSDT', price: 1.07, exchange: 'binance' },
    { symbol: 'XYZBTC', price: 0.0001, exchange: 'binance' },
    { symbol: 'BTCUSDT', price: 60000, exchange: 'binance' },
    { symbol: 'BTCUSDT_240628', price: 61000, exchange: 'binanceUsdm' },
    { symbol: 'USDCUSDT', price: 1.0001, exchange: 'binance' },
    { symbol: 'ETHUSDT', price: 2520, exchange: 'binance' },
  ];

  it('findRate and findUSDRate match for every asset × exchange', () => {
    const assets = ['ETH', 'SOL', 'EUR', 'XYZ', 'BTC', 'USDC', 'USDT', 'USD', 'SBTC', 'NOPE'];
    const exchanges = [undefined, 'binance', 'kucoin', 'kraken', 'coinbase', 'bybit', 'binanceUsdm'];
    for (const a of assets) {
      for (const q of ['USDT', 'USD', 'BTC', 'EUR']) {
        expect(findRate(a, q, prices)).toBe(legacyFindRate(a, q, prices));
      }
      for (const ex of exchanges) {
        expect(findUSDRate(a, prices, ex as never)).toBe(
          legacyFindUSDRate(a, prices, ex)
        );
      }
    }
  });

  it('findPrice takes the first exact row on the exchange, then an all row', () => {
    expect(findPrice(prices, 'ETHUSDT', 'binance')).toBe(2510);
    expect(findPrice(prices, 'USDTZUSD', 'binance')).toBe(0.9995);
    expect(findPrice(prices, 'ETHUSDT', 'kraken')).toBeUndefined();
    expect(findPrice(prices, 'ETHUSDT')).toBe(2510);
  });

  it('rebuilds when the same array grows', () => {
    const arr: PriceData[] = [{ symbol: 'AAAUSDT', price: 2, exchange: 'binance' }];
    expect(findUSDRate('BBB', arr)).toBe(0);
    arr.push({ symbol: 'BBBUSDT', price: 3, exchange: 'binance' });
    expect(findUSDRate('BBB', arr)).toBe(3);
  });
});
