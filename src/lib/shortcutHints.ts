import { SHORTCUT_IDS } from '@/config/shortcuts';
import { formatShortcut, useShortcutStore } from '@/stores/shortcutStore';
import { toast } from './toast';

// A shortcut hint is useless without a keyboard, so suppress it on phones and
// tablets. 1023px is the repo-wide tablet ceiling (see useResponsive); the
// coarse-pointer/no-hover pair catches a tablet held in landscape, which is
// wider than that, while a touchscreen laptop still reports hover from its
// trackpad and keeps its hints.
function isTouchLayout(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth <= 1023) return true;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse) and (hover: none)').matches
  );
}

// Features that have global shortcuts in the app - mapping to shortcut IDs
export type ShortcutFeature =
  | 'toggleDashboardManager'
  | 'toggleNotifications'
  | 'toggleAiChat'
  | 'toggleShortcutManager';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const memoryTimestamps: Partial<Record<ShortcutFeature, number>> = {};

function canShow(feature: ShortcutFeature): boolean {
  const key = `shortcutHint_lastShown_${feature}`;
  const now = Date.now();

  try {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    const last = raw ? parseInt(raw, 10) : memoryTimestamps[feature];
    if (last && now - last < COOLDOWN_MS) return false;
    return true;
  } catch {
    // Fallback to memory if localStorage not available
    const last = memoryTimestamps[feature];
    if (last && now - last < COOLDOWN_MS) return false;
    return true;
  }
}

function markShown(feature: ShortcutFeature): void {
  const key = `shortcutHint_lastShown_${feature}`;
  const now = Date.now();
  memoryTimestamps[feature] = now;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, String(now));
    }
  } catch {
    // Ignore if localStorage is unavailable
  }
}

export function showShortcutHint(feature: ShortcutFeature): void {
  // Do not show hints on phones or tablets
  if (isTouchLayout()) return;

  // Respect global disable flag
  try {
    const ss = useShortcutStore.getState();
    if (ss.disableShortcutHints) return;
  } catch {
    // ignore store access errors in non-browser contexts
  }

  if (!canShow(feature)) return;

  // Get the shortcut from the store directly
  const store = useShortcutStore.getState();
  const shortcuts = store.getAllShortcuts();
  // Map features to store shortcut ids
  const featureToId: Record<ShortcutFeature, string> = {
    toggleDashboardManager: SHORTCUT_IDS.ManagerDashboard,
    toggleNotifications: SHORTCUT_IDS.ActionNotifications,
    toggleAiChat: SHORTCUT_IDS.ActionChat,
    toggleShortcutManager: SHORTCUT_IDS.ManagerShortcuts,
  };
  const shortcutId = featureToId[feature];
  const shortcut = shortcuts.find((s) => s.id === shortcutId);

  // Do not show hints when the shortcut is missing, deleted, disabled, or has no key
  if (
    !shortcut ||
    shortcut.deleted ||
    !shortcut.enabled ||
    !shortcut.currentKey
  ) {
    return;
  }

  const display = formatShortcut(shortcut.currentKey);
  toast.info(`Next time, press "${display}"`);

  markShown(feature);
}

// Generic variant: show a shortcut hint for a given shortcut id (e.g., navigation items)
export function showShortcutHintById(shortcutId: string): void {
  if (!shortcutId) return;

  // Do not show hints on phones or tablets
  if (isTouchLayout()) return;

  // Respect global disable flag
  try {
    const ss = useShortcutStore.getState();
    if (ss.disableShortcutHints) return;
  } catch {
    // ignore store access errors in non-browser contexts
  }

  // Separate cooldown tracking per id to avoid spamming
  const key = `shortcutHint_lastShown_id_${shortcutId}`;
  const now = Date.now();
  try {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    const last = raw ? parseInt(raw, 10) : undefined;
    if (last && now - last < COOLDOWN_MS) return;
  } catch {
    // ignore
  }

  const store = useShortcutStore.getState();
  const shortcut = store.shortcuts[shortcutId];
  if (
    !shortcut ||
    shortcut.deleted ||
    !shortcut.enabled ||
    !shortcut.currentKey
  ) {
    return;
  }
  const display = formatShortcut(shortcut.currentKey);
  toast.info(`Next time, press "${display}"`);

  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, String(now));
    }
  } catch {
    // ignore
  }
}
