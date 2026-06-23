import { DEFAULT_VISIBLE_NAV_IDS } from '@/components/layout/NavigationSidebarV2/navigationConfig';
import type { NavLayoutSection } from '@/components/layout/navigationLayout';
import { logger } from '@/lib/loggerInstance';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface CustomNavItem {
  id: string;
  name: string;
  url: string;
  icon: string; // lucide icon name
  shortcut?: string; // optional shortcut key combination
  createdAt: number;
}

interface UIState {
  // Navigation sidebar states
  navigationSidebarSections: Record<string, boolean>;
  navigationSubmenuItems: Record<string, boolean>;
  // Which V1 sidebar items the user has enabled (keyed by item `id`).
  // Items not present in the map fall back to `defaultNavigationItemsEnabled`.
  navigationItemsEnabled: Record<string, boolean>;

  // User-customized V1 sidebar layout (section order, item order, item→section
  // assignment, custom sections). `null` means "follow the default layout".
  // Reconciled against the live item registry at render time.
  navigationLayout: NavLayoutSection[] | null;

  // Navigation version (V1 or V2)
  useNavigationV2: boolean;
  // V2 left nav customizations
  leftNavVisibleIds: string[]; // which nav item ids are visible in the left sidebar
  leftNavOrder: string[]; // order of items in left sidebar
  leftNavShowLabels: boolean; // whether labels are shown (Icons & Labels)
  leftNavLabelOverrides: Record<string, string>; // custom labels keyed by nav item id
  customNavItems: CustomNavItem[]; // user-created custom nav items

  // Settings sidebar states
  settingsSidebarSections: Set<string>;

  // Trading mode state (controlled by usePaperContext hook)
  isLiveTrading: boolean;
  tradingMode: 'live' | 'paper' | 'demo';
  setTradingMode: (isLive: boolean) => void;
  setTradingModeValue: (mode: 'live' | 'paper' | 'demo') => void;

  // Mobile navigation state
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (isOpen: boolean) => void;
  toggleMobileSidebar: () => void;

  // Widget controls visibility
  controlsAlwaysVisible: boolean;
  toggleControlsAlwaysVisible: () => void;

  // Widget selection state
  selectedWidgetId: string | null;
  setSelectedWidget: (widgetId: string | null) => void;

  // Control bar expand state
  isControlBarExpanded: boolean;
  toggleControlBarExpanded: () => void;

  // Navigation sidebar pinned state
  navigationSidebarPinned: boolean;
  toggleNavigationSidebarPinned: () => void;
  setNavigationSidebarPinned: (pinned: boolean) => void;

  // Navigation sidebar hidden state — sidebar is fully hidden until the
  // user hovers the left edge of the viewport; when shown it appears as
  // an overlay (does not shift content) in its expanded form.
  navigationSidebarHidden: boolean;
  setNavigationSidebarHidden: (hidden: boolean) => void;

  // Navigation secondary panel pinned state (controls whether secondary panel pushes content)
  navigationSecondaryPinned: boolean;
  // Navigation secondary active panel (persisted so panel stays open when pinned across navigation)
  navigationActivePanel: string | null;

  // Navigation V2 customization
  navigationV2VisibleIds: string[];
  navigationV2Order: string[];
  navigationV2ShowLabels: boolean; // Icons only vs Icons & Labels

  // Fullscreen widget state
  fullscreenWidget: {
    widgetId: string | null;
    registry: 'dashboard' | 'trading' | 'bot' | null;
    storeKey?: string | undefined;
  };

  // Native fullscreen state
  isNativeFullscreen: boolean;

  // Privacy mode state
  privacyMode: boolean;

  // Onboarding steps collapsed state
  onboardingStepsCollapsed: boolean;
  // Onboarding steps visible toggle (dev feature)
  onboardingStepsVisible: boolean;

  // One-time nudge dot on the V1 sidebar edit (pencil) button
  hasSeenSidebarEditNudge: boolean;
  setHasSeenSidebarEditNudge: (seen: boolean) => void;

