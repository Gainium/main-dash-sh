import logger from './loggerInstance';

/**
 * Clear all application caches (Service Worker, HTTP, and localStorage)
 * This only clears service worker / HTTP caches and sessionStorage.
 * Zustand persist stores (localStorage & IndexedDB) are NOT touched
 * because wiping them causes the user to lose UI preferences, rulebooks,
 * announcement state, and other important local data.
 */
export async function clearAllCaches(): Promise<void> {
  logger.warn(
    '[CacheManager] Clearing application caches due to loading issues'
  );

  try {
    // Clear Service Worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          logger.info(`[CacheManager] Clearing cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => {
          logger.info('[CacheManager] Unregistering service worker');
          return registration.unregister();
        })
      );
    }

    // Clear sessionStorage (non-persistent by nature)
    sessionStorage.clear();

    // NOTE: We intentionally do NOT clear localStorage or IndexedDB here.
    // Zustand persisted stores live there and clearing them causes data loss
    // (visual settings, announcement state, rulebooks, panel widths, etc.).

    logger.info(
      '[CacheManager] Service-worker and session caches cleared successfully'
    );

    // Force reload after clearing caches
    window.location.reload();
  } catch (error) {
    logger.error('[CacheManager] Error clearing caches', error);
    // Force reload anyway
    window.location.reload();
  }
}

/**
 * Dev-only: ensure no service worker controls localhost.
 *
 * A leftover SW from a prior production build / `npm run preview` on localhost
 * keeps serving its stale precached bundles, and Vite serves no real /sw.js in
 * dev so the SW can never update itself — a permanent stale-cache dead end that
 * presents as "my code change isn't showing up". Unregister everything and clear
 * the SW caches once (one self-healing reload); a no-op when already clean.
 *
 * Call this as early as possible at app entry, before rendering.
 */
export async function unregisterServiceWorkersInDev(): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return;
    await Promise.all(registrations.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    logger.warn(
      '[CacheManager] Removed a stale dev service worker + caches; reloading onto fresh code'
    );
    window.location.reload();
  } catch (error) {
    logger.error(
      '[CacheManager] Failed to remove dev service worker',
      error
    );
  }
}

// Keep a reference so we can cancel previous watchdogs on HMR re-execution
let watchdogTimeoutId: ReturnType<typeof setTimeout> | null = null;
let watchdogCheckId: ReturnType<typeof setTimeout> | null = null;

/**
 * Check if the app is stuck in a loading state and clear caches if needed.
 *
 * IMPORTANT: This is disabled in development mode because Vite HMR temporarily
 * empties / re-renders the root element, which the watchdog misinterprets as a
 * stuck loading state and clears all caches — wiping user data.
 */
export function initLoadingWatchdog(): void {
  // --- Skip in development ---
  if (import.meta.env.DEV) {
    logger.info('[CacheManager] Loading watchdog skipped (dev mode)');
    return;
  }

  // Cancel any previous watchdog (safety for unlikely prod re-init)
  if (watchdogTimeoutId) clearTimeout(watchdogTimeoutId);
  if (watchdogCheckId) clearTimeout(watchdogCheckId);

  // "Loaded" means the root has rendered anything at all. Do not look for the
  // word "loading" in the markup: rendered pages contain it legitimately
  // (`<img loading="lazy">`, "Error loading …", article text), which kept the
  // probe failing and reloaded those pages every 15 seconds.
  const appHasRendered = () =>
    Boolean(document.getElementById('root')?.innerHTML.trim());

  // If the app hasn't rendered after 15 seconds, clear caches
  watchdogTimeoutId = setTimeout(() => {
    if (!appHasRendered()) {
      logger.warn(
        '[CacheManager] App appears stuck in loading state, clearing caches'
      );
      clearAllCaches();
    }
  }, 15000);

  // Clear timeout if app loads successfully
  const checkAppLoaded = () => {
    if (appHasRendered()) {
      if (watchdogTimeoutId) clearTimeout(watchdogTimeoutId);
      logger.info('[CacheManager] App loaded successfully');
    } else {
      // Check again after a short delay
      watchdogCheckId = setTimeout(checkAppLoaded, 1000);
    }
  };

  // Start checking after initial load
  watchdogCheckId = setTimeout(checkAppLoaded, 3000);
}

/**
 * Add manual cache clear trigger (for development/debugging)
 */
export function addManualClearTrigger(): void {
  // Add keyboard shortcut: Ctrl+Shift+F5 to clear caches
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'F5') {
      event.preventDefault();
      logger.info('[CacheManager] Manual cache clear triggered');
      clearAllCaches();
    }
  });

  // Add to window for console access
  (window as { clearAppCaches?: () => Promise<void> }).clearAppCaches =
    clearAllCaches;
  logger.info(
    '[CacheManager] Manual cache clear available: window.clearAppCaches() or Ctrl+Shift+F5'
  );
}
