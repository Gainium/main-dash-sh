import { logger } from '@/lib/loggerInstance';
import { clsx } from 'clsx';
import { Filter, Maximize2, RotateCw, X } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { WidgetPortalProvider } from '../../contexts/WidgetPortalContext';
import { useCacheKey } from '../../hooks/useCacheKey';
import { useCacheStatus } from '../../hooks/useCacheStatus';
import { useWidgetKeyboardShortcuts } from '../../hooks/useWidgetKeyboardShortcuts';
import { useWidgetPortal } from '../../hooks/useWidgetPortal';
import {
  getWidgetTypeFromMetadata,
  useWidgetRefresh,
} from '../../hooks/useWidgetRefresh';
import { useTradingBotStore } from '../../stores/botWidgetsStoreFactory';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useTradingTerminalStore } from '../../stores/tradingTerminalStore';
import { useUIStore } from '../../stores/uiStore';
import {
  createNamespacedWidgetId,
  useWidgetSettingsStore,
} from '../../stores/widgetSettingsStore';
import { formatNumber } from '../../utils/numberFormatter';
import { useWidgetDisplayName } from '../../utils/widgetUtils';
import { Button } from '../ui/button';
import { DropdownMenuShortcut } from '../ui/dropdown-menu';
import { getCompatibilityDefaultSize } from './DefaultWidgetSizes';

// Local plain menu primitives (not using Radix context) so this menu can be
// rendered as a simple fixed-position element without requiring a
// DropdownMenu root. We mimic the visual styles of the shared
// DropdownMenu primitives but use native elements for safety.
const PlainMenuItem: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, disabled, ...props }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={clsx(
      'relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-all duration-200 focus:bg-muted/80 focus:text-card-foreground hover:bg-muted/80 text-muted-foreground disabled:pointer-events-none disabled:opacity-50 ring-offset-background focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2',
      className
    )}
    {...props}
  >
    {children}
  </button>
);

