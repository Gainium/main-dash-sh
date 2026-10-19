import React from 'react';
import getLatestPrices from '@/helper/price';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useDealStore,
} from '@/stores/live';
import {
  DCAOrderTypeEnum,
  type BotVars,
  type DCABotSettings,
  type DCADeals,
} from '@/types';
import { dcaLadderLevels } from './executeNextDcaEligibility';
import { addedDcaLevels, type AddedDcaLevel } from './changeDcaLevelsLadder';

export interface ChangeDcaLevelsPreviewDeal {
  botId: string;
  dealId: string;
  kind: 'dca' | 'combo';
  long: boolean;
  symbol: string;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
}

/**
 * Where the levels added by "Change DCA levels" will land, and which of them
 * fill at once because price is already past them. Reads the same live stores
 * and client-side ladder the deal drawer projects from; returns nothing until
 * those are loaded.
 */
export function useAddedDcaLevels(
  deal: ChangeDcaLevelsPreviewDeal | undefined,
  open: boolean,
  currentMax: number,
  newMax: number
): { levels: AddedDcaLevel[]; market: number | undefined } {
  const enabled = open && !!deal;
  const isCombo = deal?.kind === 'combo';
  const rawDeal = useDealStore((s) =>
    enabled && deal ? (s.deals[deal.botId]?.[deal.dealId] ?? null) : null
  ) as DCADeals | null;
  const dcaBot = useDcaBotsStore((s) =>
    enabled && deal && !isCombo ? s.bots[deal.botId] : undefined
  );
  const comboBot = useComboBotsStore((s) =>
    enabled && deal && isCombo ? s.bots[deal.botId] : undefined
  );
  const bot = (dcaBot ?? comboBot) as
    | { settings?: DCABotSettings; exchangeUUID?: string; vars?: BotVars | null }
    | undefined;

  // Build the ladder as far as the larger of the two maxes; the projection
  // keys its compute on ordersCount, so it re-runs as the value changes.
  const ladderMax = Math.max(currentMax, newMax);
  const projectedDeal = React.useMemo(
    () =>
      rawDeal
        ? {
            ...rawDeal,
            settings: { ...rawDeal.settings, ordersCount: `${ladderMax}` },
          }
        : null,
    [rawDeal, ladderMax]
  );

  const { fullLadder } = useDealSmartOrders({
    bot: bot
      ? {
          settings: bot.settings,
          exchangeUUID: bot.exchangeUUID ?? rawDeal?.exchangeUUID,
          vars: bot.vars,
        }
      : null,
    deal: projectedDeal,
    pendingOrders: [],
    completedOrders: [],
    isCombo,
    enabled: enabled && newMax > currentMax,
    computeRegardlessOfSmartOrders: true,
  });

  const [market, setMarket] = React.useState<number | undefined>(undefined);
  const symbol = rawDeal?.symbol?.symbol ?? deal?.symbol;
  React.useEffect(() => {
    if (!enabled || !symbol) {
      return;
    }
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK') {
        const match = result.data.find((p) => p.symbol === symbol);
        if (match && match.price > 0) {
          setMarket(match.price);
        }
      }
    }, false);
    return () => {
      unsubscribe();
    };
  }, [enabled, symbol]);

  const levels = React.useMemo(
    () =>
      addedDcaLevels(
        dcaLadderLevels(fullLadder, DCAOrderTypeEnum.dca),
        currentMax,
        newMax,
        deal?.long ?? true,
        market
      ),
    [fullLadder, currentMax, newMax, deal?.long, market]
  );

  return { levels, market };
}
