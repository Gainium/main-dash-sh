import { useMemo } from 'react';
import { useDealOverviewData } from '@/components/widgets/trading/DealOverview';
import { BotMarginTypeEnum, StrategyEnum, TerminalDealTypeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { DcaTradingContext } from './useDcaTradingContext';

/**
 * Client-side balance gate for the trading-terminal "place order" / import
 * submit. Ported 1:1 from legacy main-dash `terminal/index.tsx` `verifyBalance`
 * (lines 4164-4205): the backend won't open the deal without the funds, so we
 * block up front rather than fire a `createDCABot` that returns OK and then
 * fails asynchronously in the bot engine — which is what surfaced as a false
 * "Deal succesfully imported" toast followed by a "Not enough balance" alert.
 *
 * Returns `true` when there's enough balance OR the check can't be made yet
 * (no sized order / balances not loaded) — we never block on missing data.
 * Returns `false` only when the funds are confidently short. Honors
 * `skipBalanceCheck` exactly like legacy `addNewBot` (line 4219).
 *
 * The order capital comes from the same example-orders deal summary the footer
 * "Capital required" chip reads, so the gate and the chip agree by construction.
 */
export const useVerifyTerminalBalance = (
  formData: BotFormData,
  tradingContext: DcaTradingContext
): boolean => {
  const { summary } = useDealOverviewData();
  const dca = formData.dca;
  const aggregated = tradingContext.aggregatedBalances;
  const fee = tradingContext.fee ?? 0;

  return useMemo(() => {
    // Legacy addNewBot: when skipBalanceCheck is set, the whole verify is
    // bypassed.
    if (dca?.skipBalanceCheck) return true;

    const freeBase = aggregated?.base?.free ?? 0;
    const freeQuote = aggregated?.quote?.free ?? 0;

    // Per-deal order capital from the example orders (BO + DCA): quote-side
    // notional and base-side quantity, before leverage.
    let base = Number(summary?.totalCapitalBase) || 0;
    let quote = Number(summary?.totalCapital) || 0;

    // No sized order yet → can't judge; don't block.
    if (base <= 0 && quote <= 0) return true;

    const futures = !!dca?.futures;
    const coinm = !!dca?.coinm;
    const isLong = dca?.strategy === StrategyEnum.long;
    const isImport = dca?.terminalDealType === TerminalDealTypeEnum.import;

    // Import adopts a position you already hold — the backend funds the deal
    // from that position (a synthetic fill, no real order), so a futures import
    // requires no free margin. Legacy's `verifyBalance` reaches its futures
    // branch before the import check and wrongly blocks a fully-margined
    // position at zero free balance; we intentionally don't replicate that
    // false block. (Spot imports keep the held-asset check below — it passes
    // for a real holding and only catches importing something you don't own.)
    if (futures) {
      if (isImport) return true;
      // Compare margin (notional / leverage). Inherited margin keeps the raw
      // notional. COIN-M is base-margined, USDⓈ-M is quote-margined.
      const denom =
        dca?.marginType !== BotMarginTypeEnum.inherit
          ? Number(dca?.leverage) || 1
          : 1;
      base /= denom;
      quote /= denom;
      return coinm ? freeBase >= base : freeQuote >= quote;
    }

    // Spot import: you already hold the position, so verify the held side —
    // base for a long (the coins you bought), quote for a short (the proceeds
    // you're sitting on). The fee was already paid on entry, hence `1 - fee`.
    if (isImport) {
      return isLong
        ? base * (1 - fee) <= freeBase
        : quote * (1 - fee) <= freeQuote;
    }

    // Spot, normal: a long spends quote to buy base; a short delivers base.
    if (isLong) return freeQuote >= quote;
    return freeBase >= base;
  }, [summary, aggregated, fee, dca]);
};
