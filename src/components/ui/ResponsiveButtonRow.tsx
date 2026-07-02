import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useRenderLoopTripwire } from '@/hooks/useRenderLoopTripwire';
import { cn } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface ResponsiveButtonRenderProps {
  /** Whether the button is currently in compact mode */
  isCompact: boolean;
}

export interface ResponsiveButtonConfig {
  /** Unique identifier for the button */
  id: string;
  /**
   * Priority for compacting (lower priority number = compacts first).
   * Buttons with lower priority will become icon-only first when space is limited.
   * Higher priority buttons (higher numbers) compact last.
   */
  priority: number;
  /**
   * The full (expanded) button content - shown when there's enough space.
   * Can be a ReactNode or a render function receiving compact state.
   */
  fullContent:
    | React.ReactNode
    | ((props: ResponsiveButtonRenderProps) => React.ReactNode);
  /**
   * The compact (icon-only) button content - shown when space is limited.
   * Can be a ReactNode or a render function receiving compact state.
   */
  compactContent:
    | React.ReactNode
    | ((props: ResponsiveButtonRenderProps) => React.ReactNode);
  /**
   * Whether this button should always stay in full mode (never compact).
   * @default false
   */
  alwaysFull?: boolean;
  /**
   * Whether this button should always stay in compact mode.
   * @default false
   */
  alwaysCompact?: boolean;
  /**
   * Additional className to apply to this button's wrapper.
   */
  className?: string;
  /**
   * Additional className to apply when this button is compacted.
   */
  compactClassName?: string;
  /**
   * Whether this button is visible/rendered.
   * @default true
   */
  visible?: boolean;
  /**
   * Label to show in the overflow menu when this button is moved there.
   * Required for buttons that can overflow into the menu.
   */
  menuLabel?: ReactNode;
  /**
   * Icon to show in the overflow menu when this button is moved there.
   */
  menuIcon?: ComponentType<{ className?: string }>;
  /**
   * Callback when the button is clicked from the overflow menu.
   * If not provided, the button won't be actionable from the menu.
   */
  onMenuClick?: () => void;
  /**
   * Whether this button is disabled (applies in menu too).
   * @default false
   */
  disabled?: boolean;
  /**
   * If true, this button can never be moved to the overflow menu.
   * @default false
   */
  neverOverflow?: boolean;
  /**
   * If true, this button can be hidden from view when space is constrained,
   * even if it doesn't have menuLabel/onMenuClick (won't appear in overflow menu).
   * Useful for custom buttons that should disappear under extreme constraints.
   * @default false
   */
  canHide?: boolean;
}

/**
 * Menu item types for the overflow menu - compatible with PanelMenuConfig
 */
export type OverflowMenuItem =
  | {
      type?: 'item';
      label: ReactNode;
      onSelect: () => void;
      icon?: ComponentType<{ className?: string }>;
      disabled?: boolean;
      shortcut?: string;
      id?: string;
    }
  | {
      type: 'checkbox';
      label: ReactNode;
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
      onSelect?: () => void;
      icon?: ComponentType<{ className?: string }>;
      disabled?: boolean;
      id?: string;
    }
  | {
      type: 'separator';
      id?: string;
    };

