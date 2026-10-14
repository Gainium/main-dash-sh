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
    fireEvent.click(screen.getByRole('button', { name: /Select all matching/ }));
    expect(onAddMany).toHaveBeenCalledWith(['ETH-USDT']);
  });

  test('§6.2 the bulk-add message is shown in the dialog', async () => {
    renderDialog({ onAddMany: () => 'Maximum pairs to choose is 1.' });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Select all matching/ }));
    await settle();
    expect(screen.getByRole('status').textContent).toMatch(/Maximum pairs/);
  });
});

describe('spec 115 §6.2 plan limit and order', () => {
  const many: PairPickerRow[] = [
    row('AAA', 'USDT', { volume24h: 1 }),
    row('BBB', 'USDT', { volume24h: 300 }),
    row('CCC', 'USDT', { volume24h: 200 }),
    row('DDD', 'USDT', { volume24h: 100 }),
  ];

  test('the count is capped at the slots left, and the first shown pairs are added', async () => {
    const { onAddMany } = renderDialog({
      rows: many,
      selectedItems: ['AAA-USDT'],
      maxSelectable: 3,
      initialSortMode: 'volume',
    });
    await settle();
    const button = screen.getByRole('button', { name: /Select all matching/ });
    expect(button.textContent).toMatch(/\(2\)/);
    fireEvent.click(button);
    expect(onAddMany).toHaveBeenCalledWith(['BBB-USDT', 'CCC-USDT']);
  });

  test('with no slots left it is disabled', async () => {
    renderDialog({
      rows: many,
      selectedItems: ['AAA-USDT', 'BBB-USDT'],
      maxSelectable: 2,
    });
    await settle();
    expect(
      (screen.getByRole('button', { name: /Select all matching/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
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
    expect(screen.queryByRole('button', { name: /Select all matching/ })).toBeNull();
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
