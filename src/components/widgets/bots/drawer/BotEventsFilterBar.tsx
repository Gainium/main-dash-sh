/**
 * Filter bar for the bot Events widget.
 *
 * The widget is resizable, so the layout follows the WIDGET's width through
 * container queries (the nearest `@container` ancestor), not the viewport:
 * - >= 800px: every filter inline next to the search box;
 * - <  800px: search stays inline, the rest go in a "Filters" panel that opens
 *   below the bar, two columns (From/To, then Type/Pair) at every width.
 * The panel is rendered in-flow rather than in a portal so it stays inside the
 * container and its queries still apply. Active filters always show as
 * removable chips, so a filter tucked into the closed panel is never invisible.
 */
import React, { useRef, useState } from 'react';
import {
  CalendarDays,
  Download,
  Filter,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BOT_EVENT_TYPE_OPTIONS,
  countActiveBotEventFilters,
  type BotEventFilters,
  type BotEventPairOption,
  type BotEventTypeFilter,
} from '@/lib/botEventFilters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_PAIRS = '__all__';

const formatShortTime = (local: string) => {
  const d = new Date(local);
  return Number.isNaN(d.getTime())
    ? local
    : d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
};

// A date-time field drawn as a button that opens the browser's native
// date-time picker. Not a visible `datetime-local` input because:
// - the global mobile rule pins inputs to 16px (no iOS focus zoom), and at
//   16px the native "mm/dd/yyyy, --:-- --" text needs ~170px — more than a
//   two-column panel leaves on a phone;
// - its picker icon ignores the app theme and sits right after the text.
// The real input stays in the box, invisible, so the picker anchors here
// and `color-scheme` keeps the popup in the active theme.
const DateTimeField: React.FC<{
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  /** Shown when empty; defaults to the label (inline fields have no label). */
  placeholder?: string;
  className?: string;
}> = ({ label, value, min, max, onChange, placeholder, className }) => {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = ref.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };
  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        ref={ref}
        type="datetime-local"
        tabIndex={-1}
        aria-hidden
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 [color-scheme:light] dark:[color-scheme:dark]"
      />
      <button
        type="button"
        aria-label={value ? `${label}: ${formatShortTime(value)}` : label}
        onClick={openPicker}
        className="relative flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-foreground/[0.04] px-3 text-left text-sm hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      >
        <span className={cn('truncate', !value && 'text-muted-foreground')}>
          {value ? formatShortTime(value) : (placeholder ?? label)}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
};

type TypeOption = (typeof BOT_EVENT_TYPE_OPTIONS)[number];

interface FieldsProps {
  filters: BotEventFilters;
  pairOptions: BotEventPairOption[];
  typeOptions: TypeOption[];
  onChange: (patch: Partial<BotEventFilters>) => void;
  /** Inline: compact, unlabeled. Panel: labeled, full width. */
  variant: 'inline' | 'panel';
}

const FilterFields: React.FC<FieldsProps> = ({
  filters,
  pairOptions,
  typeOptions,
  onChange,
  variant,
}) => {
  const panel = variant === 'panel';
  const wrap = (label: string, node: React.ReactNode, className?: string) =>
    panel ? (
      <label
        className={cn(
          'grid min-w-0 gap-1 text-xs text-muted-foreground',
          className
        )}
      >
        {label}
        {node}
      </label>
    ) : (
      <div className={className}>{node}</div>
    );

  return (
    <>
      {wrap(
        'From',
        <DateTimeField
          label="From"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(v) => onChange({ from: v })}
          {...(panel ? { placeholder: 'Any time' } : {})}
        />,
        panel ? undefined : 'w-36 shrink-0'
      )}
      {wrap(
        'To',
        <DateTimeField
          label="To"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(v) => onChange({ to: v })}
          {...(panel ? { placeholder: 'Any time' } : {})}
        />,
        panel ? undefined : 'w-36 shrink-0'
      )}
      {wrap(
        'Type',
        <Select
          value={filters.type}
          onValueChange={(v) => onChange({ type: v as BotEventTypeFilter })}
        >
          <SelectTrigger aria-label="Type" className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
        panel ? undefined : 'w-32 shrink-0'
      )}
      {pairOptions.length > 1 &&
        wrap(
          'Pair',
          <Select
            value={filters.symbol || ALL_PAIRS}
            onValueChange={(v) =>
              onChange({ symbol: v === ALL_PAIRS ? '' : v })
            }
          >
            <SelectTrigger aria-label="Pair" className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PAIRS}>All pairs</SelectItem>
              {pairOptions.map((p) => (
                <SelectItem key={p.symbol} value={p.symbol}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
          panel ? undefined : 'w-36 shrink-0'
        )}
    </>
  );
};

