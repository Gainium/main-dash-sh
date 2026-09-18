import { describe, expect, test } from 'vitest';

import { ExchangeEnum } from '@/types';
import { resolveStreamVenue } from '@/services/ExchangeWebSocketService';
import { binanceHandler } from '@/utils/tradingView/exchanges/binance';

/**
 * Binance publishes its USD-M market data on `fstream.binance.com/market/ws`.
 * The bare `fstream.binance.com/ws` base path still completes the handshake
 * and still answers a `SUBSCRIBE` with `{"result":null,"id":…}` — it just
 * never pushes a `24hrTicker` frame. So a Watchlist row pointed at it hangs on
 * "Connecting…" forever with no error anywhere: the socket is open, the
 * subscription was accepted, and no price ever arrives.
 *
 * The app already knows the right URL — the TradingView datafeed streams USD-M
 * candles from `config.websocketUrls.usdm`, which is why a user sees the chart
 * work and the widget not. Asserting against that handler rather than against a
 * copied literal is what keeps the two from drifting apart again.
 *
 * Spec §1.1, §3 and §4.2 of
 * `specs/019.watchlist-binance-usdm-stream-url-never-ticks`.
 */

const urlFor = (exchange: ExchangeEnum) => resolveStreamVenue(exchange)?.url;

describe('resolveStreamVenue — Binance USD-M', () => {
  test('routes binanceUsdm to the same USD-M socket the chart streams from', () => {
    const chartUsdm = binanceHandler.config.websocketUrls?.usdm;

    expect(chartUsdm).toBe('wss://fstream.binance.com/market/ws');
    expect(urlFor(ExchangeEnum.binanceUsdm)).toBe(chartUsdm);
  });

  test('paper binanceUsdm mirrors the live USD-M socket', () => {
    expect(urlFor(ExchangeEnum.paperBinanceUsdm)).toBe(
      urlFor(ExchangeEnum.binanceUsdm)
    );
    expect(resolveStreamVenue(ExchangeEnum.paperBinanceUsdm)?.key).toBe(
      'binance:usdm'
    );
  });

  test('keeps COIN-M on the endpoint that does stream', () => {
    // COIN-M is healthy on the bare base path and the chart handler uses the
    // same one — the fix must not "tidy" it onto /market/ws as well.
    expect(urlFor(ExchangeEnum.binanceCoinm)).toBe(
      binanceHandler.config.websocketUrls?.coinm
    );
    expect(urlFor(ExchangeEnum.binanceCoinm)).toBe(
      'wss://dstream.binance.com/ws'
    );
  });

  test('leaves the other venues from the Bug #442 routing alone', () => {
    expect(urlFor(ExchangeEnum.binance)).toBe(
      'wss://data-stream.binance.vision/ws'
    );
    expect(urlFor(ExchangeEnum.binanceUS)).toBe(
      'wss://stream.binance.us:443/ws'
    );
    // `bybitUsdm`/`bybitCoinm` are the enum members whose VALUES are the
    // `bybitLinear`/`bybitInverse` provider ids the API returns.
    expect(urlFor(ExchangeEnum.bybitUsdm)).toBe(
      'wss://stream.bybit.com/v5/public/linear'
    );
    expect(urlFor(ExchangeEnum.bybitCoinm)).toBe(
      'wss://stream.bybit.com/v5/public/inverse'
    );
    expect(urlFor(ExchangeEnum.bybit)).toBe(
      'wss://stream.bybit.com/v5/public/spot'
    );
  });
});