  setNavigationSectionOpen: (sectionKey: string, isOpen: boolean) => void;
  toggleNavigationSection: (sectionKey: string) => void;
  setNavigationSubmenuOpen: (itemKey: string, isOpen: boolean) => void;
  toggleNavigationSubmenu: (itemKey: string) => void;
  setNavigationItemEnabled: (itemId: string, enabled: boolean) => void;
  resetNavigationItemsToDefault: () => void;
  setNavigationLayout: (layout: NavLayoutSection[] | null) => void;
  // Full reset of V1 sidebar customization: visibility, layout, and all
  // user-created custom nav items back to the shipped defaults.
  resetNavigationToDefault: () => void;
  // Restore a snapshot of the V1 sidebar customization (used by the editor's
  // Cancel action — edits persist live, so cancelling rolls all of it back).
  restoreNavigationCustomization: (snapshot: {
    navigationLayout: NavLayoutSection[] | null;
    navigationItemsEnabled: Record<string, boolean>;
    customNavItems: CustomNavItem[];
  }) => void;
  setNavigationV2: (enabled: boolean) => void;
  toggleNavigationV2: () => void;
  setLeftNavVisibleIds: (ids: string[]) => void;
  toggleLeftNavItem: (id: string) => void;
  setLeftNavOrder: (order: string[]) => void;
  setLeftNavShowLabels: (show: boolean) => void;
  setLeftNavLabel: (id: string, label: string) => void;
  resetLeftNavToDefault: () => void;
  // Returns the id of the created item so callers can place it in a section.
  addCustomNavItem: (item: Omit<CustomNavItem, 'id' | 'createdAt'>) => string;
  updateCustomNavItem: (id: string, item: Partial<CustomNavItem>) => void;
  deleteCustomNavItem: (id: string) => void;
  setNavigationSecondaryPinned: (pinned: boolean) => void;
  toggleNavigationSecondaryPinned: () => void;
  setNavigationActivePanel: (panel: string | null) => void;
  // Navigation V2 customization actions
  setNavigationV2ItemVisible: (id: string, visible: boolean) => void;
  setNavigationV2Order: (order: string[]) => void;
  resetNavigationV2ToDefault: () => void;
  setNavigationV2ShowLabels: (show: boolean) => void;
  toggleNavigationV2ShowLabels: () => void;
  setSettingsSectionExpanded: (sectionId: string, isExpanded: boolean) => void;
  toggleSettingsSection: (sectionId: string) => void;
  setFullscreenWidget: (
    widgetId: string | null,
    registry?: 'dashboard' | 'trading' | 'bot',
    storeKey?: string
  ) => void;
  exitFullscreen: () => void;
  setNativeFullscreen: (isNative: boolean) => void;
  setPrivacyMode: (enabled: boolean) => void;
  togglePrivacyMode: () => void;
  setOnboardingStepsCollapsed: (collapsed: boolean) => void;
  toggleOnboardingStepsCollapsed: () => void;
  // Dev toggles for showing onboarding steps widget
  setOnboardingStepsVisible: (visible: boolean) => void;
  toggleOnboardingStepsVisible: () => void;
  initializeFromUrlParams: () => void;
}

// Default navigation sidebar states. Keys are the section titles after
// `.toLowerCase()` (see `NavigationSidebar.tsx`). Unknown / legacy keys
// stay for back-compat with persisted user state.
const defaultNavigationSections = {
  main: true,
  assets: true,
  trade: true,
  explore: false,
  develop: false,
  community: false,
  settings: true,
  // V1 sidebar section titles
  trading: true,
  tools: true,
  account: true,
  'help & resources': true,
};

// Default submenu states (which menu items are expanded)
const defaultNavigationSubmenus = {
  'hedge-bots': true, // Hedge Bots submenu expanded by default
};

// Default enabled state for V1 sidebar items (keyed by NavigationItem `id`).
// Top block on by default; everything in Tools / Help & Resources off until
// the user opts in via edit mode.
export const defaultNavigationItemsEnabled: Record<string, boolean> = {
  // Top block
  overview: true,
  dashboards: true,
  portfolio: true,
  exchanges: true,
  // Trading section — on by default except hedge variants
  trading: true,
  terminal: true,
  'trading-bots': true,
  'grid-bots': true,
  'combo-bots': true,
  'hedge-dca-bots': false,
  'hedge-combo-bots': false,
  // Tools — off by default
  'manual-backtesting': false,
  rulebooks: false,
  'trade-journal': false,
  reports: false,
  'global-variables': false,
  // Help & Resources items live in the fixed compact bottom strip; they
  // are not part of the toggleable nav list.
};

