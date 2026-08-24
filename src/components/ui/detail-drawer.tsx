import { AnimatePresence, motion, type MotionStyle } from 'framer-motion';
import { X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import logger from '../../lib/loggerInstance';
import { cn } from '../../lib/utils';
import {
  type BotType,
  useDrawerPanelWidthsStore,
} from '../../stores/drawerPanelWidthsStore';

const RESIZER_WIDTH = 4; // Tailwind w-1 equals 4px
const MOBILE_BREAKPOINT = 768; // Tailwind md breakpoint

interface DetailDrawerContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DetailDrawerContext =
  React.createContext<DetailDrawerContextValue | null>(null);

const useDetailDrawer = () => {
  const context = React.useContext(DetailDrawerContext);
  if (!context) {
    throw new Error('DetailDrawer components must be used within DetailDrawer');
  }
  return context;
};

interface DetailDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open = false,
  onOpenChange,
  children,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = open !== undefined && onOpenChange !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? onOpenChange : setInternalOpen;

  const contextValue = React.useMemo(
    () => ({
      open: isOpen,
      onOpenChange: setOpen,
    }),
    [isOpen, setOpen]
  );

  return (
    <DetailDrawerContext.Provider value={contextValue}>
      {children}
    </DetailDrawerContext.Provider>
  );
};

