/**
 * Filter bar for the bot Events widget.
 *
 * The widget is resizable, so the layout follows the WIDGET's width through
 * container queries (the nearest `@container` ancestor), not the viewport:
 * - >= 1200px: every filter inline next to the search box (each date-time
 *   field is a date and a time box, so the row needs that much room);
 * - <  1200px: search stays inline, the rest go in a "Filters" panel that
 *   opens below the bar: From and To on a row each, then Type/Pair in two
 *   columns.
 * The panel is rendered in-flow rather than in a portal so it stays inside the
 * container and its queries still apply. Active filters always show as
 * removable chips, so a filter tucked into the closed panel is never invisible.
 */
import React, { useState } from 'react';
import {
  ChevronDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_BOT_EVENT_TYPES_LABEL,
  BOT_EVENT_TYPE_OPTIONS,
  botEventTypesLabel,
  countActiveBotEventFilters,
  type BotEventFilters,
  type BotEventPairOption,
  type BotEventType,
} from '@/lib/botEventFilters';
import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-time-input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

type TypeOption = (typeof BOT_EVENT_TYPE_OPTIONS)[number];

/**
 * Multi-select Type control: checkboxes, nothing checked = all types. The menu
 * stays open while toggling so several types can be picked in one go.
 */
const TypeMultiSelect: React.FC<{
  types: BotEventType[];
  typeOptions: TypeOption[];
  onChange: (types: BotEventType[]) => void;
}> = ({ types, typeOptions, onChange }) => {
  const toggle = (value: BotEventType, checked: boolean) =>
    onChange(
      typeOptions
        .map((o) => o.value)
        .filter((t) => (t === value ? checked : types.includes(t)))
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Type"
        className="h-9 w-full justify-between whitespace-nowrap border border-border/50 bg-foreground/[0.04] px-3 py-2 text-sm shadow-xs transition-colors hover:bg-foreground/[0.06]"
      >
        <span className="truncate">{botEventTypesLabel(types)}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuCheckboxItem
          checked={types.length === 0}
          onCheckedChange={() => onChange([])}
          onSelect={(e) => e.preventDefault()}
        >
          {ALL_BOT_EVENT_TYPES_LABEL}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {typeOptions.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={types.includes(o.value)}
            onCheckedChange={(checked) => toggle(o.value, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

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
        <DateTimeInput
          aria-label="From"
          clearable
          value={filters.from}
          max={filters.to || undefined}
          onChange={(v) => onChange({ from: v })}
          placeholder={panel ? 'Any time' : 'From'}
        />,
        panel ? 'col-span-2' : 'w-[17rem] shrink-0'
      )}
      {wrap(
        'To',
        <DateTimeInput
          aria-label="To"
          clearable
          value={filters.to}
          min={filters.from || undefined}
          onChange={(v) => onChange({ to: v })}
          placeholder={panel ? 'Any time' : 'To'}
        />,
        panel ? 'col-span-2' : 'w-[17rem] shrink-0'
      )}
      {wrap(
        'Type',
        <TypeMultiSelect
          types={filters.types}
          typeOptions={typeOptions}
          onChange={(types) => onChange({ types })}
        />,
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
  for (const t of filters.types) {
    chips.push({
      key: `type-${t}`,
      label: BOT_EVENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
      clear: { types: filters.types.filter((x) => x !== t) },
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
        <div className="hidden items-center gap-xs @[1200px]:flex">
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
          className="h-9 shrink-0 @[1200px]:hidden"
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
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-2 @[1200px]:hidden">
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
                onChange({ types: [], symbol: '', from: '', to: '' })
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
