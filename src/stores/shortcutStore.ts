import { SHORTCUT_DEFAULTS } from '@/config/shortcuts';
import { isMacLike } from '@/lib/platform';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutKey {
  key: string;
  modifiers: {
    cmd?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
}

export interface ShortcutConfig {
  id: string;
  label: string;
  description: string;
  defaultKey: ShortcutKey;
  currentKey: ShortcutKey;
  enabled: boolean;
  category:
    | 'managers'
    | 'navigation'
    | 'actions'
    | 'dashboards'
    | 'templates'
    | 'panels'
    | 'custom';
  action: () => void;
  // Optional path (persisted) for navigation / custom shortcuts
  path?: string;
  // When true, this shortcut is considered removed by the user
  // and should not appear in UIs or be registered on the keyboard.
  deleted: boolean;
}

interface ShortcutStore {
  shortcuts: Record<string, ShortcutConfig>;
  isRecording: string | null; // ID of shortcut being recorded

  // Global options
  disableShortcutHints: boolean; // When true, suppress all shortcut hint toasts

  // Actions
  updateShortcut: (id: string, key: ShortcutKey) => void;
  resetShortcut: (id: string) => void;
  resetAllShortcuts: () => void;
  toggleShortcut: (id: string) => void;
  deleteShortcut: (id: string) => void;
  startRecording: (id: string) => void;
  stopRecording: () => void;
  setDisableShortcutHints: (disabled: boolean) => void;
  registerShortcut: (shortcut: ShortcutConfig) => void;
  // Register many at once, preserving currentKey/enabled if existing. Avoids unnecessary updates.
  bulkRegisterShortcuts: (
    defaults: Omit<ShortcutConfig, 'action'>[],
    actions: Record<string, () => void>
  ) => void;
  getShortcutsByCategory: (
    category: ShortcutConfig['category']
  ) => ShortcutConfig[];
  getAllShortcuts: () => ShortcutConfig[];
}

export const useShortcutStore = create<ShortcutStore>()(
  persist(
    (set, get) => ({
      shortcuts: {},
      isRecording: null,
      // Default global options
      disableShortcutHints: false,

      updateShortcut: (id: string, key: ShortcutKey) => {
        if (!get().shortcuts[id]) return;
        set((state) => ({
          shortcuts: {
            ...state.shortcuts,
            [id]: {
              ...state.shortcuts[id],
              currentKey: key,
              enabled: true,
              deleted: false,
            },
          },
        }));
      },

      resetShortcut: (id: string) => {
        if (!get().shortcuts[id]) return;
        set((state) => {
          // For dynamic per-dashboard shortcuts, "reset" should clear (disable) rather than enable
          if (id.startsWith('nav-dashboard-')) {
            return {
              shortcuts: {
                ...state.shortcuts,
                [id]: {
                  ...state.shortcuts[id],
                  // keep currentKey as-is or defaultKey, but disabled so it doesn't show or trigger
                  enabled: false,
                  deleted: false,
                },
              },
            };
          }
          const defaultShortcut = SHORTCUT_DEFAULTS.find((d) => d.id === id);
          const defaultKey =
            defaultShortcut?.defaultKey || state.shortcuts[id].defaultKey;
          return {
            shortcuts: {
              ...state.shortcuts,
              [id]: {
                ...state.shortcuts[id],
                currentKey: defaultKey,
                enabled: true,
                deleted: false,
              },
            },
          };
        });
      },

      resetAllShortcuts: () => {
        set((state) => {
          const next: Record<string, ShortcutConfig> = {};
          for (const [id, sc] of Object.entries(state.shortcuts)) {
            const defaultShortcut = SHORTCUT_DEFAULTS.find((d) => d.id === id);
            const defaultKey = defaultShortcut?.defaultKey || sc.defaultKey;
            // For dynamic per-dashboard shortcuts, do not enable on reset-all
            if (id.startsWith('nav-dashboard-')) {
              next[id] = {
                ...sc,
                currentKey: sc.currentKey || defaultKey,
                enabled: false,
                deleted: false,
              };
            } else {
              next[id] = {
                ...sc,
                currentKey: defaultKey,
                enabled: true,
                deleted: false,
              };
            }
          }
          return { shortcuts: next };
        });
      },

      toggleShortcut: (id: string) => {
        if (!get().shortcuts[id]) return;
        set((state) => ({
          shortcuts: {
            ...state.shortcuts,
            [id]: {
              ...state.shortcuts[id],
              enabled: !state.shortcuts[id].enabled,
            },
          },
        }));
      },

      deleteShortcut: (id: string) => {
        // Callers delete ids that may never have been registered (a bot
        // template without a shortcut, legacy ids); spreading an absent
        // entry would persist a stub with no label/category.
        if (!get().shortcuts[id]) return;
        set((state) => {
          // Remove custom nav shortcuts completely instead of marking deleted
          if (id.startsWith('nav-custom-')) {
            const { [id]: _, ...rest } = state.shortcuts;
            return {
              shortcuts: rest,
            };
          }
          return {
            shortcuts: {
              ...state.shortcuts,
              [id]: {
                ...state.shortcuts[id],
                enabled: false,
                deleted: true,
              },
            },
          };
        });
      },

      startRecording: (id: string) => {
        set({ isRecording: id });
      },

      stopRecording: () => {
        set({ isRecording: null });
      },

      setDisableShortcutHints: (disabled: boolean) => {
        set({ disableShortcutHints: disabled });
      },

      registerShortcut: (shortcut: ShortcutConfig) => {
        set((state) => {
          const existingShortcut = state.shortcuts[shortcut.id];
          // If shortcut exists, preserve the current key but update the action
          const updatedShortcut = existingShortcut
            ? {
                ...shortcut,
                // Preserve user-customized values
                currentKey: existingShortcut.currentKey || shortcut.currentKey,
                enabled:
                  typeof existingShortcut.enabled === 'boolean'
                    ? existingShortcut.enabled
                    : shortcut.enabled,
                deleted:
                  typeof existingShortcut.deleted === 'boolean'
                    ? existingShortcut.deleted
                    : false,
              }
            : shortcut;

          return {
            shortcuts: {
              ...state.shortcuts,
              [shortcut.id]: updatedShortcut,
            },
          };
        });
      },

      bulkRegisterShortcuts: (
        defaults: Omit<ShortcutConfig, 'action'>[],
        actions: Record<string, () => void>
      ) => {
        const current = get().shortcuts;
        // Build next state but only commit if something actually changes
        let changed = false;
        const next: Record<string, ShortcutConfig> = { ...current };

        for (const def of defaults) {
          const existing = current[def.id];
          const action = actions[def.id];
          if (existing) {
            // Sync action and metadata from defaults while preserving user choices:
            // - Always update: action, label, description, category, defaultKey (source of truth)
            // - Preserve: currentKey, enabled, deleted (user preferences)
            // - If user never customized (currentKey === previous defaultKey) and defaultKey changed,
            //   migrate currentKey to the new default for a seamless update.

            const mustUpdateAction = existing.action !== action;
            const mustUpdateDefaultKey = !areShortcutKeysEqual(
              existing.defaultKey,
              def.defaultKey
            );
            const mustUpdateLabel = existing.label !== def.label;
            const mustUpdateDescription =
              existing.description !== def.description;
            const mustUpdateCategory = existing.category !== def.category;
            const mustUpdatePath = existing.path !== def.path;

            if (
              mustUpdateAction ||
              mustUpdateDefaultKey ||
              mustUpdateLabel ||
              mustUpdateDescription ||
              mustUpdateCategory ||
              mustUpdatePath
            ) {
              const pathValue = def.path ?? existing.path;

              const migrated: ShortcutConfig = {
                ...existing,
                action,
                label: def.label,
                description: def.description,
                category: def.category,
                defaultKey: def.defaultKey,
                // If the default includes a path (e.g. navigation defaults), update it
                // so the UI can render it even for pre-existing persisted shortcuts
                ...(pathValue !== undefined ? { path: pathValue } : {}),
              };

              // If default changed and user hadn't customized, migrate current to new default
              if (
                mustUpdateDefaultKey &&
                areShortcutKeysEqual(existing.currentKey, existing.defaultKey)
              ) {
                migrated.currentKey = def.defaultKey;
              }

              next[def.id] = migrated;
              changed = true;
            }
          } else {
            next[def.id] = { ...(def as ShortcutConfig), action };
            changed = true;
          }
        }

        if (!changed) return; // no-op to avoid re-renders/effect loops
        set({ shortcuts: next });
      },

      getShortcutsByCategory: (category: ShortcutConfig['category']) => {
        const state = get();
        return Object.values(state.shortcuts).filter(
          (shortcut) => shortcut.category === category
        );
      },

      getAllShortcuts: () => {
        const state = get();
        return Object.values(state.shortcuts);
      },
    }),
    {
      name: 'shortcut-settings',
      partialize: (state) => ({
        disableShortcutHints: state.disableShortcutHints,
        shortcuts: Object.fromEntries(
          Object.entries(state.shortcuts).map(([id, shortcut]) => [
            id,
            {
              id: shortcut.id,
              label: shortcut.label,
              description: shortcut.description,
              defaultKey: shortcut.defaultKey,
              currentKey: shortcut.currentKey,
              enabled: shortcut.enabled,
              category: shortcut.category,
              deleted: shortcut.deleted,
              // Persist any associated path for custom navigation shortcuts
              path: shortcut.path,
              // Don't persist the action function
            },
          ])
        ),
      }),
      // Drop stubs persisted by older builds (entries with no label or
      // category); defaults are re-registered with full metadata on boot.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ShortcutStore>;
        if (!p.shortcuts) return { ...current, ...p };
        return {
          ...current,
          ...p,
          shortcuts: Object.fromEntries(
            Object.entries(p.shortcuts).filter(
              ([, sc]) =>
                typeof sc?.label === 'string' &&
                typeof sc?.category === 'string'
            )
          ),
        };
      },
    }
  )
);

// Helper function to format shortcut for display
export function formatShortcut(shortcutKey: ShortcutKey): string {
  const isMac = isMacLike();

  const parts: string[] = [];

  if (shortcutKey.modifiers.ctrl) parts.push(isMac ? '^' : 'Ctrl');
  if (shortcutKey.modifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (shortcutKey.modifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (shortcutKey.modifiers.cmd) parts.push(isMac ? '⌘' : 'Win');

  // Map Arrow keys to glyphs
  const arrowMap: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  const keyPart = arrowMap[shortcutKey.key] || shortcutKey.key.toUpperCase();
  // Add the key
  parts.push(keyPart);

  return parts.join(isMac ? '' : '+');
}

// Helper function to check if two shortcut keys are equal
export function areShortcutKeysEqual(a: ShortcutKey, b: ShortcutKey): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.modifiers.cmd === !!b.modifiers.cmd &&
    !!a.modifiers.ctrl === !!b.modifiers.ctrl &&
    !!a.modifiers.shift === !!b.modifiers.shift &&
    !!a.modifiers.alt === !!b.modifiers.alt
  );
}
