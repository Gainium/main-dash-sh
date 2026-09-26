import type { TradingViewWidgetInstance } from './types';

/**
 * Replay TradingView's `innerWindowLoad` event when the widget missed it.
 *
 * The widget writes the library into its chart frame (`document.write`), then
 * calls `document.close()`, and only then listens for the frame's
 * `innerWindowLoad` event. It resolves its internal "frame loaded" promise from
 * that event, and `onChartReady` hangs off the promise. Safari runs the
 * library's cached scripts synchronously inside `document.close()`, so the
 * event fires before the listener exists: the chart inside the frame boots and
 * draws its candles, but the widget never reports ready, and nothing that
 * waits for it (every order line, fill marker and breakeven line) is drawn.
 * Chrome runs those scripts later, after the listener is attached.
 *
 * Once the frame's library has booted (`widgetReady` exists on the frame's
 * window) and the widget's promise is still pending, dispatch the event again.
 * The widget's own listener is attached by then and completes the hand-off;
 * the library also delivers an already-emitted chart-ready to the late
 * subscriber. Where the event was not missed the promise has already resolved
 * and nothing is dispatched.
 *
 * Returns a function that stops the polling.
 */
export function replayMissedInnerWindowLoad(
  widget: TradingViewWidgetInstance,
  container: HTMLElement,
  { intervalMs = 100, maxMs = 20_000 } = {}
): () => void {
  // Private to the library; if a future version drops it there is nothing to
  // detect and nothing to replay.
  const loaded = (widget as unknown as { _innerWindowLoaded?: unknown })
    ._innerWindowLoaded;
  if (!loaded || typeof (loaded as Promise<void>).then !== 'function') {
    return () => undefined;
  }

  let settled = false;
  (loaded as Promise<void>).then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (settled || Date.now() - startedAt > maxMs) {
      clearInterval(timer);
      return;
    }
    try {
      const frame = container.querySelector('iframe')?.contentWindow as
        | (Window & { widgetReady?: unknown; Event: typeof Event })
        | null
        | undefined;
      if (frame && typeof frame.widgetReady === 'function') {
        frame.dispatchEvent(new frame.Event('innerWindowLoad'));
      }
    } catch {
      // A detached or not-yet-navigated frame: try again on the next tick.
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
