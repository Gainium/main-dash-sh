import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { replayMissedInnerWindowLoad } from '@/components/widgets/shared/TradingViewChart/innerWindowLoadReplay';
import type { TradingViewWidgetInstance } from '@/components/widgets/shared/TradingViewChart/types';

/**
 * TradingView's widget resolves its "frame loaded" promise from the chart
 * frame's `innerWindowLoad` event, and only then registers for onChartReady —
 * but it starts listening for that event after `document.close()`. Safari runs
 * the cached library inside `close()`, so the event fires first and the widget
 * never reports ready. This models that hand-off in the order Safari runs it.
 */

class TvWidgetModel {
  readonly iframe: HTMLIFrameElement;
  private readonly win: Window;
  readonly _innerWindowLoaded: Promise<void>;
  private resolveLoaded!: () => void;
  ready = false;
  dispatches = 0;

  constructor(container: HTMLElement) {
    this.iframe = document.createElement('iframe');
    container.appendChild(this.iframe);
    const win = this.iframe.contentWindow;
    if (!win) throw new Error('jsdom gave the frame no window');
    this.win = win;
    this._innerWindowLoaded = new Promise((r) => (this.resolveLoaded = r));
    const frame = win;
    frame.addEventListener('innerWindowLoad', () => this.dispatches++);
    // The widget registers for chart-ready only once the frame is known loaded.
    void this._innerWindowLoaded.then(() => {
      (
        frame as unknown as { widgetReady: (cb: () => void) => void }
      ).widgetReady(() => (this.ready = true));
    });
  }

  /** The library booting inside the frame: defines widgetReady, fires the event. */
  bootLibrary() {
    const frame = this.win as unknown as {
      widgetReady: (cb: () => void) => void;
    } & Window;
    // The chart itself becomes ready right away; a late subscriber still hears it.
    frame.widgetReady = (cb) => cb();
    frame.dispatchEvent(new frame.Event('innerWindowLoad'));
  }

  /** The widget attaching its listener — after close() in the real library. */
  listen() {
    this.win.addEventListener('innerWindowLoad', () => this.resolveLoaded(), {
      once: true,
    });
  }

  asWidget() {
    return this as unknown as TradingViewWidgetInstance;
  }
}

let container: HTMLDivElement;

describe('replayMissedInnerWindowLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
    vi.useRealTimers();
  });

  test('Safari order: the event fired before the listener, and ready still arrives', async () => {
    const tv = new TvWidgetModel(container);
    tv.bootLibrary(); // inside document.close()
    tv.listen(); // right after it — too late
    replayMissedInnerWindowLoad(tv.asWidget(), container);

    await vi.advanceTimersByTimeAsync(0);
    expect(tv.ready).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    expect(tv.ready).toBe(true);
  });

  test('Chrome order: nothing is replayed when the widget heard the event', async () => {
    const tv = new TvWidgetModel(container);
    tv.listen();
    tv.bootLibrary();
    replayMissedInnerWindowLoad(tv.asWidget(), container);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(tv.ready).toBe(true);
    expect(tv.dispatches).toBe(1);
  });

  test('waits for the library to boot before replaying', async () => {
    const tv = new TvWidgetModel(container);
    tv.listen();
    replayMissedInnerWindowLoad(tv.asWidget(), container);

    await vi.advanceTimersByTimeAsync(500);
    expect(tv.dispatches).toBe(0);
    expect(tv.ready).toBe(false);
  });

  test('stops polling at the limit and when stopped', async () => {
    const tv = new TvWidgetModel(container);
    const stop = replayMissedInnerWindowLoad(tv.asWidget(), container, {
      maxMs: 300,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    tv.bootLibrary();
    tv.listen();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tv.ready).toBe(false);

    const tv2 = new TvWidgetModel(container);
    const stop2 = replayMissedInnerWindowLoad(tv2.asWidget(), container);
    stop2();
    tv2.bootLibrary();
    tv2.listen();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tv2.ready).toBe(false);
    stop();
  });

  test('does nothing on a library without the private promise', async () => {
    const stop = replayMissedInnerWindowLoad(
      {} as TradingViewWidgetInstance,
      container
    );
    await vi.advanceTimersByTimeAsync(1_000);
    stop();
  });
});
