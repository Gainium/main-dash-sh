/**
 * Runner note: renders a React hook in jsdom, so it is a Vitest file. Run from
 * the parent with `NODE_ENV=development` (a production React build has no
 * `React.act`):
 * `NODE_ENV=development npx vitest run core/tests/gridSettingsTabKeepsChartOrders.vitest.test.tsx`
 *
 * Spec: `main-dash-redesign/specs/086.grid-settings-tab-wipes-chart-grid-lines.md`.
 *
 * The bot drawer puts a grid bot's open orders into the shared example-orders
 * store for the chart. Its Settings tab renders the grid form sections in a
 * `settings-readonly` form, and `useGridForm` pushed the latest price into the
 * same store; every push schedules a recompute that, with no form settings
 * behind it, replaced the drawer's orders with nothing (§3). A read-only form
 * must leave the store alone (§1.1); an editable one still feeds it (§1.2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { BotOrderSideEnum, type DCAGrid } from '@/types';

const PAIR = 'PUMPBTCUSDT';
const PRICE = 0.0412;
let mode = 'settings-readonly';

vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useTrackedBotFormState: () => ({
    mode,
    formData: {
      pair: [PAIR],
      pairMetadata: {
        [PAIR]: {
          pair: PAIR,
          exchange: 'paperBinanceUsdm',
          quoteAsset: { name: 'USDT' },
        },
      },
    },
  }),
}));
vi.mock('@/contexts/bots/grid/GridPageProvider', () => ({
  useOptionalGridPageContext: () => undefined,
}));
vi.mock('@/helper/price', () => ({
  default: (cb: (d: { data: unknown[] }) => void) => {
    cb({
      data: [{ symbol: PAIR, exchange: 'paperBinanceUsdm', price: PRICE }],
    });
    return () => {};
  },
  getLocalPrices: () => [],
}));

const Probe = () => {
  useGridForm();
  return null;
};

const drawerOrders: DCAGrid[] = Array.from({ length: 15 }, (_, i) => ({
  qty: 1687,
  price: 0.04 + i * 0.0002,
  side: i < 10 ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
  id: `grid-${i}`,
})) as unknown as DCAGrid[];

let root: Root | null = null;
const mount = async () => {
  const el = document.createElement('div');
  const r = createRoot(el);
  root = r;
  await act(async () => {
    r.render(<Probe />);
  });
  // The store recomputes on a microtask after each setContext.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  exampleOrdersStore.reset();
});

describe('§1.1 read-only grid settings leave the chart orders alone', () => {
  it('keeps the drawer-owned grid orders after the Settings tab mounts', async () => {
    mode = 'settings-readonly';
    exampleOrdersStore.setOrders(drawerOrders);
    let seen: DCAGrid[] = [];
    exampleOrdersStore.subscribe((o) => (seen = o));

    await mount();

    expect(seen).toHaveLength(15);
  });
});

describe('§1.2 an editable grid form still feeds the store', () => {
  it('pushes the latest price in edit mode', async () => {
    mode = 'edit';
    await mount();
    expect(exampleOrdersStore.getInputLatestPrice()).toBe(PRICE);
  });
});
