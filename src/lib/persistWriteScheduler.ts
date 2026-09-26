/**
 * Write scheduling for zustand `persist` storages.
 *
 * zustand's persist middleware calls `storage.setItem(name, {state, version})`
 * on EVERY `set()`, with no equality check and no throttle. For an IndexedDB
 * backend that means a structured clone of the whole persisted slice on the
 * main thread per store update — for the live stores (deals, orders, bots,
 * transactions) that is once per websocket event, and the slice grows with
 * the account.
 *
 * `createPersistWriter` sits between persist and the backend and makes the
 * write path cost O(changed stores / throttle window):
 *
 *  - **Dirty check.** A value whose persisted slice is reference-equal (down to
 *    `compareDepth` levels of plain objects) to the last value written or read
 *    is dropped. Loading/error flips (excluded by `partialize`) and no-op sets
 *    therefore never reach the backend.
 *  - **Trailing throttle.** At most one write per `throttleMs`; only the latest
 *    value is written.
 *  - **Hydration gate.** Nothing is written until the store has read its saved
 *    value (`markHydrated`). A write before that would overwrite the saved blob
 *    with the near-empty initial state; after hydration persist merges and the
 *    next real change writes the merged state.
 *  - **Flush / cancel.** Pending writes are flushed when the page is hidden or
 *    unloaded, and cancelled by `cancelAllPersistWrites()` (logout wipes).
 *  - **prepare.** An optional transform applied only when a write actually
 *    happens (e.g. bounding a cache) — so the per-`set()` cost stays a
 *    reference compare.
 */

export interface PersistedValue {
  state: unknown;
  version?: number;
}

export interface PersistWriterOptions {
  name: string;
  /** Performs the actual write. */
  write: (name: string, value: PersistedValue) => Promise<void>;
  throttleMs: number;
  /** Levels of plain objects compared by key before falling back to `===`. */
  compareDepth?: number;
  /** Applied to `value.state` right before a write. */
  prepare?: (state: unknown) => unknown;
}

export interface PersistWriter {
  setItem: (value: PersistedValue) => Promise<void>;
  /** Record that hydration finished; `saved` is what was read (or null). */
  markHydrated: (saved: PersistedValue | null) => void;
  isHydrated: () => boolean;
  flush: () => Promise<void>;
  cancel: () => void;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/**
 * Reference equality that looks `depth` levels into plain objects. Two empty
 * plain objects are equal (partialize functions often emit a fresh `{}`).
 */
export function shallowEqualDepth(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0 || !isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!shallowEqualDepth(a[k], b[k], depth - 1)) return false;
  }
  return true;
}

const writers = new Set<PersistWriter>();
let lifecycleHooked = false;

function hookLifecycle(): void {
  if (lifecycleHooked || typeof window === 'undefined') return;
  lifecycleHooked = true;
  const flushAll = () => {
    writers.forEach((w) => {
      void w.flush();
    });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}

/** Flush every pending write now (e.g. before a deliberate reload). */
export function flushAllPersistWrites(): Promise<void> {
  return Promise.all([...writers].map((w) => w.flush())).then(() => undefined);
}

/** Drop every pending write (used when all persisted data is being wiped). */
export function cancelAllPersistWrites(): void {
  writers.forEach((w) => w.cancel());
}

export function createPersistWriter(opts: PersistWriterOptions): PersistWriter {
  const { name, write, throttleMs, compareDepth = 2, prepare } = opts;
  let hydrated = false;
  // Last state known to be in the backend (written or read).
  let baseline: PersistedValue | null = null;
  let pending: PersistedValue | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const sameAsBaseline = (v: PersistedValue) =>
    !!baseline &&
    baseline.version === v.version &&
    shallowEqualDepth(baseline.state, v.state, compareDepth);

  const doWrite = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const value = pending;
    pending = null;
    if (!value || !hydrated) return inFlight;
    baseline = value;
    const out: PersistedValue = prepare
      ? { ...value, state: prepare(value.state) }
      : value;
    inFlight = inFlight
      .catch(() => undefined)
      .then(() => write(name, out))
      .catch((error) => {
        console.error(`[persist] write failed for "${name}":`, error);
      });
    return inFlight;
  };

  const writer: PersistWriter = {
    setItem(value) {
      if (!hydrated) {
        // Never overwrite the saved blob before it was read.
        return Promise.resolve();
      }
      if (sameAsBaseline(value)) {
        pending = null;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return Promise.resolve();
      }
      pending = value;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          void doWrite();
        }, throttleMs);
      }
      return Promise.resolve();
    },
    markHydrated(saved) {
      hydrated = true;
      baseline = saved;
    },
    isHydrated: () => hydrated,
    flush: () => doWrite(),
    cancel() {
      pending = null;
      baseline = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };

  writers.add(writer);
  hookLifecycle();
  return writer;
}
