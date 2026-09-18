/**
 * Runner note: `.vitest.test.tsx` — renders real hooks in jsdom and mocks
 * modules. Run it from the cloud parent:
 * `npx vitest run core/tests/dealResync.vitest.test.tsx`.
 *
 * A deal list fetches a snapshot on mount and is then patched only by
 * `bot deal update` socket events. When the event for a deal's close never
 * lands, the deal stays listed as open, and its Close keeps failing because
 * the server no longer has an open deal to close. Covered here:
 *
 *   1. a resync request makes the all-deals list refetch and prune it;
 *   2. a socket reconnect and a long-hidden tab request that resync;
 *   3. a close answered "already closed" / "not found" drops the deal and
 *      raises a typed error callers can show as news, not a failure.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import {
  DealNotOpenError,
  toastDealCloseError,
  useCloseDCADeal,
} from '@/hooks/useDealActions';
import {
  HIDDEN_RESYNC_AFTER_MS,
  requestDealResync,
  startDealResyncTriggers,
  stopDealResyncTriggers,
  useDealResyncStore,
} from '@/stores/live/dealResync';
import { botWebSocketManager } from '@/services/websocket/BotWebSocketManager';
import { toast } from '@/lib/toast';
import { CloseDCATypeEnum, DCADealStatusEnum } from '@/types';

const BOT_ID = '6a0000000000000000000001';
const STALE_DEAL = 'deal-closed-while-away';
const LIVE_DEAL = 'deal-still-open';

/** What the server currently reports as open, and how it answers a close. */
let serverOpenDeals: string[] = [];
let closeReason = 'Deal already closed';
let listRequests = 0;

const deal = (id: string) => ({
  _id: id,
  botId: BOT_ID,
  userId: 'u1',
  status: 'open',
  paperContext: false,
  updateTime: 1_700_000_000_000, // long before any snapshot stamp
  symbol: { symbol: 'ETHEUR', baseAsset: 'ETH', quoteAsset: 'EUR' },
});

vi.mock('@/helper/price', () => ({
  default: () => () => {},
  getLocalPrices: () => [],
}));

const noopFetchMultipleFees = async () => [];
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ fetchMultipleFees: noopFetchMultipleFees }),
}));

vi.mock('@/hooks/useUsdRate', () => ({
  useUsdRate: () => ({ rate: 1 }),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string) {
      if (query.includes('closeDCADeal')) {
        return {
          closeDCADeal: { status: 'NOTOK', reason: closeReason, data: null },
        };
      }
      listRequests += 1;
      const result = serverOpenDeals.map(deal);
      return {
        dcaDealList: {
          status: 'OK',
          reason: null,
          total: result.length,
          data: { page: null, totalPages: null, totalResults: null, result },
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderHook<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Probe) as ReactNode
        ) as ReactNode
      )
    );
  });
  return () => {
    if (ref.current === null) throw new Error('hook did not render');
    return ref.current;
  };
}

async function settle(rounds = 30) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const openDealIds = (deals: { _id: string }[]) => deals.map((d) => d._id).sort();

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
};

const emitConnect = () =>
  (
    botWebSocketManager as unknown as {
      emitToSubscribers: (e: { type: string; data: object; timestamp: number }) => void;
    }
  ).emitToSubscribers({ type: 'connect', data: {}, timestamp: Date.now() });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  serverOpenDeals = [STALE_DEAL, LIVE_DEAL];
  closeReason = 'Deal already closed';
  listRequests = 0;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useDealStore.setState({ deals: {}, _hasHydrated: true } as never);
  useDealResyncStore.setState({ nonce: 0 });
});

