import { useMemo } from 'react';
import { useDealStore, type DealType } from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';
import { ACTIVE_ONLY_DEFAULT_STATUSES } from '../lib/utils/dealStatusFilter';
import { isTerminalDeal } from './useDcaDeals';

/** Filled / total DCA orders, summed over a bot's currently open deals. */
export interface BotDcaOrderFill {
  complete: number;
  all: number;
}

/**
 * A bot's DCA ladder position: filled / total orders across its open deals.
 *
 * The bots list has no order data of its own — `dcaBotList` returns money usage
 * (`usage.current/max`) and deal counts (`dealsInBot`), never the ladder. The
 * ladder lives on the deal (`deal.levels.complete / .all`), which is what the
 * deal card and the deals table already print under their Usage rings. So the
 * bot-level figure is derived here from the open deals the bots pages have
 * already loaded into `useDealStore` for their Deals tab — no extra request.
 *
 * Returns `undefined` when the bot has no open deal: there is no ladder to
 * report, and `0/0` under the ring reads as "nothing configured" rather than
 * "nothing running".
 *
 * Subscribes to just this bot's slice of the store, so a page of cards does not
 * rebuild a whole-account map once per card.
 */
export function useBotDcaOrderFill(
  botId: string | undefined,
  dealType: DealType = 'dca'
): BotDcaOrderFill | undefined {
  const dealsForBot = useDealStore((state) =>
    botId ? state.deals[botId] : undefined
  );
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);

  const paperContext = tradingMode === 'demo' ? true : !isLiveTrading;

  return useMemo(() => {
    if (!dealsForBot) return undefined;

    let complete = 0;
    let all = 0;

    for (const deal of Object.values(dealsForBot)) {
      if (deal.dealType !== dealType) continue;
      // Terminal deals are hand-placed trades riding on a hidden bot; they are
      // not part of any listed bot's ladder.
      if (isTerminalDeal(deal)) continue;
      if (deal.paperContext !== paperContext) continue;
      if (!ACTIVE_ONLY_DEFAULT_STATUSES.includes(deal.status)) continue;

      complete += deal.levels?.complete ?? 0;
      all += deal.levels?.all ?? 0;
    }

    return all > 0 ? { complete, all } : undefined;
  }, [dealsForBot, dealType, paperContext]);
}
