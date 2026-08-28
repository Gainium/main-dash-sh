/* eslint-disable spacing/no-hardcoded-font-size */
import { linkTo } from '@/lib/demoMode';
import { logger } from '@/lib/loggerInstance';
import {
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Send,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isNavigationItemEnabled,
  useUIStore,
  type CustomNavItem,
} from '../../stores/uiStore';
import {
  type PageCategory,
  useUserSessionsStore,
} from '../../stores/userSessionsStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { InputDialog } from '../ui/confirmation-dialog';
import { CreateDashboardDialog } from '../dashboard/CreateDashboardDialog';
import { Switch } from '../ui/switch';
import { TruncatedText } from '../ui/TruncatedText';

import { IS_CLOUD } from '@/config/mode';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { usePaperContext } from '@/hooks/usePaperContext';
import { useTradingModeSwitching } from '@/stores/live/tradingContext';
import { showShortcutHintById } from '@/lib/shortcutHints';
import { getBotStatusConfig } from '@/utils/botUtils';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '../../stores/multiDashboardStore';
import {
  createReportSlug,
  useMultiReportStore,
} from '../../stores/multiReportStore';
import { LogoIcon } from '../common/LogoIcon';
import { LogoWordmark } from '../common/LogoWordmark';
import { TradingModeIcon } from '../common/TradingModeIcon';
import {
  getNavigationSections,
  type NavigationItem,
} from './navigationConfig';
import SidebarNavEditor, {
  type EditorItem,
  type EditorSection,
} from './SidebarNavEditor';
import {
  buildDefaultLayout,
  isCustomNavItemId,
  reconcileLayout,
  type NavLayoutSection,
} from './navigationLayout';
import * as LucideIcons from 'lucide-react';

interface NavigationSidebarProps {
  activePage: string;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
  className?: string;
  showHeader?: boolean;
}

// How far (in px) the user has to drag the right-edge handle before
// pin/unpin fires. Kept module-level so it's a stable reference.
const DRAG_PIN_THRESHOLD = 24;

// Additional drag distance past the unpin threshold required to fully
// hide the sidebar. From pinned the user has to drag the handle a long
// way left to skip past the collapsed state and into hidden mode.
const DRAG_HIDE_THRESHOLD = 200;

// Grace period before the hidden-mode overlay disappears after the
// cursor leaves it — prevents flicker when moving between the left-edge
// trigger zone and the overlay itself.
const HIDDEN_OVERLAY_GRACE_MS = 100;

type SidebarMode = 'pinned' | 'unpinned' | 'hidden';

const resolveTargetMode = (
  initial: SidebarMode,
  delta: number
): SidebarMode => {
  if (initial === 'pinned') {
    if (delta <= -DRAG_HIDE_THRESHOLD) return 'hidden';
    if (delta <= -DRAG_PIN_THRESHOLD) return 'unpinned';
    return 'pinned';
  }
  if (initial === 'unpinned') {
    if (delta <= -DRAG_PIN_THRESHOLD) return 'hidden';
    if (delta >= DRAG_PIN_THRESHOLD) return 'pinned';
    return 'unpinned';
  }
  // initial === 'hidden' — drag the overlay's right edge rightward to
  // bring the sidebar back. Short drag restores hover mode; a long drag
  // pins it open.
  if (delta >= DRAG_HIDE_THRESHOLD) return 'pinned';
  if (delta >= DRAG_PIN_THRESHOLD) return 'unpinned';
  return 'hidden';
};

const BOT_RECENT_CATEGORY_SET = new Set<PageCategory>([
  'trading-bots',
  'grid-bots',
  'combo-bots',
  'hedge-dca-bots',
  'hedge-combo-bots',
  'rulebooks',
  'trade-journal',
]);

const getCategoryFromPath = (href: string): PageCategory | null => {
  const normalized = href.toLowerCase();

  if (normalized.startsWith('/bot')) {
    return 'trading-bots';
  }
  if (normalized.startsWith('/grid')) {
    return 'grid-bots';
  }
  // Check hedge paths before combo to avoid false matches
  if (
    normalized.startsWith('/hedge/combo') ||
    normalized.startsWith('/hedge-bots/combo')
  ) {
    return 'hedge-combo-bots';
  }
  if (
    normalized.startsWith('/hedge/bot') ||
    normalized.startsWith('/hedge-bots/dca')
  ) {
    return 'hedge-dca-bots';
  }
  if (normalized.startsWith('/combo')) {
    return 'combo-bots';
  }
  if (normalized.startsWith('/rulebooks')) {
    return 'rulebooks';
  }
  if (normalized.startsWith('/journal')) {
    return 'trade-journal';
  }

  return null;
};

