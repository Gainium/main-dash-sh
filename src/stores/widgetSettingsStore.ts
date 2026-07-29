import { pouchdbSync } from '@/lib/zustand-pouchdb-middleware';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  getDefaultWidgetSize,
  type Breakpoint,
} from '../components/widgets/DefaultWidgetSizes';

interface WidgetSettings {
  [widgetId: string]: {
    [key: string]: unknown;
  };
}

interface WidgetSettingsState {
  settings: WidgetSettings;

  // Actions
  setWidgetSetting: (widgetId: string, key: string, value: unknown) => void;
  getWidgetSetting: (
    widgetId: string,
    key: string,
    defaultValue?: unknown
  ) => unknown;
  resetWidgetSettings: (widgetId: string) => void;
  clearAllSettings: () => void;

  // Collapsed state management
  setWidgetCollapsed: (widgetId: string, collapsed: boolean) => void;
  getWidgetCollapsed: (widgetId: string) => boolean;

  // Original height management for collapsed widgets
  setWidgetOriginalHeight: (widgetId: string, height: number) => void;
  getWidgetOriginalHeight: (widgetId: string) => number | undefined;

  // Custom size management
  setWidgetHasCustomSize: (widgetId: string, hasCustomSize: boolean) => void;
  getWidgetHasCustomSize: (widgetId: string) => boolean;
  setWidgetCustomSize: (
    widgetId: string,
    width: number,
    height: number
  ) => void;
  getWidgetCustomSize: (
    widgetId: string
  ) => { w: number; h: number } | undefined;

  // Cleanup functions
  cleanupOrphanedSettings: (activeWidgetIds: string[]) => void;
  clearAllCustomSizes: () => void;
}

// Helper function to create a namespaced widget ID
export const createNamespacedWidgetId = (
  storeKey: string,
  widgetId: string
): string => {
  return `${storeKey}:${widgetId}`;
};

// Helper function to extract the original widget ID from a namespaced ID
export const extractOriginalWidgetId = (namespacedId: string): string => {
  const colonIndex = namespacedId.indexOf(':');
  return colonIndex !== -1
    ? namespacedId.substring(colonIndex + 1)
    : namespacedId;
};

// Helper function to extract the store key from a namespaced ID
export const extractStoreKey = (namespacedId: string): string => {
  const colonIndex = namespacedId.indexOf(':');
  return colonIndex !== -1 ? namespacedId.substring(0, colonIndex) : '';
};

