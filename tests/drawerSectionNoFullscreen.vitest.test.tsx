/**
 * Runner note: Vitest (jsdom), run from the parent:
 * `npx vitest run core/tests/drawerSectionNoFullscreen.vitest.test.tsx`
 *
 * Bot-drawer widgets do not go full-screen. Every one renders through
 * `DrawerSection`, which sets `metadata.fullscreen: false` on its
 * `WidgetWrapper`: no corner "Enter fullscreen" button (it cost a row of the
 * drawer or sat on the widget's own controls) and no triple-click shortcut
 * (it fired while selecting text).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { DrawerSection } from '@/components/widgets/bots/drawer/DrawerSection';
import { useUIStore } from '@/stores/uiStore';

describe('DrawerSection — no full-screen', () => {
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
      controlsAlwaysVisible: true,
      fullscreenWidget: { widgetId: null, registry: null, storeKey: null },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  for (const bare of [false, true]) {
    it(`draws no Enter-fullscreen control (bare: ${bare})`, () => {
      mount(
        createElement(
          DrawerSection,
          { widgetId: 'drawer-section', widgetType: 'drawer-general-info', bare },
          createElement('div', null, 'content')
        )
      );

      expect(
        container.querySelectorAll('[aria-label="Enter fullscreen"]').length
      ).toBe(0);
    });
  }

  it('ignores a triple click', () => {
    mount(
      createElement(
        DrawerSection,
        { widgetId: 'drawer-section', widgetType: 'drawer-general-info' },
        createElement('div', { 'data-testid': 'content' }, 'content')
      )
    );

    const target = container.querySelector('[data-testid="content"]');
    act(() => {
      for (let i = 0; i < 3; i++) {
        target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

    expect(useUIStore.getState().fullscreenWidget.widgetId).toBeNull();
  });
});
