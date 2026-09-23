import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { krakenHandler } from '@/utils/tradingView/exchanges/kraken';
import { createRealtimeBarGuard } from '@/utils/tradingView/realtimeBarGuard';
import type { Bar, LibrarySymbolInfo } from '@/utils/tradingView/types';

/**
 * TradingView's realtime callback (`subscribeBars` → `onTick`) accepts only
 * the bar it already has as the newest one, or a newer one. Anything older is
 * rejected with "putToCacheNewBar: time violation".
 *
 * Kraken's v2 `ohlc` channel answers every subscribe with a `snapshot`
 * message holding the day's candles, oldest first, then streams `update`
 * messages for the forming candle. The chart has already loaded that history
 * through getBars, so forwarding the snapshot replays a batch of old bars
 * into the realtime callback — one violation per candle.
 */

const HOUR = 60 * 60 * 1000;
const T15 = Date.UTC(2026, 8, 23, 15);

const iso = (ms: number) => new Date(ms).toISOString();

const candle = (ms: number, interval = 60, symbol = 'ETH/EUR') => ({
  symbol,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.5,
  volume: 10,
  interval_begin: iso(ms),
  interval,
  timestamp: iso(ms + interval * 60_000),
});

// Mirrors the Kraken v2 behaviour that matters here: a connection holds at
// most ONE ohlc interval per symbol — subscribing another is answered with
// an error and nothing is streamed for it.
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: Array<{
    method: string;
    params: { symbol: string[]; interval: number };
  }> = [];
  ohlc = new Map<string, number>(); // symbol → subscribed interval
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.dispatch('open', {});
    });
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  send(data: string) {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    const [symbol] = msg.params.symbol;
    if (msg.method === 'subscribe') {
      if (this.ohlc.has(symbol)) {
        this.receive({
          error: 'Already subscribed to one ohlc interval on this symbol',
          method: 'subscribe',
          success: false,
        });
        return;
      }
      this.ohlc.set(symbol, msg.params.interval);
    } else if (this.ohlc.get(symbol) === msg.params.interval) {
      this.ohlc.delete(symbol);
    }
  }
  close() {
    this.readyState = 3;
    this.dispatch('close', {});
  }
  dispatch(type: string, e: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  receive(msg: unknown) {
    this.dispatch('message', { data: JSON.stringify(msg) });
  }
  // What Kraken streams: a candle reaches a socket only if that socket holds
  // the symbol at that interval.
  static publish(c: ReturnType<typeof candle>) {
    for (const ws of FakeWebSocket.instances) {
      if (ws.readyState === 1 && ws.ohlc.get(c.symbol) === c.interval) {
        ws.receive({ channel: 'ohlc', type: 'update', data: [c] });
      }
    }
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const spotSymbol = {
  name: 'ETH-EUR',
  ticker: 'ETH-EUR@KRAKEN',
  exchange: 'KRAKEN',
  wsCode: 'ETH/EUR',
} as LibrarySymbolInfo;

describe('Kraken spot realtime feed', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    for (const g of ['guid-1', 'guid-2', 'guid-3'])
      krakenHandler.unsubscribe(g);
    vi.unstubAllGlobals();
  });

  test('a subscribe snapshot only forwards the forming candle, never the day of history', async () => {
    const ticks: Bar[] = [];
    await krakenHandler.subscribe(
      spotSymbol,
      '60',
      (b) => ticks.push(b),
      'guid-1'
    );
    const ws = FakeWebSocket.instances[0];

    // What Kraken actually sends for ETH/EUR 1h a few minutes past 15:00.
    const snapshot = Array.from({ length: 10 }, (_, i) =>
      candle(T15 - (9 - i) * HOUR)
    );
    ws.receive({ channel: 'ohlc', type: 'snapshot', data: snapshot });

    expect(ticks.map((b) => iso(b.time))).toEqual([iso(T15)]);

    ws.receive({ channel: 'ohlc', type: 'update', data: [candle(T15)] });
    ws.receive({ channel: 'ohlc', type: 'update', data: [candle(T15 + HOUR)] });
    expect(ticks.map((b) => iso(b.time))).toEqual([
      iso(T15),
      iso(T15),
      iso(T15 + HOUR),
    ]);
  });

  test('ignores candles of another interval on the shared socket', async () => {
    const ticks: Bar[] = [];
    await krakenHandler.subscribe(
      spotSymbol,
      '60',
      (b) => ticks.push(b),
      'guid-1'
    );
    const ws = FakeWebSocket.instances[0];

    ws.receive({
      channel: 'ohlc',
      type: 'update',
      data: [candle(T15 + 15 * 60_000, 15)],
    });
    expect(ticks).toEqual([]);
  });
});

