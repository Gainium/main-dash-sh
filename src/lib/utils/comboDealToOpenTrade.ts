/**
 * Maps a single Combo deal record into the loose `OpenTrade`-shaped object the
 * `OpenOrdersWidget` consumes via its `data.trades` prop.
 *
 * Extracted verbatim from `ComboBots.tsx` (sibling of `dcaDealToOpenTrade`) so
 * the Combo Bots page and the hedge-combo Deals views feed the same widget the
 * same shape instead of drifting two near-identical copies.
 *
 * `botNameFallback` resolves the bot name when a closed combo deal comes back
 * without `botName` populated — the page passes a lookup into its loaded bots.
 */
import { tpSLConfig } from '@/utils/bots/dca/tpSlConfig';
import { computeCompoundBreakdown } from '@/lib/utils/compoundBreakdown';
import {
  calculateDealCost,
  calculateDealSize,
  calculateDealValue,
  dealWorkingMs,
  isLongStrategy,
} from '@/lib/utils/tradingMetrics';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import { formatDuration } from '@/utils/formatters';
import { extractPairAssets } from '@/utils/pairs';
import { ExchangeEnum } from '@/types';
import { percentBasisFromDeal } from '@/types/dcaDeal';
import type { ComboDeal } from '@/hooks/useComboDeals';

