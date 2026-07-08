import { useRenderLoopTripwire } from '@/hooks/useRenderLoopTripwire'
import { cn } from '@/lib/utils'
import { MoreVertical } from 'lucide-react'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'

/**
 * ARCHITECTURE (rewrite, 2026-07)
 * ================================
 * The previous implementation kept four re-render sources in React state
 * (container width, measurements, compactedIds, overflowedIds) coupled through
 * effects keyed on prop *identities*. Parents that recreate `buttons` /
 * `overflowMenuItems` arrays each render (live data ticks, resizable-panel
 * width tracking) made every parent render re-run measurement + layout math +
 * parent callbacks — the render storms and React #185 loops captured by the
 * tripwire in production.
 *
 * This version keeps the same public API and the same greedy fitting
 * algorithm, but restructures the dataflow so the loop CLASS is impossible:
 *
 * 1. ONE state atom: the committed layout result ({compacted, overflowed}).
 *    Container width and measurements never enter React state — they are read
 *    from the DOM inside `recompute()` and used immediately.
 *
 * 2. `recompute()` is a single, referentially-stable, idempotent function:
 *    measure → decide (pure function) → commit iff result changed (set
 *    equality) → notify parent iff value changed (last-sent refs). It reads
 *    current props through a latest-value ref, so it never needs to be
 *    re-created and nothing depends on prop identities.
 *
 * 3. Exactly two triggers run it:
 *      - a layout effect keyed on a *content* signature of the button set
 *        (ids/priorities/flags — NOT array identity), and
 *      - one ResizeObserver over the container + hidden measurement nodes
 *        (catches container resizes, label changes like "Save" → "Saving…",
 *        late font swaps).
 *    A parent re-render with fresh-but-equivalent props triggers NEITHER.
 *    Dragging a resizable panel re-renders this component only when a button
 *    actually crosses a compact/overflow threshold — not once per pixel.
 *
 * 4. Parent notifications (`onCompactStateChange`, `onOverflowStateChange`,
 *    `onLayoutMetrics`) fire from `recompute()` — outside render, only on
 *    value change. The old wiring re-fired them per parent render, which is
 *    what closed the feedback loop through the data-table toolbar's setState.
 *
 * Loop analysis: parent render → (no effects fire) → done. Resize → recompute
 * → possibly one commit → re-render → signature unchanged → done. Callback →
 * parent setState → parent render → fresh arrays → (no effects fire) → done.
 * There is no path from a render of this component back into recompute()
 * without an actual DOM size change or button-set change.
 */

export interface ResponsiveButtonRenderProps {
  /** Whether the button is currently in compact mode */
  isCompact: boolean
}

export interface ResponsiveButtonConfig {
  /** Unique identifier for the button */
  id: string
  /**
   * Priority for compacting (lower priority number = compacts first).
   * Buttons with lower priority will become icon-only first when space is limited.
   * Higher priority buttons (higher numbers) compact last.
   */
  priority: number
  /**
   * The full (expanded) button content - shown when there's enough space.
   * Can be a ReactNode or a render function receiving compact state.
   */
  fullContent:
    | React.ReactNode
    | ((props: ResponsiveButtonRenderProps) => React.ReactNode)
  /**
   * The compact (icon-only) button content - shown when space is limited.
   * Can be a ReactNode or a render function receiving compact state.
   */
  compactContent:
    | React.ReactNode
    | ((props: ResponsiveButtonRenderProps) => React.ReactNode)
  /**
   * Whether this button should always stay in full mode (never compact).
   * @default false
   */
  alwaysFull?: boolean
  /**
   * Whether this button should always stay in compact mode.
   * @default false
   */
  alwaysCompact?: boolean
  /**
   * Additional className to apply to this button's wrapper.
   */
  className?: string
  /**
   * Additional className to apply when this button is compacted.
   */
  compactClassName?: string
  /**
   * Whether this button is visible/rendered.
   * @default true
   */
  visible?: boolean
  /**
   * Label to show in the overflow menu when this button is moved there.
   * Required for buttons that can overflow into the menu.
   */
  menuLabel?: ReactNode
  /**
   * Icon to show in the overflow menu when this button is moved there.
   */
  menuIcon?: ComponentType<{ className?: string }>
  /**
   * Callback when the button is clicked from the overflow menu.
   * If not provided, the button won't be actionable from the menu.
   */
  onMenuClick?: () => void
  /**
   * Whether this button is disabled (applies in menu too).
   * @default false
   */
  disabled?: boolean
  /**
   * If true, this button can never be moved to the overflow menu.
   * @default false
   */
  neverOverflow?: boolean
  /**
   * If true, this button can be hidden from view when space is constrained,
   * even if it doesn't have menuLabel/onMenuClick (won't appear in overflow menu).
   * Useful for custom buttons that should disappear under extreme constraints.
   * @default false
   */
  canHide?: boolean
}

