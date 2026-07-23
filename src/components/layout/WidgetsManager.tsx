import { TradingModeIcon } from '@/components/common/TradingModeIcon';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { logger } from '@/lib/loggerInstance';
import { showShortcutHint } from '@/lib/shortcutHints';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowUpDown, Grid, MoreVertical, Pin, PinOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useMultiDashboardBridge } from '../../hooks/useMultiDashboardBridge';
import { useMultiReportBridge } from '../../hooks/useMultiReportBridge';
import {
  getAvailableReportWidgetTypes,
  getReportWidgetMetadata,
} from '../../reports/widgets/reportWidgetRegistry';
import { useTradingBotStore } from '../../stores/botWidgetsStoreFactory';
import { useDashboardStore } from '../../stores/dashboardStore';
import {
  useNavigationWidgetsStore,
  type NavigationWidgetType,
} from '../../stores/navigationWidgetsStore';
import { useShortcutStore } from '../../stores/shortcutStore';
import { useTradingTerminalStore } from '../../stores/tradingTerminalStore';
import { useUIStore } from '../../stores/uiStore';
import { useVisualSettingsStore } from '../../stores/visualSettingsStore';
import ShortcutChip from '../common/ShortcutChip';
import { Button } from '../ui/button';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';
import { Switch } from '../ui/switch';
import { InfoIcon, Tooltip } from '../ui/tooltip';
import {
  getAvailableBotWidgetTypesForPage,
  getBotWidgetMetadata,
} from '../widgets/bots';
import { WIDGET_REGISTRY, type WidgetType } from '../widgets/dashboard';
import {
  getCurrentBreakpoint,
  getDefaultWidgetSize,
} from '../widgets/DefaultWidgetSizes';
import {
  getAvailableNavigationWidgetTypes,
  getNavigationWidgetMetadata,
} from '../widgets/navigation';
import {
  getAvailableTradingWidgetTypes,
  getTradingWidgetMetadata,
} from '../widgets/trading';
import AddWidgetButton from './AddWidgetButton';
import { SortableWidgetItem } from './SortableWidgetItem';
import WidgetBrowserDialog from './WidgetBrowserDialog';

interface WidgetsManagerProps {
  registry: 'dashboard' | 'trading' | 'bot' | 'navigation' | 'report';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store?: any; // Optional store prop for bot registry - complex union type
  showNavigationSection?: boolean; // Whether to show navigation widgets section
  botTypeId?: string | null;
  mode?: 'create' | 'edit';
  variant?: 'drawer' | 'embedded';
}

/**
 * NavigationOptions Component
 * Shows navigation bar configuration options at the top of the navigation widgets manager
 */
