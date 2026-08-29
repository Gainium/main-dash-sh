import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { type SortingState } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/ui/data-table/data-table';
import EmptyState from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import { useTransformedExchanges } from '@/hooks/useTransformedExchanges';
import { useImportMutations } from '@/hooks/useImportMutations';
import {
  useExchangeOrders,
  useExchangePositions,
} from '@/hooks/useExchangeOrdersPositions';
import type { Order, Position } from '@/types/bots/trading';
import { useMarkPrices } from '../utils/useMarkPrices';
import { math } from '@/lib/utils/math';
import {
  addSymbolToOrders,
  addSymbolToPositions,
  buildOrderColumns,
  buildPositionColumns,
  isReopeningBot,
  type RowOrder,
  type RowPosition,
} from './exchangeOrderColumns';

/**
 * `?view=positions` on /terminal opens this panel straight onto the Positions
 * sub-tab — that's what the sidebar's "Positions" entry links to, instead of a
 * near-duplicate standalone page.
 */
export const POSITIONS_VIEW_PARAM = 'view';
export const POSITIONS_VIEW_VALUE = 'positions';

type ShownTab = 'orders' | 'positions';

type ConfirmKind =
  | 'cancelOrder'
  | 'cancelDeal'
  | 'importOrder'
  | 'importPosition'
  | 'flattenPosition';

// Legacy confirm copy, except where it described the action wrongly:
// "cancel the position" is a reduce-only MARKET close of the whole position
// (`closePositionOnExchange` → placeOrderOnExchange, type MARKET,
// reduceOnly: true), not a cancellation of anything.
const CONFIRM_MESSAGES: Record<ConfirmKind, string> = {
  cancelOrder: 'Are you sure you want to cancel order?',
  importOrder:
    'Are you sure you want to import the order?\nIt will cancel the order on the exchange and open smart terminal bot',
  importPosition: 'Are you sure you want to import position?',
  cancelDeal:
    'Are you sure you want to cancel the order?\nIt will cancel the deal created by source bot',
  flattenPosition:
    'Close this whole position by market?\nEach linked bot closes its own deal first, then the remainder is imported and closed as a terminal deal — so all of it lands in your history. This takes a few seconds per bot.',
};

// Actions that cancel orders or close a position. Listed explicitly rather
// than matched on the kind's name prefix, so renaming a kind can't silently
// downgrade a destructive confirm to a neutral one.
const DESTRUCTIVE_CONFIRMS = new Set<ConfirmKind>([
  'cancelOrder',
  'cancelDeal',
  'flattenPosition',
]);

// Map an enriched order row to the looser `Order` the mutation hook expects,
// carrying `dealId` through (trading.ts `Order` lacks it; the handler reads it
// off the extra field).
function toOrder(row: RowOrder): Order & { dealId?: string } {
  return {
    orderId: row.orderId,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    status: row.status,
    price: row.price,
    quantity: row.quantity,
    baseAssetName: row.baseAssetName ?? '',
    quoteAssetName: row.quoteAssetName ?? '',
    exchangeUUID: row.exchangeUUID,
    ...(row.exchangeName !== undefined ? { exchangeName: row.exchangeName } : {}),
    exchange: row.exchange,
    ...(row.botId !== undefined ? { botId: row.botId } : {}),
    ...(row.botType !== undefined ? { botType: row.botType } : {}),
    ...(row.botName !== undefined ? { botName: row.botName } : {}),
    ...(row.dealId !== undefined ? { dealId: row.dealId } : {}),
  };
}

