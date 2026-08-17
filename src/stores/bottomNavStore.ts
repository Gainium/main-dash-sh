import { IS_CLOUD } from '@/config/mode';
import { BotTypesEnum } from '@/types';
import { getBotTypeIcon } from '@/utils/botUtils';
import {
  Activity,
  BookOpen,
  Bot,
  ChartBar,
  LayoutDashboard,
  ListChecks,
  Menu,
  PieChart,
  Settings,
  Sparkle,
  TestTube,
  Users,
} from 'lucide-react';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  href?: string;
  onClick?: () => void;
  category?: 'core' | 'bots' | 'tools' | 'dashboards' | 'custom' | 'other';
}

interface BottomNavState {
  // Current navigation items (max 6, with last one always being "More")
  activeNavItems: NavItem[];

  // Available items that can be dragged to the nav
  availableItems: NavItem[];

  // Panel state
  isCustomizationPanelOpen: boolean;

  // Auto-hide state (like navbar autohide)
  autoHide: boolean;

  // Actions
  setActiveNavItems: (items: NavItem[]) => void;
  addToActiveNav: (item: NavItem, position?: number) => void;
  removeFromActiveNav: (itemId: string) => void;
  reorderActiveNav: (fromIndex: number, toIndex: number) => void;
  setCustomizationPanelOpen: (isOpen: boolean) => void;
  toggleCustomizationPanel: () => void;
  setAutoHide: (autoHide: boolean) => void;
  toggleAutoHide: () => void;
  addAvailableItem: (item: NavItem) => void;
  removeAvailableItem: (id: string) => void;
  resetToDefault: () => void;
}

// Core navigation items (these are the defaults and cannot be removed from available)
const coreNavItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: PieChart,
    href: '/overview',
    category: 'core',
  },
  {
    id: 'trading',
    label: 'Trading',
    icon: Bot,
    href: '/trading',
    category: 'core',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: PieChart,
    href: '/portfolio',
    category: 'core',
  },
  {
    id: 'trades',
    label: 'Trades',
    icon: Activity,
    href: '/trading',
    category: 'core',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: getBotTypeIcon(BotTypesEnum.terminal),
    href: '/terminal',
    category: 'core',
  },
  {
    id: 'community',
    label: 'Community',
    icon: Users,
    href: '/community',
    category: 'core',
  },
];

// Dashboard items
const dashboardNavItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
    category: 'dashboards',
  },
];

// Custom items (empty by default but can be added by user)
const customNavItems: NavItem[] = [];

// Bot-specific items - using single source of truth for icons
const botNavItems: NavItem[] = [
  {
    id: 'dca-bots',
    label: 'DCA',
    icon: getBotTypeIcon(BotTypesEnum.dca),
    href: '/bot',
    category: 'bots',
  },
  {
    id: 'grid-bots',
    label: 'Grid',
    icon: getBotTypeIcon(BotTypesEnum.grid),
    href: '/grid',
    category: 'bots',
  },
  {
    id: 'combo-bots',
    label: 'Combo',
    icon: getBotTypeIcon(BotTypesEnum.combo),
    href: '/combo',
    category: 'bots',
  },
  {
    id: 'hedge-dca',
    label: 'DCA Hedge',
    icon: getBotTypeIcon(BotTypesEnum.hedgeDca),
    href: '/hedge/bot',
    category: 'bots',
  },
  {
    id: 'hedge-combo',
    label: 'Combo Hedge',
    icon: getBotTypeIcon(BotTypesEnum.hedgeCombo),
    href: '/hedge/combo',
    category: 'bots',
  },
];

// Tool and feature items
const toolNavItems: NavItem[] = [
  {
    id: 'manual-backtesting',
    label: 'Manual Backtesting',
    icon: TestTube,
    href: '/manual-backtesting/sessions',
    category: 'tools',
  },
  {
    id: 'rulebooks',
    label: 'Rulebooks',
    icon: ListChecks,
    href: '/rulebooks',
    category: 'tools',
  },
  {
    id: 'journal',
    label: 'Trade Journal',
    icon: BookOpen,
    href: '/journal',
    category: 'tools',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: ChartBar,
    href: '/reports',
    category: 'tools',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    href: '/settings',
    category: 'tools',
  },
  // Variables & Rewards removed from bottom customization list intentionally
];

