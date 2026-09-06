import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { type ColumnDef } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import { BuySellChip } from '../../../components/ui/chip';
import { useBotOrders, type BotOrder } from '../../../hooks/useBotOrders';
import { BotTypesEnum } from '../../../types';
import { DataTable } from '../../ui/data-table/data-table';
import CoinPair from '../shared/CoinPair';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import { getBotWidgetMetadata } from './index';

export interface EditOrdersProps {
  widgetId: string;
  botId?: string;
  botType?: BotTypesEnum;
  isEditable?: boolean;
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

const EditOrders: React.FC<EditOrdersProps> = ({
  widgetId,
  botId,
  botType,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const gridPageContext = useOptionalGridPageContext();
  const gridState = gridPageContext?.state;

  const resolvedBotId = botId ?? gridState?.botId ?? paramBotId;

  const resolvedBotType = React.useMemo(
    () => botType ?? gridState?.botType ?? BotTypesEnum.dca,
    [botType, gridState?.botType]
  );

  const isGridBot = resolvedBotType === BotTypesEnum.grid;

  const {
    orders: queryOrders,
    isLoading: queryIsLoading,
    error: queryError,
  } = useBotOrders(resolvedBotId || '', resolvedBotType, {});

  const contextOrders = gridState?.orders;
  const canUseContextOrders =
    isGridBot && contextOrders && gridState?.botId === resolvedBotId;

  const orders = React.useMemo(
    () =>
      (canUseContextOrders && contextOrders
        ? contextOrders.raw
        : queryOrders) ?? [],
    [canUseContextOrders, contextOrders, queryOrders]
  );

  const isLoading = React.useMemo(() => {
    if (canUseContextOrders && contextOrders) {
      return contextOrders.isLoading;
    }
    return queryIsLoading;
  }, [canUseContextOrders, contextOrders, queryIsLoading]);

  const error = React.useMemo(() => {
    if (canUseContextOrders && contextOrders?.error) {
      return new Error(contextOrders.error);
    }
    return queryError;
  }, [canUseContextOrders, contextOrders?.error, queryError]);

  // Handle loading and error states
  const hasError = !!error;
  const errorMessage = error?.message || 'Failed to load orders';

  // Memoize columns to prevent infinite renders
  const columns = React.useMemo<ColumnDef<BotOrder>[]>(
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
        cell: ({ getValue }) => {
          const price = parseFloat(getValue() as string);
          return (
            <div className="text-right text-sm">
              ${price.toFixed(price < 1 ? 6 : 2)}
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'executedQty',
        header: 'EXECUTED',
        cell: ({ row }) => {
          const { executedQty, origQty, baseAsset } = row.original;
          const executed = parseFloat(executedQty);
          const original = parseFloat(origQty);
          const percentage = original > 0 ? (executed / original) * 100 : 0;

          return (
            <div className="text-right">
              <div className="text-sm text-card-foreground">
                {executed.toFixed(executed < 1 ? 6 : 4)} {baseAsset}
              </div>
              <div className="text-xs text-muted-foreground">
                {percentage.toFixed(1)}%
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'number' },
      },
      {
        accessorKey: 'status',
        header: 'STATUS',
        cell: ({ getValue }) => {
          const status = getValue() as string;
          const statusColors = {
            NEW: 'bg-blue-500',
            PARTIALLY_FILLED: 'bg-yellow-500',
            FILLED: 'bg-green-500',
            CANCELED: 'bg-red-500',
            PENDING_CANCEL: 'bg-orange-500',
            REJECTED: 'bg-red-600',
            EXPIRED: 'bg-gray-500',
          };

          return (
            <div className="flex items-center gap-xs">
              <div
                className={`w-2 h-2 rounded-full ${statusColors[status as keyof typeof statusColors] || 'bg-gray-400'}`}
              />
              <span className="text-xs font-medium capitalize">
                {status.toLowerCase().replace('_', ' ')}
              </span>
            </div>
          );
        },
        enableSorting: true,
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'type',
        header: 'TYPE',
        cell: ({ getValue }) => {
          const type = getValue() as string;
          return (
            <span className="text-xs font-medium capitalize">
              {type.toLowerCase().replace('_', ' ')}
            </span>
          );
        },
        enableSorting: true,
        meta: { filterType: 'string' },
      },
      {
        accessorKey: 'time',
        header: 'TIME',
        cell: ({ getValue }) => {
          const timestamp = getValue() as number;
          const date = new Date(timestamp);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          let timeString;
          if (diffHours < 24) {
            timeString = date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
          } else {
            timeString = date.toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            });
          }

          return (
            <div className="text-right text-xs text-muted-foreground">
              {timeString}
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'date' },
      },
    ],
    []
  );

  // Memoize data to prevent unnecessary re-renders
  const data = React.useMemo(() => orders, [orders]);

  const content = (
    <div className="pt-6">
      <div className="w-full h-full flex flex-col">
        {/* Controls */}
        <div className="flex justify-between items-center border-b border-border">
          <div></div>
        </div>

        {/* Error state */}
        {hasError && (
          <div className="flex items-center justify-center py-8 text-center">
            <div className="text-red-500 text-sm">{errorMessage}</div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !hasError && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-50 animate-spin" />
              <p>Loading orders...</p>
            </div>
          </div>
        )}

        {/* Orders table */}
        {!isLoading && !hasError && (
          <div className="flex-1 mt-3">
            <DataTable
              tableId={`edit-orders-${widgetId}`}
              columns={columns}
              data={data}
              enableGlobalFilter={true}
              enableColumnFilters={true}
              enableSorting={true}
              enableColumnReordering={true}
              enableColumnVisibility={true}
              showPagination={true}
              className="flex-1"
              emptyMessage="No orders found for this bot."
              initialPageSize={20}
            />
          </div>
        )}
      </div>
    </div>
  );

  const wrapperProps = {
    metadata: {
      ...getBotWidgetMetadata('edit-orders'),
      id: widgetId,
    },
    isEditable: isEditable ?? false,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && {
      menuActions: {
        ...menuActions,
      },
    }),
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default EditOrders;
