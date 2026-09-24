import { useMemo } from "react";
import { useDealOverviewData } from "@/components/widgets/trading/DealOverview";
import { useGraphQL } from "@/hooks/useGraphQL";
import { botQueries } from "@/lib/api/GraphQLQueries-bot-queries";
import { BotMarginTypeEnum, StrategyEnum, TerminalDealTypeEnum } from "@/types";
import type { BotFormData } from "@/types/bots/form";
import type { DcaTradingContext } from "./useDcaTradingContext";

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
 *
 * COIN-M on a pooled-collateral account (Bitget Unified in `multi_assets`
 * mode): every coin in the wallet margins the inverse contract, so a
 * USDT-funded account holds no base coin and still funds the order. When the
 * base-coin check comes up short we ask the connection for its pool (USD,
 * `null` when not pooled) and compare the order's USD notional against it.
 */
export const useVerifyTerminalBalance = (
  formData: BotFormData,
  tradingContext: DcaTradingContext,
): boolean => {
  const { summary } = useDealOverviewData();
  const dca = formData.dca;
  const aggregated = tradingContext.aggregatedBalances;
  const fee = tradingContext.fee ?? 0;

  const marginDenom =
    dca?.marginType !== BotMarginTypeEnum.inherit
      ? Number(dca?.leverage) || 1
      : 1;
  // Only a COIN-M order the base-coin balance cannot cover needs the pool.
  // Isolated orders ask too (the terminal defaults to isolated): the venue,
  // not this gate, decides whether it funds an isolated position from it.
  const askPool =
    !dca?.skipBalanceCheck &&
    !!dca?.futures &&
    !!dca?.coinm &&
    dca?.terminalDealType !== TerminalDealTypeEnum.import &&
    !!formData.exchangeUUID &&
    (aggregated?.base?.free ?? 0) <
      (Number(summary?.totalCapitalBase) || 0) / marginDenom;
  const poolQuery = useGraphQL<number | null>(
    "getPooledMarginAvailable",
    botQueries.getPooledMarginAvailable({ uuid: formData.exchangeUUID ?? "" }),
    { enabled: askPool, staleTime: 15 * 1000 },
  );
  const pooledUsd =
    askPool &&
    poolQuery.data?.status === "OK" &&
    typeof poolQuery.data.data === "number"
      ? poolQuery.data.data
      : null;
  // Not answered yet: can't judge, so don't block (the engine still checks).
  const poolPending = askPool && poolQuery.isPending && !poolQuery.error;

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
      // notional. COIN-M is base-margined, USDⓈ-M is quote-margined — unless
      // the account pools its collateral, when the USD notional is what the
      // pool has to cover.
      base /= marginDenom;
      quote /= marginDenom;
      if (!coinm) return freeQuote >= quote;
      if (freeBase >= base || poolPending) return true;
      return pooledUsd !== null && pooledUsd >= quote;
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
  }, [summary, aggregated, fee, dca, marginDenom, pooledUsd, poolPending]);
};
