/* eslint-disable @typescript-eslint/no-explicit-any */
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { logger as Logger } from '../../lib/loggerInstance';
import { cn } from '../../lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

type BaseTabsProps = React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.Root
> & {
  /** Optional query param key to store tab value in the url */
  paramKey?: string;
  /** When updating url param, whether to replace the current history entry (default true) */
  paramReplace?: boolean;
  /** Whether this Tabs should sync its current value to the URL (default false) */
  paramSync?: boolean;
};

// Context for nested Tabs to derive unique param keys to avoid collisions
const TabsParamContext = React.createContext<{ baseKey?: string } | null>(null);

// Layout context used to coordinate default sizing behavior between TabsList and TabsTrigger.
const TabsLayoutContext = React.createContext<{
  fullWidth: boolean;
  disableDropdown?: boolean;
  tabsFit?: boolean;
} | null>(null);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  BaseTabsProps
>(
  (
    {
      paramKey: paramKeyProp,
      paramReplace = true,
      paramSync = false,
      onValueChange,
      value,
      defaultValue,
      ...props
    },
    ref
  ) => {
    const [searchParams, setSearchParams] = useSearchParams();
    // const location = useLocation();

    // Read value from URL param if provided
    // Only sync to URL if BOTH paramSync is true AND paramKey is explicitly provided
    // const parentCtx = React.useContext(TabsParamContext);

    // Use the explicitly provided paramKey, or undefined if not provided
    const paramKey = paramKeyProp;

    // Only read from URL if paramSync is enabled and paramKey is provided
    const paramValue =
      paramSync && paramKey
        ? (searchParams.get(paramKey) ?? undefined)
        : undefined;

    // Serialize search params for effect dependencies
    const serializedSearch = React.useMemo(
      () => searchParams.toString(),
      [searchParams]
    );

    // Extract allowed values for validation only if URL sync is enabled
    const allowedValues = React.useMemo(() => {
      if (!paramSync || !paramKey) return [];

      const values = new Set<string>();

      const walk = (nodes: any) => {
        React.Children.forEach(nodes, (node) => {
          if (!React.isValidElement(node)) return;
          const nodeElement = node as React.ReactElement<any>;
          // If node is a Tabs wrapper or Radix Tabs root, don't walk into it — it's a different tab group
          if (
            nodeElement.type === Tabs ||
            nodeElement.type === TabsPrimitive.Root
          ) {
            return;
          }
          const val = (nodeElement.props as any)?.value;
          if (typeof val === 'string') values.add(val);
          if ((nodeElement.props as any)?.children)
            walk((nodeElement.props as any).children);
        });
      };

      walk(props.children);
      return Array.from(values);
    }, [paramSync, paramKey, props.children]);

    // If there's no controlled value, try to control by URL param, falling back to defaultValue
    const controlledValue = value !== undefined ? value : paramValue;
    const resolvedDefaultValue =
      value === undefined && paramValue === undefined
        ? defaultValue
        : undefined;

    // Keep the latest onValueChange in a ref so the sync effect below doesn't
    // re-run on every render just because a caller passes an inline arrow
    // (which is the common case, e.g. the trading terminal's deal-type tabs).
    const onValueChangeRef = React.useRef(onValueChange);
    React.useEffect(() => {
      onValueChangeRef.current = onValueChange;
    });

    // Bidirectional URL <-> value sync (controlled case only).
    //
    // These used to be two separate effects that each fired whenever the URL
    // and `value` merely DIFFERED: one forced `URL := value`, the other forced
    // `value := URL`. That is stable only while the parent derives `value`
    // from the URL. A parent that derives it from somewhere else — the trading
    // terminal derives it from form state and falls back to 'smart' when unset
    // — makes the two directions overwrite each other indefinitely: each write
    // re-triggers the opposite one. That produced the observed
    // ?dealType=smart <-> ?dealType=simple flapping and, once the churn
    // reached the Radix Select ref callbacks below, React #185
    // ("Maximum update depth exceeded").
    //
    // Fix: run ONE effect that propagates a change only in the direction whose
    // own source actually moved, and bail when neither did, so the two sides
    // can never ping-pong. On mount the URL wins, so deep links such as
    // /terminal?dealType=simple are honored instead of being overwritten.
    const prevValueRef = React.useRef(value);
    const prevParamRef = React.useRef(paramValue);
    const didInitRef = React.useRef(false);

    React.useEffect(() => {
      if (!paramSync || !paramKey || value === undefined) return;

      const currentParam =
        new URLSearchParams(serializedSearch).get(paramKey) ?? undefined;

      const valueChanged = prevValueRef.current !== value;
      const paramChanged = prevParamRef.current !== currentParam;
      prevValueRef.current = value;
      prevParamRef.current = currentParam;

      const firstRun = !didInitRef.current;
      didInitRef.current = true;

      // Already agree — nothing to propagate.
      if (currentParam === value) return;

      // The URL is authoritative on mount (deep link) and whenever it is the
      // side that changed on its own (back/forward, an external navigation).
      const urlWins =
        currentParam !== undefined &&
        (firstRun || (paramChanged && !valueChanged));

      if (urlWins) {
        onValueChangeRef.current?.(currentParam);
        return;
      }

      // Otherwise the parent's value is authoritative — but only write when
      // something actually moved. Without this guard the effect would rewrite
      // the URL on every render and restart the loop.
      if (!firstRun && !valueChanged && !paramChanged) return;

      // Build from `serializedSearch` (the value this effect is keyed on) so we
      // never clobber unrelated params using a stale `searchParams` snapshot.
      const next = new URLSearchParams(serializedSearch);
      if (value) next.set(paramKey, value);
      else next.delete(paramKey);
      setSearchParams(next, { replace: paramReplace });
    }, [
      serializedSearch,
      value,
      paramKey,
      paramReplace,
      paramSync,
      setSearchParams,
    ]);

    const handleValueChange: typeof onValueChange = (newValue) => {
      // Only sync to URL if both paramSync and paramKey are provided
      if (paramSync && paramKey) {
        const next = new URLSearchParams(searchParams.toString());
        if (newValue) next.set(paramKey, newValue);
        else next.delete(paramKey);
        setSearchParams(next, { replace: paramReplace });
      }

      if (onValueChange) {
        onValueChange(newValue);
      }
    };

    // Remove query param on mount if it doesn't belong to this tab group
    React.useEffect(() => {
      if (!paramSync || !paramKey || allowedValues.length === 0) return;
      const current = new URLSearchParams(serializedSearch).get(paramKey);
      if (current && !allowedValues.includes(current)) {
        const next = new URLSearchParams(serializedSearch);
        next.delete(paramKey);
        setSearchParams(next, { replace: paramReplace });
      }
    }, [
      paramKey,
      paramReplace,
      serializedSearch,
      allowedValues,
      setSearchParams,
      paramSync,
    ]);

    return (
      <TabsParamContext.Provider value={{ baseKey: paramKey }}>
        <TabsPrimitive.Root
          ref={ref}
          value={controlledValue}
          defaultValue={resolvedDefaultValue}
          onValueChange={handleValueChange}
          {...props}
        />
      </TabsParamContext.Provider>
    );
  }
);
Tabs.displayName = TabsPrimitive.Root.displayName;

