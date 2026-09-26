import { TabParamsCleaner } from '@/components/ui/tabs';
import logger from '@/lib/loggerInstance';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageSuspense } from '@/lib/lazyPage';
import { Slot } from '@/lib/extensions';
import { useSyncInitializer } from '@/lib/sync';
import { useKeyboardShortcutManager } from '../../hooks/useKeyboardShortcutManager';
import { usePaperContext } from '../../hooks/usePaperContext';
import { useShareContext } from '../../hooks/useShareContext';
import { useApplyVisualSettings } from '../../hooks/useVisualSettings';
import { useChatStore } from '../../stores/chatStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useUIStore } from '../../stores/uiStore';
import {
  getCategoryFromPath,
  useUserSessionsStore,
} from '../../stores/userSessionsStore';
import { useVisualSettingsStore } from '../../stores/visualSettingsStore';
import { Chat } from '../chat';
import ChatCore from '../chat/ChatCore';
import DevToolsDrawer from '../dev/DevToolsDrawer';
import { PromptPill } from '../onboarding/PromptPill';
import { OnboardingSurvey } from '../survey/OnboardingSurvey';
import { PWAStatus } from '../ui/PWAStatus';
import { EncryptionKeyNotice } from './EncryptionKeyNotice';
import HeaderWidgetsManager from './HeaderManager';
import MobileBottomNav from './MobileBottomNav';
import MobileSidebar from './MobileSidebar';
import Navbar from './Navbar';
import NavigationSidebar from './NavigationSidebar';
import { NavigationSidebarV2 } from './NavigationSidebarV2';
import NavigationWidgetsInitializer from './NavigationWidgetsInitializer';
import SharedPageLayout from './SharedPageLayout';
import Socket from './Socket';

interface MainLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  activePage: string;
  pageActions?: React.ReactNode;
  mobileActions?: React.ReactNode;
  desktopMenuItems?: React.ReactNode;
  navigationBack?: boolean;
  /**
   * When true, removes the fixed viewport-height constraint so that pages
   * taller than the viewport can be reached by scrolling. Use for pages that
   * embed tall split-panel layouts (bot creation/edit, terminal).
   */
  fullyScrollable?: boolean;
}