interface DetailDrawerTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerTrigger: React.FC<DetailDrawerTriggerProps> = ({
  asChild = false,
  children,
  className,
}) => {
  const { onOpenChange } = useDetailDrawer();

  const handleClick = () => {
    onOpenChange(true);
  };

  if (asChild) {
    const child = children as React.ReactElement<
      React.HTMLAttributes<HTMLElement>
    >;
    return React.cloneElement(child, {
      onClick: handleClick,
      className: cn(className, child.props?.className),
    });
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
};

interface DetailDrawerContentProps {
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Optional left-attached panel rendered alongside the drawer (outside the drawer). */
  leftPanel?: React.ReactNode;
  /** Optional className for the left panel container (width, padding). */
  leftPanelClassName?: string;
  /** Enable resizing between left panel and main drawer. Default: true */
  resizable?: boolean;
  /** Initial width of left panel in pixels when resizable. Default: 640 */
  initialLeftPanelWidth?: number;
  /** Minimum width of left panel in pixels when resizable. Default: 300 */
  minLeftPanelWidth?: number;
  /** Maximum width of left panel in pixels when resizable. Default: 1200 */
  maxLeftPanelWidth?: number;
  /** Minimum width of right panel in pixels when resizable. Default: 320 */
  minRightPanelWidth?: number;
  /** Optional storage key to persist panel widths. If provided, widths will be saved/restored from localStorage. @deprecated Use botType instead */
  persistenceKey?: string;
  /** Bot type for persisting panel widths per bot type */
  botType?: BotType;
  /**
   * Stretch the drawer to fill the full viewport width. The right panel
   * uses `flex: 1` instead of a fixed pixel width, and the modal stops
   * justifying to the right edge. Used for the share-link read-only view
   * where there's no underlying page chrome to leave room for.
   */
  fullWidth?: boolean;
}

const DetailDrawerContent: React.FC<DetailDrawerContentProps> = ({
  children,
  className,
  showCloseButton = true,
  onClose,
  width: _width = 'lg',
  leftPanel,
  leftPanelClassName,
  resizable = true,
  initialLeftPanelWidth = 640,
  minLeftPanelWidth = 300,
  maxLeftPanelWidth = 1200,
  minRightPanelWidth = 320,
  persistenceKey,
  botType,
  fullWidth = false,
}) => {
  const { open, onOpenChange } = useDetailDrawer();
  const [mounted, setMounted] = React.useState(false);

  // Get Zustand store - use selector to get specific bot type widths
  const storedWidthsForBotType = useDrawerPanelWidthsStore((state) =>
    botType ? state.widths[botType] : undefined
  );
  const setPanelWidths = useDrawerPanelWidthsStore(
    (state) => state.setPanelWidths
  );
  const globalTotalWidth = useDrawerPanelWidthsStore(
    (state) => state.totalWidth
  );
  const setGlobalTotalWidth = useDrawerPanelWidthsStore(
    (state) => state.setTotalWidth
  );
  const hasHydrated = useDrawerPanelWidthsStore((state) => state._hasHydrated);

  // Load persisted widths from Zustand store (preferred) or localStorage (fallback)
  const getInitialWidths = React.useCallback(() => {
    // Try Zustand store first if botType is provided
    if (botType && storedWidthsForBotType) {
      return storedWidthsForBotType;
    }

    // Fallback to localStorage if persistenceKey is provided
    if (persistenceKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`${persistenceKey}:widths`);
        if (stored) {
          const parsed = JSON.parse(stored);
          const baseLeft =
            typeof parsed.left === 'number'
              ? parsed.left
              : initialLeftPanelWidth;
          const baseRight =
            typeof parsed.right === 'number' ? parsed.right : 640;
          return { left: baseLeft, right: baseRight };
        }
      } catch {
        // Ignore parse errors
      }
    }

    return { left: initialLeftPanelWidth, right: 640 };
  }, [botType, storedWidthsForBotType, persistenceKey, initialLeftPanelWidth]);

  const baseInitialWidths = React.useMemo(
    () => getInitialWidths(),
    [getInitialWidths]
  );

  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const containerRef = React.useRef<HTMLDivElement>(null);
  const totalWidthRef = React.useRef<number | null>(null);
  const hasInitializedRef = React.useRef(false);
  const panelWidthSet = React.useRef(false);
  const justFinishedResizingRef = React.useRef(false);

  const viewport =
    viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const shouldShowLeftPanel =
    Boolean(leftPanel) && viewport >= MOBILE_BREAKPOINT;
  const isResizableLayout = resizable && viewport >= MOBILE_BREAKPOINT;

  const normalizedInitialWidths = React.useMemo(() => {
    const hasLeftPanel = shouldShowLeftPanel;
    const separatorWidth = hasLeftPanel ? RESIZER_WIDTH : 0;
    const minimumContentWidth = Math.max(
      (hasLeftPanel ? minLeftPanelWidth : 0) + minRightPanelWidth,
      0
    );

    const left = hasLeftPanel ? baseInitialWidths.left : 0;
    const right = baseInitialWidths.right;

    if (!hasLeftPanel) {
      const rightBase = Math.max(minRightPanelWidth, right);
      const clampedRight = viewport ? Math.min(viewport, rightBase) : rightBase;
      return { left: 0, right: clampedRight };
    }

    const baseTotalWidth = left + right + separatorWidth;
    const hasStoredWidth = Boolean(globalTotalWidth && globalTotalWidth > 0);
    let targetTotalWidth = hasStoredWidth
      ? (globalTotalWidth as number)
      : baseTotalWidth;

    if (viewport) {
      targetTotalWidth = Math.min(viewport, targetTotalWidth);
    }

    const targetContentWidth = Math.max(
      targetTotalWidth - separatorWidth,
      minimumContentWidth
    );
    const currentContentWidth = Math.max(left + right, minimumContentWidth);
    const ratio = currentContentWidth > 0 ? left / currentContentWidth : 0.5;

    const maxAllowableLeft = Math.max(
      0,
      Math.min(maxLeftPanelWidth, targetContentWidth - minRightPanelWidth)
    );
    const minAllowableLeft = Math.max(
      0,
      Math.min(minLeftPanelWidth, maxAllowableLeft)
    );

    let adjustedLeft = targetContentWidth * ratio;
    if (!Number.isFinite(adjustedLeft)) {
      adjustedLeft = targetContentWidth / 2;
    }

    adjustedLeft = Math.min(
      Math.max(adjustedLeft, minAllowableLeft),
      maxAllowableLeft
    );

    let adjustedRight = targetContentWidth - adjustedLeft;
    if (adjustedRight < minRightPanelWidth) {
      adjustedRight = minRightPanelWidth;
      adjustedLeft = Math.max(
        minAllowableLeft,
        targetContentWidth - adjustedRight
      );
    }

    return { left: adjustedLeft, right: targetContentWidth - adjustedLeft };
  }, [
    baseInitialWidths,
    globalTotalWidth,
    maxLeftPanelWidth,
    minLeftPanelWidth,
    minRightPanelWidth,
    viewport,
    shouldShowLeftPanel,
  ]);

  const [leftPanelWidth, setLeftPanelWidth] = React.useState(
    () => normalizedInitialWidths.left
  );
  const [rightPanelWidth, setRightPanelWidth] = React.useState(
    () => normalizedInitialWidths.right
  );
  const [resizeMode, setResizeMode] = React.useState<
    null | 'left-edge' | 'split'
  >(null);
  const isResizing = resizeMode !== null;
  const resizeSnapshotRef = React.useRef({
    left: 0,
    right: 0,
    total: 0,
  });

  // Refresh initial state if persistence rehydrates before the drawer mounts
  React.useEffect(() => {
    if (hasInitializedRef.current || panelWidthSet.current) return;
    panelWidthSet.current = true;
    setLeftPanelWidth((prev) =>
      Math.abs(prev - normalizedInitialWidths.left) > 0.5
        ? normalizedInitialWidths.left
        : prev
    );
    setRightPanelWidth((prev) =>
      Math.abs(prev - normalizedInitialWidths.right) > 0.5
        ? normalizedInitialWidths.right
        : prev
    );
  }, [normalizedInitialWidths.left, normalizedInitialWidths.right]);

  // Ensure we're on the client side
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const syncViewport = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);

    return () => {
      window.removeEventListener('resize', syncViewport);
    };
  }, [mounted]);

  React.useEffect(() => {
    if (!open) {
      hasInitializedRef.current = false;
      panelWidthSet.current = false;
    }
  }, [open]);

  // Sync panel widths from store when drawer opens and we have stored widths
  const hasLoadedStoredWidths = React.useRef(false);
  React.useEffect(() => {
    // Wait for hydration before loading stored widths
    if (!hasHydrated) return;

    if (
      open &&
      botType &&
      storedWidthsForBotType &&
      !hasLoadedStoredWidths.current
    ) {
      logger.info('[DetailDrawer] Loading stored widths for', {
        botType,
        storedWidthsForBotType,
      });
      setLeftPanelWidth(storedWidthsForBotType.left);
      setRightPanelWidth(storedWidthsForBotType.right);
      hasLoadedStoredWidths.current = true;
    }

    // Reset the flag when drawer closes
    if (!open) {
      hasLoadedStoredWidths.current = false;
    }
  }, [open, botType, storedWidthsForBotType, hasHydrated]);

  // Measure initial total width and synchronize panel widths on resize
  React.useEffect(() => {
    if (!mounted || !open || !isResizableLayout) return;

    const container = containerRef.current;
    if (!container) return;

    const updateWidths = (resetToInitial = false) => {
      // Skip recalculation if we just loaded stored widths
      if (hasLoadedStoredWidths.current && !resetToInitial) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      if (!totalWidth) return;

      setViewportWidth(window.innerWidth);
      totalWidthRef.current = totalWidth;

      const separatorWidth = shouldShowLeftPanel ? RESIZER_WIDTH : 0;

      if (!shouldShowLeftPanel) {
        const clampedRight = Math.min(
          totalWidth,
          Math.max(minRightPanelWidth, rightPanelWidth)
        );
        if (Math.abs(clampedRight - rightPanelWidth) > 0.5) {
          setRightPanelWidth(clampedRight);
        }
        if (leftPanelWidth !== 0) {
          setLeftPanelWidth(0);
        }
        return;
      }

      // If we're not resetting to initial and already initialized, only update if necessary
      if (!resetToInitial && hasInitializedRef.current) {
        // Just validate that current widths fit in the container
        // Don't recalculate, just ensure they're valid
        return;
      }

      const maxAllowableLeft = Math.max(
        0,
        Math.min(
          maxLeftPanelWidth,
          totalWidth - separatorWidth - minRightPanelWidth
        )
      );
      const minAllowableLeft = Math.max(
        0,
        Math.min(minLeftPanelWidth, maxAllowableLeft)
      );
      const baseLeft = resetToInitial ? initialLeftPanelWidth : leftPanelWidth;
      const clampedLeft = Math.min(
        Math.max(baseLeft, minAllowableLeft),
        maxAllowableLeft
      );

      const derivedRight = totalWidth - separatorWidth - clampedLeft;
      const maxAllowableRight = Math.max(0, totalWidth - separatorWidth);
      const clampedRight = Math.min(
        maxAllowableRight,
        Math.max(minRightPanelWidth, derivedRight)
      );
      const adjustedLeft = Math.max(
        0,
        totalWidth - separatorWidth - clampedRight
      );

      if (Math.abs(adjustedLeft - leftPanelWidth) > 0.5) {
        setLeftPanelWidth(adjustedLeft);
      }

      if (Math.abs(clampedRight - rightPanelWidth) > 0.5) {
        setRightPanelWidth(clampedRight);
      }
    };

    const frameId = requestAnimationFrame(() => {
      // Don't reset widths if we've just loaded stored widths
      const shouldResetToInitial =
        !hasInitializedRef.current && !hasLoadedStoredWidths.current;
      updateWidths(shouldResetToInitial);
      hasInitializedRef.current = true;
    });

    const handleWindowResize = () => {
      setViewportWidth(window.innerWidth);
      updateWidths();
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    mounted,
    open,
    isResizableLayout,
    leftPanelWidth,
    rightPanelWidth,
    initialLeftPanelWidth,
    minLeftPanelWidth,
    maxLeftPanelWidth,
    minRightPanelWidth,
    shouldShowLeftPanel,
  ]);

  React.useEffect(() => {
    if (!shouldShowLeftPanel || !viewport) return;
    if (leftPanelWidth >= minLeftPanelWidth) return;

    const separatorWidth = RESIZER_WIDTH;
    const nextLeft = minLeftPanelWidth;
    const maxRight = Math.max(0, viewport - separatorWidth - nextLeft);
    const nextRight = Math.min(
      Math.max(minRightPanelWidth, rightPanelWidth),
      maxRight
    );

    setLeftPanelWidth(nextLeft);
    if (Math.abs(nextRight - rightPanelWidth) > 0.5) {
      setRightPanelWidth(nextRight);
    }
  }, [
    shouldShowLeftPanel,
    viewport,
    leftPanelWidth,
    rightPanelWidth,
    minLeftPanelWidth,
    minRightPanelWidth,
  ]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Prevent closing if we just finished resizing
    if (justFinishedResizingRef.current) {
      return;
    }

    if (e.target === e.currentTarget) {
      if (onClose) {
        onClose();
      } else {
        onOpenChange(false);
      }
    }
  };

  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      onOpenChange(false);
    }
  }, [onClose, onOpenChange]);

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  // Handle resize dragging
  React.useEffect(() => {
    if (!isResizableLayout) return;

    const getAvailableWidth = (minTotalWidth: number) => {
      if (!viewport) return minTotalWidth;
      return Math.max(minTotalWidth, viewport);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const separatorWidth = RESIZER_WIDTH;
      const baseLeft = resizeSnapshotRef.current.left;
      const baseRight = resizeSnapshotRef.current.right;

      if (!viewport) return;

      if (resizeMode === 'split') {
        // Split resize: expand right panel, and shrink left if needed
        const mouseOffsetInContainer = e.clientX - containerRect.left;
        const desiredRightWidth = containerRect.width - mouseOffsetInContainer;

        // Clamp right to minimum and container width
        const nextRight = Math.max(
          minRightPanelWidth,
          Math.min(desiredRightWidth, containerRect.width - separatorWidth)
        );

        // Calculate remaining space for left panel
        const availableForLeft =
          containerRect.width - nextRight - separatorWidth;
        const nextLeft = Math.max(
          minLeftPanelWidth,
          Math.min(baseLeft, availableForLeft)
        );

        setLeftPanelWidth(nextLeft);
        setRightPanelWidth(nextRight);
        return;
      }

      if (resizeMode === 'left-edge' && !shouldShowLeftPanel) {
        const minTotalWidth = Math.max(0, minRightPanelWidth);
        const availableWidth = getAvailableWidth(minTotalWidth);
        const nextRight = Math.min(
          availableWidth,
          Math.max(minRightPanelWidth, viewport - e.clientX)
        );

        setLeftPanelWidth(0);
        setRightPanelWidth(nextRight);
        return;
      }

      if (resizeMode === 'left-edge') {
        // Left-edge resize adjusts the entire container width from the left
        const minTotalWidth =
          Math.max(0, minLeftPanelWidth) +
          Math.max(0, baseRight) +
          separatorWidth;
        const maxTotalWidth =
          Math.max(0, maxLeftPanelWidth) +
          Math.max(0, baseRight) +
          separatorWidth;
        const availableWidth = getAvailableWidth(minTotalWidth);
        const clampedMaxWidth = Math.min(availableWidth, maxTotalWidth);

        // Calculate new total width based on mouse position from viewport edge
        const nextTotalWidth = Math.min(
          clampedMaxWidth,
          Math.max(minTotalWidth, viewport - e.clientX)
        );

        // Adjust left panel while keeping right panel fixed
        const nextLeft = Math.min(
          maxLeftPanelWidth,
          Math.max(
            minLeftPanelWidth,
            nextTotalWidth - baseRight - separatorWidth
          )
        );

        setLeftPanelWidth(nextLeft);
        setRightPanelWidth(baseRight);
      }
    };

    const handleMouseUp = () => {
      setResizeMode(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Set flag to prevent backdrop click immediately after resize
      justFinishedResizingRef.current = true;
      setTimeout(() => {
        justFinishedResizingRef.current = false;
      }, 100);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isResizing,
    resizeMode,
    isResizableLayout,
    minLeftPanelWidth,
    maxLeftPanelWidth,
    minRightPanelWidth,
    viewport,
    shouldShowLeftPanel,
  ]);

  const handleResizeStart =
    (mode: 'left-edge' | 'split') => (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isResizableLayout) return;
      const separatorWidth = shouldShowLeftPanel ? RESIZER_WIDTH : 0;
      const effectiveLeftWidth = shouldShowLeftPanel ? leftPanelWidth : 0;
      const currentTotalWidth =
        effectiveLeftWidth + rightPanelWidth + separatorWidth;
      const measuredWidth = containerRef.current
        ? containerRef.current.getBoundingClientRect().width
        : null;
      totalWidthRef.current =
        measuredWidth && measuredWidth > 0 ? measuredWidth : currentTotalWidth;
      resizeSnapshotRef.current = {
        left: effectiveLeftWidth,
        right: rightPanelWidth,
        total: totalWidthRef.current ?? currentTotalWidth,
      };
      setResizeMode(mode);
    };

  // Track the latest total width for resize calculations
  React.useEffect(() => {
    if (!isResizableLayout) return;
    const separatorWidth = shouldShowLeftPanel ? RESIZER_WIDTH : 0;
    const effectiveLeftWidth = shouldShowLeftPanel ? leftPanelWidth : 0;
    totalWidthRef.current =
      effectiveLeftWidth + rightPanelWidth + separatorWidth;
  }, [isResizableLayout, leftPanelWidth, rightPanelWidth, shouldShowLeftPanel]);

  // Persist panel widths to Zustand store (preferred) or localStorage (fallback) when they change
  React.useEffect(() => {
    if (!mounted) return;
    // Don't persist until hydration is complete to avoid overwriting stored values with defaults
    if (!hasHydrated) return;

    // Prefer Zustand store if botType is provided
    if (botType) {
      logger.info('[DetailDrawer] Saving widths for', {
        botType,
        left: leftPanelWidth,
        right: rightPanelWidth,
      });
      setPanelWidths(botType, { left: leftPanelWidth, right: rightPanelWidth });
      return;
    }

    // Fallback to localStorage if persistenceKey is provided
    if (persistenceKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          `${persistenceKey}:widths`,
          JSON.stringify({ left: leftPanelWidth, right: rightPanelWidth })
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, [
    leftPanelWidth,
    rightPanelWidth,
    botType,
    persistenceKey,
    mounted,
    setPanelWidths,
    hasHydrated,
  ]);

  // Persist the shared total width so all drawers reuse the latest size.
  // Read globalTotalWidth via getState() instead of subscribing — otherwise
  // two open drawers ping-pong each other's writes into an infinite loop.
  React.useEffect(() => {
    if (!mounted || !open || !isResizableLayout) {
      return;
    }

    const separatorWidth = shouldShowLeftPanel ? RESIZER_WIDTH : 0;
    const effectiveLeftWidth = shouldShowLeftPanel ? leftPanelWidth : 0;
    const total = effectiveLeftWidth + rightPanelWidth + separatorWidth;
    const currentGlobal = useDrawerPanelWidthsStore.getState().totalWidth;
    if (!currentGlobal || Math.abs(currentGlobal - total) > 1) {
      setGlobalTotalWidth(total);
    }
  }, [
    mounted,
    open,
    isResizableLayout,
    leftPanelWidth,
    rightPanelWidth,
    setGlobalTotalWidth,
    shouldShowLeftPanel,
  ]);

  if (!mounted) return null;

  const useFixedWidth = !isResizableLayout;

  const containerStyle: MotionStyle = (() => {
    if (!viewport) {
      return {
        width: '100vw',
        maxWidth: '100vw',
      };
    }

    if (useFixedWidth) {
      return {
        width: `${viewport}px`,
        maxWidth: '100vw',
      };
    }

    return {
      width: '100vw',
      maxWidth: '100vw',
    };
  })();

  const drawerContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            // z-[55] puts the drawer in the modal band: ABOVE the app's own
            // chrome layer (z-50 — mobile bottom nav, sticky page headers, and
            // the `mobileFullscreen` BotPanelLayout overlay that the Trading
            // Terminal and the bot edit pages render at `fixed inset-0 z-50
            // bg-background`), and BELOW dialogs (z-60) and dropdown menus
            // (z-[70]) so anything opened FROM the drawer still stacks on top.
            // At z-40 the drawer mounted with content but was painted under
            // that opaque overlay, so "Edit" on a terminal deal looked like a
            // no-op on phones.
            'fixed inset-0 z-[55] backdrop-blur-sm',
            fullWidth ? 'bg-transparent backdrop-blur-none' : 'bg-black/50'
          )}
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
              duration: 0.3,
            }}
            className={cn(
              'fixed right-0 h-full flex pointer-events-none',
              fullWidth
                ? 'top-14 h-[calc(100%-3.5rem)] justify-stretch'
                : 'top-0 justify-end'
            )}
            role="dialog"
            aria-modal="true"
            aria-hidden={!open}
            ref={containerRef}
            style={containerStyle}
          >
            {shouldShowLeftPanel ? (
              <>
                <div className="relative">
                  {isResizableLayout && (
                    <div
                      className={cn(
                        'absolute left-0 top-0 h-full w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors pointer-events-auto z-10',
                        isResizing && 'bg-primary'
                      )}
                      onMouseDown={handleResizeStart('left-edge')}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize chart panel"
                    >
                      <div className="absolute inset-y-0 -left-1 -right-1" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'bg-background h-full border-l border-border shadow-2xl overflow-hidden pointer-events-auto',
                      !resizable && 'w-[640px] max-w-[70vw]',
                      isResizableLayout && isResizing && 'pointer-events-none',
                      leftPanelClassName
                    )}
                    style={
                      isResizableLayout
                        ? { width: `${leftPanelWidth}px` }
                        : undefined
                    }
                    data-drawer-left-panel="true"
                  >
                    {leftPanel}
                  </div>
                </div>
                {isResizableLayout && (
                  <div
                    className={cn(
                      'w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors relative group pointer-events-auto',
                      isResizing && 'bg-primary'
                    )}
                    onMouseDown={handleResizeStart('split')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize drawer"
                  >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                  </div>
                )}
              </>
            ) : null}
            <div
              className={cn(
                'bg-background h-full border-l border-border shadow-2xl',
                'overflow-hidden flex flex-col pointer-events-auto relative',
                'w-full max-w-none',
                fullWidth && 'flex-1 min-w-0',
                isResizableLayout && isResizing && 'pointer-events-none',
                className
              )}
              style={
                fullWidth
                  ? undefined
                  : isResizableLayout || !useFixedWidth
                    ? { width: `${rightPanelWidth}px` }
                    : undefined
              }
              data-drawer-panel="true"
            >
              {!shouldShowLeftPanel && isResizableLayout && (
                <div
                  className={cn(
                    'absolute left-0 top-0 h-full w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors pointer-events-auto z-10',
                    isResizing && 'bg-primary'
                  )}
                  onMouseDown={handleResizeStart('left-edge')}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize drawer"
                >
                  <div className="absolute inset-y-0 -left-1 -right-1" />
                </div>
              )}
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="absolute top-3 md:top-4 right-3 md:right-4 z-10 p-2 rounded-sm hover:bg-muted/50 transition-colors"
                >
                  <X className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
                </button>
              )}
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Use portal to render at document.body level
  return createPortal(drawerContent, document.body);
};

