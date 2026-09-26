import { useDealFees } from '@/hooks/useLiveDealPnl';
import { useLatestPrices } from '@/hooks/useLatestPrices';
import {
  useTopDeals,
  type TopDealsMetric,
} from '@/hooks/useTopDeals';
import { PartialCount } from '@/components/ui/large-account';
import { useUIStore } from '@/stores/uiStore';
import { useTableCustomState } from '@/stores/tablePreferencesStore';
import { BotTypesEnum, type ComboDeals, type DCADeals } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import {
  transformDealToTrade,
  type TransformedTrade,
} from '@/types/dcaDeal';
import { buildBotViewRouteFromType } from '@/utils/bots/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CARD_VIEW_COLUMNS } from '../../../config/responsive';
import { formatCurrency } from '@/lib/utils';
import { BotTypeChip, ProfitAndPerc } from '../../ui/chip';
import { DataTable } from '../../ui/data-table/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import EmptyState from '../../ui/empty-state';
import { TradeCard } from '../../trades/TradeCard';
import { WidgetWrapper } from '../../widgets/WidgetWrapper';
import CoinPair from '../shared/CoinPair';
import { SYMBOL_COLUMN_FILTER_META } from '../shared/symbolColumnFilterMeta';

export interface TopDealsProps {
  widgetId: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  /** Cards per page. Kept small so the widget stays short; the rest paginate. */
  pageSize?: number;
}

/**
 * How many deals the server ranks per deal type. The widget pages them
 * `pageSize` cards at a time; beyond this the Deals tab (server-paged) is the
 * place to look.
 */
const TOP_N = 20;

const METRIC_OPTIONS: { value: TopDealsMetric; label: string }[] = [
  { value: 'cost', label: 'Cost' },
  { value: 'value', label: 'Value' },
  { value: 'unrealizedPnl', label: 'Unrealized PnL' },
  { value: 'pnlPercent', label: 'PnL %' },
  { value: 'profit', label: 'Realized profit' },
  { value: 'age', label: 'Newest' },
];

const ACTIVE_STATUSES = new Set(['open', 'start', 'error']);

// Stable row-id accessor. Hoisted to module scope so its identity never
// changes — an inline `(row) => row.id` would defeat DataTable's React.memo.
const getTradeRowId = (row: TransformedTrade) => row.id;

const EMPTY_DCA: DCADeals[] = [];
const EMPTY_COMBO: ComboDeals[] = [];

const metricValue = (t: TransformedTrade, metric: TopDealsMetric): number => {
  const cost = t.cost ?? 0;
  switch (metric) {
    case 'value':
      return t.value ?? 0;
    case 'unrealizedPnl':
      return t.unrealizedProfit ?? 0;
    case 'pnlPercent':
      return cost > 0 ? ((t.unrealizedProfit ?? 0) / cost) * 100 : 0;
    case 'profit':
      return t.profit?.totalUsd ?? 0;
    case 'age':
      return t.created ?? 0;
    case 'cost':
    default:
      return cost;
  }
};

const typeToBotType = (type: TransformedTrade['type']): BotTypesEnum => {
  switch (type) {
    case 'Combo':
      return BotTypesEnum.combo;
    case 'Hedge DCA':
      return BotTypesEnum.hedgeDca;
    case 'Hedge Combo':
      return BotTypesEnum.hedgeCombo;
    case 'Grid':
      return BotTypesEnum.grid;
    case 'Terminal':
      return BotTypesEnum.terminal;
    case 'DCA':
    default:
      return BotTypesEnum.dca;
  }
};

