import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * The bot details drawer also asks for a hedge bot's "other leg" orders; for
 * every non-hedge bot that id is ''. `useBotOrders('')` disabled the query but
 * still read `orders[type]['']` from the store, and anything ever filed under
 * the empty id was merged into the shown bot's orders — the drawer then
 * auto-selected that foreign order's pair for the chart.
 */

vi.mock('../src/hooks/useGraphQL', () => ({
  useGraphQL: (
    key: string,
    gql: { variables: unknown },
    options: Record<string, unknown>
  ) =>
    useQuery({
      ...options,
      queryKey: [key, JSON.stringify(gql.variables)],
      queryFn: () => new Promise(() => undefined),
    }),
}));

import { queryClient } from '@/lib/queryClient';
import { useOrderStore } from '@/stores/live';
import type { OrderData } from '@/types';
import { useBotOrders } from '../src/hooks/useBotOrders';

const foreignOrder = {
  clientOrderId: 'other-bot-1',
  botId: 'otherBot',
  dealId: 'otherDeal',
  symbol: 'RMCDUSDT',
  price: '1',
  origQty: '1',
  executedQty: '1',
  side: 'BUY',
  status: 'FILLED',
  time: 1,
  updateTime: 1,
  type: 'LIMIT',
} as unknown as OrderData;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  queryClient.clear();
  useOrderStore.getState().clearAllOrders();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('orders filed under an empty bot id', () => {
  test('the store refuses to file orders under an empty bot id', () => {
    const store = useOrderStore.getState();
    store.updateOrders('', [foreignOrder], 'filled');
    store.updateOrder('', foreignOrder, 'filled');
    store.updateOrderFromWebSocket(
      { botId: '', data: foreignOrder } as never,
      'filled'
    );
    expect(useOrderStore.getState().orders.filled['']).toBeUndefined();
  });

  test("an empty id reads nothing, even when a bucket for '' exists", async () => {
    useOrderStore.setState((s) => ({
      orders: {
        ...s.orders,
        filled: { '': { [foreignOrder.clientOrderId]: foreignOrder } },
      },
    }));

    function Harness() {
      const { orders, hasValidResponse } = useBotOrders('', undefined, {
        status: 'FILLED',
      });
      return createElement(
        'output',
        null,
        JSON.stringify({ count: orders.length, hasValidResponse })
      );
    }
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(Harness)
          )
        )
      );
    });

    expect(JSON.parse(host.textContent ?? '')).toEqual({
      count: 0,
      hasValidResponse: false,
    });
  });
});
