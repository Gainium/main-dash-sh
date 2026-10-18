import { logger } from '@/lib/loggerInstance';
import { cn } from '@/lib/utils';
import { useSplitPanelShortcutStore } from '@/stores/splitPanelShortcutStore';
import React, { useEffect } from 'react';
import {
  PanelResizeHandle,
  Panel as ResizablePanel,
  PanelGroup as ResizablePanelGroup,
  type ImperativePanelGroupHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';

interface SplitPanelCollapsibleConfig {
  index: number;
  initialCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapseButtonLabel?: string;
}

interface SplitPanelProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode[];
  /** Percentage sizes summing roughly to 100 */
  defaultSizes?: number[];
  minSizes?: number[];
  className?: string;
  /** Advanced configuration for collapsible panels (deprecated single panel props still supported). */
  collapsiblePanels?: SplitPanelCollapsibleConfig[];
  /** Index of panel that is collapsible (0-based). If undefined none collapsible */
  collapsibleIndex?: number;
  /** When true, treat the collapsible panel as starting collapsed */
  initialCollapsed?: boolean;
  /** Optional controlled collapsed state */
  collapsed?: boolean;
  /** Callback when collapsed toggled */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** When true renders a default collapse/expand button overlay on the resize handle */
  showCollapseButton?: boolean;
  /** Optional aria label for collapse button */
  collapseButtonLabel?: string;
  /** Unique ID for persisting panel sizes to localStorage */
  autoSaveId?: string | null;
  /** Enable keyboard shortcuts (arrow keys) to control this panel. Default: true */
  enableKeyboardShortcuts?: boolean;
  /** Priority for keyboard shortcuts. Higher numbers = handled first. Default: 50 */
  shortcutPriority?: number;
  /** Optional inline style applied directly to the PanelGroup element. Useful for setting an explicit height when direction="vertical" in scrollable layouts. */
  panelGroupStyle?: React.CSSProperties;
  /**
   * When true, render a wider transparent resize handle that only shows a
   * highlight on hover. The handle width matches the `gap-md` spacing token so
   * the gutter between panels visually matches the spacing under the page
   * header.
   */
  gappedHandle?: boolean;
}

type StoredPanelGroupState = {
  layout?: number[];
  expandToSizes?: Record<string, number>;
};

const STORAGE_PREFIX = 'react-resizable-panels:';

const layoutsEqual = (first: number[], second: number[]) => {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((value, index) => {
    const other = second[index];
    if (typeof other !== 'number') {
      return false;
    }
    return Math.abs(value - other) < 0.25;
  });
};

// The key react-resizable-panels stores a layout under when every panel has an
// `id` prop: the ids, sorted, joined by ",". Mirrors the library's getPanelKey.
const buildPanelKey = (panelIds: string[]) =>
  [...panelIds].sort((a, b) => a.localeCompare(b)).join(',');

