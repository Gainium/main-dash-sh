import ShortcutChip from '@/components/common/ShortcutChip';
import { TradingModeIcon } from '@/components/common/TradingModeIcon';
import { useTradingModeSwitching } from '@/stores/live/tradingContext';
import { BotCreditsUsage } from '@/components/subscription/BotCreditsUsage';
import { PlanBadge } from '@/components/subscription/PlanBadge';
import NewBotWizard from '@/components/wizards/NewBotWizard';
import { IS_CLOUD } from '@/config/mode';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { useNotifications } from '@/hooks/useNotifications';
import { usePaperContext } from '@/hooks/usePaperContext';
import { getDashboardShortcutId } from '@/lib/dashboardShortcuts';
import { showShortcutHint } from '@/lib/shortcutHints';
import {
  redirectToV1App,
  setPreferredUiVersion,
} from '@/lib/uiVersionPreference';
import { Slot } from '@/lib/extensions';
import { useChatStore } from '@/stores/chatStore';
import { useGlobalSearchStore } from '@/stores/globalSearchStore';
import {
  findDashboardBySlug,
  useMultiDashboardStore,
} from '@/stores/multiDashboardStore';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { useVisualSettingsStore } from '@/stores/visualSettingsStore';
import { useNotificationsSettingsStore } from '@/stores/notificationsSettingsStore';
import {
  Activity,
  ArrowLeftRight,
  Bell,
  ChevronLeft,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  Gift,
  Loader2,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useUIStore } from '../../stores/uiStore';
import { GlobalSearch, ShortcutManager } from '../modals';
import { NotificationPanel } from '../notifications';
import { Badge } from '../ui/badge';
import { BotttsAvatar } from '../ui/BotttsAvatar';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Switch } from '../ui/switch';
import TruncatedText from '../ui/TruncatedText';
import { NavbarNavigationWidgets } from '../widgets/navigation';

interface NavbarProps {
  pageTitle: string;
  pageActions?: React.ReactNode;
  mobileActions?: React.ReactNode;
  desktopMenuItems?: React.ReactNode;
  activePage: string;
  navigateBack?: boolean;
}

const CHAT_TOOLTIP_DELAY_MS = 30_000;
const CHAT_TOOLTIP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_TOOLTIP_LAST_SHOWN_AT_KEY = 'max-gain-ai-help-tooltip-last-shown-at';
const CHAT_DISCOVERY_CHAT_USED_KEY = 'max-gain-ai-help-chat-used';
const CHAT_DISCOVERY_SEARCH_USED_KEY = 'max-gain-ai-help-search-used';