/**
 * Menu item types for the overflow menu - compatible with PanelMenuConfig
 */
export type OverflowMenuItem =
  | {
      type?: 'item'
      label: ReactNode
      onSelect: () => void
      icon?: ComponentType<{ className?: string }>
      disabled?: boolean
      shortcut?: string
      id?: string
    }
  | {
      type: 'checkbox'
      label: ReactNode
      checked: boolean
      onCheckedChange: (checked: boolean) => void
      onSelect?: () => void
      icon?: ComponentType<{ className?: string }>
      disabled?: boolean
      id?: string
    }
  | {
      type: 'separator'
      id?: string
    }

export interface ResponsiveButtonRowProps {
  /** Array of button configurations */
  buttons: ResponsiveButtonConfig[]
  /** Gap between buttons in pixels or CSS value */
  gap?: number | string
  /** Additional className for the container */
  className?: string
  /**
   * Horizontal alignment of buttons.
   * @default 'left'
   */
  alignment?: 'left' | 'center' | 'right'
  /**
   * Minimum buffer space to maintain (in pixels).
   * Helps prevent layout thrashing at the edge.
   * @default 4
   */
  buffer?: number
  /**
   * If true, all buttons will be compacted together rather than progressively.
   * @default false
   */
  compactAllTogether?: boolean
  /** When container width falls below this threshold (px), compact everything possible */
  compactThreshold?: number
  /**
   * If true, the button with highest priority (highest number) will be full width.
   * @default false
   */
  highestPriorityFullWidth?: boolean
  /**
   * Callback when compact state changes for any button.
   */
  onCompactStateChange?: (compactedIds: Set<string>) => void
  /**
   * Enable the overflow menu. When enabled, buttons that don't fit even when compacted
   * will be moved to a 3-dot menu on the right side.
   * @default false
   */
  enableOverflowMenu?: boolean
  /**
   * Custom menu items to always show in the overflow menu.
   * These items appear above any overflowed buttons.
   */
  overflowMenuItems?: OverflowMenuItem[]
  /**
   * Additional className for the overflow menu trigger button.
   */
  overflowMenuTriggerClassName?: string
  /**
   * Aria label for the overflow menu trigger.
   * @default 'More options'
   */
  overflowMenuAriaLabel?: string
  /**
   * Additional className for the overflow menu content.
   */
  overflowMenuContentClassName?: string
  /**
   * Callback when overflow state changes (buttons moved to/from menu).
   */
  onOverflowStateChange?: (overflowedIds: Set<string>) => void
  /**
   * Callback fired with layout metrics derived from the current button set.
   * Lets parents make space decisions of their own (e.g. "do I have room for
   * an inline search?") without hard-coding a width threshold.
   */
  onLayoutMetrics?: (metrics: ResponsiveButtonRowMetrics) => void
}

/**
 * Layout metrics published by ResponsiveButtonRow via {@link ResponsiveButtonRowProps.onLayoutMetrics}.
 */
