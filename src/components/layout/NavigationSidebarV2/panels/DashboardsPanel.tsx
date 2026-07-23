import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreateDashboardDialog } from '@/components/dashboard/CreateDashboardDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '@/stores/multiDashboardStore';
import { useUIStore } from '@/stores/uiStore';
import { ChevronRight, Clock, LayoutDashboard, Plus, Star } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RightPanel from './RightPanel';

interface DashboardsPanelProps {
  onClose: () => void;
  onNavigate?: () => void;
}

const DashboardsPanel: React.FC<DashboardsPanelProps> = ({
  onClose,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const {
    dashboards,
    currentDashboardId,
    createDashboard,
    createDashboardFromTemplate,
    switchDashboard,
  } = useMultiDashboardStore();

  const navigationSecondaryPinned = useUIStore(
    (s) => s.navigationSecondaryPinned
  );
  const toggleNavigationSecondaryPinned = useUIStore(
    (s) => s.toggleNavigationSecondaryPinned
  );

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // For this implementation, we'll treat all dashboards as "All Dashboards"
  // In a real app, you'd filter by user ownership, sharing, etc.
  const favoriteDashboards: typeof dashboards = []; // Placeholder
  const recentDashboards = dashboards.slice(0, 5); // Last 5 as recent

  const handleCreateDashboard = () => {
    setCreateDialogOpen(true);
  };

  const handleCreateWithName = ({
    name,
    templateId,
  }: {
    name: string;
    templateId?: string;
  }) => {
    try {
      const newId = templateId
        ? createDashboardFromTemplate(templateId, name)
        : createDashboard(name, true);
      // Read fresh state — `dashboards` from useMultiDashboardStore() is
      // a snapshot from before the create call.
      const stateDashboards = useMultiDashboardStore.getState().dashboards;
      const newDashboard = stateDashboards.find((d) => d.id === newId);
      if (newDashboard) {
        setCreateDialogOpen(false);
        toast.success(`Dashboard "${newDashboard.name}" created`);
        logger.info('[NavV2] Created new dashboard', {
          name: newDashboard.name,
          id: newId,
          templateId,
        });

        const slug = createDashboardSlug(newDashboard.name);
        const newUrl = `/dashboard/${slug}`;
        navigate(newUrl);
        onNavigate?.();
        if (!navigationSecondaryPinned) {
          onClose();
        }
      }
    } catch (error) {
      toast.error('Failed to create dashboard');
      logger.error('[NavV2] Failed to create dashboard', { error });
    }
  };

  const handleDashboardClick = (dashboardId: string) => {
    try {
      const success = switchDashboard(dashboardId);
      if (success) {
        const dashboard = dashboards.find((d) => d.id === dashboardId);
        if (dashboard) {
          const slug = createDashboardSlug(dashboard.name);
          const newUrl = `/dashboard/${slug}`;
          navigate(newUrl);
          onNavigate?.();
          if (!navigationSecondaryPinned) {
            onClose();
          }
        }
      }
    } catch (error) {
      toast.error('Failed to switch dashboard');
      logger.error('[NavV2] Failed to switch dashboard', { error });
    }
  };

  return (
    <>
      <RightPanel
        title="Dashboards"
        pinned={navigationSecondaryPinned}
        onClose={onClose}
        onPinToggle={toggleNavigationSecondaryPinned}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCreateDashboard}
              className="h-8 w-8 p-0 bg-primary text-primary-foreground hover:bg-primary/90"
              title="Create New Dashboard"
              aria-label="Create dashboard"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {/* Content */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {/* All Dashboards */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  All Dashboards
                </h3>
                <Tooltip
                  tooltip="Click a dashboard to open it, or create a new one with the + button above. Rename, clone, reorder, or delete dashboards from the Dashboard Manager on the dashboard page."
                  tooltipURL="/help/custom-dashboards"
                >
                  <InfoIcon />
                </Tooltip>
                <Badge
                  variant="secondary"
                  className="ml-auto h-5 px-2 text-xs bg-muted/50 text-card-foreground border-0"
                >
                  {dashboards.length}
                </Badge>
              </div>

              <div className="space-y-1">
                {dashboards.map((dashboard) => {
                  const isActive = dashboard.id === currentDashboardId;
                  return (
                    <button
                      key={dashboard.id}
                      onClick={() => handleDashboardClick(dashboard.id)}
                      className={`
                        w-full flex items-center justify-between px-3 py-2.5 rounded-lg
                        transition-all duration-200 group text-left
                        ${
                          isActive
                            ? 'bg-muted text-card-foreground'
                            : 'text-card-foreground/80 hover:text-card-foreground hover:bg-muted/30'
                        }
                      `}
                    >
                      <span className="text-sm font-medium truncate">
                        {dashboard.name}
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-opacity ${
                          isActive
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Favorites */}
            {favoriteDashboards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Favorites
                  </h3>
                </div>
                <div className="space-y-1">
                  {favoriteDashboards.map((dashboard) => (
                    <button
                      key={dashboard.id}
                      onClick={() => handleDashboardClick(dashboard.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-card-foreground/80 hover:text-card-foreground hover:bg-muted/30 transition-all duration-200 group text-left"
                    >
                      <span className="text-sm font-medium truncate">
                        {dashboard.name}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recents */}
            {recentDashboards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Recents
                  </h3>
                </div>
                <div className="space-y-1">
                  {recentDashboards.map((dashboard) => (
                    <button
                      key={dashboard.id}
                      onClick={() => handleDashboardClick(dashboard.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-card-foreground/80 hover:text-card-foreground hover:bg-muted/30 transition-all duration-200 group text-left"
                    >
                      <span className="text-sm font-medium truncate">
                        {dashboard.name}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </RightPanel>

      {/* Create Dashboard Dialog — template picker + name step */}
      <CreateDashboardDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        existingNames={dashboards.map((d) => d.name)}
        onConfirm={handleCreateWithName}
      />
    </>
  );
};

export default DashboardsPanel;