export function SplitPanel({
  direction,
  children,
  defaultSizes,
  minSizes,
  className,
  collapsiblePanels,
  collapsibleIndex,
  initialCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  showCollapseButton,
  collapseButtonLabel,
  autoSaveId,
  enableKeyboardShortcuts = true,
  shortcutPriority = 50,
  panelGroupStyle,
  gappedHandle = false,
}: SplitPanelProps) {
  const childrenArray = React.Children.toArray(children);
  const groupId = React.useId();

  const childrenCount = childrenArray.length;
  const panelGroupRef = React.useRef<ImperativePanelGroupHandle | null>(null);
  const appliedLayoutKeyRef = React.useRef<string | null>(null);

  // Get the shortcut store for registration
  const { registerHandler, unregisterHandler } = useSplitPanelShortcutStore();

  // Store default sizes in a ref for stable access
  const defaultSizesRef = React.useRef<number[]>(
    defaultSizes || Array(childrenCount).fill(100 / childrenCount)
  );
  React.useEffect(() => {
    defaultSizesRef.current =
      defaultSizes || Array(childrenCount).fill(100 / childrenCount);
  }, [defaultSizes, childrenCount]);

  // Register this panel with the shortcut store
  useEffect(() => {
    if (!enableKeyboardShortcuts || childrenCount < 2) {
      return;
    }

    const handlerId = `split-panel-${groupId}`;

    registerHandler({
      id: handlerId,
      direction,
      getSizes: () => {
        const ref = panelGroupRef.current;
        if (!ref) return defaultSizesRef.current;
        try {
          return ref.getLayout() || defaultSizesRef.current;
        } catch {
          return defaultSizesRef.current;
        }
      },
      getDefaultSizes: () => defaultSizesRef.current,
      setSizes: (sizes: number[]) => {
        const ref = panelGroupRef.current;
        if (!ref) return;
        try {
          ref.setLayout(sizes);
        } catch (error) {
          logger.debug('[SplitPanel] Failed to set layout', { error, sizes });
        }
      },
      getCollapsiblePanels: () => {
        // Return indices of all collapsible panels
        const indices: number[] = [];
        if (collapsiblePanels) {
          collapsiblePanels.forEach((p) => indices.push(p.index));
        } else if (collapsibleIndex != null) {
          indices.push(collapsibleIndex);
        }
        return indices;
      },
      priority: shortcutPriority,
    });

    logger.debug('[SplitPanel] Registered shortcut handler', {
      handlerId,
      direction,
      defaultSizes: defaultSizesRef.current,
    });

    return () => {
      unregisterHandler(handlerId);
      logger.debug('[SplitPanel] Unregistered shortcut handler', { handlerId });
    };
  }, [
    enableKeyboardShortcuts,
    childrenCount,
    groupId,
    direction,
    shortcutPriority,
    collapsiblePanels,
    collapsibleIndex,
    registerHandler,
    unregisterHandler,
  ]);

  useEffect(() => {
    try {
      if (autoSaveId && typeof window !== 'undefined') {
        const exists = !!window.localStorage.getItem(
          `resizable-panels:${autoSaveId}`
        );
        logger.debug('[SplitPanel] Mount', {
          autoSaveId,
          groupId,
          savedKeyExists: exists,
        });
      }
    } catch (error) {
      logger.debug('[SplitPanel] Mount error checking saved sizes', {
        autoSaveId,
        error,
      });
    }
  }, [autoSaveId, groupId]);

  const normalizedCollapsiblePanels = React.useMemo(() => {
    if (collapsiblePanels && collapsiblePanels.length > 0) {
      return collapsiblePanels;
    }

    if (collapsibleIndex != null) {
      return [
        {
          index: collapsibleIndex,
          initialCollapsed,
          collapsed: controlledCollapsed,
          onCollapsedChange,
          collapseButtonLabel,
        },
      ];
    }

    return [];
  }, [
    collapsiblePanels,
    collapsibleIndex,
    initialCollapsed,
    controlledCollapsed,
    onCollapsedChange,
    collapseButtonLabel,
  ]);

  type NormalizedConfig = {
    index: number;
    initialCollapsed: boolean;
    collapsedProp?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    collapseButtonLabel?: string;
    isControlled: boolean;
  };

  const collapsibleConfigs = React.useMemo<NormalizedConfig[]>(() => {
    return normalizedCollapsiblePanels
      .filter((panel) => panel.index >= 0 && panel.index < childrenArray.length)
      .map((panel) => {
        const initialCollapsedValue =
          panel.initialCollapsed !== undefined
            ? Boolean(panel.initialCollapsed)
            : false;
        const collapsedValue =
          panel.collapsed !== undefined ? Boolean(panel.collapsed) : undefined;
        const labelValue =
          panel.collapseButtonLabel ?? collapseButtonLabel ?? undefined;

        const config: NormalizedConfig = {
          index: panel.index,
          initialCollapsed: initialCollapsedValue,
          isControlled: panel.collapsed !== undefined,
        };

        if (collapsedValue !== undefined) {
          config.collapsedProp = collapsedValue;
        }

        if (panel.onCollapsedChange) {
          config.onCollapsedChange = panel.onCollapsedChange;
        }

        if (labelValue !== undefined) {
          config.collapseButtonLabel = labelValue;
        }

        return config;
      });
  }, [normalizedCollapsiblePanels, childrenArray.length, collapseButtonLabel]);

  const configByIndex = React.useMemo(() => {
    const map = new Map<number, NormalizedConfig>();
    collapsibleConfigs.forEach((config) => {
      map.set(config.index, config);
    });
    return map;
  }, [collapsibleConfigs]);

  // With an autoSaveId the panel ids come from it, not from useId: the library
  // keys the saved layout by the ids, and useId changes with where the group
  // sits in the tree (a direct load vs in-app navigation), which stranded every
  // layout saved on the other path.
  const panelIdBase = autoSaveId || groupId;
  const savedPanelKey = React.useMemo(() => {
    if (!autoSaveId) {
      return null;
    }
    return buildPanelKey(
      Array.from(
        { length: childrenCount },
        (_, index) => `${panelIdBase}-panel-${index}`
      )
    );
  }, [autoSaveId, childrenCount, panelIdBase]);

  const [uncontrolledCollapsedState, setUncontrolledCollapsedState] =
    React.useState<Record<number, boolean>>(() => {
      const initialState: Record<number, boolean> = {};
      collapsibleConfigs.forEach((config) => {
        if (!config.isControlled) {
          initialState[config.index] = config.initialCollapsed;
        }
      });
      return initialState;
    });

  React.useEffect(() => {
    setUncontrolledCollapsedState((prev) => {
      let changed = false;
      const next = { ...prev } as Record<number, boolean>;

      collapsibleConfigs.forEach((config) => {
        if (config.isControlled) {
          if (Object.prototype.hasOwnProperty.call(next, config.index)) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete next[config.index];
            changed = true;
          }
        } else if (!Object.prototype.hasOwnProperty.call(next, config.index)) {
          next[config.index] = config.initialCollapsed;
          changed = true;
        }
      });

      Object.keys(next).forEach((key) => {
        const index = Number(key);
        const stillPresent = collapsibleConfigs.some(
          (config) => !config.isControlled && config.index === index
        );
        if (!stillPresent) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[index];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [collapsibleConfigs]);

  const panelRefs = React.useRef<Array<ImperativePanelHandle | null>>([]);
  const lastExpandedSizeRef = React.useRef<Record<number, number | null>>({});
  const lastNonZeroSizeRef = React.useRef<Record<number, number | null>>({});
  const appliedInitialCollapseRef = React.useRef(new Set<number>());

  const isPanelCollapsed = React.useCallback(
    (index: number) => {
      const config = configByIndex.get(index);
      if (!config) return false;
      if (config.isControlled) {
        return Boolean(config.collapsedProp);
      }
      if (
        Object.prototype.hasOwnProperty.call(uncontrolledCollapsedState, index)
      ) {
        return uncontrolledCollapsedState[index];
      }
      return config.initialCollapsed;
    },
    [configByIndex, uncontrolledCollapsedState]
  );

  const setPanelCollapsed = React.useCallback(
    (index: number, next: boolean) => {
      const config = configByIndex.get(index);
      if (!config) return;

      if (!config.isControlled) {
        setUncontrolledCollapsedState((prev) => {
          const current = Object.prototype.hasOwnProperty.call(prev, index)
            ? prev[index]
            : config.initialCollapsed;
          if (current === next) {
            return prev;
          }
          return { ...prev, [index]: next };
        });
      }

      config.onCollapsedChange?.(next);
    },
    [configByIndex]
  );

  const togglePanel = React.useCallback(
    (index: number) => {
      const config = configByIndex.get(index);
      if (!config) return;

      const ref = panelRefs.current[index];
      if (!ref) return;

      const currentlyCollapsed = isPanelCollapsed(index);

      if (!currentlyCollapsed) {
        try {
          lastExpandedSizeRef.current[index] = ref.getSize();
        } catch {
          lastExpandedSizeRef.current[index] =
            lastNonZeroSizeRef.current[index] ??
            (defaultSizes ? (defaultSizes[index] ?? null) : null);
        }

        if (typeof ref.collapse === 'function') {
          ref.collapse();
        } else if (typeof ref.resize === 'function') {
          try {
            ref.resize(0);
          } catch {
            /* noop */
          }
        }
      } else {
        const targetSize =
          lastExpandedSizeRef.current[index] ??
          lastNonZeroSizeRef.current[index] ??
          (defaultSizes ? (defaultSizes[index] ?? null) : null) ??
          50;

        if (typeof ref.expand === 'function') {
          ref.expand();
        }

        if (typeof ref.resize === 'function') {
          try {
            ref.resize(targetSize);
          } catch {
            /* noop */
          }
        }
      }

      setPanelCollapsed(index, !currentlyCollapsed);
    },
    [configByIndex, defaultSizes, isPanelCollapsed, setPanelCollapsed]
  );

  const handlePanelResize = React.useCallback(
    (size: number, index: number) => {
      if (!configByIndex.has(index)) {
        return;
      }

      if (size > 0) {
        lastNonZeroSizeRef.current[index] = size;
        lastExpandedSizeRef.current[index] = size;
      }

      const isNowCollapsed = size <= 1;
      const currentlyCollapsed = isPanelCollapsed(index);

      if (isNowCollapsed !== currentlyCollapsed) {
        if (isNowCollapsed && lastExpandedSizeRef.current[index] == null) {
          const fallback =
            lastNonZeroSizeRef.current[index] ??
            (defaultSizes ? (defaultSizes[index] ?? null) : null) ??
            50;
          lastExpandedSizeRef.current[index] = fallback;
        }
        setPanelCollapsed(index, isNowCollapsed);
      }
    },
    [configByIndex, defaultSizes, isPanelCollapsed, setPanelCollapsed]
  );

  React.useEffect(() => {
    collapsibleConfigs.forEach((config) => {
      if (!config.initialCollapsed || config.isControlled) return;
      if (appliedInitialCollapseRef.current.has(config.index)) return;

      const ref = panelRefs.current[config.index];
      if (!ref) return;

      try {
        if (typeof ref.collapse === 'function') {
          ref.collapse();
        }
      } catch {
        /* noop */
      }

      appliedInitialCollapseRef.current.add(config.index);
    });
  }, [collapsibleConfigs]);

  React.useEffect(() => {
    collapsibleConfigs.forEach((config) => {
      if (!config.isControlled) return;
      const ref = panelRefs.current[config.index];
      if (!ref) return;

      try {
        const size = ref.getSize();
        if (config.collapsedProp && size !== 0) {
          if (typeof ref.collapse === 'function') {
            ref.collapse();
          } else if (typeof ref.resize === 'function') {
            ref.resize(0);
          }
        } else if (!config.collapsedProp && size === 0) {
          if (typeof ref.expand === 'function') {
            ref.expand();
          }
          const target =
            lastExpandedSizeRef.current[config.index] ??
            lastNonZeroSizeRef.current[config.index] ??
            (defaultSizes ? (defaultSizes[config.index] ?? null) : null) ??
            50;
          if (typeof ref.resize === 'function') {
            try {
              ref.resize(target);
            } catch {
              /* noop */
            }
          }
        }
      } catch {
        /* noop */
      }
    });
  }, [collapsibleConfigs, defaultSizes]);

  const loadSavedLayout = React.useCallback(() => {
    if (!autoSaveId || typeof window === 'undefined') {
      return null;
    }

    try {
      const storageKey = `${STORAGE_PREFIX}${autoSaveId}`;
      const serialized = window.localStorage.getItem(storageKey);
      if (!serialized) {
        return null;
      }

      const parsed = JSON.parse(serialized) as Record<
        string,
        StoredPanelGroupState
      >;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      if (savedPanelKey) {
        const direct = parsed[savedPanelKey];
        if (direct && Array.isArray(direct.layout)) {
          return direct.layout;
        }
      }

      // No entry under the library's key yet: carry over a layout saved under
      // an older key (before the ids were stable). The library then saves it
      // under its key, so this runs once.
      const fallbackEntry = Object.values(parsed).find((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const layout = (entry as StoredPanelGroupState).layout;
        return Array.isArray(layout) && layout.length === childrenCount;
      }) as StoredPanelGroupState | undefined;

      if (fallbackEntry?.layout) {
        return fallbackEntry.layout;
      }
    } catch (error) {
      logger.debug('[SplitPanel] Failed to load saved layout', {
        autoSaveId,
        error,
      });
    }

    return null;
  }, [autoSaveId, savedPanelKey, childrenCount]);

  React.useEffect(() => {
    appliedLayoutKeyRef.current = null;
  }, [autoSaveId, savedPanelKey, childrenCount]);

  React.useEffect(() => {
    if (!autoSaveId || typeof window === 'undefined') {
      return;
    }

    const signatureKey = savedPanelKey ?? 'unknown';
    const appliedKey = `${autoSaveId}:${signatureKey}`;
    if (appliedLayoutKeyRef.current === appliedKey) {
      return;
    }

    let raf: number | null = null;
    let attempts = 0;
    let cancelled = false;

    const attemptApply = () => {
      if (cancelled) {
        return;
      }

      const ref = panelGroupRef.current;
      if (!ref) {
        if (attempts < 3) {
          attempts += 1;
          raf = window.requestAnimationFrame(attemptApply);
        }
        return;
      }

      const currentLayout = ref.getLayout?.() ?? [];
      if (!currentLayout.length) {
        if (attempts < 3) {
          attempts += 1;
          raf = window.requestAnimationFrame(attemptApply);
        }
        return;
      }

      const savedLayout = loadSavedLayout();
      if (
        savedLayout &&
        savedLayout.length === currentLayout.length &&
        !layoutsEqual(currentLayout, savedLayout)
      ) {
        ref.setLayout(savedLayout);
        logger.debug('[SplitPanel] Applied saved layout', {
          autoSaveId,
          panelKey: savedPanelKey,
        });
      }

      appliedLayoutKeyRef.current = appliedKey;
    };

    attemptApply();

    return () => {
      cancelled = true;
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [autoSaveId, savedPanelKey, loadSavedLayout]);

  const getButtonLabel = React.useCallback(
    (index: number, relativePosition: 'leading' | 'trailing') => {
      const config = configByIndex.get(index);
      if (config?.collapseButtonLabel) {
        return config.collapseButtonLabel;
      }

      const region =
        direction === 'horizontal'
          ? relativePosition === 'leading'
            ? 'left'
            : 'right'
          : relativePosition === 'leading'
            ? 'top'
            : 'bottom';

      return isPanelCollapsed(index)
        ? `Expand ${region} panel`
        : `Collapse ${region} panel`;
    },
    [configByIndex, direction, isPanelCollapsed]
  );

  const getButtonIcon = React.useCallback(
    (index: number, relativePosition: 'leading' | 'trailing') => {
      const collapsed = isPanelCollapsed(index);
      if (direction === 'horizontal') {
        if (relativePosition === 'leading') {
          // Button on the right edge of left panel
          // Arrow points in the direction of expansion
          // When left is collapsed, show ▶ (expand left/right)
          // When left is expanded, show ◀ (collapse left/expand right)
          return collapsed ? '▶' : '◀';
        }
        // Button on the left edge of right panel
        // When right is collapsed, show ◀ (expand right/collapse left)
        // When right is expanded, show ▶ (collapse right/expand left)
        return collapsed ? '◀' : '▶';
      }

      if (relativePosition === 'leading') {
        // Button on the bottom edge of top panel
        // When top is collapsed, show ▼ (expand top/collapse bottom)
        // When top is expanded, show ▲ (collapse top/expand bottom)
        return collapsed ? '▼' : '▲';
      }

      // Button on the top edge of bottom panel
      // When bottom is collapsed, show ▲ (expand bottom/collapse top)
      // When bottom is expanded, show ▼ (collapse bottom/expand top)
      return collapsed ? '▲' : '▼';
    },
    [direction, isPanelCollapsed]
  );

  return (
    <ResizablePanelGroup
      ref={panelGroupRef}
      direction={direction}
      className={cn('h-full relative', className)}
      style={panelGroupStyle}
      autoSaveId={autoSaveId ?? null}
    >
      {childrenArray.map((child, index) => {
        const isLast = index === childrenArray.length - 1;
        const panelConfig = configByIndex.get(index);
        const isCollapsiblePanel = Boolean(panelConfig);
        const effectiveMinSize = (() => {
          if (minSizes?.[index] != null) {
            return minSizes[index];
          }
          return isCollapsiblePanel ? 0 : 5;
        })();
        const collapsedState =
          isCollapsiblePanel && isPanelCollapsed(index) ? 'true' : undefined;
        const panel = (
          <ResizablePanel
            defaultSize={defaultSizes?.[index]}
            minSize={effectiveMinSize}
            // Only apply collapsible props to target panel
            {...(isCollapsiblePanel && {
              collapsible: true,
            })}
            ref={(el: ImperativePanelHandle | null) => {
              panelRefs.current[index] = el;
            }}
            onResize={(size) => handlePanelResize(size, index)}
            id={`${panelIdBase}-panel-${index}`}
            data-collapsed={collapsedState}
            className={cn(
              'transition-all duration-300 ease-in-out overflow-hidden',
              React.isValidElement(child) &&
                (child.props as { className?: string }).className
            )}
            key={index}
          >
            {child}
          </ResizablePanel>
        );
        if (isLast) return panel;
        const leadingPanelConfig = configByIndex.get(index);
        const trailingPanelConfig = configByIndex.get(index + 1);
        const handle = (
          <PanelResizeHandle
            key={`handle-${index}`}
            className={cn(
              'group relative shrink-0 transition-colors duration-200 ease-in-out',
              gappedHandle
                ? 'bg-transparent hover:bg-accent/60'
                : 'bg-border hover:bg-accent',
              direction === 'horizontal'
                ? gappedHandle
                  ? 'w-[var(--panel-gap)] h-full cursor-col-resize'
                  : 'w-1 h-full cursor-col-resize'
                : gappedHandle
                  ? 'h-[var(--panel-gap)] w-full cursor-row-resize'
                  : 'h-1 w-full cursor-row-resize'
            )}
          >
            {showCollapseButton && leadingPanelConfig && (
              <button
                type="button"
                onClick={() => togglePanel(index)}
                aria-label={getButtonLabel(index, 'leading')}
                aria-expanded={!isPanelCollapsed(index)}
                aria-controls={`${panelIdBase}-panel-${index}`}
                className={cn(
                  'absolute z-10 flex h-4 w-4 items-center justify-center rounded-sm border bg-background/90 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-opacity',
                  gappedHandle &&
                    'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  direction === 'horizontal'
                    ? 'top-1/2 -translate-y-1/2 left-0 -translate-x-full'
                    : 'left-1/2 -translate-x-1/2 top-0 -translate-y-full'
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                data-panel-index={index}
                data-panel-position="leading"
              >
                <span aria-hidden="true">
                  {getButtonIcon(index, 'leading')}
                </span>
              </button>
            )}
            {showCollapseButton && trailingPanelConfig && (
              <button
                type="button"
                onClick={() => togglePanel(index + 1)}
                aria-label={getButtonLabel(index + 1, 'trailing')}
                aria-expanded={!isPanelCollapsed(index + 1)}
                aria-controls={`${panelIdBase}-panel-${index + 1}`}
                className={cn(
                  'absolute z-10 flex h-4 w-4 items-center justify-center rounded-sm border bg-background/90 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-opacity',
                  gappedHandle &&
                    'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  direction === 'horizontal'
                    ? 'top-1/2 -translate-y-1/2 right-0 translate-x-full'
                    : 'left-1/2 -translate-x-1/2 bottom-0 translate-y-full'
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                data-panel-index={index + 1}
                data-panel-position="trailing"
              >
                <span aria-hidden="true">
                  {getButtonIcon(index + 1, 'trailing')}
                </span>
              </button>
            )}
          </PanelResizeHandle>
        );
        return (
          <React.Fragment key={`frag-${index}`}>
            {panel}
            {handle}
          </React.Fragment>
        );
      })}
    </ResizablePanelGroup>
  );
}

// Individual panel component for better composition
interface PanelProps {
  children: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
}

export function Panel({
  children,
  defaultSize = 50,
  minSize = 20,
  maxSize = 80,
  className,
}: PanelProps) {
  return (
    <ResizablePanel
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      {...(className && { className })}
    >
      {children}
    </ResizablePanel>
  );
}

// Handle component for manual placement
export function PanelHandle() {
  return (
    <PanelResizeHandle className="w-2 bg-border hover:bg-accent transition-colors" />
  );
}

// Group component for better composition
interface PanelGroupProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
}

export function PanelGroup({
  direction,
  children,
  className,
}: PanelGroupProps) {
  return (
    <ResizablePanelGroup
      direction={direction}
      className={cn('h-full', className)}
    >
      {children}
    </ResizablePanelGroup>
  );
}
