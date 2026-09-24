/**
 * Runner note: renders the real widget in jsdom with its two data hooks
 * mocked, so it is a Vitest file. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/dcaAnalysisLongerLadderDeal.vitest.test.tsx`.
 */

/**
 * DCA Analysis folded a deal that filled more DCA orders than the bot is set
 * to TODAY into the current-ladder bar.
 *
 * A bot ran a 45-order ladder, one deal filled 38 DCAs and closed, then the
 * bot was cut to 30 orders. "Finished Deals by DCA Count" showed that deal in
 * a "30 DCAs" bar and never drew a 38 bar; "Max DCAs (Finished)" read 30.
 *
 * Cause: each bucket's ceiling was the projection count for the bot's current
 * settings alone, and the used count was clamped to it. The deal's own ladder
 * (`configured`, = `levels.all - 1` from the server histogram) was only a
 * fallback for when the projection was not ready. The ceiling is now the
 * larger of the two, so a deal is never capped below the ladder it ran.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DcaUsageData } from '@/hooks/bots/dca/useBotDcaUsage';
import { DCAOrderTypeEnum } from '@/types';
import { DrawerDCAMetrics } from '@/components/widgets/bots/drawer/DrawerDCAMetrics';

let usage: DcaUsageData;
let configuredDcaCount = 30;

vi.mock('@/hooks/bots/dca/useBotDcaUsage', () => ({
  useBotDcaUsage: () => ({ usage, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/bots/dca/useBotDcaProjection', () => ({
  useBotDcaProjection: () => ({
    summary: { coverage: '0', avgDownPower: '0' },
    orders: Array.from({ length: configuredDcaCount }, () => ({
      hide: false,
      type: DCAOrderTypeEnum.dca,
    })),
  }),
}));

vi.mock('@/utils/bots/dca/deal-summary', () => ({
  formatTotalFunds: () => '0',
}));

vi.mock('@/components/widgets/bots/drawer/DrawerSection', () => ({
  DrawerSection: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(): string {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const r = createRoot(el);
  host = el;
  root = r;
  act(() =>
    r.render(
      createElement(DrawerDCAMetrics, {
        widgetId: 'w',
        botId: 'bot',
        bot: { _id: 'bot', type: 'dca', pair: 'UAI-USD', settings: {} } as never,
      })
    )
  );
  return el.textContent ?? '';
}

/** value printed under a tile label, e.g. "Max DCAs (Finished)" */
function tile(text: string, label: string): string {
  const at = text.indexOf(label);
  return text.slice(at + label.length).match(/^[\d.]+%?/)?.[0] ?? '';
}

describe('DCA Analysis — a deal that ran a longer ladder than the bot has now', () => {
  it('shows the deal in its true DCA bar, not the current-ladder bar', () => {
    configuredDcaCount = 30;
    usage = {
      finished: [
        { dcas: 0, deals: 3, configured: 30 },
        { dcas: 38, deals: 1, configured: 45 },
      ],
      active: [],
      maxConfiguredDcas: 45,
    };
    const text = render();

    expect(text).toContain('38 DCAs');
    expect(text).not.toContain('30 DCAs');
    expect(tile(text, 'Max DCAs (Finished)')).toBe('38');
    // (0*3 + 38) / 4
    expect(tile(text, 'Avg DCAs (Finished)')).toBe('9.5');
    // The deal is measured against its own 45-order ladder: (38/45) / 4.
    expect(tile(text, 'Finished Deals Coverage')).toBe('21.1%');
    // The tile names the bot's CURRENT configuration and is unchanged.
    expect(text).toMatch(/30\s*Max Configured DCAs/);
  });

  it('still measures a shorter-ladder deal against the current ladder', () => {
    configuredDcaCount = 30;
    usage = {
      finished: [{ dcas: 10, deals: 1, configured: 20 }],
      active: [],
      maxConfiguredDcas: 20,
    };
    const text = render();

    expect(text).toContain('10 DCAs');
    expect(tile(text, 'Finished Deals Coverage')).toBe('33.3%');
  });

  it('falls back to the deal ladder when the projection has no count', () => {
    configuredDcaCount = 0;
    usage = {
      finished: [{ dcas: 4, deals: 1, configured: 8 }],
      active: [],
      maxConfiguredDcas: 8,
    };
    const text = render();

    expect(text).toContain('4 DCAs');
    expect(tile(text, 'Finished Deals Coverage')).toBe('50.0%');
    expect(text).toMatch(/8\s*Max Configured DCAs/);
  });
});