export interface ResponsiveButtonRowProps {
  /** Array of button configurations */
  buttons: ResponsiveButtonConfig[];
  /** Gap between buttons in pixels or CSS value */
  gap?: number | string;
  /** Additional className for the container */
  className?: string;
  /**
   * Horizontal alignment of buttons.
   * @default 'left'
   */
  alignment?: 'left' | 'center' | 'right';
  /**
   * Minimum buffer space to maintain (in pixels).
   * Helps prevent layout thrashing at the edge.
   * @default 4
   */
  buffer?: number;
  /**
   * If true, all buttons will be compacted together rather than progressively.
   * @default false
   */
  compactAllTogether?: boolean;
  /** When container width falls below this threshold (px), compact everything possible */
  compactThreshold?: number;
  /**
   * If true, the button with highest priority (highest number) will be full width.
   * @default false
   */
  highestPriorityFullWidth?: boolean;
  /**
   * Callback when compact state changes for any button.
   */
  onCompactStateChange?: (compactedIds: Set<string>) => void;
  /**
   * Enable the overflow menu. When enabled, buttons that don't fit even when compacted
   * will be moved to a 3-dot menu on the right side.
   * @default false
   */
  enableOverflowMenu?: boolean;
  /**
   * Custom menu items to always show in the overflow menu.
   * These items appear above any overflowed buttons.
   */
  overflowMenuItems?: OverflowMenuItem[];
  /**
   * Additional className for the overflow menu trigger button.
   */
  overflowMenuTriggerClassName?: string;
  /**
   * Aria label for the overflow menu trigger.
   * @default 'More options'
   */
  overflowMenuAriaLabel?: string;
  /**
   * Additional className for the overflow menu content.
   */
  overflowMenuContentClassName?: string;
  /**
   * Callback when overflow state changes (buttons moved to/from menu).
   */
  onOverflowStateChange?: (overflowedIds: Set<string>) => void;
  /**
   * Callback fired with layout metrics derived from the current button set.
   * Lets parents make space decisions of their own (e.g. "do I have room for
   * an inline search?") without hard-coding a width threshold.
   */
  onLayoutMetrics?: (metrics: ResponsiveButtonRowMetrics) => void;
}

/**
 * Layout metrics published by ResponsiveButtonRow via {@link ResponsiveButtonRowProps.onLayoutMetrics}.
 */
export interface ResponsiveButtonRowMetrics {
  /** Width (px) the row needs to render every visible button at full size, plus gaps and the overflow menu trigger (when it would be shown for custom items). */
  requiredFullWidth: number;
  /** Width (px) the row would need if every button were in its compact form. */
  requiredCompactWidth: number;
  /**
   * Width (px) needed to render every *retained* button at full size, assuming
   * any hidable button whose compact form would not save space (and is therefore
   * a removal candidate, like a wide caller-provided action wrapper) has been
   * moved to the overflow menu. Parents can use this to size sibling content
   * (e.g. an adjacent search input) realistically: when toolbar width is tight,
   * those bulky buttons overflow first, so the space they take in `requiredFullWidth`
   * is misleading.
   */
  requiredFullWidthExcludingIncompressibles: number;
}

/**
 * ResponsiveButtonRow - A component that intelligently compacts buttons based on
 * available space and their priority.
 *
 * Lower priority buttons will be compacted (icon-only) first when space is limited.
 * When overflow menu is enabled, buttons that still don't fit after compacting
 * will be moved to a 3-dot overflow menu.
 * Uses ResizeObserver to track container width and measurement for accurate sizing.
 */
const ALIGNMENT_CLASSES = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