function toPosition(row: RowPosition): Position {
  return {
    positionId: row.positionId,
    symbol: row.symbol,
    side: row.side,
    leverage: row.leverage,
    marginType: row.marginType,
    price: row.price,
    quantity: row.quantity,
    baseAssetName: row.baseAssetName ?? '',
    quoteAssetName: row.quoteAssetName ?? '',
    exchangeUUID: row.exchangeUUID,
    ...(row.exchangeName !== undefined ? { exchangeName: row.exchangeName } : {}),
    exchange: row.exchange,
    ...(row.botId !== undefined ? { botId: row.botId } : {}),
    ...(row.botType !== undefined ? { botType: row.botType } : {}),
    ...(row.botName !== undefined ? { botName: row.botName } : {}),
  };
}

const ORDERS_DEFAULT_SORT: SortingState = [{ id: 'created', desc: true }];
const POSITIONS_DEFAULT_SORT: SortingState = [{ id: 'created', desc: true }];

/**
 * Trading Terminal "Exchange" tab: raw open exchange orders & positions with
 * per-row Cancel / Import actions. Ported from the legacy `TradingPositions`.
 * Only the active sub-tab is fetched; every successful action and the refresh
 * button refetch the active sub-tab.
 */
export function ExchangeOrdersPanel() {
  const [searchParams] = useSearchParams();
  const wantsPositions =
    searchParams.get(POSITIONS_VIEW_PARAM) === POSITIONS_VIEW_VALUE;
  const [shownTab, setShownTab] = useState<ShownTab>(
    wantsPositions ? 'positions' : 'orders'
  );
  // Follow the param when it appears on an already-mounted panel (clicking the
  // sidebar's Positions entry while the terminal is open doesn't remount us).
  // Only ever forces the tab ON — clearing the param leaves the user's own
  // choice alone.
  useEffect(() => {
    if (wantsPositions) setShownTab('positions');
  }, [wantsPositions]);
  const [exchangeUUID, setExchangeUUID] = useState<string>('all');
  const [ordersSorting, setOrdersSorting] =
    useState<SortingState>(ORDERS_DEFAULT_SORT);
  const [positionsSorting, setPositionsSorting] = useState<SortingState>(
    POSITIONS_DEFAULT_SORT
  );
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind;
    run: (stopReopeningBots: boolean) => void;
    restingOrders?: number;
    position?: RowPosition;
  } | null>(null);
  // Defaults on: re-opening right after a deliberate flatten is almost never
  // what the user wants. Reset each time a dialog opens.
  const [stopReopeningBots, setStopReopeningBots] = useState(true);

  const reopeningBots = useMemo(
    () => (confirm?.position?.linkedBots ?? []).filter(isReopeningBot),
    [confirm]
  );

  const { exchanges } = useTransformedExchanges();
  const { pairsByExchange } = useTradingPairsFromContext();

  // Fetched on both sub-tabs (legacy fetched only the active one): the
  // Positions confirm dialog needs the pair's resting orders to warn about
  // what a close leaves behind.
  const ordersQ = useExchangeOrders(exchangeUUID, true);
  const positionsQ = useExchangePositions(
    exchangeUUID,
    shownTab === 'positions'
  );

  const refetchActive = () =>
    shownTab === 'orders' ? ordersQ.refetch() : positionsQ.refetch();

  const {
    handleImportOrder,
    handleImportPosition,
    handleCancelOrder,
    handleFlattenPosition,
    isClosingAsDeal,
  } = useImportMutations({ onSuccess: refetchActive });

  // Closing a deal only cancels that deal's own orders. Anything else on the
  // same pair — orders placed by hand, or by a different bot — keeps resting on
  // the venue afterwards, and a plain (non-reduce-only) limit that later fills
  // opens a fresh position. Count only what SURVIVES the close: exclude the
  // orders belonging to the bot whose deal we are about to close, since those
  // are cancelled as part of it. An unlinked row has no bot, and the terminal
  // bot we import into places no orders of its own, so there everything counts.
  const restingOrderCount = useCallback(
    (row: RowPosition) =>
      ordersQ.orders.filter(
        (o) =>
          o.exchangeUUID === row.exchangeUUID &&
          o.symbol === row.symbol &&
          !(row.botId && o.botId === row.botId)
      ).length,
    [ordersQ.orders]
  );

  const orderColumns = useMemo(
    () =>
      buildOrderColumns({
        onCancel: (row) =>
          setConfirm({
            kind: row.botId && row.dealId ? 'cancelDeal' : 'cancelOrder',
            run: () => handleCancelOrder(toOrder(row)),
          }),
        onImport: (row) =>
          setConfirm({
            kind: 'importOrder',
            run: () => handleImportOrder(toOrder(row)),
          }),
      }),
    [handleCancelOrder, handleImportOrder]
  );

  const positionColumns = useMemo(
    () =>
      buildPositionColumns({
        onImport: (row) =>
          setConfirm({
            kind: 'importPosition',
            run: () => handleImportPosition(toPosition(row)),
          }),
        onClose: (row) => {
          setStopReopeningBots(true);
          setConfirm({
            kind: 'flattenPosition',
            // Resting orders the user placed themselves are not part of any
            // Gainium deal, so closing the deals leaves them on the venue.
            restingOrders: restingOrderCount(row),
            position: row,
            run: (stopBots) => {
              void handleFlattenPosition(
                {
                  positionId: row.positionId,
                  exchangeUUID: row.exchangeUUID,
                  symbol: row.symbol,
                  quantity: row.quantity,
                  linkedBots: row.linkedBots ?? [],
                  residualQty: row.residualQty,
                },
                stopBots
              );
            },
          });
        },
        closing: isClosingAsDeal,
      }),
    [
      handleImportPosition,
      handleFlattenPosition,
      isClosingAsDeal,
      restingOrderCount,
    ]
  );

  const orderRows = useMemo(
    () => addSymbolToOrders(ordersQ.orders, pairsByExchange),
    [ordersQ.orders, pairsByExchange]
  );
  const markPriceFor = useMarkPrices(shownTab === 'positions');
  const positionRows = useMemo(
    () =>
      addSymbolToPositions(positionsQ.positions, pairsByExchange, markPriceFor),
    [positionsQ.positions, pairsByExchange, markPriceFor]
  );

  // Defensive select value: fall back to 'all' when the stored id isn't loaded.
  const selectValue = exchanges.find((e) => e.id === exchangeUUID)
    ? exchangeUUID
    : 'all';

  const activeLoading =
    shownTab === 'orders' ? ordersQ.isLoading : positionsQ.isLoading;
  const activeError = shownTab === 'orders' ? ordersQ.error : positionsQ.error;
  const activeHasData =
    shownTab === 'orders' ? orderRows.length > 0 : positionRows.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-sm px-md py-sm">
        <Tabs value={shownTab} onValueChange={(v) => setShownTab(v as ShownTab)}>
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-xs">
          <Select value={selectValue} onValueChange={setExchangeUUID}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="All Exchanges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exchanges</SelectItem>
              <SelectSeparator />
              {exchanges
                .filter((e) => e.id !== 'ALL')
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetchActive}
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeLoading && !activeHasData ? (
          <div className="flex flex-col gap-sm px-md py-sm">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : activeError ? (
          <div className="px-md py-sm text-sm text-destructive">
            Failed to load {shownTab}.
          </div>
        ) : shownTab === 'orders' ? (
          <DataTable<RowOrder, unknown>
            tableId="terminal-raw-orders"
            columns={orderColumns}
            data={orderRows}
            getRowId={(r) =>
              r.exchange + r.symbol + new Date(r.created).getTime()
            }
            sorting={ordersSorting}
            onSortingChange={setOrdersSorting}
            enableGlobalFilter
            enableColumnFilters
            enableSorting
            enableColumnVisibility
            enableQuickFilterBar
            quickFilterBarStorageKey="terminal-raw-orders-filters"
            defaultPinnedColumns={{ left: [], right: ['actions'] }}
            className="flex-1"
            emptyContent={
              <EmptyState size="page" title="No active orders" />
            }
          />
        ) : (
          <DataTable<RowPosition, unknown>
            tableId="terminal-positions"
            columns={positionColumns}
            data={positionRows}
            getRowId={(r) => r.positionId}
            sorting={positionsSorting}
            onSortingChange={setPositionsSorting}
            enableGlobalFilter
            enableColumnFilters
            enableSorting
            enableColumnVisibility
            enableQuickFilterBar
            quickFilterBarStorageKey="terminal-positions-filters"
            defaultPinnedColumns={{ left: [], right: ['actions'] }}
            className="flex-1"
            emptyContent={
              <EmptyState size="page" title="No active positions" />
            }
          />
        )}
      </div>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm the action</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {confirm ? CONFIRM_MESSAGES[confirm.kind] : ''}
            </DialogDescription>
            {/* Spell out what is actually being closed. A venue position can
                be several bots' deals plus something nobody owns, and the row
                only shows the netted total. */}
            {confirm?.position && (
              <div className="rounded-md bg-inner-container p-sm text-xs space-y-xs">
                {(confirm.position.linkedBots ?? []).map((b) => (
                  <div
                    key={`${b.botId}-${b.dealId ?? ''}`}
                    className="flex justify-between gap-sm"
                  >
                    <span className="truncate">
                      {b.botType}: {b.botName || b.botId}
                      {!b.dealId && (
                        <span className="text-warning">
                          {' '}
                          — closing its position stops the bot
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {math.round(
                        Math.abs(b.size ?? 0),
                        confirm.position?.precision.base ?? 8
                      )}{' '}
                      {confirm.position?.baseAssetName}
                    </span>
                  </div>
                ))}
                {confirm.position.residualQty > 0 && (
                  <div className="flex justify-between gap-sm">
                    <span>Not held by any deal — imported, then closed</span>
                    <span className="tabular-nums shrink-0">
                      {math.round(
                        confirm.position.residualQty,
                        confirm.position.precision.base
                      )}{' '}
                      {confirm.position.baseAssetName}
                    </span>
                  </div>
                )}
              </div>
            )}
            {/* An ASAP bot opens a new deal the moment one closes, so without
                this the position comes straight back. Stopping uses `leave`,
                which touches none of the bot's deals on other symbols. */}
            {!!reopeningBots.length && (
              <label className="flex items-start gap-sm text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={stopReopeningBots}
                  onChange={(e) => setStopReopeningBots(e.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    {reopeningBots.length === 1
                      ? 'Pause the bot that re-opens deals'
                      : 'Pause the bots that re-open deals'}
                  </span>
                  <span className="block text-muted-foreground">
                    {reopeningBots.map((b) => b.botName || b.botId).join(', ')}{' '}
                    {reopeningBots.length === 1 ? 'starts' : 'start'} deals ASAP
                    and will re-open right after this closes.{' '}
                    {reopeningBots.length === 1 ? 'It stops' : 'They stop'}{' '}
                    opening new deals; deals on other pairs are untouched, and
                    you restart{' '}
                    {reopeningBots.length === 1 ? 'it' : 'them'} yourself.
                  </span>
                </span>
              </label>
            )}
            {/* Only the closed deals' own orders are cancelled — never every
                order on the pair. Anything placed by hand keeps resting. */}
            {!!confirm?.restingOrders && (
              <DialogDescription className="text-warning">
                {confirm.restingOrders === 1
                  ? 'There is 1 other open order on this pair. It is not part of any deal being closed, so it stays on the exchange afterwards.'
                  : `There are ${confirm.restingOrders} other open orders on this pair. They are not part of any deal being closed, so they stay on the exchange afterwards.`}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={
                confirm && DESTRUCTIVE_CONFIRMS.has(confirm.kind)
                  ? 'destructive'
                  : 'default'
              }
              onClick={() => {
                confirm?.run(stopReopeningBots);
                setConfirm(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExchangeOrdersPanel;