export interface ResponsiveButtonRowMetrics {
  /** Width (px) the row needs to render every visible button at full size, plus gaps and the overflow menu trigger (when it would be shown for custom items). */
  requiredFullWidth: number
  /** Width (px) the row would need if every button were in its compact form. */
  requiredCompactWidth: number
  /**
   * Width (px) needed to render every *retained* button at full size, assuming
   * any hidable button whose compact form would not save space (and is therefore
   * a removal candidate, like a wide caller-provided action wrapper) has been
   * moved to the overflow menu. Parents can use this to size sibling content
   * (e.g. an adjacent search input) realistically: when toolbar width is tight,
   * those bulky buttons overflow first, so the space they take in `requiredFullWidth`
   * is misleading.
   */
  requiredFullWidthExcludingIncompressibles: number
}

const ALIGNMENT_CLASSES = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const

// ---------------------------------------------------------------------------
// Pure layout math. No DOM, no React — given measured widths and config,
// produce the compact/overflow decision. Same greedy algorithm as the
// original implementation; only the orchestration around it changed.
// ---------------------------------------------------------------------------

interface LayoutMathInput {
  /** Visible buttons in display order (priority ascending). */
  buttons: readonly ResponsiveButtonConfig[]
  fullWidths: ReadonlyMap<string, number>
  compactWidths: ReadonlyMap<string, number>
  menuButtonWidth: number
  containerWidth: number
  gapValue: number
  buffer: number
  compactAllTogether: boolean
  compactThreshold: number | undefined
  enableOverflowMenu: boolean
  hasCustomMenuItems: boolean
}

function decideLayout({
  buttons,
  fullWidths,
  compactWidths,
  menuButtonWidth,
  containerWidth,
  gapValue,
  buffer,
  compactAllTogether,
  compactThreshold,
  enableOverflowMenu,
  hasCustomMenuItems,
}: LayoutMathInput): { compacted: Set<string>; overflowed: Set<string> } {
  const compacted = new Set<string>()
  const overflowed = new Set<string>()

  if (!containerWidth || fullWidths.size === 0) {
    return { compacted, overflowed }
  }

  for (const b of buttons) {
    if (b.alwaysCompact) compacted.add(b.id)
  }

  // Compaction/overflow candidates in priority order (lowest first).
  const candidates = buttons.filter((b) => !b.alwaysFull && !b.alwaysCompact)
  const hidable = candidates.filter(
    (b) => !b.neverOverflow && (b.canHide || (b.menuLabel && b.onMenuClick)),
  )

  const widthOf = () => {
    let width = 0
    let count = 0
    for (const b of buttons) {
      if (overflowed.has(b.id)) continue
      count++
      if (b.alwaysFull) {
        width += fullWidths.get(b.id) ?? 0
      } else if (compacted.has(b.id)) {
        width += compactWidths.get(b.id) ?? 0
      } else {
        width += fullWidths.get(b.id) ?? 0
      }
    }
    if (count > 1) width += (count - 1) * gapValue
    return width
  }

  // Widths are rounded to integer px at measure time; the container width is
  // floored. A small tolerance keeps rounding noise from triggering collapse.
  const FIT_TOLERANCE = 2

  // Menu button space: only reserved when the menu will actually be visible.
  // - If there are custom menu items, the menu is always rendered → reserve.
  // - Otherwise the menu only appears when a button actually overflows → don't
  //   reserve preemptively; the overflow probe below adds it back.
  const reservedMenuSpace =
    enableOverflowMenu && hasCustomMenuItems ? menuButtonWidth + gapValue : 0
  const availableWidth = containerWidth - buffer - reservedMenuSpace

  // If compactThreshold is provided and we're under it, compact everything possible.
  if (
    typeof compactThreshold === 'number' &&
    containerWidth <= compactThreshold
  ) {
    for (const b of buttons) {
      if (!b.alwaysFull) compacted.add(b.id)
    }
  }

  const overflowMenuReserve =
    enableOverflowMenu && !hasCustomMenuItems ? menuButtonWidth + gapValue : 0
  const availableWithMenu = availableWidth - overflowMenuReserve

  let currentWidth = widthOf()

  // Everything fits at full size (within tolerance).
  if (currentWidth <= availableWidth + FIT_TOLERANCE) {
    return { compacted, overflowed }
  }

  if (compactAllTogether) {
    for (const b of candidates) compacted.add(b.id)
    currentWidth = widthOf()
  } else {
    // Progressive compacting: drop labels one button at a time, lowest
    // priority first. Removal (overflow) only happens below, once compaction
    // has done all it can.
    for (const b of candidates) {
      if (currentWidth <= availableWidth + FIT_TOLERANCE) break
      if (compacted.has(b.id)) continue
      compacted.add(b.id)
      currentWidth = widthOf()
    }
  }

  // Still doesn't fit: greedy lowest-priority-first overflow into the menu.
  if (
    enableOverflowMenu &&
    currentWidth > availableWithMenu + FIT_TOLERANCE &&
    hidable.length > 0
  ) {
    for (const b of hidable) {
      if (currentWidth <= availableWithMenu + FIT_TOLERANCE) break
      overflowed.add(b.id)
      currentWidth = widthOf()
    }
  }

  return { compacted, overflowed }
}

