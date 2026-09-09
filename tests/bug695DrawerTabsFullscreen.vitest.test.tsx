/**
 * Runner note: Vitest (jsdom), run from the parent:
 * `npx vitest run core/tests/bug695DrawerTabsFullscreen.vitest.test.tsx`
 *
 * Bug #695, third pass. Spec:
 * `specs/011.drawer-tab-bodies-bypass-the-fullscreen-wrapper.md`.
 *
 * Specs 004 and 009 fixed how the headerless full-screen control is *revealed*
 * on a device that cannot hover. This one is about the four bot-drawer tabs
 * where it is never *rendered*: Deals, Stats, Events and Settings returned their
 * body directly instead of through `DrawerSection`, so no `WidgetWrapper` was
 * mounted — no button, no menu, and no triple-tap handler either. Measured on
 * the reporter's account at 1366x1024 with `(hover: none)`, those four tabs had
 * zero `button[title="Enter fullscreen"]` while Overview had 4 and Webhook 1.
 *
 * `DrawerDealsTable` (3.5k lines over react-query, sockets and exchange fees)
 * and `DrawerBotSettings` (renders the entire read-only bot form) cannot be
 * mounted in jsdom without a harness larger than the fix, so the four modules
 * are held to a source-level contract instead; the behavioural half is proven
 * once, on the wrapper they all share.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { queryClient } from '@/lib/queryClient';
import { DrawerSection } from '@/components/widgets/bots/drawer/DrawerSection';
import { useUIStore } from '@/stores/uiStore';

/** Vitest runs from the parent repo root, where `core/` is the submodule. */
const src = (relative: string) =>
  readFileSync(
    resolve(process.cwd(), 'core/src/components/widgets/bots', relative),
    'utf8'
  );

/** The bodies of the bot-drawer tabs that scored zero controls (spec §2). */
const TAB_BODIES = [
  { tab: 'Deals', file: 'drawer/DrawerDealsTable.tsx' },
  { tab: 'Events', file: 'drawer/DrawerBotEvents.tsx' },
  { tab: 'Settings', file: 'drawer/DrawerBotSettings.tsx' },
  { tab: 'Stats', file: 'stats/BotStatsTab.tsx' },
];

describe('bug #695 — full-screen on every bot-drawer tab', () => {
  // spec §1.2 / §3 — the defect itself: a tab body that never mounts a
  // `WidgetWrapper` cannot show, or be gestured into, full-screen.
  describe('every bot-drawer tab body renders through DrawerSection', () => {
    for (const { tab, file } of TAB_BODIES) {
      it(`${tab} (${file})`, () => {
        const code = src(file);

        expect(
          code,
          `the ${tab} tab body must import DrawerSection — it is what mounts the ` +
            'WidgetWrapper that draws "Enter fullscreen"'
        ).toMatch(/import\s*\{[^}]*\bDrawerSection\b[^}]*\}\s*from/);

        expect(
          code,
          `the ${tab} tab body must actually render <DrawerSection>, not just import it`
        ).toContain('<DrawerSection');
      });
    }
  });

  // spec §3 corollary — a spinner or an error message has nothing to expand, so
  // those branches stay bare. Guards against a future "wrap everything" pass.
  it('leaves the loading and error branches unwrapped', () => {
    for (const { tab, file } of TAB_BODIES) {
      const opens = src(file).match(/<DrawerSection/g)?.length ?? 0;
      expect(
        opens,
        `${tab} should wrap only its populated return; ${opens} DrawerSections ` +
          'suggests the loading/error branches were wrapped too'
      ).toBe(1);
    }
  });

  // spec §1.1 — the behavioural half, on the wrapper all four now share.
  describe('DrawerSection renders one Enter-fullscreen control', () => {
    let container: HTMLDivElement;
    let root: Root;

    const mount = (ui: ReactNode) =>
      act(() => {
        root.render(
          createElement(QueryClientProvider, { client: queryClient }, ui)
        );
      });

    beforeEach(() => {
      // jsdom ships no `window.matchMedia`; the wrapper's hover probe needs it.
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }),
      });
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        root = createRoot(container);
      });
      useUIStore.setState({
        controlsAlwaysVisible: false,
        fullscreenWidget: { widgetId: null, registry: null, storeKey: null },
      });
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    it('and it drives the ui store', () => {
      mount(
        createElement(
          DrawerSection,
          { widgetId: 'drawer-deals-tab', widgetType: 'drawer-deals-table' },
          createElement('div', null, 'deals')
        )
      );

      const controls = container.querySelectorAll(
        'button[title="Enter fullscreen"]'
      );
      expect(
        controls.length,
        'a drawer tab body wrapped in DrawerSection gets exactly one control'
      ).toBe(1);

      act(() => {
        controls[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(useUIStore.getState().fullscreenWidget.widgetId).toBe(
        'drawer-deals-tab'
      );
    });
  });
});