interface MainLayoutContentProps extends MainLayoutProps {
  /** Shell mode: the Navbar node page actions are portalled into. */
  pageActionsTargetRef?: (el: HTMLDivElement | null) => void;
  /** Shell mode: receives the page scroll container. */
  scrollContainerOutRef?: React.MutableRefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Persistent app shell
//
// The chrome (Navbar, sidebar, Socket, chat, MaxDetachedPanel, PWAStatus…)
// used to live INSIDE every page: each page rendered <MainLayout>, so every
// route change unmounted and remounted the whole shell and re-ran its
// queries, socket subscriptions and effects. `AppShell` is now a route-level
// layout rendered once around <Outlet/>. Pages keep rendering
// <MainLayout pageTitle=… activePage=… pageActions=…>; inside the shell that
// component renders only its children and publishes the page's layout props
// to the shell. Desktop page actions are portalled into the Navbar so they
// stay in the page's own React tree (and its context providers).
// Outside the shell (a route that is not under it, or the self-hosted App)
// MainLayout renders the full chrome itself, as before.
// ---------------------------------------------------------------------------

interface ShellChrome {
  pageTitle: string;
  activePage: string;
  mobileActions?: React.ReactNode;
  desktopMenuItems?: React.ReactNode;
  navigationBack?: boolean;
  fullyScrollable?: boolean;
}

interface ShellApi {
  /** 'shared' = share-link view: pages render bare content. */
  mode: 'shell' | 'shared';
  setChrome: (chrome: ShellChrome | null) => void;
  actionsTarget: HTMLElement | null;
  resetScroll: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

const sameChrome = (a: ShellChrome | null, b: ShellChrome | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.pageTitle === b.pageTitle &&
    a.activePage === b.activePage &&
    a.mobileActions === b.mobileActions &&
    a.desktopMenuItems === b.desktopMenuItems &&
    a.navigationBack === b.navigationBack &&
    a.fullyScrollable === b.fullyScrollable);

const noop = () => undefined;

/** Route-level layout: render as the element of a pathless parent route. */
export const AppShell: React.FC = () => {
  const { isDemo } = useShareContext();
  const sharedApi = useMemo<ShellApi>(
    () => ({
      mode: 'shared',
      setChrome: noop,
      actionsTarget: null,
      resetScroll: noop,
    }),
    []
  );
  if (isDemo) {
    return (
      <ShellContext.Provider value={sharedApi}>
        <SharedPageLayout>
          <PageSuspense>
            <Outlet />
          </PageSuspense>
        </SharedPageLayout>
      </ShellContext.Provider>
    );
  }
  return <AppShellContent />;
};

const AppShellContent: React.FC = () => {
  const [chrome, setChromeState] = useState<ShellChrome | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setChrome = useCallback((next: ShellChrome | null) => {
    setChromeState((prev) => (sameChrome(prev, next) ? prev : next));
  }, []);
  // A newly mounted page starts at the top (it used to get a brand-new
  // scroll container). Staying on the same page instance — e.g. a list and
  // its drawer route — keeps the scroll position, as before.
  const resetScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const api = useMemo<ShellApi>(
    () => ({ mode: 'shell', setChrome, actionsTarget, resetScroll }),
    [setChrome, actionsTarget, resetScroll]
  );

  return (
    <ShellContext.Provider value={api}>
      <MainLayoutContent
        pageTitle={chrome?.pageTitle ?? ''}
        activePage={chrome?.activePage ?? ''}
        mobileActions={chrome?.mobileActions}
        desktopMenuItems={chrome?.desktopMenuItems}
        navigationBack={chrome?.navigationBack ?? false}
        fullyScrollable={chrome?.fullyScrollable ?? false}
        pageActionsTargetRef={setActionsTarget}
        scrollContainerOutRef={scrollRef}
      >
        <PageSuspense>
          <Outlet />
        </PageSuspense>
      </MainLayoutContent>
    </ShellContext.Provider>
  );
};

/** A page's <MainLayout> inside the shell: publish layout props, render content. */
const ShellPage: React.FC<MainLayoutProps & { shell: ShellApi }> = ({
  shell,
  children,
  pageTitle,
  activePage,
  pageActions,
  mobileActions,
  desktopMenuItems,
  navigationBack,
  fullyScrollable,
}) => {
  const { setChrome, resetScroll, actionsTarget, mode } = shell;

  useLayoutEffect(() => {
    resetScroll();
    return () => setChrome(null);
  }, [setChrome, resetScroll]);

  useLayoutEffect(() => {
    setChrome({
      pageTitle,
      activePage,
      mobileActions,
      desktopMenuItems,
      navigationBack: navigationBack ?? false,
      fullyScrollable: fullyScrollable ?? false,
    });
  }, [
    setChrome,
    pageTitle,
    activePage,
    mobileActions,
    desktopMenuItems,
    navigationBack,
    fullyScrollable,
  ]);

  if (mode === 'shared') return <>{children}</>;
  return (
    <>
      {pageActions && actionsTarget
        ? createPortal(pageActions, actionsTarget)
        : null}
      {children}
    </>
  );
};

/**
 * Public entry point. Switches to `SharedPageLayout` when a share-link
 * query param is present so visitors never get the visitor's chrome,
 * sockets, notifications, or sidebar. The heavy layout body lives in
 * `MainLayoutContent` below — splitting on the boundary keeps React's
 * hook order stable across the two branches (the early-return branch
 * never runs MainLayoutContent's hooks at all, and vice-versa).
 */
const MainLayout: React.FC<MainLayoutProps> = (props) => {
  const shell = useContext(ShellContext);
  if (shell) return <ShellPage shell={shell} {...props} />;
  return <StandaloneMainLayout {...props} />;
};

const StandaloneMainLayout: React.FC<MainLayoutProps> = (props) => {
  const { isDemo } = useShareContext();
  if (isDemo) {
    return <SharedPageLayout>{props.children}</SharedPageLayout>;
  }
  return <MainLayoutContent {...props} />;
};

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({
  children,
  pageTitle,
  activePage,
  pageActions,
  mobileActions,
  desktopMenuItems,
  navigationBack,
  fullyScrollable = false,
  pageActionsTargetRef,
  scrollContainerOutRef,
}) => {
  const isStickyHeader = useDashboardStore((s) => s.isStickyHeader);
  const autoHideNavbar = useVisualSettingsStore((s) => s.autoHideNavbar);
  const useNavigationV2 = useUIStore((s) => s.useNavigationV2);

  // Stores kept to ensure side-effects wiring remains available via events
  const toggleChat = useChatStore((s) => s.toggleChat);
  const isChatOpen = useChatStore((s) => s.open);
  const location = useLocation();

  // Initialize cloud sync (no-op in sh; cloud registers a PouchDB poller).
  useSyncInitializer();

  // User sessions tracking. Select the two actions individually rather than
  // destructuring the whole store — a bare `useUserSessionsStore()` subscribes
  // MainLayout (which wraps the entire app chrome) to EVERY write to this store
  // from anywhere (cacheBotMetadata, visits growth, start/endPageVisit itself),
  // re-rendering the whole tree and, under a redirect/unmount timing race, able
  // to retrigger the page-visit effect below into a re-entry storm (React #185).
  // The action refs are stable (fixed by the store creator closure), so this is
  // a pure best-practice narrowing with zero behavior change to what/when fires.
  const startPageVisit = useUserSessionsStore((s) => s.startPageVisit);
  const endPageVisit = useUserSessionsStore((s) => s.endPageVisit);
  const tradingMode = useUIStore((s) => s.tradingMode);

  // `pageTitle` and `tradingMode` are the visit's PAYLOAD, not its identity —
  // both can settle asynchronously after mount (a detail page resolves its
  // name from a query; the demo-exit flow flips the trading mode several times
  // on a single route). Keep them in refs so the visit-lifecycle effect below
  // can read the current value without listing them as dependencies.
  const pageTitleRef = useRef(pageTitle);
  const tradingModeRef = useRef(tradingMode);
  pageTitleRef.current = pageTitle;
  tradingModeRef.current = tradingMode;

  // Track page visits. Keyed on the PATH alone: with `pageTitle`/`tradingMode`
  // in the dependency array, every title or mode change tore the visit down
  // and restarted it — three start/endPageVisit invocations per change, two of
  // them null-path no-ops. On the `/add-exchange` demo-exit flow the mode flips
  // repeatedly on one route, so those re-fires stacked up into the
  // invocation-storm the tripwire reports, and chopped the visit into
  // sub-second fragments that the 1s floor then discarded.
  useEffect(() => {
    const category = getCategoryFromPath(location.pathname);
    // Use pageTitle as displayName if available, and pass trading context
    startPageVisit(
      location.pathname,
      pageTitleRef.current,
      category,
      pageTitleRef.current,
      tradingModeRef.current
    );

    // End visit when component unmounts or location changes
    return () => {
      endPageVisit();
    };
  }, [location.pathname, startPageVisit, endPageVisit]);

  // Detail pages (rulebooks, journal entries, help articles) resolve their
  // title after mount, so re-announce it for the bot-metadata cache.
  // `startPageVisit` is idempotent for the page already being tracked, so this
  // only refreshes the cached display name — it never restarts the visit.
  useEffect(() => {
    startPageVisit(
      location.pathname,
      pageTitle,
      getCategoryFromPath(location.pathname),
      pageTitle,
      tradingModeRef.current
    );
  }, [location.pathname, pageTitle, startPageVisit]);

  // Auto-hide navbar state and logic
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navbarContainerRef = useRef<HTMLDivElement>(null);
  const [navbarHeight, setNavbarHeight] = useState(0);

  // Track navbar height for sticky offsets (used by sticky content like ReportFilterBar)
  useEffect(() => {
    const node = navbarContainerRef.current;
    if (!node) return;

    const update = () => {
      setNavbarHeight(node.offsetHeight);
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  // Handle scroll to show/hide navbar when auto-hide is enabled
  useEffect(() => {
    if (!autoHideNavbar) {
      setIsNavbarVisible(true);
      lastScrollY.current = 0;
      return;
    }

    const container = scrollContainerRef.current;
    const containerIsScrollable =
      container && container.scrollHeight > container.clientHeight;
    const scrollTarget: HTMLElement | Window = containerIsScrollable
      ? container
      : window;

    const getScrollTop = () =>
      scrollTarget instanceof Window
        ? scrollTarget.scrollY
        : scrollTarget.scrollTop;

    const handleScroll = () => {
      const currentScrollY = getScrollTop();
      const scrollDelta = currentScrollY - lastScrollY.current;

      if (scrollDelta < 0 || currentScrollY < 10) {
        setIsNavbarVisible(true);
      } else if (scrollDelta > 0 && currentScrollY > 10) {
        setIsNavbarVisible(false);
      }

      lastScrollY.current = currentScrollY;
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollTarget.removeEventListener('scroll', handleScroll);
  }, [autoHideNavbar, location.pathname]);

  // Set up event listener for AI chat toggle keyboard shortcut
  useEffect(() => {
    const handleToggleChat = () => {
      toggleChat();
    };

    window.addEventListener('toggleAiChat', handleToggleChat as EventListener);

    return () => {
      window.removeEventListener(
        'toggleAiChat',
        handleToggleChat as EventListener
      );
    };
  }, [toggleChat]);

  // Listen for dev onboarding toggle globally and update UI store
  useEffect(() => {
    const handleDevToggleOverlay = () => {
      logger.info(
        '[MainLayout] dev toggle received: dev:toggle-onboarding-steps'
      );
      const ui = useUIStore.getState();
      ui.toggleOnboardingStepsVisible();
      logger.info(
        '[MainLayout] onboardingStepsVisible set to',
        ui.onboardingStepsVisible
      );
    };
    window.addEventListener(
      'dev:toggle-onboarding-steps',
      handleDevToggleOverlay
    );
    return () => {
      window.removeEventListener(
        'dev:toggle-onboarding-steps',
        handleDevToggleOverlay
      );
    };
  }, []);

  // Check if we're on the chat page
  const isOnChatPage = location.pathname === '/chat';

  // Apply visual settings globally
  useApplyVisualSettings();

  // Initialize keyboard shortcut manager
  useKeyboardShortcutManager();

  // Keyboard shortcut manager is initialized above

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation widgets initializer */}
      <NavigationWidgetsInitializer />
      <TabParamsCleaner />

      {/* Socket for real-time communication */}
      <Socket />
      <OnboardingSurvey />
      <DemoModePill />

      {/* Cloud-only pending-account-delete banner. Sh renders nothing. */}
      <Slot name="layout.pendingDeleteBanner" />

      {/* Cloud-only detached Max chat panel (floating panel + bottom
          sheet + onboarding walkthrough overlay). Sh renders nothing.
          Mounted here so the floating panel sits above the page
          content but inside the providers tree. */}
      <Slot name="max.detachedPanel" />

      <div className="flex h-screen">
        {/* Navigation Sidebar - Desktop only */}
        <div className="hidden md:block">
          {useNavigationV2 ? (
            <NavigationSidebarV2 activePage={activePage} />
          ) : (
            <NavigationSidebar activePage={activePage} />
          )}
        </div>

        {/* Main content area with proper sticky context */}
        <div
          ref={(el) => {
            scrollContainerRef.current = el;
            if (scrollContainerOutRef) scrollContainerOutRef.current = el;
          }}
          className="flex-1 overflow-y-auto flex flex-col"
          data-main-content
          style={{ scrollBehavior: 'smooth', scrollbarGutter: 'stable' }}
        >
          <div
            className={
              fullyScrollable
                ? 'min-h-full shrink-0 flex flex-col px-[var(--panel-gap)] gap-[var(--panel-gap)]'
                : 'min-h-full shrink-0 md:min-h-0 md:flex-1 flex flex-col px-[var(--panel-gap)] gap-[var(--panel-gap)]'
            }
          >
            {/* Navbar */}
            <div
              ref={navbarContainerRef}
              className={`transition-transform duration-300 ease-in-out ${
                isStickyHeader || autoHideNavbar
                  ? 'sticky top-px z-40'
                  : 'mt-px'
              } ${autoHideNavbar && !isNavbarVisible ? '-translate-y-full' : 'translate-y-0'}`}
            >
              <Navbar
                pageTitle={pageTitle}
                pageActions={pageActions}
                mobileActions={mobileActions}
                desktopMenuItems={desktopMenuItems}
                activePage={activePage}
                navigateBack={navigationBack || false}
                {...(pageActionsTargetRef ? { pageActionsTargetRef } : {})}
              />
            </div>

            {/* Cloud-only scheduled-maintenance warning, inside the content
                column so it inherits the panel gutter + spacing. Sh renders
                nothing (a self-hosted operator maintains their own box). */}
            <Slot name="layout.maintenanceBanner" />

            {/* Self-hosted-only encryption-key recommendation. Renders
                nothing on cloud (the query is not even sent) and nothing
                once the operator has set a key or dismissed the notice. */}
            <EncryptionKeyNotice />

            {/* Page content with mobile bottom navigation padding and standardized spacing */}
            <main
              className={`transition-all duration-300 ease-in-out pb-20 md:pb-0 ${fullyScrollable ? 'shrink-0 flex flex-col' : 'shrink-0 md:flex-1 md:min-h-0 flex flex-col'}`}
              style={
                {
                  ['--navbar-offset' as never]: `${
                    (isStickyHeader || autoHideNavbar) &&
                    (isStickyHeader || isNavbarVisible)
                      ? navbarHeight + 1
                      : 1
                  }px`,
                } as React.CSSProperties
              }
            >
              {children}
            </main>
          </div>
        </div>

        {/* Dev Tools Drawer - Desktop only, Dev Mode */}
        {import.meta.env.DEV && !isOnChatPage && (
          <div className="hidden md:block">
            <DevToolsDrawer />
          </div>
        )}

        {/* Chat Sidebar - Desktop only */}
        {!isOnChatPage && (
          <div className="hidden md:block">
            <Chat />
          </div>
        )}
      </div>

      {/* Mobile Components */}
      {!isChatOpen && <MobileBottomNav activePage={activePage} />}
      <MobileSidebar activePage={activePage} />

      {/* Mobile Fullscreen Chat Modal */}
      {!isOnChatPage && isChatOpen && (
        <div className="md:hidden fixed inset-0 z-[70] bg-background">
          <ChatCore
            showHeader={true}
            showBackdrop={false}
            enableFullscreen={false}
            closeOnBackdropClick={false}
            containerClassName="h-full w-full rounded-none border-0 shadow-none"
          />
        </div>
      )}

      {/* PWA Status Indicators */}
      <PWAStatus />

      {/* Floating Chat Button - temporarily disabled, keep for future reuse */}
      {/* {!isOnChatPage && (
        <div className="hidden md:block">
          <FloatingChatButton />
        </div>
      )} */}

      {/* Nav Widgets Manager - Can be opened from navbar menu, hidden on mobile (use bottom nav customize instead) */}
      <div className="hidden md:block">
        <HeaderWidgetsManager />
      </div>
    </div>
  );
};

// Demo Mode Pill Component
const DemoModePill: React.FC = () => {
  const { isDemoMode } = usePaperContext();
  const navigate = useNavigate();

  const handleExit = useCallback(() => {
    navigate('/add-exchange', { replace: true });
  }, [navigate]);

  return (
    <PromptPill
      open={isDemoMode}
      text="Demo mode is active. Add your own data when you're ready."
      buttonLabel="Exit"
      onStart={handleExit}
    />
  );
};

export default MainLayout;
