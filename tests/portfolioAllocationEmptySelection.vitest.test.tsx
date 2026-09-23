/**
 * Runner note: `.vitest.test.tsx` (not `.unit.test.ts`) because this renders the
 * real widget in jsdom and mocks modules. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/portfolioAllocationEmptySelection.vitest.test.tsx`.
 * (`NODE_ENV=development` is required where the shell exports
 * `NODE_ENV=production`: React's production build has no `act`.)
 *
 * Portfolio Allocation widget, persisted exchange selection `[]`.
 *
 * The widget header (`buildExchangeDisplay`) reads `[]` as "All exchanges",
 * but the widget itself only showed everything when the list contained `'ALL'`
 * — so `[]` filtered every asset out and rendered "No portfolio data
 * available" under an "All exchanges" title. The loading / empty branches also
 * handed `WidgetWrapper` a blank placeholder instead of the exchange filter,
 * so the control that could repair the selection was missing exactly when the
 * widget was empty.
 *
 * The observation point is the rendered widget plus the `filterContent`
 * `WidgetWrapper` receives, because that is what the user sees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const EX_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const EX_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const gql = vi.hoisted(() => ({
  state: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
  },
}));

vi.mock('../src/hooks/useGraphQL', () => ({
  useGraphQL: () => gql.state,
}));

vi.mock('../src/contexts/ExchangeDataContext', () => ({
  useTransformedExchangesFromContext: () => ({
    exchanges: [
      { id: 'ALL', name: 'All Exchanges' },
      { id: EX_A, name: 'Paper Kraken', provider: 'paperKraken' },
      { id: EX_B, name: 'Paper Binance', provider: 'paperBinance' },
    ],
  }),
}));

vi.mock('../src/components/widgets/dashboard/index', () => ({
  getWidgetMetadata: () => ({ type: 'portfolio-allocation' }),
}));

vi.mock('../src/components/widgets/shared/ListModal', () => ({
  ListModal: () => null,
}));

// WidgetWrapper stand-in: renders the widget body and the filter area it was
// given, exactly the two things WidgetWrapper puts on screen.
vi.mock('../src/components/widgets/WidgetWrapper', () => ({
  default: ({
    children,
    metadata,
  }: {
    children: ReactNode;
    metadata: { filterContent?: ReactNode };
  }) =>
    createElement(
      'div',
      null,
      createElement('div', { 'data-testid': 'body' }, children),
      createElement('div', { 'data-testid': 'filters' }, metadata.filterContent)
    ),
}));

import { PortfolioAllocation } from '../src/components/widgets/dashboard/PortfolioAllocation';
import { useWidgetSettingsStore } from '../src/stores/widgetSettingsStore';

const WIDGET_ID = 'portfolio-allocation-test';

const withData = () => ({
  status: 'OK',
  reason: null,
  data: {
    result: [
      {
        updateTime: 1790000000000,
        totalUsd: 300,
        assets: [
          {
            name: 'usdc',
            amount: 200,
            amountUsd: 200,
            exchanges: [{ uuid: EX_A, amount: 200, amountUsd: 200 }],
          },
          {
            name: 'btc',
            amount: 1,
            amountUsd: 100,
            exchanges: [{ uuid: EX_B, amount: 1, amountUsd: 100 }],
          },
        ],
      },
    ],
  },
});

let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => {
    root.render(createElement(PortfolioAllocation, { widgetId: WIDGET_ID }));
  });
};
const body = () =>
  container.querySelector('[data-testid="body"]')?.textContent ?? '';
const filters = () =>
  container.querySelector('[data-testid="filters"]')?.textContent ?? '';

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useWidgetSettingsStore.setState({ settings: {} });
  gql.state = { data: withData(), isLoading: false, error: null };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const setSelection = (value: string[]) =>
  useWidgetSettingsStore
    .getState()
    .setWidgetSetting(WIDGET_ID, 'selectedExchanges', value);

describe('Portfolio Allocation — empty exchange selection', () => {
  it('§5.1 renders the whole portfolio when the stored selection is []', async () => {
    setSelection([]);
    await render();
    expect(body()).not.toContain('No portfolio data available');
    expect(body()).toContain('$300.00');
    expect(body()).toContain('Total');
  });

  it('§5.2 shows the "All exchanges" chip for a stored []', async () => {
    setSelection([]);
    await render();
    expect(filters()).toContain('All exchanges');
    expect(filters()).toContain('Add exchanges');
  });

  it('§5.3 keeps the exchange filter when there is no data', async () => {
    gql.state = {
      data: { status: 'OK', reason: null, data: { result: [] } },
      isLoading: false,
      error: null,
    };
    await render();
    expect(body()).toContain('No portfolio data available');
    expect(filters()).toContain('Add exchanges');
  });

  it('§5.4 keeps the exchange filter while loading', async () => {
    gql.state = { data: undefined, isLoading: true, error: null };
    await render();
    expect(body()).toContain('Loading portfolio data');
    expect(filters()).toContain('Add exchanges');
  });

  it('§5.5 a non-empty selection still totals only the selected exchange', async () => {
    setSelection([EX_A]);
    await render();
    expect(body()).toContain('$200.00');
    expect(body()).not.toContain('$300.00');
  });
});
