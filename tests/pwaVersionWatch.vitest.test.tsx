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
