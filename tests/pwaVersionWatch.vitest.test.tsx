/**
 * Runner: Vitest (jsdom). Spec 064 §8 — new-version detection without a
 * service worker; one shared watcher, cleaned up with its last subscriber.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { entryScriptFromHtml, usePWAUpdate } from '../src/hooks/usePWA';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('entryScriptFromHtml', () => {
  it('finds the module entry in a built index.html', () => {
    const html =
      '<head><link rel="modulepreload" href="/assets/vendor.js"><script type="module" crossorigin src="/assets/index-AbC123.js"></script></head>';
    expect(entryScriptFromHtml(html)).toBe('/assets/index-AbC123.js');
    expect(entryScriptFromHtml('<script src="/x.js" type="module"></script>')).toBe('/x.js');
    expect(entryScriptFromHtml('<p>no scripts</p>')).toBeNull();
  });
});

describe('usePWAUpdate watcher lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('adds one visibility listener for many mounts and removes it with the last', async () => {
    vi.stubEnv('DEV', false);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<p></p>'));
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    function Probe() {
      usePWAUpdate();
      return null;
    }
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(createElement('div', null, createElement(Probe), createElement(Probe), createElement(Probe)));
    });
    const vis = (calls: unknown[][]) => calls.filter((c) => c[0] === 'visibilitychange').length;
    expect(vis(add.mock.calls)).toBe(1);
    await act(async () => root.unmount());
    expect(vis(remove.mock.calls)).toBe(vis(add.mock.calls));
  });
});

describe('usePWAUpdate auto-apply on return', () => {
  let visibility: DocumentVisibilityState = 'visible';
  let reload: ReturnType<typeof vi.fn>;

  async function mount(newEntry: string) {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.useFakeTimers();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/index-old.js';
    document.head.appendChild(script);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'http://localhost/', reload },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(`<script type="module" src="${newEntry}"></script>`)
    );
    const mod = await import('../src/hooks/usePWA');
    let available = false;
    function Probe() {
      available = mod.usePWAUpdate().updateAvailable;
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Probe)));
    return {
      root,
      script,
      isAvailable: () => available,
    };
  }

  async function setVisibility(v: DocumentVisibilityState) {
    visibility = v;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  afterEach(() => {
    visibility = 'visible';
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('reloads when the user comes back after a long break and a new version exists', async () => {
    const { root, script } = await mount('/assets/index-new.js');
    await setVisibility('hidden');
    vi.setSystemTime(Date.now() + 20 * 60_000);
    await setVisibility('visible');
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    script.remove();
  });

  it('only shows the prompt after a short absence', async () => {
    const { root, script, isAvailable } = await mount('/assets/index-new.js');
    await setVisibility('hidden');
    vi.setSystemTime(Date.now() + 2 * 60_000);
    await setVisibility('visible');
    expect(reload).not.toHaveBeenCalled();
    expect(isAvailable()).toBe(true);
    await act(async () => root.unmount());
    script.remove();
  });

  it('applies an already-pending update on return', async () => {
    const { root, script, isAvailable } = await mount('/assets/index-new.js');
    await setVisibility('hidden');
    await setVisibility('visible'); // short absence: detected, not applied
    expect(isAvailable()).toBe(true);
    await setVisibility('hidden');
    vi.setSystemTime(Date.now() + 8 * 60 * 60_000);
    await setVisibility('visible');
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    script.remove();
  });

  it('does not reload once the user has started interacting', async () => {
    const { root, script } = await mount('/assets/index-new.js');
    let resolveFetch: (r: Response) => void = () => undefined;
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      () => new Promise<Response>((r) => (resolveFetch = r))
    );
    await setVisibility('hidden');
    vi.setSystemTime(Date.now() + 20 * 60_000);
    await setVisibility('visible');
    window.dispatchEvent(new Event('pointerdown'));
    await act(async () => {
      resolveFetch(
        new Response('<script type="module" src="/assets/index-new.js"></script>')
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reload).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    script.remove();
  });

  it('treats a long-overdue poll tick (machine slept) as a return', async () => {
    const { root, script } = await mount('/assets/index-new.js');
    vi.setSystemTime(Date.now() + 9 * 60 * 60_000);
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    script.remove();
  });

  it('does not reload on a normal poll tick', async () => {
    const { root, script, isAvailable } = await mount('/assets/index-new.js');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(isAvailable()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    script.remove();
  });
});
