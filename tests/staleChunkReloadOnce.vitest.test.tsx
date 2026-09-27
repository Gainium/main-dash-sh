/**
 * Runner: Vitest (jsdom), from the parent:
 *   NODE_ENV=development npx vitest run core/tests/staleChunkReloadOnce.vitest.test.tsx
 * Spec 069 — a chunk that fails to load (stale tab after a deploy) reloads the
 * page once and never takes the app shell down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, Component, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  __resetChunkReloadForTests,
  lazyPage,
  lazySlot,
  PageSuspense,
  reloadOnceForStaleChunk,
} from '../src/lib/lazyPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://app.gainium.io/assets/MaxDetachedPanel-old.js'
  );

class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  override state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  override componentDidCatch() {}
  override render() {
    return this.state.error
      ? createElement('p', null, 'Something went wrong')
      : this.props.children;
  }
}

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  __resetChunkReloadForTests();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(node: ReactNode) {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(createElement(Boundary, null, node)));
  await act(async () => new Promise((r) => setTimeout(r, 50)));
  return { el, unmount: () => act(() => root.unmount()) };
}

describe('reloadOnceForStaleChunk (§3.1)', () => {
  it('reloads once, then refuses within the guard window after the reload', () => {
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // Same page: the reload is under way — callers must not surface the error.
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // The reloaded page (fresh module state, same tab session) fails again.
    __resetChunkReloadForTests();
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('lazySlot (§3.3)', () => {
  it('a rejected loader leaves the parent rendered and reloads once', async () => {
    const Panel = lazySlot(() => Promise.reject(chunkError()));
    const { el, unmount } = await mount(
      createElement('main', null, createElement('h1', null, 'Overview'), createElement(Panel))
    );
    expect(el.textContent).toBe('Overview');
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('when the guard refuses to reload, the slot still renders nothing', async () => {
    reloadOnceForStaleChunk();
    __resetChunkReloadForTests(); // the reloaded page
    reload.mockClear();
    const Panel = lazySlot(() => Promise.reject(chunkError()));
    const { el, unmount } = await mount(
      createElement('main', null, createElement('h1', null, 'Overview'), createElement(Panel))
    );
    expect(el.textContent).toBe('Overview');
    expect(reload).not.toHaveBeenCalled();
    unmount();
  });

  it('a render error inside a loaded slot still reaches the boundary', async () => {
    function Broken(): ReactNode {
      throw new Error('real bug');
    }
    const Panel = lazySlot(async () => ({ default: Broken }));
    const { el, unmount } = await mount(createElement(Panel));
    expect(el.textContent).toBe('Something went wrong');
    expect(reload).not.toHaveBeenCalled();
    unmount();
  });
});

describe('lazyPage (§3.4)', () => {
  it('a failed page chunk keeps the fallback while the page reloads', async () => {
    const Page = lazyPage(() => Promise.reject(chunkError()));
    const { el, unmount } = await mount(createElement(PageSuspense, null, createElement(Page)));
    expect(el.textContent).not.toContain('Something went wrong');
    expect(el.querySelector('[aria-label="Loading page"]')).not.toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('when the guard refuses, the error reaches the boundary as before', async () => {
    reloadOnceForStaleChunk();
    __resetChunkReloadForTests();
    const Page = lazyPage(() => Promise.reject(chunkError()));
    const { el, unmount } = await mount(createElement(PageSuspense, null, createElement(Page)));
    expect(el.textContent).toBe('Something went wrong');
    unmount();
  });

  it('a failed boot preload surfaces to the boundary instead of spinning forever', async () => {
    reloadOnceForStaleChunk();
    __resetChunkReloadForTests();
    const Page = lazyPage(() => Promise.reject(chunkError()));
    void Page.preload().catch(() => undefined); // boot preload under way -> 'await' mode
    const { el, unmount } = await mount(createElement(Page));
    expect(el.textContent).toBe('Something went wrong');
    unmount();
  });
});