export const ResponsiveButtonRow: React.FC<ResponsiveButtonRowProps> = ({
  buttons,
  gap = 8,
  className,
  alignment = 'left',
  buffer = 4,
  compactAllTogether = false,
  compactThreshold,
  highestPriorityFullWidth = false,
  onCompactStateChange,
  onLayoutMetrics,
  enableOverflowMenu = false,
  overflowMenuItems = [],
  overflowMenuTriggerClassName,
  overflowMenuAriaLabel = 'More options',
  overflowMenuContentClassName,
  onOverflowStateChange,
}) => {
  // Render-loop tripwire (additive, non-fatal). This component has a history of
  // measurement-jitter feedback (see the rounding/equality-guard comments in
  // `measure` below); if an unstable prop ever revives that loop in production,
  // the tripwire captures WHICH prop was oscillating and reports it before
  // React #185 kills the tree. Near-zero cost when idle; kill via
  // localStorage['gainium:tripwire']='off'.
  useRenderLoopTripwire('ResponsiveButtonRow', {
    buttons,
    gap,
    className,
    alignment,
    buffer,
    compactAllTogether,
    compactThreshold,
    highestPriorityFullWidth,
    onCompactStateChange,
    onLayoutMetrics,
    enableOverflowMenu,
    overflowMenuItems,
    overflowMenuTriggerClassName,
    overflowMenuAriaLabel,
    overflowMenuContentClassName,
    onOverflowStateChange,
  });

  const [containerRef, containerWidth] = useContainerWidth();
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureCompactRef = useRef<HTMLDivElement>(null);
  const measureMenuRef = useRef<HTMLDivElement>(null);
  const [compactedIds, setCompactedIds] = useState<Set<string>>(new Set());
  const [overflowedIds, setOverflowedIds] = useState<Set<string>>(new Set());
  const [measurements, setMeasurements] = useState<{
    full: Map<string, number>;
    compact: Map<string, number>;
    menuButton: number;
  }>({ full: new Map(), compact: new Map(), menuButton: 0 });

  // Filter visible buttons
  const visibleButtons = useMemo(
    () => buttons.filter((b) => b.visible !== false),
    [buttons]
  );

  // Sort buttons by priority for display order (ascending: lowest priority first/left)
  const sortedForDisplay = useMemo(
    () => [...visibleButtons].sort((a, b) => a.priority - b.priority),
    [visibleButtons]
  );

  // Sort buttons by priority (lower priority number = compact first, then overflow first)
  const sortedByPriority = useMemo(
    () =>
      [...visibleButtons]
        .filter((b) => !b.alwaysFull && !b.alwaysCompact)
        .sort((a, b) => a.priority - b.priority),
    [visibleButtons]
  );

  // Buttons that can be hidden (either overflowable OR have canHide set)
  const hidableButtons = useMemo(
    () =>
      sortedByPriority.filter(
        (b) => !b.neverOverflow && (b.canHide || (b.menuLabel && b.onMenuClick))
      ),
    [sortedByPriority]
  );

  // Find the highest priority button (highest number)
  const highestPriorityId = useMemo(() => {
    if (!highestPriorityFullWidth || visibleButtons.length === 0) return null;
    return visibleButtons.reduce((max, b) =>
      b.priority > max.priority ? b : max
    ).id;
  }, [visibleButtons, highestPriorityFullWidth]);

  // Keep the latest display order in a ref so `measure` can stay referentially
  // stable (no per-render identity churn) while still reading current buttons.
  const sortedForDisplayRef = useRef(sortedForDisplay);
  sortedForDisplayRef.current = sortedForDisplay;

  // Stable signature of the button SET (ids in display order). A button being
  // added or removed changes this; a re-render that merely hands us a new array
  // reference for the same buttons (e.g. live-data ticks recreating
  // buttonConfigs) does not.
  const buttonSignature = useMemo(
    () => sortedForDisplay.map((b) => b.id).join('|'),
    [sortedForDisplay]
  );

  // Measure intrinsic button widths. This is the ONLY place that reads layout
  // (getBoundingClientRect forces a synchronous reflow), so it is deliberately
  // kept off the per-render path and triggered only by the two effects below.
  const measure = useCallback(() => {
    if (!measureFullRef.current || !measureCompactRef.current) return;

    const fullMeasurements = new Map<string, number>();
    const compactMeasurements = new Map<string, number>();

    const fullChildren = measureFullRef.current.children;
    const compactChildren = measureCompactRef.current.children;

    // Round to integer pixels. getBoundingClientRect returns sub-pixel floats
    // that jitter between otherwise-identical layouts (DPR, browser zoom,
    // subpixel text metrics, font reflow). The equality guard below compares
    // with exact ===, so unrounded jitter (e.g. 100.6666 vs 100.6667) makes it
    // fail forever: setMeasurements commits → re-render → re-measure → new tiny
    // float → "Maximum update depth exceeded". Rounding collapses identical
    // layouts to the same value so the guard can actually hold. useContainerWidth
    // already floors its width, so this keeps both sides on integer footing.
    sortedForDisplayRef.current.forEach((button, index) => {
      const fullEl = fullChildren[index] as HTMLElement | undefined;
      const compactEl = compactChildren[index] as HTMLElement | undefined;

      if (fullEl) {
        fullMeasurements.set(
          button.id,
          Math.round(fullEl.getBoundingClientRect().width)
        );
      }
      if (compactEl) {
        compactMeasurements.set(
          button.id,
          Math.round(compactEl.getBoundingClientRect().width)
        );
      }
    });

    // Measure menu button width
    let menuButtonWidth = 0;
    if (measureMenuRef.current) {
      menuButtonWidth = Math.round(
        measureMenuRef.current.getBoundingClientRect().width
      );
    }

    setMeasurements((prev) => {
      // Only update if values actually changed — prevents cascade when buttons prop
      // gets a new reference on every parent render (e.g. unstable buttonConfigs deps)
      if (
        prev.menuButton === menuButtonWidth &&
        prev.full.size === fullMeasurements.size &&
        prev.compact.size === compactMeasurements.size &&
        [...fullMeasurements].every(([id, w]) => prev.full.get(id) === w) &&
        [...compactMeasurements].every(([id, w]) => prev.compact.get(id) === w)
      ) {
        return prev;
      }
      return {
        full: fullMeasurements,
        compact: compactMeasurements,
        menuButton: menuButtonWidth,
      };
    });
  }, []);

  // Re-measure on mount and whenever the button SET changes. useLayoutEffect so
  // the first measured layout is committed before paint (no flash of an
  // unmeasured row). Keyed on the stable signature — NOT the array identity — so
  // live-data re-renders that recreate the buttons array don't force a reflow.
  // Window resize does not run this: container width is tracked separately by
  // useContainerWidth, which feeds the (cheap, DOM-free) compact/overflow math.
  useLayoutEffect(() => {
    measure();
  }, [measure, buttonSignature]);

  // Re-measure when the hidden measure containers actually change size. This
  // catches content-driven width changes that don't change the button set —
  // a label going "Save" → "Saving…", a count badge, a late web-font swap —
  // without paying a forced reflow on every render. The measure containers are
  // off-screen and render the full + compact forms unconditionally, so their
  // size is independent of container width and of the compact/overflow result;
  // committing new measurements can't change their size, so this can't loop.
  useEffect(() => {
    const targets = [
      measureFullRef.current,
      measureCompactRef.current,
      measureMenuRef.current,
    ].filter((el): el is HTMLDivElement => el !== null);
    if (targets.length === 0) return;

    const observer = new ResizeObserver(() => measure());
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [measure, enableOverflowMenu]);

  // Calculate which buttons should be compacted and which should overflow
  const calculateButtonStates = useCallback(() => {
    if (!containerWidth || measurements.full.size === 0) {
      return { compacted: new Set<string>(), overflowed: new Set<string>() };
    }

    const gapValue = typeof gap === 'number' ? gap : parseInt(gap, 10) || 8;
    const newCompacted = new Set<string>(
      visibleButtons.filter((b) => b.alwaysCompact).map((b) => b.id)
    );
    const newOverflowed = new Set<string>();

    // Helper to calculate current width based on compacted and overflowed sets
    const calculateCurrentWidth = (
      compacted: Set<string>,
      overflowed: Set<string>
    ) => {
      let width = 0;
      let count = 0;
      for (const button of visibleButtons) {
        if (overflowed.has(button.id)) continue;
        count++;
        if (button.alwaysFull) {
          width += measurements.full.get(button.id) ?? 0;
        } else if (button.alwaysCompact || compacted.has(button.id)) {
          width += measurements.compact.get(button.id) ?? 0;
        } else {
          width += measurements.full.get(button.id) ?? 0;
        }
      }
      // Add gaps between visible buttons
      if (count > 1) {
        width += (count - 1) * gapValue;
      }
      return width;
    };

    // Check if we need to show the overflow menu
    const hasCustomMenuItems = overflowMenuItems.length > 0;
    const hasHidableButtons = hidableButtons.length > 0;

    // The container width is floored in useContainerWidth, and individual button
    // widths are sub-pixel floats from getBoundingClientRect. Add a small tolerance
    // so we don't aggressively collapse when we're within rounding noise of fitting.
    const FIT_TOLERANCE = 2;

    // Menu button space: only reserved when the menu will actually be visible.
    // - If there are custom menu items, the menu is always rendered → reserve.
    // - Otherwise the menu only appears when a button actually overflows → don't
    //   reserve preemptively; we add it back if/when we trigger overflow below.
    const reservedMenuSpace =
      enableOverflowMenu && hasCustomMenuItems
        ? measurements.menuButton + gapValue
        : 0;

    // Available width assuming no overflow happens (lenient: don't reserve overflow menu yet).
    const availableWidth = containerWidth - buffer - reservedMenuSpace;

    // If compactThreshold is provided and we're under it, compact everything possible
    if (
      typeof compactThreshold === 'number' &&
      containerWidth <= compactThreshold
    ) {
      visibleButtons.forEach((b) => {
        if (!b.alwaysFull) {
          newCompacted.add(b.id);
        }
      });
    }

    // Menu reservation used by the overflow probe below.
    const overflowMenuReserve =
      enableOverflowMenu && !hasCustomMenuItems
        ? measurements.menuButton + gapValue
        : 0;
    const availableWithMenu = availableWidth - overflowMenuReserve;

    // Calculate initial width
    let currentWidth = calculateCurrentWidth(newCompacted, newOverflowed);

    // If everything fits (within tolerance), return only always-compact buttons
    if (currentWidth <= availableWidth + FIT_TOLERANCE) {
      return { compacted: newCompacted, overflowed: newOverflowed };
    }

    if (compactAllTogether) {
      // Compact all non-always-full buttons at once
      for (const button of sortedByPriority) {
        newCompacted.add(button.id);
      }
      currentWidth = calculateCurrentWidth(newCompacted, newOverflowed);
    } else {
      // Progressive compacting: drop labels one button at a time, lowest
      // priority first. We don't try to remove buttons here — that happens
      // below, once compaction has done all it can. The priority order is
      // what callers configure to express importance, and we honor it: a
      // wider higher-priority button (e.g. a caller-supplied action) stays
      // visible while small low-priority buttons compact and then overflow.
      for (const button of sortedByPriority) {
        if (currentWidth <= availableWidth + FIT_TOLERANCE) break;
        if (newCompacted.has(button.id)) continue;
        newCompacted.add(button.id);
        currentWidth = calculateCurrentWidth(newCompacted, newOverflowed);
      }
    }

    // Still doesn't fit. Fall back to greedy lowest-priority-first overflow.
    if (
      enableOverflowMenu &&
      currentWidth > availableWithMenu + FIT_TOLERANCE &&
      hasHidableButtons
    ) {
      for (const button of hidableButtons) {
        if (currentWidth <= availableWithMenu + FIT_TOLERANCE) break;
        if (newOverflowed.has(button.id)) continue; // Already overflowed

        // Add to overflow and recalculate width
        // Note: buttons without menuLabel/onMenuClick will be hidden but not shown in menu
        newOverflowed.add(button.id);
        currentWidth = calculateCurrentWidth(newCompacted, newOverflowed);
      }
    }

    return { compacted: newCompacted, overflowed: newOverflowed };
  }, [
    containerWidth,
    measurements,
    visibleButtons,
    sortedByPriority,
    hidableButtons,
    gap,
    buffer,
    compactAllTogether,
    compactThreshold,
    enableOverflowMenu,
    overflowMenuItems.length,
  ]);

  // Update compacted and overflowed state when container width or measurements change
  useEffect(() => {
    const { compacted, overflowed } = calculateButtonStates();

    // Update compacted state
    setCompactedIds((prev) => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(compacted).sort();

      if (
        prevArray.length === newArray.length &&
        prevArray.every((id, i) => id === newArray[i])
      ) {
        return prev;
      }

      return compacted;
    });

    // Update overflowed state
    setOverflowedIds((prev) => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(overflowed).sort();

      if (
        prevArray.length === newArray.length &&
        prevArray.every((id, i) => id === newArray[i])
      ) {
        return prev;
      }

      return overflowed;
    });
  }, [calculateButtonStates]);

  // Notify parent of compact state changes
  useEffect(() => {
    onCompactStateChange?.(compactedIds);
  }, [compactedIds, onCompactStateChange]);

  // Notify parent of overflow state changes
  useEffect(() => {
    onOverflowStateChange?.(overflowedIds);
  }, [overflowedIds, onOverflowStateChange]);

  // Notify parent of layout metrics so it can make its own space decisions
  // (e.g. "do I have room for an inline search?") without a hard-coded
  // breakpoint. Recomputes whenever measurements or visible-button set changes.
  useEffect(() => {
    if (!onLayoutMetrics) return;
    const gapValue = typeof gap === 'number' ? gap : parseInt(gap, 10) || 8;
    const COMPACT_SAVINGS_EPSILON = 4;
    let fullWidth = 0;
    let compactWidth = 0;
    let count = 0;
    // "Excluding incompressibles" pass: drop hidable buttons whose compact
    // form doesn't save space — those overflow first when the row is tight,
    // so a parent sizing a sibling should not budget for them.
    let fullWidthMinimal = 0;
    let minimalCount = 0;
    for (const button of visibleButtons) {
      const f = measurements.full.get(button.id);
      const c = measurements.compact.get(button.id);
      const includeInMinimal = (() => {
        if (button.alwaysFull) return true;
        if (button.neverOverflow) return true;
        const hidable = button.canHide || (button.menuLabel && button.onMenuClick);
        if (!hidable) return true;
        if (f == null || c == null) return true;
        // Incompressible hidable button: omit from minimal.
        return f - c > COMPACT_SAVINGS_EPSILON;
      })();
      if (button.alwaysCompact) {
        if (c != null) {
          compactWidth += c;
          fullWidth += c;
          count += 1;
          if (includeInMinimal) {
            fullWidthMinimal += c;
            minimalCount += 1;
          }
        }
      } else {
        if (f != null) {
          fullWidth += f;
          count += 1;
          if (includeInMinimal) {
            fullWidthMinimal += f;
            minimalCount += 1;
          }
        }
        if (c != null) {
          compactWidth += c;
        }
      }
    }
    const hasCustomMenuItems = overflowMenuItems.length > 0;
    const menuReserve =
      enableOverflowMenu && hasCustomMenuItems && measurements.menuButton > 0
        ? measurements.menuButton + gapValue
        : 0;
    if (count > 1) {
      const gapsTotal = (count - 1) * gapValue;
      fullWidth += gapsTotal;
      compactWidth += gapsTotal;
    }
    if (minimalCount > 1) {
      fullWidthMinimal += (minimalCount - 1) * gapValue;
    }
    fullWidth += menuReserve;
    compactWidth += menuReserve;
    fullWidthMinimal += menuReserve;
    onLayoutMetrics({
      requiredFullWidth: fullWidth,
      requiredCompactWidth: compactWidth,
      requiredFullWidthExcludingIncompressibles: fullWidthMinimal,
    });
  }, [
    visibleButtons,
    measurements,
    gap,
    enableOverflowMenu,
    overflowMenuItems.length,
    onLayoutMetrics,
  ]);

  const gapStyle = typeof gap === 'number' ? `${gap}px` : gap;

  // Helper to render content (handles both ReactNode and render functions)
  const renderContent = (
    content:
      | React.ReactNode
      | ((props: ResponsiveButtonRenderProps) => React.ReactNode),
    isCompact: boolean
  ): React.ReactNode => {
    if (typeof content === 'function') {
      return content({ isCompact });
    }
    return content;
  };

  // Get buttons that are overflowed (for menu)
  const overflowedButtons = useMemo(
    () => sortedByPriority.filter((b) => overflowedIds.has(b.id)),
    [sortedByPriority, overflowedIds]
  );

  // Determine if we should show the overflow menu
  const showOverflowMenu =
    enableOverflowMenu &&
    (overflowMenuItems.length > 0 || overflowedButtons.length > 0);

  // Render overflow menu items
  const renderMenuItems = useCallback(() => {
    const items: React.ReactNode[] = [];

    // Add custom menu items first
    overflowMenuItems.forEach((item, index) => {
      if (item.type === 'separator') {
        items.push(
          <DropdownMenuSeparator key={item.id ?? `separator-${index}`} />
        );
      } else if (item.type === 'checkbox') {
        const Icon = item.icon;
        items.push(
          <DropdownMenuCheckboxItem
            key={item.id ?? `checkbox-${index}`}
            checked={item.checked}
            onCheckedChange={item.onCheckedChange}
            className="rounded-lg"
            disabled={Boolean(item.disabled)}
          >
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </div>
          </DropdownMenuCheckboxItem>
        );
      } else {
        const Icon = item.icon;
        items.push(
          <DropdownMenuItem
            key={item.id ?? `item-${index}`}
            onSelect={item.onSelect}
            className="rounded-lg"
            disabled={Boolean(item.disabled)}
          >
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </div>
            {item.shortcut ? (
              <span className="ml-auto text-xs tracking-wider text-muted-foreground/70">
                {item.shortcut}
              </span>
            ) : null}
          </DropdownMenuItem>
        );
      }
    });

    // Add separator if we have both custom items and overflowed buttons
    if (overflowMenuItems.length > 0 && overflowedButtons.length > 0) {
      items.push(<DropdownMenuSeparator key="overflow-separator" />);
    }

    // Add overflowed buttons as menu items
    overflowedButtons.forEach((button) => {
      const Icon = button.menuIcon;
      items.push(
        <DropdownMenuItem
          key={`overflow-${button.id}`}
          onSelect={() => button.onMenuClick?.()}
          className="rounded-lg"
          disabled={Boolean(button.disabled)}
        >
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            <span>{button.menuLabel}</span>
          </div>
        </DropdownMenuItem>
      );
    });

    return items;
  }, [overflowMenuItems, overflowedButtons]);

  return (
    <>
      {/* Main visible container */}
      <div
        ref={containerRef}
        className={cn(
          'flex flex-nowrap items-center min-w-0',
          ALIGNMENT_CLASSES[alignment],
          className
        )}
        style={{ gap: gapStyle }}
      >
        {sortedForDisplay.map((button) => {
          // Skip overflowed buttons in the main display
          if (overflowedIds.has(button.id)) return null;

          const isCompact =
            button.alwaysCompact ||
            (!button.alwaysFull && compactedIds.has(button.id));
          const isHighestPriority = button.id === highestPriorityId;
          const content = isCompact
            ? button.compactContent
            : button.fullContent;

          // Determine CSS order for layout:
          // - Overflow menu always at far right with order 1001
          // - Menu (id='menu') at far right with order 1000
          // - Highest priority button gets order 999 to be just before menu
          // - All other buttons use default order (0)
          const orderStyle = (() => {
            if (button.id === 'menu') return { order: 1000 };
            if (isHighestPriority && highestPriorityFullWidth)
              return { order: 999 };
            return undefined;
          })();

          return (
            <div
              key={button.id}
              className={cn(
                isHighestPriority && highestPriorityFullWidth
                  ? 'flex-1 min-w-0 *:w-full'
                  : 'shrink-0',
                button.className,
                isCompact && button.compactClassName
              )}
              style={orderStyle}
            >
              {renderContent(content, isCompact)}
            </div>
          );
        })}

        {/* Overflow menu button */}
        {showOverflowMenu && (
          <div className="shrink-0" style={{ order: 1001 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    overflowMenuTriggerClassName
                  )}
                >
                  <span className="sr-only">{overflowMenuAriaLabel}</span>
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(
                  'w-56 max-h-[min(400px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
                  overflowMenuContentClassName
                )}
              >
                {renderMenuItems()}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Hidden measurement containers - used to measure button widths */}
      <div
        ref={measureFullRef}
        aria-hidden
        className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none flex items-center"
        style={{ gap: gapStyle }}
      >
        {sortedForDisplay.map((button) => (
          <div key={button.id} className="shrink-0 whitespace-nowrap">
            {renderContent(button.fullContent, false)}
          </div>
        ))}
      </div>

      <div
        ref={measureCompactRef}
        aria-hidden
        className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none flex items-center"
        style={{ gap: gapStyle }}
      >
        {sortedForDisplay.map((button) => (
          <div key={button.id} className="shrink-0 whitespace-nowrap">
            {renderContent(button.compactContent, true)}
          </div>
        ))}
      </div>

      {/* Hidden menu button for measurement */}
      {enableOverflowMenu && (
        <div
          ref={measureMenuRef}
          aria-hidden
          className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none"
        >
          <Button type="button" variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
};

export default ResponsiveButtonRow;
