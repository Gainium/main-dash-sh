import logger from '@/lib/loggerInstance';
import { isMacLike } from '@/lib/platform';
import { useShortcutStore } from '@/stores/shortcutStore';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

/**
 * Priority levels for keyboard shortcuts
 * Higher numbers = higher priority (handled first)
 */
export enum ShortcutPriority {
  GLOBAL = 100, // Global shortcuts like notifications, chat
  PAGE = 50, // Page-specific shortcuts like widget manager
  WIDGET = 25, // Widget-specific shortcuts
  LOW = 10, // Lowest priority shortcuts
}

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers: {
    cmd?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
  callback: () => void;
  priority: ShortcutPriority;
  enabled: boolean;
  allowInInputs?: boolean; // Whether to allow this shortcut when focused on inputs
  description?: string;
}

/**
 * Keyboard shortcut manager state
 */
interface KeyboardShortcutManagerState {
  shortcuts: Map<string, KeyboardShortcut>;
  registerShortcut: (shortcut: KeyboardShortcut) => void;
  unregisterShortcut: (id: string) => void;
  updateShortcut: (id: string, updates: Partial<KeyboardShortcut>) => void;
  getShortcutsByPriority: () => KeyboardShortcut[];
}

/**
 * Global keyboard shortcut manager store
 */
export const useKeyboardShortcutManagerStore =
  create<KeyboardShortcutManagerState>((set, get) => ({
    shortcuts: new Map(),

    registerShortcut: (shortcut: KeyboardShortcut) => {
      set((state) => {
        const newShortcuts = new Map(state.shortcuts);
        newShortcuts.set(shortcut.id, shortcut);
        return { shortcuts: newShortcuts };
      });
    },

    unregisterShortcut: (id: string) => {
      set((state) => {
        const newShortcuts = new Map(state.shortcuts);
        newShortcuts.delete(id);
        return { shortcuts: newShortcuts };
      });
    },

    updateShortcut: (id: string, updates: Partial<KeyboardShortcut>) => {
      set((state) => {
        const newShortcuts = new Map(state.shortcuts);
        const existing = newShortcuts.get(id);
        if (existing) {
          newShortcuts.set(id, { ...existing, ...updates });
        }
        return { shortcuts: newShortcuts };
      });
    },

    getShortcutsByPriority: () => {
      return Array.from(get().shortcuts.values())
        .filter((shortcut) => shortcut.enabled)
        .sort((a, b) => b.priority - a.priority);
    },
  }));

/**
 * Helper function to check if modifiers match
 */
function modifiersMatch(
  event: KeyboardEvent,
  modifiers: KeyboardShortcut['modifiers']
): boolean {
  const isMac = isMacLike();

  // Handle cmd modifier: on Mac it's metaKey, on PC it's ctrlKey
  if (modifiers.cmd) {
    const cmdPressed = isMac ? event.metaKey : event.ctrlKey;
    if (!cmdPressed) return false;
  } else {
    // If cmd is not expected, make sure it's not pressed
    const cmdPressed = isMac ? event.metaKey : false; // On PC, cmd doesn't exist separately
    if (cmdPressed) return false;
  }

  // Handle ctrl modifier: always maps to ctrlKey
  if (modifiers.ctrl) {
    if (!event.ctrlKey) return false;
  } else {
    // If ctrl is not expected, make sure it's not pressed (unless cmd is expected on PC)
    if (event.ctrlKey && !(modifiers.cmd && !isMac)) return false;
  }

  // Handle shift modifier
  if (modifiers.shift) {
    if (!event.shiftKey) return false;
  } else {
    if (event.shiftKey) return false;
  }

  // Handle alt modifier
  if (modifiers.alt) {
    if (!event.altKey) return false;
  } else {
    if (event.altKey) return false;
  }

  return true;
}

/**
 * Widgets that consume a plain typed character for themselves. A native
 * `<select>` and every dropdown we build have type-ahead, so an unmodified
 * letter belongs to the open list, not to the navigation layer.
 *
 * Matched against the target's own ancestry rather than a trigger's subtree:
 * an open list is rendered through a portal at the end of `<body>`, so the
 * focused option is nowhere underneath the field it belongs to. The trigger
 * itself (`combobox`) counts too — a closed but focused dropdown still
 * type-aheads.
 */
const TYPEAHEAD_ROLE_SELECTOR = [
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
].join(',');

/**
 * Helper function to check if target element should block shortcuts
 */
function shouldBlockShortcut(
  target: EventTarget | null,
  allowInInputs = false
): boolean {
  if (allowInInputs) return false;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return true;
  }

  return (
    target instanceof Element && target.closest(TYPEAHEAD_ROLE_SELECTOR) !== null
  );
}

/**
 * Global keyboard shortcut manager
 * This creates a single event listener and manages all shortcuts centrally
 */
export function useKeyboardShortcutManager() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // If the Shortcut Manager is recording a key, do not process any global shortcuts
    try {
      const recordingId = useShortcutStore.getState().isRecording;
      if (recordingId) {
        return; // Let the recorder handle this event
      }
    } catch {
      // ignore store access errors in non-browser contexts
    }
    // Get shortcuts directly from store to avoid dependency issues
    const shortcuts = useKeyboardShortcutManagerStore
      .getState()
      .getShortcutsByPriority();

    for (const shortcut of shortcuts) {
      // Check if this shortcut matches the pressed key
      if (
        shortcut.key.toLowerCase() === event.key.toLowerCase() &&
        modifiersMatch(event, shortcut.modifiers)
      ) {
        // Check if we should block this shortcut due to input focus
        if (shouldBlockShortcut(event.target, shortcut.allowInInputs)) {
          continue;
        }

        // Execute the shortcut
        event.preventDefault();
        event.stopPropagation();
        if (import.meta.env.DEV) {
          console.debug('[keys] matched', shortcut);
        }
        shortcut.callback();

        // Stop processing after first match (highest priority wins)
        return;
      }
    }
  }, []); // Empty dependency array since we get shortcuts directly from store

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    if (import.meta.env.DEV) {
      logger.debug('[keys] listener attached');
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (import.meta.env.DEV) {
        logger.debug('[keys] listener removed');
      }
    };
  }, [handleKeyDown]);
}

/**
 * Hook to register keyboard shortcuts with the manager
 */
export function useKeyboardShortcuts(
  shortcuts: Omit<KeyboardShortcut, 'id'>[],
  componentId: string
) {
  const { registerShortcut, unregisterShortcut } =
    useKeyboardShortcutManagerStore();

  useEffect(() => {
    // Register all shortcuts with unique IDs
    const shortcutIds: string[] = [];

    shortcuts.forEach((shortcut, index) => {
      const id = `${componentId}-${index}`;
      registerShortcut({ ...shortcut, id });
      shortcutIds.push(id);
    });

    // Cleanup on unmount
    return () => {
      shortcutIds.forEach((id) => unregisterShortcut(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, componentId]);
}

/**
 * Pre-defined global shortcuts
 */
// Deprecated: static global defaults moved to config/shortcuts and store
