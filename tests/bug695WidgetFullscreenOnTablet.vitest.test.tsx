/**
 * Runner note: this file renders `WidgetWrapper` in jsdom, so it is a Vitest
 * file, not one of core's Playwright `.unit.test.ts` pure-function tests.
 * Run from the parent:
 * `npx vitest run core/tests/bug695WidgetFullscreenOnTablet.vitest.test.tsx`
 *
 * Bug #695 — "Widget full-screen functionality is broken on iPad".
 * Reporter 6a80d5ee1bb23259bd346c20. Spec:
 * `specs/004.widget-fullscreen-unreachable-on-tablets.md`.
 *
 * Every route into widget full-screen was bound to hover, and Tailwind v4
 * wraps `group-hover` in `@media (hover: hover)` — so on a tablet (wide
 * viewport, no hover) the reveal rule can never match while the `sm:` hide
 * rule applies unconditionally. The controls end up permanently
 * `opacity: 0; pointer-events: none`, leaving a 400 ms triple-tap as the only
 * way in. On the bot drawer it was worse: `DrawerSection` passes
 * `isEditable: false` and `header: false`, so no control was rendered at all.
 *
 * jsdom does not evaluate the compiled Tailwind sheet, so these tests assert
 * on the class strings — which for this defect *are* the behaviour. The
 * companion assertion that `can-hover:` really compiles to a
 * `@media (hover: hover)` wrapper lives in the CSS contract
 * (`core/scripts/verify-css-contract.mjs`), which runs the real PostCSS
 * pipeline.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { WidgetWrapper } from '@/components/widgets/WidgetWrapper';
import { useUIStore } from '@/stores/uiStore';

let container: HTMLDivElement;
let root: Root;

/** WidgetWrapper reads react-query cache status, so it needs a provider. */
const mount = (ui: ReactNode) => {
  act(() => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, ui));
  });
};

/**
 * Non-null assertions are banned by the shared eslint config, and a missing
 * node should fail with the reason rather than a TypeError anyway.
 */