interface TabItem {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

/** Subtab configuration for Chrome-style tab groups */
export interface SubtabItem {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface TabsListProps extends Omit<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
  'value' | 'onValueChange'
> {
  value?: string; // Current tab value from parent Tabs
  onValueChange?: (value: string) => void; // Callback to parent Tabs
  breakpoint?: number; // Width in pixels to switch to dropdown (default: 640)
  /** Optional variant for styling the list (e.g. 'outlined') */
  variant?: 'default' | 'outlined';
  /** When true, force the tabs to take full width (default true) */
  fullWidth?: boolean;
  /**
   * When true, never switch to dropdown mode. Instead allow horizontal scrolling
   * and prevent tab compression (adds shrink-0 to tab triggers).
   */
  disableDropdown?: boolean;
  /**
   * Map of main tab value to its subtabs. When provided, creates Chrome-style tab groups.
   * Main tabs appear on the left, subtabs appear on the right with underline style when selected.
   */
  subtabs?: Record<string, SubtabItem[]>;
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(
  (
    {
      className,
      children,
      value,
      onValueChange,
      breakpoint: _breakpoint = 640,
      variant = 'default',
      fullWidth = true,
      disableDropdown = false,
      subtabs,
      ...props
    },
    ref
  ) => {
    const [indicatorStyle, setIndicatorStyle] = React.useState<{
      left: number;
      width: number;
    }>({ left: 0, width: 0 });

    const containerRef = React.useRef<HTMLDivElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const measurementRef = React.useRef<HTMLDivElement>(null);
    const subtabContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [activeSubtabsWidth, setActiveSubtabsWidth] = React.useState(0);
    const [useDropdown, setUseDropdown] = React.useState(false);
    // Whether the cumulative tab items fit within the container width. When false
    // and `disableDropdown` is true, we should prevent triggers from shrinking
    // and allow the parent to overflow horizontally instead.
    const [tabsFit, setTabsFit] = React.useState(true);

    // Check if we're in subtabs mode (Chrome-style tab groups)
    const hasSubtabs = subtabs && Object.keys(subtabs).length > 0;

    // Extract tab items from children (deep walk to support fragments/wrappers)
    const tabItems = React.useMemo(() => {
      const extractedItems: TabItem[] = [];

      const isTriggerElement = (el: React.ReactElement) => {
        try {
          // Direct equality (fast path) or compare displayName as a fallback
          return (
            el.type === TabsTrigger ||
            (el.type &&
              (el.type as any).displayName === (TabsTrigger as any).displayName)
          );
        } catch {
          return false;
        }
      };

      const walk = (nodes: React.ReactNode) => {
        React.Children.forEach(nodes, (child) => {
          if (!React.isValidElement(child)) return;

          if (isTriggerElement(child as React.ReactElement)) {
            const props = (child as React.ReactElement).props as {
              value: string;
              children: React.ReactNode;
              disabled?: boolean;
            };
            const item: TabItem = {
              value: props.value,
              label: props.children,
            };
            if (props.disabled !== undefined) {
              item.disabled = props.disabled;
            }
            extractedItems.push(item);
            return;
          }

          const childChildren = (child as any).props?.children;
          if (childChildren) walk(childChildren);
        });
      };

      walk(children);
      return extractedItems;
    }, [children]);

    const [internalValue, setInternalValue] = React.useState('');

    const assignListRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        listRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const currentValue = value ?? internalValue;

    React.useEffect(() => {
      if (value !== undefined) {
        setInternalValue((prev) => (prev === value ? prev : value));
      }
    }, [value]);

    // For subtabs mode: determine which main tab is "active" (either itself or one of its subtabs is selected)
    const activeMainTab = React.useMemo(() => {
      if (!hasSubtabs) return null;

      Logger.debug('[TABS_DEBUG] Computing activeMainTab', {
        currentValue,
        subtabsKeys: Object.keys(subtabs),
        subtabsStructure: Object.fromEntries(
          Object.entries(subtabs).map(([key, subs]) => [
            key,
            subs.map((s) => s.value),
          ])
        ),
        mainTabValues: tabItems.map((t) => t.value),
      });

      // Check if current value is a main tab
      const mainTab = tabItems.find((item) => item.value === currentValue);
      if (mainTab) {
        Logger.debug('[TABS_DEBUG] currentValue is main tab', {
          currentValue,
          result: mainTab.value,
        });
        return mainTab.value;
      }
      // Check if current value is a subtab
      for (const mainKey of Object.keys(subtabs)) {
        const sub = subtabs[mainKey].find((s) => s.value === currentValue);
        if (sub) {
          Logger.debug('[TABS_DEBUG] currentValue is subtab', {
            currentValue,
            mainKey,
            subtabFound: sub.value,
          });
          return mainKey;
        }
      }
      Logger.debug('[TABS_DEBUG] currentValue not found, defaulting', {
        defaultValue: tabItems[0]?.value,
      });
      return tabItems[0]?.value ?? null;
    }, [hasSubtabs, tabItems, currentValue, subtabs]);

    // Update indicator position and track uncontrolled value
    React.useEffect(() => {
      if (!listRef.current) {
        return;
      }

      const updateFromActiveTab = () => {
        if (!listRef.current) return;

        let activeTab = listRef.current.querySelector(
          '[data-state="active"]'
        ) as HTMLElement | null;

        if (!activeTab) {
          if (!useDropdown) {
            setIndicatorStyle({ left: 0, width: 0 });
          }

          if (value === undefined) {
            setInternalValue((prev) => (prev === '' ? prev : ''));
          }

          return;
        }

        // If we have subtabs, and the active element is a subtab (no data-main-tab),
        // move the background indicator to the corresponding main tab element.
        if (hasSubtabs && activeTab.getAttribute('data-main-tab') !== 'true') {
          const mainKey = activeMainTab; // comes from outer memo
          if (mainKey) {
            const mainEl = listRef.current.querySelector<HTMLElement>(
              `[data-value="${CSS && CSS.escape ? CSS.escape(mainKey) : mainKey}"]`
            );
            if (mainEl) {
              activeTab = mainEl;
            }
          }
        }

        if (!useDropdown) {
          const listRect = listRef.current.getBoundingClientRect();
          const tabRect = activeTab.getBoundingClientRect();

          // If we have measured subtabs for the active group, tighten the indicator width
          // by removing the extra padding space we reserve for the subtab box so the
          // animated background matches the visible main label area.
          const reserved = activeSubtabsWidth ? activeSubtabsWidth + 2 : 0;
          setIndicatorStyle({
            left: tabRect.left - listRect.left,
            width: Math.max(tabRect.width - reserved, 0),
          });
        }

        const activeValue = activeTab.getAttribute('data-value') || '';

        if (value === undefined) {
          setInternalValue((prev) =>
            prev === activeValue ? prev : activeValue
          );
        }
      };

      updateFromActiveTab();

      const observer = new MutationObserver(updateFromActiveTab);
      observer.observe(listRef.current, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-state', 'data-value'],
      });

      // Also observe size changes so the indicator updates responsively without
      // causing layout thrash — use requestAnimationFrame to batch.
      let frameId: number | null = null;
      const ro = new ResizeObserver(() => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(updateFromActiveTab);
      });
      ro.observe(listRef.current);

      const onWindowResize = () => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(updateFromActiveTab);
      };
      window.addEventListener('resize', onWindowResize);

      return () => {
        observer.disconnect();
        ro.disconnect();
        window.removeEventListener('resize', onWindowResize);
      };
    }, [useDropdown, value, activeMainTab, hasSubtabs, activeSubtabsWidth]); // Removed tabItems.length to prevent re-renders

