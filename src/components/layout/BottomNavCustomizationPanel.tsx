import { Button } from '@/components/ui/button';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutDashboard,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef } from 'react';
import { useBottomNavStore, type NavItem } from '../../stores/bottomNavStore';
import {
  createDashboardSlug,
  useMultiDashboardStore,
} from '../../stores/multiDashboardStore';
import { DraggableNavItem } from './DraggableNavItem';

interface BottomNavCustomizationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Sortable active nav item component
const SortableActiveNavItem: React.FC<{
  item: NavItem;
  isDragging?: boolean;
  onRemove?: () => void;
}> = ({ item, isDragging, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: item.id,
  });

  // Also make it droppable for replacements
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
  });

  // Combine refs
  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCurrentlyDragging = isDragging || isSortableDragging;

  return (
    <div
      ref={setRefs}
      style={style}
      className={`
        relative flex flex-col items-center justify-center shrink-0 py-1 px-1.5 sm:px-2 h-16 rounded-xl transition-all duration-200 select-none w-14 sm:w-16
        ${
          isCurrentlyDragging
            ? 'opacity-50 scale-110 rotate-1 shadow-2xl z-50'
            : isOver
              ? 'bg-gradient-to-br from-primary/20 to-primary/30 border-2 border-primary/50 shadow-lg scale-105'
              : 'bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/30 shadow-sm hover:scale-105'
        }
        group
      `}
    >
      {/* Remove button - positioned outside drag handle */}
      {onRemove && item.id !== 'more' && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          variant="destructive"
          size="icon"
          className="absolute -top-1 -right-1 w-4 h-4 aspect-square z-50 pointer-events-auto shadow-sm"
          style={{ pointerEvents: 'auto' }}
        >
          <X className="w-2.5 h-2.5 shrink-0" />
        </Button>
      )}

      {/* Drag handle area - separate from remove button */}
      <div
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing w-full h-full flex flex-col items-center justify-center touch-none"
        style={{ touchAction: 'none' }}
      >
        <div
          className={`
          w-8 h-8 mb-1 flex items-center justify-center rounded-lg transition-all duration-200
          ${isCurrentlyDragging ? 'bg-primary/20 animate-pulse' : 'bg-primary/10 group-hover:bg-primary/20'}
        `}
        >
          {React.createElement(item.icon, {
            className: `w-5 h-5 transition-all duration-200 ${
              isCurrentlyDragging
                ? 'text-primary animate-bounce'
                : 'text-primary group-hover:scale-110'
            }`,
          })}
        </div>
        <span
          className={`
          text-xs font-medium text-center leading-tight max-w-full truncate transition-colors duration-200
          ${isCurrentlyDragging ? 'text-primary font-semibold' : 'text-primary font-semibold'}
        `}
        >
          {item.label}
        </span>
      </div>
    </div>
  );
};

