/**
 * Runner: Vitest (jsdom). From the cloud parent:
 * `npx vitest run core/tests/largeAccountPrimitives.vitest.test.tsx`.
 *
 * Spec: specs/065.large-account-ui-and-bot-list-paging.md §4, §5 (parent repo).
 * NotCalculated / PartialCount render contract, the large-account state
 * resolution (old backend ⇒ off, local flag only forces ON), and the single
 * server-sort helper (the server's sort direction is inverted).
 */
import { describe, expect, it, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { NotCalculated } from '@/components/ui/large-account/NotCalculated';
import { PartialCount } from '@/components/ui/large-account/PartialCount';
import {
  formatCount,
  readLocalForceOn,
  resolveLargeAccount,
  type LargeAccountServerData,
} from '@/lib/largeAccount/largeAccount';
import { toServerSortModel } from '@/lib/api/serverSort';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
function render(el: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('NotCalculated (§5.1)', () => {
  it('renders an em-dash and a "Large account" chip, never 0 or empty', () => {
    const el = render(createElement(NotCalculated));
    expect(el.textContent).toContain('—');
    expect(el.textContent).toContain('Large account');
    expect(el.textContent).not.toMatch(/\b0\b/);
    expect(el.querySelector('[data-testid="large-account-chip"]')).not.toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  it('offers "Calculate now" only with a callback, shows progress, then recovers', async () => {
    let resolve!: () => void;
    let calls = 0;
    const onCalculate = () => {
      calls++;
      return new Promise<void>((r) => (resolve = r));
    };
    const el = render(createElement(NotCalculated, { onCalculate }));
    const btn = el.querySelector('button')!;
    expect(btn.textContent).toBe('Calculate now');
    await act(async () => btn.click());
    expect(el.querySelector('button')!.textContent).toContain('Calculating');
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    // A second click while running does not start a second computation.
    await act(async () => (el.querySelector('button') as HTMLButtonElement).click());
    expect(calls).toBe(1);
    await act(async () => resolve());
    expect(el.querySelector('button')!.textContent).toBe('Calculate now');
  });

  it('reports a failed calculation and lets the user retry', async () => {
    const el = render(
      createElement(NotCalculated, { onCalculate: () => Promise.reject(new Error('x')) })
    );
    await act(async () => el.querySelector('button')!.click());
    expect(el.querySelector('button')!.textContent).toContain("Couldn't calculate");
  });
});

describe('PartialCount (§5.2)', () => {
  it('renders "shown of total" with grouped thousands', () => {
    const el = render(createElement(PartialCount, { shown: 500, total: 1497, noun: 'bots' }));
    expect(el.textContent).toBe('500 of 1,497');
  });

  it('renders nothing when the set is complete', () => {
    const el = render(createElement(PartialCount, { shown: 6, total: 6 }));
    expect(el.textContent).toBe('');
    const el2 = render(createElement(PartialCount, { shown: 7, total: 6 }));
    expect(el2.textContent).toBe('');
  });
});

const serverData = (over: Partial<LargeAccountServerData> = {}): LargeAccountServerData => ({
  active: false,
  source: 'auto',
  reason: null,
  override: 'auto',
  overrideBy: null,
  canUserEnable: true,
  canUserRevert: false,
  paperContext: false,
  counts: { activeBots: 10, openDeals: 20, terminalBots: 0 },
  thresholds: {
    activeBots: { enter: 400, leave: 320 },
    openDeals: { enter: 1000, leave: 800 },
    terminalBots: { enter: 1000, leave: 800 },
  },
  computedAt: null,
  ...over,
});

describe('resolveLargeAccount (§4)', () => {
  it('an old backend (no data, query failed) resolves to OFF, not an error', () => {
    const s = resolveLargeAccount({ data: null, failed: true });
    expect(s.active).toBe(false);
    expect(s.source).toBe('unsupported');
    expect(s.canUserEnable).toBe(true);
  });

  it('follows the server flag', () => {
    const s = resolveLargeAccount({ data: serverData({ active: true, reason: 'bots' }) });
    expect(s.active).toBe(true);
    expect(s.reason).toBe('bots');
    expect(s.canUserEnable).toBe(false);
  });

  it('the local flag forces ON, but never OFF', () => {
    expect(resolveLargeAccount({ data: serverData(), localForceOn: true }).active).toBe(true);
    expect(resolveLargeAccount({ data: null, failed: true, localForceOn: true }).active).toBe(true);
    // Server ON + no local flag stays ON (there is no local "off").
    expect(resolveLargeAccount({ data: serverData({ active: true }), localForceOn: false }).active).toBe(true);
  });

  it('an admin OFF pin (support debugging) beats the local force-on', () => {
    const s = resolveLargeAccount({
      data: serverData({ override: 'off', overrideBy: 'admin', canUserEnable: false }),
      localForceOn: true,
    });
    expect(s.active).toBe(false);
  });

  it('reads only the value "on" from storage', () => {
    expect(readLocalForceOn({ getItem: () => 'on' })).toBe(true);
    expect(readLocalForceOn({ getItem: () => 'off' })).toBe(false);
    expect(readLocalForceOn({ getItem: () => { throw new Error('denied'); } })).toBe(false);
  });

  it('formats counts with grouped thousands', () => {
    expect(formatCount(1497)).toBe('1,497');
    expect(formatCount(134071)).toBe('134,071');
    expect(formatCount(12)).toBe('12');
  });
});

describe('toServerSortModel (§6.2)', () => {
  it('inverts the direction the caller means (server maps desc→ascending)', () => {
    expect(toServerSortModel('stats.usage', 'desc')).toEqual([{ field: 'stats.usage', sort: 'asc' }]);
    expect(toServerSortModel('created', 'asc')).toEqual([{ field: 'created', sort: 'desc' }]);
    expect(toServerSortModel(null, 'asc')).toEqual([]);
  });
});
