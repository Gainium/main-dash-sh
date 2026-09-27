/* eslint-disable react-refresh/only-export-components */
/**
 * Route-level code splitting.
 *
 * Every page used to be imported eagerly, so the whole app (bot forms,
 * backtester, charting adapters, reports, manual backtesting…) was one entry
 * chunk that had to be downloaded, parsed and compiled before first paint.
 * Pages are now `React.lazy` chunks loaded when their route renders.
 *
 * `lazyPage(loader, { prefetch: true })` also warms the most-visited pages
 * once the browser is idle after start-up, so the first visit to them does
 * not wait on the network.
 */
import { Loader2 } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

/**
 * A chunk that fails to load usually means this tab runs a build that has
 * since been replaced (its hashed chunks are gone), or the network dropped.
 * Reload once onto the current build; a sessionStorage timestamp stops a
 * reload loop when the reloaded page fails again.
 */
const CHUNK_RELOAD_KEY = 'gainium:chunk-reload-at';
const CHUNK_RELOAD_WINDOW_MS = 60_000;
let chunkReloading = false;

/** Returns true when the page is reloading (the caller should not surface the error). */
export function reloadOnceForStaleChunk(): boolean {
  if (chunkReloading) return true;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
    if (last && Date.now() - last < CHUNK_RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // no sessionStorage: cannot guard against a loop
  }
  chunkReloading = true;
  window.location.reload();
  return true;
}

/** Test-only: simulate a fresh page (module state) in the same tab session. */
export function __resetChunkReloadForTests(): void {
  chunkReloading = false;
}

/** Never settles: keeps a Suspense/page fallback up while the page reloads. */
const never = <T,>() => new Promise<T>(() => undefined);

const prefetchers: Array<() => Promise<unknown>> = [];
let prefetchScheduled = false;

function schedulePrefetch(): void {
  if (prefetchScheduled || typeof window === 'undefined') return;
  prefetchScheduled = true;
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void;
  };
  const idle = (cb: () => void) =>
    w.requestIdleCallback
      ? w.requestIdleCallback(cb, { timeout: 10_000 })
      : setTimeout(cb, 3000);
  // Start after the first load settles; load one chunk per idle slot.
  setTimeout(() => {
    const next = () => {
      const load = prefetchers.shift();
      if (!load) return;
      load()
        .catch(() => undefined)
        .finally(() => idle(next));
    };
    idle(next);
  }, 5000);
}

export type PageComponent<P extends object> = ComponentType<P> & {
  /** Start (or join) loading the page module. */
  preload: () => Promise<unknown>;
};

interface LazyPageOptions {
  /** Warm the chunk once the browser is idle after start-up. */
  prefetch?: boolean;
  /** Paths this page renders on — used by `preloadRoute` at boot. */
  routes?: RegExp[];
}

const routePreloads: Array<{ re: RegExp; preload: () => Promise<unknown> }> =
  [];

/**
 * Start loading the page module for `pathname` right away (call at boot,
 * before the first render). When the route then renders, the module is
 * usually already evaluated and the page renders without suspending.
 */
export function registerRoutePreload(
  re: RegExp,
  preload: () => Promise<unknown>
): void {
  routePreloads.push({ re, preload });
}

export function preloadRoute(pathname: string): Promise<unknown> {
  return (
    routePreloads.find((r) => r.re.test(pathname))?.preload() ??
    Promise.resolve()
  );
}

export function lazyPage<P extends object = object>(
  loader: Loader<P>,
  options: LazyPageOptions = {}
): PageComponent<P> {
  // A page whose module has already loaded renders SYNCHRONOUSLY: React.lazy
  // always suspends on its first render (even for a resolved promise), and
  // React throttles the fallback -> content reveal by ~300 ms, which put that
  // delay (and every query the page starts) on the cold-load critical path.
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const load = () =>
    (pending ??= loader().then(
      (m) => {
        loaded = m.default;
        return m;
      },
      (err: unknown) => {
        // Reloading onto the current build: stay on the fallback meanwhile.
        if (reloadOnceForStaleChunk()) return never<{ default: ComponentType<P> }>();
        pending = null; // let a retry fetch again
        throw err;
      }
    ));
  const Lazy = lazy(load) as unknown as ComponentType<P>;
  function LazyPage(props: P) {
    // Decided once per mount so the element type never flips under it:
    // - module loaded: render it directly;
    // - load already under way (boot preload): wait for it WITHOUT
    //   suspending, so no Suspense fallback and no reveal throttle;
    // - not started: React.lazy, which keeps the previous page on screen
    //   during a navigation transition.
    const [mode] = useState<'ready' | 'await' | 'lazy'>(() =>
      loaded ? 'ready' : pending ? 'await' : 'lazy'
    );
    const [Resolved, setResolved] = useState<ComponentType<P> | null>(
      () => loaded
    );
    const [failed, setFailed] = useState<{ error: unknown } | null>(null);
    useEffect(() => {
      if (mode !== 'await' || Resolved) return;
      let alive = true;
      load().then(
        (m) => {
          if (alive) setResolved(() => m.default);
        },
        (error: unknown) => {
          if (alive) setFailed({ error });
        }
      );
      return () => {
        alive = false;
      };
    }, [mode, Resolved]);
    // Hand a failed load to the nearest error boundary instead of spinning.
    if (failed) throw failed.error;
    if (mode === 'lazy') return <Lazy {...props} />;
    if (!Resolved) return <PageFallback />;
    return <Resolved {...props} />;
  }
  const page = LazyPage as PageComponent<P>;
  page.preload = load;
  options.routes?.forEach((re) => routePreloads.push({ re, preload: load }));
  if (options.prefetch) {
    prefetchers.push(load);
    schedulePrefetch();
  }
  return page;
}

/** `lazyPage` for a named export. */
export function lazyNamed<M, K extends keyof M>(
  loader: () => Promise<M>,
  name: K,
  options: LazyPageOptions = {}
) {
  type P = M[K] extends ComponentType<infer Props> ? Props : never;
  return lazyPage<P & object>(
    () =>
      loader().then((m) => ({
        default: m[name] as unknown as ComponentType<P & object>,
      })),
    options
  );
}

/**
 * A slot filler / widget component loaded on first render, with its own
 * invisible Suspense boundary (so it is safe wherever the slot is mounted).
 * A slot whose chunk fails to load renders nothing (and the page reloads once
 * onto the current build) — an optional panel must not take the layout down.
 */
export function lazySlot<C extends ComponentType<never>>(
  loader: () => Promise<{ default: C }>
): C {
  const Lazy = lazy(() =>
    (
      loader as unknown as () => Promise<{ default: ComponentType<object> }>
    )().catch(() => {
      reloadOnceForStaleChunk();
      return { default: () => null };
    })
  );
  function LazySlot(props: object) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  // Same props as the wrapped component.
  return LazySlot as unknown as C;
}

/** Shown in the page area while a page chunk loads. */
export function PageFallback() {
  return (
    <div
      className="flex flex-1 items-center justify-center min-h-[50vh]"
      role="status"
      aria-label="Loading page"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}