// The "More" item is always present and not customizable
const moreNavItem: NavItem = {
  id: 'more',
  label: 'More',
  icon: Menu,
  category: 'other',
};

// Default active navigation (first 4 items + More)
// Default active navigation (first 4 items + More)
// Portfolio should be a core root item and appear after Trading by default
const defaultActiveNav: NavItem[] = [
  coreNavItems[0], // Overview
  coreNavItems[1], // Trading
  coreNavItems.find((i) => i.id === 'portfolio') || {
    id: 'portfolio',
    label: 'Portfolio',
    icon: PieChart,
    href: '/portfolio',
    category: 'core',
  },
  coreNavItems.find((i) => i.id === 'terminal') || coreNavItems[3], // Terminal
  moreNavItem, // More (always last)
];

// Items whose route only exists in cloud builds. Filtered from the
// available + active sets in sh so they never surface in the bottom nav
// or its customization picker.
const CLOUD_ONLY_NAV_IDS = new Set<string>([
  'manual-backtesting',
  'rulebooks',
  'journal',
  'reports',
]);

const stripCloudOnly = (items: NavItem[]): NavItem[] =>
  IS_CLOUD ? items : items.filter((item) => !CLOUD_ONLY_NAV_IDS.has(item.id));

// All available items
// Move portfolio to be available in the core section to match the sidebar
const allAvailableItems = stripCloudOnly([
  ...coreNavItems,
  ...botNavItems,
  ...toolNavItems,
  ...dashboardNavItems,
  ...customNavItems,
]);

// Icons are functions, so they can't be persisted — rehydration has to look
// each item's icon back up. Items whose id isn't in the static registry get a
// per-category icon instead of being dropped: the customization panel also
// offers items generated at runtime (one per saved dashboard, ids like
// `dashboard-<id>`), and those are never in `allAvailableItems`. Dropping them
// deleted that part of the user's bottom-nav customization on every reload.
const FALLBACK_ICONS: Record<string, NavItem['icon']> = {
  custom: Sparkle,
  dashboards: LayoutDashboard,
  bots: Bot,
  core: PieChart,
  tools: Settings,
};

const DEFAULT_FALLBACK_ICON = Sparkle;

/**
 * Rebuild a persisted nav item, restoring its icon. Returns null only for
 * entries we genuinely can't render: no id, a cloud-only route in an sh build,
 * or nothing to navigate to (neither a registry entry nor an `href`).
 */
const restoreNavItem = (persistedItem: Partial<NavItem>): NavItem | null => {
  if (!persistedItem?.id) return null;

  const originalItem =
    allAvailableItems.find((item) => item.id === persistedItem.id) ||
    (persistedItem.id === 'more' ? moreNavItem : null);

  if (originalItem) {
    return { ...persistedItem, icon: originalItem.icon } as NavItem;
  }

  // In the sh build cloud-only routes are stripped from the registry on
  // purpose — those must stay dropped rather than fall through below.
  if (!IS_CLOUD && CLOUD_ONLY_NAV_IDS.has(persistedItem.id)) return null;

  // Runtime-registered item (dashboards, user-created custom links). Keep it as
  // long as it can still navigate somewhere.
  if (!persistedItem.href) return null;

  const category = persistedItem.category ?? 'custom';
  return {
    id: persistedItem.id,
    label: persistedItem.label || 'Custom',
    href: persistedItem.href,
    icon: FALLBACK_ICONS[category] ?? DEFAULT_FALLBACK_ICON,
    category,
  } as NavItem;
};