function computeMetrics({
  buttons,
  fullWidths,
  compactWidths,
  menuButtonWidth,
  gapValue,
  enableOverflowMenu,
  hasCustomMenuItems,
}: Omit<
  LayoutMathInput,
  'containerWidth' | 'buffer' | 'compactAllTogether' | 'compactThreshold'
>): ResponsiveButtonRowMetrics {
  const COMPACT_SAVINGS_EPSILON = 4
  let fullWidth = 0
  let compactWidth = 0
  let count = 0
  // "Excluding incompressibles" pass: drop hidable buttons whose compact form
  // doesn't save space — those overflow first when the row is tight, so a
  // parent sizing a sibling should not budget for them.
  let fullWidthMinimal = 0
  let minimalCount = 0

  for (const button of buttons) {
    const f = fullWidths.get(button.id)
    const c = compactWidths.get(button.id)
    const includeInMinimal = (() => {
      if (button.alwaysFull) return true
      if (button.neverOverflow) return true
      const hidable = button.canHide || (button.menuLabel && button.onMenuClick)
      if (!hidable) return true
      if (f == null || c == null) return true
      // Incompressible hidable button: omit from minimal.
      return f - c > COMPACT_SAVINGS_EPSILON
    })()
    if (button.alwaysCompact) {
      if (c != null) {
        compactWidth += c
        fullWidth += c
        count += 1
        if (includeInMinimal) {
          fullWidthMinimal += c
          minimalCount += 1
        }
      }
    } else {
      if (f != null) {
        fullWidth += f
        count += 1
        if (includeInMinimal) {
          fullWidthMinimal += f
          minimalCount += 1
        }
      }
      if (c != null) {
        compactWidth += c
      }
    }
  }

  const menuReserve =
    enableOverflowMenu && hasCustomMenuItems && menuButtonWidth > 0
      ? menuButtonWidth + gapValue
      : 0
  if (count > 1) {
    const gapsTotal = (count - 1) * gapValue
    fullWidth += gapsTotal
    compactWidth += gapsTotal
  }
  if (minimalCount > 1) {
    fullWidthMinimal += (minimalCount - 1) * gapValue
  }

  return {
    requiredFullWidth: fullWidth + menuReserve,
    requiredCompactWidth: compactWidth + menuReserve,
    requiredFullWidthExcludingIncompressibles: fullWidthMinimal + menuReserve,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_SET: ReadonlySet<string> = new Set()

interface CommittedLayout {
  compacted: ReadonlySet<string>
  overflowed: ReadonlySet<string>
  /** Sorted-joined keys so equality checks are single string compares. */
  compactedKey: string
  overflowedKey: string
}

const INITIAL_LAYOUT: CommittedLayout = {
  compacted: EMPTY_SET,
  overflowed: EMPTY_SET,
  compactedKey: '',
  overflowedKey: '',
}

const setKey = (s: ReadonlySet<string>) => [...s].sort().join('')

export const ResponsiveButtonRow: React.FC<ResponsiveButtonRowProps> =
  React.memo(
    ({
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
      // Render-loop tripwire (additive, non-fatal). Kept from the previous
      // implementation: it is the production signal that verifies this
      // rewrite. If it still fires, renders are being driven from ABOVE
      // (parent churn) — this component no longer does any per-render effect
      // work, so a report now localizes the problem to the call site.
      // Kill via localStorage['gainium:tripwire']='off'.
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
      })

      // ---- render-scoped derivations (cheap; no state, no effects) ----
      const visibleButtons = useMemo(
        () => buttons.filter((b) => b.visible !== false),
        [buttons],
      )

      // Display order = priority ascending (lowest priority leftmost).
      const sortedForDisplay = useMemo(
        () => [...visibleButtons].sort((a, b) => a.priority - b.priority),
        [visibleButtons],
      )

      const gapValue = typeof gap === 'number' ? gap : parseInt(gap, 10) || 8
      const hasCustomMenuItems = overflowMenuItems.length > 0

      // Content signature of everything the layout ALGORITHM depends on.
      // Deliberately identity-free: a parent recreating equivalent arrays
      // produces the same string, so no layout work happens. Callback
      // PRESENCE is included so a callback appearing late still gets its
      // initial notification; callback identity is not.
      const layoutSignature = useMemo(() => {
        const perButton = sortedForDisplay
          .map((b) =>
            [
              b.id,
              b.priority,
              b.alwaysFull ? 1 : 0,
              b.alwaysCompact ? 1 : 0,
              b.neverOverflow ? 1 : 0,
              b.canHide ? 1 : 0,
              b.menuLabel && b.onMenuClick ? 1 : 0,
            ].join(','),
          )
          .join(';')
        return [
          perButton,
          gapValue,
          buffer,
          compactAllTogether ? 1 : 0,
          compactThreshold ?? 'n',
          enableOverflowMenu ? 1 : 0,
          hasCustomMenuItems ? 1 : 0,
          onCompactStateChange ? 1 : 0,
          onOverflowStateChange ? 1 : 0,
          onLayoutMetrics ? 1 : 0,
        ].join('#')
      }, [
        sortedForDisplay,
        gapValue,
        buffer,
        compactAllTogether,
        compactThreshold,
        enableOverflowMenu,
        hasCustomMenuItems,
        onCompactStateChange,
        onOverflowStateChange,
        onLayoutMetrics,
      ])

      // ---- the single state atom ----
      const [layout, setLayout] = useState<CommittedLayout>(INITIAL_LAYOUT)

      // ---- DOM refs ----
      const containerRef = useRef<HTMLDivElement>(null)
      const measureFullRef = useRef<HTMLDivElement>(null)
      const measureCompactRef = useRef<HTMLDivElement>(null)
      const measureMenuRef = useRef<HTMLDivElement>(null)

      // Latest-value ref: recompute() reads through this so it can stay
      // referentially stable forever. Updated every render (standard
      // latest-ref pattern, same as the old sortedForDisplayRef).
      const latestRef = useRef({
        sortedForDisplay,
        gapValue,
        buffer,
        compactAllTogether,
        compactThreshold,
        enableOverflowMenu,
        hasCustomMenuItems,
        onCompactStateChange,
        onOverflowStateChange,
        onLayoutMetrics,
      })
      latestRef.current = {
        sortedForDisplay,
        gapValue,
        buffer,
        compactAllTogether,
        compactThreshold,
        enableOverflowMenu,
        hasCustomMenuItems,
        onCompactStateChange,
        onOverflowStateChange,
        onLayoutMetrics,
      }

      // Last values actually delivered to the parent. `null` = never sent
      // (or callback currently absent), so a (re)appearing callback receives
      // one initial notification.
      const notifiedRef = useRef<{
        compactedKey: string | null
        overflowedKey: string | null
        metricsKey: string | null
      }>({ compactedKey: null, overflowedKey: null, metricsKey: null })

      /**
       * Measure → decide → commit-iff-changed → notify-iff-changed.
       * Idempotent: same DOM sizes + same button set ⇒ no setState, no
       * callbacks. Never called during render; only from the two triggers
       * below. getBoundingClientRect here is cheap in the ResizeObserver
       * path (layout is already clean) and a single forced reflow in the
       * signature-change path.
       */
      const recompute = useCallback(() => {
        const cfg = latestRef.current
        const container = containerRef.current
        const fullHost = measureFullRef.current
        const compactHost = measureCompactRef.current
        if (!container || !fullHost || !compactHost) return

        // Round to integer px: getBoundingClientRect returns sub-pixel floats
        // that jitter between otherwise-identical layouts (DPR, zoom, font
        // metrics). Integer footing keeps the idempotence guarantee real.
        const fullWidths = new Map<string, number>()
        const compactWidths = new Map<string, number>()
        const fullChildren = fullHost.children
        const compactChildren = compactHost.children
        cfg.sortedForDisplay.forEach((button, index) => {
          const fullEl = fullChildren[index] as HTMLElement | undefined
          const compactEl = compactChildren[index] as HTMLElement | undefined
          if (fullEl) {
            fullWidths.set(
              button.id,
              Math.round(fullEl.getBoundingClientRect().width),
            )
          }
          if (compactEl) {
            compactWidths.set(
              button.id,
              Math.round(compactEl.getBoundingClientRect().width),
            )
          }
        })
        const menuButtonWidth = measureMenuRef.current
          ? Math.round(measureMenuRef.current.getBoundingClientRect().width)
          : 0
        const containerWidth = Math.floor(
          container.getBoundingClientRect().width,
        )

        const { compacted, overflowed } = decideLayout({
          buttons: cfg.sortedForDisplay,
          fullWidths,
          compactWidths,
          menuButtonWidth,
          containerWidth,
          gapValue: cfg.gapValue,
          buffer: cfg.buffer,
          compactAllTogether: cfg.compactAllTogether,
          compactThreshold: cfg.compactThreshold,
          enableOverflowMenu: cfg.enableOverflowMenu,
          hasCustomMenuItems: cfg.hasCustomMenuItems,
        })

        const compactedKey = setKey(compacted)
        const overflowedKey = setKey(overflowed)

        // Commit only when the RESULT changed. This is the only setState in
        // the component; bailing here is what makes per-pixel panel drags
        // render-free until a threshold is actually crossed.
        setLayout((prev) =>
          prev.compactedKey === compactedKey &&
          prev.overflowedKey === overflowedKey
            ? prev
            : { compacted, overflowed, compactedKey, overflowedKey },
        )

        // Parent notifications: only on value change, latest callback, and
        // never re-fired just because a parent render minted new callback
        // identities.
        const sent = notifiedRef.current
        if (cfg.onCompactStateChange) {
          if (sent.compactedKey !== compactedKey) {
            sent.compactedKey = compactedKey
            cfg.onCompactStateChange(new Set(compacted))
          }
        } else {
          sent.compactedKey = null
        }
        if (cfg.onOverflowStateChange) {
          if (sent.overflowedKey !== overflowedKey) {
            sent.overflowedKey = overflowedKey
            cfg.onOverflowStateChange(new Set(overflowed))
          }
        } else {
          sent.overflowedKey = null
        }
        if (cfg.onLayoutMetrics) {
          const metrics = computeMetrics({
            buttons: cfg.sortedForDisplay,
            fullWidths,
            compactWidths,
            menuButtonWidth,
            gapValue: cfg.gapValue,
            enableOverflowMenu: cfg.enableOverflowMenu,
            hasCustomMenuItems: cfg.hasCustomMenuItems,
          })
          const metricsKey = `${metrics.requiredFullWidth}/${metrics.requiredCompactWidth}/${metrics.requiredFullWidthExcludingIncompressibles}`
          if (sent.metricsKey !== metricsKey) {
            sent.metricsKey = metricsKey
            cfg.onLayoutMetrics(metrics)
          }
        } else {
          sent.metricsKey = null
        }
      }, [])

      // Trigger 1: mount + any change to the button SET or layout config.
      // useLayoutEffect so the first measured layout commits before paint
      // (no flash of an unmeasured row). Keyed on the content signature —
      // NOT array identity — so parent re-renders with equivalent props run
      // nothing.
      useLayoutEffect(() => {
        recompute()
      }, [recompute, layoutSignature])

      // Trigger 2: one observer for every size that can invalidate the
      // layout — the container (available width) and the hidden measurement
      // hosts (intrinsic widths: label changes, count badges, font swaps).
      // The measurement hosts render full + compact forms unconditionally,
      // off-screen, so their size never depends on the committed layout —
      // committing a result cannot re-trigger this observer with different
      // inputs, which is what makes the observe→recompute cycle settle.
      // The menu measurement node is rendered unconditionally (even when the
      // overflow menu is disabled) so the observed set is static for the
      // component's lifetime.
      useEffect(() => {
        const targets = [
          containerRef.current,
          measureFullRef.current,
          measureCompactRef.current,
          measureMenuRef.current,
        ].filter((el): el is HTMLDivElement => el !== null)
        if (targets.length === 0) return

        const observer = new ResizeObserver(() => recompute())
        targets.forEach((el) => observer.observe(el))
        return () => observer.disconnect()
      }, [recompute])

      // ---- render ----
      const gapStyle = typeof gap === 'number' ? `${gap}px` : gap

      // Find the highest priority button (highest number) for full-width mode.
      const highestPriorityId = useMemo(() => {
        if (!highestPriorityFullWidth || visibleButtons.length === 0)
          return null
        return visibleButtons.reduce((max, b) =>
          b.priority > max.priority ? b : max,
        ).id
      }, [visibleButtons, highestPriorityFullWidth])

      // Helper to render content (handles both ReactNode and render functions)
      const renderContent = (
        content:
          | React.ReactNode
          | ((props: ResponsiveButtonRenderProps) => React.ReactNode),
        isCompact: boolean,
      ): React.ReactNode => {
        if (typeof content === 'function') {
          return content({ isCompact })
        }
        return content
      }

      // Overflowed buttons that can be SHOWN in the menu. Buttons hidden via
      // `canHide` without menuLabel/onMenuClick are removed from view but get
      // no menu entry (the old code rendered them as empty, dead menu items).
      const overflowedMenuButtons = useMemo(
        () =>
          sortedForDisplay.filter(
            (b) =>
              layout.overflowed.has(b.id) && b.menuLabel && b.onMenuClick,
          ),
        [sortedForDisplay, layout.overflowed],
      )

      const showOverflowMenu =
        enableOverflowMenu &&
        (hasCustomMenuItems || overflowedMenuButtons.length > 0)

      const renderMenuItems = () => {
        const items: React.ReactNode[] = []

        overflowMenuItems.forEach((item, index) => {
          if (item.type === 'separator') {
            items.push(
              <DropdownMenuSeparator key={item.id ?? `separator-${index}`} />,
            )
          } else if (item.type === 'checkbox') {
            const Icon = item.icon
            items.push(
              <DropdownMenuCheckboxItem
                key={item.id ?? `checkbox-${index}`}
                checked={item.checked}
                onCheckedChange={item.onCheckedChange}
                className='rounded-lg'
                disabled={Boolean(item.disabled)}
              >
                <div className='flex items-center gap-2'>
                  {Icon ? (
                    <Icon className='h-4 w-4' aria-hidden='true' />
                  ) : null}
                  <span>{item.label}</span>
                </div>
              </DropdownMenuCheckboxItem>,
            )
          } else {
            const Icon = item.icon
            items.push(
              <DropdownMenuItem
                key={item.id ?? `item-${index}`}
                onSelect={item.onSelect}
                className='rounded-lg'
                disabled={Boolean(item.disabled)}
              >
                <div className='flex items-center gap-2'>
                  {Icon ? (
                    <Icon className='h-4 w-4' aria-hidden='true' />
                  ) : null}
                  <span>{item.label}</span>
                </div>
                {item.shortcut ? (
                  <span className='ml-auto text-xs tracking-wider text-muted-foreground/70'>
                    {item.shortcut}
                  </span>
                ) : null}
              </DropdownMenuItem>,
            )
          }
        })

        if (hasCustomMenuItems && overflowedMenuButtons.length > 0) {
          items.push(<DropdownMenuSeparator key='overflow-separator' />)
        }

        overflowedMenuButtons.forEach((button) => {
          const Icon = button.menuIcon
          items.push(
            <DropdownMenuItem
              key={`overflow-${button.id}`}
              onSelect={() => button.onMenuClick?.()}
              className='rounded-lg'
              disabled={Boolean(button.disabled)}
            >
              <div className='flex items-center gap-2'>
                {Icon ? <Icon className='h-4 w-4' aria-hidden='true' /> : null}
                <span>{button.menuLabel}</span>
              </div>
            </DropdownMenuItem>,
          )
        })

        return items
      }

      return (
        <>
          {/* Main visible container */}
          <div
            ref={containerRef}
            className={cn(
              'flex flex-nowrap items-center min-w-0',
              ALIGNMENT_CLASSES[alignment],
              className,
            )}
            style={{ gap: gapStyle }}
          >
            {sortedForDisplay.map((button) => {
              // Skip overflowed buttons in the main display
              if (layout.overflowed.has(button.id)) return null

              const isCompact =
                button.alwaysCompact ||
                (!button.alwaysFull && layout.compacted.has(button.id))
              const isHighestPriority = button.id === highestPriorityId
              const content = isCompact
                ? button.compactContent
                : button.fullContent

              // Determine CSS order for layout:
              // - Overflow menu always at far right with order 1001
              // - Menu (id='menu') at far right with order 1000
              // - Highest priority button gets order 999 to be just before menu
              // - All other buttons use default order (0)
              const orderStyle = (() => {
                if (button.id === 'menu') return { order: 1000 }
                if (isHighestPriority && highestPriorityFullWidth)
                  return { order: 999 }
                return undefined
              })()

              return (
                <div
                  key={button.id}
                  className={cn(
                    isHighestPriority && highestPriorityFullWidth
                      ? 'flex-1 min-w-0 *:w-full'
                      : 'shrink-0',
                    button.className,
                    isCompact && button.compactClassName,
                  )}
                  style={orderStyle}
                >
                  {renderContent(content, isCompact)}
                </div>
              )
            })}

            {/* Overflow menu button */}
            {showOverflowMenu && (
              <div className='shrink-0' style={{ order: 1001 }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className={cn(
                        'text-muted-foreground hover:text-foreground',
                        overflowMenuTriggerClassName,
                      )}
                    >
                      <span className='sr-only'>{overflowMenuAriaLabel}</span>
                      <MoreVertical className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align='end'
                    className={cn(
                      'w-56 max-h-[min(400px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
                      overflowMenuContentClassName,
                    )}
                  >
                    {renderMenuItems()}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Hidden measurement containers — render every button's full and
              compact form unconditionally so intrinsic widths can be read at
              any time. Off-screen; size independent of container width and of
              the committed layout (see the observer comment above). */}
          <div
            ref={measureFullRef}
            aria-hidden
            className='absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none flex items-center'
            style={{ gap: gapStyle }}
          >
            {sortedForDisplay.map((button) => (
              <div key={button.id} className='shrink-0 whitespace-nowrap'>
                {renderContent(button.fullContent, false)}
              </div>
            ))}
          </div>

          <div
            ref={measureCompactRef}
            aria-hidden
            className='absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none flex items-center'
            style={{ gap: gapStyle }}
          >
            {sortedForDisplay.map((button) => (
              <div key={button.id} className='shrink-0 whitespace-nowrap'>
                {renderContent(button.compactContent, true)}
              </div>
            ))}
          </div>

          {/* Hidden menu trigger for measurement. Always rendered (even when
              the overflow menu is disabled) so the ResizeObserver's observed
              set never changes during the component's lifetime. */}
          <div
            ref={measureMenuRef}
            aria-hidden
            className='absolute left-[-9999px] top-0 opacity-0 pointer-events-none select-none'
          >
            <Button type='button' variant='ghost' size='icon'>
              <MoreVertical className='h-4 w-4' />
            </Button>
          </div>
        </>
      )
    },
  )

ResponsiveButtonRow.displayName = 'ResponsiveButtonRow'

export default ResponsiveButtonRow
