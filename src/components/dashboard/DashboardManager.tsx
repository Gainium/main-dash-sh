import { SHORTCUT_IDS } from '@/config/shortcuts';
import { getDashboardShortcutId } from '@/lib/dashboardShortcuts';
import { logger } from '@/lib/loggerInstance';
import { showShortcutHint } from '@/lib/shortcutHints';
import { toast } from '@/lib/toast';
import { useShortcutStore } from '@/stores/shortcutStore';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Copy,
  Edit3,
  GripVertical,
  LayoutDashboard,
  Plus,
  Save,
  SaveAll,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDefaultTemplates,
  type ReportTemplate,
} from '../../reports/templates/reportTemplates';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '../../stores/multiDashboardStore';
import {
  createReportSlug,
  useMultiReportStore,
} from '../../stores/multiReportStore';
import ShortcutChip from '../common/ShortcutChip';
import ShortcutRecorder from '../common/ShortcutRecorder';
import LayoutManager from '../layout/LayoutManager';
import WidgetsManager from '../layout/WidgetsManager';
import { Button } from '../ui/button';
import { InfoIcon, Tooltip } from '../ui/tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { ConfirmationDialog, InputDialog } from '../ui/confirmation-dialog';
import { CreateDashboardDialog } from './CreateDashboardDialog';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerDescription,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface SortableDashboardItemProps {
  dashboard: {
    id: string;
    name: string;
    widgets: unknown[];
    updatedAt: number;
  };
  isActive: boolean;
  onSwitch: (id: string) => void;
  onRename: (id: string, e: React.MouseEvent | React.TouchEvent) => void;
  onClone: (id: string, e: React.MouseEvent | React.TouchEvent) => void;
  onDelete: (id: string, e: React.MouseEvent | React.TouchEvent) => void;
  canDelete: boolean;
}