export function comboDealToOpenTrade(
  deal: ComboDeal,
  botNameFallback?: (botId: string) => string | undefined
) {
  const symbol = deal.symbol?.symbol || 'Unknown';
  // Not `symbol.replace(quoteAsset, '')`: that strips only the quote substring
  // and leaves the venue's separator behind, so a hyphen-native symbol became a
  // pair no one uses (`GAIB-USD` -> `GAIB-` -> `GAIB-/USD`). The API already
  // reports the base asset; `extractPairAssets` is the shared fallback the
  // Symbol cell itself renders through.
  const baseSymbol =
    deal.symbol?.baseAsset || extractPairAssets(symbol).baseAsset || symbol;
  const quoteSymbol = deal.symbol?.quoteAsset || 'USD';
  const pair = `${baseSymbol}/${quoteSymbol}`;
  // Usage lives on the QUOTE side for LONG spot / USD-M futures but on the
  // BASE side for SHORT spot / COIN-M. Reading only `usage.current.quote` gave
  // every SHORT spot combo deal a Cost of 0, so Notional (cost + profit) showed
  // just the deal's profit, and Size showed the wallet balance instead of the
  // position. Same short-aware helpers as `dcaDealToOpenTrade`.
  const futures =
    `${deal.settings?.futures}` !== 'null'
      ? deal.settings?.futures
      : isFuturesExchange(deal.exchange ?? ExchangeEnum.binance);
  const coinm =
    `${deal.settings?.coinm}` !== 'null'
      ? deal.settings?.coinm
      : isCoinmExchange(deal.exchange ?? ExchangeEnum.binance);
  const metricsInput = {
    strategy: deal.strategy,
    status: deal.status,
    avgPrice: deal.avgPrice,
    usage: {
      current: {
        base: deal.usage?.current?.base || 0,
        quote: deal.usage?.current?.quote || 0,
      },
    },
    currentBalances: deal.currentBalances,
    initialBalances: deal.initialBalances,
    futures,
    coinm,
    leverage: deal.settings?.leverage,
    marginType: deal.settings?.marginType,
  };
  const cost = calculateDealCost(metricsInput);
  const createdTime = deal.createTime ? new Date(deal.createTime) : new Date();
  // Closed/canceled deals stop at their close instead of counting on to now —
  // see `dealWorkingMs` (V1 parity, bug #567). Formatted through the shared
  // `formatDuration` so a sub-hour deal reports the minutes it ran instead of
  // flooring to "0H" — see the sibling `dcaDealToOpenTrade` for the detail.
  const workingTime = formatDuration(dealWorkingMs(deal));

  const hookUnrealized = (deal as { unrealizedUsd?: number }).unrealizedUsd;
  const unrealizedProfit =
    typeof hookUnrealized === 'number'
      ? hookUnrealized
      : (deal.stats?.unrealizedProfit ?? 0);

  return {
    baseAsset: deal.symbol?.baseAsset || '',
    quoteAsset: quoteSymbol,
    active: ['open', 'start', 'error'].includes(
      String(deal.status).toLowerCase()
    ),
    id: deal._id || deal.botId,
    type: 'Combo' as const,
    symbol,
    strategy: deal.strategy || 'COMBO',
    status: deal.status || 'Unknown',
    exchange: deal.exchange || 'Unknown',
    exchangeUUID: deal.exchangeUUID,
    botId: deal.botId,
    // Fall back to the loaded bot's name when the deal record itself
    // doesn't carry one (some closed combo deals come back without
    // botName populated), so the column doesn't render a bare "—".
    botName: deal.botName || botNameFallback?.(deal.botId) || undefined,
    currentBalance: {
      base: deal.currentBalances?.base || 0,
      quote: deal.currentBalances?.quote || 0,
    },
    usage: {
      current: {
        base: deal.usage?.current?.base || 0,
        quote: deal.usage?.current?.quote || 0,
      },
      currentUsd: deal.usage?.currentUsd || deal.usage?.current?.quote || 0,
      max: deal.usage?.max
        ? {
            base: deal.usage.max.base || 0,
            quote: deal.usage.max.quote || 0,
          }
        : undefined,
      maxUsd: deal.usage?.maxUsd || deal.usage?.max?.quote || 0,
    },
    profit: {
      total: deal.profit?.total || 0,
      totalUsd: deal.profit?.totalUsd || 0,
      pureBase: deal.profit?.pureBase || 0,
      pureQuote: deal.profit?.pureQuote || 0,
    },
    unrealizedProfit,
    unrealizedPending: !!(deal as { unrealizedPending?: boolean })
      .unrealizedPending,
    avgPrice: deal.avgPrice || 0,
    // The Add/Reduce funds dialog resolves a percentage and previews the
    // outcome from this, as it does for DCA rows.
    ...(() => {
      const basis = percentBasisFromDeal(deal);
      return basis ? { percentBasis: basis } : {};
    })(),
    levels: deal.levels || { complete: 0, all: 0 },
    created: +createdTime,
    notes: deal.note || '',
    pair,
    dealType: deal.settings?.futures ? 'FUTURES' : 'SPOT',
    futures: !!futures,
    side: (deal.strategy === 'SHORT' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
    orders: deal.levels?.complete || 0,
    entryPrice: deal.initialPrice || deal.avgPrice || 0,
    initialPrice: deal.initialPrice,
    pnl: deal.profit?.totalUsd || 0,
    cost,
    // Notional = the position's value, not cost + profit.
    value: calculateDealValue(metricsInput),
    size: calculateDealSize(metricsInput),
    usagePercentage: (futures ? coinm : !isLongStrategy(deal.strategy))
      ? deal.usage?.max?.base
        ? ((deal.usage.current?.base || 0) / deal.usage.max.base) * 100
        : 0
      : deal.usage?.max?.quote
        ? ((deal.usage.current?.quote || 0) / deal.usage.max.quote) * 100
        : 0,
    createdTime,
    workingTime,
    drawdown: deal.stats?.drawdownPercent ? deal.stats.drawdownPercent * 100 : 0,
    runUp: deal.stats?.runUpPercent ? deal.stats.runUpPercent * 100 : 0,
    timeInLoss:
      deal.stats?.timeInLoss && deal.stats?.trackTime
        ? `${((deal.stats.timeInLoss / deal.stats.trackTime) * 100).toFixed(1)}%`
        : '-',
    timeInProfit:
      deal.stats?.timeInProfit && deal.stats?.trackTime
        ? `${((deal.stats.timeInProfit / deal.stats.trackTime) * 100).toFixed(1)}%`
        : '-',
    outerGaugePercent:
      deal.levels?.all > 0
        ? (deal.levels.complete / deal.levels.all) * 100
        : 0,
    takeProfitConfig: deal.settings ? tpSLConfig(deal.settings, 'tp', true) : '-',
    stopLossConfig: deal.settings ? tpSLConfig(deal.settings, 'sl', true) : '-',
    initialBalances: deal.initialBalances,
    currentBalances: deal.currentBalances,
    closeTrigger: deal.closeTrigger,
    closePrice: deal.lastPrice,
    gridProfit: deal.profit?.gridProfit,
    gridProfitUsd: deal.profit?.gridProfitUsd,
    transactionsBuy: deal.transactions?.buy ?? 0,
    transactionsSell: deal.transactions?.sell ?? 0,
    transactionsTotal:
      (deal.transactions?.buy ?? 0) + (deal.transactions?.sell ?? 0),
    // ISO string, same reason as closeTime: the Update Time column re-parses
    // this value (to render it and to sort on it) and a locale string gets
    // misparsed by new Date(), swapping day/month.
    updateTime: deal.updateTime
      ? new Date(deal.updateTime).toISOString()
      : undefined,
    // ISO string so the Close Time column can re-parse it unambiguously.
    closeTime: deal.closeTime
      ? new Date(deal.closeTime).toISOString()
      : undefined,
    trailingMode: deal.trailingMode,
    // Per-order auto-compounding breakdown (orig size + amount compounding
    // added), surfaced in the deal detail drawer. Undefined when the bot
    // isn't compounding.
    compoundBreakdown: computeCompoundBreakdown(deal.sizes),
  };
}
