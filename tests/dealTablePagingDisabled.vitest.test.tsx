/**
 * Runner note: `.vitest.test.tsx` (renders a hook, mocks its data hooks). Run
 * from the parent:
 * `NODE_ENV=development npx vitest run core/tests/dealTablePagingDisabled.vitest.test.tsx`.
 *
 * Spec 132 §3: a disabled `useDealTablePaging` is never server-paged, even
 * when the caller forces server paging. The bot drawer passes
 * `enabled: <large account>, force: true`; a server-side config returned while
 * disabled put the drawer's client-side rows into manual sorting, so a header
 * click flipped the arrow and never reordered the rows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

const mode = vi.hoisted(() => ({ largeAccount: false }));

const emptyList = {
  data: undefined,
  deals: [],
  isPartial: false,
  isLoading: false,
  isFetching: false,
  loadedCount: 0,
  total: 0,
  error: null,
};

vi.mock('../src/hooks/useDcaDeals', () => ({
  useDcaDeals: () => emptyList,
  fetchAllDcaDeals: async () => [],
}));
vi.mock('../src/hooks/useLargeAccount', () => ({
  useLargeAccount: () => ({ active: mode.largeAccount }),
}));
vi.mock('../src/hooks/useLiveDealPnl', () => ({
  useDealsWithLivePnl: (deals: unknown[]) => deals,
}));
vi.mock('../src/hooks/useDealListServerSupport', () => ({
  useDealFilterBackend: () => 'old',
  useDealListTotals: () => null,
}));
vi.mock('../src/hooks/useAccountTimeZone', () => ({
  useAccountTimeZone: () => 'UTC',
}));

import { useDealTablePaging } from '../src/hooks/useDealTablePaging';

const drawerOpts = (enabled: boolean) => ({
  status: 'open' as const,
  terminal: false,
  botId: 'bot-1',
  tableId: 'drawer-test-active-deals',
  enabled,
  force: true,
});

afterEach(() => {
  cleanup();
  mode.largeAccount = false;
});

describe('useDealTablePaging — enabled gates server mode (spec 132)', () => {
  it('§3 disabled + forced: client mode, no server-side config for the table', () => {
    const { result } = renderHook(() => useDealTablePaging(drawerOpts(false)));
    expect(result.current.serverPaged).toBe(false);
    expect(result.current.serverPaging).toBeUndefined();
  });

  it('§3 disabled even when the account is large: still client mode', () => {
    mode.largeAccount = true;
    const { result } = renderHook(() => useDealTablePaging(drawerOpts(false)));
    expect(result.current.serverPaging).toBeUndefined();
  });

  it('§4 enabled + forced (large-account drawer): server-paged as before', () => {
    mode.largeAccount = true;
    const { result } = renderHook(() => useDealTablePaging(drawerOpts(true)));
    expect(result.current.serverPaged).toBe(true);
    expect(result.current.serverPaging?.serverSide).toBeDefined();
  });
});
