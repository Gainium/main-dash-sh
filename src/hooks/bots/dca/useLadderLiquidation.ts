/**
 * Estimated liquidation projection for the bot form's DCA / combo ladder.
 *
 * Subscribes to the active example-orders store (the same ladder the overview
 * graph, table and TradingView chart draw) and combines it with the form's
 * futures settings. Returns `null` for spot bots, leverage <= 1, or before the
 * ladder has been computed — every consumer renders nothing in that case.
 *
 * See `@/utils/bots/dca/liquidation` for the model and its caveats.
 */

import { useExampleOrdersStore } from '@/contexts/bots/form/formStoreContexts';
import { BotMarginTypeEnum, type DCAGrid } from '@/types';
import {
  computeLadderLiquidation,
  strategyToLiquidationSide,
  type LadderLiquidation,
} from '@/utils/bots/dca/liquidation';
import { useEffect, useMemo, useState } from 'react';

export interface LadderLiquidationSettings {
  futures?: boolean | unknown;
  leverage?: number;
  strategy?: string;
  marginType?: BotMarginTypeEnum | string;
}

export interface UseLadderLiquidationResult {
  liquidation: LadderLiquidation | null;
  /** Cross margin adds free wallet balance we cannot see — flag it. */
  isCross: boolean;
}

export const useLadderLiquidation = (
  settings: LadderLiquidationSettings | null | undefined,
  /** Render from these orders instead of the live store (read-only views). */
  ordersOverride?: DCAGrid[]
): UseLadderLiquidationResult => {
  const store = useExampleOrdersStore();
  const [storeOrders, setStoreOrders] = useState<DCAGrid[]>([]);

  useEffect(() => {
    if (ordersOverride) return;
    return store.subscribe((incoming) => setStoreOrders(incoming));
  }, [store, ordersOverride]);

  const orders = ordersOverride ?? storeOrders;

  const leverage = Number(settings?.leverage ?? 0);
  const futures = Boolean(settings?.futures);
  const strategy = settings?.strategy;
  const isCross = settings?.marginType === BotMarginTypeEnum.cross;

  const liquidation = useMemo(() => {
    if (!futures || leverage <= 1 || orders.length === 0) return null;
    return computeLadderLiquidation(orders, {
      side: strategyToLiquidationSide(strategy),
      leverage,
    });
  }, [orders, futures, leverage, strategy]);

  return { liquidation, isCross };
};

export default useLadderLiquidation;
