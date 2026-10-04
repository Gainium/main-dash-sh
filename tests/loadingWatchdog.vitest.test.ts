/**
 * Runner: Vitest (jsdom). Spec 085 — the production loading watchdog must not
 * reload a page that has rendered, whatever words or attributes its markup
 * contains; it still reloads when the root never renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reload = vi.fn();

async function startWatchdog(): Promise<void> {
  vi.resetModules();
  const { initLoadingWatchdog } = await import('../src/lib/cacheManager');
  initLoadingWatchdog();
}

function renderRoot(html: string): void {
  const root = document.getElementById('root');
  if (root) root.innerHTML = html;
}

/** Run the timers, then let clearAllCaches' awaits settle. */
async function runPast15s(): Promise<void> {
  await vi.advanceTimersByTimeAsync(20_000);
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 0));
}

describe('initLoadingWatchdog (spec 085)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('§1.1 does not reload a rendered page with a lazy image', async () => {
    await startWatchdog();
    renderRoot(
      '<main><h1>Ignore Exchange Fees</h1><img src="x.webp" loading="lazy"></main>'
    );
    await runPast15s();
    expect(reload).not.toHaveBeenCalled();
  });

  it('§1.1 does not reload a rendered page whose copy says "loading"', async () => {
    await startWatchdog();
    renderRoot('<main><p>Error loading bots</p></main>');
    await runPast15s();
    expect(reload).not.toHaveBeenCalled();
  });

  it('§1.2 still reloads when the root never renders', async () => {
    await startWatchdog();
    await runPast15s();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