const SortableDashboardItem: React.FC<SortableDashboardItemProps> = ({
  dashboard,
  isActive,
  onSwitch,
  onRename,
  onClone,
  onDelete,
  canDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dashboard.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Ensure dynamic shortcut is registered for this dashboard so recorder can work
  // This supplements the global registration hook and keeps label/action synced locally.
  React.useEffect(() => {
    const id = getDashboardShortcutId(dashboard.id);
    const st = useShortcutStore.getState();
    const existing = st.shortcuts[id];
    if (!existing) {
      st.registerShortcut({
        id,
        label: dashboard.name,
        description: `Go to ${dashboard.name}`,
        // Neutral placeholder; shortcut remains disabled until user records
        defaultKey: {
          key: 'g',
          modifiers: { cmd: false, ctrl: false, alt: false, shift: false },
        },
        currentKey: {
          key: 'g',
          modifiers: { cmd: false, ctrl: false, alt: false, shift: false },
        },
        enabled: false,
        deleted: false,
        category: 'dashboards',
        action: () => {},
      });
    } else {
      // Sync label/description/action/category if dashboard was renamed
      st.registerShortcut({
        ...existing,
        id,
        label: dashboard.name,
        description: `Go to ${dashboard.name}`,
        category: 'dashboards',
        action: existing.action,
      });
    }
  }, [dashboard.id, dashboard.name]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group p-sm rounded-md border-2 transition-colors ${
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border bg-inner-container hover:bg-muted'
      } ${isDragging ? 'shadow-lg bg-card border-primary/50' : ''}`}
    >
      <div className="flex items-center gap-sm">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-6 h-6 hover:bg-muted/50 rounded transition-colors cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Dashboard Info */}
        <button
          onClick={() => onSwitch(dashboard.id)}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-center gap-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                isActive ? 'bg-primary' : 'bg-primary/30'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div
                className={`font-medium text-sm truncate ${
                  isActive ? 'text-primary' : 'text-card-foreground'
                }`}
              >
                {dashboard.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {dashboard.widgets.length} widgets •{' '}
                {new Date(dashboard.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity relative z-10">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClone(dashboard.id, e);
            }}
            className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 hover:bg-muted/50 active:bg-muted rounded transition-colors touch-manipulation relative z-10"
            title="Clone dashboard"
            type="button"
          >
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground pointer-events-none" />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename(dashboard.id, e);
            }}
            className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 hover:bg-muted/50 active:bg-muted rounded transition-colors touch-manipulation relative z-10"
            title="Rename dashboard"
            type="button"
          >
            <Edit3 className="h-3 w-3 text-muted-foreground hover:text-foreground pointer-events-none" />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(dashboard.id, e);
            }}
            disabled={!canDelete}
            className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 hover:bg-destructive/20 active:bg-destructive/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation relative z-10"
            title={
              !canDelete
                ? 'Cannot delete the only dashboard'
                : 'Delete dashboard'
            }
            type="button"
          >
            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive pointer-events-none" />
          </button>
        </div>
        {/* Inline shortcut recorder for this dashboard */}
        <div className="ml-2 hidden sm:block">
          <ShortcutRecorder
            id={getDashboardShortcutId(dashboard.id)}
            label={`Go to ${dashboard.name}`}
          />
        </div>
      </div>
    </div>
  );
};

interface DashboardManagerProps {
  onSaveDashboard?: () => void;
  registry?: 'dashboard' | 'trading' | 'bot' | 'report';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store?: any;
  showNavigationSection?: boolean;
  botTypeId?: string | null;
  mode?: 'create' | 'edit';
}

const DashboardManager: React.FC<DashboardManagerProps> = ({
  onSaveDashboard,
  registry = 'dashboard',
  store,
  showNavigationSection,
  botTypeId,
  mode,
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const [selectedTemplate, setSelectedTemplate] =
    useState<ReportTemplate | null>(null);
  const [dashboardToRename, setDashboardToRename] = useState<string | null>(
    null
  );
  const [dashboardToDelete, setDashboardToDelete] = useState<string | null>(
    null
  );

  // Report-specific state (for report registry)
  const [reportToRename, setReportToRename] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'layout' | 'widgets' | null
  >(null);

  // Multi-dashboard store
  const {
    dashboards,
    currentDashboardId,
    getCurrentDashboard,
    createDashboard,
    createDashboardFromTemplate,
    deleteDashboard,
    switchDashboard,
    renameDashboard,
    cloneDashboard,
    reorderDashboards,
    saveLayout,
  } = useMultiDashboardStore();

  // Multi-report store (for report registry)
  const {
    reports,
    currentReportId,
    getCurrentReport,
    createReport,
    createReportFromTemplate,
    deleteReport,
    switchReport,
    renameReport,
    cloneReport,
    reorderReports,
    saveLayout: saveReportLayout,
  } = useMultiReportStore();

  const currentDashboard = getCurrentDashboard();
  const currentReport = getCurrentReport();
  const reportTemplates = getDefaultTemplates();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Listen for external open events from navbar
  useEffect(() => {
    const handleExternalOpen = (event: CustomEvent) => {
      const action = event.detail?.action;
      if (
        action === 'openDashboardManager' ||
        action === 'toggleDashboardManager' ||
        action === 'closeDashboardManager' ||
        action === 'openReportManager' ||
        action === 'toggleReportManager' ||
        action === 'closeReportManager'
      ) {
        if (action.includes('open') || action.includes('toggle')) {
          if (action.includes('toggle')) {
            setIsOpen((prev) => !prev);
          } else {
            setIsOpen(true);
          }
          setActiveSection('dashboard');
        } else {
          setIsOpen(false);
        }
      } else if (action === 'openSection') {
        // Unified manager section open (widgets/layout)
        if (!event.detail?.registry || event.detail.registry === registry) {
          setIsOpen(true);
          setActiveSection(event.detail?.section ?? 'dashboard');
        }
      }
    };

    const eventName =
      registry === 'report' ? 'openReportManager' : 'openDashboardManager';
    window.addEventListener(eventName, handleExternalOpen as EventListener);

    return () => {
      window.removeEventListener(
        eventName,
        handleExternalOpen as EventListener
      );
    };
  }, [registry]);

  // Backwards-compat: route legacy manager events into the unified manager
  useEffect(() => {
    const handleWidgetsManagerEvent = (event: CustomEvent) => {
      if (event.detail?.registry && event.detail.registry !== registry) return;
      const action = event.detail?.action;
      if (action === 'close') {
        setIsOpen(false);
        return;
      }

      setIsOpen(true);
      setActiveSection('widgets');
    };

    const handleLayoutManagerEvent = (event: CustomEvent) => {
      if (event.detail?.registry && event.detail.registry !== registry) return;
      const action = event.detail?.action;
      if (action === 'close') {
        setIsOpen(false);
        return;
      }

      setIsOpen(true);
      setActiveSection('layout');
    };

    window.addEventListener(
      'openWidgetsManager',
      handleWidgetsManagerEvent as EventListener
    );
    window.addEventListener(
      'openLayoutManager',
      handleLayoutManagerEvent as EventListener
    );

    return () => {
      window.removeEventListener(
        'openWidgetsManager',
        handleWidgetsManagerEvent as EventListener
      );
      window.removeEventListener(
        'openLayoutManager',
        handleLayoutManagerEvent as EventListener
      );
    };
  }, [registry]);

  // Scroll to the requested section when opening
  const dashboardSectionRef = React.useRef<HTMLDivElement | null>(null);
  const layoutSectionRef = React.useRef<HTMLDivElement | null>(null);
  const widgetsSectionRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !activeSection) return;

    const sectionEl =
      activeSection === 'dashboard'
        ? dashboardSectionRef.current
        : activeSection === 'layout'
          ? layoutSectionRef.current
          : widgetsSectionRef.current;

    if (!sectionEl) return;
    // Allow drawer to mount before scrolling
    const t = window.setTimeout(() => {
      sectionEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);

    return () => window.clearTimeout(t);
  }, [activeSection, isOpen]);

  const handleSaveCurrent = () => {
    if (onSaveDashboard) {
      onSaveDashboard();
    } else if (currentDashboard) {
      try {
        // Save current dashboard layout without prompting for name
        saveLayout(currentDashboard.name);
        toast.success(`Dashboard "${currentDashboard.name}" saved`);
        logger.info(`Saved current dashboard: ${currentDashboard.name}`);
      } catch (error) {
        toast.error('Failed to save dashboard');
        logger.error('Failed to save dashboard:', error);
      }
    }
  };

  const handleSaveAs = (name: string) => {
    try {
      if (currentDashboard) {
        const newId = cloneDashboard(currentDashboard.id, name);
        setSaveAsDialogOpen(false);
        toast.success(`Dashboard saved as "${name}"`);
        logger.info(`Saved dashboard as: ${name} (${newId})`);
      }
    } catch (error) {
      toast.error('Failed to save dashboard');
      logger.error('Failed to save dashboard:', error);
    }
  };

  const handleRename = (name: string) => {
    try {
      if (dashboardToRename) {
        const success = renameDashboard(dashboardToRename, name);
        if (success) {
          setRenameDialogOpen(false);
          setDashboardToRename(null);
          toast.success(`Dashboard renamed to "${name}"`);
          logger.info(`Renamed dashboard to: ${name}`);
        } else {
          toast.error('Dashboard name already exists');
        }
      }
    } catch (error) {
      toast.error('Failed to rename dashboard');
      logger.error('Failed to rename dashboard:', error);
    }
  };

  const handleClone = (dashboardId: string) => {
    try {
      const dashboard = dashboards.find((d) => d.id === dashboardId);
      if (dashboard) {
        const newId = cloneDashboard(dashboardId);
        toast.success(`Dashboard cloned successfully`);
        logger.info(`Cloned dashboard: ${dashboard.name} (${newId})`);
      }
    } catch (error) {
      toast.error('Failed to clone dashboard');
      logger.error('Failed to clone dashboard:', error);
    }
  };

  const handleDelete = () => {
    try {
      if (dashboardToDelete && dashboards.length > 1) {
        const dashboard = dashboards.find((d) => d.id === dashboardToDelete);
        const success = deleteDashboard(dashboardToDelete);
        if (success) {
          setDeleteDialogOpen(false);
          setDashboardToDelete(null);
          toast.success('Dashboard deleted');
          logger.info(`Deleted dashboard: ${dashboard?.name}`);

          // If we deleted the current dashboard, the store will automatically switch
          // Update the URL if needed
          if (dashboardToDelete === currentDashboardId) {
            const remainingDashboards = dashboards.filter(
              (d) => d.id !== dashboardToDelete
            );
            if (remainingDashboards.length > 0) {
              const nextDashboard = remainingDashboards[0];
              const slug = createDashboardSlug(nextDashboard.name);
              const newUrl = `/dashboard/${slug}`;
              navigate(newUrl, { replace: true });
            }
          }
        } else {
          toast.error('Cannot delete dashboard');
        }
      } else {
        toast.error('Cannot delete the only dashboard');
      }
    } catch (error) {
      toast.error('Failed to delete dashboard');
      logger.error('Failed to delete dashboard:', error);
    }
  };

  const handleCreateDashboard = () => {
    // Open the dialog to get the dashboard name
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
      const stateDashboards = useMultiDashboardStore.getState().dashboards;
      const newDashboard = stateDashboards.find((d) => d.id === newId);
      if (newDashboard) {
        setCreateDialogOpen(false);
        toast.success(`Dashboard "${newDashboard.name}" created`);
        logger.info(
          `Created new dashboard: ${newDashboard.name} (${newId})${templateId ? ` from template ${templateId}` : ''}`
        );

        const slug = createDashboardSlug(newDashboard.name);
        const newUrl = `/dashboard/${slug}`;
        navigate(newUrl);
      }
    } catch (error) {
      toast.error('Failed to create dashboard');
      logger.error('Failed to create dashboard:', error);
    }
  };

  const handleSwitchDashboard = (dashboardId: string) => {
    try {
      const success = switchDashboard(dashboardId);
      if (success) {
        const dashboard = dashboards.find((d) => d.id === dashboardId);
        if (dashboard) {
          const slug = createDashboardSlug(dashboard.name);
          const newUrl = `/dashboard/${slug}`;
          navigate(newUrl);
          setIsOpen(false); // Close the sidebar after switching
        }
      }
    } catch (error) {
      toast.error('Failed to switch dashboard');
      logger.error('Failed to switch dashboard:', error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = dashboards.findIndex((item) => item.id === active.id);
      const newIndex = dashboards.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderDashboards(oldIndex, newIndex);
        toast.success('Dashboard order updated');
        logger.info(
          `Reordered dashboard from position ${oldIndex} to ${newIndex}`
        );
      }
    }
  };

  const handleRenameClick = (
    dashboardId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDashboardToRename(dashboardId);
    setRenameDialogOpen(true);
  };

  const handleDeleteClick = (
    dashboardId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDashboardToDelete(dashboardId);
    setDeleteDialogOpen(true);
  };

  const handleCloneClick = (
    dashboardId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    handleClone(dashboardId);
  };

  const dashboardIds = dashboards.map((d) => d.id);
  const reportIds = reports.map((r) => r.id);

  // Report handlers
  const handleSaveCurrentReport = () => {
    if (currentReport) {
      try {
        saveReportLayout(currentReport.name);
        toast.success(`Report "${currentReport.name}" saved`);
        logger.info(`Saved current report: ${currentReport.name}`);
      } catch (error) {
        toast.error('Failed to save report');
        logger.error('Failed to save report:', error);
      }
    }
  };

  const handleSaveReportAs = (name: string) => {
    try {
      if (currentReport) {
        cloneReport(currentReport.id, name);
        setSaveAsDialogOpen(false);
        toast.success(`Report saved as "${name}"`);
        logger.info(`Saved report as: ${name}`);

        // Navigate to the new report
        const slug = createReportSlug(name);
        navigate(`/reports/${slug}`);
      }
    } catch (error) {
      toast.error('Failed to save report');
      logger.error('Failed to save report:', error);
    }
  };

  const handleRenameReport = (name: string) => {
    try {
      if (reportToRename) {
        const success = renameReport(reportToRename, name);
        if (success) {
          setRenameDialogOpen(false);
          setReportToRename(null);
          toast.success(`Report renamed to "${name}"`);
          logger.info(`Renamed report to: ${name}`);

          // If renaming current report, update URL
          if (reportToRename === currentReportId) {
            const slug = createReportSlug(name);
            navigate(`/reports/${slug}`, { replace: true });
          }
        } else {
          toast.error('Report name already exists');
        }
      }
    } catch (error) {
      toast.error('Failed to rename report');
      logger.error('Failed to rename report:', error);
    }
  };

  const handleCloneReport = (reportId: string) => {
    try {
      const report = reports.find((r) => r.id === reportId);
      if (report) {
        cloneReport(reportId);
        toast.success(`Report cloned successfully`);
        logger.info(`Cloned report: ${report.name}`);
      }
    } catch (error) {
      toast.error('Failed to clone report');
      logger.error('Failed to clone report:', error);
    }
  };

  const handleDeleteReport = () => {
    try {
      if (reportToDelete && reports.length > 1) {
        const report = reports.find((r) => r.id === reportToDelete);
        const success = deleteReport(reportToDelete);
        if (success) {
          setDeleteDialogOpen(false);
          setReportToDelete(null);
          toast.success('Report deleted');
          logger.info(`Deleted report: ${report?.name}`);

          // If we deleted the current report, navigate to first available
          if (reportToDelete === currentReportId) {
            const remainingReports = reports.filter(
              (r) => r.id !== reportToDelete
            );
            if (remainingReports.length > 0) {
              const nextReport = remainingReports[0];
              const slug = createReportSlug(nextReport.name);
              navigate(`/reports/${slug}`, { replace: true });
            }
          }
        } else {
          toast.error('Cannot delete report');
        }
      } else {
        toast.error('Cannot delete the only report');
      }
    } catch (error) {
      toast.error('Failed to delete report');
      logger.error('Failed to delete report:', error);
    }
  };

  const handleCreateReport = () => {
    setCreateDialogOpen(true);
  };

  const handleCreateReportWithName = (name: string) => {
    try {
      createReport(name);
      setCreateDialogOpen(false);
      setNewReportName('');
      toast.success(`Report "${name}" created`);
      logger.info(`Created new report: ${name}`);

      // Navigate to the new report
      const slug = createReportSlug(name);
      navigate(`/reports/${slug}`);
    } catch (error) {
      toast.error('Failed to create report');
      logger.error('Failed to create report:', error);
    }
  };

  const handleCreateReportFromTemplate = (template: ReportTemplate) => {
    try {
      const reportId = createReportFromTemplate(template.id);
      setCreateDialogOpen(false);
      toast.success(`Created report from template: ${template.name}`);
      logger.info(`Created report from template: ${template.name}`);

      // Navigate to the new report
      const report = reports.find((r) => r.id === reportId);
      if (report) {
        const slug = createReportSlug(report.name);
        navigate(`/reports/${slug}`);
      }
    } catch (error) {
      toast.error('Failed to create report from template');
      logger.error('Failed to create report from template:', error);
    }
  };

  const handleSwitchReport = (reportId: string) => {
    try {
      const success = switchReport(reportId);
      if (success) {
        const report = reports.find((r) => r.id === reportId);
        if (report) {
          const slug = createReportSlug(report.name);
          navigate(`/reports/${slug}`);
          setIsOpen(false);
        }
      }
    } catch (error) {
      toast.error('Failed to switch report');
      logger.error('Failed to switch report:', error);
    }
  };

  const handleDragEndReport = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = reports.findIndex((item) => item.id === active.id);
      const newIndex = reports.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderReports(oldIndex, newIndex);
        toast.success('Report order updated');
        logger.info(
          `Reordered report from position ${oldIndex} to ${newIndex}`
        );
      }
    }
  };

  const handleRenameReportClick = (
    reportId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setReportToRename(reportId);
    setRenameDialogOpen(true);
  };

  const handleDeleteReportClick = (
    reportId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setReportToDelete(reportId);
    setDeleteDialogOpen(true);
  };

  const handleCloneReportClick = (
    reportId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();
    handleCloneReport(reportId);
  };

  return (
    <>
      <DetailDrawer open={isOpen} onOpenChange={setIsOpen}>
        <DetailDrawerTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-8 w-8"
            title="Dashboard"
            data-tour="dashboard-manager"
            onClick={() => showShortcutHint('toggleDashboardManager')}
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
        </DetailDrawerTrigger>
        <DetailDrawerContent
          className="w-full sm:max-w-md lg:max-w-lg"
          width="lg"
          data-tour="dashboard-manager-content"
        >
          <DetailDrawerHeader>
            <DetailDrawerTitle>
              <span className="flex items-center gap-xs">
                {registry === 'report' ? 'Report Manager' : 'Dashboard Manager'}
                <ShortcutChip id={SHORTCUT_IDS.ManagerDashboard} muted />
              </span>
            </DetailDrawerTitle>
            <DetailDrawerDescription>
              {registry === 'report'
                ? 'Manage reports, widgets, and layouts'
                : 'Manage dashboards, widgets, and layouts'}
            </DetailDrawerDescription>
          </DetailDrawerHeader>
          <DetailDrawerBody className="p-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Dashboards section (dashboard registry only) */}
              {registry === 'dashboard' && (
                <div ref={dashboardSectionRef} className="space-y-2 py-2">
                  <Card compact>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        <span className="flex items-center gap-xs">
                          Current Dashboard Actions
                          <Tooltip
                            tooltip="Save Dashboard stores a snapshot of the current widget arrangement you can restore later with Reset to Last Saved. Save as New duplicates the whole dashboard under a new name."
                            tooltipURL="/help/custom-dashboards"
                          >
                            <InfoIcon />
                          </Tooltip>
                        </span>
                      </CardTitle>
                      <CardDescription>
                        Manage saving and duplication of the current dashboard
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveCurrent}
                          className="flex items-center gap-xs h-12"
                          disabled={!currentDashboard}
                        >
                          <Save className="h-4 w-4" />
                          Save Dashboard
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSaveAsDialogOpen(true)}
                          className="flex items-center gap-xs h-12"
                          disabled={!currentDashboard}
                        >
                          <SaveAll className="h-4 w-4" />
                          Save as New
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card compact>
                    <CardHeader className="pb-3 flex items-center justify-between">
                      <CardTitle className="text-sm">
                        <span className="flex items-center gap-xs">
                          All Dashboards
                          <Tooltip
                            tooltip="Click a dashboard to switch to it, or drag to reorder. Each dashboard can be renamed, cloned, deleted, or given its own keyboard shortcut."
                            tooltipURL="/help/custom-dashboards"
                          >
                            <InfoIcon />
                          </Tooltip>
                        </span>
                      </CardTitle>
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCreateDashboard}
                          className="flex items-center gap-1 h-8"
                        >
                          <Plus className="h-3 w-3" />
                          New
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-4">
                        Drag to reorder • Click to switch • Actions on the right
                      </p>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={dashboardIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-xs">
                            {dashboards.map((dashboard) => (
                              <SortableDashboardItem
                                key={dashboard.id}
                                dashboard={dashboard}
                                isActive={dashboard.id === currentDashboardId}
                                onSwitch={handleSwitchDashboard}
                                onRename={handleRenameClick}
                                onClone={handleCloneClick}
                                onDelete={handleDeleteClick}
                                canDelete={dashboards.length > 1}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>

                      <div className="h-2" />
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Reports section (report registry only) */}
              {registry === 'report' && (
                <div ref={dashboardSectionRef} className="space-y-2 py-2">
                  <Card compact>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        Current Report Actions
                      </CardTitle>
                      <CardDescription>
                        Manage saving and duplication of the current report
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveCurrentReport}
                          className="flex items-center gap-xs h-12"
                          disabled={!currentReport}
                        >
                          <Save className="h-4 w-4" />
                          Save Report
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSaveAsDialogOpen(true)}
                          className="flex items-center gap-xs h-12"
                          disabled={!currentReport}
                        >
                          <SaveAll className="h-4 w-4" />
                          Save as New
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card compact>
                    <CardHeader className="pb-3 flex items-center justify-between">
                      <CardTitle className="text-sm">All Reports</CardTitle>
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCreateReport}
                          className="flex items-center gap-1 h-8"
                        >
                          <Plus className="h-3 w-3" />
                          New
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-4">
                        Drag to reorder • Click to switch • Actions on the right
                      </p>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEndReport}
                      >
                        <SortableContext
                          items={reportIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-xs">
                            {reports.map((report) => (
                              <SortableDashboardItem
                                key={report.id}
                                dashboard={report}
                                isActive={report.id === currentReportId}
                                onSwitch={handleSwitchReport}
                                onRename={handleRenameReportClick}
                                onClone={handleCloneReportClick}
                                onDelete={handleDeleteReportClick}
                                canDelete={reports.length > 1}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>

                      <div className="h-2" />
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Layout section */}
              <div ref={layoutSectionRef} className="py-2">
                <Card compact>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Layout</CardTitle>
                    <CardDescription>
                      Save, load, tidy, and lock your grid
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LayoutManager
                      registry={registry}
                      store={store}
                      variant="embedded"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Widgets section */}
              <div ref={widgetsSectionRef} className="py-2">
                <Card compact>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Widgets</CardTitle>
                    <CardDescription>
                      Add, remove, reorder, and configure widgets
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WidgetsManager
                      registry={registry}
                      store={store}
                      showNavigationSection={showNavigationSection}
                      botTypeId={botTypeId}
                      mode={mode}
                      variant="embedded"
                    />
                    <div className="h-6" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </DetailDrawerBody>
        </DetailDrawerContent>
      </DetailDrawer>

      {/* Create New Dashboard/Report Dialog */}
      {registry === 'report' ? (
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Create New Report</DialogTitle>
              <DialogDescription>
                Choose a template or start from scratch
              </DialogDescription>
            </DialogHeader>

            {/* Report Name Input */}
            <div className="space-y-2 pb-4 border-b">
              <Label htmlFor="reportName">Report Name</Label>
              <Input
                id="reportName"
                placeholder="My Report"
                value={newReportName}
                onChange={(e) => setNewReportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newReportName.trim()) {
                    handleCreateReportWithName(newReportName.trim());
                  }
                }}
              />
            </div>

            <div className="flex-1 overflow-y-auto pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
                {/* From Scratch option - first/default */}
                <div
                  className={`border-2 border-dashed rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${
                    selectedTemplate === null
                      ? 'border-primary bg-primary/5'
                      : ''
                  }`}
                  onClick={() => setSelectedTemplate(null)}
                >
                  <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                  <h4 className="font-semibold text-sm">From Scratch</h4>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Start with a blank report
                  </p>
                </div>

                {/* Templates */}
                {reportTemplates.map((template: ReportTemplate) => (
                  <div
                    key={template.id}
                    className={`border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer ${
                      selectedTemplate?.id === template.id
                        ? 'border-primary bg-primary/5'
                        : ''
                    }`}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-sm">{template.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="text-xs text-muted-foreground">
                      {template.widgets.length}{' '}
                      {template.widgets.length === 1 ? 'widget' : 'widgets'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer with Create Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setNewReportName('');
                  setSelectedTemplate(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (newReportName.trim()) {
                    if (selectedTemplate) {
                      handleCreateReportFromTemplate(selectedTemplate);
                    } else {
                      handleCreateReportWithName(newReportName.trim());
                    }
                  }
                }}
                disabled={!newReportName.trim()}
              >
                Create Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <CreateDashboardDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          existingNames={dashboards.map((d) => d.name)}
          onConfirm={handleCreateWithName}
        />
      )}

      {/* Save As New Dashboard/Report Dialog */}
      <InputDialog
        open={saveAsDialogOpen}
        onOpenChange={setSaveAsDialogOpen}
        title={
          registry === 'report' ? 'Save as New Report' : 'Save as New Dashboard'
        }
        description={
          registry === 'report'
            ? 'Enter a name for the new report'
            : 'Enter a name for the new dashboard'
        }
        placeholder={registry === 'report' ? 'Report name' : 'Dashboard name'}
        onConfirm={registry === 'report' ? handleSaveReportAs : handleSaveAs}
        confirmText={
          registry === 'report' ? 'Create Report' : 'Create Dashboard'
        }
        validator={(value) => {
          const trimmed = value.trim();
          const itemType = registry === 'report' ? 'Report' : 'Dashboard';
          if (!trimmed) return `${itemType} name is required`;
          if (trimmed.length < 2)
            return `${itemType} name must be at least 2 characters`;
          if (trimmed.length > 50)
            return `${itemType} name must be less than 50 characters`;
          const items = registry === 'report' ? reports : dashboards;
          const exists = items.some((item) => item.name === trimmed);
          if (exists)
            return `A ${itemType.toLowerCase()} with this name already exists`;
          return null;
        }}
      />

      {/* Rename Dashboard/Report Dialog */}
      <InputDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title={registry === 'report' ? 'Rename Report' : 'Rename Dashboard'}
        description={
          registry === 'report'
            ? 'Enter a new name for this report'
            : 'Enter a new name for this dashboard'
        }
        placeholder={registry === 'report' ? 'Report name' : 'Dashboard name'}
        onConfirm={registry === 'report' ? handleRenameReport : handleRename}
        confirmText="Rename"
        validator={(value) => {
          const trimmed = value.trim();
          const itemType = registry === 'report' ? 'Report' : 'Dashboard';
          const itemToRename =
            registry === 'report' ? reportToRename : dashboardToRename;
          if (!trimmed) return `${itemType} name is required`;
          if (trimmed.length < 2)
            return `${itemType} name must be at least 2 characters`;
          if (trimmed.length > 50)
            return `${itemType} name must be less than 50 characters`;
          const items = registry === 'report' ? reports : dashboards;
          const exists = items.some(
            (item) => item.name === trimmed && item.id !== itemToRename
          );
          if (exists)
            return `A ${itemType.toLowerCase()} with this name already exists`;
          return null;
        }}
      />

      {/* Delete Dashboard/Report Confirmation */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={registry === 'report' ? 'Delete Report' : 'Delete Dashboard'}
        description={
          registry === 'report'
            ? reportToDelete
              ? `Are you sure you want to delete "${
                  reports.find((r) => r.id === reportToDelete)?.name
                }"? This action cannot be undone.`
              : ''
            : dashboardToDelete
              ? `Are you sure you want to delete "${
                  dashboards.find((d) => d.id === dashboardToDelete)?.name
                }"? This action cannot be undone.`
              : ''
        }
        onConfirm={registry === 'report' ? handleDeleteReport : handleDelete}
        confirmText={
          registry === 'report' ? 'Delete Report' : 'Delete Dashboard'
        }
        variant="destructive"
      />
    </>
  );
};

export default DashboardManager;
