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
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

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

export function lazyPage<P extends object = object>(
  loader: Loader<P>,
  options: { prefetch?: boolean } = {}
): LazyExoticComponent<ComponentType<P>> {
  if (options.prefetch) {
    prefetchers.push(loader);
    schedulePrefetch();
  }
  return lazy(loader);
}

/** `lazyPage` for a named export. */
export function lazyNamed<M, K extends keyof M>(
  loader: () => Promise<M>,
  name: K,
  options: { prefetch?: boolean } = {}
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
 */
export function lazySlot<C extends ComponentType<never>>(
  loader: () => Promise<{ default: C }>
): C {
  const Lazy = lazy(
    loader as unknown as () => Promise<{ default: ComponentType<object> }>
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
