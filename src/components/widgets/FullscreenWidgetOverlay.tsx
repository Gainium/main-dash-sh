import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  MoreVertical,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMultiDashboardBridge } from '../../hooks/useMultiDashboardBridge';
import { useWidgetKeyboardShortcuts } from '../../hooks/useWidgetKeyboardShortcuts';
import { useTradingBotStore } from '../../stores/botWidgetsStoreFactory';
import {
  useDashboardStore,
  type WidgetConfig,
} from '../../stores/dashboardStore';
import { useTradingTerminalStore } from '../../stores/tradingTerminalStore';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../ui/button';
import { WidgetMenu, type WidgetMenuActions } from './WidgetWrapper';

interface FullscreenWidgetOverlayProps {
  children: React.ReactNode;
  // Add widget menu props - all optional
  onWidgetSettings?: (() => void) | undefined;
  onWidgetDuplicate?: (() => void) | undefined;
  onWidgetDelete?: (() => void) | undefined;
  onWidgetRefresh?: (() => void) | undefined;
  hasWidgetOptions?: boolean | undefined;
  // Loading state props
  isRefreshing?: boolean;
  refreshSuccess?: boolean | null;
  // Native fullscreen control
  showNativeFullscreenButton?: boolean;
  // Options modal controls (rendered inside overlay in fullscreen)
  showOptionsDialog?: boolean | undefined;
  onCloseOptionsDialog?: (() => void) | undefined;
  renderOptionsContent?: ((close: () => void) => React.ReactNode) | undefined;
  optionsTitle?: string | undefined;
  optionsWidthClass?: string | undefined;
  // Reset to default handler
  onWidgetResetToDefault?: (() => void) | undefined;
}

export const FullscreenWidgetOverlay: React.FC<
  FullscreenWidgetOverlayProps
