/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/listModalWindowing.vitest.test.tsx
 *
 * specs/066 §1.9 — the pair picker renders only the rows around the visible
 * window (a venue can list thousands of pairs), and search still finds any
 * pair of the full list, in any of its spellings.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Row artwork is not under test; keep the rows free of the exchange context.
vi.mock('@/components/widgets/shared/CoinPair', () => ({
  default: () => null,
}));
vi.mock('@/components/widgets/shared/CoinIcon', () => ({
  default: () => null,
}));

import { ListModal } from '@/components/widgets/shared/ListModal';

const ITEMS = Array.from({ length: 2000 }, (_, i) => {
  const base = `C${String(i).padStart(4, '0')}`;
  return {
    symbol: `${base}-USDT`,
    name: `${base}/USDT`,
    baseAsset: base,
    quoteAsset: 'USDT',
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const rows = () =>
  document.body.querySelectorAll('[data-testid="list-modal-content"] .rounded-lg.transition-colors');

const mount = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(
      createElement(ListModal, {
        isOpen: true,
        onClose: () => undefined,
        title: 'Select pair',
        items: ITEMS,
        selectedItems: [],
        onItemToggle: () => undefined,
      })
    );
  });
};

const type = async (value: string) => {
  const input = document.body.querySelector(
    '[data-testid="list-modal-content"] input[type="text"]'
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('pair picker windowing (specs/066 §1.9)', () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('mounts a window of rows, not the whole list', async () => {
    await mount();
    const count = rows().length;
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(60);
  });

  it('search reaches rows far outside the window, in every spelling', async () => {
    await mount();
    for (const query of ['C1999', 'c1999/usdt', 'C1999USDT', 'c1999-usdt']) {
      // eslint-disable-next-line no-await-in-loop
      await type(query);
      const text = document.body.querySelector(
        '[data-testid="list-modal-content"]'
      )?.textContent;
      expect(text).toContain('C1999');
      expect(rows().length).toBe(1);
    }
  });
});
