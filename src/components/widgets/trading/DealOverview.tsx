/* eslint-disable react-refresh/only-export-components */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type DCAGrid, type DCAOrderTypeEnum } from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { computeDealSummary } from '@/utils/bots/dca/deal-summary';
import {
  formatLiquidationPrice,
  type LadderLiquidation,
} from '@/utils/bots/dca/liquidation';

// Re-exported for existing callers that import the formatter from this module.
export { formatTotalFunds } from '@/utils/bots/dca/deal-summary';
export type { TotalFundsContext } from '@/utils/bots/dca/deal-summary';
import type { ColumnDef } from '@tanstack/react-table';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { DataTable } from '../../ui/data-table/data-table';
import DealOverviewGraphCompact from './DealOverviewGraphCompact';

export interface DealOverviewProps {
  widgetId?: string;
}

interface DealOrderRow {
  id: string;
  number: number;
  price: number;
  side: string;
  quantity: string;
  type: DCAOrderTypeEnum | string;
  priceDeviation: string;
  avgPrice: number | undefined;
  requiredPrice: number | undefined;
  requiredPricePercent: string;
  totalBase: number | undefined;
  totalQuote: number | undefined;
  note: string;
  /** Estimated liquidation price once this order has filled (futures only). */
  liquidationPrice: number | null;
  /** Distance from this order's trigger to that liquidation price, %. */
  liquidationBuffer: number | null;
  /** Filling this order pushes liquidation past the next order's trigger. */
  liquidationCascade: boolean;
}