export interface BotEventsFilterBarProps {
  filters: BotEventFilters;
  pairOptions: BotEventPairOption[];
  typeOptions?: TypeOption[];
  onChange: (patch: Partial<BotEventFilters>) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** Omitted when export isn't available (e.g. a shared bot view). */
  onExport?: () => void;
  isExporting?: boolean;
}

export const BotEventsFilterBar: React.FC<BotEventsFilterBarProps> = ({
  filters,
  pairOptions,
  typeOptions = BOT_EVENT_TYPE_OPTIONS,
  onChange,
  onRefresh,
  isRefreshing,
  onExport,
  isExporting,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const activeCount = countActiveBotEventFilters(filters);

  const chips: {
    key: string;
    label: string;
    clear: Partial<BotEventFilters>;
  }[] = [];
  if (filters.from || filters.to) {
    chips.push({
      key: 'time',
      label: `${filters.from ? formatShortTime(filters.from) : '…'} → ${
        filters.to ? formatShortTime(filters.to) : 'now'
      }`,
      clear: { from: '', to: '' },
    });
  }
  if (filters.type !== 'all') {
    chips.push({
      key: 'type',
      label:
        BOT_EVENT_TYPE_OPTIONS.find((o) => o.value === filters.type)?.label ??
        filters.type,
      clear: { type: 'all' },
    });
  }
  if (filters.symbol) {
    chips.push({
      key: 'symbol',
      label:
        pairOptions.find((p) => p.symbol === filters.symbol)?.label ??
        filters.symbol,
      clear: { symbol: '' },
    });
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-xs">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events or order ID"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="h-9 pl-10 pr-9 text-sm"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Clear search"
              onClick={() => onChange({ search: '' })}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="hidden items-center gap-xs @[800px]:flex">
          <FilterFields
            filters={filters}
            pairOptions={pairOptions}
            typeOptions={typeOptions}
            onChange={onChange}
            variant="inline"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 @[800px]:hidden"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <Filter className="h-4 w-4 @[500px]:mr-2" />
          <span className="hidden @[500px]:inline">Filters</span>
          {activeCount > 0 && (
            <span className="ml-1 rounded bg-primary/15 px-1.5 text-xs text-primary">
              {activeCount}
            </span>
          )}
        </Button>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 p-0"
            aria-label="Export shown events as CSV"
            title="Export shown events as CSV"
            onClick={onExport}
            disabled={isExporting}
          >
            <Download
              className={cn('h-4 w-4', isExporting && 'animate-pulse')}
            />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 shrink-0 p-0"
          aria-label="Refresh events"
          title="Refresh"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
          />
        </Button>
      </div>

      {panelOpen && (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-2 @[800px]:hidden">
          <FilterFields
            filters={filters}
            pairOptions={pairOptions}
            typeOptions={typeOptions}
            onChange={onChange}
            variant="panel"
          />
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear)}
              aria-label={`Remove filter ${chip.label}`}
              className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onChange({ type: 'all', symbol: '', from: '', to: '' })
              }
              className="px-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BotEventsFilterBar;
