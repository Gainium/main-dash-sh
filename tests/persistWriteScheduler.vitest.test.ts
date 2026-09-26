// Spec 064 §1 — persisted-store writes are dirty-checked, throttled, gated on
// hydration, flushable and cancellable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelAllPersistWrites,
  createPersistWriter,
  shallowEqualDepth,
} from '../src/lib/persistWriteScheduler';

describe('persistWriteScheduler (spec 064 §1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (extra: Partial<Parameters<typeof createPersistWriter>[0]> = {}) => {
    const writes: unknown[] = [];
    const w = createPersistWriter({
      name: `t-${Math.random()}`,
      throttleMs: 2000,
      write: async (_n, v) => {
        writes.push(v);
      },
      ...extra,
    });
    return { w, writes };
  };

  it('writes nothing before hydration (no overwrite of the saved blob)', async () => {
    const { w, writes } = setup();
    await w.setItem({ state: { deals: { a: 1 } }, version: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(0);
  });

  it('coalesces a burst into one trailing write of the latest value', async () => {
    const { w, writes } = setup();
    w.markHydrated(null);
    for (let i = 0; i < 50; i++) await w.setItem({ state: { n: i }, version: 1 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([{ state: { n: 49 }, version: 1 }]);
  });

  it('skips a write whose persisted slice is reference-equal to the saved one', async () => {
    const { w, writes } = setup();
    const deals = { bot1: { d1: { id: 'd1' } } };
    w.markHydrated({ state: { deals }, version: 2 });
    // e.g. setHasHydrated / setDealLoading: partialize returns a new wrapper
    // object around the same deals map.
    await w.setItem({ state: { deals }, version: 2 });
    await w.setItem({ state: { deals: { ...deals } }, version: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(0);
    await w.setItem({ state: { deals: { ...deals, bot2: {} } }, version: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(writes).toHaveLength(1);
  });

  it('flush writes immediately; cancel drops the pending write', async () => {
    const { w, writes } = setup();
    w.markHydrated(null);
    await w.setItem({ state: { n: 1 }, version: 0 });
    await w.flush();
    expect(writes).toHaveLength(1);
    await w.setItem({ state: { n: 2 }, version: 0 });
    cancelAllPersistWrites();
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(1);
  });

  it('applies prepare only when a write happens', async () => {
    const prepare = vi.fn((s: unknown) => ({ ...(s as object), bounded: true }));
    const { w, writes } = setup({ prepare });
    w.markHydrated(null);
    for (let i = 0; i < 10; i++) await w.setItem({ state: { n: i }, version: 0 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([{ state: { n: 9, bounded: true }, version: 0 }]);
  });

  it('shallowEqualDepth treats fresh empty objects as equal', () => {
    const filled = {};
    expect(
      shallowEqualDepth({ orders: { new: {}, filled } }, { orders: { new: {}, filled } }, 3)
    ).toBe(true);
    expect(shallowEqualDepth({ a: [1] }, { a: [1] }, 3)).toBe(false);
  });
});
