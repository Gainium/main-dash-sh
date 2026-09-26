/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getPwaUpdateUrgentIdleMs,
  subscribePwaUpdateUrgency,
} from '@/lib/pwaUpdateUrgency';

// A pending bundle update is applied only when the user clicks "Update Now".
// The one exception is an imminent maintenance window (cloud), which raises an
// urgency via the store below: then it is auto-applied at the next SAFE moment
// — the tab going hidden, or the user being input-idle for that long.
const IDLE_CHECK_INTERVAL_MS = 5_000;

interface PWAUpdateState {
  updateAvailable: boolean;
  updateInstalled: boolean;
  updateServiceWorker: () => void;
}

interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
  dismissInstall: () => void;
}

interface NetworkState {
  isOnline: boolean;
  isOffline: boolean;
  showBackOnline?: boolean;
}

// ---------------------------------------------------------------------------
// New-version detection (no service worker)
//
// The app used to rely on the service worker update cycle for "Update Now".
// The worker never cached anything useful (its generated routes threw at
// startup), so it is retired: `public/sw.js` now unregisters itself, and a new
// deployment is detected by re-reading index.html — which is served uncached —
// and comparing its entry script with the one this page booted from.
//
// One module-level watcher, shared by every usePWAUpdate() instance: a single
// poll timer and one visibility listener, started with the first subscriber
// and stopped with the last (the per-mount interval and listeners used to
// leak on every remount).
// ---------------------------------------------------------------------------

const VERSION_POLL_MS = 5 * 60_000;

const ENTRY_SCRIPT_RE =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/i;

/** Entry module script of an HTML document (exported for tests). */
export function entryScriptFromHtml(html: string): string | null {
  const m = ENTRY_SCRIPT_RE.exec(html);
  return (m && (m[1] || m[2])) || null;
}

function currentEntryScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]'
  );
  if (!el) return null;
  // Compare paths as they appear in index.html.
  try {
    return new URL(el.src, location.href).pathname;
  } catch {
    return el.getAttribute('src');
  }
}

let newVersionAvailable = false;
const versionListeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let checking = false;
let legacyWorkersRetired = false;

