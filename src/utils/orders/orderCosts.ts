import type { OrderData } from '@/types';

const ORDER_COST_KEYS = [
  'refPrice',
  'slippageBps',
  'slippageQuote',
  'slippageSource',
  'feeQuote',
  'feeEstimated',
  'feeConverted',
] as const;

type OrderCostFields = Pick<OrderData, (typeof ORDER_COST_KEYS)[number]>;

const carriesCosts = (o: OrderData): boolean =>
  ORDER_COST_KEYS.some((k) => o[k] !== undefined);

/**
 * Fee and slippage arrive only with the order fetches (deal orders, bot
 * orders): socket order events replace the stored order without them. Keep them by clientOrderId and lay them back
 * over the store's copy when that copy has none. A backend without the fields
 * leaves every order untouched.
 */
export function withFetchedOrderCosts(
  orders: OrderData[],
  fetched: OrderData[] | null | undefined
): OrderData[] {
  if (!fetched?.length) return orders;
  const byId = new Map<string, OrderCostFields>();
  for (const o of fetched) {
    if (o.clientOrderId && carriesCosts(o)) {
      byId.set(o.clientOrderId, {
        refPrice: o.refPrice ?? null,
        slippageBps: o.slippageBps ?? null,
        slippageQuote: o.slippageQuote ?? null,
        slippageSource: o.slippageSource ?? null,
        feeQuote: o.feeQuote ?? null,
        feeEstimated: o.feeEstimated ?? null,
        feeConverted: o.feeConverted ?? null,
      });
    }
  }
  if (!byId.size) return orders;
  return orders.map((o) => {
    if (carriesCosts(o)) return o;
    const fields = byId.get(o.clientOrderId);
    return fields ? { ...o, ...fields } : o;
  });
}
