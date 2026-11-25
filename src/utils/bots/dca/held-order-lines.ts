import {
  BotOrderSideEnum,
  type DCAGrid,
  type DCAOrderTypeEnum,
  type DealHeldOrder,
  type StrategyEnum,
} from '@/types';
import type { ViewOrder } from '@/types/bots';

/**
 * Turns a deal's held orders (refused by the exchange this far from the price,
 * placed by the bot once the price is near) into grey lines at the price they
 * will rest. A level that already has a resting order is not drawn twice.
 */
export const heldOrdersToChartLines = (
  held: DealHeldOrder[] | null | undefined,
  pendingOrders: ViewOrder[],
  strategy: StrategyEnum,
  pair: string,
  labelFor: (typeOrder: string) => string
): DCAGrid[] => {
  if (!held?.length) return [];
  const key = (side: string, price: string | number) =>
    `${side}`.toLowerCase() + '|' + +price;
  const resting = new Set(pendingOrders.map((o) => key(o.side, o.price)));
  return held
    .filter((h) => !resting.has(key(h.side, h.price)))
    .map((h) => {
      const label = labelFor(h.typeOrder ?? 'regular');
      return {
        qty: +h.qty,
        price: +h.price,
        side:
          `${h.side}`.toLowerCase() === 'buy'
            ? BotOrderSideEnum.buy
            : BotOrderSideEnum.sell,
        id: `held-${h.side}-${h.price}-${h.minigridId ?? h.dcaLevel ?? ''}`,
        type: (h.typeOrder ?? undefined) as DCAOrderTypeEnum | undefined,
        pair,
        strategy,
        label,
        grey: true,
        greyLabel: label,
      };
    });
};
