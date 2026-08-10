import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  DollarSign,
  Edit,
  MoreVertical,
  Pencil,
  Star,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useJournalTagsStore } from '../../stores/journalTagsStore';
import { useNotesStore } from '../../stores/notesStore';
import type {
  JournalExecution,
  JournalTrade,
} from '../../stores/tradeJournalStore';
import { formatDuration } from '../../utils/formatters';
import { calculateExecutionsSummary } from '../../utils/tradeJournalMetrics';
import { TagEditDialog } from '../dialogs/TagEditDialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { DataTable } from '../ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { ProfitValue } from '../ui/ProfitValue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import NotesWidget from '../widgets/dashboard/NotesWidget';

interface SharedTradeInfoDisplayProps {
  trade: JournalTrade;
  onBack?: () => void;
  onUpdateTrade?: (updates: Partial<JournalTrade>) => void;
  notesWidgetId: string;
  defaultNotesContent?: string;
  showBackButton?: boolean;
  blindModeEnabled?: boolean;
  onDuplicate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExecutionClick?: (timestamp: number) => void;
  unrealizedPnL?: number;
}

// Helper components
const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, icon: Icon, children }) => (
  <Card className="p-md">
    <div className="flex items-center gap-xs mb-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    {children}
  </Card>
);

const formatPrice = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(4);
};

const formatQuantity = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }
  return value.toFixed(4).replace(/\.0+$/, '');
};

const hexToRgb = (hex?: string) => {
  if (!hex) return null;
  let normalized = hex.trim().replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (normalized.length !== 6) return null;

  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return null;

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const getReadableTextColor = (hex?: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;

  const normalize = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const luminance =
    0.2126 * normalize(rgb.r) +
    0.7152 * normalize(rgb.g) +
    0.0722 * normalize(rgb.b);

  return luminance > 0.6 ? '#0f172a' : '#f8fafc';
};

const getTagBadgeStyle = (color?: string): React.CSSProperties | undefined => {
  if (!color) return undefined;
  return {
    backgroundColor: color,
    color: getReadableTextColor(color),
    borderColor: color,
  };
};

// ExecutionsTable component
interface ExecutionsTableProps {
  executions: JournalExecution[];
  onExecutionClick?: (timestamp: number) => void;
}

const ExecutionsTable: React.FC<ExecutionsTableProps> = ({
  executions,
  onExecutionClick,
}) => {
  const columns = useMemo<ColumnDef<JournalExecution>[]>(() => {
    return [
      {
        accessorKey: 'timestamp',
        header: 'Date & Time',
        cell: ({ row }) => (
          <div className="text-sm">
            {new Date(row.original.timestamp).toLocaleString()}
          </div>
        ),
        meta: { filterType: 'date' },
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge
            variant={row.original.action === 'buy' ? 'default' : 'secondary'}
            className={
              row.original.action === 'buy'
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-danger/20 text-danger hover:bg-danger/30'
            }
          >
            {row.original.action.toUpperCase()}
          </Badge>
        ),
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        cell: ({ row }) => (
          <div className="text-sm font-medium">
            {row.original.quantity.toFixed(4)}
          </div>
        ),
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => (
          <div className="text-sm font-medium">
            ${row.original.price.toFixed(4)}
          </div>
        ),
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'fee',
        header: 'Fee',
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            ${row.original.fee.toFixed(4)}
          </div>
        ),
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'cost',
        header: 'Total Cost',
        cell: ({ row }) => {
          const cost = row.original.cost;
          return (
            <div className="text-sm font-semibold">${cost.toFixed(2)}</div>
          );
        },
        meta: { filterType: 'number' },
      },
    ];
  }, []);

  return (
    <div className="h-full">
      <DataTable
        tableId="journal-executions"
        columns={columns}
        data={executions}
        enableGlobalFilter={false}
        enableColumnFilters={false}
        enableSorting={true}
        enableColumnReordering={false}
        enableColumnVisibility={false}
        enableColumnResizing={false}
        showPagination={false}
        emptyMessage="No executions found"
        className="h-full"
        onRowClick={
          onExecutionClick
            ? (row) => onExecutionClick(row.timestamp)
            : undefined
        }
      />
    </div>
  );
};

