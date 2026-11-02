/**
 * Runner note: Vitest (jsdom), run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/bug1508VariablePickerAllAndSearch.vitest.test.tsx`
 *
 * Spec `specs/143.variable-picker-truncated-and-search-broken.md`.
 * The fake GraphQLClient behaves like prod `getGlobalVariables`: it honours
 * page/pageSize and the type filter, and rejects a `search` field with the
 * same BAD_USER_INPUT the server's `GetGlobalVariablesInput` produces.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const requests: Array<Record<string, unknown>> = [];

// The reporter's shape: 4 int + 28 float, prod order (newest first).
const VARS = [
  ...['cool_down', 'max_deal', 'over_v', 'under_v'].map((n) => ({
    name: n,
    type: 'int',
  })),
  ...[
    ...['main_vol', 'gain_vol', 'binance_vol', 'bitget_vol', 'bitget_order'],
    ...['trade_order', 'profit_order', 'invest_order', 'gbit_order'],
    ...['mbit_order', 'bin_order'],
    ...Array.from({ length: 16 }, (_, i) => `SO-${16 - i}`),
    'min_tp',
  ].map((n) => ({ name: n, type: 'float' })),
].map((v, i) => ({ id: `id${i}`, value: '1', botAmount: 0, ...v }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  class FakeClient {
    async request(_q: string, variables: { input: Record<string, unknown> }) {
      const input = variables.input;
      requests.push(input);
      if ('search' in input) {
        throw new Error(
          'Field "search" is not defined by type "GetGlobalVariablesInput".'
        );
      }
      const items =
        (input['filterModel'] as { items: { value: string }[] } | undefined)
          ?.items ?? [];
      let rows = VARS;
      for (const f of items) rows = rows.filter((r) => r.type === f.value);
      const page = (input['page'] as number) ?? 0;
      const size = (input['pageSize'] as number) ?? 10000;
      return {
        getGlobalVariables: {
          status: 'OK',
          reason: null,
          total: rows.length,
          data: rows.slice(page * size, (page + 1) * size),
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeClient };
});

import { VariableSearch } from '@/components/global-variables/GlobalVariableSearch';
import { useAuthStore } from '@/stores/authStore';
import type { VarToSearchType } from '@/types';

const renderPicker = (varType: VarToSearchType) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VariableSearch varType={varType} onSelect={() => {}} />
    </QueryClientProvider>
  );

beforeEach(() => {
  requests.length = 0;
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
  } as never);
});
afterEach(() => cleanup());

describe('bug #1508 — bot-form variable picker', () => {
  test('§1.1 a number picker lists every number variable', async () => {
    renderPicker('number');
    await screen.findByText('SO-1');
    for (const n of ['SO-7', 'SO-3', 'min_tp', 'under_v', 'cool_down']) {
      expect(screen.getByText(n)).toBeTruthy();
    }
  });

  test('§1.2 search finds SO-3 and never sends search', async () => {
    renderPicker('number');
    await screen.findByText('SO-16');
    fireEvent.change(screen.getByPlaceholderText('Search variables...'), {
      target: { value: 'so-3' },
    });
    await waitFor(() => expect(screen.queryByText('SO-16')).toBeNull());
    expect(screen.getByText('SO-3')).toBeTruthy();
    expect(screen.queryByText('No variables found')).toBeNull();
    expect(requests.some((r) => 'search' in r)).toBe(false);
  });

  test('type rule kept: a float picker hides int variables', async () => {
    renderPicker('float');
    await screen.findByText('min_tp');
    expect(screen.queryByText('cool_down')).toBeNull();
    expect(screen.getByText('SO-1')).toBeTruthy();
  });
});