export const isNavigationItemEnabled = (
  overrides: Record<string, boolean>,
  itemId: string | undefined
): boolean => {
  if (!itemId) return true; // unknown items stay visible
  if (Object.prototype.hasOwnProperty.call(overrides, itemId)) {
    return overrides[itemId];
  }
  if (Object.prototype.hasOwnProperty.call(defaultNavigationItemsEnabled, itemId)) {
    return defaultNavigationItemsEnabled[itemId];
  }
  return true;
};

// Default settings sidebar sections (expanded)
const defaultSettingsSections = new Set(['exchanges-devices']);

// Handle browser back/forward navigation
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Re-initialize from URL parameters when user navigates
    const store = useUIStore.getState();
    store.initializeFromUrlParams();
  });
}

// Handle browser back/forward navigation
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Re-initialize from URL parameters when user navigates
    const store = useUIStore.getState();
    store.initializeFromUrlParams();
  });
}

// Handle browser back/forward navigation
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Re-initialize from URL parameters when user navigates
    const store = useUIStore.getState();
    store.initializeFromUrlParams();
  });
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, _get) => ({
        // Initial state
        navigationSidebarSections: defaultNavigationSections,
        navigationSubmenuItems: defaultNavigationSubmenus,
        navigationItemsEnabled: { ...defaultNavigationItemsEnabled },
        navigationLayout: null, // null = follow the default section/item layout
        useNavigationV2: false, // Default to V1
        // Default left nav state (should match navigationConfig DEFAULT_VISIBLE_NAV_IDS)
        leftNavVisibleIds: DEFAULT_VISIBLE_NAV_IDS,
        leftNavOrder: DEFAULT_VISIBLE_NAV_IDS,
        leftNavShowLabels: false,
        leftNavLabelOverrides: {},
        customNavItems: [],
        settingsSidebarSections: defaultSettingsSections,
        isLiveTrading: false, // Default to Paper Trading
        tradingMode: 'paper', // Default to Paper Trading mode
        isMobileSidebarOpen: false, // Default mobile sidebar closed
        controlsAlwaysVisible: false, // Default to show controls on hover/touch only
        selectedWidgetId: null, // No widget selected by default
        isControlBarExpanded: false, // Default to collapsed second row
        navigationSidebarPinned: false, // Default to unpinned (collapsible on hover)
        navigationSidebarHidden: false, // Default to visible (hidden mode is opt-in via drag)
        navigationV2VisibleIds: [],
        navigationV2Order: [],
        navigationV2ShowLabels: true, // Default to showing labels
        fullscreenWidget: {
          widgetId: null,
          registry: null,
        },
        isNativeFullscreen: false, // Default to not in native fullscreen
        privacyMode: false, // Default to privacy mode off
        onboardingStepsCollapsed: false, // Default to expanded
        onboardingStepsVisible: false, // Default to hidden (dev toggle)
        hasSeenSidebarEditNudge: false, // First-run pulse on the pencil

        // Initialize from URL parameters
        initializeFromUrlParams: () => {
          const url = new URL(window.location.href);

          // Check for demo mode parameter - set trading mode once at startup
          const demoMode = url.searchParams.get('mode') === 'demo';
          if (demoMode) {
            logger.info(
              '[demo-dismiss] initializeFromUrlParams forcing demo mode'
            );
            set(() => ({
              tradingMode: 'demo',
              isLiveTrading: false,
            }));
          }

          const isFullscreen = url.searchParams.get('fullscreen') === 'true';
          const widgetId = url.searchParams.get('widget');
          const registry = url.searchParams.get('registry') as
            | 'dashboard'
            | 'trading'
            | 'bot'
            | null;
          const storeKey = url.searchParams.get('storeKey');

          if (isFullscreen && widgetId && registry) {
            // Don't update URL again when initializing from URL
            set(() => ({
              fullscreenWidget: {
                widgetId,
                registry,
                ...(storeKey && { storeKey }),
              },
            }));
          }
        },

        // Navigation sidebar actions
        setNavigationSectionOpen: (sectionKey, isOpen) =>
          set((state) => ({
            navigationSidebarSections: {
              ...state.navigationSidebarSections,
              [sectionKey]: isOpen,
            },
          })),

        toggleNavigationSection: (sectionKey) =>
          set((state) => ({
            navigationSidebarSections: {
              ...state.navigationSidebarSections,
              [sectionKey]: !state.navigationSidebarSections[sectionKey],
            },
          })),

        // Navigation submenu actions
        setNavigationSubmenuOpen: (itemKey, isOpen) =>
          set((state) => ({
            navigationSubmenuItems: {
              ...state.navigationSubmenuItems,
              [itemKey]: isOpen,
            },
          })),

        toggleNavigationSubmenu: (itemKey) =>
          set((state) => ({
            navigationSubmenuItems: {
              ...state.navigationSubmenuItems,
              [itemKey]: !state.navigationSubmenuItems[itemKey],
            },
          })),

        setNavigationItemEnabled: (itemId, enabled) =>
          set((state) => ({
            navigationItemsEnabled: {
              ...state.navigationItemsEnabled,
              [itemId]: enabled,
            },
          })),

        resetNavigationItemsToDefault: () =>
          set(() => ({
            navigationItemsEnabled: { ...defaultNavigationItemsEnabled },
          })),

        setNavigationLayout: (layout) =>
          set(() => ({ navigationLayout: layout })),

        resetNavigationToDefault: () =>
          set(() => ({
            navigationItemsEnabled: { ...defaultNavigationItemsEnabled },
            navigationLayout: null,
            customNavItems: [],
          })),

        restoreNavigationCustomization: (snapshot) =>
          set(() => ({
            navigationLayout: snapshot.navigationLayout,
            navigationItemsEnabled: snapshot.navigationItemsEnabled,
            customNavItems: snapshot.customNavItems,
          })),

        // Navigation version actions
        setNavigationV2: (enabled) =>
          set(() => ({
            useNavigationV2: enabled,
          })),
        // Left nav update actions
        setLeftNavVisibleIds: (ids: string[]) =>
          set(() => ({ leftNavVisibleIds: ids.filter((i) => i !== 'help') })),
        toggleLeftNavItem: (id: string) =>
          set((state) => {
            if (id === 'help') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return {} as any;
            }
            const currently = state.leftNavVisibleIds.includes(id);
            if (currently) {
              return {
                leftNavVisibleIds: state.leftNavVisibleIds.filter(
                  (i) => i !== id
                ),
              };
            }

            // Add to leftNavOrder if not already present; keep 'more' at end
            const hasOrder = state.leftNavOrder.includes(id);
            const newOrder = hasOrder
              ? state.leftNavOrder.filter((i) => i !== 'help')
              : (() => {
                  const withoutMore = state.leftNavOrder
                    .filter((i) => i !== 'more')
                    .filter((i) => i !== 'help');
                  const n = [...withoutMore, id];
                  if (state.leftNavOrder.includes('more')) n.push('more');
                  return n;
                })();

            return {
              leftNavVisibleIds: [
                ...state.leftNavVisibleIds.filter((i) => i !== 'help'),
                id,
              ],
              leftNavOrder: newOrder,
            };
          }),
        setLeftNavOrder: (order: string[]) =>
          set(() => ({ leftNavOrder: order.filter((i) => i !== 'help') })),
        setLeftNavShowLabels: (show: boolean) =>
          set(() => ({ leftNavShowLabels: show })),
        setLeftNavLabel: (id, label) =>
          set((state) => {
            const normalized = label.trim();
            if (!normalized) {
              const { [id]: _removed, ...rest } = state.leftNavLabelOverrides;
              return { leftNavLabelOverrides: rest };
            }
            return {
              leftNavLabelOverrides: {
                ...state.leftNavLabelOverrides,
                [id]: normalized,
              },
            };
          }),
        resetLeftNavToDefault: () =>
          set(() => ({
            leftNavVisibleIds: DEFAULT_VISIBLE_NAV_IDS.filter(
              (i) => i !== 'help'
            ),
            leftNavOrder: DEFAULT_VISIBLE_NAV_IDS.filter((i) => i !== 'help'),
            leftNavShowLabels: false,
            leftNavLabelOverrides: {},
          })),

        addCustomNavItem: (item) => {
          const id = `custom-nav-${Date.now()}`;
          set((state) => {
            const newItem: CustomNavItem = {
              ...item,
              id,
              createdAt: Date.now(),
            };
            return {
              customNavItems: [...state.customNavItems, newItem],
              leftNavVisibleIds: [...state.leftNavVisibleIds, id],
              leftNavOrder: [
                ...state.leftNavOrder.filter((i) => i !== 'more'),
                id,
                'more',
              ],
            };
          });
          return id;
        },

        updateCustomNavItem: (id, updates) =>
          set((state) => ({
            customNavItems: state.customNavItems.map((item) =>
              item.id === id ? { ...item, ...updates } : item
            ),
          })),

        deleteCustomNavItem: (id) =>
          set((state) => ({
            customNavItems: state.customNavItems.filter(
              (item) => item.id !== id
            ),
            leftNavVisibleIds: state.leftNavVisibleIds.filter((i) => i !== id),
            leftNavOrder: state.leftNavOrder.filter((i) => i !== id),
            // Drop the deleted id from the V1 layout so it doesn't linger as a
            // dangling reference in a section.
            navigationLayout: state.navigationLayout
              ? state.navigationLayout.map((section) => ({
                  ...section,
                  itemIds: section.itemIds.filter((i) => i !== id),
                }))
              : state.navigationLayout,
          })),

        toggleNavigationV2: () =>
          set((state) => {
            logger.info('[NavSidebar] Toggling navigation version', {
              from: state.useNavigationV2 ? 'V2' : 'V1',
              to: state.useNavigationV2 ? 'V1' : 'V2',
            });
            return {
              useNavigationV2: !state.useNavigationV2,
            };
          }),

        // Settings sidebar actions
        setSettingsSectionExpanded: (sectionId, isExpanded) =>
          set((state) => {
            const newSections = new Set(state.settingsSidebarSections);
            if (isExpanded) {
              newSections.add(sectionId);
            } else {
              newSections.delete(sectionId);
            }
            return { settingsSidebarSections: newSections };
          }),

        toggleSettingsSection: (sectionId: string) =>
          set((state) => {
            const newSections = new Set(state.settingsSidebarSections);
            if (state.settingsSidebarSections.has(sectionId)) {
              newSections.delete(sectionId);
            } else {
              newSections.add(sectionId);
            }
            return { settingsSidebarSections: newSections };
          }),

        // Trading mode actions (internal - use usePaperContext hook instead)
        setTradingMode: (isLive: boolean) =>
          set((state) => ({
            isLiveTrading: isLive,
            // Only update tradingMode if not in demo
            tradingMode:
              state.tradingMode === 'demo' ? 'demo' : isLive ? 'live' : 'paper',
          })),

        setTradingModeValue: (mode: 'live' | 'paper' | 'demo') =>
          set(() => ({
            tradingMode: mode,
            isLiveTrading: mode === 'live',
          })),

        // Navigation secondary panel pin (controls whether secondary panel pushes content)
        navigationSecondaryPinned: false,
        navigationActivePanel: null,
        setNavigationSecondaryPinned: (pinned) =>
          set(() => ({ navigationSecondaryPinned: pinned })),
        toggleNavigationSecondaryPinned: () =>
          set((state) => ({
            navigationSecondaryPinned: !state.navigationSecondaryPinned,
          })),
        setNavigationActivePanel: (panel) =>
          set(() => ({ navigationActivePanel: panel })),

        // Navigation V2 customization actions
        setNavigationV2ItemVisible: (id, visible) =>
          set((state) => ({
            navigationV2VisibleIds: visible
              ? [...state.navigationV2VisibleIds, id]
              : state.navigationV2VisibleIds.filter((i) => i !== id),
          })),

        setNavigationV2Order: (order) =>
          set(() => ({ navigationV2Order: order })),

        resetNavigationV2ToDefault: () =>
          set(() => ({
            navigationV2VisibleIds: [],
            navigationV2Order: [],
          })),

        setNavigationV2ShowLabels: (show) =>
          set(() => ({ navigationV2ShowLabels: show })),

        toggleNavigationV2ShowLabels: () =>
          set((state) => ({
            navigationV2ShowLabels: !state.navigationV2ShowLabels,
          })),

        exitDemoMode: () =>
          set(() => ({
            tradingMode: 'live',
            isLiveTrading: true,
          })),

        // Mobile sidebar actions
        setMobileSidebarOpen: (isOpen: boolean) =>
          set(() => ({
            isMobileSidebarOpen: isOpen,
          })),

        toggleMobileSidebar: () =>
          set((state) => ({
            isMobileSidebarOpen: !state.isMobileSidebarOpen,
          })),

        // Controls visibility actions
        setControlsAlwaysVisible: (visible: boolean) =>
          set(() => ({
            controlsAlwaysVisible: visible,
          })),

        toggleControlsAlwaysVisible: () =>
          set((state) => ({
            controlsAlwaysVisible: !state.controlsAlwaysVisible,
          })),

        // Widget selection actions
        setSelectedWidget: (widgetId: string | null) =>
          set(() => ({
            selectedWidgetId: widgetId,
          })),

        clearSelectedWidget: () =>
          set(() => ({
            selectedWidgetId: null,
          })),

        // Control bar expand actions
        setControlBarExpanded: (expanded: boolean) =>
          set(() => ({
            isControlBarExpanded: expanded,
          })),

        toggleControlBarExpanded: () =>
          set((state) => ({
            isControlBarExpanded: !state.isControlBarExpanded,
          })),

        // Navigation sidebar pinned actions
        setNavigationSidebarPinned: (pinned: boolean) =>
          set(() => ({
            navigationSidebarPinned: pinned,
          })),

        toggleNavigationSidebarPinned: () =>
          set((state) => ({
            navigationSidebarPinned: !state.navigationSidebarPinned,
          })),

        setNavigationSidebarHidden: (hidden: boolean) =>
          set(() => ({
            navigationSidebarHidden: hidden,
          })),

        // Fullscreen actions
        // Fullscreen actions
        setFullscreenWidget: (widgetId, registry, storeKey) => {
          // Update URL parameters when entering fullscreen
          if (widgetId && registry) {
            const url = new URL(window.location.href);
            url.searchParams.set('fullscreen', 'true');
            url.searchParams.set('widget', widgetId);
            url.searchParams.set('registry', registry);
            if (storeKey) {
              url.searchParams.set('storeKey', storeKey);
            } else {
              url.searchParams.delete('storeKey');
            }
            window.history.pushState({}, '', url.toString());
          }

          set(() => ({
            selectedWidgetId: null, // Clear selection when entering fullscreen
            fullscreenWidget: {
              widgetId,
              registry: registry || null,
              ...(storeKey && { storeKey }),
            },
          }));
        },

        exitFullscreen: () => {
          // Remove URL parameters when exiting fullscreen
          const url = new URL(window.location.href);
          url.searchParams.delete('fullscreen');
          url.searchParams.delete('widget');
          url.searchParams.delete('registry');
          url.searchParams.delete('storeKey');
          window.history.pushState({}, '', url.toString());

          set(() => ({
            fullscreenWidget: {
              widgetId: null,
              registry: null,
            },
          }));
        },

        setNativeFullscreen: (isNative) =>
          set(() => ({
            isNativeFullscreen: isNative,
          })),

        // Privacy mode actions
        setPrivacyMode: (enabled) =>
          set(() => ({
            privacyMode: enabled,
          })),

        togglePrivacyMode: () =>
          set((state) => ({
            privacyMode: !state.privacyMode,
          })),

        // Onboarding steps actions
        setOnboardingStepsCollapsed: (collapsed) =>
          set(() => ({
            onboardingStepsCollapsed: collapsed,
          })),

        toggleOnboardingStepsCollapsed: () =>
          set((state) => ({
            onboardingStepsCollapsed: !state.onboardingStepsCollapsed,
          })),
        // Dev-controlled visibility for onboarding steps overlay/widget
        setOnboardingStepsVisible: (visible) =>
          set(() => ({ onboardingStepsVisible: visible })),
        toggleOnboardingStepsVisible: () =>
          set((state) => ({
            onboardingStepsVisible: !state.onboardingStepsVisible,
          })),

        setHasSeenSidebarEditNudge: (seen) =>
          set(() => ({ hasSeenSidebarEditNudge: seen })),
      }),
      {
        name: 'ui-store',
        // Bump when the shape of persisted state changes in a way that
        // requires resetting / reshaping a key. v1: drops stale
        // `navigationItemsEnabled` map from initial sidebar rollout so the
        // updated defaults (hedges off, Help & Resources on) apply.
        version: 1,
        migrate: (state, fromVersion) => {
          if (!state || typeof state !== 'object') return state as UIState;
          if (fromVersion < 1) {
            const next = { ...(state as Record<string, unknown>) };
            delete next['navigationItemsEnabled'];
            return next as unknown as UIState;
          }
          return state as UIState;
        },
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Partial<UIState>;
          return {
            ...currentState,
            ...persisted,
            // V2 sidebar is deprecated — auto-migrate any persisted V2 user
            // back to V1 on rehydrate.
            useNavigationV2: false,
          };
        },
        partialize: (state) => (({
          navigationSidebarSections: state.navigationSidebarSections,
          navigationSubmenuItems: state.navigationSubmenuItems,
          navigationItemsEnabled: state.navigationItemsEnabled,
          navigationLayout: state.navigationLayout, // Persist V1 sidebar layout
          useNavigationV2: state.useNavigationV2, // Persist navigation version setting
          navigationSecondaryPinned: state.navigationSecondaryPinned, // Persist secondary pinned state
          navigationActivePanel: state.navigationActivePanel, // Persist active panel
          navigationV2VisibleIds: state.navigationV2VisibleIds,
          navigationV2Order: state.navigationV2Order,
          navigationV2ShowLabels: state.navigationV2ShowLabels,
          leftNavVisibleIds: state.leftNavVisibleIds,
          leftNavOrder: state.leftNavOrder,
          leftNavShowLabels: state.leftNavShowLabels,
          leftNavLabelOverrides: state.leftNavLabelOverrides,
          customNavItems: state.customNavItems,
          settingsSidebarSections: Array.from(state.settingsSidebarSections), // Convert Set to Array for serialization
          isLiveTrading: state.isLiveTrading,
          tradingMode: state.tradingMode,
          isMobileSidebarOpen: state.isMobileSidebarOpen,
          controlsAlwaysVisible: state.controlsAlwaysVisible,
          isControlBarExpanded: state.isControlBarExpanded,
          hasSeenSidebarEditNudge: state.hasSeenSidebarEditNudge,
          navigationSidebarPinned: state.navigationSidebarPinned,
          navigationSidebarHidden: state.navigationSidebarHidden,
          privacyMode: state.privacyMode, // Persist privacy mode setting
          onboardingStepsCollapsed: state.onboardingStepsCollapsed, // Persist onboarding steps collapsed state
          onboardingStepsVisible: state.onboardingStepsVisible, // Persist onboarding steps visible (dev toggle)
          // Don't persist fullscreen state - should reset on page reload
        }) as unknown as UIState),
        // Custom serializer to handle Set conversion
        storage: {
          getItem: (name) => {
            const str = localStorage.getItem(name);
            if (!str) return null;
            const parsed = JSON.parse(str);
            // Convert Array back to Set
            if (parsed.state?.settingsSidebarSections) {
              parsed.state.settingsSidebarSections = new Set(
                parsed.state.settingsSidebarSections
              );
            }
            return parsed;
          },
          setItem: (name, value) => {
            // Convert Set to Array for serialization
            const serialized = {
              ...value,
              state: {
                ...value.state,
                settingsSidebarSections: Array.from(
                  value.state.settingsSidebarSections
                ),
              },
            };
            localStorage.setItem(name, JSON.stringify(serialized));
          },
          removeItem: (name) => localStorage.removeItem(name),
        },
      }
    ),
    {
      name: 'ui-store',
    }
  )
);