const PlainMenuCheckboxItem: React.FC<{
  checked?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}> = ({ checked = false, children, onClick, className, disabled }) => (
  <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-muted/80 focus:text-card-foreground hover:bg-muted/80 text-muted-foreground disabled:pointer-events-none disabled:opacity-50 ring-offset-background focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2',
      className
    )}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {checked ? (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
    {children}
  </button>
);

const PlainMenuSeparator: React.FC = () => (
  <div className="-mx-1 my-1 h-px bg-muted" role="separator" />
);

import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { TruncatedText } from '../ui/TruncatedText';
import Widget from '../ui/widget';
import FullscreenWidgetOverlay from './FullscreenWidgetOverlay';
import StaleIndicator from './shared/StaleIndicator';
import WidgetFilterArea from './shared/WidgetFilterArea';

// Add new interface for menu actions
export interface WidgetMenuActionItem {
  label: string;
  onSelect: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  isChecked?: boolean;
  disabled?: boolean;
}

export interface WidgetMenuActions {
  onDelete?: () => void;
  onDuplicate?: () => void;
  onOptions?: () => void;
  onForceRefresh?: () => void;
  /** Reset widget to its default settings */
  onResetToDefault?: () => void;
  optionsMenuItems?: WidgetMenuActionItem[];
}

export interface WidgetTab {
  id: string;
  title: string;
  content: React.ReactNode;
}

export interface WidgetDropdownOption {
  value: string;
  label: string;
}

export interface WidgetValue {
  primary: string | number;
  secondary?: string;
  isProfit?: boolean; // Add this to determine profit/loss color
  change?: {
    value: string | number;
    percentage: string | number;
    isPositive: boolean;
  };
}

export interface WidgetMetadata {
  id: string;
  type: string;
  title: string;
  displayName?: string; // Human-readable widget type name (e.g., "Portfolio Value")
  header?: boolean; // Whether to show the widget header (default: true)
  defaultSize?: {
    w: number;
    h: number;
  };
  minSize?: {
    w: number;
    h: number;
  };
  maxSize?: {
    w: number;
    h: number;
  };
  tabs?: WidgetTab[];
  hasOptions?: boolean;
  // Updated properties for filter functionality
  hasFilters?: boolean; // Replace hasDropdown with hasFilters
  filterContent?: React.ReactNode; // Content to show in filter section
  filtersActive?: boolean; // Indicates if any filters are currently active
  onClearFilters?: () => void; // Callback to clear all filters
  value?: WidgetValue; // Widget value to display on the right
  // Legacy dropdown properties for backward compatibility
  hasDropdown?: boolean;
  dropdownOptions?: { value: string; label: string }[];
  selectedDropdownValue?: string;
  filters?: string;
}

export interface WidgetWrapperProps {
  metadata: WidgetMetadata;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onRemove?: () => void;
  onSettings?: () => void;
  isEditable?: boolean;
  isCollapsible?: boolean; // Add prop to control collapsible functionality
  onTabChange?: (tabId: string) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onDropdownChange?: (value: string) => void;
  // Add menu actions prop
  menuActions?: WidgetMenuActions;
  // Add name edit handler
  onNameChange?: (widgetId: string, newName: string) => void;
  noPadding?: boolean; // Add this prop to control padding
  storeKey?: string; // Store key for namespacing widget settings
  // Add registry prop for fullscreen functionality
  registry?: 'dashboard' | 'trading' | 'bot';
  // Centralized options modal controls (rendered by wrapper with portal logic)
  showOptionsDialog?: boolean;
  onCloseOptionsDialog?: () => void;
  renderOptionsContent?: (close: () => void) => React.ReactNode;
  optionsTitle?: string;
  optionsWidthClass?: string; // e.g., w-80, max-w-md
  // Cache tracking for stale-while-revalidate indicator
  cacheQueries?: Array<{
    queryKey: string;
    variables?: Record<string, unknown>;
  }>;
}

// Portal-based Widget Menu Component that renders outside the grid
export const WidgetMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  actions: WidgetMenuActions;
  hasOptions?: boolean;
  isEditable?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  onGenericForceRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  refreshSuccess?: boolean | null;
  isInFullscreen?: boolean;
  isInNativeFullscreen?: boolean;
  portalTarget?: Element;
  zIndexClass?: string;
  shouldUsePortal?: boolean;
  shortcuts?: {
    settings: { key: string; modifier: string };
    duplicate: { key: string; modifier: string };
    refresh: { key: string; modifier: string };
    delete: { key: string; modifier: string };
    fullscreen: { key: string; modifier: string };
  };
}> = ({
  isOpen,
  onClose,
  position,
  actions,
  hasOptions,
  isEditable = true,
  onEnterFullscreen,
  onExitFullscreen,
  onGenericForceRefresh,
  isRefreshing = false,
  refreshSuccess = null,
  isInFullscreen = false,
  isInNativeFullscreen = false,
  portalTarget,
  zIndexClass = 'z-50',
  shouldUsePortal = true,
  //shortcuts,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Determine portal target based on fullscreen state
  const getPortalTarget = () => {
    if (isInNativeFullscreen && isInFullscreen) {
      // When in native fullscreen, render inside the fullscreen element
      const fullscreenElement =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        (document as Document & { msFullscreenElement?: Element })
          .msFullscreenElement;
      return fullscreenElement || document.body;
    }
    return document.body;
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element | null;
      // Ignore clicks inside a portaled dialog (e.g. the reset-confirm dialog
      // this menu renders); otherwise the mousedown would close the menu and
      // unmount the dialog before its action runs.
      if (target?.closest('[role="dialog"]')) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }

    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const menuContent = (
    <>
    <div
      ref={menuRef}
      className={`fixed pointer-events-auto min-w-40 bg-popover/95 backdrop-blur-xl rounded-xl shadow-2xl ring-1 ring-black/20 p-1 text-card-foreground ${zIndexClass}`}
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateY(4px) translateX(-100%)',
      }}
    >
      {/* Fullscreen Toggle - show Enter when not in fullscreen, Exit when in fullscreen */}
      {onEnterFullscreen && !isInFullscreen && (
        <PlainMenuItem
          onClick={() => {
            onEnterFullscreen();
            onClose();
          }}
          className="flex justify-between items-center"
          title="Enter fullscreen"
        >
          <div className="flex items-center gap-sm">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
            Enter fullscreen
          </div>
        </PlainMenuItem>
      )}

      {onExitFullscreen && isInFullscreen && (
        <PlainMenuItem
          onClick={() => {
            onExitFullscreen();
            onClose();
          }}
          className="flex justify-between items-center"
          title="Exit fullscreen"
        >
          <div className="flex items-center gap-sm">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
            Exit fullscreen
          </div>
          <DropdownMenuShortcut>Esc</DropdownMenuShortcut>
        </PlainMenuItem>
      )}

      {(actions.onForceRefresh || onGenericForceRefresh) && (
        <>
          {(onEnterFullscreen || onExitFullscreen) && <PlainMenuSeparator />}

          {/* Force refresh */}
          <PlainMenuItem
            onClick={async () => {
              // Use custom handler if provided, otherwise use generic handler
              if (actions.onForceRefresh) {
                actions.onForceRefresh();
              } else if (onGenericForceRefresh) {
                await onGenericForceRefresh();
              }
              onClose();
            }}
            disabled={isRefreshing}
            className="flex justify-between items-center"
            title="Force refresh"
          >
            <div className="flex items-center gap-sm">
              {isRefreshing ? (
                // Loading spinner
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground animate-spin"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : refreshSuccess === true ? (
                // Success checkmark
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green-500"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : refreshSuccess === false ? (
                // Error X
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-red-500"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                // Default refresh icon
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
              )}
              {isRefreshing
                ? 'Refreshing...'
                : refreshSuccess === true
                  ? 'Refreshed!'
                  : refreshSuccess === false
                    ? 'Failed to refresh'
                    : 'Force Refresh'}
            </div>
          </PlainMenuItem>
        </>
      )}

      {/* Reset to default */}
      {actions.onResetToDefault && (
        <>
          {(actions.onDuplicate ||
            actions.onForceRefresh ||
            (hasOptions && actions.onOptions) ||
            onEnterFullscreen ||
            onExitFullscreen ||
            onGenericForceRefresh) && <PlainMenuSeparator />}

          <PlainMenuItem
            onClick={() => {
              // Confirmation to avoid accidental resets
              setShowResetConfirm(true);
            }}
            className="flex items-center gap-sm"
            title="Reset to default"
          >
            <div className="flex items-center gap-sm">
              <RotateCw className="h-4 w-4 text-muted-foreground" />
              Reset to default
            </div>
          </PlainMenuItem>
        </>
      )}

      {actions.onDuplicate && isEditable && (
        <PlainMenuItem
          onClick={() => {
            actions.onDuplicate?.();
            onClose();
          }}
          className="flex justify-between items-center"
          title="Duplicate widget"
        >
          <div className="flex items-center gap-sm">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Duplicate
          </div>
        </PlainMenuItem>
      )}

      {actions.onDelete && isEditable && (
        <>
          {(actions.onDuplicate ||
            actions.onForceRefresh ||
            (hasOptions && actions.onOptions)) && <PlainMenuSeparator />}
          <PlainMenuItem
            onClick={() => {
              actions.onDelete?.();
              onClose();
            }}
            className="flex justify-between items-center text-destructive"
            title="Delete widget"
          >
            <div className="flex items-center gap-sm">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c-1 0 2 1 2 2v2" />
              </svg>
              Delete
            </div>
          </PlainMenuItem>
        </>
      )}

      {/* Custom Options Menu Items */}
      {actions.optionsMenuItems && actions.optionsMenuItems.length > 0 && (
        <>
          {(actions.onDelete ||
            actions.onDuplicate ||
            actions.onForceRefresh ||
            (hasOptions && actions.onOptions) ||
            onEnterFullscreen ||
            onExitFullscreen ||
            onGenericForceRefresh) && <PlainMenuSeparator />}
          {actions.optionsMenuItems.map((item, index) =>
            // Use checkbox item for checked states, otherwise regular item
            item.isChecked ? (
              <PlainMenuCheckboxItem
                key={`${item.label}-${index}`}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  onClose();
                }}
                checked={Boolean(item.isChecked)}
                className="w-full justify-start"
                disabled={item.disabled}
              >
                <div className="flex items-center gap-sm w-full">
                  <span className="sr-only">{item.label}</span>
                  <span>{item.label}</span>
                </div>
              </PlainMenuCheckboxItem>
            ) : (
              <PlainMenuItem
                key={`${item.label}-${index}`}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }

                  item.onSelect();
                  onClose();
                }}
                className="flex items-center gap-sm w-full"
                disabled={item.disabled}
                title={item.label}
              >
                {item.icon ? (
                  <item.icon
                    className={clsx(
                      'h-4 w-4 text-muted-foreground',
                      item.disabled && 'opacity-70'
                    )}
                  />
                ) : (
                  <span className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </PlainMenuItem>
            )
          )}
        </>
      )}
    </div>
    <ConfirmationDialog
      open={showResetConfirm}
      onOpenChange={setShowResetConfirm}
      title="Reset widget?"
      description="Reset widget to default settings? This cannot be undone."
      confirmText="Reset"
      variant="destructive"
      onConfirm={() => {
        actions.onResetToDefault?.();
        onClose();
      }}
    />
    </>
  );

  // Use hybrid approach: portals in normal mode, direct rendering in fullscreen
  return shouldUsePortal
    ? createPortal(menuContent, portalTarget ?? getPortalTarget())
    : menuContent;
};

