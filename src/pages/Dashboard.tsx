import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { Button } from '../components/ui/button';
import { CreateDashboardDialog } from '../components/dashboard/CreateDashboardDialog';
import { useWidgetPage } from '../hooks/useWidgetPage';
import { ExtensionSlot } from '../lib/extensions';
import { logger } from '../lib/loggerInstance';
import {
  createDashboardSlug,
  findDashboardBySlug,
  useMultiDashboardStore,
} from '../stores/multiDashboardStore';

// Multi-dashboard page. The page handles dashboard switching + the
// widget grid. Host apps may register additional UI via the
// `dashboard.extensions` slot.

interface DashboardProps {
  tourMode?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ tourMode = false }) => {
  const [searchParams] = useSearchParams();
  const { dashboardName } = useParams<{ dashboardName: string }>();
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const {
    dashboards,
    currentDashboardId,
    getCurrentDashboard,
    createDashboard,
    createDashboardFromTemplate,
    switchDashboard,
  } = useMultiDashboardStore();

  // Resolve a named or legacy-id dashboard URL into the active store
  // selection. Tour mode short-circuits the URL routing — the slot
  // extension drives demo dashboards in that case.
  useEffect(() => {
    if (tourMode) return;

    if (dashboardName) {
      const targetDashboard = findDashboardBySlug(dashboards, dashboardName);
      if (targetDashboard && targetDashboard.id !== currentDashboardId) {
        const success = switchDashboard(targetDashboard.id);
        if (!success) {
          logger.warn(`Failed to switch to dashboard ${dashboardName}`);
        }
      }
      return;
    }

    const dashboardId = searchParams.get('id');

    if (dashboardId && dashboardId !== currentDashboardId) {
      const success = switchDashboard(dashboardId);
      if (!success) {
        logger.warn(
          `Failed to switch to dashboard ${dashboardId}, dashboard not found`
        );
      }
    } else if (!dashboardId && currentDashboardId && dashboards.length > 0) {
      const currentDashboard = getCurrentDashboard();
      if (currentDashboard) {
        const slug = createDashboardSlug(currentDashboard.name);
        const newUrl = `/dashboard/${slug}`;
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [
    tourMode,
    dashboardName,
    searchParams,
    currentDashboardId,
    dashboards,
    switchDashboard,
    getCurrentDashboard,
  ]);

  const currentDashboard = getCurrentDashboard();
  const pageTitle = currentDashboard?.name ?? 'Dashboard';

  const { pageActions, mobileActions, gridLayout } = useWidgetPage({
    registry: 'dashboard',
    showNavigationSection: true,
  });

  const handleCreateWithName = useCallback(
    ({ name, templateId }: { name: string; templateId?: string }) => {
      const newId = templateId
        ? createDashboardFromTemplate(templateId, name)
        : createDashboard(name, true);
      const stateDashboards = useMultiDashboardStore.getState().dashboards;
      const newDashboard = stateDashboards.find((d) => d.id === newId);
      if (newDashboard) {
        setCreateDialogOpen(false);
        logger.info(
          `Created new dashboard: ${newDashboard.name} (${newId})${templateId ? ` from template ${templateId}` : ''}`
        );
        const slug = createDashboardSlug(newDashboard.name);
        navigate(`/dashboard/${slug}`);
      }
    },
    [createDashboard, createDashboardFromTemplate, navigate]
  );

  if (!currentDashboard) {
    return (
      <>
        <MainLayout
          pageTitle="Dashboard"
          activePage="/dashboard"
          pageActions={pageActions}
          mobileActions={mobileActions}
        >
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground">No dashboard found</p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Dashboard
              </Button>
            </div>
          </div>
        </MainLayout>

        <CreateDashboardDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          existingNames={dashboards.map((d) => d.name)}
          onConfirm={handleCreateWithName}
        />
        <ExtensionSlot name="dashboard.extensions" tourMode={tourMode} />
      </>
    );
  }

  return (
    <>
      <MainLayout
        pageTitle={pageTitle}
        activePage={`/dashboard/${createDashboardSlug(currentDashboard.name)}`}
        pageActions={pageActions}
        mobileActions={mobileActions}
      >
        {gridLayout}
      </MainLayout>
      <ExtensionSlot name="dashboard.extensions" tourMode={tourMode} />
    </>
  );
};

export default Dashboard;
