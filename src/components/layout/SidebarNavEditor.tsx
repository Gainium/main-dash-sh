import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useUIStore } from '@/stores/uiStore';
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
import {
  Check,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import CustomNavItemDialog from './NavigationSidebarV2/panels/CustomNavItemDialog';
import { ROOT_SECTION_ID, type NavLayoutSection } from './navigationLayout';

export interface EditorItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isCustom: boolean;
  enabled: boolean;
}

export interface EditorSection {
  id: string;
  title: string;
  isCustom: boolean;
  items: EditorItem[];
}

interface SidebarNavEditorProps {
  sections: EditorSection[];
}

const SECTION_PREFIX = 'sec:';
const ITEM_PREFIX = 'item:';

type FlatEntry =
  | { kind: 'section'; sectionId: string }
  | { kind: 'item'; itemId: string; sectionId: string };

const sortableId = (entry: FlatEntry): string =>
  entry.kind === 'section'
    ? `${SECTION_PREFIX}${entry.sectionId}`
    : `${ITEM_PREFIX}${entry.itemId}`;

const toLayout = (sections: EditorSection[]): NavLayoutSection[] =>
  sections.map((section) => ({
    id: section.id,
    title: section.title,
    isCustom: section.isCustom,
    itemIds: section.items.map((item) => item.id),
  }));

/** Stable string describing structure + visibility so we can resync local
 *  working state whenever the persisted layout changes underneath us. */
const signatureOf = (sections: EditorSection[]): string =>
  JSON.stringify(
    sections.map((s) => [
      s.id,
      s.title,
      s.isCustom,
      s.items.map((i) => [i.id, i.enabled]),
    ])
  );