describe('Kraken spot subscription lifecycle', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    for (const g of ['guid-1', 'guid-2', 'guid-3'])
      krakenHandler.unsubscribe(g);
    vi.unstubAllGlobals();
  });

  test('a timeframe change keeps streaming: TradingView subscribes the new resolution before dropping the old', async () => {
    const hourly: Bar[] = [];
    const minute: Bar[] = [];
    await krakenHandler.subscribe(
      spotSymbol,
      '60',
      (b) => hourly.push(b),
      'guid-1'
    );
    // TradingView order on 1h → 1m: subscribe the new series first…
    await krakenHandler.subscribe(
      spotSymbol,
      '1',
      (b) => minute.push(b),
      'guid-2'
    );
    // …and unsubscribe the old one lazily, some seconds later.
    krakenHandler.unsubscribe('guid-1');

    FakeWebSocket.publish(candle(T15 + 30 * 60_000, 1));
    FakeWebSocket.publish(candle(T15 + 31 * 60_000, 1));

    expect(minute.map((b) => iso(b.time))).toEqual([
      iso(T15 + 30 * 60_000),
      iso(T15 + 31 * 60_000),
    ]);
  });

  test('two charts on the same stream: one leaving does not cut the other off', async () => {
    const a: Bar[] = [];
    const b: Bar[] = [];
    await krakenHandler.subscribe(spotSymbol, '60', (x) => a.push(x), 'guid-1');
    await krakenHandler.subscribe(spotSymbol, '60', (x) => b.push(x), 'guid-2');
    krakenHandler.unsubscribe('guid-1');

    FakeWebSocket.publish(candle(T15 + HOUR));

    expect(b.map((x) => iso(x.time))).toEqual([iso(T15 + HOUR)]);
    const subscribes = FakeWebSocket.instances
      .flatMap((ws) => ws.sent)
      .filter((m) => m.method === 'subscribe');
    expect(subscribes).toHaveLength(1);
  });

  test('a listener removed while the socket is still connecting never subscribes', async () => {
    const pending = krakenHandler.subscribe(
      spotSymbol,
      '60',
      () => {},
      'guid-1'
    );
    krakenHandler.unsubscribe('guid-1');
    await pending;
    await flush();
    expect(FakeWebSocket.instances.flatMap((ws) => ws.sent)).toEqual([]);
  });
});

describe('realtime bar guard (callback boundary)', () => {
  const bar = (time: number): Bar => ({
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  });

  test('drops a realtime bar older than the newest history bar', () => {
    const guard = createRealtimeBarGuard();
    guard.noteHistory('ETH-EUR@KRAKEN|60', [bar(T15 - HOUR), bar(T15)]);
    const out: number[] = [];
    const tick = guard.wrap('ETH-EUR@KRAKEN|60', (b) => out.push(b.time));

    tick(bar(T15 - 9 * HOUR));
    tick(bar(T15));
    tick(bar(T15 - HOUR));
    tick(bar(T15 + HOUR));
    tick(bar(T15));

    expect(out).toEqual([T15, T15 + HOUR]);
  });

  test('a scroll-back history page does not lower the floor', () => {
    const guard = createRealtimeBarGuard();
    guard.noteHistory('k', [bar(T15)]);
    guard.noteHistory('k', [bar(T15 - 20 * HOUR), bar(T15 - 10 * HOUR)]);
    const out: number[] = [];
    guard.wrap('k', (b) => out.push(b.time))(bar(T15 - HOUR));
    expect(out).toEqual([]);
  });

  test('series are independent', () => {
    const guard = createRealtimeBarGuard();
    guard.noteHistory('a|60', [bar(T15)]);
    const out: number[] = [];
    guard.wrap('a|15', (b) => out.push(b.time))(bar(T15 - HOUR));
    expect(out).toEqual([T15 - HOUR]);
  });
});
