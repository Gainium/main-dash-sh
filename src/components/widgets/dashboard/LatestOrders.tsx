import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import type { BotTypesEnum } from '@/types';
import { type ColumnDef } from '@tanstack/react-table';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BotTypeChip, BuySellChip } from '../../../components/ui/chip';
import {
  WidgetWrapper,
  type WidgetMenuActions,
} from '../../../components/widgets/WidgetWrapper';
import { DataTable } from '../../ui/data-table/data-table';
import CoinPair from '../shared/CoinPair';
import { getWidgetMetadata } from './index';

// Interface for real GraphQL order data
export interface RealOrderData {
  clientOrderId: string;
  origQty: string;
  price: string;
  side: 'BUY' | 'SELL';
  updateTime: number;
  baseAsset: string;
  quoteAsset: string;
  botName: string;
  botId: string;
  typeOrder: string;
  botType: string;
  terminal: boolean;
}

export interface LatestOrdersProps {
  widgetId: string;
  showPagination?: boolean;
  isEditable?: boolean;
  isCollapsible?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

// Interface for GraphQL response data structure
interface GetLatestOrdersData {
  result: RealOrderData[];
}

const LatestOrders: React.FC<LatestOrdersProps> = ({
  widgetId,
  showPagination = true, // Enable pagination by default
  isEditable,
  isCollapsible = true,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const [page, _setPage] = useState(0); // Use 0-based pagination like main-dash
  const {
    data: ordersResponse,
    isLoading,
    error,
  } = useGraphQL<GetLatestOrdersData>(
    'getLatestOrders',
    GraphQlQuery.getLatestOrders({ page })
  );

  // Track start time to measure query latency for debugging
  const startTimeRef = React.useRef<number | null>(null);

  // If auth is still initializing, prefer showing loading skeleton instead of 'No orders'
  const authInitializing = useAuthStore((s) => s.isLoading);

  React.useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();
    }
  }, [isLoading]);

  // When response arrives, log latency and warn if slow
  React.useEffect(() => {
    if (!isLoading && startTimeRef.current) {
      const duration = Date.now() - startTimeRef.current;
      logger.debug('LatestOrders - Query latency (ms):', duration);
      if (duration > 1000) {
        logger.warn('LatestOrders - Slow query detected', { duration });
      }
      startTimeRef.current = null;
    }
  }, [isLoading, ordersResponse]);

  // Extract orders from GraphQL response
  const orders: RealOrderData[] = useMemo(() => {
    logger.debug('LatestOrders - Full GraphQL response:', ordersResponse);

    // Handle error cases (no response or error status)
    if (!ordersResponse || ordersResponse.status === 'NOTOK') {
      logger.debug(
        'LatestOrders - Error or no response:',
        ordersResponse?.reason || 'No response'
      );
      return [];
    }

    if (ordersResponse?.status === 'OK' && ordersResponse.data?.result) {
      logger.debug('LatestOrders - Orders data:', {
        totalOrders: ordersResponse.data.result.length,
        firstFewOrders: ordersResponse.data.result.slice(0, 3),
        allOrdersIds: ordersResponse.data.result.map((o) => o.clientOrderId),
      });
      return ordersResponse.data.result;
    }

    logger.debug('LatestOrders - No orders data found');
    return [];
  }, [ordersResponse]);

  // Memoize columns to prevent infinite renders
  const columns = useMemo<ColumnDef<RealOrderData>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: 'SYMBOL',
        cell: ({ row }) => {
          const { baseAsset, quoteAsset } = row.original;
          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              iconSize="sm"
              showText={true}
              textVariant="symbol"
              layout="horizontal"
              className="justify-start"
            />
          );
        },
        enableSorting: true,
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'side',
        header: 'SIDE',
        cell: ({ getValue }) => {
          const side = getValue() as 'BUY' | 'SELL';
          return <BuySellChip side={side} size="sm" showIcon={true} />;
        },
        enableSorting: true,
        filterFn: 'equals',
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'origQty',
        header: 'AMOUNT',
        cell: ({ row }) => {
          const { origQty, baseAsset, price } = row.original;
          const amount = parseFloat(origQty);
          const priceValue = parseFloat(price);
          const formattedAmount =
            amount < 1 ? amount.toFixed(6) : amount.toFixed(2);

          return (
            <div className="text-right">
              <div className="text-sm text-card-foreground">
                {formattedAmount} {baseAsset}
              </div>
              <div className="text-xs text-muted-foreground">
                ${(amount * priceValue).toFixed(2)}
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'price',
        header: 'PRICE',
        cell: ({ getValue, row }) => {
          const price = parseFloat(getValue() as string);
          const { quoteAsset } = row.original;
          const formattedPrice =
            price > 1000 ? price.toLocaleString() : price.toFixed(3);

          return (
            <div className="text-right text-sm text-card-foreground">
              {formattedPrice} {quoteAsset}
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'updateTime',
        header: 'TIME',
        cell: ({ getValue }) => {
          const timestamp = getValue() as number;
          const date = new Date(timestamp);
          const dateString = date.toLocaleDateString();
          const timeString = date.toLocaleTimeString();
          return (
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              <div>{dateString}</div>
              <div>{timeString}</div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'datetime',
        meta: { filterType: 'date' },
      },
      {
        accessorKey: 'botName',
        header: 'BOT',
        cell: ({ row }) => {
          const { botName, botId, botType } = row.original;
          const isCombo = botType?.toLowerCase().includes('combo');
          const isGrid = botType?.toLowerCase().includes('grid');
          let botUrl = `/bot/view/${botId}`;
          if (isCombo) {
            botUrl = `/combo/view/${botId}`;
          } else if (isGrid) {
            botUrl = `/grid/view/${botId}`;
          }

          return (
            <Link
              to={botUrl}
              className="text-sm text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              {botName}
            </Link>
          );
        },
        enableSorting: true,
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'botType',
        header: 'BOT TYPE',
        cell: ({ getValue }) => {
          const botType = getValue() as BotTypesEnum;
          return <BotTypeChip botType={botType} size="sm" chipStyle="soft" />;
        },
        enableSorting: true,
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
    ],
    []
  );

  // Use all orders - pagination will handle the display
  const data = useMemo(() => orders, [orders]);

  const loadingContent = (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="space-y-xs animate-pulse">
          <div className="h-6 w-40 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="flex gap-xs animate-pulse">
          <div className="h-8 w-20 bg-muted rounded" />
          <div className="h-8 w-16 bg-muted rounded" />
        </div>
      </div>

      <div className="flex-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`latest-orders-skel-${index}`}
            className="flex items-center justify-between py-3 border-b animate-pulse"
          >
            <div className="h-4 w-36 bg-muted rounded" />
            <div className="h-4 w-12 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  const content = (
    <div className="w-full h-full flex flex-col">
      {isLoading || authInitializing ? (
        loadingContent
      ) : (
        <DataTable
          tableId={`latest-orders-${widgetId}`}
          columns={columns}
          data={data}
          enableGlobalFilter={true}
          enableColumnFilters={true}
          enableSorting={true}
          enableColumnReordering={true}
          enableColumnVisibility={true}
          showPagination={showPagination}
          className="flex-1"
          emptyMessage={error ? 'Error loading orders.' : 'No orders found.'}
          initialPageSize={50}
        />
      )}
    </div>
  );

  const metadata = useMemo(
    () => ({
      ...getWidgetMetadata('latest-orders'),
      id: widgetId,
    }),
    [widgetId]
  );

  const cacheQueries = useMemo(
    () => [
      {
        queryKey: 'getLatestOrders',
        variables: { page } as Record<string, unknown>,
      },
    ],
    [page]
  );

  // Plain literal (not a memo): every value here is already reference-stable —
  // `metadata`/`cacheQueries` are memoized above, the callbacks come from props,
  // and `menuActions` is passed through directly (the wrapper only reads it).
  // `WidgetWrapper` is `React.memo`'d and receives these spread as individual
  // props, so a container memo bought nothing over per-key stability while
  // adding a hand-maintained dep-array to keep in sync.
  const wrapperProps = {
    metadata,
    isEditable: isEditable ?? false,
    isCollapsible,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
    cacheQueries,
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default React.memo(LatestOrders);