    // Check if tabs fit and switch to dropdown if needed
    React.useEffect(() => {
      const container = containerRef.current;
      const measurement = measurementRef.current;

      if (!container || !measurement) {
        return;
      }

      let frameId: number | null = null;

      const evaluateLayout = () => {
        // If fullWidth is false, the container naturally sizes to content,
        // so we should never use dropdown mode
        if (!fullWidth) {
          setUseDropdown(false);
          return;
        }

        // If caller explicitly disabled dropdown, respect it and keep tabs
        // in scrollable mode instead of converting to a dropdown.
        if (disableDropdown) {
          setUseDropdown(false);
          return;
        }

        const containerWidth = container.getBoundingClientRect().width;
        const tabsWidth = measurement.scrollWidth;

        if (!containerWidth || !tabsWidth) {
          return;
        }

        // Prefer switching to dropdown only when tabs overflow.
        // If the container is narrower than the configured breakpoint, only switch
        // when tabs are noticeably larger than available width to avoid toggling
        // to a dropdown prematurely on medium screens.
        const overflow = tabsWidth > containerWidth + 1;
        const constrainedSmall =
          containerWidth < _breakpoint && tabsWidth > containerWidth - 40;
        const shouldUseDropdown = overflow || constrainedSmall;

        // Compute whether tab items fit in the available container width.
        const fit = tabsWidth <= containerWidth + 1;
        setTabsFit((prev) => (prev === fit ? prev : fit));

        setUseDropdown((prev) =>
          prev === shouldUseDropdown ? prev : shouldUseDropdown
        );
      };

      const scheduleEvaluation = () => {
        if (frameId) {
          cancelAnimationFrame(frameId);
        }

        frameId = requestAnimationFrame(evaluateLayout);
      };

      // Initial evaluation
      scheduleEvaluation();

      const resizeObserver = new ResizeObserver(scheduleEvaluation);
      resizeObserver.observe(container);
      resizeObserver.observe(measurement);

      // Also re-measure the active subtab container when layout changes
      const subtabSizer = new ResizeObserver(() => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(() => {
          const mainKey = activeMainTab;
          if (!listRef.current || !mainKey) return;
          const escapeValue =
            typeof CSS !== 'undefined' && CSS.escape
              ? CSS.escape
              : (v: string) => v.replace(/"/g, '\\"');
          const subEl = listRef.current.querySelector<HTMLElement>(
            `[data-value="${escapeValue(mainKey)}"] [data-subtab-container="${mainKey}"]`
          );
          if (subEl)
            setActiveSubtabsWidth(subEl.getBoundingClientRect().width || 0);
          else setActiveSubtabsWidth(0);
        });
      });
      if (subtabContainerRef.current)
        subtabSizer.observe(subtabContainerRef.current);

      window.addEventListener('resize', scheduleEvaluation);

      return () => {
        if (frameId) {
          cancelAnimationFrame(frameId);
        }
        resizeObserver.disconnect();
        subtabSizer.disconnect();
        window.removeEventListener('resize', scheduleEvaluation);
      };
    }, [activeMainTab, fullWidth, _breakpoint, disableDropdown]); // Re-run when active group changes so measurements update

