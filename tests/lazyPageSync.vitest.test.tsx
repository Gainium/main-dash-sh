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
});
