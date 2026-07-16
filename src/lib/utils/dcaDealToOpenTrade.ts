/**
 * Maps a single DCA deal record into the loose `OpenTrade`-shaped object the
 * `OpenOrdersWidget` consumes via its `data.trades` prop.
 *
 * Extracted verbatim from `TradingBots.tsx` so the Hedge DCA bots page can
 * feed the exact same widget with the exact same per-deal shape — keeping the
 * two "Deals" tabs in lock-step instead of drifting two near-identical copies.
 */
import { tpSLConfig } from '@/utils/bots/dca/tpSlConfig';
import { computeCompoundBreakdown } from '@/lib/utils/compoundBreakdown';
import type { DCADeals } from '@/types';

export function dcaDealToOpenTrade(deal: DCADeals) {
  const symbol = deal.symbol?.symbol || 'Unknown';
  const baseSymbol = symbol.replace(deal.symbol?.quoteAsset || '', '');
  const quoteSymbol = deal.symbol?.quoteAsset || 'USD';
  const pair = `${baseSymbol}/${quoteSymbol}`;
  const cost = deal.usage?.current?.quote || 0;
  const createdTime = deal.createTime ? new Date(deal.createTime) : new Date();
  const workingMs = Date.now() - createdTime.getTime();
  const workingDays = Math.floor(workingMs / (1000 * 60 * 60 * 24));
  const workingHours = Math.floor(
    (workingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const workingTime =
    workingDays > 0 ? `${workingDays}D ${workingHours}H` : `${workingHours}H`;

  // Closed/canceled deals have no unrealized P&L. The server keeps a stale
  // `stats.unrealizedProfit` on closed deals, so gate on active status
  // (legacy parity with main-dash `isActiveDeal`). Zero (not undefined) so
  // the table's totals row and sort treat closed deals as neutral.
  const active = ['open', 'start', 'error'].includes(
    String(deal.status).toLowerCase()
  );
  const hookUnrealized = (deal as { unrealizedUsd?: number }).unrealizedUsd;
  const unrealizedProfit = !active
    ? 0
    : typeof hookUnrealized === 'number'
      ? hookUnrealized
      : (deal.stats?.unrealizedProfit ?? 0);

  return {
    baseAsset: deal.symbol?.baseAsset || '',
    quoteAsset: quoteSymbol,
    active,
    id: deal._id || deal.botId,
    type: 'DCA' as const,
    symbol,
    strategy: deal.strategy || 'DCA',
    status: deal.status || 'Unknown',
    exchange: deal.exchange || 'Unknown',
    exchangeUUID: deal.exchangeUUID,
    botId: deal.botId,
    botName: deal.botName || undefined,
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
    ...(deal.funding && { funding: deal.funding }),
    unrealizedProfit,
    avgPrice: deal.avgPrice || 0,
    levels: deal.levels || { complete: 0, all: 0 },
    created: +createdTime,
    notes: deal.note || '',
    pair,
    dealType: deal.settings?.futures ? 'FUTURES' : 'SPOT',
    side: (deal.strategy === 'SHORT' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
    orders: deal.levels?.complete || 0,
    entryPrice: deal.initialPrice || deal.avgPrice || 0,
    initialPrice: deal.initialPrice,
    pnl: deal.profit?.totalUsd || 0,
    cost,
    value: cost + (deal.profit?.totalUsd || 0),
    size: deal.currentBalances?.base || 0,
    usagePercentage: deal.usage?.max?.quote
      ? (deal.usage.current.quote / deal.usage.max.quote) * 100
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
    takeProfitConfig: deal.settings ? tpSLConfig(deal.settings, 'tp') : '-',
    stopLossConfig: deal.settings ? tpSLConfig(deal.settings, 'sl') : '-',
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
    updateTime: deal.updateTime
      ? new Date(deal.updateTime).toLocaleString()
      : undefined,
    // ISO string so the Close Time column re-parses it unambiguously;
    // a locale string gets misparsed by new Date() and swaps day/month.
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
