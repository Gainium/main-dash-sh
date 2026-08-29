import { type ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Info,
  MoreHorizontal,
  Upload,
  X,
} from 'lucide-react';

import CoinPair from '@/components/widgets/shared/CoinPair';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { math } from '@/lib/utils/math';
import { isCoinmExchange } from '@/utils/exchangeUtils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  BotMarginTypeEnum,
  BotTypesEnum,
  type GeneralOpenOrder,
  type GeneralOpenPosition,
  type LinkedPositionBot,
} from '@/types';
import type { TradingPair } from '@/hooks/useTradingPairs';
import {
  computePositionPnl,
  type PositionPnl,
} from '../utils/positionPnl';

export type Precision = { base: number; quote: number; price: number };

export type RowOrder = GeneralOpenOrder & {
  symbolFull?: TradingPair | undefined;
  precision: Precision;
};

export type RowPosition = GeneralOpenPosition & {
  symbolFull?: TradingPair | undefined;
  displayQuantity: string;
  precision: Precision;
  /** Live ticker price, when one is available for the pair. */
  markPrice?: number | undefined;
  /** Unrealized P&L over the whole position; `null` while no ticker is known. */
  pnl?: PositionPnl | null;
  /** Sum of the linked deals' sizes — the part Gainium can account for. */
  accountedQty: number;
  /** Venue quantity minus `accountedQty` — the part nobody owns. */
  residualQty: number;
};

/** Looks up the live ticker price for a position's pair, if we have one. */
export type MarkPriceLookup = (
  position: GeneralOpenPosition
) => number | undefined;

/**
 * Legacy `botUtils.getPrecision(symbol)` shape. The legacy `getAssetPrecision`
 * algorithm is verbatim-ported in `math.getPrecisionFromDecimalString`, so we
 * derive base/quote precision from the pair's step / min-amount strings and
 * take price precision straight from `priceAssetPrecision`. Falls back to 8
 * when the pair metadata isn't loaded (same as legacy).
 */
export function getPrecision(symbolFull?: TradingPair): Precision {
  if (!symbolFull) {
    return { base: 8, quote: 8, price: 8 };
  }
  return {
    base: math.getPrecisionFromDecimalString(
      `${symbolFull.baseAsset.step}`,
      symbolFull.exchange
    ),
    quote: math.getPrecisionFromDecimalString(
      `${symbolFull.quoteAsset.minAmount}`,
      symbolFull.exchange
    ),
    price: symbolFull.priceAssetPrecision ?? 8,
  };
}

/** Enrich raw orders with the matching pair metadata + derived precision. */
export function addSymbolToOrders(
  orders: GeneralOpenOrder[],
  pairsByExchange: Record<string, TradingPair[]>
): RowOrder[] {
  return orders
    .map((o) => ({
      ...o,
      symbolFull: (pairsByExchange[o.exchange] ?? []).find(
        (s) =>
          s.exchange === o.exchange &&
          s.baseAsset.name === o.baseAssetName &&
          s.quoteAsset.name === o.quoteAssetName
      ),
    }))
    .map((o) => ({ ...o, precision: getPrecision(o.symbolFull) }));
}

/**
 * Enrich raw positions with pair metadata, derived precision, displayQuantity
 * and — when a live ticker is known for the pair — the mark price and the
 * unrealized P&L over the whole position.
 */
