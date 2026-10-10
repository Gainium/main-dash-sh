/* eslint-disable @typescript-eslint/no-explicit-any */
import ShortcutChip from '@/components/common/ShortcutChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '@/stores/multiDashboardStore';
import {
  createReportSlug,
  useMultiReportStore,
} from '@/stores/multiReportStore';
import { useUIStore } from '@/stores/uiStore';
import { getBotTypeRoute, getNavigationBotTypes } from '@/utils/botUtils';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as LucideIcons from 'lucide-react';
import {
  BarChart2,
  GripVertical,
  LayoutDashboard,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_VISIBLE_NAV_IDS,
  NAVIGATION_GROUPS,
} from '../navigationConfig';
import { NavVisibilityGate } from '../../NavVisibilityGate';
import CustomNavItemDialog from './CustomNavItemDialog';
import RightPanel from './RightPanel';

interface MorePanelProps {
  onClose: () => void;
  onNavigate?: () => void;
}

// Map navigation IDs to their shortcut IDs
const NAV_ID_TO_SHORTCUT_ID: Record<string, string> = {
  home: SHORTCUT_IDS.NavOverview,
  trading: SHORTCUT_IDS.NavTrades,
  terminal: SHORTCUT_IDS.NavTradingTerminal,
  dcaBots: SHORTCUT_IDS.NavTradingBots,
  comboBots: SHORTCUT_IDS.NavComboBots,
  gridBots: SHORTCUT_IDS.NavGridBots,
  backtesting: SHORTCUT_IDS.NavManualBacktesting,
  rulebooks: SHORTCUT_IDS.NavRulebooks,
  portfolio: SHORTCUT_IDS.NavPortfolio,
  journal: SHORTCUT_IDS.NavJournal,
  reports: SHORTCUT_IDS.NavReports,
  dashboards: SHORTCUT_IDS.NavDashboard,
  'bottype-hedge-dca': SHORTCUT_IDS.NavHedgeDcaBots,
  'bottype-hedge-combo': SHORTCUT_IDS.NavHedgeComboBots,
};

type NavItem = {
  id: string;
  label: string;
  baseLabel: string;
  icon: React.ReactNode;
  href?: string;
  badge?: { text: string; variant?: 'default' | 'pro' | 'beta' };
  shortcut?: string;
  shortcutId?: string;
  isCustom?: boolean;
  reportId?: string;
  useIsVisible?: () => boolean;
};

