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