async function checkForNewVersion(): Promise<void> {
  if (checking || newVersionAvailable) return;
  checking = true;
  try {
    const res = await fetch('/', {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return;
    const latest = entryScriptFromHtml(await res.text());
    const current = currentEntryScript();
    if (latest && current) {
      const latestPath = new URL(latest, location.href).pathname;
      if (latestPath !== current) {
        newVersionAvailable = true;
        versionListeners.forEach((l) => l());
      }
    }
  } catch {
    // Offline / transient — try again on the next tick.
  } finally {
    checking = false;
  }
}

const onVisibleCheck = () => {
  if (document.visibilityState === 'visible') void checkForNewVersion();
};

function retireLegacyServiceWorkers(): void {
  if (legacyWorkersRetired || !('serviceWorker' in navigator)) return;
  legacyWorkersRetired = true;
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
}

function subscribeVersion(listener: () => void): () => void {
  versionListeners.add(listener);
  if (versionListeners.size === 1 && !import.meta.env.DEV) {
    retireLegacyServiceWorkers();
    pollTimer = setInterval(() => void checkForNewVersion(), VERSION_POLL_MS);
    document.addEventListener('visibilitychange', onVisibleCheck);
  }
  return () => {
    versionListeners.delete(listener);
    if (versionListeners.size === 0) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      document.removeEventListener('visibilitychange', onVisibleCheck);
    }
  };
}

const getVersionSnapshot = () => newVersionAvailable;

export function usePWAUpdate(): PWAUpdateState {
  const updateAvailable = useSyncExternalStore(
    subscribeVersion,
    getVersionSnapshot,
    getVersionSnapshot
  );

  // Maintenance (cloud) can lower the idle threshold via this external store so
  // stale clients refresh promptly before a scheduled outage. Null = default.
  const urgentIdleMs = useSyncExternalStore(
    subscribePwaUpdateUrgency,
    getPwaUpdateUrgentIdleMs,
    getPwaUpdateUrgentIdleMs
  );

  // Don't show update prompts in development mode - Vite HMR causes false positives
  const isDev = import.meta.env.DEV;

  // index.html is never cached, so a reload boots the new bundle.
  const applyWaitingUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  // During a maintenance window only: auto-apply a pending update at the next
  // SAFE moment so stale clients pick up the maintenance UI before the outage.
  // "Safe" = the tab is hidden (user switched away) OR the user has been
  // input-idle for `urgentIdleMs`. Outside a window nothing happens until the
  // user clicks "Update Now" (PWAStatus).
  useEffect(() => {
    if (isDev || !updateAvailable || urgentIdleMs == null) return;

    const idleMs = urgentIdleMs;
    let lastActivityMs = Date.now();
    const markActive = () => {
      lastActivityMs = Date.now();
    };
    const activityEvents = [
      'keydown',
      'pointerdown',
      'touchstart',
      'wheel',
      'mousemove',
      'scroll',
    ];
    activityEvents.forEach((e) =>
      window.addEventListener(e, markActive, { passive: true })
    );

    const check = () => {
      if (
        document.visibilityState === 'hidden' ||
        Date.now() - lastActivityMs >= idleMs
      ) {
        cleanup();
        applyWaitingUpdate();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const intervalId = setInterval(check, IDLE_CHECK_INTERVAL_MS);

    function cleanup() {
      clearInterval(intervalId);
      activityEvents.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
    }

    // If the tab is already hidden when the update lands, apply right away.
    if (document.visibilityState === 'hidden') check();

    return cleanup;
  }, [updateAvailable, urgentIdleMs, isDev, applyWaitingUpdate]);

  return {
    updateAvailable: !isDev && updateAvailable,
    // No service worker installs anything any more.
    updateInstalled: false,
    updateServiceWorker: applyWaitingUpdate,
  };
}

export function useNetworkStatus(): NetworkState {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      // Hide the "back online" message after 3 seconds
      setTimeout(() => setShowBackOnline(false), 3000);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    showBackOnline,
  };
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed the install prompt
    const dismissedTimestamp = localStorage.getItem('pwa-install-dismissed');
    const isDismissedRecently =
      dismissedTimestamp &&
      Date.now() - parseInt(dismissedTimestamp) < 7 * 24 * 60 * 60 * 1000; // 7 days

    setIsDismissed(!!isDismissedRecently);

    // Check if app is already installed
    const checkIfInstalled = () => {
      // Check if running in standalone mode (installed PWA)
      const isStandalone = window.matchMedia(
        '(display-mode: standalone)'
      ).matches;
      // Check if running in browser with navigator.standalone (iOS Safari)
      const isIOSStandalone = (window.navigator as any).standalone === true;

      // Check install status

      setIsInstalled(isStandalone || isIOSStandalone);
    };

    checkIfInstalled();

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Install prompt available
      setDeferredPrompt(e);

      // Only show if not recently dismissed
      if (!isDismissedRecently) {
        setCanInstall(true);
      }
    };

    // Listen for app installation
    const handleAppInstalled = () => {
      // App was installed
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      setIsDismissed(false);
      // Clear dismissal since app is now installed
      localStorage.removeItem('pwa-install-dismissed');
    };

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check display mode changes (for when user installs/uninstalls)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      checkIfInstalled();
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);

      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      // No install prompt available
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    // Handle user response to install prompt

    if (outcome === 'accepted') {
      // User accepted the install prompt
      // Clear dismissal since user chose to install
      localStorage.removeItem('pwa-install-dismissed');
    } else {
      // User dismissed the install prompt
      // Store dismissal timestamp
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
      setIsDismissed(true);
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  const dismissInstall = () => {
    // Install prompt dismissed by user
    setCanInstall(false);
    setDeferredPrompt(null);
    setIsDismissed(true);

    // Store dismissal timestamp in localStorage
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  return {
    canInstall: canInstall && !isInstalled && !isDismissed,
    isInstalled,
    promptInstall,
    dismissInstall,
  };
}