// Hook for deal overview data - shared between standalone and subtab views.
// Pass `ordersOverride` to render from a caller-supplied order set (the
// read-only settings view projects the saved bot directly and bypasses the
// live `exampleOrdersStore`, which only the mounted form drives); omit it to
// read the shared store as usual.
export const useDealOverviewData = (
  ordersOverride?: DCAGrid[],
  liquidation?: LadderLiquidation | null
) => {
  const [storeOrders, setStoreOrders] = useState<DCAGrid[]>([]);

  useEffect(() => {
    const unsubscribe = exampleOrdersStore.subscribe((incomingOrders) => {
      setStoreOrders(incomingOrders);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const orders = ordersOverride ?? storeOrders;

  const liquidationByOrderId = useMemo(() => {
    const map = new Map<string, LadderLiquidation['steps'][number]>();
    liquidation?.steps.forEach((step) => map.set(step.orderId, step));
    return map;
  }, [liquidation]);

  // Transform DCAGrid orders to table rows
  const tableData = useMemo<DealOrderRow[]>(() => {
    return orders
      .filter((order) => !order.hide)
      .map((order, index) => {
        const requiredPricePercent =
          order.requiredPrice && order.price
            ? `${((order.requiredPrice / order.price - 1) * 100).toFixed(2)}%`
            : '';

        // Extract base and quote assets from pair (e.g., "BTC/USDT" -> base: BTC, quote: USDT)
        const [baseAsset = '', quoteAsset = ''] = order.pair.split('/');

        // Format quantity with both quote value and base value
        const quoteValue = order.qty * order.price;
        const quantity = `${quoteValue.toFixed(8)} ${quoteAsset} (${order.qty.toFixed(8)} ${baseAsset})`;

        const liqStep = liquidationByOrderId.get(order.id);

        return {
          id: order.id,
          number: index + 1,
          price: order.price,
          side: order.side,
          quantity,
          type: order.type || 'Smart order',
          priceDeviation: order.priceDeviation || '',
          avgPrice: order.avgPrice,
          requiredPrice: order.requiredPrice,
          requiredPricePercent,
          totalBase: order.base,
          totalQuote: order.quote,
          note: order.note || '',
          liquidationPrice: liqStep?.liquidationPrice ?? null,
          liquidationBuffer: liqStep?.bufferPercent ?? null,
          liquidationCascade: liqStep?.cascade ?? false,
        };
      });
  }, [orders, liquidationByOrderId]);

  // Transform data for the graph component
  const graphData = useMemo(() => {
    return orders
      .filter((order) => !order.hide)
      .map((order, index) => {
        const quoteValue = order.qty * order.price;
        const requiredPricePercent =
          order.requiredPrice && order.price
            ? ((order.requiredPrice / order.price - 1) * 100).toFixed(2)
            : '0';

        return {
          number: index + 1,
          price: order.price,
          side: order.side,
          quantity: quoteValue,
          type: order.type || 'Smart order',
          priceDeviation: order.priceDeviation,
          avgPrice: order.avgPrice,
          requiredPrice: order.requiredPrice,
          requiredPricePercent,
          totalBase: order.base,
          totalQuote: order.quote,
        };
      });
  }, [orders]);

  const summary = useMemo(() => computeDealSummary(orders), [orders]);

  return { orders, tableData, graphData, summary };
};

// Standalone Graph component for subtab use
export interface DealOverviewGraphTabProps {
  className?: string;
  /** Forwarded to the compact graph so it can expand to a larger min-height */
  full?: boolean;
  /** When false, hides TP overlay lines/labels in the compact graph */
  showTpLines?: boolean;
  /** When true, shows indicator mode notice and min % separation labels */
  indicatorMode?: boolean;
  /** Fallback TP % when orders have no requiredPricePercent */
  fallbackTpPercent?: number;
  /** Render from these orders instead of the shared store (read-only view). */
  orders?: DCAGrid[];
  /** Estimated liquidation projection; draws the liq line when supplied. */
  liquidation?: LadderLiquidation | null;
}

export const DealOverviewGraphTab: React.FC<DealOverviewGraphTabProps> = ({
  className,
  full = false,
  showTpLines = true,
  indicatorMode = false,
  fallbackTpPercent,
  orders,
  liquidation,
}) => {
  const { graphData } = useDealOverviewData(orders, liquidation);

  return (
    <div className={className}>
      <DealOverviewGraphCompact
        orders={graphData}
        full={full}
        showTpLines={showTpLines}
        indicatorMode={indicatorMode}
        fallbackTpPercent={fallbackTpPercent}
        liquidation={liquidation}
      />
    </div>
  );
};

// Standalone Table component for subtab use
export interface DealOverviewTableTabProps {
  widgetId?: string;
  className?: string;
  /** Render from these orders instead of the shared store (read-only view). */
  orders?: DCAGrid[];
  /** Estimated liquidation projection; adds the liq columns when supplied. */
  liquidation?: LadderLiquidation | null;
}

export const DealOverviewTableTab: React.FC<DealOverviewTableTabProps> = ({
  widgetId = 'deal-overview-table',
  className,
  orders,
  liquidation,
}) => {
  const { tableData } = useDealOverviewData(orders, liquidation);
  const showLiquidation = Boolean(liquidation);

  const columns = useMemo<ColumnDef<DealOrderRow>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'Number',
        size: 80,
        cell: ({ row }) => (
          <div className="font-medium">{row.original.number}</div>
        ),
      },
      {
        accessorKey: 'price',
        header: 'Price',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.price.toFixed(8)}</div>
        ),
      },
      {
        accessorKey: 'side',
        header: 'Side',
        size: 80,
        cell: ({ row }) => {
          const isBuy = row.original.side === 'BUY';
          return (
            <Badge
              variant={isBuy ? 'success' : 'destructive'}
              className="font-semibold"
            >
              {row.original.side}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        size: 200,
        cell: ({ row }) => (
          <div className="font-mono text-xs">{row.original.quantity}</div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        size: 120,
        cell: ({ row }) => <div>{row.original.type}</div>,
      },
      {
        accessorKey: 'priceDeviation',
        header: 'Price deviation',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.priceDeviation}</div>
        ),
      },
      {
        accessorKey: 'avgPrice',
        header: 'Average price',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.avgPrice?.toFixed(8) || ''}
          </div>
        ),
      },
      ...(showLiquidation
        ? ([
            {
              accessorKey: 'liquidationPrice',
              header: 'Est. liquidation price',
              size: 170,
              cell: ({ row }) => {
                const value = row.original.liquidationPrice;
                if (value == null) return <div className="font-mono">—</div>;
                return (
                  <div
                    className={`font-mono ${
                      row.original.liquidationCascade
                        ? 'font-semibold text-loss'
                        : 'text-loss/90'
                    }`}
                    title={
                      row.original.liquidationCascade
                        ? 'Filling this order pushes liquidation past the next safety order — cascade risk'
                        : undefined
                    }
                  >
                    {formatLiquidationPrice(value)}
                    {row.original.liquidationCascade ? ' ⚠' : ''}
                  </div>
                );
              },
            },
            {
              accessorKey: 'liquidationBuffer',
              header: 'Distance to liquidation',
              size: 170,
              cell: ({ row }) => {
                const value = row.original.liquidationBuffer;
                if (value == null) return <div className="font-mono">—</div>;
                return (
                  <div
                    className={`font-mono ${
                      value < 8
                        ? 'text-loss'
                        : value < 20
                          ? 'text-yellow-500'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {value.toFixed(2)}%
                  </div>
                );
              },
            },
          ] as ColumnDef<DealOrderRow>[])
        : []),
      {
        accessorKey: 'requiredPrice',
        header: 'Required price to close deal',
        size: 180,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.requiredPrice?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'requiredPricePercent',
        header: 'Required price to close deal in %',
        size: 200,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.requiredPricePercent}</div>
        ),
      },
      {
        accessorKey: 'totalBase',
        header: 'Total base',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.totalBase?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'totalQuote',
        header: 'Total quote',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.totalQuote?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'note',
        header: 'Note',
        size: 150,
        cell: ({ row }) => <div>{row.original.note}</div>,
      },
    ],
    [showLiquidation]
  );

  return (
    <div className={className}>
      <DataTable
        columns={columns}
        data={tableData}
        tableId={widgetId}
        enableGlobalFilter={false}
        enableColumnFilters={false}
        enableSorting={false}
        enableColumnVisibility={false}
        showPagination={false}
        className="h-full"
      />
    </div>
  );
};

// Original DealOverview component with tabs
const DealOverview: React.FC<DealOverviewProps> = ({
  widgetId = 'deal-overview',
}) => {
  const { graphData, tableData } = useDealOverviewData();

  const columns = useMemo<ColumnDef<DealOrderRow>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'Number',
        size: 80,
        cell: ({ row }) => (
          <div className="font-medium">{row.original.number}</div>
        ),
      },
      {
        accessorKey: 'price',
        header: 'Price',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.price.toFixed(8)}</div>
        ),
      },
      {
        accessorKey: 'side',
        header: 'Side',
        size: 80,
        cell: ({ row }) => {
          const isBuy = row.original.side === 'BUY';
          return (
            <Badge
              variant={isBuy ? 'success' : 'destructive'}
              className="font-semibold"
            >
              {row.original.side}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        size: 200,
        cell: ({ row }) => (
          <div className="font-mono text-xs">{row.original.quantity}</div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        size: 120,
        cell: ({ row }) => <div>{row.original.type}</div>,
      },
      {
        accessorKey: 'priceDeviation',
        header: 'Price deviation',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.priceDeviation}</div>
        ),
      },
      {
        accessorKey: 'avgPrice',
        header: 'Average price',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.avgPrice?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'requiredPrice',
        header: 'Required price to close deal',
        size: 180,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.requiredPrice?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'requiredPricePercent',
        header: 'Required price to close deal in %',
        size: 200,
        cell: ({ row }) => (
          <div className="font-mono">{row.original.requiredPricePercent}</div>
        ),
      },
      {
        accessorKey: 'totalBase',
        header: 'Total base',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.totalBase?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'totalQuote',
        header: 'Total quote',
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono">
            {row.original.totalQuote?.toFixed(8) || ''}
          </div>
        ),
      },
      {
        accessorKey: 'note',
        header: 'Note',
        size: 150,
        cell: ({ row }) => <div>{row.original.note}</div>,
      },
    ],
    []
  );

  return (
    <Card className="h-full flex flex-col gap-0">
      <CardHeader className="shrink-0">
        <CardTitle className="text-base font-semibold">Deal Overview</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs defaultValue="graph" className="h-full">
          <TabsList className="px-4">
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <div className="p-sm h-full">
            <TabsContent value="graph" className="h-full">
              <div className="h-full">
                {/* Use the compact graph directly in this overview instance */}
                <DealOverviewGraphCompact orders={graphData} />
              </div>
            </TabsContent>
            <TabsContent value="table" className="h-full">
              <div className="h-full">
                <DataTable
                  columns={columns}
                  data={tableData}
                  tableId={widgetId}
                  enableGlobalFilter={false}
                  enableColumnFilters={false}
                  enableSorting={false}
                  enableColumnVisibility={false}
                  showPagination={false}
                  className="h-full"
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DealOverview;