export const useWidgetSettingsStore = create<WidgetSettingsState>()(
  pouchdbSync(
    devtools(
      persist(
        (set, get) => ({
          settings: {},

          setWidgetSetting: (widgetId, key, value) => {
            const state = get();
            set({
              settings: {
                ...state.settings,
                [widgetId]: {
                  ...state.settings[widgetId],
                  [key]: value,
                },
              },
            });

            // Dispatch custom event to notify widget managers of setting changes
            window.dispatchEvent(
              new CustomEvent('widgetSettingsChanged', {
                detail: { widgetId, setting: key, value },
              })
            );
          },

          getWidgetSetting: (widgetId, key, defaultValue = null) => {
            const state = get();
            return state.settings[widgetId]?.[key] ?? defaultValue;
          },

          resetWidgetSettings: (widgetId) => {
            const state = get();
            const newSettings = { ...state.settings };
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete newSettings[widgetId];
            set({ settings: newSettings });
          },

          clearAllSettings: () => set({ settings: {} }),

          // Collapsed state management
          setWidgetCollapsed: (widgetId, collapsed) => {
            const state = get();
            set({
              settings: {
                ...state.settings,
                [widgetId]: {
                  ...state.settings[widgetId],
                  collapsed,
                },
              },
            });
          },

          getWidgetCollapsed: (widgetId) => {
            const state = get();
            return Boolean(state.settings[widgetId]?.['collapsed']);
          },

          // Original height management
          setWidgetOriginalHeight: (widgetId, height) => {
            const state = get();
            set({
              settings: {
                ...state.settings,
                [widgetId]: {
                  ...state.settings[widgetId],
                  originalHeight: height,
                },
              },
            });
          },

          getWidgetOriginalHeight: (widgetId) => {
            const state = get();
            const height = state.settings[widgetId]?.['originalHeight'];
            return typeof height === 'number' ? height : undefined;
          },

          // Custom size management
          setWidgetHasCustomSize: (widgetId, hasCustomSize) => {
            const state = get();
            set({
              settings: {
                ...state.settings,
                [widgetId]: {
                  ...state.settings[widgetId],
                  hasCustomSize,
                },
              },
            });
          },

          getWidgetHasCustomSize: (widgetId) => {
            const state = get();
            return Boolean(state.settings[widgetId]?.['hasCustomSize']);
          },

          setWidgetCustomSize: (widgetId, width, height) => {
            const state = get();
            set({
              settings: {
                ...state.settings,
                [widgetId]: {
                  ...state.settings[widgetId],
                  hasCustomSize: true,
                  customSize: { w: width, h: height },
                },
              },
            });
          },

          getWidgetCustomSize: (widgetId) => {
            const state = get();
            const customSize = state.settings[widgetId]?.['customSize'];
            if (
              customSize &&
              typeof customSize === 'object' &&
              'w' in customSize &&
              'h' in customSize
            ) {
              return customSize as { w: number; h: number };
            }
            return undefined;
          },

          // Cleanup orphaned widget settings
          cleanupOrphanedSettings: (activeWidgetIds) => {
            const state = get();
            const activeIdSet = new Set(activeWidgetIds);
            const newSettings: WidgetSettings = {};

            // Only keep settings for widgets that still exist
            Object.keys(state.settings).forEach((widgetId) => {
              if (activeIdSet.has(widgetId)) {
                newSettings[widgetId] = state.settings[widgetId];
              }
            });

            set({ settings: newSettings });
          },

          // Clear all custom sizes (for default layout reset)
          clearAllCustomSizes: () => {
            const state = get();
            const newSettings: WidgetSettings = {};

            // Remove custom size related properties from all widgets
            Object.keys(state.settings).forEach((widgetId) => {
              const widgetSettings = { ...state.settings[widgetId] };
              delete widgetSettings['hasCustomSize'];
              delete widgetSettings['customSize'];

              // Only keep the settings if there are other properties remaining
              if (Object.keys(widgetSettings).length > 0) {
                newSettings[widgetId] = widgetSettings;
              }
            });

            set({ settings: newSettings });
          },
        }),
        {
          name: 'widget-settings-store',
          partialize: (state) => ({
            settings: state.settings,
          }),
        }
      ),
      {
        name: 'widget-settings-store',
      }
    ),
    {
      category: 'widgetSettings',
      selector: (state) =>
        Object.entries(state.settings).map(([widgetId, settings]) => ({
          id: widgetId,
          settings,
        })),
      debounceMs: 1500,
    }
  )
);

/**
 * Persist the sizes a layout pass produced so the grid actually renders them.
 *
 * `GridLayout` only honours a stored width/height when the widget is flagged as
 * custom-sized; otherwise it falls back to the breakpoint default. So a pass
 * that stretches a widget to fill a gap has to record that width, or the widget
 * gets drawn at its default width at the position computed for the wider one -
 * which is what left holes in the grid after "Tidy up".
 *
 * Sizes that match the breakpoint default are cleared rather than stored, so
 * widgets the pass did not resize stay fully responsive.
 */
export const syncCustomSizesFromLayout = (
  widgets: {
    id: string;
    type: string;
    layoutData: { w: number; h: number };
  }[],
  breakpoint: Breakpoint
): void => {
  const { setWidgetCustomSize, setWidgetHasCustomSize } =
    useWidgetSettingsStore.getState();

  widgets.forEach((widget) => {
    const defaultSize = getDefaultWidgetSize(widget.type, breakpoint);
    const { w, h } = widget.layoutData;

    if (w === defaultSize.w && h === defaultSize.h) {
      setWidgetHasCustomSize(widget.id, false);
    } else {
      setWidgetCustomSize(widget.id, w, h);
    }
  });
};