const MorePanel: React.FC<MorePanelProps> = ({ onClose, onNavigate }) => {
  const navigate = useNavigate();
  const visibleIds = (
    useUIStore((s) => s.leftNavVisibleIds) || DEFAULT_VISIBLE_NAV_IDS
  ).filter((i) => i !== 'help');
  const toggleItemVisible = useUIStore((s) => s.toggleLeftNavItem);
  const order = useUIStore((s) => s.leftNavOrder) || DEFAULT_VISIBLE_NAV_IDS;
  const setOrder = useUIStore((s) => s.setLeftNavOrder);
  const reset = useUIStore((s) => s.resetLeftNavToDefault);
  const showLabels = useUIStore((s) => s.leftNavShowLabels);
  const setShowLabels = useUIStore((s) => s.setLeftNavShowLabels);
  const labelOverrides = useUIStore((s) => s.leftNavLabelOverrides);
  const setLeftNavLabel = useUIStore((s) => s.setLeftNavLabel);
  const customNavItems = useUIStore((s) => s.customNavItems);
  const deleteCustomNavItem = useUIStore((s) => s.deleteCustomNavItem);
  const labelOverrideMap = labelOverrides ?? {};
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const editingBaseLabel = useRef('');
  const [isCustomNavDialogOpen, setIsCustomNavDialogOpen] = useState(false);
  const [editingCustomNavItem, setEditingCustomNavItem] = useState<
    (typeof customNavItems)[number] | null
  >(null);

  useEffect(() => {
    if (editingLabelId) {
      editingInputRef.current?.focus();
      editingInputRef.current?.select();
    }
  }, [editingLabelId]);

  // Exclude dedicated bot-type nav items (dca, combo, grid) to avoid duplicating those in More
  const botTypes = getNavigationBotTypes().filter(
    (b) => !['dca', 'combo', 'grid'].includes(b.type)
  );

  const botItems: NavItem[] = botTypes.map((b) => {
    const id = `bottype-${b.type}`;
    const IconComponent = b.icon;
    return {
      id,
      label: labelOverrideMap[id] ?? b.label,
      baseLabel: b.label,
      icon: <IconComponent className="w-4 h-4" />,
      href: getBotTypeRoute(b.type),
      shortcutId: NAV_ID_TO_SHORTCUT_ID[id],
    };
  });

  const navItems: NavItem[] = NAVIGATION_GROUPS.filter(
    (g) => g.id !== 'help'
  ).map((g) => ({
    id: g.id,
    label: labelOverrideMap[g.id] ?? g.label,
    baseLabel: g.label,
    icon: g.icon,
    href: g.href,
    badge: g.badge,
    shortcutId: NAV_ID_TO_SHORTCUT_ID[g.id],
    ...(g.useIsVisible ? { useIsVisible: g.useIsVisible } : {}),
  }));

  // Add user dashboards as individual items so they can appear in More (and be toggled / reordered)
  const dashboards = useMultiDashboardStore((s) => s.dashboards);
  const dashboardItems: NavItem[] = dashboards.map((d) => {
    const id = `dashboard-${d.id}`;
    return {
      id,
      label: labelOverrideMap[id] ?? d.name,
      baseLabel: d.name,
      icon: <LayoutDashboard className="w-4 h-4" />,
      href: `/dashboard/${createDashboardSlug(d.name)}`,
    };
  });

  const reports = useMultiReportStore((s) => s.reports);
  const switchReport = useMultiReportStore((s) => s.switchReport);
  const reportItems: NavItem[] = reports.map((report) => {
    const id = `report-${report.id}`;
    return {
      id,
      reportId: report.id,
      label: labelOverrideMap[id] ?? report.name,
      baseLabel: report.name,
      icon: <BarChart2 className="w-4 h-4" />,
      href: `/reports/${createReportSlug(report.name)}`,
    };
  });

  // Add custom nav items
  const customItems: NavItem[] = customNavItems.map((item) => {
    const id = item.id;
    const IconComponent = (LucideIcons as any)[item.icon] || LucideIcons.Home;
    return {
      id,
      label: labelOverrideMap[id] ?? item.name,
      baseLabel: item.name,
      icon: <IconComponent className="w-4 h-4" />,
      href: item.url,
      shortcut: item.shortcut,
      isCustom: true,
    };
  });

  const allItems: NavItem[] = [
    ...navItems,
    ...botItems,
    ...dashboardItems,
    ...reportItems,
    ...customItems,
  ];

  // Compute ordered items: put items from order first, then append rest
  const orderedIds = (
    (order && order.length > 0 ? order : DEFAULT_VISIBLE_NAV_IDS) || []
  )
    .slice()
    .filter((i) => i !== 'help');
  const missingIds = allItems
    .map((i) => i.id)
    .filter((id) => !orderedIds.includes(id));
  const combinedOrder = [...orderedIds, ...missingIds];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;
    const oldIndex = combinedOrder.indexOf(active.id as string);
    const newIndex = combinedOrder.indexOf(over.id as string);
    if (oldIndex >= 0 && newIndex >= 0) {
      const newOrder = arrayMove(combinedOrder, oldIndex, newIndex);
      // Keep 'more' at the end if present
      const moreIndex = newOrder.indexOf('more');
      if (moreIndex >= 0 && moreIndex !== newOrder.length - 1) {
        newOrder.splice(moreIndex, 1);
        newOrder.push('more');
      }
      setOrder(newOrder.filter(Boolean));
    }
  };

  const handleNavigate = (href?: string, itemId?: string) => {
    if (href) {
      // If this is a report item, switch to it first
      if (itemId?.startsWith('report-')) {
        const reportItem = reportItems.find((r) => r.id === itemId);
        if (reportItem?.reportId) {
          switchReport(reportItem.reportId);
        }
      }
      navigate(href);
      onNavigate?.();
      if (!navigationSecondaryPinned) {
        onClose();
      }
    }
  };

  const startLabelEdit = (
    id: string,
    baseLabel: string,
    currentLabel: string
  ) => {
    editingBaseLabel.current = baseLabel;
    setEditingLabelValue(currentLabel);
    setEditingLabelId(id);
  };

  const commitLabelEdit = () => {
    if (!editingLabelId) return;
    const trimmed = editingLabelValue.trim();
    if (!trimmed || trimmed === editingBaseLabel.current) {
      setLeftNavLabel(editingLabelId, '');
    } else {
      setLeftNavLabel(editingLabelId, trimmed);
    }
    setEditingLabelId(null);
    setEditingLabelValue('');
  };

  const cancelLabelEdit = () => {
    setEditingLabelId(null);
    setEditingLabelValue('');
  };

  const handleEditingKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitLabelEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelLabelEdit();
    }
  };

  const { navigationSecondaryPinned, toggleNavigationSecondaryPinned } =
    useUIStore();
  const useNavigationV2 = useUIStore((s) => s.useNavigationV2);
  const setNavigationV2 = useUIStore((s) => s.setNavigationV2);

  return (
    <RightPanel
      title="More"
      pinned={navigationSecondaryPinned}
      onClose={onClose}
      onPinToggle={toggleNavigationSecondaryPinned}
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-card-foreground hover:bg-muted/30"
          title="Reset navigation"
          aria-label="Reset navigation"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      }
    >
      <ScrollArea className="flex-1 px-6 py-4">
        {/* Appearance */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-3">Appearance</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLabels(false)}
              className={`flex-1 border rounded-lg p-3 flex flex-col items-center gap-2 transition-all ${
                !showLabels
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <img
                src="/images/ui/off-light.svg"
                alt="Icons only"
                className="w-20 h-14 dark:hidden"
              />
              <img
                src="/images/ui/off-dark.svg"
                alt="Icons only"
                className="hidden dark:block w-20 h-14"
              />
              <span className="text-xs">Icons only</span>
            </button>
            <button
              onClick={() => setShowLabels(true)}
              className={`flex-1 border rounded-lg p-3 flex flex-col items-center gap-2 transition-all ${
                showLabels
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <img
                src="/images/ui/on-light.svg"
                alt="Icons & Labels"
                className="w-20 h-14 dark:hidden"
              />
              <img
                src="/images/ui/on-dark.svg"
                alt="Icons & Labels"
                className="hidden dark:block w-20 h-14"
              />
              <span className="text-xs">Icons & Labels</span>
            </button>
          </div>
        </div>

        {/* Customize nav list */}
        <div className="mb-6">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Customize navigation</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Drag to reorder items in Current Navigation
          </p>

          {/* Current Navigation - Draggable & Editable */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Current Navigation
            </h4>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={combinedOrder.filter(
                  (i) => i !== 'more' && visibleIds.includes(i)
                )}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1">
                  {combinedOrder
                    .filter((i) => i !== 'more' && visibleIds.includes(i))
                    .map((id) => {
                      const item = allItems.find((i) => i.id === id);
                      if (!item) return null;
                      const baseLabel = item.baseLabel ?? item.label;
                      const currentLabel = item.label;
                      const isEditing = editingLabelId === id;
                      return (
                        <NavVisibilityGate
                          key={id}
                          useIsVisible={item.useIsVisible}
                        >
                        <SortableListItem
                          id={id}
                          label={item.label}
                          icon={item.icon}
                          href={item.href}
                          checked={true}
                          disabled={false}
                          onToggle={() => toggleItemVisible(id)}
                          onClick={() => handleNavigate(item.href, id)}
                          onStartEdit={() =>
                            startLabelEdit(id, baseLabel, currentLabel)
                          }
                          isEditing={isEditing}
                          editingValue={
                            isEditing ? editingLabelValue : undefined
                          }
                          onEditingChange={(value) =>
                            setEditingLabelValue(value)
                          }
                          onEditingBlur={commitLabelEdit}
                          onEditingKeyDown={handleEditingKeyDown}
                          inputRef={editingInputRef}
                          isDraggable={true}
                          shortcut={item.shortcut}
                          shortcutId={item.shortcutId}
                          isCustom={item.isCustom}
                          onEdit={
                            item.isCustom
                              ? () => {
                                  const customItem = customNavItems.find(
                                    (c) => c.id === id
                                  );
                                  if (customItem) {
                                    setEditingCustomNavItem(customItem);
                                    setIsCustomNavDialogOpen(true);
                                  }
                                }
                              : undefined
                          }
                          onDelete={
                            item.isCustom
                              ? () => deleteCustomNavItem(id)
                              : undefined
                          }
                        />
                        </NavVisibilityGate>
                      );
                    })}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Pages - Static */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Pages
            </h4>
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavVisibilityGate
                  key={item.id}
                  useIsVisible={item.useIsVisible}
                >
                  <StaticListItem
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    href={item.href}
                    checked={visibleIds.includes(item.id)}
                    disabled={visibleIds.includes(item.id)}
                    onToggle={() => toggleItemVisible(item.id)}
                    onClick={() => handleNavigate(item.href, item.id)}
                    shortcutId={item.shortcutId}
                    badge={item.badge}
                  />
                </NavVisibilityGate>
              ))}
            </div>
          </div>

          {/* Dashboards - Static */}
          {dashboardItems.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Dashboards
              </h4>
              <div className="flex flex-col gap-1">
                {dashboardItems.map((item) => (
                  <StaticListItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    href={item.href}
                    checked={visibleIds.includes(item.id)}
                    disabled={visibleIds.includes(item.id)}
                    onToggle={() => toggleItemVisible(item.id)}
                    onClick={() => handleNavigate(item.href, item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reports - Static */}
          {reportItems.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Reports
              </h4>
              <div className="flex flex-col gap-1">
                {reportItems.map((item) => (
                  <StaticListItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    href={item.href}
                    checked={visibleIds.includes(item.id)}
                    disabled={visibleIds.includes(item.id)}
                    onToggle={() => toggleItemVisible(item.id)}
                    onClick={() => handleNavigate(item.href, item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom - Always visible with Add button */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Custom
            </h4>
            <div className="flex flex-col gap-1">
              {customItems.map((item) => (
                <StaticListItem
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  href={item.href}
                  checked={visibleIds.includes(item.id)}
                  disabled={visibleIds.includes(item.id)}
                  onToggle={() => toggleItemVisible(item.id)}
                  onClick={() => handleNavigate(item.href, item.id)}
                  shortcut={item.shortcut}
                  shortcutId={item.shortcutId}
                  isCustom={true}
                  onDelete={() => deleteCustomNavItem(item.id)}
                />
              ))}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-2 px-2 text-sm font-normal hover:bg-muted/50"
                onClick={() => setIsCustomNavDialogOpen(true)}
              >
                <div className="flex items-center justify-center w-5 h-5 rounded-sm bg-primary/10 text-primary">
                  <Plus className="w-4 h-4" />
                </div>
                <span>Add nav item</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Switch to legacy sidebar */}
        <div className="mt-6">
          <div className="p-3 rounded-md bg-inner-container">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Switch to V1 Sidebar</div>
              <Switch
                checked={!useNavigationV2}
                onCheckedChange={(val) => {
                  // val === true means the switch is set to V1, so setNavigationV2(false)
                  setNavigationV2(!val);
                  // close panel after change
                  onClose();
                }}
                className="h-5 w-9"
              />
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Custom Nav Item Dialog */}
      <CustomNavItemDialog
        open={isCustomNavDialogOpen}
        onClose={() => {
          setIsCustomNavDialogOpen(false);
          setEditingCustomNavItem(null);
        }}
        editingItem={editingCustomNavItem}
      />
    </RightPanel>
  );
};

export default MorePanel;

const SortableListItem: React.FC<{
  id: string;
  label: string;
  icon: React.ComponentType<any> | React.ReactNode;
  href?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onClick?: () => void;
  onStartEdit?: () => void;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onEditingBlur?: () => void;
  onEditingKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  isDraggable?: boolean;
  shortcut?: string;
  shortcutId?: string;
  isCustom?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({
  id,
  label,
  icon,
  checked,
  disabled,
  onToggle,
  onClick,
  onStartEdit,
  isEditing,
  editingValue,
  onEditingChange,
  onEditingBlur,
  onEditingKeyDown,
  inputRef,
  isDraggable = true,
  shortcut,
  shortcutId,
  isCustom,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 ${isDragging ? 'shadow-lg scale-105 bg-muted/50' : ''}`}
    >
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div
        className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
        onClick={onClick}
      >
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<any>, {
              className: 'w-5 h-5 text-muted-foreground shrink-0',
            })
          : React.createElement(icon as any, {
              className: 'w-5 h-5 text-muted-foreground shrink-0',
            })}
        <div className="text-sm flex-1 truncate relative pr-6 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingValue ?? ''}
              onChange={(event) => onEditingChange?.(event.target.value)}
              onBlur={onEditingBlur}
              onKeyDown={onEditingKeyDown}
              className="bg-transparent border-b border-primary focus:outline-none focus:ring-0 text-foreground text-sm font-medium min-w-0 w-full"
              aria-label={`Edit label for ${label}`}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate block">{label}</span>
              {shortcutId ? (
                <ShortcutChip id={shortcutId} />
              ) : shortcut ? (
                <div className="text-xs font-mono bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                  {shortcut}
                </div>
              ) : null}
            </div>
          )}
          {!isEditing && onStartEdit && !isCustom && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStartEdit();
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground opacity-0 transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
              aria-label={`Rename ${label}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {!isEditing && isCustom && (onEdit || onDelete) && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 transition duration-150 group-hover:opacity-100">
              {onEdit && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                  }}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Edit ${label}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={() => !disabled && onToggle()}
        disabled={disabled}
      />
    </div>
  );
};

const StaticListItem: React.FC<{
  id: string;
  label: string;
  icon: React.ComponentType<any> | React.ReactNode;
  href?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onClick?: () => void;
  shortcut?: string;
  shortcutId?: string;
  isCustom?: boolean;
  onDelete?: () => void;
  badge?: NavItem['badge'];
}> = ({
  label,
  icon,
  checked,
  disabled,
  onToggle,
  onClick,
  shortcut,
  shortcutId,
  isCustom,
  onDelete,
  badge,
}) => {
  return (
    <div className="group flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
      <div
        className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
        onClick={onClick}
      >
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<any>, {
              className: 'w-5 h-5 text-muted-foreground shrink-0',
            })
          : React.createElement(icon as any, {
              className: 'w-5 h-5 text-muted-foreground shrink-0',
            })}
        <div className="text-sm flex-1 truncate min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate block">{label}</span>
            {badge && (
              <Badge
                variant={badge.variant === 'beta' ? 'destructive' : 'secondary'}
                className="text-xs px-1 py-0 h-4"
              >
                {badge.text}
              </Badge>
            )}
            {shortcutId ? (
              <ShortcutChip id={shortcutId} />
            ) : shortcut ? (
              <div className="text-xs font-mono bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                {shortcut}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {isCustom && onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 transition duration-150 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
};
