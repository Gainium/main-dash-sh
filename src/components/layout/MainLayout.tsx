import { TabParamsCleaner } from '@/components/ui/tabs';
import logger from '@/lib/loggerInstance';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Slot } from '@/lib/extensions';
import { useSyncInitializer } from '@/lib/sync';
import { useKeyboardShortcutManager } from '../../hooks/useKeyboardShortcutManager';
import { usePaperContext } from '../../hooks/usePaperContext';
import { useShareContext } from '../../hooks/useShareContext';
import { useApplyVisualSettings } from '../../hooks/useVisualSettings';
import { useChatStore } from '../../stores/chatStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
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
import HeaderWidgetsManager from './HeaderManager';
import MobileBottomNav from './MobileBottomNav';
import MobileSidebar from './MobileSidebar';
import Navbar from './Navbar';
import NavigationSidebar from './NavigationSidebar';
import { NavigationSidebarV2 } from './NavigationSidebarV2';
import NavigationWidgetsInitializer from './NavigationWidgetsInitializer';
import QuantRulesBanner from './QuantRulesBanner';
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

/**
 * Public entry point. Switches to `SharedPageLayout` when a share-link
 * query param is present so visitors never get the visitor's chrome,
 * sockets, notifications, or sidebar. The heavy layout body lives in
 * `MainLayoutContent` below — splitting on the boundary keeps React's
 * hook order stable across the two branches (the early-return branch
 * never runs MainLayoutContent's hooks at all, and vice-versa).
 */
const MainLayout: React.FC<MainLayoutProps> = (props) => {
  const { isDemo } = useShareContext();
  if (isDemo) {
    return <SharedPageLayout>{props.children}</SharedPageLayout>;
  }
  return <MainLayoutContent {...props} />;
};

const MainLayoutContent: React.FC<MainLayoutProps> = ({
  children,
  pageTitle,
  activePage,
  pageActions,
  mobileActions,
  desktopMenuItems,
  navigationBack,
  fullyScrollable = false,
}) => {
  const isStickyHeader = useDashboardStore((s) => s.isStickyHeader);
  const autoHideNavbar = useVisualSettingsStore((s) => s.autoHideNavbar);
  const useNavigationV2 = useUIStore((s) => s.useNavigationV2);

  // Stores kept to ensure side-effects wiring remains available via events
  const toggleChat = useChatStore((s) => s.toggleChat);
  const isChatOpen = useChatStore((s) => s.open);
  useNotificationsStore();
  const location = useLocation();

  // Initialize cloud sync (no-op in sh; cloud registers a PouchDB poller).
  useSyncInitializer();

  // User sessions tracking
  const { startPageVisit, endPageVisit } = useUserSessionsStore();
  const tradingMode = useUIStore((s) => s.tradingMode);

  // Track page visits
  useEffect(() => {
    const category = getCategoryFromPath(location.pathname);
    // Use pageTitle as displayName if available, and pass trading context
    startPageVisit(
      location.pathname,
      pageTitle,
      category,
      pageTitle,
      tradingMode
    );

    // End visit when component unmounts or location changes
    return () => {
      endPageVisit();
    };
  }, [location.pathname, pageTitle, tradingMode, startPageVisit, endPageVisit]);

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

      {/* Shared (cloud + self-hosted) Binance Quantitative Rules (-4400)
          cooldown banner. Rendered directly (not via a cloud-only slot)
          because the feature ships to both editions; renders nothing when
          there are no active cooldowns. */}
      <QuantRulesBanner />

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
          ref={scrollContainerRef}
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
              />
            </div>

            {/* Cloud-only scheduled-maintenance warning, inside the content
                column so it inherits the panel gutter + spacing. Sh renders
                nothing (a self-hosted operator maintains their own box). */}
            <Slot name="layout.maintenanceBanner" />

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