export const useBottomNavStore = create<BottomNavState>()(
  devtools(
    persist(
      (set, _get) => ({
        // Initial state
        activeNavItems: defaultActiveNav,
        availableItems: allAvailableItems,
        isCustomizationPanelOpen: false,
        autoHide: false,

        // Actions
        setActiveNavItems: (items) =>
          set(() => ({
            activeNavItems: items,
          })),

        addToActiveNav: (item, position) =>
          set((state) => {
            const newActiveItems = [...state.activeNavItems];
            // Remove "More" button temporarily
            const moreButton = newActiveItems.pop();

            // If position is specified, insert at that position
            if (
              position !== undefined &&
              position >= 0 &&
              position < newActiveItems.length
            ) {
              newActiveItems.splice(position, 0, item);
            } else {
              // Add to end (before More button)
              newActiveItems.push(item);
            }

            // Ensure max 4 items + More
            if (newActiveItems.length > 4) {
              newActiveItems.splice(4);
            }

            // Add More button back
            if (moreButton) {
              newActiveItems.push(moreButton);
            }

            return { activeNavItems: newActiveItems };
          }),

        removeFromActiveNav: (itemId) =>
          set((state) => ({
            activeNavItems: state.activeNavItems
              .filter(
                (item) => item.id !== itemId && item.id !== 'more' // Never remove More button
              )
              .concat(
                state.activeNavItems.find((item) => item.id === 'more') ||
                  moreNavItem
              ),
          })),

        reorderActiveNav: (fromIndex, toIndex) =>
          set((state) => {
            const newActiveItems = [...state.activeNavItems];
            // Don't allow reordering the More button (always last)
            if (
              fromIndex >= newActiveItems.length - 1 ||
              toIndex >= newActiveItems.length - 1
            ) {
              return state;
            }

            const [movedItem] = newActiveItems.splice(fromIndex, 1);
            newActiveItems.splice(toIndex, 0, movedItem);

            return { activeNavItems: newActiveItems };
          }),

        setCustomizationPanelOpen: (isOpen) =>
          set(() => ({
            isCustomizationPanelOpen: isOpen,
          })),

        toggleCustomizationPanel: () =>
          set((state) => ({
            isCustomizationPanelOpen: !state.isCustomizationPanelOpen,
          })),

        setAutoHide: (autoHide) =>
          set(() => ({
            autoHide,
          })),

        toggleAutoHide: () =>
          set((state) => ({
            autoHide: !state.autoHide,
          })),

        addAvailableItem: (item) =>
          set((state) => ({
            availableItems: [...state.availableItems, item],
          })),

        removeAvailableItem: (id) =>
          set((state) => ({
            availableItems: state.availableItems.filter((i) => i.id !== id),
          })),

        resetToDefault: () =>
          set(() => ({
            activeNavItems: defaultActiveNav,
            isCustomizationPanelOpen: false,
          })),
      }),
      {
        name: 'bottom-nav-store',
        partialize: (state) => ({
          activeNavItems: state.activeNavItems.map((item) => ({
            ...item,
            icon: undefined, // Don't serialize icon functions
          })),
          availableItems: state.availableItems.map((item) => ({
            ...item,
            icon: undefined,
          })),
          autoHide: state.autoHide,
        }),
        // Custom merger to restore icon functions after hydration
        merge: (persistedState, currentState) => {
          const persistedItems = (persistedState as Partial<BottomNavState>)
            ?.activeNavItems;
          const persistedAvailable = (persistedState as Partial<BottomNavState>)
            ?.availableItems;

          // If no persisted items, use defaults
          if (!persistedItems || persistedItems.length === 0) {
            return {
              ...currentState,
              activeNavItems: defaultActiveNav,
            };
          }

          const restoredItems = persistedItems
            .map((persistedItem: Partial<NavItem>) =>
              restoreNavItem(persistedItem)
            )
            .filter(
              (item): item is NavItem =>
                item !== null && item.icon !== undefined
            );

          // If we lost all items during restoration, use defaults
          if (restoredItems.length === 0) {
            return {
              ...currentState,
              activeNavItems: defaultActiveNav,
            };
          }

          // Ensure More button is present
          const hasMoreButton = restoredItems.some(
            (item) => item.id === 'more'
          );
          if (!hasMoreButton) {
            restoredItems.push(moreNavItem);
          }

          // Restore available items: combine current available items and persisted ones
          const restoredAvailable = (persistedAvailable || [])
            .map((persistedItem: Partial<NavItem>) =>
              restoreNavItem(persistedItem)
            )
            .filter((i): i is NavItem => !!i);

          // Merge restored available items with current ones, avoiding duplicates
          const mergedAvailable = [
            ...currentState.availableItems,
            ...restoredAvailable.filter(
              (r) => !currentState.availableItems.some((c) => c.id === r.id)
            ),
          ];

          return {
            ...currentState,
            ...(persistedState || {}),
            activeNavItems: restoredItems,
            availableItems: mergedAvailable,
          };
        },
      }
    ),
    {
      name: 'bottom-nav-store',
    }
  )
);