export function addSymbolToPositions(
  positions: GeneralOpenPosition[],
  pairsByExchange: Record<string, TradingPair[]>,
  markPriceFor?: MarkPriceLookup
): RowPosition[] {
  return positions
    .map((p) => ({
      ...p,
      symbolFull: (pairsByExchange[p.exchange] ?? []).find(
        (s) =>
          s.exchange === p.exchange &&
          s.baseAsset.name === p.baseAssetName &&
          s.quoteAsset.name === p.quoteAssetName
      ),
      displayQuantity: `${Math.abs(+p.quantity)}`,
    }))
    .map((p) => {
      const markPrice = markPriceFor?.(p);
      // Coin-m sizes count contracts, and the Qty column already reads the
      // contract's quote value off `quoteAsset.minAmount` — reuse exactly that
      // assumption so P&L and Qty can never disagree about position size.
      const isInverse = isCoinmExchange(p.exchange);
      // What Gainium can account for is the sum of the linked deals' sizes.
      // Anything above that was opened outside Gainium (or by a bot whose deal
      // has since closed) and is nobody's — that residue is exactly what
      // strands after a partial fill, so it is worth showing rather than
      // folding into whichever bot happened to be listed first.
      const accountedQty = (p.linkedBots ?? []).reduce(
        (sum, b) => sum + Math.abs(b.size ?? 0),
        0
      );
      const venueQty = Math.abs(+p.displayQuantity);
      return {
        ...p,
        accountedQty,
        residualQty: Math.max(0, venueQty - accountedQty),
        precision: getPrecision(p.symbolFull),
        markPrice,
        pnl:
          markPrice === undefined
            ? null
            : computePositionPnl({
                side: p.side,
                entryPrice: +p.price,
                markPrice,
                quantity: +p.displayQuantity,
                isInverse,
                contractSize: Number(p.symbolFull?.quoteAsset.minAmount ?? 1),
                leverage: +p.leverage,
              }),
      };
    });
}

