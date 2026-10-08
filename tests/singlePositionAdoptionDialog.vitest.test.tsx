/**
 * Runner note: Vitest-only (renders in jsdom). Run from the parent:
 * `npx vitest run core/tests/singlePositionAdoptionDialog.vitest.test.tsx`.
 *
 * The confirmation shown before open deals are folded into one position per
 * pair: one row per pair with the before → after figures, the
 * irreversibility sentence, and Confirm / Cancel wired to their callbacks.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SinglePositionAdoptionDialog } from '@/components/deals/SinglePositionAdoptionDialog';
import {
  ADOPTION_IRREVERSIBLE_SENTENCE,
  buildAdoptionPreview,
  type AdoptionPreviewRow,
  type PreviewDeal,
} from '@/lib/singlePosition/singlePosition';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const rowsInput: PreviewDeal[] = [
    {
      _id: 'old',
      symbol: 'BTCUSDT',
      createTime: 1,
      avgPrice: 100,
      strategy: 'LONG',
      initialBalances: { base: 0 },
      currentBalances: { base: 1 },
      levels: { all: 1, complete: 1 },
    },
    {
      _id: 'new',
      symbol: 'BTCUSDT',
      createTime: 2,
      avgPrice: 120,
      strategy: 'LONG',
      initialBalances: { base: 0 },
      currentBalances: { base: 1 },
      levels: { all: 1, complete: 1 },
    },
  ];
const bot = { strategy: 'LONG', tpPerc: '1', useTp: true };
const rows = buildAdoptionPreview(rowsInput, bot);

const render = (
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
  shown: AdoptionPreviewRow[] = rows
) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(SinglePositionAdoptionDialog, {
        open: true,
        rows: shown,
        baseAssetOf: () => 'BTC',
        onConfirm,
        onCancel,
      })
    );
  });
  return { onConfirm, onCancel };
};

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;

describe('SinglePositionAdoptionDialog', () => {
  it('lists each pair with before → after and the irreversibility sentence', () => {
    render();
    const text = document.body.textContent ?? '';
    expect(text).toContain('BTCUSDT — 2 deals → 1 position');
    expect(text).toContain('1 → 2 BTC');
    expect(text).toContain('100 → 110');
    // No resting TP loaded: the old TP is an estimate too, and says so.
    expect(text).toContain('101 (est.) → 111.1 (est.)');
    expect(text).toContain(ADOPTION_IRREVERSIBLE_SENTENCE);
  });

  it('shows a loaded resting TP as is, without the estimate mark', () => {
    const [oldest, newer] = rowsInput as [PreviewDeal, PreviewDeal];
    render(
      vi.fn(),
      vi.fn(),
      buildAdoptionPreview([{ ...oldest, restingTpPrice: 101.08 }, newer], bot)
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('101.08 → 111.188 (est.)');
  });

  it('Confirm and Cancel call their handlers', () => {
    const { onConfirm, onCancel } = render();
    act(() => button('Confirm')?.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => button('Cancel')?.click());
    expect(onCancel).toHaveBeenCalled();
  });
});
