import {
  BotOrderSideEnum,
  StrategyEnum,
  type DCAGrid,
  type DCAOrderTypeEnum,
  type TransactionChart,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import { getOrderTypeLabel } from '@/utils/mapOrderName';

/**
 * Turns a deal's still-resting orders into chart order lines.
 *
 * These are the REAL orders sitting on the exchange (base / DCA / TP / SL), so
 * they render solid; the projected not-yet-placed levels that
 * `useDealSmartOrders` returns carry `grey: true` and render grey next to them.
 */
export const dealPendingOrdersToChartLines = (
  pendingOrders: ViewOrder[],
  strategy: StrategyEnum
): DCAGrid[] =>
  pendingOrders.map((o) => ({
    qty: +o.origQty,
    price: +o.price,
    side: o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
    id: o.id,
    type: o.typeOrder as DCAOrderTypeEnum,
    pair: o.symbol,
    strategy,
    label: getOrderTypeLabel(
      o.typeOrder ?? 'regular',
      !!o.sl,
      o.clientOrderId,
      o.reduceFundsId,
      false
    ),
  }));

/**
 * Turns a deal's filled/cancelled orders into the chart's buy/sell markers.
 */
export const dealCompletedOrdersToTransactions = (
  completedOrders: ViewOrder[]
): TransactionChart[] =>
  completedOrders.map((o) => ({
    price: +o.price,
    side: o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
    id: o.id,
    time: o.time,
  }));