afterEach(() => {
  stopDealResyncTriggers();
  vi.restoreAllMocks();
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('useDcaDeals — a close event that never landed', () => {
  it('keeps the finished deal until a resync, then prunes it', async () => {
    const get = renderHook(() =>
      useDcaDeals({ terminal: false, status: DCADealStatusEnum.open })
    );
    await settle();
    expect(openDealIds(get().deals)).toEqual([LIVE_DEAL, STALE_DEAL].sort());

    // The deal closes on the server; its socket event is lost.
    serverOpenDeals = [LIVE_DEAL];
    await settle();
    expect(openDealIds(get().deals)).toEqual([LIVE_DEAL, STALE_DEAL].sort());

    const before = listRequests;
    act(() => requestDealResync('test'));
    await settle();

    expect(listRequests).toBe(before + 1);
    expect(openDealIds(get().deals)).toEqual([LIVE_DEAL]);
  });

  it('does not refetch on mount twice because of the resync wiring', async () => {
    renderHook(() => useDcaDeals({ terminal: false, status: DCADealStatusEnum.open }));
    await settle();
    expect(listRequests).toBe(1);
  });
});

describe('resync triggers', () => {
  it('the first connect is not a resync; a reconnect is', () => {
    vi.spyOn(botWebSocketManager, 'getIsConnected').mockReturnValue(false);
    startDealResyncTriggers();

    emitConnect();
    expect(useDealResyncStore.getState().nonce).toBe(0);

    emitConnect();
    expect(useDealResyncStore.getState().nonce).toBe(1);
  });

  it('a tab back after the threshold resyncs; a short blur does not', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    setHidden(false);
    startDealResyncTriggers();

    setHidden(true);
    now += HIDDEN_RESYNC_AFTER_MS - 1;
    setHidden(false);
    expect(useDealResyncStore.getState().nonce).toBe(0);

    setHidden(true);
    now += HIDDEN_RESYNC_AFTER_MS;
    setHidden(false);
    expect(useDealResyncStore.getState().nonce).toBe(1);
  });

  it('stop removes both triggers', () => {
    vi.spyOn(botWebSocketManager, 'getIsConnected').mockReturnValue(true);
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    startDealResyncTriggers();
    stopDealResyncTriggers();

    emitConnect();
    setHidden(true);
    now += HIDDEN_RESYNC_AFTER_MS * 2;
    setHidden(false);
    expect(useDealResyncStore.getState().nonce).toBe(0);
  });
});

describe('useCloseDCADeal — the server says the deal is not open', () => {
  const seedStaleDeal = () =>
    useDealStore.setState({
      deals: { [BOT_ID]: { [STALE_DEAL]: { ...deal(STALE_DEAL), dealType: 'dca' } } },
      _hasHydrated: true,
    } as never);

  const closeStale = async (get: () => ReturnType<typeof useCloseDCADeal>) => {
    let caught: unknown = null;
    await act(async () => {
      try {
        await get().mutateAsync({
          dealId: STALE_DEAL,
          botId: BOT_ID,
          type: CloseDCATypeEnum.closeByMarket,
        });
      } catch (e) {
        caught = e;
      }
    });
    await settle(5);
    return caught;
  };

  it('"Deal already closed" marks it closed, resyncs, and throws DealNotOpenError', async () => {
    seedStaleDeal();
    const get = renderHook(() => useCloseDCADeal());

    const error = await closeStale(get);

    expect(error).toBeInstanceOf(DealNotOpenError);
    expect((error as DealNotOpenError).endedAs).toBe(DCADealStatusEnum.closed);
    expect(useDealStore.getState().deals[BOT_ID]?.[STALE_DEAL]?.status).toBe('closed');
    expect(useDealResyncStore.getState().nonce).toBe(1);
  });

  it('"Deal not found" (older backend) drops it from the store', async () => {
    closeReason = 'Deal not found';
    seedStaleDeal();
    const get = renderHook(() => useCloseDCADeal());

    const error = await closeStale(get);

    expect(error).toBeInstanceOf(DealNotOpenError);
    expect((error as DealNotOpenError).endedAs).toBeNull();
    expect(useDealStore.getState().deals[BOT_ID]?.[STALE_DEAL]).toBeUndefined();
    expect(useDealResyncStore.getState().nonce).toBe(1);
  });

  it('any other refusal stays a plain failure', async () => {
    closeReason = 'Not enough balance';
    seedStaleDeal();
    const get = renderHook(() => useCloseDCADeal());

    const error = await closeStale(get);

    expect(error).not.toBeInstanceOf(DealNotOpenError);
    expect(useDealStore.getState().deals[BOT_ID]?.[STALE_DEAL]?.status).toBe('open');
    expect(useDealResyncStore.getState().nonce).toBe(0);
  });

  it('callers show an already-ended deal as news, other failures as errors', () => {
    const info = vi.spyOn(toast, 'info').mockImplementation(() => undefined as never);
    const err = vi.spyOn(toast, 'error').mockImplementation(() => undefined as never);

    toastDealCloseError(new DealNotOpenError(DCADealStatusEnum.closed), 'Failed to close deal');
    toastDealCloseError(new Error('Not enough balance'), 'Failed to close deal');

    expect(info).toHaveBeenCalledWith(
      'This deal had already closed. The list has been refreshed.'
    );
    expect(err).toHaveBeenCalledWith('Failed to close deal');
  });
});