const SidebarNavEditor: React.FC<SidebarNavEditorProps> = ({ sections }) => {
  const setNavigationLayout = useUIStore((s) => s.setNavigationLayout);
  const deleteCustomNavItem = useUIStore((s) => s.deleteCustomNavItem);
  const setNavigationItemEnabled = useUIStore(
    (s) => s.setNavigationItemEnabled
  );
  const resetNavigationToDefault = useUIStore(
    (s) => s.resetNavigationToDefault
  );
  const customNavItems = useUIStore((s) => s.customNavItems);

  // Local working copy for smooth drag interaction; resynced from props when
  // the persisted layout changes (add/delete/toggle/reset).
  const [working, setWorking] = useState<EditorSection[]>(sections);
  const signature = useMemo(() => signatureOf(sections), [sections]);
  const signatureRef = useRef(signature);
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      setWorking(sections);
    }
  }, [signature, sections]);

  const [addItemSectionId, setAddItemSectionId] = useState<string | null>(null);
  const [editingCustomItem, setEditingCustomItem] = useState<
    (typeof customNavItems)[number] | null
  >(null);
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(
    null
  );
  const [renameValue, setRenameValue] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionValue, setNewSectionValue] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const commit = (next: EditorSection[]) => {
    setWorking(next);
    setNavigationLayout(toLayout(next));
  };

  const flat: FlatEntry[] = [];
  for (const section of working) {
    if (section.id !== ROOT_SECTION_ID) {
      flat.push({ kind: 'section', sectionId: section.id });
    }
    for (const item of section.items) {
      flat.push({ kind: 'item', itemId: item.id, sectionId: section.id });
    }
  }
  const sortableIds = flat.map(sortableId);

  const sectionContaining = (itemId: string): string => {
    for (const section of working) {
      if (section.items.some((i) => i.id === itemId)) return section.id;
    }
    return ROOT_SECTION_ID;
  };

  const rebuildFromFlat = (entries: FlatEntry[]): EditorSection[] => {
    const sectionMeta = new Map(working.map((s) => [s.id, s]));
    const itemMeta = new Map(
      working.flatMap((s) => s.items.map((i) => [i.id, i] as const))
    );
    const rootMeta = sectionMeta.get(ROOT_SECTION_ID);
    const root: EditorSection = {
      id: ROOT_SECTION_ID,
      title: rootMeta?.title ?? '',
      isCustom: false,
      items: [],
    };
    const result: EditorSection[] = [root];
    let current = root;
    for (const entry of entries) {
      if (entry.kind === 'section') {
        const meta = sectionMeta.get(entry.sectionId);
        if (!meta) continue;
        const section: EditorSection = { ...meta, items: [] };
        result.push(section);
        current = section;
      } else {
        const meta = itemMeta.get(entry.itemId);
        if (meta) current.items.push(meta);
      }
    }
    return result;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith(SECTION_PREFIX)) {
      // Reorder whole sections (root stays pinned at the top).
      const sectionId = activeId.slice(SECTION_PREFIX.length);
      const overSectionId = overId.startsWith(SECTION_PREFIX)
        ? overId.slice(SECTION_PREFIX.length)
        : sectionContaining(overId.slice(ITEM_PREFIX.length));
      if (overSectionId === ROOT_SECTION_ID) return;
      const order = working
        .filter((s) => s.id !== ROOT_SECTION_ID)
        .map((s) => s.id);
      const from = order.indexOf(sectionId);
      const to = order.indexOf(overSectionId);
      if (from < 0 || to < 0) return;
      const movedOrder = arrayMove(order, from, to);
      const byId = new Map(working.map((s) => [s.id, s]));
      const rootMeta = byId.get(ROOT_SECTION_ID);
      const next: EditorSection[] = [
        ...(rootMeta ? [rootMeta] : []),
        ...movedOrder
          .map((id) => byId.get(id))
          .filter((s): s is EditorSection => Boolean(s)),
      ];
      commit(next);
      return;
    }

    // Item drag — reorder the flat list and re-derive section membership.
    const oldIndex = flat.findIndex((f) => sortableId(f) === activeId);
    const newIndex = flat.findIndex((f) => sortableId(f) === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    commit(rebuildFromFlat(arrayMove(flat, oldIndex, newIndex)));
  };

  const toggleItem = (itemId: string, enabled: boolean) => {
    setNavigationItemEnabled(itemId, !enabled);
  };

  const startRename = (section: EditorSection) => {
    setRenamingSectionId(section.id);
    setRenameValue(section.title);
  };

  const commitRename = () => {
    if (!renamingSectionId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      commit(
        working.map((s) =>
          s.id === renamingSectionId ? { ...s, title: trimmed } : s
        )
      );
    }
    setRenamingSectionId(null);
    setRenameValue('');
  };

  const deleteSection = (sectionId: string) => {
    // Relocate the section's items to the root group so nothing is lost.
    const section = working.find((s) => s.id === sectionId);
    if (!section) return;
    const next = working
      .map((s) =>
        s.id === ROOT_SECTION_ID
          ? { ...s, items: [...s.items, ...section.items] }
          : s
      )
      .filter((s) => s.id !== sectionId);
    commit(next);
  };

  const addSection = () => {
    const trimmed = newSectionValue.trim();
    if (!trimmed) {
      setAddingSection(false);
      return;
    }
    const id = `custom-sec-${Date.now()}`;
    commit([...working, { id, title: trimmed, isCustom: true, items: [] }]);
    setNewSectionValue('');
    setAddingSection(false);
  };

  const handleAddedToSection = (itemId: string, sectionId: string) => {
    // Persist the new id directly into the chosen section; working resyncs
    // from props once the custom item resolves.
    const layout = working.map((s) => ({
      id: s.id,
      title: s.title,
      isCustom: s.isCustom,
      itemIds:
        s.id === sectionId
          ? [...s.items.map((i) => i.id), itemId]
          : s.items.map((i) => i.id),
    }));
    setNavigationLayout(layout);
  };

  const sectionPickerList = working.map((s) => ({
    id: s.id,
    title: s.title || 'Top',
  }));

  return (
    <div className="pb-2 w-full min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 px-2 pb-2 mb-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">
          Edit navigation
        </span>
        {confirmingReset ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetNavigationToDefault();
                setConfirmingReset(false);
              }}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Confirm reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingReset(false)}
              className="h-7 w-7 p-0 text-muted-foreground"
              aria-label="Cancel reset"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingReset(true)}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Reset navigation to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {working.map((section) => (
            <div key={section.id} className="mb-1">
              {section.id !== ROOT_SECTION_ID && (
                <SortableSectionRow
                  id={`${SECTION_PREFIX}${section.id}`}
                  section={section}
                  isRenaming={renamingSectionId === section.id}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={commitRename}
                  onRenameCancel={() => setRenamingSectionId(null)}
                  onStartRename={() => startRename(section)}
                  onDelete={() => deleteSection(section.id)}
                />
              )}
              {section.items.map((item) => (
                <SortableItemRow
                  key={item.id}
                  id={`${ITEM_PREFIX}${item.id}`}
                  item={item}
                  onToggle={() => toggleItem(item.id, item.enabled)}
                  onEdit={
                    item.isCustom
                      ? () => {
                          const custom = customNavItems.find(
                            (c) => c.id === item.id
                          );
                          if (custom) setEditingCustomItem(custom);
                        }
                      : undefined
                  }
                  onDelete={
                    item.isCustom
                      ? () => deleteCustomNavItem(item.id)
                      : undefined
                  }
                />
              ))}
              {/* Add a custom item into this section */}
              <button
                type="button"
                onClick={() => setAddItemSectionId(section.id)}
                className="flex w-full items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add item
              </button>
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {/* Add section */}
      <div className="mt-3 px-2">
        {addingSection ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newSectionValue}
              onChange={(e) => setNewSectionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSection();
                if (e.key === 'Escape') {
                  setAddingSection(false);
                  setNewSectionValue('');
                }
              }}
              placeholder="Section name"
              className="flex-1 min-w-0 bg-transparent border-b border-primary text-sm focus:outline-none py-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSection}
              className="h-7 w-7 p-0 text-primary"
              aria-label="Add section"
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAddingSection(false);
                setNewSectionValue('');
              }}
              className="h-7 w-7 p-0 text-muted-foreground"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingSection(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border border-dashed border-muted-foreground/30"
          >
            <Plus className="w-4 h-4" />
            Add section
          </button>
        )}
      </div>

      {/* Add custom item dialog (section pre-selected) */}
      <CustomNavItemDialog
        open={addItemSectionId !== null}
        onClose={() => setAddItemSectionId(null)}
        sections={sectionPickerList}
        defaultSectionId={addItemSectionId ?? undefined}
        onAddedToSection={handleAddedToSection}
      />

      {/* Edit existing custom item */}
      <CustomNavItemDialog
        open={editingCustomItem !== null}
        onClose={() => setEditingCustomItem(null)}
        editingItem={editingCustomItem}
      />
    </div>
  );
};