const NavigationOptions: React.FC = () => {
  const showTradingModeIcon = useVisualSettingsStore(
    (s) => s.showTradingModeIcon
  );
  const setShowTradingModeIcon = useVisualSettingsStore(
    (s) => s.setShowTradingModeIcon
  );
  const moveButtonsToMenu = useVisualSettingsStore((s) => s.moveButtonsToMenu);
  const setMoveButtonsToMenu = useVisualSettingsStore(
    (s) => s.setMoveButtonsToMenu
  );
  const isStickyHeader = useDashboardStore((s) => s.isStickyHeader);
  const toggleStickyHeader = useDashboardStore((s) => s.toggleStickyHeader);
  const autoHideNavbar = useVisualSettingsStore((s) => s.autoHideNavbar);
  const setAutoHideNavbar = useVisualSettingsStore((s) => s.setAutoHideNavbar);

  const isMobile =
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false;

  return (
    <div className="shrink-0 p-sm border-b border-border">
      <h4 className="font-medium text-sm mb-3 text-foreground">
        Navigation Bar Options
      </h4>
      <div className="space-y-xs">
        <div className="flex items-center justify-between p-sm rounded-md bg-card  shadow-sm">
          <div className="flex items-center gap-xs flex-1">
            <TradingModeIcon size="sm" showTooltip={false} />
            <div>
              <div className="font-medium text-sm text-card-foreground">
                Show trading mode icon
              </div>
              <div className="text-xs text-muted-foreground">
                Toggle the icon next to the page title
              </div>
            </div>
          </div>
          <Switch
            checked={showTradingModeIcon}
            onCheckedChange={(checked) => setShowTradingModeIcon(checked)}
          />
        </div>
        <div className="flex items-center justify-between p-sm rounded-md bg-card  shadow-sm">
          <div className="flex items-center gap-xs flex-1">
            <MoreVertical className="h-4 w-4" />
            <div>
              <div className="font-medium text-sm text-card-foreground">
                Move buttons to page menu
              </div>
              <div className="text-xs text-muted-foreground">
                On desktop, move managers and notifications into the menu
              </div>
            </div>
          </div>
          <Switch
            checked={isMobile ? true : moveButtonsToMenu}
            disabled={isMobile}
            onCheckedChange={(checked) => setMoveButtonsToMenu(checked)}
          />
        </div>
        <div className="flex items-center justify-between p-sm rounded-md bg-card  shadow-sm">
          <div className="flex items-center gap-xs flex-1">
            {isStickyHeader ? (
              <Pin className="h-4 w-4" />
            ) : (
              <PinOff className="h-4 w-4" />
            )}
            <div>
              <div className="font-medium text-sm text-card-foreground">
                Pin Navigation bar
              </div>
              <div className="text-xs text-muted-foreground">
                Keep the navbar pinned at the top
              </div>
            </div>
          </div>
          <Switch
            checked={autoHideNavbar ? true : isStickyHeader}
            disabled={autoHideNavbar}
            onCheckedChange={(checked) => {
              if (autoHideNavbar) return;
              if (checked !== isStickyHeader) toggleStickyHeader();
            }}
          />
        </div>
        <div className="flex items-center justify-between p-sm rounded-md bg-card  shadow-sm">
          <div className="flex items-center gap-xs flex-1">
            <ArrowUpDown className="h-4 w-4" />
            <div>
              <div className="font-medium text-sm text-card-foreground">
                Auto-hide Navbar
              </div>
              <div className="text-xs text-muted-foreground">
                Navbar hides when scrolling down and reappears when scrolling up
              </div>
            </div>
          </div>
          <Switch
            checked={autoHideNavbar}
            onCheckedChange={(checked) => {
              setAutoHideNavbar(checked);
            }}
          />
        </div>
      </div>
    </div>
  );
};

