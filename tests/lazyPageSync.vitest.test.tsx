/**
 * Runner: Vitest (jsdom). Spec 064 follow-up — a page whose module is already
 * loaded (preloaded at boot) renders on the first pass, without suspending
 * (React throttles a Suspense fallback -> content reveal by ~300 ms).
 */
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { lazyPage, PageSuspense, preloadRoute } from '../src/lib/lazyPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Hello() {
  return createElement('h1', null, 'Hello page');
}

describe('lazyPage', () => {
  it('renders a preloaded page synchronously (no fallback)', async () => {
    const Page = lazyPage(async () => ({ default: Hello }), {
      routes: [/^\/hello$/],
    });
    preloadRoute('/hello');
    await Page.preload();
    const el = document.createElement('div');
    const root = createRoot(el);
    act(() => root.render(createElement(PageSuspense, null, createElement(Page))));
    expect(el.textContent).toBe('Hello page');
    expect(el.querySelector('[aria-label="Loading page"]')).toBeNull();
    act(() => root.unmount());
  });

  it('still lazy-loads (via Suspense) when not preloaded', async () => {
    const Page = lazyPage(async () => ({ default: Hello }));
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(createElement(PageSuspense, null, createElement(Page)));
    });
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect(el.textContent).toBe('Hello page');
    act(() => root.unmount());
  });

  it('a page whose load is under way renders when ready, without suspending', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    const Page = lazyPage(async () => {
      await gate;
      return { default: Hello };
    });
    void Page.preload();
    const el = document.createElement('div');
    const root = createRoot(el);
    // No Suspense boundary at all: a suspending component would throw here.
    act(() => root.render(createElement(Page)));
    expect(el.querySelector('[aria-label="Loading page"]')).not.toBeNull();
    await act(async () => {
      release?.();
      await gate;
    });
    expect(el.textContent).toBe('Hello page');
    act(() => root.unmount());
  });
});
