/**
 * WebSocket Update Batcher
 *
 * Batches rapid WebSocket updates so a burst of events becomes ONE store
 * write (one `set()`, one re-render pass, one persist) instead of one per
 * event.
 *
 * Updates for ALL bots share one window: the first update opens a window of
 * `delay` ms and every update that arrives before it closes is delivered in
 * the same callback, in arrival order. (It used to batch per bot, so K bots
 * ticking inside one window produced K separate store writes, each cloning
 * the whole store.) The window is fixed, not extended by later updates, so a
 * steady stream still flushes every `delay` ms.
 */

type UpdateCallback<T> = (updates: T[]) => void;

export class WebSocketDebouncer<T> {
  private queue: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly delay: number;
  private readonly callback: UpdateCallback<T>;

  /**
   * @param callback - Function to call with batched updates (any mix of bots)
   * @param _getBotId - Kept for call-site compatibility; batching is no
   *   longer per bot.
   * @param delay - Batch window in milliseconds (default: 50ms)
   */
  constructor(
    callback: UpdateCallback<T>,
    _getBotId?: (update: T) => string,
    delay: number = 50
  ) {
    this.callback = callback;
    this.delay = delay;
  }

  /** Add an update to the current batch window. */
  public enqueue(update: T): void {
    this.queue.push(update);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.delay);
    }
  }

  /** Immediately deliver every pending update. */
  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;
    const updates = this.queue;
    this.queue = [];
    this.callback(updates);
  }

  /** Clear all pending updates without processing. */
  public clear(): void {
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