    // Find current tab label
    const currentTabLabel = React.useMemo(() => {
      // For subtabs mode, also check subtab labels
      if (hasSubtabs) {
        // First check main tabs
        const mainTab = tabItems.find((item) => item.value === currentValue);
        if (mainTab) return mainTab.label;
        // Then check subtabs
        for (const mainKey of Object.keys(subtabs)) {
          const sub = subtabs[mainKey].find((s) => s.value === currentValue);
          if (sub) return sub.label;
        }
      }
      return tabItems.find((item) => item.value === currentValue)?.label;
    }, [tabItems, currentValue, hasSubtabs, subtabs]);

    const handleDropdownChange = (newValue: string) => {
      // First, call the parent's onValueChange if provided
      if (onValueChange) {
        onValueChange(newValue);
      }

      if (value === undefined) {
        setInternalValue((prev) => (prev === newValue ? prev : newValue));
      }

      // Focus the corresponding hidden tab trigger so Radix updates active state
      const focusHiddenTrigger = () => {
        if (!listRef.current) return;

        const escapeValue =
          typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape
            : (value: string) => value.replace(/"/g, '\\"');

        const targetTab = listRef.current.querySelector<HTMLElement>(
          `[data-value="${escapeValue(newValue)}"]`
        );

        targetTab?.focus({ preventScroll: true });
      };

      requestAnimationFrame(focusHiddenTrigger);
    };

    const baseDefault =
      'relative inline-flex h-11 items-center justify-center rounded-lg bg-inner-container p-1.5 text-muted-foreground';

    const baseOutlined =
      'relative inline-flex h-11 items-center justify-start bg-transparent p-0 text-muted-foreground border-b-2 border-border overflow-visible mb-sm';

    const listBaseClass = variant === 'outlined' ? baseOutlined : baseDefault;

    // Chrome-style subtab classes: selected tab has primary top border, unselected have transparent top
    const subtabTriggerClasses =
      'relative inline-flex items-center justify-center whitespace-nowrap px-2 py-0.5 text-xs font-semibold transition-all duration-200 text-muted-foreground hover:text-foreground/80 rounded-full border border-transparent data-[state=active]:bg-primary/10 data-[state=active]:text-foreground data-[state=active]:border-primary';

    // Render Chrome-style tab groups if subtabs are provided
    if (hasSubtabs && !useDropdown) {
      return (
        <TabsLayoutContext.Provider
          value={{ fullWidth, disableDropdown, tabsFit }}
        >
          <div
            ref={containerRef}
            className={cn(
              'relative flex items-center gap-2',
              fullWidth && 'w-full'
            )}
          >
            {/* Single Radix list containing both main tabs and subtabs so roving focus works */}
            <TabsPrimitive.List
              ref={assignListRef}
              className={cn(
                'relative inline-flex h-11 items-center rounded-lg bg-inner-container p-1.5 text-muted-foreground w-full',
                // When dropdown is disabled, allow horizontal scrolling and prevent wrapping
                disableDropdown && 'overflow-x-auto whitespace-nowrap',
                className
              )}
              style={
                disableDropdown
                  ? { WebkitOverflowScrolling: 'touch' }
                  : undefined
              }
              {...props}
            >
              {/* Animated background indicator for main tabs */}
              {variant !== 'outlined' && (
                <div
                  className="absolute h-[calc(100%-8px)] rounded-md bg-background transition-all duration-300 ease-out"
                  style={{
                    left: `${indicatorStyle.left}px`,
                    width: `${indicatorStyle.width}px`,
                    transform: 'translateX(0)',
                  }}
                />
              )}

              {/* Main tabs (left) with inline subtabs adjacent to each main tab */}
              <div className="inline-flex items-center gap-3">
                {tabItems.map((item) => {
                  const hasSubtabsForThis =
                    subtabs[item.value] && subtabs[item.value].length > 0;
                  const isActiveGroup = activeMainTab === item.value;

                  // Determine growth/shrink behavior for main tab triggers (same rules as TabsTrigger)
                  const mainShouldGrow =
                    fullWidth &&
                    (!disableDropdown || (disableDropdown && tabsFit));
                  const mainPreventShrink = disableDropdown && !tabsFit;

                  return (
                    <div
                      key={item.value}
                      className={cn('inline-flex items-center gap-1 relative')}
                    >
                      <TabsPrimitive.Trigger
                        value={item.value}
                        data-value={item.value}
                        data-main-tab="true"
                        disabled={item.disabled}
                        style={
                          hasSubtabsForThis && isActiveGroup
                            ? { paddingRight: `${activeSubtabsWidth + 2}px` }
                            : undefined
                        }
                        className={cn(
                          'relative inline-flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 z-10 overflow-visible',
                          // When we should grow, allow expansion but keep at least intrinsic width
                          mainShouldGrow && 'flex-1 min-w-max',
                          // When overflowing and dropdown is disabled, prevent shrinking so items keep intrinsic size
                          mainPreventShrink && 'shrink-0',
                          // Fallback min width when not growing
                          !mainShouldGrow && 'min-w-0',
                          isActiveGroup
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground/80'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex items-center gap-2',
                              // Keep intrinsic label width when dropdown is disabled so it isn't compressed
                              disableDropdown ? 'min-w-max' : 'min-w-0'
                            )}
                          >
                            <span
                              className={cn(
                                'truncate',
                                // Allow label to use its intrinsic width instead of a small max width
                                disableDropdown ? 'max-w-max' : 'max-w-48'
                              )}
                            >
                              {item.label}
                            </span>
                          </span>

                          {/* Subtabs rendered inside a rounded bg-card box within the main tab */}
                          {hasSubtabsForThis && isActiveGroup && (
                            <div
                              ref={subtabContainerRef}
                              data-subtab-container={item.value}
                              className="inline-flex items-center gap-1 bg-card rounded-md px-1 py-1"
                            >
                              {subtabs[item.value].map((sub) => (
                                <TabsPrimitive.Trigger
                                  key={sub.value}
                                  value={sub.value}
                                  data-value={sub.value}
                                  disabled={sub.disabled}
                                  className={cn(
                                    subtabTriggerClasses,
                                    'text-xs px-2 py-0.5 rounded-full h-6 leading-none min-w-7'
                                  )}
                                >
                                  {sub.label}
                                </TabsPrimitive.Trigger>
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsPrimitive.Trigger>
                    </div>
                  );
                })}
              </div>
            </TabsPrimitive.List>
          </div>
        </TabsLayoutContext.Provider>
      );
    }

    return (
      <TabsLayoutContext.Provider
        value={{ fullWidth, disableDropdown, tabsFit }}
      >
        <div
          ref={containerRef}
          className={`${fullWidth ? 'w-full ' : ''}relative`}
        >
          {/* Hidden measurement track to determine when tabs overflow */}
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] top-0 h-0 overflow-visible"
          >
            <div
              ref={measurementRef}
              className="inline-flex h-11 items-center rounded-lg bg-inner-container p-1.5 text-muted-foreground"
            >
              {tabItems.map((item) => (
                <div
                  key={item.value}
                  className="relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {useDropdown ? (
            /* Mobile Dropdown */
            <Select value={currentValue} onValueChange={handleDropdownChange}>
              <SelectTrigger className="w-full h-11">
                {currentTabLabel ? (
                  <span className="text-sm font-medium">{currentTabLabel}</span>
                ) : (
                  <SelectValue />
                )}
              </SelectTrigger>
              <SelectContent>
                {hasSubtabs ? (
                  // Render grouped items for subtabs mode
                  <>
                    {tabItems.map((item, index) => (
                      <SelectGroup key={item.value}>
                        <SelectItem
                          value={item.value}
                          {...(item.disabled !== undefined && {
                            disabled: item.disabled,
                          })}
                          className="font-semibold"
                        >
                          {item.label}
                        </SelectItem>

                        {subtabs[item.value]?.map((sub) => (
                          <SelectItem
                            key={sub.value}
                            value={sub.value}
                            {...(sub.disabled !== undefined && {
                              disabled: sub.disabled,
                            })}
                            className="pl-6 text-sm text-muted-foreground"
                          >
                            {sub.label}
                          </SelectItem>
                        ))}

                        {index !== tabItems.length - 1 && <SelectSeparator />}
                      </SelectGroup>
                    ))}
                  </>
                ) : (
                  // Render flat list for regular tabs
                  tabItems.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      {...(item.disabled !== undefined && {
                        disabled: item.disabled,
                      })}
                    >
                      {item.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          ) : (
            /* Desktop Tabs */
            <TabsPrimitive.List
              ref={assignListRef}
              className={cn(
                `${fullWidth ? 'w-full ' : ''}${listBaseClass}`,
                // Allow horizontal scrolling instead of dropdown when explicitly requested
                disableDropdown && 'overflow-x-auto whitespace-nowrap',
                className
              )}
              style={
                disableDropdown
                  ? { WebkitOverflowScrolling: 'touch' }
                  : undefined
              }
              {...props}
            >
              {/* Animated background indicator (hidden for outlined variant) */}
              {variant !== 'outlined' && (
                <div
                  className="absolute h-[calc(100%-8px)] rounded-md bg-background transition-all duration-300 ease-out"
                  style={{
                    left: `${indicatorStyle.left}px`,
                    width: `${indicatorStyle.width}px`,
                    transform: 'translateX(0)',
                  }}
                />
              )}
              {children}
            </TabsPrimitive.List>
          )}

          {/* Hidden tabs list for state management when in dropdown mode */}
          {useDropdown && (
            <TabsPrimitive.List
              ref={assignListRef}
              className="sr-only"
              {...props}
            >
              {children}
              {/* Also render hidden subtab triggers for state management */}
              {hasSubtabs &&
                Object.entries(subtabs).flatMap(([, subs]) =>
                  subs.map((sub) => (
                    <TabsPrimitive.Trigger
                      key={sub.value}
                      value={sub.value}
                      data-value={sub.value}
                      disabled={sub.disabled}
                    >
                      {sub.label}
                    </TabsPrimitive.Trigger>
                  ))
                )}
            </TabsPrimitive.List>
          )}
        </div>
      </TabsLayoutContext.Provider>
    );
  }
);
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.Trigger
> & { variant?: 'default' | 'outlined' };

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, value, variant = 'default', ...props }, ref) => {
  const layoutContext = React.useContext(TabsLayoutContext);
  const tabsFit = layoutContext?.tabsFit ?? true;
  // Grow to fill if fullWidth AND either dropdown is enabled, or when dropdown is
  // disabled but the tab items fit in the available container width.
  const shouldGrow =
    (layoutContext?.fullWidth ?? false) &&
    (!layoutContext?.disableDropdown ||
      (layoutContext?.disableDropdown && tabsFit));
  // Prevent shrinking when dropdown is disabled and the tabs are overflowing.
  const preventShrink = (layoutContext?.disableDropdown ?? false) && !tabsFit;

  const outlinedClasses =
    'relative px-4 py-3 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 border-b-2 border-transparent min-h-[48px] data-[state=active]:text-primary data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 z-20 rounded-md ';

  const defaultClasses =
    'relative inline-flex items-center justify-center text-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 z-10 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground/80';

  const classes = cn(
    variant === 'outlined' ? outlinedClasses : defaultClasses,
    // When we grow to fill available space, ensure we don't compress label
    // content by using `min-w-max` so triggers keep at least their intrinsic
    // width and only expand when there's extra space.
    shouldGrow && 'flex-1 min-w-max',
    preventShrink && 'shrink-0',
    className,
    // Force center alignment so callsite classes like `justify-start` don't
    // accidentally left-align the content. Use the important variant to ensure
    // it wins over caller-supplied utilities.
    '!justify-center !text-center'
  );

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      data-value={value}
      className={classes}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };

// Simple component to clear all tab_* params on route change.
// Uses useLayoutEffect to clean BEFORE paint, preventing flash of stale params.
export const TabParamsCleaner: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const prevPathnameRef = React.useRef(location.pathname);

  React.useLayoutEffect(() => {
    // Only clear on pathname change, not on initial mount or search param changes
    if (prevPathnameRef.current !== location.pathname) {
      prevPathnameRef.current = location.pathname;

      const tabKeys = Array.from(searchParams.keys()).filter((k) =>
        /^tab($|_)/.test(k)
      );
      if (tabKeys.length > 0) {
        const next = new URLSearchParams(searchParams.toString());
        tabKeys.forEach((k) => next.delete(k));
        setSearchParams(next, { replace: true });
      }
    }
  }, [location.pathname, searchParams, setSearchParams]);

  return null;
};
