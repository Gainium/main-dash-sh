/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/coinIconCache.vitest.test.tsx
 *
 * specs/066 §1.9 — a coin icon is resolved once per session. A second mount of
 * the same coin (a table re-render, the pair picker reopening), or the same
 * coin once its asset class / venue has been filled in, renders the icon
 * straight away: no "..." placeholder, no second network probe.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import CoinIcon from '@/components/widgets/shared/CoinIcon';

const loads: string[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(value: string) {
    loads.push(value);
    // The placeholder is 10×10, real logos 64×64.
    const isPlaceholder = value.includes('not-exist');
    this.naturalWidth = isPlaceholder ? 10 : 64;
    this.naturalHeight = isPlaceholder ? 10 : 64;
    queueMicrotask(() => this.onload?.());
  }
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const OriginalImage = globalThis.Image;

const render = async (node: ReturnType<typeof createElement>) => {
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const r = root as Root;
  await act(async () => {
    r.render(node);
  });
};

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe('CoinIcon session cache (specs/066 §1.9)', () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { Image: unknown }).Image = FakeImage;
    loads.length = 0;
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    (globalThis as { Image: unknown }).Image = OriginalImage;
  });

  it('a known coin renders its icon on the first frame, with no new probe', async () => {
    await render(createElement(CoinIcon, { symbol: 'ZZTESTA' }));
    await flush();
    expect(host?.querySelector('img')?.getAttribute('src')).toContain(
      '/coins/zztesta.png'
    );
    const probes = loads.length;

    // Remount (a table re-render) — and with the class / venue filled in, as
    // happens once the pair list has loaded.
    await render(createElement('div'));
    await render(
      createElement(CoinIcon, {
        symbol: 'ZZTESTA',
        assetClass: 'crypto',
        exchange: 'bybit',
      })
    );
    expect(host?.textContent).not.toContain('...');
    expect(host?.querySelector('img')?.getAttribute('src')).toContain(
      '/coins/zztesta.png'
    );
    await flush();
    expect(loads.length).toBe(probes);
  });

  it('the placeholder image is loaded once, not beside every probe', async () => {
    await render(
      createElement('div', null, [
        createElement(CoinIcon, { key: 'a', symbol: 'ZZTESTB' }),
        createElement(CoinIcon, { key: 'b', symbol: 'ZZTESTC' }),
        createElement(CoinIcon, { key: 'c', symbol: 'ZZTESTD' }),
      ])
    );
    await flush();
    expect(loads.filter((l) => l.includes('not-exist')).length).toBeLessThanOrEqual(1);
  });
});