const formatPnLPercentage = (value: number) => {
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${absValue.toFixed(2)}%`;
};

const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activePage,
  variant = 'desktop',
  onNavigate,
  className,
  showHeader = true,
}) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  // Animation state to keep z-50 during collapse/expand
  const [isAnimating, setIsAnimating] = useState(false);
  const [createDashboardDialogOpen, setCreateDashboardDialogOpen] =
    useState(false);
  const [createReportDialogOpen, setCreateReportDialogOpen] = useState(false);
  const isMobileVariant = variant === 'mobile';

  // Mock user data
  /* const mockUser = {
    name: 'Ares',
    initials: 'A',
    isPro: true,
    isBeta: true,
  }; */

  // Use UI store for navigation section states (selectors to avoid unnecessary re-renders)
  const navigationSidebarSections = useUIStore(
    (s) => s.navigationSidebarSections
  );
  const navigationSubmenuItems = useUIStore((s) => s.navigationSubmenuItems);
  // Explicit setters, not the raw toggles: a group the user has never
  // touched is absent from the store, so `!undefined` resolves to "open"
  // and the first click on an already-open group does nothing visible.
  const setNavigationSectionOpen = useUIStore(
    (s) => s.setNavigationSectionOpen
  );
  const setNavigationSubmenuOpen = useUIStore(
    (s) => s.setNavigationSubmenuOpen
  );
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const navigationSidebarPinned = useUIStore((s) => s.navigationSidebarPinned);
  const setNavigationSidebarPinned = useUIStore(
    (s) => s.setNavigationSidebarPinned
  );
  const navigationSidebarHidden = useUIStore((s) => s.navigationSidebarHidden);
  const setNavigationSidebarHidden = useUIStore(
    (s) => s.setNavigationSidebarHidden
  );
  const navigationItemsEnabled = useUIStore((s) => s.navigationItemsEnabled);
  const hasSeenSidebarEditNudge = useUIStore((s) => s.hasSeenSidebarEditNudge);
  const setHasSeenSidebarEditNudge = useUIStore(
    (s) => s.setHasSeenSidebarEditNudge
  );
  const navigationLayout = useUIStore((s) => s.navigationLayout);
  const customNavItems = useUIStore((s) => s.customNavItems);

  // Edit mode — swaps the nav list for the drag/drop layout editor.
  const [isEditMode, setIsEditMode] = useState(false);

  // Snapshot of the customization captured when entering edit mode. Edits are
  // persisted live, so Cancel rolls everything (layout, visibility, custom
  // items) back to this snapshot.
  const editSnapshotRef = useRef<{
    navigationLayout: NavLayoutSection[] | null;
    navigationItemsEnabled: Record<string, boolean>;
    customNavItems: CustomNavItem[];
  } | null>(null);

  const enterEditMode = () => {
    const s = useUIStore.getState();
    editSnapshotRef.current = {
      navigationLayout: s.navigationLayout,
      navigationItemsEnabled: { ...s.navigationItemsEnabled },
      customNavItems: [...s.customNavItems],
    };
    setIsEditMode(true);
    if (!hasSeenSidebarEditNudge) {
      setHasSeenSidebarEditNudge(true);
    }
  };

  const saveEditMode = () => setIsEditMode(false);

  const cancelEditMode = () => {
    if (editSnapshotRef.current) {
      useUIStore
        .getState()
        .restoreNavigationCustomization(editSnapshotRef.current);
    }
    setIsEditMode(false);
  };

  // Drag-to-pin state (drag the right edge to pin/unpin/hide the sidebar)
  const [isDragHandleHovered, setIsDragHandleHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number | null>(null);
  const initialModeRef = useRef<SidebarMode>('unpinned');

  // Grace timer for hidden-mode overlay dismissal — see HIDDEN_OVERLAY_GRACE_MS.
  const hiddenHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const cancelHiddenHideTimer = () => {
    if (hiddenHideTimeoutRef.current) {
      clearTimeout(hiddenHideTimeoutRef.current);
      hiddenHideTimeoutRef.current = null;
    }
  };

  const scheduleHiddenHide = () => {
    cancelHiddenHideTimer();
    hiddenHideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, HIDDEN_OVERLAY_GRACE_MS);
  };

  // Use paper context hook for trading mode toggle
  const { toggleTradingMode, isDemoMode } = usePaperContext();
  const { isSwitching: isTradingModeSwitching } = useTradingModeSwitching();

  // Multi-dashboard store — narrow selectors so the sidebar only re-renders
  // when these specific fields change (not on every store mutation). Actions
  // are stable refs in Zustand, so selecting them never triggers a re-render.
  const dashboards = useMultiDashboardStore((s) => s.dashboards);
  const currentDashboardId = useMultiDashboardStore(
    (s) => s.currentDashboardId
  );
  const createDashboard = useMultiDashboardStore((s) => s.createDashboard);
  const createDashboardFromTemplate = useMultiDashboardStore(
    (s) => s.createDashboardFromTemplate
  );
  const switchDashboard = useMultiDashboardStore((s) => s.switchDashboard);

  // Multi-report store — narrow selectors (same rationale as above).
  const reports = useMultiReportStore((s) => s.reports);
  const currentReportId = useMultiReportStore((s) => s.currentReportId);
  const createReport = useMultiReportStore((s) => s.createReport);

  // User sessions store for recent visits.
  const getRecentVisitsByCategory = useUserSessionsStore(
    (s) => s.getRecentVisitsByCategory
  );
  const [hoveredCategory, setHoveredCategory] = useState<PageCategory | null>(
    null
  );
  const [expandedCategories, setExpandedCategories] = useState<
    Set<PageCategory>
  >(new Set());
  const [clickExpandedCategories, setClickExpandedCategories] = useState<
    Set<PageCategory>
  >(new Set());

  // Create a wrapper function that opens the dialog to get dashboard name
  const handleCreateDashboard = () => {
    setCreateDashboardDialogOpen(true);
  };

  // Create a wrapper function that opens the dialog to get report name
  const handleCreateReport = () => {
    setCreateReportDialogOpen(true);
  };

  // Handle dashboard creation — supports blank or template-based.
  const handleCreateWithName = ({
    name,
    templateId,
  }: {
    name: string;
    templateId?: string;
  }) => {
    const newDashboardId = templateId
      ? createDashboardFromTemplate(templateId, name)
      : createDashboard(name, true);
    if (newDashboardId) {
      setCreateDashboardDialogOpen(false);
      const stateDashboards = useMultiDashboardStore.getState().dashboards;
      const newDashboard = stateDashboards.find((d) => d.id === newDashboardId);
      const newUrl = newDashboard
        ? `/dashboard/${createDashboardSlug(newDashboard.name)}`
        : '/dashboard';
      navigate(linkTo(newUrl));
      onNavigate?.();
    }
  };

  // Handle report creation with custom name
  const handleCreateReportWithName = (name: string) => {
    const newReportId = createReport(name, true);
    if (newReportId) {
      setCreateReportDialogOpen(false);
      const stateReports = reports;
      const newReport = stateReports.find((r) => r.id === newReportId);
      const newUrl = newReport
        ? `/reports/${createReportSlug(newReport.name)}`
        : '/reports';
      navigate(linkTo(newUrl));
      onNavigate?.();
    }
  };

  const openSections = navigationSidebarSections;
  const openSubmenus = navigationSubmenuItems;

  const toggleSection = (sectionKey: string) => {
    setNavigationSectionOpen(sectionKey, !(openSections[sectionKey] ?? true));
  };

  const isExpanded = isMobileVariant
    ? true
    : navigationSidebarPinned || isHovered || isEditMode;

  // Map a navigation item to a shortcut id to show a chip for
  const getShortcutIdForItem = (item: NavigationItem): string | null => {
    const href = (item.href || '').toLowerCase();
    // Primary pages with global navigation shortcuts
    if (href === '/') return SHORTCUT_IDS.NavDashboard;
    // Map the main dashboards and known pages to their global shortcut ids
    if (href === '/dashboard') return SHORTCUT_IDS.NavDashboard;
    if (href.startsWith('/overview')) return SHORTCUT_IDS.NavOverview;
    if (href.startsWith('/hedge/bot') || href.startsWith('/hedge-bots/dca'))
      return SHORTCUT_IDS.NavHedgeDcaBots;
    if (href.startsWith('/hedge/combo') || href.startsWith('/hedge-bots/combo'))
      return SHORTCUT_IDS.NavHedgeComboBots;
    // For '/dashboard/slug' (specific dashboards) chips are rendered per-child using dynamic ids
    if (href.startsWith('/dashboard/')) return null;
    if (href.startsWith('/portfolio')) return SHORTCUT_IDS.NavPortfolio;
    if (href.startsWith('/trading')) return SHORTCUT_IDS.NavTrades;
    if (href.startsWith('/terminal')) return SHORTCUT_IDS.NavTradingTerminal;
    if (href.startsWith('/bot')) return SHORTCUT_IDS.NavTradingBots;
    if (href.startsWith('/grid') || href.startsWith('/grid-bots'))
      return SHORTCUT_IDS.NavGridBots;
    if (href.startsWith('/combo') || href.startsWith('/combo-bots'))
      return SHORTCUT_IDS.NavComboBots;
    if (href === '/rulebooks') return SHORTCUT_IDS.NavRulebooks;
    if (href.startsWith('/journal')) return SHORTCUT_IDS.NavJournal;
    if (href === '/reports') return SHORTCUT_IDS.NavReports;
    if (href === '/manual-backtesting/sessions')
      return SHORTCUT_IDS.NavManualBacktesting;
    if (href.startsWith('/settings')) return SHORTCUT_IDS.NavSettings;
    return null;
  };

  // Helper function to check if an item is active
  const isItemActive = (item: { href?: string; isActive?: boolean }) => {
    // First check explicit isActive flag (for dashboard children)
    if (item.isActive !== undefined) {
      return item.isActive;
    }

    // Fallback to href-based active check
    const { href } = item;
    if (!href || !activePage) return false;

    // For dashboard URLs with slug path, do full path comparison or prefix match
    if (href.startsWith('/dashboard/')) {
      return activePage === href || activePage.startsWith(href + '/');
    }

    // For other URLs: normalize paths by removing query strings and trailing slashes
    const normalizedHref = href.split('?')[0].replace(/\/$/, '');
    const normalizedActivePage = activePage.split('?')[0].replace(/\/$/, '');

    // Handle root path specially
    if (normalizedHref === '' || normalizedHref === '/') {
      return normalizedActivePage === '' || normalizedActivePage === '/';
    }

    const matchesAlias = () => {
      switch (normalizedHref) {
        case '/bot':
          return (
            normalizedActivePage === '/bot' ||
            normalizedActivePage === '/bot' ||
            normalizedActivePage.startsWith('/bot/') ||
            normalizedActivePage.startsWith('/bot/')
          );
        case '/grid':
          return (
            normalizedActivePage === '/grid' ||
            normalizedActivePage === '/grid-bots' ||
            normalizedActivePage.startsWith('/grid/') ||
            normalizedActivePage.startsWith('/grid-bots/')
          );
        case '/combo':
          return (
            normalizedActivePage === '/combo' ||
            normalizedActivePage === '/combo-bots' ||
            normalizedActivePage.startsWith('/combo/') ||
            normalizedActivePage.startsWith('/combo-bots/')
          );
        case '/hedge/bot':
          return (
            normalizedActivePage === '/hedge/bot' ||
            normalizedActivePage === '/hedge-bots/dca' ||
            normalizedActivePage.startsWith('/hedge/bot/') ||
            normalizedActivePage.startsWith('/hedge-bots/dca/')
          );
        case '/hedge/combo':
          return (
            normalizedActivePage === '/hedge/combo' ||
            normalizedActivePage === '/hedge-bots/combo' ||
            normalizedActivePage.startsWith('/hedge/combo/') ||
            normalizedActivePage.startsWith('/hedge-bots/combo/')
          );
        default:
          return false;
      }
    };

    if (matchesAlias()) {
      return true;
    }

    // For other URLs: exact match or path starts with href followed by /
    return (
      normalizedActivePage === normalizedHref ||
      normalizedActivePage.startsWith(normalizedHref + '/')
    );
  };

  // Helper function to check if a section should be visible
  // Corrected: sections always visible when not hovering (to show icons), controlled by state when hovering
  const isSectionVisible = (sectionKey: string) => {
    // Sections the user hasn't explicitly toggled stay open. Without this
    // fallback any section whose key isn't in `defaultNavigationSections`
    // would collapse on hover even though the icons show while collapsed.
    const isOpen = openSections[sectionKey] ?? true;

    if (isExpanded) {
      // When expanded (hovered or pinned), the user's explicit toggle is
      // authoritative. This used to OR in "has an active child", which
      // pinned the section holding the current page permanently open --
      // the chevron flipped but the section never collapsed.
      return isOpen;
    } else {
      // When collapsed (not hovered), keep sections open so icons are visible
      return true;
    }
  };

  // Helper function to check if a submenu should be visible
  // Corrected: submenus hidden when not hovering, shown based on state when hovering
  const isSubmenuVisible = (itemKey: string, item: NavigationItem) => {
    const isOpen = openSubmenus[itemKey];
    const hasActiveChild =
      item.children &&
      item.children.some((child: NavigationItem) => isItemActive(child));

    if (isExpanded) {
      // When expanded (hovered or pinned), an explicit user toggle wins;
      // auto-opening on an active child is only the DEFAULT for a submenu
      // the user has never touched. This used to OR the two, so the group
      // holding the current page could never be collapsed.
      return isOpen ?? Boolean(hasActiveChild);
    } else {
      // When collapsed (not hovered), hide all submenus to save space
      return false;
    }
  };

  // Hover delay functions
  const handleMouseEnter = (e: React.MouseEvent) => {
    // Only trigger hover if mouse is actually over the sidebar content
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const isActuallyOverSidebar =
      e.clientX >= rect.left && e.clientX <= rect.right;

    if (isMobileVariant) {
      return;
    }
    if (!navigationSidebarPinned && isActuallyOverSidebar) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      cancelHiddenHideTimer();
      if (navigationSidebarHidden) {
        // Hidden mode: overlay appears immediately on hover — no delay.
        setIsHovered(true);
        return;
      }
      // Collapsed sidebar stays collapsed on casual hover. Only expand
      // after the cursor has lingered for a full 3 seconds.
      const timeout = setTimeout(() => {
        setIsHovered(true);
      }, 3000);
      setHoverTimeout(timeout);
    }
  };

  const handleMouseLeave = () => {
    if (isMobileVariant) {
      return;
    }

    // Always reset expanded categories and click-expanded categories when leaving the sidebar
    // This ensures recent items collapse even when pinned
    setExpandedCategories(new Set());
    setClickExpandedCategories(new Set());
    setHoveredCategory(null);

    if (!navigationSidebarPinned) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      if (navigationSidebarHidden) {
        // Grace period so transitioning from overlay → trigger zone (or
        // vice versa) doesn't flicker the overlay closed.
        scheduleHiddenHide();
      } else {
        setIsHovered(false);
      }
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 250);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      cancelHiddenHideTimer();
    };
  }, [hoverTimeout]);

  // Drag-to-pin/hide: live-commit the mode as the user drags the right
  // edge. Pinned ↔ unpinned uses DRAG_PIN_THRESHOLD; further left past
  // DRAG_HIDE_THRESHOLD enters hidden mode. See resolveTargetMode.
  const handleDragHandlePointerDown = (e: React.PointerEvent) => {
    if (isMobileVariant) return;
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    initialModeRef.current = navigationSidebarHidden
      ? 'hidden'
      : navigationSidebarPinned
        ? 'pinned'
        : 'unpinned';
    // Keep the overlay open while dragging from hidden mode.
    cancelHiddenHideTimer();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (dragStartXRef.current == null) return;
      const delta = e.clientX - dragStartXRef.current;
      const target = resolveTargetMode(initialModeRef.current, delta);

      const targetPinned = target === 'pinned';
      const targetHidden = target === 'hidden';

      if (targetHidden !== navigationSidebarHidden) {
        setNavigationSidebarHidden(targetHidden);
        // When the user drags from a visible mode INTO hidden, the
        // cursor was over the (now-hidden) sidebar so isHovered is still
        // true — which would keep the overlay visible. Force-clear it so
        // the sidebar actually vanishes mid-drag, matching the user's
        // intent. When the drag started FROM hidden mode, leave isHovered
        // alone so the overlay stays visible for drag-back.
        if (targetHidden && initialModeRef.current !== 'hidden') {
          setIsHovered(false);
        }
      }
      if (targetPinned !== navigationSidebarPinned) {
        setNavigationSidebarPinned(targetPinned);
      }
    };

    const handleUp = () => {
      dragStartXRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, [
    isDragging,
    navigationSidebarPinned,
    navigationSidebarHidden,
    setNavigationSidebarPinned,
    setNavigationSidebarHidden,
  ]);

  const outerClasses = [
    isMobileVariant
      ? 'w-full h-full max-h-screen'
      : `relative h-full max-h-screen transition-all duration-300 ease-in-out`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Edit mode also reserves full width so the expanded inner doesn't
  // overflow on top of the page content beside the (otherwise-collapsed)
  // outer container. Hidden mode reserves no width at all — the inner
  // appears as a fixed-position overlay on top of the content.
  const outerExpanded = navigationSidebarPinned || isEditMode;

  // When hidden + not currently revealed (via the hover trigger or
  // mid-drag from hidden mode), treat the inner as invisible so it
  // doesn't intercept pointer events AND so it visually disappears.
  // Crucially we DO NOT include !isDragging here — dragging left from
  // collapsed into hidden state should make the collapsed bar vanish so
  // the user can see the sidebar will be hidden on release. The
  // pointermove handler clears isHovered exactly for this case; dragging
  // back right restores hidden=false and the inner reappears.
  const innerInvisible =
    !isMobileVariant &&
    navigationSidebarHidden &&
    !isHovered &&
    !isAnimating &&
    !isEditMode;

  const outerStyle = !isMobileVariant
    ? {
        width:
          navigationSidebarHidden && !isEditMode
            ? '0px'
            : outerExpanded
              ? 'var(--sidebar-width-expanded)'
              : 'var(--sidebar-width-collapsed)',
      }
    : undefined;

  // The inner becomes a floating overlay either when an unpinned sidebar
  // is being hovered, or in hidden mode whenever it's being shown.
  const innerIsOverlay =
    !isMobileVariant &&
    !navigationSidebarPinned &&
    (navigationSidebarHidden || isHovered || isAnimating) &&
    !innerInvisible;

  const innerClasses = isMobileVariant
    ? 'bg-card h-full flex flex-col overflow-hidden sidebar-container-constrained'
    : `bg-card border-r border-border h-full ${innerInvisible ? '' : 'transition-all duration-300 ease-in-out'} flex flex-col sidebar-container-constrained ${innerIsOverlay ? 'absolute left-0 top-0 z-100 shadow-xl' : ''} overflow-hidden`;

  const innerStyle = !isMobileVariant
    ? {
        width: innerInvisible
          ? '0px'
          : isExpanded
            ? 'var(--sidebar-width-expanded)'
            : 'var(--sidebar-width-collapsed)',
        maxWidth: innerInvisible
          ? '0px'
          : isExpanded
            ? 'var(--sidebar-width-expanded)'
            : 'var(--sidebar-width-collapsed)',
        ...(innerInvisible
          ? { pointerEvents: 'none' as const, visibility: 'hidden' as const }
          : {}),
      }
    : undefined;

  // ── Customizable navigation layout ──────────────────────────────────────
  // Default sections from config, overlaid with the user's persisted layout
  // (section + item order, custom sections, custom items). Resolved against a
  // live registry so newly shipped built-in items still surface automatically.
  const baseSections = getNavigationSections(
    dashboards.map((d) => ({ id: d.id, name: d.name })),
    currentDashboardId,
    handleCreateDashboard,
    switchDashboard,
    isDemoMode,
    reports.map((r) => ({ id: r.id, name: r.name })),
    currentReportId,
    handleCreateReport
  );

  const builtinItemById = new Map<string, NavigationItem>();
  for (const section of baseSections) {
    for (const item of section.items) {
      if (item.id) builtinItemById.set(item.id, item);
    }
  }

  const customItemById = new Map<string, NavigationItem>();
  for (const custom of customNavItems) {
    const CustomIcon =
      (
        LucideIcons as unknown as Record<
          string,
          React.ComponentType<{ className?: string }>
        >
      )[custom.icon] || LucideIcons.Home;
    customItemById.set(custom.id, {
      id: custom.id,
      icon: <CustomIcon className="w-4 h-4" />,
      label: custom.name,
      href: custom.url,
      shortcut: custom.shortcut,
    });
  }

  const resolveItem = (id: string): NavigationItem | undefined =>
    builtinItemById.get(id) ?? customItemById.get(id);

  const availableItemIds = new Set<string>([
    ...builtinItemById.keys(),
    ...customItemById.keys(),
  ]);

  const effectiveLayout = reconcileLayout(
    navigationLayout,
    buildDefaultLayout(baseSections),
    availableItemIds
  );

  const sectionsToRender = effectiveLayout.map((section) => ({
    id: section.id,
    title: section.title,
    isCustom: Boolean(section.isCustom),
    items: section.itemIds
      .map(resolveItem)
      .filter((item): item is NavigationItem => Boolean(item)),
  }));

  const editorSections: EditorSection[] = effectiveLayout.map((section) => ({
    id: section.id,
    title: section.title,
    isCustom: Boolean(section.isCustom),
    items: section.itemIds
      .map((id): EditorItem | null => {
        const nav = resolveItem(id);
        if (!nav) return null;
        return {
          id,
          label: nav.label,
          icon: nav.icon,
          isCustom: isCustomNavItemId(id),
          enabled: isNavigationItemEnabled(navigationItemsEnabled, id),
        };
      })
      .filter((item): item is EditorItem => Boolean(item)),
  }));

  return (
    <div className={outerClasses} style={outerStyle}>
      {/* Hidden-mode left-edge hover trigger. Fixed so it always sits
          at the very edge of the viewport regardless of any layout.
          Wide enough (24px) to be easy to hit without aiming carefully. */}
      {!isMobileVariant && navigationSidebarHidden && (
        <div
          className="fixed top-0 left-0 bottom-0 z-40"
          style={{ width: '24px' }}
          onMouseEnter={() => {
            cancelHiddenHideTimer();
            setIsHovered(true);
          }}
          onMouseLeave={() => {
            // Defer in case the cursor is moving onto the overlay; the
            // overlay's mouseenter cancels this.
            scheduleHiddenHide();
          }}
        />
      )}
      <div
        className={innerClasses}
        style={innerStyle}
        onMouseEnter={isMobileVariant ? undefined : handleMouseEnter}
        onMouseLeave={isMobileVariant ? undefined : handleMouseLeave}
      >
        {/* Drag-to-pin handle on the right edge. Highlights on hover.
            Drag right past the threshold to pin, left to unpin. */}
        {!isMobileVariant && (
          <div
            onPointerDown={handleDragHandlePointerDown}
            onMouseEnter={() => setIsDragHandleHovered(true)}
            onMouseLeave={() => setIsDragHandleHovered(false)}
            title={
              navigationSidebarPinned
                ? 'Drag left to unpin'
                : 'Drag right to pin'
            }
            className="absolute top-0 right-0 bottom-0 z-50 flex items-center justify-end"
            style={{
              width: '10px',
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
          >
            <div
              className={`h-full transition-all duration-150 ${
                isDragging
                  ? 'w-1 bg-primary'
                  : isDragHandleHovered
                    ? 'w-0.5 bg-primary/60'
                    : 'w-px bg-transparent'
              }`}
            />
          </div>
        )}

        {/* Header */}
        {showHeader && (
          <div className="px-2 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center shrink-0 ml-2">
                  <LogoIcon className="w-8 h-8" />
                </div>
                <div
                  className={`transition-opacity duration-300 ease-in-out whitespace-nowrap flex-1 flex items-center gap-2 ${
                    isExpanded ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <LogoWordmark className="h-6" />
                  <span className="inline-flex items-center rounded-full border border-primary/50 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
                    v2
                  </span>
                </div>
              </div>
              {!isMobileVariant && (
                <div
                  className={`transition-opacity duration-300 ease-in-out shrink-0 ${
                    isExpanded ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      // Clicking the pin button always brings the sidebar
                      // out of hidden mode in addition to toggling pinned.
                      if (navigationSidebarHidden) {
                        setNavigationSidebarHidden(false);
                      }
                      setNavigationSidebarPinned(!navigationSidebarPinned);
                    }}
                    title={
                      navigationSidebarPinned
                        ? 'Sidebar pinned — click to unpin (or drag the right edge)'
                        : 'Sidebar collapses on its own — click to pin (or drag the right edge)'
                    }
                    aria-label={
                      navigationSidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'
                    }
                    aria-pressed={navigationSidebarPinned}
                    className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors duration-200 ${
                      navigationSidebarPinned
                        ? 'text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {navigationSidebarPinned ? (
                      <PanelLeftClose className="w-4 h-4" />
                    ) : (
                      <PanelLeftOpen className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Sections.
            Native overflow scroll (not Radix ScrollArea) on purpose: this
            sidebar re-renders on every store tick, and Radix's compose-refs
            recurses into a setState loop under React 19 (radix #3799),
            tripping "Maximum update depth exceeded". `custom-scrollbar`
            mimics the thin Radix scrollbar via CSS. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-2">
            {isEditMode ? (
              <SidebarNavEditor sections={editorSections} />
            ) : (
              <>
                {sectionsToRender
              .filter((section) =>
                section.items.some((item) =>
                  isNavigationItemEnabled(navigationItemsEnabled, item.id)
                )
              )
              .map((section) => (
                <div key={section.id} className="mb-4">
                  {/* Section Separator - only show if section has a title */}
                  {section.title && (
                    <div className="flex items-center mt-5 px-2">
                      <div className="flex items-center w-full">
                        {/* Small separator line - always visible */}
                        <div className="w-8 border-b border-border opacity-100" />
                        <span
                          className={`text-sm font-medium uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-all duration-300 ease-in-out whitespace-nowrap ${
                            isExpanded
                              ? 'opacity-100 ml-2 mr-2'
                              : 'opacity-0 ml-0 mr-0'
                          }`}
                          onClick={() =>
                            toggleSection(section.id)
                          }
                        >
                          {section.title}
                        </span>
                        <div
                          className={`flex-1 border-b border-border transition-all duration-300 ease-in-out ${
                            isExpanded ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        <div
                          className={`ml-2 cursor-pointer transition-opacity duration-300 ease-in-out ${
                            isExpanded ? 'opacity-100' : 'opacity-0'
                          }`}
                          onClick={() =>
                            toggleSection(section.id)
                          }
                        >
                          {(openSections[section.id] ?? true) ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section Items */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      section.title
                        ? isSectionVisible(section.id)
                          ? 'max-h-[2000px] opacity-100'
                          : 'max-h-0 opacity-0'
                        : 'max-h-[2000px] opacity-100'
                    }`}
                  >
                    <div
                      className={`${section.title ? 'mt-2' : 'mt-0'} transform transition-transform duration-300 ease-in-out ${
                        section.title
                          ? isSectionVisible(section.id)
                            ? 'translate-y-0'
                            : '-translate-y-2'
                          : 'translate-y-0'
                      }`}
                    >
                      {section.items
                        .filter((it) =>
                          isNavigationItemEnabled(
                            navigationItemsEnabled,
                            it.id
                          )
                        )
                        .map((item, itemIndex) => {
                        const hasSubmenu =
                          item.children && item.children.length > 0;
                        const hasActiveChild = hasSubmenu
                          ? (item.children?.some((child) =>
                              isItemActive(child)
                            ) ?? false)
                          : false;
                        const isActive = isItemActive(item) || hasActiveChild;
                        const itemKey = item.label
                          .toLowerCase()
                          .replace(/\s+/g, '-');
                        // Mirror `isSubmenuVisible`'s default so the chevron
                        // direction matches what is actually rendered before
                        // the user has ever toggled this group.
                        const isSubmenuOpen =
                          openSubmenus[itemKey] ?? hasActiveChild;
                        const shortcutId = getShortcutIdForItem(item);

                        // Recent-visits behavior for top-level bot items
                        // (Trading Bots, Grid Bots, Combo Bots, etc.) now
                        // that those items are flat instead of submenu
                        // children.
                        const categoryForItem = item.href
                          ? getCategoryFromPath(item.href)
                          : null;
                        // A user-created custom link carries whatever URL the
                        // user typed, so one pointing at e.g. `/bots` would
                        // otherwise match the built-in Trading Bots category
                        // and render that category's recent-visit pills under
                        // itself. Recents belong to the built-in bot rows only.
                        const isCustomItem = Boolean(
                          item.id && isCustomNavItemId(item.id)
                        );
                        const itemSupportsRecents = Boolean(
                          !isCustomItem &&
                          categoryForItem &&
                          BOT_RECENT_CATEGORY_SET.has(categoryForItem)
                        );
                        const itemRecentVisits = itemSupportsRecents
                          ? getRecentVisitsByCategory(
                              categoryForItem as PageCategory,
                              10,
                              tradingMode
                            )
                          : [];
                        const itemIsClickExpanded = itemSupportsRecents
                          ? clickExpandedCategories.has(
                              categoryForItem as PageCategory
                            )
                          : false;
                        const itemIsCategoryExpanded = itemSupportsRecents
                          ? expandedCategories.has(
                              categoryForItem as PageCategory
                            )
                          : false;
                        const itemVisibleVisits = itemIsClickExpanded
                          ? itemRecentVisits
                          : itemRecentVisits.slice(0, 3);
                        const itemHasMore = itemRecentVisits.length > 3;

                        // Tour anchors for the Max onboarding walkthrough.
                        // Only nav items referenced by the explore script
                        // get a data-tour; others render unmarked. Smart
                        // Trade / Markets aren't in this build, so the
                        // tour script omits those steps.
                        const tourKey =
                          item.id === 'trading-bots'
                            ? 'nav.bots'
                            : item.id === 'portfolio'
                              ? 'nav.portfolio'
                              : undefined;
                        return (
                          <div
                            key={itemIndex}
                            className="mb-2 px-2"
                            data-tour={tourKey}
                            onMouseEnter={() => {
                              if (itemSupportsRecents && categoryForItem) {
                                setHoveredCategory(categoryForItem);
                                setExpandedCategories((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.add(categoryForItem);
                                  return newSet;
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              if (itemSupportsRecents) {
                                setHoveredCategory(null);
                              }
                            }}
                          >
                            <div
                              className={`flex items-center gap-3 rounded-lg transition-colors duration-200 ${
                                isActive
                                  ? 'bg-primary/10 -mx-1 px-1 py-0.5'
                                  : ''
                              }`}
                            >
                              {/* Icon - always visible and perfectly centered */}
                              <Link
                                to={item.href || '#'}
                                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 shrink-0 ${
                                  isActive
                                    ? 'gradient-brand text-primary-foreground'
                                    : 'hover:bg-muted/50'
                                }`}
                                title={item.label}
                                onClick={(e) => {
                                  if (hasSubmenu && !item.href) {
                                    e.preventDefault();
                                    setNavigationSubmenuOpen(
                                      itemKey,
                                      !isSubmenuOpen
                                    );
                                    return;
                                  }
                                  if (shortcutId)
                                    showShortcutHintById(shortcutId);
                                  onNavigate?.();
                                }}
                              >
                                <span
                                  className={`transition-colors duration-200 ${
                                    isActive
                                      ? 'text-primary-foreground'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  {item.icon}
                                </span>
                              </Link>

                              {/* Text - only show when expanded */}
                              {isExpanded && (
                                <div className="flex-1 flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Link
                                      to={linkTo(item.href || '#')}
                                      className={`transition-colors duration-200 cursor-pointer ${
                                        isActive
                                          ? 'text-primary font-medium'
                                          : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                      onClick={(e) => {
                                        if (hasSubmenu && !item.href) {
                                          e.preventDefault();
                                          setNavigationSubmenuOpen(
                                            itemKey,
                                            !isSubmenuOpen
                                          );
                                          return;
                                        }
                                        if (shortcutId)
                                          showShortcutHintById(shortcutId);
                                        onNavigate?.();
                                      }}
                                    >
                                      <TruncatedText
                                        text={item.label}
                                        maxWidth="min(120px, 8rem)"
                                      />
                                    </Link>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {item.action && (
                                      <a
                                        href={linkTo(item.action.href || '#')}
                                        onClick={(e) => {
                                          if (item.action?.onClick) {
                                            e.preventDefault();
                                            item.action.onClick();
                                            onNavigate?.();
                                            return;
                                          }
                                          onNavigate?.();
                                          // If no onClick function, allow default link behavior
                                        }}
                                        className="flex items-center justify-center w-6 h-6 border border-border bg-inner-container hover:border-primary/20 hover:bg-primary/5 rounded transition-colors duration-200"
                                        title={item.action.title}
                                      >
                                        <span className="text-muted-foreground hover:text-primary transition-colors duration-200">
                                          {item.action.icon}
                                        </span>
                                      </a>
                                    )}
                                    {item.badge && (
                                      <Badge
                                        variant={
                                          item.badge.variant === 'pro'
                                            ? 'secondary'
                                            : 'secondary'
                                        }
                                        className={`text-xs px-1.5 py-0.5 border-0 font-medium ${
                                          item.badge.variant === 'pro'
                                            ? 'gradient-brand hover:opacity-90 text-card-foreground'
                                            : item.badge.variant === 'default'
                                              ? 'bg-primary text-primary-foreground'
                                              : 'bg-muted-foreground/70 hover:bg-muted text-card-foreground'
                                        }`}
                                      >
                                        {item.badge.text}
                                      </Badge>
                                    )}
                                    {hasSubmenu && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setNavigationSubmenuOpen(
                                            itemKey,
                                            !isSubmenuOpen
                                          );
                                        }}
                                        data-size="icon"
                                        className="flex items-center justify-center w-4 h-4 hover:bg-muted/50 rounded transition-colors duration-200"
                                        title={
                                          isSubmenuOpen
                                            ? 'Collapse submenu'
                                            : 'Expand submenu'
                                        }
                                      >
                                        {isSubmenuOpen ? (
                                          <ChevronDown className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Recent visits for top-level bot items */}
                            {itemSupportsRecents &&
                              itemRecentVisits.length > 0 &&
                              isExpanded && (
                                <div
                                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                    isActive ||
                                    hoveredCategory === categoryForItem ||
                                    itemIsCategoryExpanded
                                      ? 'max-h-[2000px] opacity-100'
                                      : 'max-h-0 opacity-0'
                                  }`}
                                >
                                  <div
                                    className={`mt-2 px-2 ml-8 transform transition-transform duration-300 ease-in-out ${
                                      isActive ||
                                      hoveredCategory === categoryForItem ||
                                      itemIsCategoryExpanded
                                        ? 'translate-y-0'
                                        : '-translate-y-2'
                                    }`}
                                  >
                                    <div className="flex flex-wrap gap-1">
                                      {itemVisibleVisits.map((visit, idx) => {
                                        const isActiveVisit =
                                          activePage === visit.path;
                                        const pathParts = visit.path.split('/');
                                        const id =
                                          pathParts[pathParts.length - 1];
                                        const shortId =
                                          id.length > 6
                                            ? `...${id.slice(-6)}`
                                            : id;
                                        const statusConfig = visit.botStatus
                                          ? getBotStatusConfig(visit.botStatus)
                                          : null;
                                        const pnlText =
                                          typeof visit.botPnlPercentage ===
                                          'number'
                                            ? formatPnLPercentage(
                                                visit.botPnlPercentage
                                              )
                                            : null;
                                        const isProfitable =
                                          (visit.botPnlPercentage ?? 0) >= 0;

                                        return (
                                          <Link
                                            key={`${visit.path}-${idx}`}
                                            to={visit.path}
                                            onClick={() => onNavigate?.()}
                                          >
                                            <Badge
                                              variant="outline"
                                              className={`text-xs px-1.5 py-0.5 h-5 cursor-pointer transition-colors border-dashed flex items-center gap-0.5 ${
                                                isActiveVisit
                                                  ? 'bg-primary/10 text-primary border-primary/50'
                                                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 border-muted-foreground/20'
                                              }`}
                                              style={{ opacity: 0.8 }}
                                              title={visit.path}
                                            >
                                              {statusConfig && (
                                                <span
                                                  className="w-1.5 h-1.5 rounded-full"
                                                  style={{
                                                    backgroundColor:
                                                      statusConfig.color ??
                                                      'var(--muted-foreground)',
                                                    opacity: 0.8,
                                                  }}
                                                  title={statusConfig.label}
                                                />
                                              )}
                                              <span className="truncate max-w-[70px]">
                                                {visit.displayName || shortId}
                                              </span>
                                              {pnlText && (
                                                <span
                                                  className={`font-semibold ${
                                                    isProfitable
                                                      ? 'text-profit'
                                                      : 'text-loss'
                                                  }`}
                                                >
                                                  {pnlText}
                                                </span>
                                              )}
                                            </Badge>
                                          </Link>
                                        );
                                      })}

                                      {itemHasMore &&
                                        !itemIsClickExpanded &&
                                        itemIsCategoryExpanded && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              setClickExpandedCategories(
                                                (prev) => {
                                                  const newSet = new Set(prev);
                                                  if (categoryForItem) {
                                                    newSet.add(categoryForItem);
                                                  }
                                                  return newSet;
                                                }
                                              );
                                            }}
                                            className="text-xs py-0.5 px-1.5 text-muted-foreground/40 hover:text-primary/60 transition-colors cursor-pointer"
                                          >
                                            +{itemRecentVisits.length - 3} more
                                          </button>
                                        )}
                                    </div>
                                  </div>
                                </div>
                              )}

                            {/* Submenu Items */}
                            {hasSubmenu && (
                              <div
                                className={`overflow-hidden transition-all duration-300 ease-in-out ml-6 mt-1 ${
                                  isSubmenuVisible(itemKey, item)
                                    ? 'max-h-[2000px] opacity-100'
                                    : 'max-h-0 opacity-0'
                                }`}
                              >
                                <div
                                  className={`transform transition-transform duration-300 ease-in-out ${
                                    isSubmenuVisible(itemKey, item)
                                      ? 'translate-y-0'
                                      : '-translate-y-2'
                                  }`}
                                >
                                  {item.children?.map((subItem, subIndex) => {
                                    const isSubActive = isItemActive(subItem);

                                    const categoryForSubItem = subItem.href
                                      ? getCategoryFromPath(subItem.href)
                                      : null;
                                    const supportsRecentItems = Boolean(
                                      categoryForSubItem &&
                                      BOT_RECENT_CATEGORY_SET.has(
                                        categoryForSubItem
                                      )
                                    );
                                    const allRecentVisits = supportsRecentItems
                                      ? getRecentVisitsByCategory(
                                          categoryForSubItem as PageCategory,
                                          10,
                                          tradingMode
                                        )
                                      : [];
                                    const isClickExpanded = supportsRecentItems
                                      ? clickExpandedCategories.has(
                                          categoryForSubItem as PageCategory
                                        )
                                      : false;
                                    const isCategoryExpanded =
                                      supportsRecentItems
                                        ? expandedCategories.has(
                                            categoryForSubItem as PageCategory
                                          )
                                        : false;
                                    // Show 3 items on hover, all items when click-expanded
                                    const visibleVisits = isClickExpanded
                                      ? allRecentVisits
                                      : allRecentVisits.slice(0, 3);
                                    const hasMore = allRecentVisits.length > 3;

                                    return (
                                      <div
                                        key={subIndex}
                                        className="mb-1 px-2"
                                        onMouseEnter={() => {
                                          if (supportsRecentItems) {
                                            setHoveredCategory(
                                              categoryForSubItem as PageCategory
                                            );
                                            // Expand the category on hover (to show 3 items)
                                            setExpandedCategories((prev) => {
                                              const newSet = new Set(prev);
                                              if (categoryForSubItem) {
                                                newSet.add(
                                                  categoryForSubItem as PageCategory
                                                );
                                              }
                                              return newSet;
                                            });
                                          }
                                        }}
                                        onMouseLeave={() => {
                                          if (supportsRecentItems) {
                                            // Only reset hovered category, keep expanded state
                                            setHoveredCategory(null);
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          <Link
                                            to={subItem.href || '#'}
                                            className={`flex-1 flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors duration-200 text-sm ${
                                              isSubActive
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                            }`}
                                            title={subItem.label}
                                            onClick={() => onNavigate?.()}
                                          >
                                            <span
                                              className={`transition-colors duration-200 ${
                                                isSubActive
                                                  ? 'text-primary'
                                                  : 'text-muted-foreground'
                                              }`}
                                            >
                                              {subItem.icon}
                                            </span>
                                            <span
                                              className={`transition-opacity duration-300 ease-in-out whitespace-nowrap ${
                                                isExpanded
                                                  ? 'opacity-100'
                                                  : 'opacity-0'
                                              }`}
                                            >
                                              <TruncatedText
                                                text={subItem.label}
                                                maxWidth="min(100px, 6rem)"
                                              />
                                            </span>
                                          </Link>
                                          {subItem.action && (
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault();
                                                if (subItem.action?.onClick) {
                                                  subItem.action.onClick();
                                                  onNavigate?.();
                                                } else if (
                                                  subItem.action?.href
                                                ) {
                                                  navigate(subItem.action.href);
                                                  onNavigate?.();
                                                }
                                              }}
                                              data-size="icon"
                                              className="flex items-center justify-center w-5 h-5 border border-border bg-inner-container hover:border-primary/20 hover:bg-primary/5 rounded transition-all duration-200 shrink-0"
                                              title={subItem.action.title}
                                              type="button"
                                            >
                                              <span className="text-muted-foreground hover:text-primary transition-colors duration-200">
                                                {subItem.action.icon}
                                              </span>
                                            </button>
                                          )}
                                        </div>

                                        {supportsRecentItems &&
                                          allRecentVisits.length > 0 && (
                                            <div
                                              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                                isSubActive ||
                                                hoveredCategory ===
                                                  categoryForSubItem ||
                                                isCategoryExpanded
                                                  ? 'max-h-[2000px] opacity-100'
                                                  : 'max-h-0 opacity-0'
                                              }`}
                                            >
                                              <div
                                                className={`mt-2 px-2 ml-4 transform transition-transform duration-300 ease-in-out ${
                                                  isSubActive ||
                                                  hoveredCategory ===
                                                    categoryForSubItem ||
                                                  isCategoryExpanded
                                                    ? 'translate-y-0'
                                                    : '-translate-y-2'
                                                }`}
                                              >
                                                <div className="flex flex-wrap gap-1">
                                                  {visibleVisits.map(
                                                    (visit, idx) => {
                                                      const isActiveVisit =
                                                        activePage ===
                                                        visit.path;
                                                      const pathParts =
                                                        visit.path.split('/');
                                                      const id =
                                                        pathParts[
                                                          pathParts.length - 1
                                                        ];
                                                      const shortId =
                                                        id.length > 6
                                                          ? `...${id.slice(-6)}`
                                                          : id;

                                                      logger.debug(
                                                        '[recent-items] Rendering sidebar visit label',
                                                        {
                                                          category:
                                                            categoryForSubItem,
                                                          path: visit.path,
                                                          displayName:
                                                            visit.displayName,
                                                          fallbackLabel:
                                                            visit.displayName
                                                              ? undefined
                                                              : shortId,
                                                        }
                                                      );

                                                      const statusConfig =
                                                        visit.botStatus
                                                          ? getBotStatusConfig(
                                                              visit.botStatus
                                                            )
                                                          : null;
                                                      const pnlText =
                                                        typeof visit.botPnlPercentage ===
                                                        'number'
                                                          ? formatPnLPercentage(
                                                              visit.botPnlPercentage
                                                            )
                                                          : null;
                                                      const isProfitable =
                                                        (visit.botPnlPercentage ??
                                                          0) >= 0;

                                                      return (
                                                        <Link
                                                          key={`${visit.path}-${idx}`}
                                                          to={visit.path}
                                                          onClick={() =>
                                                            onNavigate?.()
                                                          }
                                                        >
                                                          <Badge
                                                            variant="outline"
                                                            className={`text-xs px-1.5 py-0.5 h-5 cursor-pointer transition-colors border-dashed flex items-center gap-0.5 ${
                                                              isActiveVisit
                                                                ? 'bg-primary/10 text-primary border-primary/50'
                                                                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 border-muted-foreground/20'
                                                            }`}
                                                            style={{
                                                              opacity: 0.8,
                                                            }}
                                                            title={visit.path}
                                                          >
                                                            {statusConfig && (
                                                              <span
                                                                className="w-1.5 h-1.5 rounded-full"
                                                                style={{
                                                                  backgroundColor:
                                                                    statusConfig.color ??
                                                                    'var(--muted-foreground)',
                                                                  opacity: 0.8,
                                                                }}
                                                                title={
                                                                  statusConfig.label
                                                                }
                                                              />
                                                            )}
                                                            <span className="truncate max-w-[70px]">
                                                              {visit.displayName ||
                                                                shortId}
                                                            </span>
                                                            {pnlText && (
                                                              <span
                                                                className={`font-semibold ${
                                                                  isProfitable
                                                                    ? 'text-profit'
                                                                    : 'text-loss'
                                                                }`}
                                                              >
                                                                {pnlText}
                                                              </span>
                                                            )}
                                                          </Badge>
                                                        </Link>
                                                      );
                                                    }
                                                  )}

                                                  {hasMore &&
                                                    !isClickExpanded &&
                                                    isCategoryExpanded && (
                                                      <button
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          setClickExpandedCategories(
                                                            (prev) => {
                                                              const newSet =
                                                                new Set(prev);
                                                              if (
                                                                categoryForSubItem
                                                              ) {
                                                                newSet.add(
                                                                  categoryForSubItem as PageCategory
                                                                );
                                                              }
                                                              return newSet;
                                                            }
                                                          );
                                                        }}
                                                        className="text-xs py-0.5 px-1.5 text-muted-foreground/40 hover:text-primary/60 transition-colors cursor-pointer"
                                                      >
                                                        +
                                                        {allRecentVisits.length -
                                                          3}{' '}
                                                        more
                                                      </button>
                                                    )}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

                {/* Footer entry into edit mode. Always available — this is the
                    primary way to open navigation editing; it surfaces the
                    hidden-item count when some items are turned off. */}
                {(() => {
                  const hiddenCount = sectionsToRender.reduce(
                    (acc, section) =>
                      acc +
                      section.items.filter(
                        (it) =>
                          !isNavigationItemEnabled(
                            navigationItemsEnabled,
                            it.id
                          )
                      ).length,
                    0
                  );
                  return (
                    <button
                      type="button"
                      onClick={enterEditMode}
                      title={
                        hiddenCount > 0
                          ? `Edit navigation — ${hiddenCount} hidden`
                          : 'Edit navigation'
                      }
                      className="relative w-full flex items-center gap-3 px-2 py-2 mt-2 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors duration-200"
                    >
                      <span className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-muted-foreground/30 shrink-0">
                        <Pencil className="w-3.5 h-3.5" />
                        {/* First-run pulse — fades after the user opens edit
                            mode once. */}
                        {!hasSeenSidebarEditNudge && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-2 w-2"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        )}
                      </span>
                      {isExpanded && (
                        <span className="text-sm whitespace-nowrap">
                          {hiddenCount > 0
                            ? `Edit navigation · +${hiddenCount}`
                            : 'Edit navigation'}
                        </span>
                      )}
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </div>

        {/* Trading Mode Toggle at bottom — hidden in edit mode so the
            sidebar focuses on item selection. */}
        {!isEditMode && (
          <div
            className="border-t border-border p-2 mt-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex items-center gap-3 px-2 mb-2">
              <div className="flex items-center gap-3 w-full">
                {/* Trading icon - exact same structure as navigation items */}
                <TradingModeIcon
                  size="lg"
                  showTooltip={true}
                  onClick={isDemoMode ? undefined : toggleTradingMode}
                />

                {/* Trading mode details - exact same structure as navigation text */}
                <div
                  className={`flex-1 transition-opacity duration-300 ease-in-out whitespace-nowrap ${
                    isExpanded ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {isDemoMode ? (
                    // Demo mode: Show indicator with exit button
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary">
                        Demo Mode
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Navigate to add-exchange page (will exit demo mode there)
                          navigate('/add-exchange', { replace: true });
                        }}
                        className="h-6 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                      >
                        Exit
                      </Button>
                    </div>
                  ) : (
                    // Live/Paper mode: Show switch
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-xs transition-colors duration-200 cursor-pointer text-muted-foreground hover:text-foreground text-sm">
                        {isLiveTrading ? 'Live Trading' : 'Paper Trading'}
                        {isTradingModeSwitching && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                      </span>
                      <Switch
                        checked={isLiveTrading}
                        onCheckedChange={toggleTradingMode}
                        className="h-5 w-9 data-[state=checked]:bg-success"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compact Help & Resources strip — single icon-only row below
            the trading mode toggle. Hover for tooltip. When collapsed
            the strip shrinks to a single help icon. Hidden in edit
            mode. */}
        {!isEditMode && (
          <div className="border-t border-border px-2 py-2">
            {isExpanded ? (
              <div className="flex items-center justify-around">
                {IS_CLOUD && (
                  <Link
                    to={linkTo('/help')}
                    onClick={() => onNavigate?.()}
                    title="How to Use"
                    aria-label="How to Use"
                    className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </Link>
                )}
                {IS_CLOUD && (
                  <Link
                    to={linkTo('/community/latest-topics')}
                    onClick={() => onNavigate?.()}
                    title="Community"
                    aria-label="Community"
                    className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </Link>
                )}
                <a
                  href="https://t.me/gainiumio"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Telegram"
                  aria-label="Telegram"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <Send className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://www.youtube.com/@gainium"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="YouTube"
                  aria-label="YouTube"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <Youtube className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://community.gainium.io/c/feature-requests/6"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Feature Requests"
                  aria-label="Feature Requests"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://community.gainium.io/c/bug-reports/5"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Bug Reports"
                  aria-label="Bug Reports"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <Bug className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Link
                  to={linkTo(IS_CLOUD ? '/help' : '/')}
                  onClick={() => onNavigate?.()}
                  title="Help & Resources"
                  aria-label="Help & Resources"
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <HelpCircle className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Edit-mode action bar — Save keeps the live-persisted edits; Cancel
            rolls everything back to the snapshot taken on entering edit mode. */}
        {isEditMode && (
          <div className="border-t border-border p-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={cancelEditMode}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEditMode}
              className="flex-1 gradient-brand text-primary-foreground hover:opacity-90"
            >
              <Check className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Create New Dashboard Dialog — template picker + name step */}
      <CreateDashboardDialog
        open={createDashboardDialogOpen}
        onOpenChange={setCreateDashboardDialogOpen}
        existingNames={dashboards.map((d) => d.name)}
        onConfirm={handleCreateWithName}
      />

      {/* Create New Report Dialog */}
      <InputDialog
        open={createReportDialogOpen}
        onOpenChange={setCreateReportDialogOpen}
        title="Create New Report"
        description="Enter a name for the new report"
        placeholder="Report name"
        onConfirm={handleCreateReportWithName}
        confirmText="Create Report"
        validator={(value) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Report name is required';
          if (trimmed.length < 2)
            return 'Report name must be at least 2 characters';
          if (trimmed.length > 50)
            return 'Report name must be less than 50 characters';
          const exists = reports.some((r) => r.name === trimmed);
          if (exists) return 'A report with this name already exists';
          return null;
        }}
      />
    </div>
  );
};

export default NavigationSidebar;