// Enhanced empty slot component with drop highlighting
const DroppableEmptySlot: React.FC<{ id: string }> = ({ id }) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col items-center justify-center shrink-0 py-1 px-1.5 sm:px-2 h-16 border-2 border-dashed rounded-xl transition-all duration-200 w-14 sm:w-16
        ${
          isOver
            ? 'border-primary bg-primary/20 scale-105 shadow-lg animate-pulse ring-2 ring-primary ring-offset-2'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50'
        }
        group
      `}
    >
      <Plus
        className={`w-3 h-3 sm:w-4 sm:h-4 transition-all duration-200 ${
          isOver
            ? 'text-primary scale-125 animate-bounce'
            : 'text-muted-foreground/50 group-hover:text-muted-foreground/70'
        }`}
      />
      <span
        className={`text-xs mt-1 transition-colors duration-200 text-center ${
          isOver
            ? 'text-primary font-medium'
            : 'text-muted-foreground/50 group-hover:text-muted-foreground/70'
        }`}
      >
        Drop
      </span>
    </div>
  );
};

export const BottomNavCustomizationPanel: React.FC<
  BottomNavCustomizationPanelProps
> = ({ isOpen, onClose }) => {
  const { activeNavItems, availableItems, setActiveNavItems, resetToDefault } =
    useBottomNavStore();
  const { addAvailableItem, removeAvailableItem } = useBottomNavStore();
  const { dashboards } = useMultiDashboardStore();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [draggedItem, setDraggedItem] = React.useState<NavItem | null>(null);
  const [isCustomDialogOpen, setIsCustomDialogOpen] = React.useState(false);
  const [customName, setCustomName] = React.useState('');
  const [customHref, setCustomHref] = React.useState('');

  const DASH_CHARS = /[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(DASH_CHARS, '-')
      .replace(/^-+|-+$/g, '');

  // Refs for click-outside functionality
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Create dashboard nav items from the store
  const dashboardNavItems: NavItem[] = useMemo(() => {
    return dashboards.map((dashboard) => ({
      id: `dashboard-${dashboard.id}`,
      label: dashboard.name,
      icon: LayoutDashboard,
      href: `/dashboard/${createDashboardSlug(dashboard.name)}`,
      category: 'dashboards' as const,
    }));
  }, [dashboards]);

  // Configure drag sensors with multiple input methods for better scrolling compatibility
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 15, // Require 15px of movement before starting drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Longer delay for touch to allow scrolling
        tolerance: 8,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15, // Require 15px of movement before starting drag to allow better scrolling
        tolerance: 5,
        delay: 100, // Small delay to distinguish between scroll and drag intent
      },
    })
  );

  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        backdropRef.current?.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }

    return undefined;
  }, [isOpen, onClose]);

  // Filter out items that are already active (except More button)
  // Also include dynamically generated dashboard items
  const allAvailableItems = useMemo(() => {
    // Combine store available items with dynamic dashboard items
    // Remove static dashboard item if present, replace with dynamic ones
    const baseItems = availableItems.filter(
      (item) => item.category !== 'dashboards'
    );
    return [...baseItems, ...dashboardNavItems];
  }, [availableItems, dashboardNavItems]);

  const availableForDrag = allAvailableItems.filter(
    (item) => !activeNavItems.some((activeItem) => activeItem.id === item.id)
  );

  // Active items without the More button for drag operations
  const draggableActiveItems = activeNavItems.filter(
    (item) => item.id !== 'more'
  );

  const moreNavItem = activeNavItems.find((item) => item.id === 'more');

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Find the dragged item from available or active items
    const item = [...availableForDrag, ...draggableActiveItems].find(
      (item) => item.id === active.id
    );
    setDraggedItem(item || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      setDraggedItem(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dragging from available to active nav (empty slots)
    if (overId.startsWith('nav-slot-')) {
      const position = parseInt(overId.replace('nav-slot-', ''));
      const item = availableForDrag.find((item) => item.id === activeId);

      if (item && position >= 0 && position < 4) {
        // Remove item at position if exists
        const newActiveItems = [...draggableActiveItems];
        if (newActiveItems[position]) {
          // Replace existing item
          newActiveItems[position] = item;
        } else {
          // Add to position
          newActiveItems.splice(position, 0, item);
        }

        // Ensure max 4 items, then add More button
        const finalItems = newActiveItems.slice(0, 4);
        const moreItem = activeNavItems.find((item) => item.id === 'more');
        if (moreItem) {
          finalItems.push(moreItem);
        }
        setActiveNavItems(finalItems);
      }
    }
    // Check if dropping on existing item to replace it
    else if (draggableActiveItems.some((item) => item.id === overId)) {
      const draggedFromAvailable = availableForDrag.find(
        (item) => item.id === activeId
      );
      const draggedFromActive = draggableActiveItems.find(
        (item) => item.id === activeId
      );

      if (draggedFromAvailable) {
        // Replace existing item with one from available items
        const targetIndex = draggableActiveItems.findIndex(
          (item) => item.id === overId
        );
        if (targetIndex >= 0) {
          const newActiveItems = [...draggableActiveItems];
          newActiveItems[targetIndex] = draggedFromAvailable;
          const moreItem = activeNavItems.find((item) => item.id === 'more');
          if (moreItem) {
            setActiveNavItems([...newActiveItems, moreItem]);
          }
        }
      } else if (draggedFromActive) {
        // Reorder within active nav
        const oldIndex = draggableActiveItems.findIndex(
          (item) => item.id === activeId
        );
        const newIndex = draggableActiveItems.findIndex(
          (item) => item.id === overId
        );

        if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
          const newOrder = arrayMove(draggableActiveItems, oldIndex, newIndex);
          const moreItem = activeNavItems.find((item) => item.id === 'more');
          if (moreItem) {
            setActiveNavItems([...newOrder, moreItem]);
          }
        }
      }
    }

    setActiveId(null);
    setDraggedItem(null);
  };

  if (!isOpen) return null;

  const groupedAvailable = {
    core: availableForDrag.filter((item) => item.category === 'core'),
    bots: availableForDrag.filter((item) => item.category === 'bots'),
    tools: availableForDrag.filter((item) => item.category === 'tools'),
    dashboards: availableForDrag.filter(
      (item) => item.category === 'dashboards'
    ),
    custom: availableForDrag.filter((item) => item.category === 'custom'),
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end"
    >
      <div
        ref={panelRef}
        className="w-full bg-card border-t border-border rounded-t-xl h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-sm border-b border-border shrink-0">
          <div className="flex items-center gap-xs">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Customize Navigation</h2>
          </div>
          <div className="flex items-center gap-xs">
            <Button
              variant="ghost"
              size="sm"
              title="Reset to default"
              onClick={resetToDefault}
              className="p-xs"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-xs"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Scrollable Content */}
          <div
            className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-background"
            style={{
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="p-sm space-y-lg pb-24">
              {/* Current Navigation Preview */}
              <div className="space-y-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Current Navigation
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {draggableActiveItems.length}/4 slots
                  </span>
                </div>
                <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-xs rounded-xl border border-primary/20">
                  <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex items-center justify-center gap-xs overflow-visible py-2">
                      <SortableContext
                        items={draggableActiveItems.map((item) => item.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {/* Active items */}
                        {draggableActiveItems.map((item) => (
                          <SortableActiveNavItem
                            key={item.id}
                            item={item}
                            isDragging={activeId === item.id}
                            onRemove={() => {
                              const newActiveItems =
                                draggableActiveItems.filter(
                                  (i) => i.id !== item.id
                                );
                              const moreItem = activeNavItems.find(
                                (item) => item.id === 'more'
                              );
                              if (moreItem) {
                                setActiveNavItems([
                                  ...newActiveItems,
                                  moreItem,
                                ]);
                              }
                            }}
                          />
                        ))}
                        {/* Empty slots */}
                        {Array.from({
                          length: 4 - draggableActiveItems.length,
                        }).map((_, _index) => (
                          <DroppableEmptySlot
                            key={`nav-slot-${draggableActiveItems.length + _index}`}
                            id={`nav-slot-${draggableActiveItems.length + _index}`}
                          />
                        ))}
                        {/* More button (always visible, non-draggable) */}
                        <div className="relative flex flex-col items-center justify-center shrink-0 py-1 px-1.5 sm:px-2 h-16 w-14 sm:w-16 rounded-xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/30 shadow-sm select-none">
                          <div className="w-8 h-8 mb-1 flex items-center justify-center bg-primary/10 rounded-lg">
                            {moreNavItem
                              ? React.createElement(moreNavItem.icon, {
                                  className: 'w-4 h-4 text-muted-foreground',
                                })
                              : null}
                          </div>
                          <span className="text-xs text-muted-foreground font-medium">
                            More
                          </span>
                        </div>
                      </SortableContext>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Drag items here
                  </p>
                </div>
              </div>

              {/* Available Items */}
              <div className="space-y-lg">
                <h3 className="text-sm font-medium text-foreground">
                  Available Icons
                </h3>
                {Object.entries(groupedAvailable).map(([category, items]) => {
                  // Always show the custom category, even if empty
                  if (items.length === 0 && category !== 'custom') return null;

                  return (
                    <div key={category} className="space-y-sm">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground capitalize flex items-center gap-xs">
                          <div className="w-2 h-2 rounded-full bg-primary/60"></div>
                          {category === 'bots'
                            ? 'Bot Types'
                            : category === 'dashboards'
                              ? 'Dashboards'
                              : category === 'custom'
                                ? 'Custom'
                                : category}
                        </h4>
                        {category === 'custom' && (
                          <div className="flex items-center gap-xs">
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => setIsCustomDialogOpen(true)}
                              className="inline-flex items-center gap-xs"
                            >
                              <Plus className="w-3 h-3" /> Add new
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-sm">
                        {category === 'custom' && items.length === 0 && (
                          <div className="p-xs">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full h-full flex flex-col items-center justify-center gap-1 p-sm rounded-xl"
                              onClick={() => setIsCustomDialogOpen(true)}
                            >
                              <div className="w-8 h-8 mb-2 flex items-center justify-center rounded-lg bg-muted/30">
                                <Sparkles className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Add new
                              </span>
                            </Button>
                          </div>
                        )}
                        {items.map((item) => (
                          <div key={item.id} className="relative">
                            <DraggableNavItem
                              key={item.id}
                              item={item}
                              isDragging={activeId === item.id}
                            />
                            {item.category === 'custom' && (
                              <Button
                                variant="destructive"
                                size="icon"
                                title="Remove custom"
                                onClick={() => removeAvailableItem(item.id)}
                                className="absolute -top-1 -right-1 w-5 h-5 z-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Custom add dialog */}
                {isCustomDialogOpen && (
                  <div className="p-sm bg-card border rounded-xl mt-4">
                    <h4 className="text-sm font-medium mb-2">
                      Add Custom Item
                    </h4>
                    <div className="flex flex-col gap-xs">
                      <input
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Name"
                        className="p-xs rounded-md border border-border bg-background"
                      />
                      <input
                        value={customHref}
                        onChange={(e) => setCustomHref(e.target.value)}
                        placeholder="Path (eg. /my/custom/path)"
                        className="p-xs rounded-md border border-border bg-background"
                      />
                      <div className="flex items-center justify-end gap-xs">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsCustomDialogOpen(false);
                            setCustomName('');
                            setCustomHref('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            if (!customName) return;
                            const id = `custom-${slugify(customName)}-${Date.now()}`;
                            addAvailableItem({
                              id,
                              label: customName,
                              href: customHref || '/',
                              icon: Sparkles,
                              category: 'custom',
                            });
                            setIsCustomDialogOpen(false);
                            setCustomName('');
                            setCustomHref('');
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom padding for scroll */}
              <div className="h-4"></div>
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {draggedItem && (
              <div className="flex flex-col items-center justify-center p-sm bg-card border border-border rounded-xl shadow-2xl scale-110 animate-pulse">
                <div className="w-8 h-8 mb-2 flex items-center justify-center bg-primary/10 rounded-lg">
                  {React.createElement(draggedItem.icon, {
                    className: 'w-5 h-5 text-primary',
                  })}
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {draggedItem.label}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
};
