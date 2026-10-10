/* eslint-disable @typescript-eslint/no-explicit-any */
// Trading context removed from V2 left sidebar per user request
// Logo removed as per request - do not render at top of V2 left sidebar
import { Badge } from '@/components/ui/badge';
import { TruncatedText } from '@/components/ui/TruncatedText';
import { linkTo } from '@/lib/demoMode';
import { logger } from '@/lib/loggerInstance';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '@/stores/multiDashboardStore';
import {
  createReportSlug,
  useMultiReportStore,
} from '@/stores/multiReportStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { getBotTypeRoute, getNavigationBotTypes } from '@/utils/botUtils';
import { BarChart2, ChevronRight, LayoutDashboard } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NavVisibilityGate } from '../NavVisibilityGate';
import { NAVIGATION_GROUPS } from './navigationConfig';
import type { NavigationGroup, SecondaryPanel } from './types';

interface LeftSidebarProps {
  activePage: string;
  activePanel: SecondaryPanel | null;
  onPanelToggle: (panel: SecondaryPanel | null) => void;
  onPanelHover?: (panel: SecondaryPanel | null) => void;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
  onPanelRequestClose?: () => void; // ask parent to request panel close with delay
  onPanelCancelClose?: () => void; // cancel a previously requested close
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activePage,
  activePanel,
  onPanelToggle,
  onPanelHover,
  onNavigate,
  onPanelRequestClose,
  onPanelCancelClose,
}) => {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const hoverTimersRef = useRef<Record<string, number | null>>({});
  const navigationSecondaryPinned = useUIStore(
    (s) => s.navigationSecondaryPinned
  );
  const visibleIdsFromStore = useUIStore((s) => s.leftNavVisibleIds);
  const leftNavOrder = useUIStore((s) => s.leftNavOrder);
  const showLabels = useUIStore((s) => s.leftNavShowLabels);
  const labelOverrides = useUIStore((s) => s.leftNavLabelOverrides);
  const visibleIds = (
    visibleIdsFromStore?.length
      ? visibleIdsFromStore
      : NAVIGATION_GROUPS.map((g) => g.id)
  ).filter((i) => i !== 'help' && i !== 'more' && i !== 'logout');

  // Add bot-type items to the registry so they can be toggled and rendered
  const botTypes = getNavigationBotTypes();
  const botItems = botTypes.map((b) => {
    const id = `bottype-${b.type}`;
    return {
      id,
      label: labelOverrides[id] ?? b.label,
      icon: b.icon,
      href: getBotTypeRoute(b.type),
    };
  });
  // Include dashboards so they can be rendered when user toggles them on
  const dashboards = useMultiDashboardStore((s) => s.dashboards);
  const dashboardItems = dashboards.map((d) => {
    const id = `dashboard-${d.id}`;
    return {
      id,
      label: labelOverrides[id] ?? d.name,
      icon: <LayoutDashboard className="w-4 h-4" />,
      href: `/dashboard/${createDashboardSlug(d.name)}`,
    };
  });
  const reports = useMultiReportStore((s) => s.reports);
  const reportItems = reports.map((report) => {
    const id = `report-${report.id}`;
    return {
      id,
      label: labelOverrides[id] ?? report.name,
      icon: <BarChart2 className="w-4 h-4" />,
      href: `/reports/${createReportSlug(report.name)}`,
    };
  });

  const entries: [string, any][] = [
    ...NAVIGATION_GROUPS.map((g) => {
      const overrideLabel = labelOverrides[g.id] ?? g.label;
      return [
        g.id,
        {
          ...g,
          label: overrideLabel,
        },
      ] as [string, any];
    }),
    ...botItems.map((b) => [b.id, b] as [string, any]),
    ...dashboardItems.map((d) => [d.id, d] as [string, any]),
    ...reportItems.map((d) => [d.id, d] as [string, any]),
  ];
  const allItemsById = new Map<string, any>(entries);
  const helpGroup = allItemsById.get('help');

  // Refs and state for measuring available space and truncating the list
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sampleItemRef = useRef<HTMLDivElement | null>(null);
  const [visibleTopCount, setVisibleTopCount] = useState<number | null>(null);

  const handleItemClick = (group: NavigationGroup) => {
    // Clear any hover timer for this group
    const t = hoverTimersRef.current[group.id];
    if (t) {
      clearTimeout(t);
      hoverTimersRef.current[group.id] = null;
    }

    // Handle logout specially
    if (group.id === 'logout') {
      handleLogout();
      return;
    }

    if (group.hasSecondaryPanel && group.panelType) {
      // Always toggle the panel, even if it's already active
      // This enables the auto-pin behavior when clicking the same item twice
      onPanelToggle(group.panelType);
    } else {
      // Close panel when clicking items without panels
      onPanelToggle(null);
      onNavigate?.();
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const isItemActive = (group: NavigationGroup) => {
    // Normalize activePage to remove query string and trailing slash
    const normalizedActive = (activePage || '')
      .split('?')[0]
      .replace(/\/$/, '');

    if (group.href) {
      // For root path, only match exact path as every route starts with '/'
      if (group.href === '/')
        return normalizedActive === '' || normalizedActive === '/';

      // For other paths, exact match or startsWith to support nested routes
      const normalizedHref = group.href.replace(/\/$/, '');
      return (
        normalizedActive === normalizedHref ||
        normalizedActive.startsWith(normalizedHref + '/')
      );
    }
    if (group.panelType) {
      return activePanel === group.panelType;
    }
    return false;
  };

  // Precompute topItems so hook knows the total count to consider
  const topItems = leftNavOrder
    .filter((id) => visibleIds.includes(id))
    .map((id) => allItemsById.get(id))
    .filter((item): item is any => Boolean(item));

  // Start measuring for visible count
  useVisibleTopCount(
    containerRef,
    topInnerRef,
    bottomRef,
    sampleItemRef,
    setVisibleTopCount,
    topItems.length
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-lg overflow-visible self-center w-[50px] max-h-screen`}
      onMouseEnter={() => onPanelCancelClose?.()}
      onMouseLeave={() => {
        if (!navigationSecondaryPinned) {
          onPanelRequestClose?.();
        }
      }}
    >
      {/* Primary bar wrapper (size depends on content, maxes at viewport height) */}
      <div
        className={`bg-(--primary-bar) rounded-lg flex flex-col items-center gap-y-3 px-1 py-3 overflow-hidden max-h-screen`}
      >
        <div
          ref={topInnerRef}
          className="w-full flex flex-col items-center gap-y-3"
        >
          {(() => {
            const toRender =
              visibleTopCount === null
                ? topItems
                : topItems.slice(0, visibleTopCount);

            return toRender.map((group, index) => {
              const isActive = isItemActive(group);
              const content = (
                <div
                  ref={index === 0 ? sampleItemRef : undefined}
                  className={`relative w-full flex flex-col items-center justify-center gap-2 py-2 cursor-pointer overflow-hidden`}
                  onClick={() => handleItemClick(group)}
                  title={group.label}
                  onMouseEnter={() => {
                    onPanelCancelClose?.();
                    if (group.hasSecondaryPanel && group.panelType) {
                      const t = window.setTimeout(() => {
                        onPanelHover?.(group.panelType as SecondaryPanel);
                      }, 300);
                      hoverTimersRef.current[group.id] = t;
                    }
                  }}
                  onMouseLeave={() => {
                    const t = hoverTimersRef.current[group.id];
                    if (t) {
                      clearTimeout(t);
                      hoverTimersRef.current[group.id] = null;
                    }
                    if (
                      !navigationSecondaryPinned &&
                      group.panelType === activePanel
                    ) {
                      onPanelRequestClose?.();
                    }
                  }}
                >
                  <div
                    className={`rounded-lg w-8 h-8 flex items-center justify-center ${
                      isActive
                        ? 'bg-(--primary-bar-text)'
                        : 'hover:bg-primary-foreground/5'
                    }`}
                  >
                    {React.isValidElement(group.icon)
                      ? React.cloneElement(
                          group.icon as React.ReactElement<any>,
                          {
                            className: `w-4 h-4 shrink-0 ${isActive ? 'text-[var(--primary-bar)]' : 'text-[var(--primary-bar-text)]'}`,
                          }
                        )
                      : React.createElement(group.icon as any, {
                          className: `w-4 h-4 shrink-0 ${isActive ? 'text-[var(--primary-bar)]' : 'text-[var(--primary-bar-text)]'}`,
                        })}
                  </div>

                  {showLabels && (
                    <div className="w-[42px]">
                      <TruncatedText
                        text={group.label}
                        as="div"
                        className={`block w-[42px] max-w-[42px] text-xs text-center leading-tight mx-auto ${
                          isActive
                            ? 'text-(--primary-bar-text)'
                            : 'text-(--primary-bar-text) opacity-80'
                        }`}
                        maxWidth="42px"
                      />
                    </div>
                  )}

                  {group.badge && (
                    <Badge
                      variant={
                        group.badge.variant === 'beta'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="absolute -top-1 -right-1 text-xs px-1 py-0 h-4"
                    >
                      {group.badge.text}
                    </Badge>
                  )}

                  {group.hasSecondaryPanel && (
                    <ChevronRight
                      className={`absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 transition-transform ${
                        isActive
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  )}
                </div>
              );

              return (
                <NavVisibilityGate
                  key={group.id}
                  useIsVisible={group.useIsVisible}
                >
                  {group.href ? (
                    <Link to={linkTo(group.href)} className="w-full">
                      {content}
                    </Link>
                  ) : (
                    <div className="w-full">{content}</div>
                  )}
                </NavVisibilityGate>
              );
            });
          })()}
        </div>

        {/* Pinned bottom actions: More, Help, and Logout */}
        <div
          ref={bottomRef}
          className="w-full shrink-0 flex flex-col items-center gap-y-1 px-1 pb-2"
        >
          {allItemsById.get('more') && (
            <div key="more" className="w-full">
              <div
                className={`relative w-full flex flex-col items-center justify-center gap-2 py-2 cursor-pointer overflow-hidden`}
                onClick={() => handleItemClick(allItemsById.get('more'))}
                title={allItemsById.get('more').label}
              >
                <div
                  className={`rounded-lg w-8 h-8 flex items-center justify-center hover:bg-primary-foreground/5`}
                >
                  {React.isValidElement(allItemsById.get('more').icon)
                    ? React.cloneElement(
                        allItemsById.get('more')
                          .icon as React.ReactElement<any>,
                        {
                          className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                        }
                      )
                    : React.createElement(
                        allItemsById.get('more').icon as any,
                        {
                          className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                        }
                      )}
                </div>
              </div>
            </div>
          )}

          {helpGroup && (
            <div key={helpGroup.id} className="w-full">
              <div
                className={`relative w-full flex flex-col items-center justify-center gap-2 py-2 cursor-pointer overflow-hidden`}
                onClick={() => handleItemClick(helpGroup)}
                title={helpGroup.label}
              >
                <div
                  className={`rounded-lg w-8 h-8 flex items-center justify-center hover:bg-primary-foreground/5`}
                >
                  {React.isValidElement(helpGroup.icon)
                    ? React.cloneElement(
                        helpGroup.icon as React.ReactElement<any>,
                        {
                          className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                        }
                      )
                    : React.createElement(helpGroup.icon as any, {
                        className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                      })}
                </div>
              </div>
            </div>
          )}

          {allItemsById.get('logout') && (
            <div key="logout" className="w-full">
              <div
                className={`relative w-full flex flex-col items-center justify-center gap-2 py-2 cursor-pointer overflow-hidden`}
                onClick={() => handleItemClick(allItemsById.get('logout'))}
                title={allItemsById.get('logout').label}
              >
                <div
                  className={`rounded-lg w-8 h-8 flex items-center justify-center hover:bg-primary-foreground/5`}
                >
                  {React.isValidElement(allItemsById.get('logout').icon)
                    ? React.cloneElement(
                        allItemsById.get('logout')
                          .icon as React.ReactElement<any>,
                        {
                          className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                        }
                      )
                    : React.createElement(
                        allItemsById.get('logout').icon as any,
                        {
                          className: `w-4 h-4 shrink-0 text-[var(--primary-bar-text)]`,
                        }
                      )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Measure available space and update visibleTopCount whenever layout changes
function useVisibleTopCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  topInnerRef: React.RefObject<HTMLDivElement | null>,
  bottomRef: React.RefObject<HTMLDivElement | null>,
  sampleItemRef: React.RefObject<HTMLDivElement | null>,
  setVisibleTopCount: (n: number | null) => void,
  totalTopItems: number
) {
  useEffect(() => {
    if (!containerRef.current) return;

    const calc = () => {
      const container = containerRef.current;
      if (!container) return;
      const bottom = bottomRef.current;

      // try to find a sample element: prefer explicit ref, fallback to first child
      const sample =
        sampleItemRef.current ?? topInnerRef.current?.firstElementChild ?? null;

      const containerHeight = container.clientHeight;
      const bottomHeight = bottom ? bottom.getBoundingClientRect().height : 0;

      if (!sample) {
        // If we don't have a sample yet, render all
        setVisibleTopCount(null);
        return;
      }

      const sampleRect = (sample as Element).getBoundingClientRect();
      const itemHeight = sampleRect.height;

      // compute gap/row-gap from the topInner container
      let gap = 0;
      try {
        const cs = topInnerRef.current
          ? window.getComputedStyle(topInnerRef.current)
          : null;
        if (cs && cs.rowGap) gap = parseFloat(cs.rowGap) || 0;
      } catch {
        // ignore
      }

      // account for container paddings
      let paddingTop = 0;
      let paddingBottom = 0;
      try {
        const cs = window.getComputedStyle(container);
        paddingTop = parseFloat(cs.paddingTop) || 0;
        paddingBottom = parseFloat(cs.paddingBottom) || 0;
      } catch {
        // ignore
      }

      const available =
        containerHeight - bottomHeight - paddingTop - paddingBottom;

      logger.debug('[LeftSidebar] measure', {
        containerHeight,
        bottomHeight,
        paddingTop,
        paddingBottom,
        sampleHeight: itemHeight,
        gap,
        available,
        totalTopItems,
      });

      if (itemHeight <= 0 || available <= 0) {
        setVisibleTopCount(0);
        return;
      }

      // each item occupies itemHeight + gap except last; use conservative estimate
      const count = Math.floor((available + gap) / (itemHeight + gap));

      // If all fit, render all (null means render all)
      if (count >= totalTopItems) {
        setVisibleTopCount(null);
        return;
      }

      setVisibleTopCount(count > 0 ? count : 0);
    };

    // Initial calc and on resize
    calc();
    const ro = new ResizeObserver(() => calc());
    ro.observe(containerRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    if (topInnerRef.current) ro.observe(topInnerRef.current);
    window.addEventListener('resize', calc);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, [
    containerRef,
    topInnerRef,
    bottomRef,
    sampleItemRef,
    setVisibleTopCount,
    totalTopItems,
  ]);
}

// Hook usage
// wire refs to containerRef in the component via ref attribute
// but the component's containerRef is currently declared above and available here through closure
// We call the hook in module scope below by exporting nothing; instead, call it inside component