const Navbar: React.FC<NavbarProps> = ({
  pageTitle,
  pageActions,
  mobileActions,
  desktopMenuItems,
  navigateBack = false,
}) => {
  const location = useLocation();
  const soundEnabled = useVisualSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useVisualSettingsStore((s) => s.setSoundEnabled);
  const enableDefaultSoundsIfNone = useNotificationsSettingsStore(
    (s) => s.enableDefaultSoundsIfNone
  );
  const isNavbarFavoritesVisible = useFavoritesStore(
    (s) => s.isNavbarFavoritesVisible
  );
  // previous direct useUIStore() call was removed to avoid full-store subscription
  const { toggleTradingMode, isLiveTrading, tradingMode, setLiveTrading } =
    usePaperContext();
  const { isSwitching: isTradingModeSwitching } = useTradingModeSwitching();
  const unreadCounts = useNotificationsStore((s) => s.unreadCounts);
  const toggleNotificationsPanel = useNotificationsStore(
    (s) => s.toggleNotificationsPanel
  );
  const privacyMode = useUIStore((s) => s.privacyMode);
  const togglePrivacyMode = useUIStore((s) => s.togglePrivacyMode);
  const showTradingModeIcon = useVisualSettingsStore(
    (s) => s.showTradingModeIcon
  );
  const moveButtonsToMenu = useVisualSettingsStore((s) => s.moveButtonsToMenu);
  const isMobile =
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false;
  const showMobileMenuLayout = isMobile || moveButtonsToMenu; // Use same menu layout on mobile and when enabled on desktop
  const [shortcutsManagerOpen, setShortcutsManagerOpen] = React.useState(false);
  const globalSearchOpen = useGlobalSearchStore((s) => s.isOpen);
  const openSearch = useGlobalSearchStore((s) => s.openSearch);
  const closeSearch = useGlobalSearchStore((s) => s.closeSearch);
  // toggleChat is the single entry point — it closes Max wherever it
  // lives (docked, detached, or minimized pill) and reopens in the
  // user's last-chosen presentation. So one button handles "the Max
  // Gain navbar pill" for all three states.
  const toggleChat = useChatStore((s) => s.toggleChat);
  const isChatOpen = useChatStore(
    (s) => s.open || s.detached || s.detachedMinimized
  );
  // The discovery tooltip should not fight Max during onboarding —
  // suppress while a walkthrough is running and re-trigger once Max
  // settles. `walkthrough` is a cloud-only field added by the Max
  // onboarding overlay; sh builds see undefined and the guard is a
  // no-op there. Typed cast keeps standalone-core typecheck green.
  const isWalkthroughActive = useChatStore(
    (s) =>
      (s as { walkthrough?: { active?: boolean } }).walkthrough?.active === true
  );

  // Shortcut chips are rendered directly via ShortcutChip; avoid pulling keys here

  // Determine which shortcut chips to show next to the page title based on activePage
  const titleShortcutIds = React.useMemo(() => {
    const path = location.pathname.toLowerCase();
    const ids: string[] = [];
    // When on a dashboard route, do not show the generic dashboard shortcut; a specific chip will be rendered below.
    // Check exact paths only - no partial matching
    if (path === '/') ids.push(SHORTCUT_IDS.NavOverview);
    else if (path === '/dashboard') ids.push(SHORTCUT_IDS.NavDashboard);
    else if (path === '/portfolio') ids.push(SHORTCUT_IDS.NavPortfolio);
    else if (path === '/overview') ids.push(SHORTCUT_IDS.NavOverview);
    else if (path === '/trading') ids.push(SHORTCUT_IDS.NavTrades);
    else if (path === '/terminal') ids.push(SHORTCUT_IDS.NavTradingTerminal);
    else if (path === '/bot') ids.push(SHORTCUT_IDS.NavTradingBots);
    else if (path === '/hedge/bot' || path === '/hedge-bots/dca')
      ids.push(SHORTCUT_IDS.NavHedgeDcaBots);
    else if (path === '/hedge/combo' || path === '/hedge-bots/combo')
      ids.push(SHORTCUT_IDS.NavHedgeComboBots);
    else if (path === '/grid' || path === '/grid-bots')
      ids.push(SHORTCUT_IDS.NavGridBots);
    else if (path === '/combo' || path === '/combo-bots')
      ids.push(SHORTCUT_IDS.NavComboBots);
    else if (path === '/rulebooks') ids.push(SHORTCUT_IDS.NavRulebooks);
    else if (path === '/journal') ids.push(SHORTCUT_IDS.NavJournal);
    else if (path === '/reports') ids.push(SHORTCUT_IDS.NavReports);
    else if (path === '/manual-backtesting/sessions')
      ids.push(SHORTCUT_IDS.NavManualBacktesting);
    else if (path === '/settings') ids.push(SHORTCUT_IDS.NavSettings);
    return ids;
  }, [location.pathname]);

  // Determine dynamic dashboard chip for current dashboard page
  const dashboards = useMultiDashboardStore((s) => s.dashboards);
  const dynamicDashboardShortcutId = React.useMemo(() => {
    const path = location.pathname.toLowerCase();
    // Match exact dashboard paths like /dashboard/slug or /dashboard/slug/subpage
    if (!path.match(/^\/dashboard\/[^/]+/)) return null;
    // Extract slug
    const parts = path.split('/');
    const slug = parts[2] || '';
    if (!slug) return null;
    const dash = findDashboardBySlug(dashboards, slug);
    return dash ? getDashboardShortcutId(dash.id) : null;
  }, [location.pathname, dashboards]);

  // Fetch notifications to keep unread counts updated
  useNotifications({
    type: 'all',
    page: 1,
    pageSize: 1, // We only need this to update the counts
  });

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const isMenuLockedRef = React.useRef(false);
  const [showNewBotWizard, setShowNewBotWizard] = React.useState(false);
  const [showChatHelpTooltip, setShowChatHelpTooltip] = React.useState(false);
  const chatButtonRef = React.useRef<HTMLButtonElement>(null);
  const [chatPopupPos, setChatPopupPos] = React.useState({ top: 0, left: 0 });

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  const userPicture = user?.picture;
  const userInitial = userName.charAt(0).toUpperCase();
  // Cloud users always have a plan (FREE if not subscribed); sh has no
  // billing concept so leave plan undefined and let the badge hide.
  const userPlan = IS_CLOUD
    ? (user?.subscription?.subscriptionPlanName ?? 'free')
    : user?.subscription?.subscriptionPlanName;
  const isBetaUser = (user?.groups ?? []).includes('Alpha');
  const creditsLocked = Number(user?.subscription?.credits?.locked ?? 0);
  const creditsBalance = Number(user?.subscription?.credits?.balance ?? 0);
  const creditsProgressMax =
    creditsBalance > 0 ? creditsBalance : Math.max(creditsLocked, 1);
  const consumableCreditsTotal =
    Number(user?.credits?.paid ?? 0) +
    Number(user?.credits?.subscription?.amount ?? 0);
  const consumableCreditsUsed = Number(user?.credits?.blocked ?? 0);
  const extraPurchasedCredits = Number(user?.credits?.paid ?? 0);

  const handleLogout = React.useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, navigate]);

  const handleNavigate = React.useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate]
  );

  const dismissChatHelpTooltip = React.useCallback(() => {
    setShowChatHelpTooltip(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        CHAT_TOOLTIP_LAST_SHOWN_AT_KEY,
        String(Date.now())
      );
    }
  }, []);

  const markDiscoveryInteraction = React.useCallback((key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, 'true');
  }, []);

  const shouldShowChatDiscoveryTooltip = React.useCallback(() => {
    if (typeof window === 'undefined') return false;

    // Don't compete with the Max onboarding walkthrough or a still-pending
    // first-run flag — the walkthrough's own copy invites the user to ask
    // Max anything, so a second affordance would be noise. `shouldOnBoard`
    // is a cloud-only field (not in core's User type) so access via a
    // typed cast — sh builds simply see undefined and skip this check.
    if (isWalkthroughActive) return false;
    const shouldOnBoard = (user as { shouldOnBoard?: boolean } | null)
      ?.shouldOnBoard;
    if (shouldOnBoard === true) return false;

    const hasUsedChat =
      window.localStorage.getItem(CHAT_DISCOVERY_CHAT_USED_KEY) === 'true';
    const hasUsedSearch =
      window.localStorage.getItem(CHAT_DISCOVERY_SEARCH_USED_KEY) === 'true';

    if (hasUsedChat || hasUsedSearch) {
      return false;
    }

    const lastShownAtRaw = window.localStorage.getItem(
      CHAT_TOOLTIP_LAST_SHOWN_AT_KEY
    );
    const lastShownAt = lastShownAtRaw ? Number(lastShownAtRaw) : 0;

    if (Number.isFinite(lastShownAt) && lastShownAt > 0) {
      const elapsed = Date.now() - lastShownAt;
      if (elapsed < CHAT_TOOLTIP_COOLDOWN_MS) {
        return false;
      }
    }

    return true;
  }, [isWalkthroughActive, user]);

  const showChatHelpTooltipIfEligible = React.useCallback(() => {
    if (!chatButtonRef.current) return;
    const triggerRect = chatButtonRef.current.getBoundingClientRect();
    if (triggerRect.width <= 0 || triggerRect.height <= 0) return;
    if (!shouldShowChatDiscoveryTooltip()) return;

    setShowChatHelpTooltip(true);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        CHAT_TOOLTIP_LAST_SHOWN_AT_KEY,
        String(Date.now())
      );
    }
  }, [shouldShowChatDiscoveryTooltip]);

  const updateChatPopupPosition = React.useCallback(() => {
    if (!chatButtonRef.current) return;

    const popupWidth = 288; // w-72
    const edgePadding = 12;
    const rect = chatButtonRef.current.getBoundingClientRect();

    const absoluteTop = rect.bottom + window.scrollY + 10;
    const preferredLeft = rect.right + window.scrollX - popupWidth;
    const minLeft = window.scrollX + edgePadding;
    const maxLeft =
      window.scrollX + window.innerWidth - popupWidth - edgePadding;
    const clampedLeft = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

    setChatPopupPos({ top: absoluteTop, left: clampedLeft });
  }, []);

  React.useLayoutEffect(() => {
    if (!showChatHelpTooltip) return;
    updateChatPopupPosition();
  }, [showChatHelpTooltip, updateChatPopupPosition]);

  React.useEffect(() => {
    if (!showChatHelpTooltip) return undefined;

    const handleReposition = () => {
      updateChatPopupPosition();
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [showChatHelpTooltip, updateChatPopupPosition]);

  // Single toggle handler — opens Max in the user's last presentation
  // (docked or detached) when closed, closes it when open. The
  // discovery + tooltip dismissals still fire on every click; that's
  // fine because they're idempotent.
  const openChatAssistant = React.useCallback(() => {
    dismissChatHelpTooltip();
    markDiscoveryInteraction(CHAT_DISCOVERY_CHAT_USED_KEY);
    showShortcutHint('toggleAiChat');
    toggleChat();
  }, [dismissChatHelpTooltip, markDiscoveryInteraction, toggleChat]);

  const switchToV1 = React.useCallback(() => {
    setPreferredUiVersion('v1');
    redirectToV1App();
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      showChatHelpTooltipIfEligible();
    }, CHAT_TOOLTIP_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [showChatHelpTooltipIfEligible]);

  // Fire the tooltip explicitly when Max onboarding finishes — the 30s
  // page-load timer may have already elapsed (and been suppressed by the
  // walkthrough guard) before the user reaches a settled state. Watching
  // the walkthrough active→inactive transition guarantees the tooltip
  // gets a chance to show right when the user lands on a quiet UI.
  const prevWalkthroughActiveRef = React.useRef<boolean>(isWalkthroughActive);
  React.useEffect(() => {
    const wasActive = prevWalkthroughActiveRef.current;
    prevWalkthroughActiveRef.current = isWalkthroughActive;
    if (wasActive && !isWalkthroughActive) {
      // Small delay so the tooltip doesn't pop the same frame the
      // walkthrough panel disappears — gives the eye a beat to settle.
      const t = window.setTimeout(() => showChatHelpTooltipIfEligible(), 600);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [isWalkthroughActive, showChatHelpTooltipIfEligible]);

  // Also fire the first time the user closes Max post-onboarding — the
  // moment they dismiss the chat, point at where it lives. Tracks the
  // open→closed transition; the same dedupe (cooldown + hasUsedChat
  // flag) still applies, so it won't double-fire with the active→inactive
  // path or the 30s timer.
  const prevChatOpenRef = React.useRef<boolean>(isChatOpen);
  React.useEffect(() => {
    const wasOpen = prevChatOpenRef.current;
    prevChatOpenRef.current = isChatOpen;
    if (wasOpen && !isChatOpen) {
      const t = window.setTimeout(() => showChatHelpTooltipIfEligible(), 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [isChatOpen, showChatHelpTooltipIfEligible]);

  React.useEffect(() => {
    if (!globalSearchOpen) return;
    markDiscoveryInteraction(CHAT_DISCOVERY_SEARCH_USED_KEY);
  }, [globalSearchOpen, markDiscoveryInteraction]);

  React.useEffect(() => {
    if (!isChatOpen) return;
    markDiscoveryInteraction(CHAT_DISCOVERY_CHAT_USED_KEY);
  }, [isChatOpen, markDiscoveryInteraction]);

  React.useEffect(() => {
    const handleDevTrigger = () => {
      setShowChatHelpTooltip(true);
    };

    window.addEventListener(
      'dev:trigger-max-gain-ai-help-tooltip',
      handleDevTrigger as EventListener
    );

    return () => {
      window.removeEventListener(
        'dev:trigger-max-gain-ai-help-tooltip',
        handleDevTrigger as EventListener
      );
    };
  }, []);

  React.useEffect(() => {
    const handleOpen = () => setIsMenuOpen(true);
    const handleClose = () => {
      if (isMenuLockedRef.current) return; // Prevent closing when locked
      setIsMenuOpen(false);
    };
    const handleToggle = () =>
      setIsMenuOpen((v) => (isMenuLockedRef.current ? true : !v));
    const handleLock = () => {
      isMenuLockedRef.current = true;
      setIsMenuOpen(true);
    };
    const handleUnlock = () => {
      isMenuLockedRef.current = false;
    };

    window.addEventListener('openPageMenu', handleOpen as EventListener);
    window.addEventListener('closePageMenu', handleClose as EventListener);
    window.addEventListener('togglePageMenu', handleToggle as EventListener);
    window.addEventListener('lockPageMenu', handleLock as EventListener);
    window.addEventListener('unlockPageMenu', handleUnlock as EventListener);

    return () => {
      window.removeEventListener('openPageMenu', handleOpen as EventListener);
      window.removeEventListener('closePageMenu', handleClose as EventListener);
      window.removeEventListener(
        'togglePageMenu',
        handleToggle as EventListener
      );
      window.removeEventListener('lockPageMenu', handleLock as EventListener);
      window.removeEventListener(
        'unlockPageMenu',
        handleUnlock as EventListener
      );
    };
  }, []);

  const handleMenuOpenChange = React.useCallback((open: boolean) => {
    if (!open && isMenuLockedRef.current) return; // Ignore close while locked
    setIsMenuOpen(open);
  }, []);

  // Listen for global events to open/toggle the Shortcut Manager
  React.useEffect(() => {
    const handleToggleShortcuts = () => setShortcutsManagerOpen((v) => !v);
    const handleOpenShortcuts = () => setShortcutsManagerOpen(true);
    const handleCloseShortcuts = () => setShortcutsManagerOpen(false);

    window.addEventListener(
      'toggleShortcutManager',
      handleToggleShortcuts as EventListener
    );
    window.addEventListener(
      'openShortcutManager',
      handleOpenShortcuts as EventListener
    );
    window.addEventListener(
      'closeShortcutManager',
      handleCloseShortcuts as EventListener
    );

    return () => {
      window.removeEventListener(
        'toggleShortcutManager',
        handleToggleShortcuts as EventListener
      );
      window.removeEventListener(
        'openShortcutManager',
        handleOpenShortcuts as EventListener
      );
      window.removeEventListener(
        'closeShortcutManager',
        handleCloseShortcuts as EventListener
      );
    };
  }, []);

  return (
    <>
      <nav className="glass-surface-card rounded-lg shadow-[0_2px_20px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.05)]">
        <div className="w-full mx-auto">
          <div className="flex items-center h-14 min-w-0 px-md">
            {/* Left side - Logo/Brand and Page Title */}
            <div className="flex items-center gap-sm min-w-0">
              {navigateBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-8 w-8"
                  onClick={() => window.history.back()}
                  title="Go back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              {/* Trading mode icon before page title — reads as a status
                  prefix (green=live, gray=paper, blue=demo). */}
              {showTradingModeIcon && (
                <TradingModeIcon
                  size="md"
                  clickable={true}
                  showTooltip={true}
                  onClick={toggleTradingMode}
                />
              )}
              {/* Title component with shortcut chips - spans available width */}
              <div className="flex items-center gap-xs min-w-0 flex-1">
                <TruncatedText
                  text={pageTitle}
                  className="text-xl font-bold"
                  as="h1"
                />
                {/* Page title chips: show relevant navigation shortcut for this page */}
                {titleShortcutIds.map((id) => (
                  <ShortcutChip key={id} id={id} />
                ))}
                {dynamicDashboardShortcutId && (
                  <ShortcutChip id={dynamicDashboardShortcutId} />
                )}
              </div>
            </div>

            {/* Center - Navigation Widgets */}
            <div
              className="flex-1 flex justify-center mx-8 min-w-0 max-w-full overflow-hidden"
              data-tour="navigation-widgets"
            >
              {isNavbarFavoritesVisible && <NavbarNavigationWidgets />}
              {!isNavbarFavoritesVisible && <div></div>}
            </div>

            {/* Right side - Navigation Actions */}
            <div
              className="flex items-center gap-1 shrink-0"
              data-tour="page-actions"
            >
              {/* Page actions - hidden on mobile; also hidden on desktop when moved to menu */}
              <div
                className={`hidden md:flex gap-1 ${moveButtonsToMenu ? 'md:hidden' : ''}`}
              >
                {pageActions}
              </div>

              {/* Sync Button — cloud-only. Sh renders nothing. */}
              <Slot
                name="navbar.syncButtonDesktop"
                moveToMenu={moveButtonsToMenu}
              />

              {/* Global Search — expanded field on desktop, icon-only on mobile */}
              <button
                type="button"
                onClick={openSearch}
                title="Global Search"
                data-tour="global-search-trigger"
                className={`hidden md:flex items-center gap-xs h-8 px-3 min-w-[280px] rounded-lg bg-muted/60 hover:bg-muted text-sm text-muted-foreground transition-colors ${moveButtonsToMenu ? 'md:hidden' : ''}`}
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left truncate">
                  Search pages, bots, settings, help…
                </span>
                <ShortcutChip
                  id={SHORTCUT_IDS.ManagerGlobalSearch}
                  muted
                  className="ml-auto"
                />
              </button>
              <Button
                variant="ghost"
                size="sm"
                className={`md:hidden p-1 h-8 w-8 ${moveButtonsToMenu ? 'hidden md:hidden' : ''}`}
                onClick={openSearch}
                title="Global Search (Cmd+.)"
                data-tour="global-search-trigger-mobile"
              >
                <Search className="h-4 w-4" />
              </Button>

              {/* Notifications - hide desktop icon when moved to menu (mobile remains) */}
              <NotificationPanel />

              {IS_CLOUD && (
                <div className="relative">
                  <Button
                    ref={chatButtonRef}
                    variant="ghost"
                    size="sm"
                    className={`p-1 h-8 w-8 bg-gradient-ai-assistant text-white hover:text-white hover:opacity-90 ${moveButtonsToMenu ? 'hidden md:hidden' : ''}`}
                    onClick={openChatAssistant}
                    title="Open Max Gain AI Assistant"
                    aria-label="Open Max Gain AI Assistant"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  {showChatHelpTooltip &&
                    createPortal(
                      <div
                        style={{
                          top: chatPopupPos.top,
                          left: chatPopupPos.left,
                          backdropFilter: 'blur(14px)',
                          WebkitBackdropFilter: 'blur(14px)',
                        }}
                        className="absolute z-[9999] w-72 rounded-xl border border-border bg-popover/70 shadow-xl p-4"
                      >
                        <button
                          type="button"
                          onClick={dismissChatHelpTooltip}
                          className="absolute right-3 top-3 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p className="text-base font-semibold pr-6 mb-1">
                          ✨ I'll be right here
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                          Click anytime to ask me anything — bot setup, strategy
                          ideas, indicators, or how something in the app works.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={dismissChatHelpTooltip}
                          >
                            Later
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1"
                            onClick={openChatAssistant}
                          >
                            Try it
                          </Button>
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
              )}

              {/* Create Bot button - temporarily disabled while V2 rollout is active.
              <Button
                variant="default"
                size="sm"
                className={`p-1 h-8 w-8 md:h-auto md:w-auto ${moveButtonsToMenu ? 'hidden md:hidden' : ''}`}
                onClick={() => setShowNewBotWizard(true)}
                title="Create Bot"
                aria-label="Create Bot"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden md:inline ml-2">New Bot</span>
              </Button>
              */}

              {/* User account menu (avatar trigger) */}
              <DropdownMenu
                modal={false}
                open={isMenuOpen}
                onOpenChange={handleMenuOpenChange}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-8 w-8 relative rounded-full"
                    data-tour="page-menu-trigger"
                    title={userName}
                    aria-label="Account menu"
                  >
                    <span className="w-full h-full rounded-full overflow-hidden flex">
                      {userPicture && !userPicture.startsWith('data:') ? (
                        <img
                          src={userPicture}
                          alt={userName}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <BotttsAvatar
                          seed={userEmail || userName}
                          alt={userName}
                          fallbackInitial={userInitial}
                        />
                      )}
                    </span>
                    {showMobileMenuLayout && unreadCounts?.total > 0 && (
                      <span
                        className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 text-xs leading-5 flex items-center justify-center text-white border-0 rounded-full ${unreadCounts.bot > 0 ? 'bg-destructive' : 'bg-success'}`}
                      >
                        {unreadCounts.total}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 max-h-[calc(100vh-4rem)] overflow-y-auto"
                >
                  {/* User identity header */}
                  <div className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                        {userPicture && !userPicture.startsWith('data:') ? (
                          <img
                            src={userPicture}
                            alt={userName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <BotttsAvatar
                            seed={userEmail || userName}
                            alt={userName}
                            fallbackInitial={userInitial}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {userName}
                        </div>
                        {userEmail && (
                          <div className="text-xs text-muted-foreground truncate">
                            {userEmail}
                          </div>
                        )}
                      </div>
                    </div>
                    {(isBetaUser || userPlan) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {isBetaUser && (
                          <Badge
                            variant="destructive"
                            // eslint-disable-next-line spacing/no-hardcoded-font-size
                            className="h-5 px-1.5 text-[10px] font-semibold tracking-wide"
                          >
                            <Activity className="h-2.5 w-2.5" />
                            BETA
                          </Badge>
                        )}
                        {userPlan && <PlanBadge plan={userPlan} size="sm" />}
                      </div>
                    )}
                  </div>
                  {IS_CLOUD && (
                    <div className="px-2 pb-2">
                      <BotCreditsUsage
                        creditsLocked={creditsLocked}
                        creditsBalance={creditsBalance}
                        consumableCreditsUsed={consumableCreditsUsed}
                        consumableCreditsTotal={consumableCreditsTotal}
                        extraPurchasedCredits={extraPurchasedCredits}
                        creditsProgressMax={creditsProgressMax}
                        compact
                      />
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  {IS_CLOUD && (
                    <>
                      <DropdownMenuItem
                        onSelect={() => handleNavigate('/subscription')}
                      >
                        <div className="flex items-center gap-xs">
                          <CreditCard className="h-4 w-4" />
                          <span>Subscription</span>
                        </div>
                      </DropdownMenuItem>
                      {!user?.isEuRegion && (
                        <DropdownMenuItem
                          onSelect={() => handleNavigate('/affiliate')}
                        >
                          <div className="flex items-center gap-xs">
                            <Users className="h-4 w-4" />
                            <span>Affiliate</span>
                          </div>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => handleNavigate('/rewards')}
                      >
                        <div className="flex items-center gap-xs">
                          <Gift className="h-4 w-4" />
                          <span>Rewards</span>
                        </div>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={() => handleNavigate('/settings')}
                  >
                    <div className="flex items-center gap-xs">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </div>
                  </DropdownMenuItem>
                  {/* Cloud Sync entry — cloud-only. Always available so the
                      sync sidebar can be opened even when no sync is active. */}
                  <Slot name="navbar.syncMenuItem" />
                  <DropdownMenuSeparator />
                  {/* Unified mobile-style menu: show on mobile and on desktop when option is enabled */}
                  {showMobileMenuLayout && (
                    <>
                      {mobileActions && (
                        <>
                          {mobileActions}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          showShortcutHint('toggleNotifications');
                          toggleNotificationsPanel();
                        }}
                      >
                        <div className="flex items-center gap-xs w-full">
                          <Bell className="h-4 w-4" />
                          <span className="flex-1">Notifications</span>
                          <ShortcutChip
                            id={SHORTCUT_IDS.ActionNotifications}
                            variant="text"
                            className="text-xs opacity-60"
                          />
                          {unreadCounts?.total > 0 && (
                            <span
                              className={`ml-auto text-xs px-1.5 py-0.5 rounded-full text-white ${unreadCounts.bot > 0 ? 'bg-destructive' : 'bg-success'}`}
                            >
                              {unreadCounts.total}
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          openSearch();
                        }}
                      >
                        <div className="flex items-center gap-xs w-full">
                          <Search className="h-4 w-4" />
                          <span className="flex-1">Search</span>
                          <ShortcutChip
                            id={SHORTCUT_IDS.ManagerGlobalSearch}
                            variant="text"
                            className="text-xs opacity-60"
                          />
                        </div>
                      </DropdownMenuItem>
                    </>
                  )}
                  {!showMobileMenuLayout && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <div className="flex items-center justify-between gap-md w-full">
                      <div className="flex items-center gap-xs">
                        <Volume2 className="h-4 w-4" />
                        <span>Enable sounds</span>
                      </div>
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={(checked) => {
                          setSoundEnabled(checked);
                          // "Enable sounds" should actually produce sound: if the
                          // user hasn't picked any per-type sounds yet, turn the
                          // defaults on so the switch isn't silently a no-op.
                          if (checked) enableDefaultSoundsIfNone();
                        }}
                      />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <div className="flex items-center justify-between gap-md w-full">
                      <div className="flex items-center gap-xs">
                        {privacyMode ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span>Privacy mode</span>
                      </div>
                      <Switch
                        checked={privacyMode}
                        onCheckedChange={togglePrivacyMode}
                      />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <div className="flex items-center justify-between gap-md w-full">
                      <div className="flex items-center gap-xs">
                        <DollarSign className="h-4 w-4" />
                        <span>Live trading</span>
                        {isTradingModeSwitching && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <Switch
                        checked={isLiveTrading}
                        onCheckedChange={(checked) => setLiveTrading(checked)}
                        disabled={tradingMode === 'demo'}
                        className="data-[state=checked]:bg-success"
                      />
                    </div>
                  </DropdownMenuItem>
                  {!showMobileMenuLayout && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          showShortcutHint('toggleShortcutManager');
                          setShortcutsManagerOpen(true);
                        }}
                        data-tour="shortcuts-menu-item"
                      >
                        <div className="flex items-center gap-xs w-full">
                          <Zap className="h-4 w-4" />
                          <span className="flex-1">Shortcuts</span>
                          <ShortcutChip
                            id={SHORTCUT_IDS.ManagerShortcuts}
                            variant="text"
                            className="text-xs opacity-60"
                          />
                        </div>
                      </DropdownMenuItem>
                      {desktopMenuItems && (
                        <>
                          <DropdownMenuSeparator />
                          {desktopMenuItems}
                        </>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />

                  {/* Navigation bar options */}
                  <DropdownMenuItem
                    onSelect={() => {
                      window.dispatchEvent(
                        new CustomEvent('openWidgetsManager', {
                          detail: { registry: 'navigation' },
                        })
                      );
                    }}
                  >
                    <div className="flex items-center justify-between gap-xs w-full">
                      <div className="flex items-center gap-xs">
                        <Settings className="h-4 w-4" />
                        <span>Nav options</span>
                      </div>
                    </div>
                  </DropdownMenuItem>

                  {IS_CLOUD && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={switchToV1}>
                        <div className="flex items-center gap-xs">
                          <ArrowLeftRight className="h-4 w-4" />
                          <span>Switch to V1</span>
                        </div>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>
                    <div className="flex items-center gap-xs text-destructive">
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
      {/* Shortcut Manager */}
      <ShortcutManager
        open={shortcutsManagerOpen}
        onOpenChange={setShortcutsManagerOpen}
      />
      {/* Global Search */}
      <GlobalSearch
        open={globalSearchOpen}
        onOpenChange={(open) => {
          if (open) {
            openSearch();
          } else {
            closeSearch();
          }
        }}
      />
      {/* Sync Activity Modal — cloud-only */}
      <Slot name="navbar.syncActivityModal" />
      {/* New Bot Wizard */}
      <NewBotWizard
        open={showNewBotWizard}
        onOpenChange={setShowNewBotWizard}
      />
    </>
  );
};

export default Navbar;
