/**
 * Runner note: `.vitest.test.ts` — drives the real zustand `persist`
 * middleware of the live stores, which needs jsdom. Run from the cloud parent:
 * `NODE_ENV=development npx vitest run core/tests/bug962StoreRehydrateKeepsFetched.vitest.test.ts`.
 *
 * Bug #962 — the saved (IndexedDB) deal cache hydrates late: its read is
 * queued behind the other heavy stores and then takes seconds. When it
 * finally lands, `merge` used to REPLACE the store's deals with the snapshot,
 * so a deal fetched in the meantime vanished and the bot drawer lost its
 * Breakeven / Smart order lines. The order store had the same shape.
 *
 * Each test swaps in a storage whose `getItem` is held open, writes to the
 * store while the read is pending (the real race window), then releases an
 * older snapshot and lets the real `persist` flow run its `merge`.
 *
 * Spec: specs/057.deal-store-rehydrate-overwrites-fetched-deals.md
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

import logger from '@/lib/loggerInstance';
import { useDealStore, type DealWithType } from '@/stores/live/dealStore';
import { useOrderStore } from '@/stores/live/orderStore';
import { recordDealTombstone, clearAllTombstones } from '@/stores/live/staleWriteGuard';
import type { DCADeals, OrderData } from '@/types';

const BOT = 'bot-xmr';

const deal = (id: string, updateTime: number, extra: Partial<DCADeals> = {}) =>
  ({
    _id: id,
    botId: BOT,
    status: 'open',
    updateTime,
    avgPrice: 570.68,
    paperContext: false,
    ...extra,
  }) as unknown as DCADeals;

const order = (clientOrderId: string, status: string) =>
  ({ clientOrderId, status, dealId: 'deal-open', price: '577.79' }) as unknown as OrderData;

/** A storage whose read stays pending until `release(snapshot)`. */
function heldStorage<S>() {
  let release!: (v: StorageValue<S> | null) => void;
  const pending = new Promise<StorageValue<S> | null>((r) => {
    release = r;
  });
  const storage: PersistStorage<S> = {
    getItem: () => pending,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  return { storage, release };
}

async function rehydrateDealsWith(
  snapshot: StorageValue<unknown> | null,
  duringRead: () => void
) {
  const held = heldStorage<unknown>();
  useDealStore.persist.setOptions({ storage: held.storage as never });
  const done = useDealStore.persist.rehydrate();
  duringRead();
  held.release(snapshot);
  await done;
}

async function rehydrateOrdersWith(
  snapshot: StorageValue<unknown> | null,
  duringRead: () => void
) {
  const held = heldStorage<unknown>();
  useOrderStore.persist.setOptions({ storage: held.storage as never });
  const done = useOrderStore.persist.rehydrate();
  duringRead();
  held.release(snapshot);
  await done;
}

const savedDeals = (deals: Record<string, Record<string, Partial<DealWithType>>>) => ({
  state: { deals },
  version: 2,
});

beforeEach(() => {
  clearAllTombstones();
  useDealStore.setState({ deals: {} });
  useOrderStore.setState({ orders: { new: {}, filled: {} } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bug #962 — deal store restore keeps deals fetched since page load', () => {
  it('§1.2/§4.1: a deal fetched during the read survives an older snapshot that lacks it', async () => {
    await rehydrateDealsWith(
      savedDeals({ [BOT]: { 'deal-old': { ...deal('deal-old', 100, { status: 'closed' }), dealType: 'dca' } } }),
      () => {
        useDealStore.getState().updateDeals(BOT, [deal('deal-open', 500)], 'dca');
      }
    );

    const bucket = useDealStore.getState().deals[BOT];
    expect(bucket['deal-open']?.avgPrice).toBe(570.68);
    // §4.2 — the saved-only deal is still restored.
    expect(bucket['deal-old']?.status).toBe('closed');
  });

  it('§4.1: the in-memory copy beats an older saved copy; a strictly newer saved copy wins', async () => {
    await rehydrateDealsWith(
      savedDeals({
        [BOT]: {
          'deal-a': { ...deal('deal-a', 100, { avgPrice: 1 }), dealType: 'dca' },
          'deal-b': { ...deal('deal-b', 900, { avgPrice: 2 }), dealType: 'dca' },
        },
      }),
      () => {
        useDealStore.getState().updateDeals(
          BOT,
          [deal('deal-a', 500, { avgPrice: 10 }), deal('deal-b', 500, { avgPrice: 20 })],
          'dca'
        );
      }
    );

    const bucket = useDealStore.getState().deals[BOT];
    expect(bucket['deal-a'].avgPrice).toBe(10);
    expect(bucket['deal-b'].avgPrice).toBe(2);
  });

  it('§4.2: a saved deal the user just closed (tombstoned) is not revived', async () => {
    recordDealTombstone(BOT, 'deal-gone', 'closed', 300);
    await rehydrateDealsWith(
      savedDeals({ [BOT]: { 'deal-gone': { ...deal('deal-gone', 200), dealType: 'dca' } } }),
      () => {
        useDealStore.getState().updateDeals(BOT, [deal('deal-open', 500)], 'dca');
      }
    );

    const bucket = useDealStore.getState().deals[BOT];
    expect(bucket['deal-gone']).toBeUndefined();
    expect(bucket['deal-open']).toBeDefined();
  });

  it('§4.3: an empty cache (fresh profile) keeps the fetched deals and does not error', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    await rehydrateDealsWith(null, () => {
      useDealStore.getState().updateDeals(BOT, [deal('deal-open', 500)], 'dca');
    });

    expect(useDealStore.getState().deals[BOT]['deal-open']).toBeDefined();
    expect(useDealStore.getState()._hasHydrated).toBe(true);
    expect(errorSpy).not.toHaveBeenCalledWith('[DealStore] Rehydration error:', expect.anything());
  });
});

describe('bug #962 — order store restore keeps orders fetched since page load', () => {
  it('§1.3/§4.4: pending orders fetched during the read survive; filled orders merge per id', async () => {
    await rehydrateOrdersWith(
      {
        state: {
          orders: {
            new: {},
            filled: { [BOT]: { 'filled-old': order('filled-old', 'FILLED') } },
          },
        },
        version: 1,
      },
      () => {
        useOrderStore.getState().updateOrders(BOT, [order('smart-1', 'NEW')], 'new');
        useOrderStore.getState().updateOrders(BOT, [order('filled-new', 'FILLED')], 'filled');
      }
    );

    const { orders } = useOrderStore.getState();
    expect(orders.new[BOT]?.['smart-1']).toBeDefined();
    expect(orders.filled[BOT]?.['filled-new']).toBeDefined();
    expect(orders.filled[BOT]?.['filled-old']).toBeDefined();
  });

  it('§1.4: pending orders are still never restored FROM storage', async () => {
    await rehydrateOrdersWith(
      {
        state: { orders: { new: { [BOT]: { 'stale-new': order('stale-new', 'NEW') } }, filled: {} } },
        version: 1,
      },
      () => undefined
    );

    expect(useOrderStore.getState().orders.new[BOT]?.['stale-new']).toBeUndefined();
  });
});
