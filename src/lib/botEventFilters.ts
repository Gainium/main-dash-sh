/**
 * Bot events filters — the user-facing filter state of the Events widget and
 * its translation into the `getBotEvents` input.
 *
 * The backend maps `filterModel` through `mapDataGridOptionsToMongoOptions`,
 * which combines every item with ONE operator: all `$and`, or (with
 * `linkOperator: 'or'`) all `$or`. A free-text search across two fields needs
 * `$or`, the structured filters need `$and`, so they cannot share a model:
 * - search alone keeps the name-or-description `$or` it always had;
 * - search with any structured filter matches the description only (where
 *   order ids live), so every item can be `$and`-ed.
 *
 * "Deals" is the backend's own `category` bucket (deal-tied, non-alert) rather
 * than a filter item, because "has a deal id" is not expressible as an item.
 *
 * Type is a multi-select whose result is the UNION of the chosen types. A
 * selection the item model can express (one type, or Errors + Warnings) is
 * sent as before; any other mix (e.g. Orders + Errors) goes in `types`, which
 * the backend turns into one `$or` group AND-ed with the rest.
 */
import type { BotEvent } from '@/hooks/useBotEvents';
import type { GridFilterItem, GridFilterModel } from '@/types';

export type BotEventType = 'orders' | 'deals' | 'errors' | 'warnings';
/** A single type, or 'all' — the shape of the `?eventsType=` deep link. */
export type BotEventTypeFilter = 'all' | BotEventType;

export const BOT_EVENT_TYPE_OPTIONS: {
  value: BotEventType;
  label: string;
}[] = [
  { value: 'orders', label: 'Orders' },
  { value: 'deals', label: 'Deals' },
  { value: 'errors', label: 'Errors' },
  { value: 'warnings', label: 'Warnings' },
];

export const ALL_BOT_EVENT_TYPES_LABEL = 'All types';

/**
 * Type selection from a stored/linked value: a single type (`errors`), `all`,
 * a comma list (`errors,warnings`) or an array. Returns `null` when nothing in
 * it is recognised, so a caller can ignore a bad link. Order follows the
 * option list and duplicates collapse.
 */
export const parseBotEventTypes = (value: unknown): BotEventType[] | null => {
  if (value === 'all') return [];
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((v) => v.trim())
      : [];
  const types = BOT_EVENT_TYPE_OPTIONS.map((o) => o.value).filter((t) =>
    raw.includes(t)
  );
  return types.length ? types : null;
};

/** Label of the Type control: "All types", the one label, or "N types". */
export const botEventTypesLabel = (types: BotEventType[]): string =>
  types.length === 0
    ? ALL_BOT_EVENT_TYPES_LABEL
    : types.length === 1
      ? (BOT_EVENT_TYPE_OPTIONS.find((o) => o.value === types[0])?.label ??
        types[0])
      : `${types.length} types`;

/** Exact `event` names the bot engines write for order activity. */
const ORDER_EVENT_NAMES = ['Order', 'Order error', 'Take Profit', 'Stop Loss'];

export interface BotEventFilters {
  search: string;
  /** Selected types; empty = all types. */
  types: BotEventType[];
  /** Exchange symbol as stored on the event (e.g. `BTCUSDT`), or '' for all. */
  symbol: string;
  /** `datetime-local` input values (local time), or ''. */
  from: string;
  to: string;
}

export const EMPTY_BOT_EVENT_FILTERS: BotEventFilters = {
  search: '',
  types: [],
  symbol: '',
  from: '',
  to: '',
};

/** Number of structured filters set (search excluded — it's always visible). */
export const countActiveBotEventFilters = (f: BotEventFilters): number =>
  (f.types.length ? 1 : 0) + (f.symbol ? 1 : 0) + (f.from || f.to ? 1 : 0);

const toIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function buildBotEventsQuery(f: BotEventFilters): {
  category?: 'deals';
  filterModel?: GridFilterModel;
  types?: BotEventType[];
} {
  const items: GridFilterItem[] = [];
  const from = toIso(f.from);
  const to = toIso(f.to);
  if (from) {
    items.push({
      id: 'from',
      field: 'created',
      operator: 'onOrAfter',
      value: from,
    });
  }
  if (to) {
    items.push({
      id: 'to',
      field: 'created',
      operator: 'onOrBefore',
      value: to,
    });
  }
  const selected = parseBotEventTypes(f.types) ?? [];
  const alertsOnly =
    selected.length > 0 &&
    selected.every((t) => t === 'errors' || t === 'warnings');
  // One type, or Errors + Warnings, fit the item model; any other mix is a
  // union the backend applies from `types`.
  const single = selected.length === 1 ? selected[0] : undefined;
  const types = !single && !alertsOnly && selected.length ? selected : undefined;
  if (alertsOnly) {
    items.push({
      id: 'type',
      field: 'type',
      ...(selected.length === 1
        ? {
            operator: 'equals',
            value: selected[0] === 'errors' ? 'error' : 'warning',
          }
        : { operator: 'isAnyOf', value: 'error,warning' }),
    });
  }
  if (single === 'orders') {
    items.push({
      id: 'type',
      field: 'event',
      operator: 'isAnyOf',
      value: ORDER_EVENT_NAMES.join(','),
    });
  }
  if (f.symbol) {
    items.push({
      id: 'symbol',
      field: 'symbol',
      operator: 'equals',
      value: f.symbol,
    });
  }

  const search = f.search.trim();
  const category = single === 'deals' ? ('deals' as const) : undefined;

  // With a `types` union the search matches the description only, the same
  // rule as with any other type filter.
  if (search && items.length === 0 && !types) {
    return {
      category,
      filterModel: {
        linkOperator: 'or',
        items: [
          {
            id: 'search-event',
            field: 'event',
            operator: 'contains',
            value: search,
          },
          {
            id: 'search-description',
            field: 'description',
            operator: 'contains',
            value: search,
          },
        ],
      },
    };
  }
  if (search) {
    items.push({
      id: 'search-description',
      field: 'description',
      operator: 'contains',
      value: search,
    });
  }
  return {
    category,
    ...(items.length ? { filterModel: { items } } : {}),
    ...(types ? { types } : {}),
  };
}

export interface BotEventPairOption {
  /** Exchange symbol, matched exactly against `event.symbol`. */
  symbol: string;
  label: string;
}

type SymbolValue = { symbol?: string; baseAsset?: string; quoteAsset?: string };

/**
 * Pair options from the bot's own exchange symbols. DCA/Combo bots carry
 * `symbol: { key, value: {symbol, baseAsset, quoteAsset} }[]`, Grid bots a
 * single `{symbol, baseAsset, quoteAsset}`.
 */
export function pairOptionsFromBot(bot: unknown): BotEventPairOption[] {
  const raw = (bot as { symbol?: unknown } | undefined)?.symbol;
  const list: SymbolValue[] = Array.isArray(raw)
    ? raw.map(
        (s) => ((s as { value?: SymbolValue })?.value ?? s) as SymbolValue
      )
    : raw && typeof raw === 'object'
      ? [raw as SymbolValue]
      : [];
  const seen = new Set<string>();
  const options: BotEventPairOption[] = [];
  for (const s of list) {
    if (!s?.symbol || seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    options.push({
      symbol: s.symbol,
      label:
        s.baseAsset && s.quoteAsset
          ? `${s.baseAsset}/${s.quoteAsset}`
          : s.symbol,
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

// Order ids only live inside the event description, e.g.
// "Order filled: x-ABC-TP-..." or "...orderId: x-ABC-TP-..., side: SELL".
export const extractOrderId = (event: BotEvent): string | null => {
  const desc = event.description ?? '';
  const match =
    desc.match(/order\s*id:\s*([^\s,]+)/i) ||
    desc.match(/order\s+filled:\s*([^\s,]+)/i);
  return match ? match[1].trim() : null;
};

const csvField = (value: unknown): string =>
  value === null || value === undefined
    ? '""'
    : `"${String(value).replace(/"/g, '""')}"`;

/** RFC-4180 CSV of events, one row per event, times in ISO-8601 UTC. */
export function botEventsToCsv(events: BotEvent[]): string {
  const header = [
    'Time (UTC)',
    'Event',
    'Type',
    'Pair',
    'Order ID',
    'Deal ID',
    'Description',
  ];
  const rows = events.map((e) => [
    e.created ? new Date(e.created).toISOString() : '',
    e.event,
    e.type ?? '',
    e.symbol ?? '',
    extractOrderId(e) ?? '',
    e.deal ?? '',
    e.description ?? '',
  ]);
  return (
    [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') +
    '\r\n'
  );
}
