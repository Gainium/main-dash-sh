import React, { useEffect } from 'react';
import GridLayout from '../layout/GridLayout';
import { useMultiDashboardBridge } from './useMultiDashboardBridge';
import { useMultiReportBridge } from './useMultiReportBridge';
import { usePageActions } from './usePageActions';

interface UseWidgetPageProps {
  registry: 'dashboard' | 'report';
  showNavigationSection?: boolean; // Whether to show navigation widgets section in widget manager
}

/**
 * Hook to provide complete widget page setup including:
 * - Store selection and initialization
 * - Grid layout functionality and handlers
 * - Page actions (WidgetsManager and LayoutManager)
 * - GridLayout component
 * - Responsive resize handling
 * - All widget and layout management functions
 */
export const useWidgetPage = ({
  registry,
  showNavigationSection = false,
}: UseWidgetPageProps) => {
  // Get appropriate store based on registry
  const multiDashboardBridge = useMultiDashboardBridge();
  const multiReportBridge = useMultiReportBridge();

  const store =
    registry === 'dashboard' ? multiDashboardBridge : multiReportBridge;

  // Type-safe access to store methods
  const initializeDefaultWidgets =
    'initializeDefaultWidgets' in store
      ? store.initializeDefaultWidgets
      : undefined;
  const adjustLayoutForCurrentScreen =
    'adjustLayoutForCurrentScreen' in store
      ? store.adjustLayoutForCurrentScreen
      : undefined;

  // NOTE: the grid layout hook lives in <GridLayout> only. This hook used to
  // call useGridLayout a second time (and spread its result, which no caller
  // read), so every layout effect ran — and wrote the persisted store — twice.

  // Get page actions
  const pageActionsHook = usePageActions({
    registry,
    showNavigationSection,
  });
  const pageActions = pageActionsHook.pageActions;
  const mobileActions = pageActionsHook.mobileActions;

  // Initialize default widgets on component mount
  useEffect(() => {
    try {
      initializeDefaultWidgets?.();
    } catch (error) {
      console.error('Failed to initialize default widgets:', error);
    }
  }, [initializeDefaultWidgets]);

  // Handle window resize to adjust layout for new screen size (if method exists)
  useEffect(() => {
    if (!adjustLayoutForCurrentScreen) return;

    let resizeTimeout: number;

    const handleResize = () => {
      // Debounce resize events to avoid excessive layout recalculations
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        adjustLayoutForCurrentScreen?.();
      }, 300);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [adjustLayoutForCurrentScreen]);

  // Grid layout component
  const gridLayout = React.useMemo(
    () => (
      <div className="h-full">
        <GridLayout
          registry={registry}
          className="h-full min-h-[calc(100vh-8rem)]"
        />
      </div>
    ),
    [registry]
  );

  return {
    // Page components
    pageActions,
    mobileActions,
    gridLayout,

    // Store reference
    store,

    // Registry info
    registry,
  };
};