> = ({
  children,
  onWidgetSettings,
  onWidgetDuplicate,
  onWidgetDelete,
  onWidgetRefresh,
  hasWidgetOptions,
  isRefreshing = false,
  refreshSuccess = null,
  showNativeFullscreenButton = true,
  showOptionsDialog,
  onCloseOptionsDialog,
  renderOptionsContent,
  optionsTitle,
  optionsWidthClass,
  onWidgetResetToDefault,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fullscreenWidget = useUIStore((s) => s.fullscreenWidget);
  const exitFullscreen = useUIStore((s) => s.exitFullscreen);
  const isNativeFullscreen = useUIStore((s) => s.isNativeFullscreen);
  const setNativeFullscreen = useUIStore((s) => s.setNativeFullscreen);

  // Whether this device can hover — the auto-hide below is only safe where
  // the mouse can bring the header back.
  const canHover = useMediaQuery('(hover: hover)');

  // Header visibility state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Widget menu state
  const [isWidgetMenuOpen, setIsWidgetMenuOpen] = useState(false);
  const [widgetMenuPosition, setWidgetMenuPosition] = useState({
    top: 0,
    left: 0,
  });
  const widgetMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Create widget menu actions
  const widgetMenuActions: WidgetMenuActions = {
    ...(onWidgetSettings && { onOptions: onWidgetSettings }),
    ...(onWidgetDuplicate && { onDuplicate: onWidgetDuplicate }),
    ...(onWidgetDelete && { onDelete: onWidgetDelete }),
    ...(onWidgetRefresh && { onForceRefresh: onWidgetRefresh }),
    ...(onWidgetResetToDefault && { onResetToDefault: onWidgetResetToDefault }),
  };

  // Store hooks - call all unconditionally
  const dashboardStore = useDashboardStore();
  const tradingStore = useTradingTerminalStore();
  const botStore = useTradingBotStore();
  const multiDashboardBridge = useMultiDashboardBridge();

  // Avoid unused variable warning by referencing dashboardStore
  // (we keep it for consistency with hook calling patterns)
  void dashboardStore;

  // Native fullscreen functions
  const enterNativeFullscreen = useCallback(async () => {
    if (!overlayRef.current) {
      return;
    }

    try {
      if (overlayRef.current.requestFullscreen) {
        await overlayRef.current.requestFullscreen();
      } else if ('webkitRequestFullscreen' in overlayRef.current) {
        await (
          overlayRef.current as HTMLElement & {
            webkitRequestFullscreen: () => Promise<void>;
          }
        ).webkitRequestFullscreen();
      } else if ('msRequestFullscreen' in overlayRef.current) {
        await (
          overlayRef.current as HTMLElement & {
            msRequestFullscreen: () => Promise<void>;
          }
        ).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }, []);

  const exitNativeFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ('webkitExitFullscreen' in document) {
        await (
          document as Document & { webkitExitFullscreen: () => Promise<void> }
        ).webkitExitFullscreen();
      } else if ('msExitFullscreen' in document) {
        await (
          document as Document & { msExitFullscreen: () => Promise<void> }
        ).msExitFullscreen();
      }
    } catch (error) {
      console.warn('Failed to exit fullscreen:', error);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        (document as Document & { msFullscreenElement?: Element })
          .msFullscreenElement
      );
      setNativeFullscreen(isCurrentlyFullscreen);
    };

    handleFullscreenChange();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
      );
      document.removeEventListener(
        'msfullscreenchange',
        handleFullscreenChange
      );
    };
  }, [setNativeFullscreen]);

  // Note: Auto-enter native fullscreen removed - users can manually toggle it with the button

  // Exit function that only handles widget fullscreen (native fullscreen is independent)
  const handleExitFullscreen = useCallback(async () => {
    // Only exit widget fullscreen - native fullscreen is controlled independently
    exitFullscreen();
  }, [exitFullscreen]);

  // Expose methods for external use (can be called from user interactions)
  const methods = useMemo(
    () => ({
      enterNativeFullscreen,
      exitNativeFullscreen,
      isNativeFullscreen,
    }),
    [enterNativeFullscreen, exitNativeFullscreen, isNativeFullscreen]
  );

  // Make methods available globally for debugging
  useEffect(() => {
    (
      window as Window & { fullscreenMethods?: typeof methods }
    ).fullscreenMethods = methods;
    return () => {
      delete (window as Window & { fullscreenMethods?: typeof methods })
        .fullscreenMethods;
    };
  }, [methods]);

  // Handle scroll detection for auto-hiding header
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;

    const currentScrollY = contentRef.current.scrollTop;
    const deltaY = currentScrollY - lastScrollY;

    // Only react to significant scroll movements (> 10px)
    if (Math.abs(deltaY) < 10) return;

    const newDirection = deltaY > 0 ? 'down' : 'up';

    // Update scroll position
    setLastScrollY(currentScrollY);

    // Show header when scrolling up, hide when scrolling down
    if (newDirection === 'up') {
      setIsHeaderVisible(true);
      // Clear any existing hide timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else if (newDirection === 'down') {
      // Hide header after a short delay when scrolling down
      setIsHeaderVisible(false);
    }
  }, [lastScrollY]);

  // Show header on mouse movement near the top of the screen
  const handleMouseMove = useCallback((event: MouseEvent) => {
    // Show header if mouse is in top 100px of screen
    if (event.clientY <= 100) {
      setIsHeaderVisible(true);
      // Auto-hide after 3 seconds of no mouse movement in header area
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        setIsHeaderVisible(false);
      }, 3000);
    }
  }, []);

  // Handle widget menu toggle
  const handleWidgetMenuToggle = useCallback(() => {
    if (!isWidgetMenuOpen && widgetMenuButtonRef.current) {
      const rect = widgetMenuButtonRef.current.getBoundingClientRect();
      // WidgetMenu uses fixed positioning, so use viewport coordinates directly
      setWidgetMenuPosition({
        top: rect.bottom,
        left: rect.right,
      });
    }
    setIsWidgetMenuOpen(!isWidgetMenuOpen);
  }, [isWidgetMenuOpen, setWidgetMenuPosition]);

  // Set up scroll and mouse event listeners
  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement || !fullscreenWidget.widgetId) return;

    contentElement.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      contentElement.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [fullscreenWidget.widgetId, handleScroll, handleMouseMove]);

  // Reset header visibility and scroll position when widget changes
  useEffect(() => {
    if (fullscreenWidget.widgetId) {
      setIsHeaderVisible(true);
      setLastScrollY(0);
      // Show header initially, then auto-hide after 3 seconds if no interaction
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      // ...but only where the header can be summoned back. The sole restore
      // path is `handleMouseMove` in the top 100px, which a touch device never
      // emits, so on a hover-less device the timer used to strand the user in
      // fullscreen with no reachable Exit button whenever the widget's content
      // was too short to scroll (bug #695). Scroll-driven hide/show still
      // works on touch and is left alone.
      if (canHover) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsHeaderVisible(false);
        }, 3000);
      }
    }
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [fullscreenWidget.widgetId, canHover]);

  // Get the appropriate widgets list based on registry
  const widgets = useMemo(() => {
    if (!fullscreenWidget.registry) return [];

    switch (fullscreenWidget.registry) {
      case 'dashboard':
        return multiDashboardBridge.widgets;
      case 'trading':
        return tradingStore.widgets;
      case 'bot':
        return botStore.widgets;
      default:
        return [];
    }
  }, [
    fullscreenWidget.registry,
    multiDashboardBridge.widgets,
    tradingStore.widgets,
    botStore.widgets,
  ]);

  // DOM-based fallback for pages that don't register widgets (e.g., Portfolio/Overview)
  // We query mounted widgets that include the data-widget-id attribute and use their
  // rendered titles as a best-effort source of truth for navigation.
  const pageWidgets = useMemo(() => {
    try {
      if (typeof document === 'undefined') return [];
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('[data-widget-id]')
      );
      const seen = new Set<string>();
      return nodes
        .map((el) => {
          const id = el.getAttribute('data-widget-id') || '';
          if (!id || seen.has(id)) return null;
          seen.add(id);
          const titleEl = el.querySelector('h3');
          const titleText = titleEl?.textContent?.trim() || id;
          return { id, title: titleText } as WidgetConfig;
        })
        .filter(Boolean) as WidgetConfig[];
    } catch {
      // If anything goes wrong, return empty list
      return [];
    }
  }, []);

  // Find current widget index in the best available list
  const currentWidgetIndex = useMemo(() => {
    if (!fullscreenWidget.widgetId) return -1;

    // Prefer registry-backed widgets when available
    const index = widgets.findIndex(
      (w: WidgetConfig) => w.id === fullscreenWidget.widgetId
    );

    if (index !== -1) return index;

    // Fallback to page-scoped widgets
    return pageWidgets.findIndex(
      (w: WidgetConfig) => w.id === fullscreenWidget.widgetId
    );
  }, [widgets, pageWidgets, fullscreenWidget.widgetId]);

  // Navigate to previous/next widget
  const navigateToWidget = useCallback(
    (direction: 'prev' | 'next') => {
      // Determine which widget list actually contains the active widget
      const sourceWidgets = widgets.find(
        (w: WidgetConfig) => w.id === fullscreenWidget.widgetId
      )
        ? widgets
        : pageWidgets;

      if (sourceWidgets.length === 0) return;

      // Recompute index in source list
      const idx = sourceWidgets.findIndex(
        (w: WidgetConfig) => w.id === fullscreenWidget.widgetId
      );
      if (idx === -1) return;

      let newIndex: number;
      if (direction === 'prev') {
        newIndex = idx === 0 ? sourceWidgets.length - 1 : idx - 1;
      } else {
        newIndex = idx === sourceWidgets.length - 1 ? 0 : idx + 1;
      }

      const newWidget = sourceWidgets[newIndex] as WidgetConfig;
      if (newWidget) {
        const { setFullscreenWidget } = useUIStore.getState();
        setFullscreenWidget(
          newWidget.id,
          fullscreenWidget.registry ?? undefined,
          fullscreenWidget.storeKey
        );
      }
    },
    [
      widgets,
      pageWidgets,
      fullscreenWidget.registry,
      fullscreenWidget.storeKey,
      fullscreenWidget.widgetId,
    ]
  );

  // Set up keyboard shortcuts
  const { shortcuts } = useWidgetKeyboardShortcuts({
    widgetId: fullscreenWidget.widgetId || '',
    onSettings: onWidgetSettings,
    onDuplicate: onWidgetDuplicate,
    onDelete: onWidgetDelete,
    onRefresh: onWidgetRefresh,
    isActive: Boolean(fullscreenWidget.widgetId),
    enableGlobalShortcuts: true, // Enable single-key shortcuts in fullscreen
  });

  // Handle keyboard navigation (still manual for arrow keys and escape)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!fullscreenWidget.widgetId) return;

      // Ignore shortcuts when typing in inputs or textareas
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Handle navigation shortcuts
      switch (event.key) {
        case 'Escape':
          handleExitFullscreen();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          navigateToWidget('prev');
          break;
        case 'ArrowRight':
          event.preventDefault();
          navigateToWidget('next');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenWidget.widgetId, handleExitFullscreen, navigateToWidget]);

  // Prevent background scrolling when overlay is open
  useEffect(() => {
    if (fullscreenWidget.widgetId) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [fullscreenWidget.widgetId]);

  // Don't render if no widget is in fullscreen
  if (!fullscreenWidget.widgetId) {
    return null;
  }

  // Determine the active widget list for display/navigation
  const activeWidgets = widgets.find(
    (w: WidgetConfig) => w.id === fullscreenWidget.widgetId
  )
    ? widgets
    : pageWidgets;

  const currentWidget = activeWidgets[currentWidgetIndex] as
    | WidgetConfig
    | undefined;
  const canNavigate = activeWidgets.length > 1;

  // Determine portal target for the main overlay - always document.body
  // The overlay itself should never be rendered inside the fullscreen element
  const getOverlayPortalTarget = () => document.body;

  // Determine portal target for menu content - use fullscreen element when in native fullscreen
  const getMenuPortalTarget = () => {
    if (isNativeFullscreen) {
      // When in native fullscreen, render menu inside the fullscreen element
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

  return (
    <>
      {/* Main fullscreen overlay */}
      {createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-9999 bg-background/95 backdrop-blur-xl"
          onClick={(e) => {
            // Close fullscreen when clicking on the backdrop
            if (e.target === overlayRef.current) {
              handleExitFullscreen();
            }
          }}
          id="fullscreen-widget-overlay"
        >
          {/* Top Navigation Bar */}
          <div
            className={`absolute top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-b border-border flex items-center justify-between px-3 sm:px-6 z-10000 transition-transform duration-300 ease-in-out ${
              isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
            }`}
            onMouseEnter={() => {
              setIsHeaderVisible(true);
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
              }
              hideTimeoutRef.current = setTimeout(() => {
                setIsHeaderVisible(false);
              }, 1000);
            }}
          >
            <div className="flex items-center space-x-xs">
              <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <div className="flex flex-col">
                <h1 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-xs">
                  {currentWidget?.title || 'Widget Fullscreen'}

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
                </h1>
                {canNavigate && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Widget{' '}
                    {Math.max(
                      1,
                      activeWidgets.findIndex(
                        (w) => w.id === fullscreenWidget.widgetId
                      ) + 1
                    )}{' '}
                    of {activeWidgets.length}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Navigation Controls */}
              {canNavigate && (
                <div className="flex items-center space-x-1 mr-2 sm:mr-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToWidget('prev')}
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Previous widget (Left arrow)"
                  >
                    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToWidget('next')}
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Next widget (Right arrow)"
                  >
                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              )}

              {/* Close and Menu Buttons */}
              <div className="flex items-center space-x-1">
                {/* Widget Options Button (Cog) */}
                {hasWidgetOptions && onWidgetSettings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onWidgetSettings();
                    }}
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Widget options"
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
                      className="h-3 w-3 sm:h-4 sm:w-4"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </Button>
                )}

                {/* Widget Menu Button (3 dots) - show if there are any menu actions */}
                {Object.keys(widgetMenuActions).length > 0 && (
                  <Button
                    ref={widgetMenuButtonRef}
                    variant="outline"
                    size="sm"
                    onClick={handleWidgetMenuToggle}
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Widget menu"
                  >
                    <MoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                )}

                {/* Native Fullscreen Toggle Button */}
                {showNativeFullscreenButton && (
                  <Button
                    variant={isNativeFullscreen ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (isNativeFullscreen) {
                        exitNativeFullscreen();
                      } else {
                        enterNativeFullscreen();
                      }
                    }}
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title={
                      isNativeFullscreen
                        ? 'Exit native fullscreen'
                        : 'Enter native fullscreen'
                    }
                  >
                    <Monitor
                      className={`h-3 w-3 sm:h-4 sm:w-4 ${isNativeFullscreen ? 'text-background' : ''}`}
                    />
                  </Button>
                )}

                {/* Close Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExitFullscreen}
                  className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                  title="Exit fullscreen (Escape)"
                >
                  <X className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Widget Content */}
          <div
            ref={contentRef}
            className={`absolute inset-0 transition-all duration-300 ease-in-out ${
              isHeaderVisible ? 'top-16' : 'top-0'
            } overflow-y-auto overflow-x-hidden custom-scrollbar`}
          >
            <div className="h-full w-full">
              <div className="h-full w-full bg-card overflow-hidden">
                {children}
              </div>
            </div>
          </div>

          {/* Options Modal rendered INSIDE overlay to ensure visibility in fullscreen/native fullscreen */}
          {showOptionsDialog && typeof renderOptionsContent === 'function' && (
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/50 pointer-events-auto z-10001"
              onClick={() => onCloseOptionsDialog?.()}
              role="dialog"
              aria-modal="true"
            >
              <div
                className={`bg-popover rounded-lg p-md max-h-[85vh] overflow-y-auto shadow-2xl ${optionsWidthClass || 'w-80 sm:w-[420px]'}`}
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
                {renderOptionsContent(() => onCloseOptionsDialog?.())}
              </div>
            </div>
          )}
        </div>,
        getOverlayPortalTarget()
      )}

      {/* Widget Menu - Use unified portal target instead of custom container */}
      {Object.keys(widgetMenuActions).length > 0 && isWidgetMenuOpen && (
        <WidgetMenu
          isOpen={isWidgetMenuOpen}
          onClose={() => setIsWidgetMenuOpen(false)}
          position={widgetMenuPosition}
          actions={widgetMenuActions}
          hasOptions={Boolean(hasWidgetOptions)}
          isEditable={true}
          onExitFullscreen={handleExitFullscreen}
          {...(onWidgetRefresh && {
            onGenericForceRefresh: async () => onWidgetRefresh(),
          })}
          isRefreshing={isRefreshing}
          refreshSuccess={refreshSuccess}
          isInFullscreen={true}
          isInNativeFullscreen={isNativeFullscreen}
          shortcuts={shortcuts}
          portalTarget={getMenuPortalTarget()}
          // Use the same simple z-50 that works in Profit widget
          zIndexClass="z-[10001]"
        />
      )}
    </>
  );
};

export default FullscreenWidgetOverlay;
