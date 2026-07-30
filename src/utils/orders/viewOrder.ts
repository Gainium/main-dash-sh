import { formatOrderForDisplay } from '@/hooks/useBotOrders';
import type { OrderData } from '@/types';
import type { ViewOrder } from '@/types/bots';
import { getOrderTypeLabel } from '@/utils/mapOrderName';

/**
 * Maps a raw `OrderData` (GraphQL / socket shape) to the `ViewOrder` shape the
 * order tables and the deal-projection hooks consume.
 *
 * Mirrors `BotDetailsDrawer.transformOrders`; shared so the deal drawer and the
 * bot page derive their orders identically instead of keeping two copies that
 * can drift.
 */
export const orderDataToViewOrder = (
  order: OrderData,
  fallbackExchange?: string
): ViewOrder => {
  const formatted = formatOrderForDisplay(order);
  const executedQty = parseFloat(order.executedQty || '0');
  const origQty = parseFloat(order.origQty || '0');
  const executedPrice =
    executedQty > 0
      ? formatted.price * (executedQty / origQty)
      : formatted.price;
  const orderTypeLabel = getOrderTypeLabel(
    order.typeOrder || 'regular',
    order.sl || false,
    order.clientOrderId,
    order.reduceFundsId,
    true
  );

  return {
    id: formatted.id,
    dealId: formatted.dealId,
    type: formatted.side,
    status: formatted.status,
    symbol: formatted.symbol,
    baseAsset: formatted.baseAsset,
    quoteAsset: formatted.quoteAsset,
    amount: formatted.quantity,
    price: formatted.price,
    filled: formatted.executedQuantity,
    remaining: formatted.quantity - formatted.executedQuantity,
    total: formatted.price * formatted.quantity,
    createTime: new Date(formatted.time).toISOString(),
    ...(formatted.updateTime && {
      updateTime: new Date(formatted.updateTime).toISOString(),
    }),
    side: formatted.side,
    exchange: formatted.exchange || fallbackExchange || 'Unknown',
    executedQuantity: formatted.executedQuantity,
    executedPrice,
    orderType: orderTypeLabel,
    origQty: order.origQty,
    typeOrder: order.typeOrder,
    sl: order.sl,
    clientOrderId: order.clientOrderId,
    reduceFundsId: order.reduceFundsId,
    time: order.updateTime,
    executedQty: order.executedQty,
  };
};

/**
 * Splits a deal's raw orders into the still-resting set and the terminal set
 * (filled / cancelled) — the two buckets `useDealSmartOrders` needs.
 */
export const splitDealOrders = (
  orders: OrderData[] | undefined,
  fallbackExchange?: string
): { pendingOrders: ViewOrder[]; completedOrders: ViewOrder[] } => {
  const pendingOrders: ViewOrder[] = [];
  const completedOrders: ViewOrder[] = [];
  for (const order of orders ?? []) {
    const view = orderDataToViewOrder(order, fallbackExchange);
    const status = String(order.status || '').toUpperCase();
    if (status === 'FILLED' || status === 'CANCELED' || status === 'CANCELLED') {
      completedOrders.push(view);
    } else {
      pendingOrders.push(view);
    }
  }
  return { pendingOrders, completedOrders };
};
