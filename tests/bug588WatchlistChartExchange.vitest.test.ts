/**
 * Bug #588 — Watchlist: opening the chart for a bybitLinear pair charted
 * another venue.
 *
 * `ChartPortal` handed `TradingViewChart` a BARE pair (`HYPEUSDT`) with no
 * `@EXCHANGE` suffix, so the shared datafeed's `resolveSymbol` had nothing to
 * resolve against. It then either matched whichever venue happens to list that
 * symbol first in the globally-registered symbol list (Binance.US, in the
 * Trading Desk repro — a 3% different price) or, when no venue matched, built a
 * dynamic symbol whose `targetExchange = exchange || ExchangeEnum.binance`
 * default pinned the chart to Binance. HYPEUSDT is not listed on Binance spot
 * (`api.binance.com` answers `-1121 Invalid symbol`), which is the reporter's
 * empty "HYPE / USDT · 1h · BINANCE" chart.
 *
 * These drive the REAL datafeed, so they fail on the pre-fix symbol string and
 * pass on the post-fix one.
 */
import { describe, test, expect, beforeEach } from 'vitest';

import { ExchangeEnum, type Symbols } from '@/types';
import {
  createDatafeed,
  setAvailableSymbols,
} from '@/utils/tradingView/factory';
import type { LibrarySymbolInfo } from '@/utils/tradingView/types';

const resolve = (symbolName: string): Promise<LibrarySymbolInfo> =>
  new Promise((res, rej) => {
    createDatafeed().resolveSymbol(symbolName, res as never, rej as never);
  });

const symbol = (pair: string, exchange: ExchangeEnum): Symbols => ({
  pair,
  exchange,
  baseAsset: {
    name: pair.replace(/[-]?USDT?$/, ''),
    minAmount: 0,
    maxAmount: 0,
    step: 0,
  },
  quoteAsset: { name: 'USDT', minAmount: 0 },
  maxOrders: 100,
  priceAssetPrecision: 8,
});

describe('bug #588 — watchlist chart resolves the pair on its own exchange', () => {
  beforeEach(() => {
    setAvailableSymbols([]);
  });

  test('a bare pair with nothing registered falls back to BINANCE', async () => {
    const info = await resolve('HYPEUSDT');
    expect(info.exchange).toBe('BINANCE');
  });

  test('a bare pair takes whichever venue lists it first, not the row own one', async () => {
    // What the Trading Desk actually does: the co-mounted Coin Chart widget
    // registers every pair on every venue, so a bare `HYPEUSDT` resolved to
    // Binance.US while the watchlist row said bybitLinear.
    setAvailableSymbols([
      symbol('HYPEUSDT', ExchangeEnum.binanceUS),
      symbol('HYPEUSDT', ExchangeEnum.bybitUsdm),
    ]);
    const info = await resolve('HYPEUSDT');
    expect(info.exchange).toBe('BINANCEUS');
  });

  test('an exchange-qualified pair (post-fix) resolves on bybitLinear', async () => {
    setAvailableSymbols([
      symbol('HYPEUSDT', ExchangeEnum.binanceUS),
      symbol('HYPEUSDT', ExchangeEnum.bybitUsdm),
    ]);
    const info = await resolve('HYPEUSDT@BYBITLINEAR');
    expect(info.exchange).toBe('BYBITLINEAR');
    expect(info.name).toBe('HYPEUSDT');
  });

  test("registering the row's own pair carries code/wsCode to the chart", async () => {
    setAvailableSymbols([
      {
        ...symbol('HYPE-USD', ExchangeEnum.kraken),
        code: 'PI_HYPEUSD',
        wsCode: 'HYPE/USD',
      },
    ]);
    const info = await resolve('HYPE-USD@KRAKEN');
    expect(info.exchange).toBe('KRAKEN');
    expect(info.wsCode).toBe('HYPE/USD');
  });

  test('a binance watchlist pair is unchanged by the qualification', async () => {
    setAvailableSymbols([symbol('BTCUSDT', ExchangeEnum.binance)]);
    const info = await resolve('BTCUSDT@BINANCE');
    expect(info.exchange).toBe('BINANCE');
    expect(info.name).toBe('BTCUSDT');
  });
});
