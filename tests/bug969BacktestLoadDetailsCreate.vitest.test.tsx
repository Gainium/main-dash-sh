/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug969BacktestLoadDetailsCreate.vitest.test.tsx
 *
 * "Load Details" on a backtest row of a NEW-bot page switched the insights
 * panel to a `bt-overview` tab that no longer exists (results moved into the
 * full-screen modal), so the panel went blank and no results opened. The edit
 * page already opened the modal. See specs/060.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const captured = vi.hoisted(() => ({
  ctx: null as null | { onLoadDetails: (bt: unknown) => Promise<void> | void },
}));

vi.mock('@/components/ui/data-table/data-table', () => ({
  DataTable: () => 'BACKTEST-TABLE',
}));

vi.mock('@/components/widgets/bots/backtest/redesign', () => ({
  BacktestResultsFullModal: ({
    open,
    result,
  }: {
    open: boolean;
    result: { _id: string };
  }) => (open ? `RESULTS-MODAL:${result._id}` : null),
  RedesignOverviewTab: () => null,
  RedesignDealsTab: () => null,
  buildBacktestViewModel: () => null,
}));

vi.mock('@/components/widgets/bots/backtest', () => ({
  BacktestAnalysisTab: () => null,
  BacktestStatsTab: () => null,
  ShareBacktestButton: () => null,
}));

vi.mock('@/hooks/useBacktestDataManagement', () => {
  const m = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => ({})) });
  return {
    useDeleteBacktests: m,
    useExportBacktests: m,
    useImportBacktestAsPaper: m,
    useLoadBacktestDetails: m,
    useShareBacktest: m,
  };
});
vi.mock('@/hooks/useBacktests', () => ({
  useBacktests: () => ({ backtests: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/useBacktestsSummary', () => ({
  useBacktestsSummary: () => ({ subtitle: undefined }),
}));
vi.mock('@/hooks/useSetBacktestNote', () => ({
  useSetBacktestNote: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useShareContext', () => ({
  useShareContext: () => ({ backtestShareId: null }),
}));

import { BotBacktestPanel } from '@/components/bots/panels/contents/insights/BotBacktestPanel';

const row = {
  _id: 'bt1',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  settings: { name: 'Backtested bot' },
  deals: [{}],
};

const descriptor = {
  kind: 'dca',
  shareSubKind: 'dca',
  sharePath: 'bot',
  noteType: 'dca',
  tableId: { create: 't-create', edit: 't-edit' },
  tabKey: 'backtests',
  tabTitle: 'Backtests',
  useLinkedSummary: false,
  resultStrategy: 'DCA',
  useList: () => ({ backtests: [row], isLoading: false, error: null }),
  buildColumns: (ctx: never) => {
    captured.ctx = ctx;
    return [];
  },
  getByShareId: () => ({ query: '', variables: {} }),
} as never;

function Page({ mode }: { mode: 'create' | 'edit' }) {
  const [tab, setTab] = useState('backtests');
  return createElement(
    BotBacktestPanel as never,
    {
      descriptor,
      mode,
      activeInsightsTab: tab,
      onActiveInsightsTabChange: setTab,
      onLoadBacktestIntoForm: () => undefined,
    } as never,
    ({ insights }: { insights: unknown }) =>
      createElement('div', { 'data-tab': tab }, insights as never)
  );
}

// jsdom has no ResizeObserver (the insights Tabs measure their indicator).
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  captured.ctx = null;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

describe('bug 969: "Load Details" opens the backtest results (specs/060)', () => {
  for (const mode of ['create', 'edit'] as const) {
    it(`§3 ${mode} page: Load Details opens the results modal and keeps the backtests tab`, async () => {
      await act(async () => {
        root.render(
          createElement(MemoryRouter, null, createElement(Page, { mode }))
        );
      });
      expect(container.textContent).not.toContain('RESULTS-MODAL');
      expect(container.textContent).toContain('BACKTEST-TABLE');

      await act(async () => {
        await captured.ctx?.onLoadDetails(row);
      });

      expect(container.textContent).toContain('RESULTS-MODAL:bt1');
      // The panel behind the modal is not blanked out.
      expect(container.textContent).toContain('BACKTEST-TABLE');
      expect(
        container.querySelector('[data-tab]')?.getAttribute('data-tab')
      ).toBe('backtests');
    });
  }
});