interface DetailDrawerHeaderProps {
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerHeader: React.FC<DetailDrawerHeaderProps> = ({
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'shrink-0 p-3 md:p-4 pb-2 md:pb-3 border-b border-border dark:border-border',
        className
      )}
    >
      {children}
    </div>
  );
};

interface DetailDrawerTitleProps {
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerTitle: React.FC<DetailDrawerTitleProps> = ({
  children,
  className,
}) => {
  return (
    <h2
      className={cn(
        'text-xl font-semibold text-foreground dark:text-card-foreground',
        className
      )}
    >
      {children}
    </h2>
  );
};

interface DetailDrawerDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerDescription: React.FC<DetailDrawerDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <p
      className={cn(
        'text-sm text-muted-foreground dark:text-muted-foreground mt-2 pr-8',
        className
      )}
    >
      {children}
    </p>
  );
};

interface DetailDrawerBodyProps {
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerBody: React.FC<DetailDrawerBodyProps> = ({
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex-1 overflow-auto p-3 md:p-4 custom-scrollbar',
        className
      )}
    >
      {children}
      {/* Spacer so the last item is reachable above the floating bottom nav on mobile. */}
      <div
        aria-hidden="true"
        className="md:hidden h-[calc(4.5rem+env(safe-area-inset-bottom,0px))] shrink-0"
      />
    </div>
  );
};

interface DetailDrawerFooterProps {
  children: React.ReactNode;
  className?: string;
}

const DetailDrawerFooter: React.FC<DetailDrawerFooterProps> = ({
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'shrink-0 flex justify-end gap-sm p-3 md:p-4 pt-2 md:pt-3 border-t border-border dark:border-border',
        className
      )}
    >
      {children}
    </div>
  );
};

export {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerDescription,
  DetailDrawerFooter,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
};