const WidgetsManager: React.FC<WidgetsManagerProps> = ({
  registry = 'dashboard',
  store,
  showNavigationSection = false,
  botTypeId,
  mode,
  variant = 'drawer',
}) => {
  // Always call all hooks unconditionally
  useShortcutStore();
  const dashboardStore = useMultiDashboardBridge();
  const reportStore = useMultiReportBridge();
  const tradingStore = useTradingTerminalStore();
  const defaultBotStore = useTradingBotStore();
  const navigationStore = useNavigationWidgetsStore();
  const isTrading = registry === 'trading';
  const isBot = registry === 'bot';
  const isNavigation = registry === 'navigation';
  const isReport = registry === 'report';

  // Select the appropriate store based on registry
  const botStore = isBot ? store || defaultBotStore : null;
  const derivedBotTypeId: string | null =
    botTypeId ?? botStore?.botTypeId ?? null;
  const derivedBotMode: 'create' | 'edit' =
    (mode ?? botStore?.mode ?? botStore?.widgetSet) === 'edit'
      ? 'edit'
      : 'create';

  const { widgets, addWidget, removeWidget, reorderWidgets } = isReport
    ? reportStore
    : isTrading
      ? tradingStore
      : isBot
        ? botStore
        : isNavigation
          ? navigationStore
          : dashboardStore;

  // Navigation widgets (only if showNavigationSection is true)
  const {
    widgets: navigationWidgets,
    addWidget: addNavigationWidget,
    removeWidget: removeNavigationWidget,
    reorderWidgets: _reorderNavigationWidgets, // Prefix with underscore since it's not used yet
  } = navigationStore;

  // Get UI settings
  const controlsAlwaysVisible = useUIStore((s) => s.controlsAlwaysVisible);
  const toggleControlsAlwaysVisible = useUIStore(
    (s) => s.toggleControlsAlwaysVisible
  );

  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const isEmbedded = variant === 'embedded';

  // Widget browser dialog state
  const [isWidgetBrowserOpen, setIsWidgetBrowserOpen] = useState(false);
  const [widgetBrowserType, setWidgetBrowserType] = useState<
    'navigation' | 'main'
  >('main');

  // Add a refresh key to trigger re-renders when settings might have changed
  const [refreshKey, setRefreshKey] = useState(0);

  // Define a common widget type for categorization
  interface CategorizedWidget {
    type: string;
    title: string;
    description: string;
    category: string;
    defaultSize: { w: number; h: number };
    hasOptions: boolean;
  }

  // Get available widget types for current registry
  const availableWidgetTypes: CategorizedWidget[] = isReport
    ? getAvailableReportWidgetTypes().map((type) => ({
        type,
        title: getReportWidgetMetadata(type)?.title || type,
        description: getReportWidgetMetadata(type)?.description || '',
        category: getReportWidgetMetadata(type)?.category || 'Other',
        defaultSize: getReportWidgetMetadata(type)?.defaultSize || {
          w: 6,
          h: 4,
        },
        hasOptions: getReportWidgetMetadata(type)?.hasOptions || false,
      }))
    : isTrading
      ? getAvailableTradingWidgetTypes().map((type) => ({
          type,
          title: getTradingWidgetMetadata(type)?.title || type,
          description: getTradingWidgetMetadata(type)?.description || '',
          category: getTradingWidgetMetadata(type)?.category || 'Other',
          defaultSize: getTradingWidgetMetadata(type)?.defaultSize || {
            w: 6,
            h: 4,
          },
          hasOptions: getTradingWidgetMetadata(type)?.hasOptions || false,
        }))
      : isBot
        ? getAvailableBotWidgetTypesForPage(derivedBotMode, {
            botTypeId: derivedBotTypeId,
          }).map((type) => ({
            type,
            title: getBotWidgetMetadata(type)?.title || type,
            description: '',
            category: getBotWidgetMetadata(type)?.category || 'Other',
            defaultSize: getBotWidgetMetadata(type)?.defaultSize || {
              w: 6,
              h: 4,
            },
            hasOptions: getBotWidgetMetadata(type)?.hasOptions || false,
          }))
        : Object.entries(WIDGET_REGISTRY).map(([type, config]) => ({
            type: type as WidgetType,
            title: config.metadata.title,
            description:
              (config.metadata as { description?: string }).description || '',
            category:
              (config.metadata as { category?: string }).category || 'Other',
            defaultSize: config.metadata.defaultSize,
            hasOptions: config.metadata.hasOptions,
          }));

  // Available navigation widget types (only if showNavigationSection is true)
  const availableNavigationWidgetTypes: CategorizedWidget[] =
    showNavigationSection
      ? getAvailableNavigationWidgetTypes().map((type) => ({
          type,
          title: getNavigationWidgetMetadata(type)?.title || type,
          description: getNavigationWidgetMetadata(type)?.description || '',
          category: getNavigationWidgetMetadata(type)?.category || 'Navigation',
          defaultSize: { w: 6, h: 4 }, // Navigation widgets don't use grid layout
          hasOptions: getNavigationWidgetMetadata(type)?.hasOptions || false,
        }))
      : [];

  // Set up drag sensors with better mobile configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Slightly increased for mobile
      },
    }),
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Reduced delay for better responsiveness
        tolerance: 8, // Increased tolerance for mobile
      },
    })
  );

  const activeOverlayWidget = activeId
    ? widgets.find((widget: { id: string }) => widget.id === activeId)
    : null;

  // Listen for widget setting changes and external open events
  useEffect(() => {
    const handleWidgetSettingsChange = () => {
      setRefreshKey((prev) => prev + 1);
    };

    const handleExternalOpen = (event: CustomEvent) => {
      // Only respond if the registry matches or if no registry is specified in event
      if (!event.detail?.registry || event.detail.registry === registry) {
        // Support both toggle and explicit open/close actions
        const action = event.detail?.action;
        if (action === 'toggle') {
          setIsOpen((prev) => !prev);
        } else if (action === 'close') {
          setIsOpen(false);
        } else {
          // Default behavior (existing) - always open
          setIsOpen(true);
        }
      }
    };

    // Listen for custom widget settings change events
    window.addEventListener(
      'widgetSettingsChanged',
      handleWidgetSettingsChange
    );

    // Listen for external open events from navbar (drawer mode only)
    if (!isEmbedded) {
      window.addEventListener(
        'openWidgetsManager',
        handleExternalOpen as EventListener
      );
    }

    return () => {
      window.removeEventListener(
        'widgetSettingsChanged',
        handleWidgetSettingsChange
      );
      if (!isEmbedded) {
        window.removeEventListener(
          'openWidgetsManager',
          handleExternalOpen as EventListener
        );
      }
    };
  }, [isEmbedded, registry]);

  // Refresh when the popover opens to get latest settings
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setRefreshKey((prev) => prev + 1);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!active || !over) {
      logger.debug('Drag ended without valid active or over element');
      return;
    }

    if (active.id !== over.id) {
      logger.info(`Reordering widget from ${active.id} to ${over.id}`);
      try {
        reorderWidgets(active.id as string, over.id as string);
        logger.info('Widget reorder completed successfully');
      } catch (error) {
        logger.error('Failed to reorder widgets:', error);
      }
    } else {
      logger.debug('Widget dropped in same position, no reordering needed');
    }
  };

  const handleAddWidget = (
    widgetType: CategorizedWidget,
    isNavigationWidget = false
  ) => {
    if (isNavigationWidget) {
      // Check if this navigation widget type already exists
      const existingWidget = navigationWidgets.find(
        (w) => w.type === widgetType.type
      );

      if (existingWidget) {
        console.warn(
          `Navigation widget of type ${widgetType.type} already exists`
        );
        // Close the widget browser but don't add duplicate
        setIsWidgetBrowserOpen(false);
        return;
      }

      // Navigation widgets don't use grid layout
      const newWidget = {
        id: `${widgetType.type}-${Date.now()}`,
        type: widgetType.type as NavigationWidgetType,
        title: widgetType.title,
        data: {},
        settings: {},
      };
      addNavigationWidget(newWidget);
      // Close the widget browser after adding navigation widget
      setIsWidgetBrowserOpen(false);
      return;
    }

    // Get current container width for responsive widget sizing
    // Use window width minus sidebar and padding as approximation
    const containerWidth = window.innerWidth - 64;
    const currentBreakpoint = getCurrentBreakpoint(containerWidth);

    // Get responsive size for current breakpoint instead of static defaultSize
    const responsiveSize = getDefaultWidgetSize(
      widgetType.type,
      currentBreakpoint
    );

    logger.debug('Adding widget with responsive size:', {
      widgetType: widgetType.type,
      containerWidth,
      breakpoint: currentBreakpoint,
      staticSize: widgetType.defaultSize,
      responsiveSize,
    });

    // Find an available position for the new widget
    const findAvailablePosition = (w: number, h: number) => {
      const existingLayouts = widgets.map(
        (widget: {
          layoutData: { x: number; y: number; w: number; h: number };
        }) => widget.layoutData
      );
      const maxCols = 12; // Based on grid layout

      // Try to find an empty spot
      for (let y = 0; y < 20; y++) {
        // Check up to 20 rows
        for (let x = 0; x <= maxCols - w; x++) {
          let canPlace = true;

          // Check if this position conflicts with existing widgets
          for (const layout of existingLayouts) {
            if (
              x < layout.x + layout.w &&
              x + w > layout.x &&
              y < layout.y + layout.h &&
              y + h > layout.y
            ) {
              canPlace = false;
              break;
            }
          }

          if (canPlace) {
            return { x, y };
          }
        }
      }

      // If no spot found, place at bottom
      const maxY = Math.max(
        0,
        ...existingLayouts.map(
          (l: { x: number; y: number; w: number; h: number }) => l.y + l.h
        )
      );
      return { x: 0, y: maxY };
    };

    const position = findAvailablePosition(responsiveSize.w, responsiveSize.h);

    const newWidget = {
      id: `${widgetType.type}-${Date.now()}`,
      type: widgetType.type,
      title: widgetType.title,
      layoutData: {
        i: `${widgetType.type}-${Date.now()}`,
        x: position.x,
        y: position.y,
        w: responsiveSize.w,
        h: responsiveSize.h,
      },
      data: {},
      settings: {},
      hasOptions: widgetType.hasOptions, // <-- Add this line
    };
    // Type assertion to handle registry differences - the stores will accept the appropriate types
    (addWidget as (widget: Record<string, unknown>) => void)(newWidget);
    // Don't close the popup so user can add multiple widgets
    // setIsOpen(false);
  };

  const handleRemoveWidget = (widgetId: string) => {
    removeWidget(widgetId);
  };

  const handleWidgetOptions = (widgetId: string) => {
    // Trigger the widget's options by dispatching a custom event
    // The widget components will listen for this event
    window.dispatchEvent(
      new CustomEvent('openWidgetOptions', {
        detail: { widgetId },
      })
    );
  };

  // For the widget manager list, use the widgets in their current order (not sorted by position)
  // This allows users to see and reorder widgets in the order they appear in the grid
  const sortedWidgets = [...widgets];

  // Sort navigation widgets (keep original order)
  const sortedNavigationWidgets = [...navigationWidgets];

  const content = (
    <div className="p-0 flex flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Navigation Options - Fixed at top when in navigation mode */}
        {isNavigation && <NavigationOptions />}

        {/* Global Settings - Fixed at top - hide when in navigation mode */}
        {!isNavigation && (
          <div className="shrink-0 p-sm border-b border-border">
            <h4 className="font-medium text-sm mb-3 text-foreground">
              Settings
            </h4>
            <div className="flex items-center justify-between p-sm rounded-md bg-card  shadow-sm">
              <div className="flex-1">
                <div className="flex items-center gap-xs">
                  <div className="font-medium text-sm text-card-foreground">
                    Controls always visible
                  </div>
                  <Tooltip
                    tooltip="Keep widget controls (settings, menu, remove, drag handle) permanently visible instead of showing them on hover. Easier on touch devices; hover-only keeps the dashboard cleaner."
                    tooltipURL="/help/custom-dashboards"
                  >
                    <InfoIcon />
                  </Tooltip>
                </div>
                <div className="text-xs text-muted-foreground">
                  Show widget controls without hovering
                </div>
              </div>
              <Switch
                checked={controlsAlwaysVisible}
                onCheckedChange={toggleControlsAlwaysVisible}
              />
            </div>
          </div>
        )}

        {/* Content Area (scrolls only in drawer mode) */}
        <div
          className={
            isEmbedded
              ? 'overflow-visible'
              : 'flex-1 min-h-0 overflow-y-auto pb-20 md:pb-0'
          }
        >
          {/* Navigation Widgets Section - only show when in navigation mode */}
          {showNavigationSection && isNavigation && (
            <div className="p-sm border-b border-border">
              <h4 className="font-medium text-sm mb-3 text-foreground">
                {isNavigation ? 'Nav Widgets' : 'Navigation Widgets'} (
                {navigationWidgets.length})
              </h4>
              <div className="space-y-sm" key={`nav-${refreshKey}`}>
                <SortableContext
                  items={sortedNavigationWidgets.map((w) => w.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedNavigationWidgets.map((widget) => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={{
                        ...widget,
                        hasOptions:
                          getNavigationWidgetMetadata(widget.type)
                            ?.hasOptions || false,
                      }}
                      onOptions={(widgetId) => {
                        // Trigger navigation widget options
                        window.dispatchEvent(
                          new CustomEvent('openWidgetOptions', {
                            detail: { widgetId, isNavigation: true },
                          })
                        );
                      }}
                      onRemove={(widgetId) => removeNavigationWidget(widgetId)}
                    />
                  ))}
                </SortableContext>

                {/* Add Navigation Widget Button */}
                <AddWidgetButton
                  onClick={() => {
                    setWidgetBrowserType('navigation');
                    setIsWidgetBrowserOpen(true);
                  }}
                >
                  Add Navigation Widget
                </AddWidgetButton>
              </div>
            </div>
          )}

          {/* Current Widgets Section - hide when registry is 'navigation' */}
          {!isNavigation && (
            <div className="p-sm border-b border-border">
              <h4 className="font-medium text-sm mb-3 text-foreground flex items-center gap-xs">
                <span>
                  {registry.charAt(0).toUpperCase() + registry.slice(1)}{' '}
                  Widgets ({widgets.length})
                </span>
                <Tooltip
                  tooltip="Drag entries to reorder widgets on the grid. You can add several copies of the same widget and configure each one separately."
                  tooltipURL="/help/custom-dashboards"
                >
                  <InfoIcon />
                </Tooltip>
              </h4>
              <div className="space-y-sm" key={refreshKey}>
                <SortableContext
                  items={sortedWidgets.map((w) => w.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedWidgets.map((widget) => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={widget}
                      onOptions={handleWidgetOptions}
                      onRemove={handleRemoveWidget}
                    />
                  ))}
                </SortableContext>

                {/* Add Widget Button */}
                <AddWidgetButton
                  onClick={() => {
                    setWidgetBrowserType('main');
                    setIsWidgetBrowserOpen(true);
                  }}
                >
                  Add {registry.charAt(0).toUpperCase() + registry.slice(1)}
                  Widget
                </AddWidgetButton>

                {widgets.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No widgets added yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 bg-background border border-border rounded-md shadow-lg">
              {activeOverlayWidget ? (
                <SortableWidgetItem
                  widget={activeOverlayWidget}
                  onOptions={() => {}}
                  onRemove={() => {}}
                />
              ) : (
                <div className="p-xs text-muted-foreground">
                  Moving widget...
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Widget Browser Dialog */}
      <WidgetBrowserDialog
        open={isWidgetBrowserOpen}
        onOpenChange={setIsWidgetBrowserOpen}
        title={
          widgetBrowserType === 'navigation'
            ? 'Add Navigation Widget'
            : `Add ${registry.charAt(0).toUpperCase() + registry.slice(1)} Widget`
        }
        description={
          widgetBrowserType === 'navigation'
            ? 'Choose a navigation widget to add to your navbar'
            : `Choose a widget to add to your ${registry} dashboard`
        }
        availableWidgets={
          widgetBrowserType === 'navigation'
            ? availableNavigationWidgetTypes
            : availableWidgetTypes
        }
        onWidgetSelect={handleAddWidget}
        isNavigationSection={widgetBrowserType === 'navigation'}
        existingWidgets={
          widgetBrowserType === 'navigation' ? navigationWidgets : []
        }
      />
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <DetailDrawer open={isOpen} onOpenChange={handleOpenChange}>
      <DetailDrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-8 w-8"
          data-tour="widgets-manager"
          onClick={() => {
            showShortcutHint('toggleDashboardManager');
          }}
          title="Widgets"
        >
          <Grid className="h-4 w-4" />
        </Button>
      </DetailDrawerTrigger>
      <DetailDrawerContent
        className="w-full sm:max-w-md lg:max-w-lg"
        width="lg"
        data-tour="widgets-manager-content"
      >
        <DetailDrawerHeader>
          <DetailDrawerTitle>
            <span className="flex items-center gap-xs">
              {isNavigation ? 'Nav Options' : 'Widget Manager'}
              {!isNavigation && (
                <ShortcutChip id={SHORTCUT_IDS.ManagerWidgets} />
              )}
            </span>
          </DetailDrawerTitle>
        </DetailDrawerHeader>
        <DetailDrawerBody className="p-0 flex flex-col">
          {content}
        </DetailDrawerBody>
      </DetailDrawerContent>
    </DetailDrawer>
  );
};

export default WidgetsManager;
