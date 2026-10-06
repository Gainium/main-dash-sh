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
 */
import type { BotEvent } from '@/hooks/useBotEvents';
import type { GridFilterItem, GridFilterModel } from '@/types';

export type BotEventTypeFilter =
  'all' | 'orders' | 'deals' | 'errors' | 'warnings';

export const BOT_EVENT_TYPE_OPTIONS: {
  value: BotEventTypeFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All types' },
  { value: 'orders', label: 'Orders' },
  { value: 'deals', label: 'Deals' },
  { value: 'errors', label: 'Errors' },
  { value: 'warnings', label: 'Warnings' },
];

export const isBotEventTypeFilter = (
  value: unknown
): value is BotEventTypeFilter =>
  BOT_EVENT_TYPE_OPTIONS.some((o) => o.value === value);

/** Exact `event` names the bot engines write for order activity. */
const ORDER_EVENT_NAMES = ['Order', 'Order error', 'Take Profit', 'Stop Loss'];

export interface BotEventFilters {
  search: string;
  type: BotEventTypeFilter;
  /** Exchange symbol as stored on the event (e.g. `BTCUSDT`), or '' for all. */
  symbol: string;
  /** `datetime-local` input values (local time), or ''. */
  from: string;
  to: string;
}

export const EMPTY_BOT_EVENT_FILTERS: BotEventFilters = {
  search: '',
  type: 'all',
  symbol: '',
  from: '',
  to: '',
};

/** Number of structured filters set (search excluded — it's always visible). */
export const countActiveBotEventFilters = (f: BotEventFilters): number =>
  (f.type !== 'all' ? 1 : 0) + (f.symbol ? 1 : 0) + (f.from || f.to ? 1 : 0);

const toIso = (local: string): string | null => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function buildBotEventsQuery(f: BotEventFilters): {
  category?: 'deals';
  filterModel?: GridFilterModel;
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
  if (f.type === 'errors' || f.type === 'warnings') {
    items.push({
      id: 'type',
      field: 'type',
      operator: 'equals',
      value: f.type === 'errors' ? 'error' : 'warning',
    });
  }
  if (f.type === 'orders') {
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
  const category = f.type === 'deals' ? ('deals' as const) : undefined;

  if (search && items.length === 0) {
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