export const SharedTradeInfoDisplay: React.FC<SharedTradeInfoDisplayProps> = ({
  trade,
  onBack,
  onUpdateTrade,
  notesWidgetId,
  defaultNotesContent = '',
  showBackButton = true,
  blindModeEnabled = false,
  onDuplicate,
  onEdit,
  onDelete,
  onExecutionClick,
  unrealizedPnL,
}) => {
  const [activeTab, setActiveTab] = useState<
    'details' | 'executions' | 'strategy' | 'notes'
  >('details');
  const [newTag, setNewTag] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [editingTag, setEditingTag] = useState<{
    tag: string;
    color?: string;
  } | null>(null);

  // Get tag suggestions from the store
  const { getTagSuggestions, updateTagsFromTrade, updateTag, deleteTag } =
    useJournalTagsStore();
  const tagSuggestions = getTagSuggestions();

  const hasTabMenu = Boolean(onDuplicate || onEdit || onDelete);

  // Determine if this is an open/unrealized trade (from terminal imports)
  // A trade is considered open if:
  // - exitTime is missing, 0, or invalid
  // - OR exitPrice is missing, 0, or invalid
  const isOpenTrade =
    !trade.exitTime ||
    trade.exitTime === 0 ||
    !isFinite(trade.exitTime) ||
    !trade.exitPrice ||
    trade.exitPrice === 0 ||
    !isFinite(trade.exitPrice);

  // Calculate execution summary first (needed for ROI calculation)
  const executionSummary = useMemo(() => {
    if (!trade.executions?.length) {
      return null;
    }
    return calculateExecutionsSummary(trade.executions);
  }, [trade.executions]);

  // Calculate effective PnL - use unrealized if available for open trades
  const effectivePnL = useMemo(() => {
    // For open trades with unrealized PnL calculation, use that
    if (isOpenTrade && unrealizedPnL !== undefined) {
      return unrealizedPnL;
    }
    // Otherwise use the stored PnL
    return trade.pnl;
  }, [isOpenTrade, unrealizedPnL, trade.pnl]);

  // Calculate effective ROI for open trades
  const effectiveROI = useMemo(() => {
    if (isOpenTrade && unrealizedPnL !== undefined && executionSummary) {
      // Calculate ROI based on unrealized PnL and initial investment
      const initialInvestment = executionSummary.realizedEntryValue;
      if (initialInvestment > 0) {
        const calculatedROI = (unrealizedPnL / initialInvestment) * 100;
        return calculatedROI;
      }
    }
    // For closed trades, use stored ROI
    return trade.roi;
  }, [isOpenTrade, unrealizedPnL, executionSummary, trade.roi]);

  const isProfitable = effectivePnL >= 0;

  // Determine if this is a cancelled trade (no exit time/price expected)
  const isCancelledTrade = useMemo(() => {
    if (!isOpenTrade) return false;

    const noteFlag =
      typeof trade.notes === 'string' &&
      trade.notes.toLowerCase().includes('cancelled');
    const tagFlag = (trade.tags || []).some((tag) =>
      tag.toLowerCase().includes('cancelled')
    );

    return noteFlag || tagFlag;
  }, [isOpenTrade, trade.notes, trade.tags]);

  // Sync notes between the Notes store (NotesWidget) and the trade object
  const noteEntry = useNotesStore((s) => s.notes[notesWidgetId]);

  // If there's no note in the Notes store but the trade has notes, initialize the widget
  React.useEffect(() => {
    const storeContent = noteEntry?.content ?? '';
    const tradeContent = trade.notes ?? '';

    if (
      (!noteEntry || !storeContent.trim()) &&
      tradeContent &&
      tradeContent.trim()
    ) {
      // Initialize the NotesWidget content from the trade's stored notes
      useNotesStore.getState().setNote(notesWidgetId, {
        title: '',
        content: tradeContent,
      });
    }
    // If Notes store has content but trade doesn't, propagate it back to trade
    if (
      noteEntry &&
      noteEntry.content &&
      noteEntry.content.trim() &&
      !trade.notes
    ) {
      onUpdateTrade?.({ notes: noteEntry.content });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteEntry?.content, notesWidgetId, trade.notes]);

  // Keep trade.notes in sync when the note content changes in the NotesWidget
  React.useEffect(() => {
    const storeContent = noteEntry?.content ?? '';
    const tradeContent = trade.notes ?? '';
    if (storeContent.trim() !== (tradeContent ?? '').trim()) {
      onUpdateTrade?.({ notes: storeContent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteEntry?.content]);

  // Filter tag suggestions based on input (show all tags, only filter by search)
  const filteredSuggestions = useMemo(() => {
    const searchQuery = newTag.toLowerCase().trim();

    if (searchQuery === '') {
      return tagSuggestions;
    }

    return tagSuggestions.filter((suggestion) =>
      suggestion.tag.toLowerCase().includes(searchQuery)
    );
  }, [tagSuggestions, newTag]);

  // Handler functions for trade updates
  const handleRatingChange = useCallback(
    (rating: number) => {
      onUpdateTrade?.({ rating });
    },
    [onUpdateTrade]
  );

  const handleAddTag = useCallback(() => {
    if (newTag.trim() && trade) {
      const currentTags = trade.tags || [];
      const trimmedTag = newTag.trim();
      if (!currentTags.includes(trimmedTag)) {
        const newTags = [...currentTags, trimmedTag];
        onUpdateTrade?.({ tags: newTags });
        // Update the tags store
        updateTagsFromTrade(currentTags, newTags);
      }
      setNewTag('');
      setShowTagSuggestions(false);
    }
  }, [newTag, trade, onUpdateTrade, updateTagsFromTrade]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      if (trade) {
        const currentTags = trade.tags || [];
        const newTags = currentTags.filter((tag) => tag !== tagToRemove);
        onUpdateTrade?.({ tags: newTags });
        // Update the tags store
        updateTagsFromTrade(currentTags, newTags);
      }
    },
    [trade, onUpdateTrade, updateTagsFromTrade]
  );

  const handleSelectSuggestion = useCallback(
    (tag: string) => {
      if (trade) {
        const currentTags = trade.tags || [];
        if (!currentTags.includes(tag)) {
          const newTags = [...currentTags, tag];
          onUpdateTrade?.({ tags: newTags });
          // Update the tags store
          updateTagsFromTrade(currentTags, newTags);
        }
        setNewTag('');
        setShowTagSuggestions(false);
      }
    },
    [trade, onUpdateTrade, updateTagsFromTrade]
  );

  const handleEditTag = useCallback((tag: string, color?: string) => {
    const editState: { tag: string; color?: string } = { tag };
    if (color !== undefined) editState.color = color;
    setEditingTag(editState);
  }, []);

  const handleSaveTagEdit = useCallback(
    (oldTag: string, newTagName: string, newColor?: string) => {
      // Update the tag in the store (will update all trades if renamed)
      updateTag(oldTag, newTagName, newColor);

      // If this trade has the old tag and it was renamed, update local view
      if (oldTag !== newTagName && trade.tags?.includes(oldTag)) {
        const currentTags = trade.tags || [];
        const updatedTags = currentTags.map((t) =>
          t === oldTag ? newTagName : t
        );
        onUpdateTrade?.({ tags: updatedTags });
      }

      setEditingTag(null);
    },
    [updateTag, trade.tags, onUpdateTrade]
  );

  const handleDeleteTag = useCallback(
    (tagToDelete: string) => {
      deleteTag(tagToDelete);

      if (trade.tags?.includes(tagToDelete)) {
        const updatedTags = (trade.tags || []).filter(
          (tag) => tag !== tagToDelete
        );
        onUpdateTrade?.({ tags: updatedTags });
      }

      setEditingTag(null);
      setShowTagSuggestions(false);
    },
    [deleteTag, trade.tags, onUpdateTrade]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background/40 backdrop-blur-sm rounded-md">
      {/* Tag Edit Dialog */}
      {editingTag && (
        <TagEditDialog
          open={!!editingTag}
          onOpenChange={(open) => !open && setEditingTag(null)}
          tag={editingTag.tag}
          {...(editingTag.color !== undefined && { color: editingTag.color })}
          onSave={(newTag, color) =>
            handleSaveTagEdit(editingTag.tag, newTag, color)
          }
          onDelete={() => handleDeleteTag(editingTag.tag)}
        />
      )}

      {/* Header with back button */}
      {showBackButton && onBack && (
        <div className="flex items-center gap-sm p-md border-b border-border/60">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-xs">
            <ArrowLeft className="h-4 w-4" />
            Back to Setup
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Trade Details</h2>
            <p className="text-xs text-muted-foreground">
              {new Date(trade.entryTime).toLocaleDateString()} -{' '}
              {trade.direction.toUpperCase()} {trade.symbol || 'Trade'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as 'details' | 'executions' | 'strategy' | 'notes')
        }
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className={showBackButton && onBack ? 'px-md' : ''}>
          <div className="flex items-center gap-sm">
            <div className="flex-1">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="executions">Executions</TabsTrigger>
                <TabsTrigger value="strategy">Rulebook</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>
            </div>
            {hasTabMenu && (
              <div className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">More trade actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onDuplicate && (
                      <DropdownMenuItem onSelect={onDuplicate}>
                        <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {onEdit && (
                      <DropdownMenuItem onSelect={onEdit}>
                        <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
                        Edit Trade Entry
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={onDelete}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                          Delete Entry
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Details Tab - Combined Overview, Details, and Timing */}
        <TabsContent value="details" className="flex-1 overflow-y-auto">
          <div className="space-y-md p-md">
            {/* Profit & Loss */}
            <Section title="Profit & Loss" icon={DollarSign}>
              <div className="space-y-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    P&L{isOpenTrade ? ' (Unrealized)' : ''}
                  </span>
                  <div className="flex items-center gap-xs">
                    {isProfitable ? (
                      <TrendingUp className="h-4 w-4 text-profit" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-loss" />
                    )}
                    {blindModeEnabled ? (
                      <span className="text-lg font-bold">•••</span>
                    ) : (
                      <ProfitValue
                        value={effectivePnL}
                        size="lg"
                        showSign={true}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    ROI{isOpenTrade ? ' (Unrealized)' : ''}
                  </span>
                  <ProfitValue
                    value={effectiveROI}
                    isPercentage={true}
                    formatAsCurrency={false}
                    showSign={true}
                  />
                </div>
              </div>
            </Section>

            {/* Execution Summary */}
            {executionSummary && (
              <Section title="Execution Summary" icon={Activity}>
                <div className="grid gap-sm grid-cols-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Average entry</span>
                    <span className="font-medium">
                      {formatPrice(executionSummary.averageEntryPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Average exit</span>
                    <span className="font-medium">
                      {formatPrice(executionSummary.averageExitPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Position remainder
                    </span>
                    <span className="font-medium">
                      {formatQuantity(executionSummary.positionRemainderQty)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Realized PnL</span>
                    <ProfitValue
                      value={executionSummary.realizedPnl}
                      size="sm"
                      showSign={true}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Realized ROI</span>
                    <ProfitValue
                      value={executionSummary.realizedRoi}
                      size="sm"
                      isPercentage={true}
                      formatAsCurrency={false}
                      showSign={true}
                    />
                  </div>
                  {isOpenTrade && unrealizedPnL !== undefined && (
                    <>
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Unrealized PnL
                        </span>
                        <ProfitValue
                          value={unrealizedPnL}
                          size="sm"
                          showSign={true}
                        />
                      </div>
                    </>
                  )}
                </div>
              </Section>
            )}

            {/* Trade Rating */}
            {onUpdateTrade && (
              <Section title="Trade Rating" icon={Star}>
                <div className="flex items-center gap-xs">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 cursor-pointer transition-colors ${
                        star <= (trade.rating || 0)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground hover:text-yellow-400'
                      }`}
                      onClick={() => handleRatingChange(star)}
                    />
                  ))}
                  {trade.rating && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({trade.rating}/5)
                    </span>
                  )}
                </div>
              </Section>
            )}

            {/* Symbol & Direction */}
            <Section title="Trade Info" icon={BarChart3}>
              <div className="space-y-sm">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Symbol</span>
                  <span className="font-medium">{trade.symbol || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Direction
                  </span>
                  <span className="font-medium capitalize">
                    {trade.direction}
                  </span>
                </div>
              </div>
            </Section>

            {/* Prices */}
            <Section title="Prices" icon={BarChart3}>
              <div className="space-y-sm">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Entry Price
                  </span>
                  <span className="font-medium">
                    {blindModeEnabled
                      ? '•••'
                      : `$${trade.entryPrice.toFixed(2)}`}
                  </span>
                </div>
                {!isCancelledTrade && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Exit Price{isOpenTrade ? ' (Pending)' : ''}
                    </span>
                    <span className="font-medium">
                      {blindModeEnabled
                        ? '•••'
                        : !isOpenTrade &&
                            trade.exitPrice !== undefined &&
                            trade.exitPrice !== null
                          ? `$${trade.exitPrice.toFixed(2)}`
                          : '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="font-medium">
                    {blindModeEnabled ? '•••' : trade.amount}
                  </span>
                </div>
              </div>
            </Section>

            {/* Time & Duration */}
            <Section title="Time & Duration" icon={Clock}>
              <div className="space-y-sm">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Entry Time
                  </span>
                  <span className="font-medium text-sm">
                    {new Date(trade.entryTime).toLocaleString()}
                  </span>
                </div>
                {!isCancelledTrade && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Exit Time{isOpenTrade ? ' (Pending)' : ''}
                    </span>
                    <span className="font-medium text-sm">
                      {!isOpenTrade &&
                      trade.exitTime &&
                      isFinite(trade.exitTime)
                        ? new Date(trade.exitTime).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                )}
                {trade.duration && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Duration
                    </span>
                    <span className="font-medium">
                      {formatDuration(trade.duration)}
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* Balance Change */}
            {(trade.balanceBefore || trade.balanceAfter) && (
              <Section title="Balance" icon={DollarSign}>
                <div className="space-y-sm">
                  {trade.balanceBefore && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Before
                      </span>
                      <span className="font-medium">
                        {blindModeEnabled
                          ? '•••'
                          : `$${trade.balanceBefore.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                  {trade.balanceAfter && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        After
                      </span>
                      <span className="font-medium">
                        {blindModeEnabled
                          ? '•••'
                          : `$${trade.balanceAfter.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Session Info */}
            {(trade.sessionName || trade.sessionId) && (
              <Section title="Session" icon={BarChart3}>
                <div className="space-y-sm">
                  {trade.sessionName && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Name
                      </span>
                      <span className="font-medium">{trade.sessionName}</span>
                    </div>
                  )}
                  {trade.sessionId && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ID</span>
                      <span className="font-mono text-xs">
                        {trade.sessionId.slice(0, 8)}...
                      </span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Tags */}
            {onUpdateTrade && (
              <Section title="Tags" icon={Tag}>
                <div className="space-y-sm">
                  <div className="flex flex-wrap gap-xs mb-2">
                    {(trade.tags || []).map((tag, idx) => {
                      const tagInfo = tagSuggestions.find((t) => t.tag === tag);
                      const badgeStyle = getTagBadgeStyle(tagInfo?.color);

                      return (
                        <Badge
                          key={idx}
                          variant={badgeStyle ? 'default' : 'secondary'}
                          className={`cursor-pointer flex items-center gap-1 text-xs font-medium transition-opacity ${
                            badgeStyle
                              ? 'hover:opacity-80 shadow-sm'
                              : 'hover:bg-destructive hover:text-destructive-foreground'
                          }`}
                          style={badgeStyle}
                          onClick={() => handleRemoveTag(tag)}
                          title={`Remove ${tag}`}
                        >
                          <span>{tag}</span>
                          <span aria-hidden="true" className="font-semibold">
                            ×
                          </span>
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="relative">
                    <div className="flex gap-xs">
                      <Input
                        placeholder="Add tag or select from list..."
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onFocus={() => setShowTagSuggestions(true)}
                        onBlur={() => {
                          // Delay hiding to allow click on suggestion
                          setTimeout(() => setShowTagSuggestions(false), 200);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddTag();
                            setShowTagSuggestions(false);
                          } else if (e.key === 'Escape') {
                            setShowTagSuggestions(false);
                          }
                        }}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddTag}
                        disabled={!newTag.trim()}
                      >
                        Add
                      </Button>
                    </div>
                    {/* Tag Suggestions Dropdown */}
                    {showTagSuggestions && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredSuggestions.length > 0 ? (
                          filteredSuggestions.map((suggestion) => (
                            <div
                              key={suggestion.tag}
                              className={`px-3 py-2 flex items-center justify-between group transition-colors ${
                                trade.tags?.includes(suggestion.tag)
                                  ? 'opacity-80'
                                  : 'hover:bg-accent hover:text-accent-foreground'
                              }`}
                            >
                              <div
                                className={`flex-1 flex items-center gap-xs ${
                                  trade.tags?.includes(suggestion.tag)
                                    ? 'cursor-default'
                                    : 'cursor-pointer'
                                }`}
                                onClick={() => {
                                  if (!trade.tags?.includes(suggestion.tag)) {
                                    handleSelectSuggestion(suggestion.tag);
                                  }
                                }}
                              >
                                <div className="flex items-center gap-xs">
                                  {suggestion.color && (
                                    <div
                                      className="w-3 h-3 rounded-full border border-border"
                                      style={{
                                        backgroundColor: suggestion.color,
                                      }}
                                    />
                                  )}
                                  <span className="text-sm font-medium">
                                    {suggestion.tag}
                                  </span>
                                  {trade.tags?.includes(suggestion.tag) && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs uppercase tracking-wide"
                                    >
                                      Applied
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-xs">
                                <span className="text-xs text-muted-foreground group-hover:text-accent-foreground">
                                  {suggestion.count} use
                                  {suggestion.count !== 1 ? 's' : ''}
                                </span>
                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent-foreground/10 rounded transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditTag(
                                      suggestion.tag,
                                      suggestion.color
                                    );
                                    setShowTagSuggestions(false);
                                  }}
                                  title="Edit tag"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                            {newTag.trim()
                              ? 'No matching tags found. Press Enter or click Add to create a new tag.'
                              : 'No tags yet. Type to create your first tag.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}
          </div>
        </TabsContent>

        {/* Executions Tab */}
        <TabsContent value="executions" className="flex-1 overflow-hidden">
          <div className="h-full p-md">
            {trade.executions && trade.executions.length > 0 ? (
              <ExecutionsTable
                executions={trade.executions}
                onExecutionClick={onExecutionClick}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No execution data available
              </div>
            )}
          </div>
        </TabsContent>

        {/* Rulebook Tab */}
        <TabsContent value="strategy" className="flex-1 overflow-y-auto">
          <div className="space-y-md p-md">
            {/* Rulebook Name */}
            <Section title="Rulebook" icon={BarChart3}>
              <div className="space-y-sm">
                {trade.strategyName ? (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="font-medium">{trade.strategyName}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No strategy assigned
                  </p>
                )}
              </div>
            </Section>

            {/* Checklist */}
            {trade.checklistSnapshot?.enabled && (
              <Section title="Rulebook Checklist" icon={CheckCircle2}>
                <div className="space-y-xs">
                  {trade.checklistSnapshot.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-xs text-sm"
                    >
                      {item.checked ? (
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <span
                        className={
                          item.checked
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }
                      >
                        {item.name}
                        {item.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-medium">
                        {trade.checklistMarkedCount || 0} /{' '}
                        {trade.checklistTotalCount || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {!trade.checklistSnapshot?.enabled && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No checklist data available for this trade
              </div>
            )}
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="flex-1 overflow-hidden mt-0">
          <div className="h-full p-md">
            <NotesWidget
              widgetId={notesWidgetId}
              variant="panel"
              isEditable={true}
              showTitle={false}
              defaultContent={defaultNotesContent}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