export default SidebarNavEditor;

const SortableSectionRow: React.FC<{
  id: string;
  section: EditorSection;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onDelete: () => void;
}> = ({
  id,
  section,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1.5 mt-3 px-1 py-1 min-w-0 rounded-md ${
        isDragging ? 'bg-muted/50 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
        aria-label={`Reorder ${section.title} section`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          className="flex-1 min-w-0 bg-transparent border-b border-primary text-xs font-semibold uppercase tracking-wider focus:outline-none"
          aria-label={`Rename ${section.title} section`}
        />
      ) : (
        <span className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {section.title}
        </span>
      )}
      {!isRenaming && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onStartRename}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label={`Rename ${section.title} section`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {section.isCustom && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label={`Delete ${section.title} section`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const SortableItemRow: React.FC<{
  id: string;
  item: EditorItem;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ id, item, onToggle, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1.5 px-1 py-1 min-w-0 rounded-md hover:bg-muted/40 ${
        isDragging ? 'bg-muted/50 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
        aria-label={`Reorder ${item.label}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span
        className={`flex items-center justify-center w-5 h-5 shrink-0 ${
          item.enabled ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {item.icon}
      </span>
      <span
        className={`flex-1 min-w-0 text-sm truncate ${
          item.enabled ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {item.label}
      </span>
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
              aria-label={`Edit ${item.label}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label={`Delete ${item.label}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <Checkbox checked={item.enabled} onCheckedChange={onToggle} />
    </div>
  );
};