const must = <T,>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present, got ${String(value)}`);
  }
  return value;
};

/** The header-bearing grid widget: `isEditable` true, controls on hover. */
const gridWidget = (id = 'w-grid') =>
  createElement(
    WidgetWrapper,
    {
      metadata: { id, type: 'portfolio-value', title: 'Portfolio' },
      isEditable: true,
    },
    createElement('div', null, 'body')
  );

/** The bot-drawer shape: no header, not editable (see DrawerSection.tsx). */
const drawerWidget = (id = 'w-drawer') =>
  createElement(
    WidgetWrapper,
    {
      metadata: {
        id,
        type: 'drawer-general-info',
        title: 'Basic',
        header: false,
      },
      isEditable: false,
      isCollapsible: false,
      noPadding: true,
    },
    createElement('div', null, 'body')
  );

/**
 * The overlay control cluster is the element wrapping the always-present
 * "Widget Menu" button. Found structurally rather than by a test-only hook,
 * so the assertions below fail on the class gating itself.
 */
const controlCluster = () =>
  container.querySelector<HTMLElement>('[title="Widget Menu"]')
    ?.parentElement ?? null;

const fullscreenControl = () =>
  container.querySelector<HTMLElement>('[aria-label="Enter fullscreen"]');

/**
 * jsdom ships no `window.matchMedia`; every real browser has it. Stub it so
 * the hover capability can be driven from the test — `true` models a desktop,
 * `false` an iPad.
 */
const setCanHover = (canHover: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: /hover:\s*hover/.test(query) ? canHover : !canHover,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

beforeEach(() => {
  setCanHover(true);
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
  vi.restoreAllMocks();
});

describe('bug #695 — widget full-screen on a tablet', () => {
  // spec §1.2.A
  it('hides the control cluster only on devices that can hover', () => {
    mount(gridWidget());

    const cls = must(controlCluster(), 'the editable control cluster').className;

    // The hide-by-default utilities must be scoped to hovering devices.
    // Ungated `sm:opacity-0` / `sm:pointer-events-none` beat the touch branch
    // above 640px, which is exactly the reported iPad failure.
    for (const util of ['opacity-0', 'pointer-events-none', 'translate-x-3']) {
      expect(
        cls,
        `\`sm:${util}\` must be gated on hover capability, not on the sm breakpoint`
      ).not.toMatch(new RegExp(`(^|\\s)sm:${util}(\\s|$)`));
      expect(cls).toContain(`can-hover:sm:${util}`);
    }
  });

  // spec §1.2.A
  it('keeps the touch-revealed classes ungated by sm:', () => {
    mount(gridWidget());
    const cls = must(controlCluster(), 'the control cluster').className;

    // With the hide rules hover-scoped, these base utilities are what a
    // tablet actually applies once `showMobileControls` flips on touch.
    expect(cls).toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(cls).toMatch(/(^|\s)pointer-events-none(\s|$)/);
  });

  // spec §1.2.B
  it('renders a tappable full-screen control on a headerless, non-editable widget', () => {
    mount(drawerWidget());

    const btn = must(
      fullscreenControl(),
      'a full-screen control on a drawer widget (otherwise only a triple-tap reaches it)'
    );
    expect(btn.tagName).toBe('BUTTON');
  });

  // spec §1.2.B
  it('the control enters full-screen through the ui store', () => {
    mount(drawerWidget('w-drawer-2'));

    act(() => {
      must(fullscreenControl(), 'the full-screen control').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(useUIStore.getState().fullscreenWidget.widgetId).toBe('w-drawer-2');
  });

  // spec §1.2.B — the headerless drag handle already owns `top-2 right-2`.
  it('offsets the control when the drag handle is present', () => {
    mount(
      createElement(
        WidgetWrapper,
        {
          metadata: { id: 'w-h', type: 'x', title: 'X', header: false },
          isEditable: true,
        },
        createElement('div', null, 'body')
      )
    );

    expect(
      container.querySelector('[data-drag-handle]'),
      'editable headerless widgets keep their drag handle'
    ).not.toBeNull();

    const cls = must(fullscreenControl(), 'the full-screen control').className;
    expect(cls).toContain('right-10');
    expect(cls).not.toMatch(/(^|\s)right-2(\s|$)/);
  });

  // spec §1.2.C — the overlay header's only restore path is a mousemove in
  // the top 100px, which a touch device never emits. Auto-hiding it there
  // strands the user in fullscreen with no reachable Exit button.
  describe('the fullscreen overlay exit control', () => {
    const overlayHeader = () =>
      [...document.querySelectorAll<HTMLElement>('div')].find((d) =>
        /absolute top-0 left-0 right-0 h-16/.test(d.className || '')
      ) ?? null;

    const enterFullscreenAndWait = () => {
      mount(drawerWidget('w-fs'));
      act(() => {
        must(fullscreenControl(), 'the full-screen control').dispatchEvent(
          new MouseEvent('click', { bubbles: true })
        );
      });
      // Past the 3s auto-hide deadline.
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      return overlayHeader();
    };

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('stays on screen when the device cannot hover', () => {
      setCanHover(false);
      const header = enterFullscreenAndWait();

      expect(
        must(header, 'the overlay header').className,
        'a hover-less device has no way to summon the header back, so it must not auto-hide'
      ).toContain('translate-y-0');
      expect(must(header, 'the overlay header').className).not.toContain(
        '-translate-y-full'
      );
    });

    it('still auto-hides on a device that can hover', () => {
      setCanHover(true);
      const header = enterFullscreenAndWait();

      // Desktop behaviour is deliberately unchanged.
      expect(must(header, 'the overlay header').className).toContain(
        '-translate-y-full'
      );
    });
  });
});