export const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
  metadata,
  children,
  className,
  style,
  onRemove,
  onSettings,
  isEditable = false,
  isCollapsible = true, // Default to true for backward compatibility
  onTabChange,
  onTabMove,
  onCollapse,
  menuActions,
  onNameChange,
  noPadding,
  storeKey,
  registry = 'dashboard', // Default to dashboard
  showOptionsDialog,
  onCloseOptionsDialog,
  renderOptionsContent,
  optionsTitle,
  optionsWidthClass,
  cacheQueries, // GraphQL queries to track for stale-while-revalidate
}) => {
  // Generate cache keys for tracking - we need to call hooks unconditionally
  // So we call useCacheKey for up to a reasonable maximum number of queries (e.g., 5)
  // This approach maintains hook call order while supporting multiple queries
  const cacheKey0 = useCacheKey(
    cacheQueries?.[0]?.queryKey || '',
    cacheQueries?.[0]?.variables
  );
  const cacheKey1 = useCacheKey(
    cacheQueries?.[1]?.queryKey || '',
    cacheQueries?.[1]?.variables
  );
  const cacheKey2 = useCacheKey(
    cacheQueries?.[2]?.queryKey || '',
    cacheQueries?.[2]?.variables
  );
  const cacheKey3 = useCacheKey(
    cacheQueries?.[3]?.queryKey || '',
    cacheQueries?.[3]?.variables
  );
  const cacheKey4 = useCacheKey(
    cacheQueries?.[4]?.queryKey || '',
    cacheQueries?.[4]?.variables
  );

  // Collect all cache keys and query names based on what's actually provided
  const { cacheKeys, queryNames } = useMemo(() => {
    if (!cacheQueries || cacheQueries.length === 0) {
      return { cacheKeys: [], queryNames: [] };
    }

    const allCacheKeys = [
      cacheKey0,
      cacheKey1,
      cacheKey2,
      cacheKey3,
      cacheKey4,
    ];
    const keys = allCacheKeys.slice(0, cacheQueries.length);
    const names = cacheQueries.map((q) => q.queryKey);

    return { cacheKeys: keys, queryNames: names };
  }, [cacheQueries, cacheKey0, cacheKey1, cacheKey2, cacheKey3, cacheKey4]);

  // Track cache status - always call the hook unconditionally
  useCacheStatus(metadata.id, cacheKeys, queryNames);

  // Get widget settings store functions (narrow selectors so the wrapper
  // doesn't re-render on unrelated widget-settings-store changes)
  const getWidgetCollapsed = useWidgetSettingsStore(
    (s) => s.getWidgetCollapsed
  );
  const setWidgetCollapsed = useWidgetSettingsStore(
    (s) => s.setWidgetCollapsed
  );
  const getWidgetSetting = useWidgetSettingsStore((s) => s.getWidgetSetting);
  const setWidgetSetting = useWidgetSettingsStore((s) => s.setWidgetSetting);
  const resetWidgetSettings = useWidgetSettingsStore(
    (s) => s.resetWidgetSettings
  );

  // Default reset handler: clears all persisted settings for this widget
  const handleResetToDefault = useCallback(() => {
    // Compute namespaced ID to avoid referencing a variable defined later
    const namespacedId = storeKey
      ? createNamespacedWidgetId(storeKey, metadata.id)
      : metadata.id;

    // 1) Remove persisted settings for this widget
    resetWidgetSettings(namespacedId);

    // 2) Ensure custom size flag is cleared (defensive: resetWidgetSettings already deletes the entry)
    const { setWidgetHasCustomSize } = useWidgetSettingsStore.getState();
    try {
      setWidgetHasCustomSize(namespacedId, false);
    } catch {
      // Ignore failures - store may have already removed the entry
    }

    // 3) Reset widget layout sizes to defaults depending on registry
    try {
      const defaultSize = metadata.defaultSize
        ? metadata.defaultSize
        : getCompatibilityDefaultSize(metadata.type);

      // Choose correct store updater depending on registry
      switch (registry) {
        case 'dashboard': {
          const dashboardState = useDashboardStore.getState();
          const dashboardUpdate = dashboardState.updateWidget;
          const existing = dashboardState.widgets.find(
            (w) => w.id === metadata.id
          );
          dashboardUpdate(metadata.id, {
            layoutData: {
              i: metadata.id,
              x: existing?.layoutData?.x ?? 0,
              y: existing?.layoutData?.y ?? 0,
              w: defaultSize.w,
              h: defaultSize.h,
            },
            // clear widget metadata/settings stored on the widget object
            settings: {},
          });
          break;
        }
        case 'trading': {
          const tradingState = useTradingTerminalStore.getState();
          const tradingUpdate = tradingState.updateWidget;
          const existingT = tradingState.widgets.find(
            (w) => w.id === metadata.id
          );
          tradingUpdate(metadata.id, {
            layoutData: {
              i: metadata.id,
              x: existingT?.layoutData?.x ?? 0,
              y: existingT?.layoutData?.y ?? 0,
              w: defaultSize.w,
              h: defaultSize.h,
            },
            settings: {},
          });
          break;
        }
        case 'bot': {
          const botState = useTradingBotStore.getState();
          const botUpdate = botState.updateWidget;
          const existingB = botState.widgets.find((w) => w.id === metadata.id);
          botUpdate(metadata.id, {
            layoutData: {
              i: metadata.id,
              x: existingB?.layoutData?.x ?? 0,
              y: existingB?.layoutData?.y ?? 0,
              w: defaultSize.w,
              h: defaultSize.h,
            },
            settings: {},
          });
          break;
        }
        default:
          break;
      }
    } catch (e) {
      logger.warn('Failed to reset widget layout to defaults', {
        error: e,
        widgetId: metadata.id,
      });
    }

    // Developer log
    logger.info('Widget settings and size reset to default', {
      widgetId: namespacedId,
      widgetType: metadata.type,
    });

    // Ensure UI updates (resize event triggers grid recalculation)
    setTimeout(() => window.dispatchEvent(new Event('resize')), 10);
  }, [
    storeKey,
    metadata.id,
    metadata.type,
    metadata.defaultSize,
    resetWidgetSettings,
    registry,
  ]);

  // Get controls visibility setting from UI store
  const controlsAlwaysVisible = useUIStore((s) => s.controlsAlwaysVisible);
  const fullscreenWidget = useUIStore((s) => s.fullscreenWidget);
  const setFullscreenWidget = useUIStore((s) => s.setFullscreenWidget);
  const exitFullscreen = useUIStore((s) => s.exitFullscreen);
  const selectedWidgetId = useUIStore((s) => s.selectedWidgetId);
  const setSelectedWidget = useUIStore((s) => s.setSelectedWidget);
  const isNativeFullscreen = useUIStore((s) => s.isNativeFullscreen);

  // Initialize the widget refresh hook
  const { forceRefreshWidget } = useWidgetRefresh();

  // Loading states for refresh operations
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState<boolean | null>(null);

  // Check if this widget is currently in fullscreen or selected
  const isFullscreen = fullscreenWidget.widgetId === metadata.id;
  const isSelected = selectedWidgetId === metadata.id;

  // Get portal configuration for this widget
  const portalConfig = useWidgetPortal(metadata.id);

  // Handle widget-specific force refresh with comprehensive user feedback
  const handleForceRefresh = useCallback(async () => {
    try {
      const widgetType = getWidgetTypeFromMetadata(metadata);

      // If the widget provides a custom force refresh handler, use it with loading states
      if (menuActions?.onForceRefresh) {
        setIsRefreshing(true);
        setRefreshSuccess(null);

        await menuActions.onForceRefresh();
        setIsRefreshing(false);
        setRefreshSuccess(true);

        // Clear success message after 2 seconds
        setTimeout(() => setRefreshSuccess(null), 2000);
        return;
      }

      // Otherwise, use the generic refresh mechanism with callbacks
      await forceRefreshWidget(
        widgetType,
        metadata.id,
        undefined, // customQueries
        () => {
          // onStart
          setIsRefreshing(true);
          setRefreshSuccess(null);
        },
        () => {
          // onComplete
          setIsRefreshing(false);
          setRefreshSuccess(true);

          // Clear success message after 2 seconds
          setTimeout(() => setRefreshSuccess(null), 2000);
        },
        (error) => {
          // onError
          setIsRefreshing(false);
          setRefreshSuccess(false);
          console.error('Force refresh failed:', error);

          // Clear error message after 3 seconds
          setTimeout(() => setRefreshSuccess(null), 3000);
        }
      );

      // Provide user feedback
      logger.info(`Force refreshed widget: ${widgetType}`, {
        widgetId: metadata.id,
        widgetType,
      });
    } catch (error) {
      setIsRefreshing(false);
      setRefreshSuccess(false);
      logger.error('Error during force refresh:', error);

      // Clear error message after 3 seconds
      setTimeout(() => setRefreshSuccess(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    forceRefreshWidget,
    metadata,
    menuActions,
    setIsRefreshing,
    setRefreshSuccess,
  ]);

  // Handle fullscreen toggle
  const handleEnterFullscreen = useCallback(() => {
    setFullscreenWidget(metadata.id, registry, storeKey);
  }, [metadata.id, registry, storeKey, setFullscreenWidget]);

  // Handle widget selection
  const handleWidgetClick = useCallback(
    (event: React.MouseEvent) => {
      // Only select widget if editable and not clicking on interactive elements
      if (!isEditable) return;

      const target = event.target as HTMLElement;
      // Don't select if clicking on buttons, inputs, or other interactive elements
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('[data-drag-handle]') ||
        target.closest('[contenteditable]')
      ) {
        return;
      }

      setSelectedWidget(metadata.id);
    },
    [isEditable, metadata.id, setSelectedWidget]
  );

  // Set up keyboard shortcuts
  const { shortcuts } = useWidgetKeyboardShortcuts({
    widgetId: metadata.id,
    onSettings: menuActions?.onOptions || onSettings,
    onDuplicate: menuActions?.onDuplicate,
    onDelete: menuActions?.onDelete,
    onRefresh: menuActions?.onForceRefresh || handleForceRefresh,
    onFullscreen: handleEnterFullscreen,
    isActive: isSelected && !isFullscreen, // Only active when selected and not in fullscreen
    enableGlobalShortcuts: false, // Use modifier keys in normal mode
  });

  // Create the namespaced widget ID
  const namespacedWidgetId = useMemo(() => {
    return storeKey
      ? createNamespacedWidgetId(storeKey, metadata.id)
      : metadata.id;
  }, [storeKey, metadata.id]);

  // Default name change handler that uses widget settings store
  const defaultNameChangeHandler = (widgetId: string, newName: string) => {
    if (newName.trim() === '') {
      // If name is empty, remove custom name to revert to dynamic name
      setWidgetSetting(namespacedWidgetId, 'customName', '');
    } else {
      // Set custom name
      setWidgetSetting(namespacedWidgetId, 'customName', newName.trim());
    }
  };

  // Use provided handler or default
  const handleNameChangeInternal = onNameChange || defaultNameChangeHandler;

  // Get dynamic widget display name
  const displayName = useWidgetDisplayName({
    id: metadata.id,
    type: metadata.type,
    title: metadata.title,
  });

  // Get collapsed state from Zustand store
  const [collapsed, setCollapsed] = useState(() =>
    getWidgetCollapsed(namespacedWidgetId)
  );

  // Get filter state from Zustand store
  const [filtersOpen, setFiltersOpen] = useState(() =>
    Boolean(getWidgetSetting(namespacedWidgetId, 'filtersOpen', false))
  );
  const [activeTabId, setActiveTabId] = useState(metadata.tabs?.[0]?.id || '');
  const [draggedTab, setDraggedTab] = useState<string | null>(null);

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync collapsed state when widget ID changes
  useEffect(() => {
    setCollapsed(getWidgetCollapsed(namespacedWidgetId));
  }, [namespacedWidgetId, getWidgetCollapsed, setCollapsed]);

  // Menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Gear menu state (for options dropdown)
  const [isGearMenuOpen, setIsGearMenuOpen] = useState(false);
  const [gearMenuPosition, setGearMenuPosition] = useState({ top: 0, left: 0 });
  const gearButtonRef = useRef<HTMLButtonElement>(null);

  // Mobile touch state for showing controls
  const [showMobileControls, setShowMobileControls] = useState(false);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Triple-click/tap detection for fullscreen toggle
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const TRIPLE_CLICK_DELAY = 400; // 400ms window for triple-click

  // Mobile touch handlers
  const handleTouchStart = () => {
    // Clear any existing timeout
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
    }
    // Show controls immediately on touch
    setShowMobileControls(true);
  };

  const handleTouchEnd = () => {
    // Hide controls after 3 seconds of no touch
    touchTimeoutRef.current = setTimeout(() => {
      setShowMobileControls(false);
    }, 3000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Handle triple-click/tap for fullscreen toggle
  const handleTripleClick = useCallback(() => {
    clickCountRef.current += 1;

    if (clickCountRef.current === 1) {
      // Start the triple-click timer
      clickTimeoutRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, TRIPLE_CLICK_DELAY);
    } else if (clickCountRef.current === 3) {
      // Triple-click detected - toggle fullscreen
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      clickCountRef.current = 0;

      if (isFullscreen) {
        exitFullscreen();
      } else {
        handleEnterFullscreen();
      }
    }
  }, [isFullscreen, exitFullscreen, handleEnterFullscreen]);

  // Calculate menu position based on button position
  const handleMenuToggle = () => {
    if (!isMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      // WidgetMenu uses fixed positioning; use viewport coordinates
      setMenuPosition({
        top: rect.bottom,
        left: rect.right, // Align to the right edge of the button
      });
    }
    setIsMenuOpen(!isMenuOpen);
  };

  // Calculate gear menu position based on button position
  const handleGearMenuToggle = () => {
    if (!isGearMenuOpen && gearButtonRef.current) {
      const rect = gearButtonRef.current.getBoundingClientRect();
      // WidgetMenu uses fixed positioning; use viewport coordinates
      setGearMenuPosition({
        top: rect.bottom,
        left: rect.right, // Align to the right edge of the button
      });
    }
    setIsGearMenuOpen(!isGearMenuOpen);
  };

  // Save collapsed state to Zustand
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    setWidgetCollapsed(namespacedWidgetId, newCollapsed);
    onCollapse?.(namespacedWidgetId, newCollapsed);

    // Trigger a layout recalculation after state change
    // This helps the grid system respond to height changes
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 10);
  };

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    onTabChange?.(tabId);
  };

  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    logger.debug('Tab drag start', { tabId, widgetId: metadata.id });
    setDraggedTab(tabId);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        tabId,
        fromWidgetId: metadata.id,
        tabData: metadata.tabs?.find((t) => t.id === tabId),
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    logger.debug('Tab drop on', { targetTabId, widgetId: metadata.id });
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
      const { tabId: draggedTabId } = dragData;
      logger.debug('Dragged tab', { draggedTabId });

      if (draggedTabId && draggedTabId !== targetTabId && onTabMove) {
        const targetIndex =
          metadata.tabs?.findIndex((tab) => tab.id === targetTabId) || 0;
        logger.debug('Calling onTabMove with', {
          draggedTabId,
          toWidgetId: metadata.id,
          targetIndex,
        });
        onTabMove(draggedTabId, metadata.id, targetIndex);
      }
    } catch (error) {
      console.error('Error handling tab drop:', error);
    }
    setDraggedTab(null);
  };

  const handleWidgetDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleWidgetDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
      const { tabId: draggedTabId, fromWidgetId } = dragData;

      if (draggedTabId && fromWidgetId !== metadata.id && onTabMove) {
        // Add to end of tabs
        const targetIndex = metadata.tabs?.length || 0;
        onTabMove(draggedTabId, metadata.id, targetIndex);
      }
    } catch (error) {
      console.error('Error handling widget drop:', error);
    }
    setDraggedTab(null);
  };

  const handleNameEdit = () => {
    setIsEditingName(true);
    setEditingName(displayName);
    // Focus the input after state update
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  };

  const handleNameSubmit = () => {
    setIsEditingName(false);
    // Always call the name change handler, even for empty names (to allow reverting to dynamic name)
    handleNameChangeInternal(metadata.id, editingName.trim());
  };

  const handleNameBlur = () => {
    handleNameSubmit();
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditingName(false);
      setEditingName('');
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const activeTab = metadata.tabs?.find((tab) => tab.id === activeTabId);
  const hasContent =
    metadata.tabs && metadata.tabs.length > 0 ? activeTab?.content : children;

  // Wrap content with portal provider to give widgets access to correct portal targets
  const wrappedContent = (
    <WidgetPortalProvider value={portalConfig}>
      {hasContent}
    </WidgetPortalProvider>
  );

  // Options modal element (centralized, with hybrid portal strategy)
  const optionsModal = useMemo(() => {
    // Only render the modal here when NOT in fullscreen/native fullscreen.
    // In fullscreen, the overlay will render the modal to avoid z-index/portal issues.
    if (isFullscreen || isNativeFullscreen) return null;
    if (!metadata.hasOptions || !showOptionsDialog || !renderOptionsContent)
      return null;

    // Optionally focus could be handled here in future for accessibility

    const content = (
      <div
        className={clsx(
          'fixed inset-0 flex items-center justify-center bg-black/50 pointer-events-auto',
          portalConfig.zIndexClass
        )}
        onClick={() => onCloseOptionsDialog?.()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={clsx(
            'bg-popover rounded-lg p-md max-h-[85vh] overflow-y-auto shadow-2xl',
            optionsWidthClass || 'w-80 sm:w-[420px]'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold text-sm">
              {optionsTitle || 'Widget Options'}
            </h3>
            <button
              onClick={() => onCloseOptionsDialog?.()}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close options"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {renderOptionsContent?.(() => onCloseOptionsDialog?.())}
        </div>
      </div>
    );

    return portalConfig.shouldUsePortal
      ? createPortal(content, portalConfig.portalTarget)
      : content;
  }, [
    metadata.hasOptions,
    showOptionsDialog,
    renderOptionsContent,
    onCloseOptionsDialog,
    optionsTitle,
    optionsWidthClass,
    portalConfig.shouldUsePortal,
    portalConfig.portalTarget,
    portalConfig.zIndexClass,
    isFullscreen,
    isNativeFullscreen,
  ]);

  // Cleanup for Escape key handler when modal is open
  useEffect(() => {
    if (!showOptionsDialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseOptionsDialog?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOptionsDialog, onCloseOptionsDialog]);

  const overlayControlsEnabled = isEditable && !controlsAlwaysVisible;
  const mobileControlsVisible = controlsAlwaysVisible || showMobileControls;

  const renderFilterButtons = () => {
    if (!metadata.hasFilters) {
      return null;
    }

    return (
      <>
        {metadata.filtersActive && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => metadata.onClearFilters?.()}
            className="p-0"
            title="Clear active filters"
            aria-label="Clear active filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const newFiltersOpen = !filtersOpen;
            setFiltersOpen(newFiltersOpen);
            setWidgetSetting(namespacedWidgetId, 'filtersOpen', newFiltersOpen);
          }}
          className={clsx(
            'p-0',
            filtersOpen
              ? 'bg-primary/10 text-primary'
              : metadata.filtersActive
                ? 'bg-primary/5 text-primary'
                : ''
          )}
          title={filtersOpen ? 'Hide filters' : 'Show filters'}
          aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </>
    );
  };

  const controlButtons = (
    <>
      {renderFilterButtons()}

      {metadata.hasOptions && menuActions?.optionsMenuItems?.length ? (
        <Button
          ref={gearButtonRef}
          variant="ghost"
          size="icon"
          onClick={handleGearMenuToggle}
          className="p-0"
          title="Widget Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>
      ) : (
        menuActions?.onOptions &&
        metadata.hasOptions && (
          <Button
            variant="ghost"
            size="icon"
            onClick={menuActions.onOptions}
            className="p-0"
            title="Widget Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Button>
        )
      )}

      <Button
        ref={menuButtonRef}
        variant="ghost"
        size="icon"
        onClick={handleMenuToggle}
        className="p-0"
        title="Widget Menu"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </Button>

      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="p-0 hover:bg-destructive/10 hover:text-destructive"
          title="Remove Widget"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Button>
      )}

      {/* Drag Handle - only show when layout is unlocked (editable mode) - positioned as last button */}
      {isEditable && !controlsAlwaysVisible && (
        <div
          className={clsx(
            'p-0.5 rounded hover:bg-muted/50 transition-colors cursor-move flex items-center justify-center pointer-events-auto h-8 w-8'
          )}
          title="Drag to move widget"
          style={{ cursor: 'grab' }}
          onMouseDown={(e) => (e.currentTarget.style.cursor = 'grabbing')}
          onMouseUp={(e) => (e.currentTarget.style.cursor = 'grab')}
          data-drag-handle="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <circle cx="9" cy="12" r="1" />
            <circle cx="9" cy="5" r="1" />
            <circle cx="9" cy="19" r="1" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="15" cy="5" r="1" />
            <circle cx="15" cy="19" r="1" />
          </svg>
        </div>
      )}
    </>
  );

  return (
    <Widget
      className={clsx(
        collapsed ? 'h-auto' : 'h-full',
        'group transition-all duration-200 cursor-pointer',
        isSelected && isEditable && 'ring-2 ring-primary/50 shadow-md',
        className
      )}
      noPadding={true}
      data-widget-id={metadata.id}
      data-widget-type={metadata.type}
      data-widget-collapsed={collapsed}
      data-widget-selected={isSelected}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleTripleClick}
      onMouseDown={handleWidgetClick}
      style={{
        height: collapsed ? 'auto' : style?.height || '100%',
        minHeight: collapsed ? 'auto' : style?.minHeight,
        maxHeight: collapsed ? 'none' : style?.maxHeight,
        ...style,
      }}
      onDragOver={handleWidgetDragOver}
      onDrop={handleWidgetDrop}
    >
      {/* Widget Header - only render if header is not explicitly set to false */}
      {metadata.header !== false && (
        <div className="relative flex flex-wrap items-center justify-between gap-xs px-1.5 sm:px-2 py-3 border-b border-border bg-muted/30 h-[60px]">
          <div className="flex items-center gap-xs flex-1 min-w-0">
            {isCollapsible && (
              <Button
                onClick={toggleCollapsed}
                tabIndex={0}
                className={clsx(
                  'rounded hover:bg-muted/50 transition-all duration-200 focus:outline-none shrink-0 flex items-center justify-center p-0 opacity-100 pointer-events-auto'
                )}
                title={collapsed ? 'Expand' : 'Collapse'}
                aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
                variant="ghost"
                size="icon"
              >
                {collapsed ? (
                  // Chevron Down
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                ) : (
                  // Chevron Up
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                )}
              </Button>
            )}

            {/* Widget Title/Filter Section */}
            <div className="flex items-center gap-xs flex-1 min-w-0">
              {/* Widget Title */}
              <div
                className={clsx(
                  'flex items-center gap-1 min-w-0',
                  !isCollapsible && 'mx-sm'
                )}
              >
                <h3 className="text-base font-semibold text-foreground min-w-0 flex items-center">
                  {isEditingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={editingName}
                      onChange={handleNameChange}
                      onBlur={handleNameBlur}
                      onKeyDown={handleNameKeyDown}
                      className="bg-transparent border-b border-primary focus:outline-none focus:ring-0 text-foreground text-base font-medium min-w-0 w-full"
                      aria-label="Edit widget name"
                    />
                  ) : (
                    <button
                      onClick={isEditable ? handleNameEdit : undefined}
                      className={clsx(
                        'text-left w-full min-w-0 flex items-center',
                        isEditable &&
                          'hover:text-primary transition-colors cursor-pointer'
                      )}
                      title={
                        isEditable ? 'Click to edit widget name' : undefined
                      }
                      disabled={!isEditable}
                    >
                      <TruncatedText
                        text={String(displayName ?? metadata.title ?? '')}
                        className="block w-full text-base font-medium text-foreground"
                        title={String(displayName ?? metadata.title ?? '')}
                      />
                    </button>
                  )}
                </h3>

                {/* Loading indicator during refresh */}
                {isRefreshing && (
                  <div
                    className="flex items-center"
                    title="Refreshing widget data..."
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground animate-spin"
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  </div>
                )}

                {/* Success indicator */}
                {refreshSuccess === true && (
                  <div
                    className="flex items-center"
                    title="Widget refreshed successfully"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-500"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                {/* Error indicator */}
                {refreshSuccess === false && (
                  <div
                    className="flex items-center"
                    title="Failed to refresh widget"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-red-500"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                )}

                {/* Stale-while-revalidate indicator */}
                {cacheQueries && cacheQueries.length > 0 && (
                  <StaleIndicator componentId={metadata.id} />
                )}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-end gap-xs shrink-0 min-w-0 ml-1 mr-1 sm:ml-2">
            {!isEditable && metadata.hasFilters && (
              <div className="mr-2 flex shrink-0 items-center gap-1">
                {renderFilterButtons()}
              </div>
            )}
            {metadata.value && (
              <div
                className={clsx(
                  'flex flex-wrap items-end justify-end gap-x-3 gap-y-1 text-right min-w-0 transition-opacity duration-200',
                  overlayControlsEnabled && mobileControlsVisible
                    ? 'opacity-30 sm:opacity-100'
                    : undefined
                )}
              >
                <div className="flex flex-col items-end">
                  <span
                    className={clsx(
                      'text-sm font-semibold',
                      metadata.value.isProfit !== undefined
                        ? metadata.value.isProfit
                          ? 'text-profit'
                          : 'text-loss'
                        : 'text-foreground'
                    )}
                  >
                    {typeof metadata.value.primary === 'number'
                      ? formatNumber(metadata.value.primary)
                      : metadata.value.primary}
                  </span>
                  {metadata.value.secondary && (
                    <span className="text-xs text-muted-foreground">
                      {metadata.value.secondary}
                    </span>
                  )}
                </div>
                {metadata.value.change && (
                  <div className="flex flex-col items-end text-xs">
                    <span
                      className={clsx(
                        'font-medium',
                        metadata.value.change.isPositive
                          ? 'text-profit'
                          : 'text-loss'
                      )}
                    >
                      {metadata.value.change.isPositive ? '+' : ''}
                      {typeof metadata.value.change.percentage === 'number'
                        ? formatNumber(metadata.value.change.percentage)
                        : metadata.value.change.percentage}
                      %
                    </span>
                    <span
                      className={clsx(
                        'text-xs',
                        metadata.value.change.isPositive
                          ? 'text-profit'
                          : 'text-loss'
                      )}
                    >
                      {metadata.value.change.isPositive ? '+' : ''}
                      {typeof metadata.value.change.value === 'number'
                        ? formatNumber(metadata.value.change.value)
                        : metadata.value.change.value}
                    </span>
                  </div>
                )}
              </div>
            )}

            {isEditable && overlayControlsEnabled && (
              <div
                className={clsx(
                  'absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md border border-border/60 bg-muted/95 px-1.5 py-1 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out',
                  mobileControlsVisible
                    ? 'opacity-100 translate-x-0 pointer-events-auto'
                    : 'opacity-0 translate-x-3 pointer-events-none',
                  'sm:pointer-events-none sm:opacity-0 sm:translate-x-3 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:translate-x-0 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:translate-x-0'
                )}
              >
                {controlButtons}
              </div>
            )}

            {isEditable && !overlayControlsEnabled && (
              <div
                className={clsx(
                  'flex items-center space-x-1 shrink-0 transition-all duration-200',
                  controlsAlwaysVisible || showMobileControls
                    ? 'flex'
                    : 'hidden',
                  controlsAlwaysVisible
                    ? 'sm:flex'
                    : 'sm:hidden sm:group-hover:flex sm:group-focus-within:flex'
                )}
              >
                {controlButtons}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal-based Widget Menu */}
      {!isFullscreen && (
        <WidgetMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          position={menuPosition}
          actions={{
            ...(menuActions || {}),
            onOptions: menuActions?.optionsMenuItems?.length
              ? () => handleGearMenuToggle()
              : menuActions?.onOptions || (() => {}),
            onResetToDefault:
              menuActions?.onResetToDefault ?? handleResetToDefault,
          }}
          hasOptions={Boolean(metadata.hasOptions)}
          isEditable={isEditable}
          onEnterFullscreen={handleEnterFullscreen}
          onExitFullscreen={exitFullscreen}
          onGenericForceRefresh={handleForceRefresh}
          isRefreshing={isRefreshing}
          refreshSuccess={refreshSuccess}
          isInFullscreen={isFullscreen}
          isInNativeFullscreen={isNativeFullscreen}
          portalTarget={portalConfig.portalTarget}
          zIndexClass={portalConfig.zIndexClass}
          shouldUsePortal={portalConfig.shouldUsePortal}
          shortcuts={shortcuts}
        />
      )}

      {/* Portal-based Gear Menu */}
      {menuActions?.optionsMenuItems?.length && !isFullscreen && (
        <WidgetMenu
          isOpen={isGearMenuOpen}
          onClose={() => setIsGearMenuOpen(false)}
          position={gearMenuPosition}
          actions={{
            optionsMenuItems: menuActions.optionsMenuItems,
          }}
          hasOptions={false}
          isEditable={false}
          isInFullscreen={false}
          isInNativeFullscreen={false}
          portalTarget={portalConfig.portalTarget}
          zIndexClass={portalConfig.zIndexClass}
          shouldUsePortal={portalConfig.shouldUsePortal}
        />
      )}

      {/* Widget Tabs */}
      {(!isCollapsible || !collapsed) &&
        metadata.tabs &&
        metadata.tabs.length > 0 && (
          <div className="flex bg-muted/30">
            {metadata.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                draggable={isEditable}
                onDragStart={(e) => {
                  e.stopPropagation(); // Prevent widget drag
                  handleTabDragStart(e, tab.id);
                }}
                onDragOver={(e) => {
                  e.stopPropagation();
                  handleTabDragOver(e);
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleTabDrop(e, tab.id);
                }}
                className={clsx(
                  'px-1 sm:px-2 py-2 text-sm font-medium transition-colors border-r border-border',
                  activeTabId === tab.id
                    ? 'bg-card text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  draggedTab === tab.id && 'opacity-50',
                  isEditable && 'cursor-move'
                )}
                title={
                  isEditable
                    ? 'Drag to reorder or move to another widget'
                    : undefined
                }
                style={isEditable ? { cursor: 'grab' } : undefined}
                onMouseDown={(e) => {
                  if (isEditable) {
                    e.currentTarget.style.cursor = 'grabbing';
                  }
                }}
                onMouseUp={(e) => {
                  if (isEditable) {
                    e.currentTarget.style.cursor = 'grab';
                  }
                }}
              >
                {tab.title}
              </button>
            ))}
          </div>
        )}

      {/* Widget Content */}
      {(!isCollapsible || !collapsed) && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className={clsx(
              'flex-1 overflow-auto relative',
              noPadding ? 'p-0' : 'p-1'
            )}
          >
            {/* Drag handle for headerless widgets */}
            {metadata.header === false && isEditable && (
              <div
                className={clsx(
                  'absolute top-2 right-2 p-0.5 rounded hover:bg-muted/50 transition-all duration-200 cursor-move z-10',
                  // Mobile: show when touched or always visible, Desktop: hidden but show on hover or always visible
                  controlsAlwaysVisible || showMobileControls
                    ? 'block'
                    : 'hidden',
                  controlsAlwaysVisible
                    ? 'sm:block'
                    : 'sm:hidden sm:group-hover:block sm:group-focus-within:block'
                )}
                title="Drag to move widget"
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => (e.currentTarget.style.cursor = 'grabbing')}
                onMouseUp={(e) => (e.currentTarget.style.cursor = 'grab')}
                data-drag-handle="true"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <circle cx="9" cy="12" r="1" />
                  <circle cx="9" cy="5" r="1" />
                  <circle cx="9" cy="19" r="1" />
                  <circle cx="15" cy="12" r="1" />
                  <circle cx="15" cy="5" r="1" />
                  <circle cx="15" cy="19" r="1" />
                </svg>
              </div>
            )}
            {wrappedContent}
          </div>

          {/* Filter Section */}
          {metadata.hasFilters && metadata.filterContent && (
            <WidgetFilterArea isOpen={filtersOpen}>
              {metadata.filterContent}
            </WidgetFilterArea>
          )}
        </div>
      )}

      {/* Fullscreen Overlay */}
      {isFullscreen && (
        <FullscreenWidgetOverlay
          onWidgetSettings={menuActions?.onOptions || onSettings}
          onWidgetDuplicate={menuActions?.onDuplicate}
          onWidgetDelete={menuActions?.onDelete}
          onWidgetRefresh={menuActions?.onForceRefresh || handleForceRefresh}
          onWidgetResetToDefault={
            menuActions?.onResetToDefault ?? handleResetToDefault
          }
          hasWidgetOptions={metadata.hasOptions}
          isRefreshing={isRefreshing}
          refreshSuccess={refreshSuccess}
          // Options dialog props for fullscreen/native fullscreen
          showOptionsDialog={Boolean(metadata.hasOptions && showOptionsDialog)}
          onCloseOptionsDialog={onCloseOptionsDialog}
          renderOptionsContent={renderOptionsContent}
          optionsTitle={optionsTitle}
          optionsWidthClass={optionsWidthClass}
        >
          <div className="h-full w-full p-sm">{wrappedContent}</div>
        </FullscreenWidgetOverlay>
      )}

      {/* Centralized Options Modal */}
      {optionsModal}
    </Widget>
  );
};

// Memoize the default export so the wrapperProps/metadata memos that widgets
// build actually pay off: WidgetWrapper now re-renders only when its own props
// change, not on every parent re-render. Post-refactor the props widgets pass
// (menuActions, stable callbacks, primitive flags) are stable enough for memo
// to hit on non-data re-renders.
const MemoizedWidgetWrapper = React.memo(WidgetWrapper);
MemoizedWidgetWrapper.displayName = 'WidgetWrapper';

export default MemoizedWidgetWrapper;

