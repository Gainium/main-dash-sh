/**
 * Runner: Vitest (jsdom) —
 * `npx vitest run core/tests/pairPickerDialog.vitest.test.tsx`.
 *
 * Spec 115 (parent repo) §4–§6 — the add-pairs dialog as a data table: the
 * bot's anchor arrives as a column filter, pairs the bot can't trade are
 * hidden by "Fits this bot" (and disabled when it's off), and "Select all
 * matching" adds exactly the shown, pickable, not-yet-selected pairs.
 */
import React from 'react';
import { describe, expect, test, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import {
  PairPickerDialog,
  type PairPickerRow,
} from '@/components/widgets/shared/PairPickerDialog';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

// Icons resolve assets through the exchange data context; not under test here.
vi.mock('@/components/widgets/shared/CoinPair', () => ({
  default: () => null,
}));
vi.mock('@/components/widgets/shared/CoinIcon', () => ({
  default: () => null,
}));

const row = (
  base: string,
  quote: string,
  extra: Partial<PairPickerRow> = {}
): PairPickerRow => ({
  symbol: `${base}-${quote}`,
  name: `${base}/${quote}`,
  icon: '',
  color: 'var(--color-primary)',
  baseAsset: base,
  quoteAsset: quote,
  ...extra,
});

const rows: PairPickerRow[] = [
  row('BTC', 'USDT', { minOrder: 5 }),
  row('ETH', 'USDT', { minOrder: 5 }),
  row('XAUT', 'USDT', {
    minOrder: 50,
    fitReason: 'Exchange minimum 50 USDT is above your 10 USDT order',
  }),
  row('SOL', 'USDC', { minOrder: 5 }),
];

const settle = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const shownBases = () =>
  ['BTC', 'ETH', 'XAUT', 'SOL'].filter((b) => screen.queryByText(b) !== null);

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});
beforeEach(() => {
  useTablePreferencesStore.getState().resetAllPreferences();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderDialog = (overrides: Partial<React.ComponentProps<typeof PairPickerDialog>> = {}) => {
  const onAddMany = vi.fn(() => undefined);
  const onItemToggle = vi.fn();
  render(
    <PairPickerDialog
      isOpen
      onClose={() => {}}
      title="Select Pairs"
      rows={rows}
      selectedItems={['BTC-USDT']}
      onItemToggle={onItemToggle}
      onToggleFavorite={() => {}}
      onAddMany={onAddMany}
      anchor={{ dimension: 'quote', asset: 'USDT' }}
      {...overrides}
    />
  );
  return { onAddMany, onItemToggle };
};

describe('spec 115 pair picker dialog', () => {
  test('§5.1 the anchor filters to its quote; §4.3 pairs that do not fit are hidden', async () => {
    renderDialog();
    await settle();
    expect(shownBases()).toEqual(['BTC', 'ETH']);
  });

  test('§4.2 with "Fits this bot" off, an unfit pair shows but cannot be toggled', async () => {
    const { onItemToggle } = renderDialog();
    await settle();
    fireEvent.click(screen.getByRole('switch', { name: 'Fits this bot' }));
    await settle();
    expect(shownBases()).toEqual(['BTC', 'ETH', 'XAUT']);
    fireEvent.click(screen.getByText('XAUT'));
    expect(onItemToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('ETH'));
    expect(onItemToggle).toHaveBeenCalledWith('ETH-USDT');
  });

  test('§6.2 select all matching adds only shown, pickable, unselected pairs', async () => {
    const { onAddMany } = renderDialog();
    await settle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(onAddMany).toHaveBeenCalledWith(['ETH-USDT']);
  });

  test('§6.2 the bulk-add message is shown in the dialog', async () => {
    renderDialog({ onAddMany: () => 'Maximum pairs to choose is 1.' });
    await settle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    await settle();
    expect(screen.getByRole('status').textContent).toMatch(/Maximum pairs/);
  });
});

describe('spec 115 §6.2 select all: the page, then all matching', () => {
  const many = (n: number): PairPickerRow[] =>
    Array.from({ length: n }, (_, i) =>
      row(`C${String(i).padStart(3, '0')}`, 'USDT', { volume24h: n - i })
    );

  test('the header checkbox adds the page, capped at the slots left', async () => {
    const { onAddMany } = renderDialog({
      rows: many(4),
      selectedItems: ['C000-USDT'],
      maxSelectable: 3,
      anchor: null,
    });
    await settle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(onAddMany).toHaveBeenCalledWith(['C001-USDT', 'C002-USDT']);
  });

  test('with no slots left a tick says so instead of adding', async () => {
    const { onAddMany } = renderDialog({
      rows: many(4),
      selectedItems: ['C000-USDT', 'C001-USDT'],
      maxSelectable: 2,
      anchor: null,
    });
    await settle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    await settle();
    expect(onAddMany).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/allows 2 pairs/);
  });

  test('unticking a fully selected page removes it', async () => {
    const onRemoveMany = vi.fn();
    const rows = many(3);
    renderDialog({
      rows,
      selectedItems: rows.map((r) => r.symbol),
      onRemoveMany,
      anchor: null,
    });
    await settle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unselect this page' }));
    expect(onRemoveMany.mock.calls[0][0].sort()).toEqual(
      rows.map((r) => r.symbol).sort()
    );
  });

  test('past the page, the bar selects all matching (in display order)', async () => {
    const rows = many(60); // page size 50
    const onAddMany = vi.fn(() => undefined);
    renderDialog({
      rows,
      selectedItems: rows.slice(0, 50).map((r) => r.symbol),
      onAddMany,
      anchor: null,
      initialSortMode: 'volume',
    });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Select all 60 matching' }));
    expect(onAddMany).toHaveBeenCalledWith(
      rows.slice(50).map((r) => r.symbol)
    );
  });
});

describe('spec 115 §2.4 the list picker controls stay', () => {
  test('sort menu, favourites-first and asset-class chips are present', async () => {
    renderDialog({
      rows: [
        row('BTC', 'USDT', { marketCapRank: 1, volume24h: 9 }),
        row('AAPL', 'USDT', { assetCategory: 'stock' }),
      ],
      anchor: null,
    });
    await settle();
    expect(screen.getByRole('combobox', { name: 'Sort pairs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show favorites first' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stocks' })).toBeTruthy();
  });

  test('§2.4 an asset-class chip filters the list', async () => {
    renderDialog({
      rows: [row('BTC', 'USDT'), row('AAPL', 'USDT', { assetCategory: 'stock' })],
      anchor: null,
    });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Stocks' }));
    await settle();
    expect(screen.queryByText('BTC')).toBeNull();
    expect(screen.queryByText('AAPL')).not.toBeNull();
  });
});

describe('spec 115 §2.2 each opening starts fresh', () => {
  test('a search left from the last opening is cleared', async () => {
    useTablePreferencesStore
      .getState()
      .setGlobalFilter('bot-form-pair-picker', 'ETH');
    renderDialog();
    await settle();
    expect(shownBases()).toEqual(['BTC', 'ETH']);
  });
});

describe('spec 115 §6.1 a tap on a row or a card selects it', () => {
  test('card view: tapping the card toggles the pair', async () => {
    const { onItemToggle } = renderDialog();
    await settle();
    fireEvent.click(screen.getByText('ETH'));
    expect(onItemToggle).toHaveBeenCalledWith('ETH-USDT');
  });

  test('table view: tapping any cell of the row toggles the pair', async () => {
    useTablePreferencesStore
      .getState()
      .setViewMode('bot-form-pair-picker', 'table');
    const { onItemToggle } = renderDialog({
      rows: [row('ETH', 'USDT', { minOrder: 5, volume24h: 9 })],
    });
    await settle();
    const cells = [...document.querySelectorAll('tbody tr td')];
    expect(cells.length).toBeGreaterThan(2);
    cells.forEach((td) => fireEvent.click(td));
    // every cell except the favourite star's own button counts
    expect(onItemToggle.mock.calls.length).toBe(cells.length);
  });
});

describe('spec 115 §1.1 single-pair pickers use the same dialog', () => {
  test('no "Select all matching" when the bot holds one pair', async () => {
    const { onItemToggle } = renderDialog({ singlePick: true, anchor: null });
    await settle();
    expect(screen.queryByRole('checkbox', { name: /Select all/ })).toBeNull();
    fireEvent.click(screen.getByText('ETH'));
    expect(onItemToggle).toHaveBeenCalledWith('ETH-USDT');
  });
});

describe('spec 115 §3.4 column naming', () => {
  test('the ROI column is Curated Strat. ROI', async () => {
    useTablePreferencesStore
      .getState()
      .setViewMode('bot-form-pair-picker', 'table');
    renderDialog({ rows: [row('ETH', 'USDT', { roi: 12 })], anchor: null });
    await settle();
    const headers = [...document.querySelectorAll('thead th')].map((t) =>
      t.textContent?.trim()
    );
    expect(headers).toContain('Curated Strat. ROI');
  });
});

describe('spec 115 §2.1 cards show the exchange limits', () => {
  test('a card carries min order and the leverage range (min–max×)', async () => {
    renderDialog({
      rows: [
        row('ETH', 'USDT', { minOrder: 5, minLeverage: 1, maxLeverage: 100 }),
        row('SOL', 'USDT', { minOrder: 5, maxLeverage: 50 }),
      ],
      anchor: null,
    });
    await settle();
    expect(screen.getByText('Min 5 USDT · 1–100×')).toBeTruthy();
    expect(screen.getByText('Min 5 USDT · Up to 50×')).toBeTruthy();
  });

  test('the table has a Min leverage and a Max leverage column', async () => {
    useTablePreferencesStore
      .getState()
      .setViewMode('bot-form-pair-picker', 'table');
    renderDialog({
      rows: [row('ETH', 'USDT', { minLeverage: 1, maxLeverage: 100 })],
      anchor: null,
    });
    await settle();
    const headers = [...document.querySelectorAll('thead th')].map((t) =>
      t.textContent?.trim()
    );
    expect(headers).toContain('Min leverage');
    expect(headers).toContain('Max leverage');
  });
});

describe('spec 115 §3 column names match the headers', () => {
  test('the class column is Asset class', async () => {
    useTablePreferencesStore
      .getState()
      .setViewMode('bot-form-pair-picker', 'table');
    useTablePreferencesStore
      .getState()
      .setColumnVisibility('bot-form-pair-picker', { assetCategory: true });
    renderDialog({ anchor: null });
    await settle();
    const headers = [...document.querySelectorAll('thead th')].map((t) =>
      t.textContent?.trim()
    );
    expect(headers).toContain('Asset class');
  });
});

describe('spec 115 §6.3 clear selection', () => {
  test('removes every selected pair in one call', async () => {
    const onRemoveMany = vi.fn();
    renderDialog({ selectedItems: ['BTC-USDT', 'ETH-USDT'], onRemoveMany });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onRemoveMany).toHaveBeenCalledWith(['BTC-USDT', 'ETH-USDT']);
  });

  test('not offered on a single-pair picker', async () => {
    renderDialog({ singlePick: true, onRemoveMany: vi.fn() });
    await settle();
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  });
});
