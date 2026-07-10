/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPwaUpdateUrgentIdleMs,
  subscribePwaUpdateUrgency,
} from '@/lib/pwaUpdateUrgency';

// A pending bundle update is auto-applied at the next SAFE moment instead of an
// immediate reload: the tab going hidden, or the user being input-idle (no
// keyboard/pointer/scroll) for this long while the tab is visible. Never
// interrupts active use. Maintenance (cloud) lowers this via the urgency store.
const DEFAULT_IDLE_MS = 60_000;
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

export function usePWAUpdate(): PWAUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInstalled, setUpdateInstalled] = useState(false);
  // Held in a ref (not state) so the idle auto-apply effect can reach the
  // current registration without re-arming, and nothing re-renders on it.
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Maintenance (cloud) can lower the idle threshold via this external store so
  // stale clients refresh promptly before a scheduled outage. Null = default.
  const [urgentIdleMs, setUrgentIdleMs] = useState<number | null>(
    getPwaUpdateUrgentIdleMs
  );
  useEffect(
    () =>
      subscribePwaUpdateUrgency(() =>
        setUrgentIdleMs(getPwaUpdateUrgentIdleMs())
      ),
    []
  );

  // Don't show update prompts in development mode - Vite HMR causes false positives
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // In dev a service worker must NEVER control the page (it serves stale
    // precached bundles and can't self-update). Teardown of any leftover SW
    // happens at app entry via unregisterServiceWorkersInDev() in main.tsx;
    // here we simply never register one.
    if (isDev) return;

    // Only a genuine UPDATE (a new SW replacing an existing controller) should
    // force a reload. On a user's first visit the initial SW claims the page
    // (clientsClaim) and ALSO fires controllerchange — reloading then would
    // bounce a freshly-loaded page for no reason. This flag flips true only when
    // an installing worker appears while a controller already exists.
    let reloadOnControllerChange = false;

    const registerAndListen = async () => {
      try {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
        }

        registrationRef.current = reg;

        if (reg.waiting) {
          setUpdateAvailable(true);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          // A controller already present means this is an update, not the
          // first install — so a subsequent controllerchange should reload.
          if (navigator.serviceWorker.controller) {
            reloadOnControllerChange = true;
          }
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
            if (newWorker.state === 'activated') {
              setUpdateInstalled(true);
              setTimeout(() => setUpdateInstalled(false), 3000);
            }
          });
        });

        // Poll for a new deployment so long-lived SPA sessions still update.
        setInterval(() => {
          reg.update();
        }, 60000);
      } catch (error) {
        console.error('PWA: Service worker registration failed', error);
      }
    };

    registerAndListen();

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadOnControllerChange) return;
      setUpdateInstalled(true);
      setTimeout(() => {
        setUpdateInstalled(false);
        window.location.reload();
      }, 1000);
    });
  }, [isDev]);

  const applyWaitingUpdate = useCallback(() => {
    const reg = registrationRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
    }
  }, []);

  // Auto-apply a pending update at the next SAFE moment rather than forcing an
  // immediate reload that could interrupt a bot-create or any in-progress form.
  // "Safe" = the tab is hidden (user switched away) OR the user has been
  // input-idle for `idleMs`. `applyWaitingUpdate` posts SKIP_WAITING; the SW's
  // controllerchange handler above then reloads onto the fresh bundle. The
  // manual "update now" button (PWAStatus) still applies immediately.
  useEffect(() => {
    if (isDev || !updateAvailable) return;

    const idleMs = urgentIdleMs ?? DEFAULT_IDLE_MS;
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
    updateAvailable,
    updateInstalled,
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
