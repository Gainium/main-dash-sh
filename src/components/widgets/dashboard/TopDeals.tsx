import { useComboDeals } from '@/hooks/useComboDeals';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { useUserFees } from '@/hooks/useUserFeesService';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import { logger } from '@/lib/loggerInstance';
import { useUIStore } from '@/stores/uiStore';
import { useTableCustomState } from '@/stores/tablePreferencesStore';
import {
  BotTypesEnum,
  type AllFees,
  type ComboDeals,
  type DCADeals,
  type Prices,
} from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import {
  transformDealToTrade,
  type TransformedTrade,
} from '@/types/dcaDeal';
import { buildBotViewRouteFromType } from '@/utils/bots/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export interface TopDealsProps {
  widgetId: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  /** Cards per page. Kept small so the widget stays short; the rest paginate. */
  pageSize?: number;
}

// The metric a deal is ranked by. `cost` (capital deployed) is the default.
type TopDealsMetric =
  | 'cost'
  | 'value'
  | 'unrealizedPnl'
  | 'pnlPercent'
  | 'profit'
  | 'age';

const METRIC_OPTIONS: { value: TopDealsMetric; label: string }[] = [
  { value: 'cost', label: 'Cost' },
  { value: 'value', label: 'Value' },
  { value: 'unrealizedPnl', label: 'Unrealized PnL' },
  { value: 'pnlPercent', label: 'PnL %' },
  { value: 'profit', label: 'Realized profit' },
  { value: 'age', label: 'Newest' },
];

const ACTIVE_STATUSES = new Set(['open', 'start', 'error']);

// Matches the throttle the bot Deals tab (DrawerDealsTable) and the hedge
// unrealized-P&L map use, so the overview strip re-renders at the same cadence.
const PRICE_UPDATE_THROTTLE_MS = 10_000;

// Stable row-id accessor. Hoisted to module scope so its identity never
// changes — an inline `(row) => row.id` would defeat DataTable's React.memo.
const getTradeRowId = (row: TransformedTrade) => row.id;

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

  const { deals: dcaDeals, isLoading: dcaLoading } = useDcaDeals({
    terminal: false,
    paperContext,
  });
  const { deals: comboDeals, isLoading: comboLoading } = useComboDeals({
    paperContext,
  });

  const isLoading = (dcaLoading || comboLoading) && !dcaDeals.length;

  // Live prices + per-symbol fees. transformDealToTrade only computes the
  // fee-net unrealized P&L when it is GIVEN both; with empty arrays it falls
  // back to the server's `stats.unrealizedProfit`, which is gross of fees. That
  // is why this card used to disagree with the bot's Deals tab (which feeds the
  // same transform real prices+fees) by ~2x the exchange fee on the deal's
  // cost. Source both the same way DrawerDealsTable does so the two views are
  // identical by construction, for every bot type.
  const [prices, setPrices] = useState<Prices>(() => getLocalPrices());
  const lastPriceUpdateRef = useRef(0);

  useEffect(() => {
    const unsubscribe = getLatestPrices((result) => {
      if (result.status !== 'OK' || !result.data) return;
      const now = Date.now();
      // Take the first payload immediately, then throttle re-renders.
      if (
        lastPriceUpdateRef.current === 0 ||
        now - lastPriceUpdateRef.current > PRICE_UPDATE_THROTTLE_MS
      ) {
        setPrices(result.data);
        lastPriceUpdateRef.current = now;
      }
    }, false); // false = don't load binance US
    return unsubscribe;
  }, []);

  const [fees, setFees] = useState<AllFees>([]);
  const { fetchMultipleFees } = useUserFees();

  // Fees are needed for every symbol shown, which is the union of the deals'
  // own symbols — a deal can outlive its pair being removed from the bot's
  // settings. Encoded as a stable string key so the fetch effect only re-runs
  // when the target set actually changes (same pattern as DrawerDealsTable).
  const feeTargetsKey = useMemo(() => {
    const targets = new Set<string>();
    for (const deal of [...dcaDeals, ...comboDeals] as DCADeals[]) {
      const exchange = deal.exchangeUUID || deal.exchange;
      const symbol = deal.symbol?.symbol;
      if (exchange && symbol) targets.add(`${exchange}\u001f${symbol}`);
    }
    return Array.from(targets).sort().join('\n');
  }, [dcaDeals, comboDeals]);

  useEffect(() => {
    if (!feeTargetsKey) return;
    const exchangeSymbolMap = new Map<string, Set<string>>();
    for (const entry of feeTargetsKey.split('\n')) {
      const sep = entry.indexOf('\u001f');
      if (sep < 0) continue;
      const exchange = entry.slice(0, sep);
      const symbol = entry.slice(sep + 1);
      if (!exchangeSymbolMap.has(exchange)) {
        exchangeSymbolMap.set(exchange, new Set());
      }
      exchangeSymbolMap.get(exchange)?.add(symbol);
    }
    let cancelled = false;
    fetchMultipleFees({ exchangeSymbolMap })
      .then((res) => {
        if (cancelled) return;
        // `maker` to match the Deals tab's fee basis exactly.
        setFees(
          (res || []).map((r) => ({
            exchange: r.exchangeUUID,
            symbol: r.symbol,
            fee: r.maker,
          }))
        );
      })
      .catch((error) => {
        logger.error('[TopDeals] Error fetching fees:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [feeTargetsKey, fetchMultipleFees]);

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

    const rows = [
      ...dcaDeals.map((d) => toTrade(d, BotTypesEnum.dca)),
      ...comboDeals.map((d) =>
        toTrade(d as unknown as ComboDeals, BotTypesEnum.combo)
      ),
    ];

    // Only rank active deals with deployed capital so closed/empty rows don't
    // crowd the list. Highest-ranked deals come first; the rest paginate.
    return rows
      .filter(
        (t) =>
          ACTIVE_STATUSES.has(String(t.status).toLowerCase()) &&
          (t.cost ?? 0) > 0
      )
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [dcaDeals, comboDeals, metric, prices, fees]);

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
    () => renderMetricSelect('h-9 w-44'),
    [renderMetricSelect]
  );
  const metricSelectCompact = useMemo(
    () => renderMetricSelect('h-9 w-28'),
    [renderMetricSelect]
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

