// Spec 064 §3/§4 — bounded live-store caches; order socket events applied in
// one batched store write; cross-bot websocket batching.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boundFilledOrders,
  boundPersistedDeals,
  boundPerBot,
} from '../src/stores/live/persistBounds';
import { WebSocketDebouncer } from '../src/stores/live/webSocketDebouncer';
import { useOrderStore } from '../src/stores/live/orderStore';
import { MAX_MESSAGES, useMessageStore } from '../src/stores/live/messageStore';

const d = (id: string, status: string, updateTime: number) => ({ _id: id, status, updateTime });

describe('boundPersistedDeals (§3)', () => {
  it('keeps every open deal; closed deals only for the most recently viewed bots', () => {
    const deals = {
      a: { o1: d('o1', 'open', 1), c1: d('c1', 'closed', 2) },
      b: { c2: d('c2', 'closed', 3) },
      c: { o2: d('o2', 'start', 4) },
    };
    const out = boundPersistedDeals(deals, { b: 10 }, { closedBots: 1, closedPerBot: 5 });
    expect(Object.keys(out.deals['a'] ?? {})).toEqual(['o1']);
    expect(Object.keys(out.deals['b'] ?? {})).toEqual(['c2']);
    expect(out.deals.c).toBe(deals.c); // untouched bucket keeps its identity
  });

  it('caps closed deals per viewed bot, newest first; drops old LRU entries', () => {
    const closed = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`c${i}`, d(`c${i}`, 'canceled', i)])
    );
    const out = boundPersistedDeals({ a: closed }, { a: 5, z: 1, y: 2 }, { closedBots: 2, closedPerBot: 3 });
    expect(Object.keys(out.deals['a'] ?? {}).sort()).toEqual(['c7', 'c8', 'c9']);
    expect(Object.keys(out.closedViewedAt).sort()).toEqual(['a', 'y']);
  });
});

describe('boundFilledOrders / boundPerBot (§3)', () => {
  it('keeps the newest N filled orders across bots', () => {
    const filled = {
      a: { x1: { updateTime: 1 }, x2: { updateTime: 5 } },
      b: { y1: { updateTime: 3 } },
    };
    expect(boundFilledOrders(filled, 3)).toBe(filled);
    const out = boundFilledOrders(filled, 2);
    expect(out).toEqual({ a: { x2: { updateTime: 5 } }, b: { y1: { updateTime: 3 } } });
  });

  it('caps each bot, returning the same object when nothing is dropped', () => {
    const m = { a: { t1: { updateTime: 1 }, t2: { updateTime: 2 } } };
    expect(boundPerBot(m, 2)).toBe(m);
    expect(Object.keys(boundPerBot(m, 1)['a'] ?? {})).toEqual(['t2']);
  });
});

describe('WebSocketDebouncer (§3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers updates for many bots in ONE callback per window', () => {
    const cb = vi.fn();
    const deb = new WebSocketDebouncer<{ botId: string }>(cb, (u) => u.botId, 50);
    for (let i = 0; i < 20; i++) deb.enqueue({ botId: `bot${i}` });
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toHaveLength(20);
  });

  it('a steady stream still flushes every window (fixed, not extended)', () => {
    const cb = vi.fn();
    const deb = new WebSocketDebouncer<number>(cb, undefined, 50);
    for (let t = 0; t < 200; t += 10) {
      deb.enqueue(t);
      vi.advanceTimersByTime(10);
    }
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('orderStore.applyOrderEvents (§4)', () => {
  beforeEach(() => useOrderStore.setState({ orders: { new: {}, filled: {} } }));

  it('applies a batch in one store write; a fill leaves the new bucket', () => {
    const listener = vi.fn();
    const unsub = useOrderStore.subscribe(listener);
    useOrderStore.getState().applyOrderEvents([
      { botId: 'b', data: { clientOrderId: 'o1', status: 'NEW', updateTime: 1 } },
      { botId: 'b', data: { clientOrderId: 'o1', status: 'FILLED', updateTime: 2 } },
      { botId: 'c', data: { clientOrderId: 'o2', status: 'NEW', updateTime: 1 } },
    ]);
    unsub();
    expect(listener).toHaveBeenCalledTimes(1);
    const { orders } = useOrderStore.getState();
    expect(orders.new.b?.o1).toBeUndefined();
    expect(orders.filled.b?.o1).toBeDefined();
    expect(orders.new.c?.o2).toBeDefined();
  });

  it('a canceled order is removed; an event that changes nothing does not write', () => {
    useOrderStore.getState().applyOrderEvents([
      { botId: 'b', data: { clientOrderId: 'o1', status: 'NEW', updateTime: 1 } },
    ]);
    useOrderStore.getState().applyOrderEvents([
      { botId: 'b', data: { clientOrderId: 'o1', status: 'CANCELED', updateTime: 2 } },
    ]);
    expect(useOrderStore.getState().orders.new.b?.o1).toBeUndefined();
    const listener = vi.fn();
    const unsub = useOrderStore.subscribe(listener);
    useOrderStore.getState().applyOrderEvents([
      { botId: 'b', data: { clientOrderId: 'zz', status: 'CANCELED' } },
    ]);
    useOrderStore.getState().removeOrder('b', 'zz', 'filled');
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('skips a stale copy', () => {
    useOrderStore.getState().applyOrderEvents([
      { botId: 'b', data: { clientOrderId: 'o1', status: 'NEW', updateTime: 5, price: 'new' } },
      { botId: 'b', data: { clientOrderId: 'o1', status: 'NEW', updateTime: 3, price: 'old' } },
    ]);
    expect((useOrderStore.getState().orders.new.b?.o1 as { price?: string }).price).toBe('new');
  });
});

describe('messageStore cap (§3)', () => {
  it(`keeps the newest ${MAX_MESSAGES} messages`, () => {
    useMessageStore.getState().clearMessages();
    for (let i = 0; i < MAX_MESSAGES + 25; i++) {
      useMessageStore.getState().addMessage({ type: 'info', title: 't', message: `m${i}` });
    }
    const msgs = useMessageStore.getState().messages;
    expect(msgs).toHaveLength(MAX_MESSAGES);
    expect(msgs[0]?.message).toBe(`m${MAX_MESSAGES + 24}`);
  });
});