// Shared bot-route mapping for the "Source" column (legacy A.§4.8).
function botRoute(botType?: string): string {
  switch (botType) {
    case BotTypesEnum.hedgeCombo:
      return 'hedge/combo';
    case BotTypesEnum.hedgeDca:
      return 'hedge/dca';
    case BotTypesEnum.dca:
      return 'bot';
    case BotTypesEnum.grid:
      return 'grid';
    case BotTypesEnum.combo:
      return 'combo';
    default:
      return 'terminal';
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function SourceCell({
  botId,
  botType,
  botName,
}: {
  botId?: string;
  botType?: string;
  botName?: string;
}) {
  if (!botId) {
    return <>Not linked to Gainium</>;
  }
  const route = botRoute(botType);
  return (
    <Link
      to={`/${route}/${botType !== 'terminal' ? botId : ''}`}
      onClick={(e) => e.stopPropagation()}
      className="text-primary hover:underline"
    >
      {botType !== 'terminal'
        ? `${botType}: ${botName ? botName : botId}`
        : 'Terminal'}
    </Link>
  );
}

/** True when a linked bot will re-open a deal the moment this one closes. */
export function isReopeningBot(b: LinkedPositionBot): boolean {
  // Only `closed` and `archive` actually stop a bot opening deals. `error` is
  // NOT dormant — it is a soft status the recovery pass clears on its next
  // cycle, after which an ASAP bot opens again. Treating it as stopped would
  // hide the warning on exactly the bots most likely to surprise someone.
  const stopped = b.botStatus === 'closed' || b.botStatus === 'archive';
  return !stopped && b.startCondition === 'ASAP';
}

/**
 * "Linked bots" — the honest version of the old "Source" column.
 *
 * A venue position is one netted lot; any number of Gainium deals can map onto
 * it, and whatever their sizes don't add up to is held outside Gainium. The old
 * column showed a single owner (whichever claim was written last) and silently
 * attributed the whole quantity to it. This lists every claim, and the popover
 * breaks the quantity down per bot with the unaccounted remainder called out.
 */
// eslint-disable-next-line react-refresh/only-export-components
function LinkedBotsCell({ row }: { row: RowPosition }) {
  const bots = row.linkedBots ?? [];
  if (!bots.length) {
    return <span className="text-muted-foreground">Not linked to Gainium</span>;
  }
  const qtyLabel = (qty: number) =>
    `${math.round(qty, row.precision.base)} ${row.baseAssetName ?? ''}`.trim();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 font-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-xs">
            <span className="truncate max-w-[14rem] text-primary">
              {bots.length === 1
                ? `${bots[0]?.botType}: ${bots[0]?.botName || bots[0]?.botId}`
                : `${bots.length} bots`}
            </span>
            {row.residualQty > 0 && (
              <span
                className="text-warning text-xs"
                title="Part of this position is not held by any Gainium deal"
              >
                +residual
              </span>
            )}
            <Info className="h-3 w-3 shrink-0 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-xs">
          <h4 className="font-medium text-sm">Position breakdown</h4>
          {bots.map((b) => (
            <div
              key={`${b.botId}-${b.dealId ?? ''}`}
              className="flex justify-between items-center gap-sm text-xs"
            >
              <Link
                to={`/${botRoute(b.botType)}/${b.botType !== 'terminal' ? b.botId : ''}`}
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline truncate"
              >
                {b.botType}: {b.botName || b.botId}
              </Link>
              <span className="flex items-center gap-xs shrink-0 tabular-nums">
                {isReopeningBot(b) && (
                  <span
                    className="text-warning"
                    title="Starts new deals ASAP — it will re-open right after a close"
                  >
                    ASAP
                  </span>
                )}
                {qtyLabel(Math.abs(b.size ?? 0))}
              </span>
            </div>
          ))}
          {row.residualQty > 0 && (
            <div className="flex justify-between items-center gap-sm text-xs border-t border-border/50 pt-xs">
              <span className="text-warning">Not held by any deal</span>
              <span className="tabular-nums">{qtyLabel(row.residualQty)}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// The legacy disabled rule (both Cancel + Import, both tabs): enabled ONLY
// when there's no source bot and both asset names resolved.
function rowEnabled(row: {
  botId?: string;
  baseAssetName?: string;
  quoteAssetName?: string;
}): boolean {
  return !row.botId && !!row.quoteAssetName && !!row.baseAssetName;
}

export interface OrderColumnActions {
  onCancel: (row: RowOrder) => void;
  onImport: (row: RowOrder) => void;
}

export interface PositionColumnActions {
  onImport: (row: RowPosition) => void;
  /**
   * The single "Close by market" action. Always goes through Gainium: import
   * the position as a terminal deal (or reuse the deal its bot already holds),
   * then close that deal at market, so the close lands in the user's history.
   * There is deliberately no raw `closePositionOnExchange` path in this menu.
   */
  onClose: (row: RowPosition) => void;
  /** Disables the close while one is already running. */
  closing?: boolean;
}

export function buildOrderColumns(
  actions: OrderColumnActions
): ColumnDef<RowOrder>[] {
  return [
    {
      id: 'symbol',
      accessorFn: (r) => r.symbol ?? '',
      header: 'Pair',
      meta: {
        filterType: 'array',
        getFilterValue: (row: unknown) => [(row as RowOrder).symbol],
      },
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex items-center gap-xs">
            <CoinPair
              baseAsset={b.baseAssetName}
              quoteAsset={b.quoteAssetName}
              pair={b.symbol}
              iconSize="sm"
              showText={false}
            />
            <span>{b.symbol}</span>
          </div>
        );
      },
    },
    {
      id: 'exchange',
      accessorFn: (r) => (r.exchangeName ? r.exchangeName : r.exchange),
      header: 'Exchange',
      meta: { filterType: 'string' },
      cell: ({ row }) =>
        row.original.exchangeName
          ? row.original.exchangeName
          : row.original.exchange,
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      header: 'Status',
      meta: { filterType: 'string' },
      cell: ({ row }) => row.original.status,
    },
    {
      id: 'price',
      accessorFn: (r) => +r.price,
      header: 'Price',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        return `${math.round(+b.price, b.precision.price)} ${b.quoteAssetName}`;
      },
    },
    {
      id: 'quantity',
      accessorFn: (r) => +r.quantity,
      header: 'Qty',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        const isBybit = b.exchange.toLowerCase().indexOf('bybit') !== -1;
        const contLabel = isBybit ? 'USD' : 'Cont';
        if (b.status === 'NEW') {
          return isCoinmExchange(b.exchange)
            ? `${b.quantity} ${contLabel} / ${math.round(
                (+b.quantity * (b.symbolFull?.quoteAsset.minAmount ?? 1)) /
                  +b.price,
                b.precision.base
              )} ${b.baseAssetName}`
            : `${math.round(+b.quantity * +b.price, b.precision.quote)} ${
                b.quoteAssetName
              } / ${b.quantity} ${b.baseAssetName}`;
        }
        return isCoinmExchange(b.exchange) ? (
          <>
            {b.quantity}
            {isBybit ? ' USD' : ' Cont'} /
            {math.round(
              (+b.executedQty * (b.symbolFull?.quoteAsset.minAmount ?? 1)) /
                +b.price,
              b.precision.base
            )}{' '}
            {b.baseAssetName}
            <br />
            {b.quantity}
            {isBybit ? ' USD' : ' Cont'} /
            {math.round(
              (+b.quantity * (b.symbolFull?.quoteAsset.minAmount ?? 1)) /
                +b.price,
              b.precision.base
            )}{' '}
            {b.baseAssetName}
          </>
        ) : (
          <>
            {math.round(+b.executedQty * +b.price, b.precision.quote)}{' '}
            {b.quoteAssetName} /{b.executedQty} {b.baseAssetName}
            <br />
            {math.round(+b.quantity * +b.price, b.precision.base)}{' '}
            {b.quoteAssetName} /{b.quantity} {b.baseAssetName}
          </>
        );
      },
    },
    {
      id: 'side',
      accessorFn: (r) => r.side,
      header: 'Side',
      meta: { filterType: 'string' },
      cell: ({ row }) => {
        const b = row.original;
        return (
          <span className="inline-flex items-center gap-xs">
            {b.side === 'BUY' ? (
              <ChevronDown className="w-4 h-4 text-success" />
            ) : (
              <ChevronUp className="w-4 h-4 text-destructive" />
            )}
            {b.side}
          </span>
        );
      },
    },
    {
      id: 'type',
      accessorFn: (r) => r.type,
      header: 'Type',
      meta: { filterType: 'string' },
      cell: ({ row }) => row.original.type,
    },
    {
      id: 'botName',
      accessorFn: (r) => r.botName || '',
      header: 'Source',
      meta: { filterType: 'string' },
      cell: ({ row }) => {
        const b = row.original;
        return (
          <SourceCell
            {...(b.botId !== undefined ? { botId: b.botId } : {})}
            {...(b.botType !== undefined ? { botType: b.botType } : {})}
            {...(b.botName !== undefined ? { botName: b.botName } : {})}
          />
        );
      },
    },
    {
      id: 'created',
      accessorFn: (r) => new Date(r.created),
      header: 'Creation date',
      meta: { filterType: 'date' },
      cell: ({ row }) => new Date(row.original.created).toLocaleString(),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableColumnFilter: false,
      size: 30,
      cell: ({ row }) => {
        const b = row.original;
        const enabled = rowEnabled(b);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                disabled={!enabled}
                className="text-destructive"
                onClick={() => actions.onCancel(b)}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!enabled}
                onClick={() => actions.onImport(b)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

export function buildPositionColumns(
  actions: PositionColumnActions
): ColumnDef<RowPosition>[] {
  return [
    {
      id: 'symbol',
      accessorFn: (r) => r.symbol ?? '',
      header: 'Pair',
      meta: {
        filterType: 'array',
        getFilterValue: (row: unknown) => [(row as RowPosition).symbol],
      },
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex items-center gap-xs">
            <CoinPair
              baseAsset={b.baseAssetName}
              quoteAsset={b.quoteAssetName}
              pair={b.symbol}
              iconSize="sm"
              showText={false}
            />
            <span>{b.symbol}</span>
          </div>
        );
      },
    },
    {
      id: 'exchange',
      accessorFn: (r) => (r.exchangeName ? r.exchangeName : r.exchange),
      header: 'Exchange',
      meta: { filterType: 'string' },
      cell: ({ row }) =>
        row.original.exchangeName
          ? row.original.exchangeName
          : row.original.exchange,
    },
    {
      id: 'price',
      accessorFn: (r) => +r.price,
      header: 'Entry price',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        return `${math.round(+b.price, b.precision.price)} ${b.quoteAssetName}`;
      },
    },
    {
      id: 'markPrice',
      accessorFn: (r) => r.markPrice ?? null,
      header: 'Mark price',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        // A dash rather than a confident 0: no ticker for this pair means we
        // genuinely don't know where it is trading.
        if (b.markPrice === undefined) {
          return <span className="text-muted-foreground">—</span>;
        }
        return `${math.round(b.markPrice, b.precision.price)} ${
          b.quoteAssetName
        }`;
      },
    },
    {
      id: 'unrealizedPnl',
      accessorFn: (r) => r.pnl?.pnlQuote ?? null,
      header: 'Unrealized P&L',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        const { pnl } = b;
        if (!pnl) {
          return <span className="text-muted-foreground">—</span>;
        }
        const up = pnl.pnlQuote >= 0;
        const sign = up ? '+' : '-';
        // Quote precision is the pair's min-amount, which is a whole unit on
        // USD-quoted venues — fine for a size, too coarse for a P&L (a −57.57
        // would print as −58). Never show fewer than cents.
        const pnlPrecision = Math.max(b.precision.quote, 2);
        return (
          <div
            className={up ? 'text-success' : 'text-destructive'}
            title={`Entry notional ${math.round(
              pnl.entryNotional,
              b.precision.quote
            )} ${b.quoteAssetName} · price move ${pnl.pricePct.toFixed(2)}%`}
          >
            <span className="font-medium tabular-nums">
              {sign}
              {math.round(Math.abs(pnl.pnlQuote), pnlPrecision)}{' '}
              {b.quoteAssetName}
            </span>{' '}
            <span className="text-xs tabular-nums">
              ({sign}
              {Math.abs(pnl.roiPct).toFixed(2)}%)
            </span>
          </div>
        );
      },
    },
    {
      id: 'quantity',
      accessorFn: (r) => +r.quantity,
      header: 'Qty',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const b = row.original;
        const isBybit = b.exchange.toLowerCase().indexOf('bybit') !== -1;
        return isCoinmExchange(b.exchange)
          ? `${b.displayQuantity} ${isBybit ? 'USD' : 'Cont'} / ${math.round(
              (+b.displayQuantity * (b.symbolFull?.quoteAsset.minAmount ?? 1)) /
                +b.price,
              b.precision.base
            )} ${b.baseAssetName}`
          : `${math.round(
              +b.displayQuantity * +b.price,
              b.precision.quote
            )} ${b.quoteAssetName} / ${math.round(
              +b.displayQuantity,
              b.precision.base
            )} ${b.baseAssetName}`;
      },
    },
    {
      id: 'side',
      accessorFn: (r) => r.side,
      header: 'Side',
      meta: { filterType: 'string' },
      cell: ({ row }) => row.original.side.toUpperCase(),
    },
    {
      id: 'leverage',
      accessorFn: (r) => r.leverage,
      header: 'Leverage',
      meta: { filterType: 'string' },
      cell: ({ row }) => {
        const b = row.original;
        return `${
          b.marginType === BotMarginTypeEnum.isolated ? 'Isolated' : 'Cross'
        } x${b.leverage}`;
      },
    },
    {
      id: 'botName',
      accessorFn: (r) => (r.linkedBots ?? []).length,
      header: 'Linked bots',
      meta: { filterType: 'number' },
      cell: ({ row }) => <LinkedBotsCell row={row.original} />,
    },
    {
      id: 'created',
      accessorFn: (r) => new Date(r.created),
      header: 'Creation date',
      meta: { filterType: 'date' },
      cell: ({ row }) => new Date(row.original.created).toLocaleString(),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableColumnFilter: false,
      size: 30,
      cell: ({ row }) => {
        const b = row.original;
        const enabled = rowEnabled(b);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              {/* The only close. It routes through Gainium so the position
                  lands in the user's deal history instead of just vanishing
                  off the venue: import first (or reuse the deal its bot
                  already holds), then close that deal at market. */}
              <DropdownMenuItem
                disabled={
                  actions.closing || !b.quoteAssetName || !b.baseAssetName
                }
                className="text-destructive"
                onClick={() => actions.onClose(b)}
              >
                <X className="w-4 h-4 mr-2" />
                Close by market
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!enabled}
                onClick={() => actions.onImport(b)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