const TopDeals: React.FC<TopDealsProps> = ({
  widgetId,
  isEditable,
  isCollapsible = true,
  pageSize = 4,
}) => {
  const navigate = useNavigate();
  const privacyMode = useUIStore((s) => s.privacyMode);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const paperContext = tradingMode === 'demo' ? true : !isLiveTrading;

  // Persist the selected ranking metric alongside the table's other prefs so
  // it survives reloads.
  const [metric, setMetric] = useTableCustomState<TopDealsMetric>(
    `top-deals-${widgetId}`,
    'metric',
    'cost'
  );

  // Ranked on the server: one small sorted page per deal type (TOP_N rows)
  // instead of downloading EVERY open deal (up to ~14 MB on a large account)
  // and ranking thousands in the browser on every price tick.
  const { data: top, isLoading: topLoading } = useTopDeals(
    metric,
    paperContext,
    TOP_N
  );
  const dcaDeals = top?.dca ?? EMPTY_DCA;
  const comboDeals = top?.combo ?? EMPTY_COMBO;
  const isLoading = topLoading && !top;

  // Live prices + per-symbol fees for the ranked rows only (≤ 2 × TOP_N, or the
  // fallback's loaded rows). One shared, throttled price feed; fees re-fetched
  // only when the set of pairs changes.
  const prices = useLatestPrices();
  const rankedInputs = useMemo(
    () => [...dcaDeals, ...comboDeals] as DCADeals[],
    [dcaDeals, comboDeals]
  );
  const fees = useDealFees(rankedInputs);

  const rankedDeals = useMemo(() => {
    // Reuse the canonical deal→trade transformer (same one the Trading page
    // and bot drawers use), fed the same live prices + fees the Deals tab uses
    // so both render the identical fee-net unrealized P&L.
    const canComputeLive = prices.length > 0 && fees.length > 0;
    const toTrade = (deal: DCADeals | ComboDeals, type: BotTypesEnum) => {
      const bot = {
        type,
        name: deal.botName ?? '',
      } as unknown as DrawerBot;
      if (canComputeLive) {
        const live = transformDealToTrade(deal, fees, prices, bot);
        // A symbol with no price or no fee collapses the live formula to
        // undefined, which would render as $0. Keep the server value in that
        // case — stale-but-close beats a confident zero.
        if (live.unrealizedProfit !== undefined) return live;
      }
      return transformDealToTrade(deal, [], [], bot);
    };

    // Only active deals are transformed at all.
    const rows = [
      ...dcaDeals
        .filter((d) => ACTIVE_STATUSES.has(String(d.status).toLowerCase()))
        .map((d) => toTrade(d, BotTypesEnum.dca)),
      ...comboDeals
        .filter((d) => ACTIVE_STATUSES.has(String(d.status).toLowerCase()))
        .map((d) => toTrade(d, BotTypesEnum.combo)),
    ];

    // Merge the two server-ranked lists by the displayed metric. Only deals
    // with deployed capital; highest-ranked first, the rest paginate.
    return rows
      .filter((t) => (t.cost ?? 0) > 0)
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
      .slice(0, TOP_N);
  }, [dcaDeals, comboDeals, metric, prices, fees]);

  // The server could not rank by this metric (older backend without the
  // fee-inclusive stored values): the ranking covers only the largest open
  // deals it loaded — say so instead of passing it off as the whole account.
  const partialLoaded =
    top && !top.serverRanked && top.loaded < top.totalOpen ? top.loaded : 0;
  const partialTotal = top?.totalOpen ?? 0;
  const partialNote = useMemo(
    () =>
      partialLoaded > 0 ? (
        <PartialCount
          shown={partialLoaded}
          total={partialTotal}
          noun="open deals"
          tooltip={`Ranked among the ${partialLoaded.toLocaleString()} largest open deals of ${partialTotal.toLocaleString()}. This server cannot rank by this metric; the Deals tab lists all of them.`}
        />
      ) : null,
    [partialLoaded, partialTotal]
  );

  const handleOpenBot = useCallback(
    (trade: TransformedTrade) => {
      if (!trade.botId) return;
      navigate(buildBotViewRouteFromType(trade.type, trade.botId));
    },
    [navigate]
  );

  // Render each deal with the shared TradeCard. Memoised so the component type
  // is stable across re-renders (DataTable would otherwise remount every card).
  const TopDealCard = useCallback(
    ({ item }: { item: TransformedTrade; index: number }) => (
      <TradeCard
        trade={item}
        privacyMode={privacyMode}
        enableEnhancedView
        showChart={item.active}
        showTradeDrawer={false}
        filledOrders={[]}
        botType={typeToBotType(item.type)}
        onClick={() => handleOpenBot(item)}
        handleOpenDetailDrawer={handleOpenBot}
        handleEdit={handleOpenBot}
      />
    ),
    [privacyMode, handleOpenBot]
  );

  // Table-view fallback columns (the card view is the default).
  const columns = useMemo<ColumnDef<TransformedTrade>[]>(
    () => [
      {
        id: 'pair',
        accessorFn: (row) => row.pair ?? '',
        header: 'PAIR',
        // The shared Symbol-column filter; these rows carry the symbol as an
        // object, so hand it the plain strings.
        meta: {
          ...SYMBOL_COLUMN_FILTER_META,
          getOptionValue: (row: unknown) => (row as TransformedTrade).pair ?? '',
          getFilterValue: (row: unknown) => {
            const trade = row as TransformedTrade;
            return SYMBOL_COLUMN_FILTER_META.getFilterValue({
              symbol:
                typeof trade.symbol === 'string'
                  ? trade.symbol
                  : trade.symbol?.symbol,
              pair: trade.pair,
            });
          },
        },
        cell: ({ row }) => {
          const sym = row.original.symbol;
          const baseAsset = typeof sym === 'string' ? '' : sym.baseAsset;
          const quoteAsset = typeof sym === 'string' ? '' : sym.quoteAsset;
          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              pair={row.original.pair}
              iconSize="sm"
              showText
              textVariant="symbol"
              layout="horizontal"
              className="justify-start"
            />
          );
        },
        enableSorting: true,
      },
      {
        id: 'type',
        accessorFn: (row) => row.type,
        header: 'TYPE',
        meta: {
          filterType: 'array',
          getOptionValue: (row: unknown) => (row as TransformedTrade).type ?? '',
        },
        cell: ({ row }) => (
          <BotTypeChip
            botType={typeToBotType(row.original.type)}
            size="sm"
            chipStyle="soft"
          />
        ),
      },
      {
        id: 'cost',
        accessorFn: (row) => row.cost ?? 0,
        header: 'COST',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {privacyMode ? '***' : formatCurrency(row.original.cost ?? 0, 2)}
          </div>
        ),
        enableSorting: true,
      },
      {
        id: 'value',
        accessorFn: (row) => row.value ?? 0,
        header: 'VALUE',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {privacyMode ? '***' : formatCurrency(row.original.value ?? 0, 2)}
          </div>
        ),
        enableSorting: true,
      },
      {
        id: 'pnl',
        accessorFn: (row) => row.unrealizedProfit ?? 0,
        header: 'PNL',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const cost = row.original.cost ?? 0;
          const pnl = row.original.unrealizedProfit ?? 0;
          return (
            <ProfitAndPerc
              value={pnl}
              percentage={cost > 0 ? (pnl / cost) * 100 : 0}
              privacyMode={privacyMode}
              size="sm"
            />
          );
        },
        enableSorting: true,
      },
    ],
    [privacyMode]
  );

  // The ranking selector lives in the DataTable toolbar (rendered before the
  // search/view-toggle controls), so the widget body is just the table.
  const renderMetricSelect = useCallback(
    (triggerClassName: string) => (
      <Select
        value={metric}
        onValueChange={(v) => setMetric(v as TopDealsMetric)}
      >
        <SelectTrigger className={triggerClassName} aria-label="Rank deals by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METRIC_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              Top by {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    [metric, setMetric]
  );

  // Memoize the toolbar elements + empty state so DataTable's React.memo
  // isn't defeated by fresh element identities every render.
  const metricSelectFull = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {renderMetricSelect('h-9 w-44')}
        {partialNote}
      </div>
    ),
    [renderMetricSelect, partialNote]
  );
  const metricSelectCompact = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {renderMetricSelect('h-9 w-28')}
        {partialNote}
      </div>
    ),
    [renderMetricSelect, partialNote]
  );
  const emptyContent = useMemo(
    () => (
      <EmptyState
        size="widget"
        title="No active deals"
        description="Your top deals will appear here once your bots open positions."
      />
    ),
    []
  );

  const content = useMemo(
    () =>
      isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={`top-deals-skel-${i}`}
              className="h-64 animate-pulse rounded-xl bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <DataTable
          tableId={`top-deals-${widgetId}`}
          columns={columns}
          data={rankedDeals}
          enableCardView
          defaultView="cards"
          cardComponent={TopDealCard}
          cardViewBreakpoints={CARD_VIEW_COLUMNS}
          cardViewGap={16}
          enableSorting
          initialPageSize={pageSize}
          getRowId={getTradeRowId}
          className="h-full"
          firstToolbarActions={metricSelectFull}
          firstToolbarActionsCompact={metricSelectCompact}
          emptyContent={emptyContent}
        />
      ),
    [
      isLoading,
      pageSize,
      widgetId,
      columns,
      rankedDeals,
      TopDealCard,
      metricSelectFull,
      metricSelectCompact,
      emptyContent,
    ]
  );

  const metadata = useMemo(
    () => ({
      id: widgetId,
      type: 'top-deals',
      title: 'Top Deals',
      header: true,
      hasOptions: false,
    }),
    [widgetId]
  );

  return (
    <WidgetWrapper
      metadata={metadata}
      isEditable={isEditable ?? false}
      isCollapsible={isCollapsible}
    >
      {content}
    </WidgetWrapper>
  );
};

export default React.memo(TopDeals);

