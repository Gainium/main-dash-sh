import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import {
  calculateDealCost,
  calculateDealSize,
  calculateDealValue,
  isLongStrategy,
} from '@/lib/utils/tradingMetrics';
import { tpSLConfig } from '@/utils/bots/dca/tpSlConfig';
import {
  computeCompoundBreakdown,
  type CompoundBreakdownEntry,
} from '@/lib/utils/compoundBreakdown';
import {
  BotTypesEnum,
  ComboTpBase,
  DCADealStatusEnum,
  DCATypeEnum,
  ExchangeEnum,
  StrategyEnum,
  type AllFees,
  type ComboDeals,
  type DCADeals,
  type DealStartBlock,
  type Prices,
} from '.';
import type { DrawerBot } from './bots/drawer';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import {
  percentBasis,
  type PercentBasis,
} from '@/features/bots/shared/runtime/dialogs/adjustFundsAmount';

export type TradeChartPoint = {
  time: string;
  price: number;
};

export type TransformedTrade = {
  active: boolean;
  id: string;
  type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
  /** True for terminal deals — they have no bot page, so bot links are hidden */
  terminal?: boolean;
  symbol:
    | string
    | {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
      };
  strategy: string;
  status: string;
  exchange: string;
  exchangeUUID?: string | undefined;
  botId?: string | undefined; // Added to support orders fetching
  botName?: string | undefined;
  currentBalance: {
    base: number;
    quote: number;
  };
  usage: {
    current: {
      base: number;
      quote: number;
    };
    currentUsd?: number;
    max?: {
      base: number;
      quote: number;
    };
    maxUsd?: number;
  };
  profit?:
    | {
        total: number;
        totalUsd: number;
        pureBase: number;
        pureQuote: number;
      }
    | undefined;
  funding?:
    | {
        /** Cumulative funding in quote asset (signed; negative = paid) */
        total: number;
        totalUsd: number;
        /** Last applied settlement time (ms) */
        lastTime?: number;
        history?: {
          time: number;
          rate: number;
          markPrice?: number;
          qty: number;
          feeQuote: number;
          feeUsd: number;
        }[];
      }
    | undefined;
  unrealizedProfit?: number | undefined;
  /**
   * What a percentage add/reduce resolves to for this deal, in base units.
   * Derived here because this is the only place that already holds every input
   * the engine reads (`lastPrice`, futures/coinm, leverage + margin type, and
   * both balance snapshots); the deal shapes downstream carry none of them.
   * Undefined when the deal has no usable position yet.
   */
  percentBasis?: PercentBasis | undefined;
  avgPrice?: number | undefined;
  levels: {
    complete: number;
    all: number;
  };
  /** Risk-based DCA deal (`settings.useRiskReward`) — DCA levels are managed
   * by the risk engine, so manual "Change DCA levels" is disabled for these. */
  riskBased?: boolean | undefined;
  created?: number | undefined;
  // Enhanced properties for advanced cards
  initialPrice?: number | undefined;
  notes?: string;
  pair?: string;
  dealType?: string;
  side?: 'BUY' | 'SELL';
  orders?: number;
  entryPrice?: number;
  pnl?: number;
  cost?: number;
  value?: number;
  size?: number;
  usagePercentage?: number;
  createdTime?: Date;
  workingTime?: string;
  drawdown?: number;
  runUp?: number;
  timeInLoss?: string;
  timeInProfit?: string;
  takeProfitConfig?: string;
  stopLossConfig?: string;
  // Gauge properties
  outerGaugePercent?: number;
  centerText?: string;
  showInnerGauge?: boolean;
  // Chart data (real values provided by API)
  chartData?: TradeChartPoint[];
  takeProfitPrice?: number;
  stopLossPrice?: number;
  // Additional fields for old dashboard parity
  initialBalances?: {
    base: number;
    quote: number;
  };
  currentBalances?: {
    base: number;
    quote: number;
  };
  closeTrigger?: string;
  closePrice?: number;
  gridProfit?: number;
  gridProfitUsd?: number;
  transactionsBuy?: number;
  transactionsSell?: number;
  transactionsTotal?: number;
  updateTime?: string;
  closeTime?: string;
  trailingMode?: string;
  exitPrice?: number;
  compoundBreakdown?: CompoundBreakdownEntry[] | undefined;
  /**
   * Why this deal exists but has never opened - the venue refused its opening
   * order. Absent on every normal deal.
   */
  startBlocked?: DealStartBlock;
};

/**
 * `percentBasis` for a raw deal record, deriving the futures/coinm/leverage
 * inputs the same way the trade transform does.
 *
 * Exported because the Trading page builds its own flattened deal rows rather
 * than going through `transformDealToTrade`, and both must hand the Add/Reduce
 * funds dialog the same number — a preview that disagrees between the bot
 * drawer and the trades table would be worse than no preview at all.
 */
export const percentBasisFromDeal = (deal: {
  strategy?: string | undefined;
  avgPrice?: number | undefined;
  lastPrice?: number | undefined;
  exchange?: ExchangeEnum | string | undefined;
  usage?: { current?: { base?: number; quote?: number } } | undefined;
  currentBalances?: { base?: number } | undefined;
  initialBalances?: { base?: number } | undefined;
  settings?:
    | {
        futures?: boolean | undefined;
        coinm?: boolean | undefined;
        leverage?: number | undefined;
        marginType?: string | undefined;
      }
    | undefined;
}): PercentBasis | null => {
  const futures =
    `${deal.settings?.futures}` !== 'null' && deal.settings?.futures !== undefined
      ? !!deal.settings.futures
      : isFuturesExchange((deal.exchange as ExchangeEnum) ?? ExchangeEnum.binance);
  const coinm =
    `${deal.settings?.coinm}` !== 'null' && deal.settings?.coinm !== undefined
      ? !!deal.settings.coinm
      : isCoinmExchange((deal.exchange as ExchangeEnum) ?? ExchangeEnum.binance);
  const long = isLongStrategy(deal.strategy ?? '');

  return percentBasis({
    usageCurrentBase: deal.usage?.current?.base || 0,
    usageCurrentQuote: deal.usage?.current?.quote || 0,
    avgPrice: deal.avgPrice || 0,
    lastPrice: deal.lastPrice || 0,
    // The position still on the books — the same expression the take-profit
    // block uses.
    remainingBase: long
      ? deal.currentBalances?.base || 0
      : (deal.initialBalances?.base || 0) - (deal.currentBalances?.base || 0),
    long,
    futures,
    coinm,
    leverage: deal.settings?.leverage,
    marginType: deal.settings?.marginType,
  });
};

export const transformDealToTrade = (
  deal: DCADeals | ComboDeals,
  allFees: AllFees,
  latestPrices: Prices,
  bot?: DrawerBot
): TransformedTrade => {
  const useLiveStats = latestPrices.length === 0;

  const createTime = deal.createTime ? +new Date(deal.createTime) : +new Date();

  const profit = deal.profit || { totalUsd: 0 };
  const usage = deal.usage || {
    current: { quote: 0 },
    max: { quote: 0 },
  };
  const levels = deal.levels || { complete: 0, all: 0 };
  // Hedge-combo legs are combo deals too, so they must use the combo
  // unrealized-P&L formula (legacy parity: main-dash's hedge view passes
  // `combo = true`). Treating them as non-combo runs the generic spot
  // formula, which is wildly wrong for COIN-M legs.
  const combo =
    bot?.type === BotTypesEnum.combo || bot?.type === BotTypesEnum.hedgeCombo;
  // Derive futures/coinm at the function level so they're available in the
  // return statement for cost/value/size helpers.
  const futures =
    `${deal.settings.futures}` !== 'null'
      ? deal.settings.futures
      : isFuturesExchange(deal.exchange ?? ExchangeEnum.binance);
  const coinm =
    `${deal.settings.coinm}` !== 'null'
      ? deal.settings.coinm
      : isCoinmExchange(deal.exchange ?? ExchangeEnum.binance);
  // Leverage/marginType drive the notional-vs-cost split for futures deals;
  // getLeverage() falls back to 1x (collapsing Notional onto Cost) unless both
  // are supplied. Applies to every futures bot type (DCA, Combo, Hedge Combo).
  const leverage = deal.settings.leverage;
  const marginType = deal.settings.marginType;
  // Usage is tracked on the quote side for LONG spot / USD-M futures and on the
  // BASE side for SHORT spot / COIN-M futures. Reading only the quote side made
  // short combos (and coin-m deals) report 0% usage.
  const usesBaseSide = futures ? coinm : !isLongStrategy(deal.strategy);
  const usageCurrentBase =
    'base' in usage.current ? usage.current.base || 0 : 0;
  const usageMaxBase =
    usage.max && 'base' in usage.max ? usage.max.base || 0 : 0;
  const usagePercentage = usesBaseSide
    ? usageMaxBase
      ? (usageCurrentBase / usageMaxBase) * 100
      : 0
    : usage.max?.quote
      ? (usage.current.quote / usage.max.quote) * 100
      : 0;
  // Determine type based on bot configuration
  let dealType:
    | 'DCA'
    | 'Combo'
    | 'Hedge DCA'
    | 'Hedge Combo'
    | 'Grid'
    | 'Terminal' = 'DCA';
  if (bot?.type === BotTypesEnum.hedgeDca) dealType = 'Hedge DCA';
  else if (bot?.type === BotTypesEnum.hedgeCombo) dealType = 'Hedge Combo';
  else if (combo) dealType = 'Combo';
  else if (deal.type === DCATypeEnum.terminal) dealType = 'Terminal';

  // Determine botId from deal or component prop
  const resolvedBotId = deal.botId;

  // Calculate working time
  const now = Date.now();
  const created = deal.createTime ? new Date(deal.createTime).getTime() : now;
  const workingMs = now - created;
  const workingDays = Math.floor(workingMs / (1000 * 60 * 60 * 24));
  const workingHours = Math.floor(
    (workingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const workingTime =
    workingDays > 0
      ? `${workingDays}days ${workingHours}h`
      : `${workingHours}h`;

  // Legacy parity (main-dash `isActiveDeal`, utils/deals.ts): unrealized P&L
  // only exists while a deal is live. Closed/canceled deals must not report it
  // — the server keeps a stale `stats.unrealizedProfit` on closed deals, and
  // the live-price formula below would otherwise recompute a bogus value from
  // leftover balances. Force it to undefined for non-active deals either way.
  const isActiveDeal =
    deal.status === DCADealStatusEnum.open ||
    deal.status === DCADealStatusEnum.error ||
    deal.status === DCADealStatusEnum.start;

  let unrealizedPnL =
    useLiveStats && isActiveDeal ? deal.stats.unrealizedProfit : undefined;

  if (!useLiveStats) {
    const long = deal.strategy === StrategyEnum.long;
    const price = latestPrices.find(
      (p) => p.symbol === deal.symbol.symbol && p.exchange === deal.exchange
    )?.price;

    // Legacy parity: the deal-table unrealized-P&L formula always converts
    // via the QUOTE asset, for spot, USD-M, AND COIN-M alike (see main-dash
    // terminal/utils.ts and hedge/new.tsx, which call findUSDRate(quoteAsset)
    // unconditionally). For COIN-M the formula's own `* price` term performs
    // the coin→USD conversion, so the rate must stay quote-based (= 1 for
    // USD-settled pairs). Using the base asset here double-converted COIN-M
    // legs by ~the coin price, inflating unrealized P&L by orders of magnitude.
    const usdRate = findUSDRate(
      deal.symbol.quoteAsset,
      latestPrices,
      deal.exchange
    );
    unrealizedPnL =
      deal.strategy && price && usdRate && isActiveDeal
        ? (long
            ? deal.currentBalances.base * price +
              deal.currentBalances.quote -
              deal.initialBalances.quote
            : deal.currentBalances.quote -
              (deal.initialBalances.base - deal.currentBalances.base) * price) *
          usdRate
        : undefined;
    const fee = allFees.find(
      (f) => f.exchange === deal.exchangeUUID && f.symbol === deal.symbol.symbol
    )?.fee;
    const { comboTpBase } = deal.settings;
    const comboBasedOn =
      !comboTpBase || comboTpBase === ComboTpBase.full
        ? ComboTpBase.full
        : ComboTpBase.filled;
    const usageBase =
      comboBasedOn === ComboTpBase.full
        ? deal.usage.max.base
        : deal.usage.current.base;
    const usageQuote =
      comboBasedOn === ComboTpBase.full
        ? deal.usage.max.quote
        : deal.usage.current.quote;
    const reduceFundsBase = (deal.reduceFunds ?? []).reduce(
      (acc, r) => acc + r.qty,
      0
    );
    const reduceFundsQuote = (deal.reduceFunds ?? []).reduce(
      (acc, r) => acc + r.qty * r.price,
      0
    );
    const usage =
      usdRate && price
        ? futures
          ? coinm
            ? (combo ? usageBase : deal.usage.current.base + reduceFundsBase) *
              price *
              usdRate
            : (combo
                ? usageQuote
                : deal.usage.current.quote + reduceFundsQuote) * usdRate
          : long
            ? (combo
                ? usageQuote
                : deal.usage.current.quote + reduceFundsQuote) * usdRate
            : (combo ? usageBase : deal.usage.current.base + reduceFundsBase) *
              price *
              usdRate
        : undefined;
    const feeAmount = fee !== undefined ? (usage ?? 0) * fee * 2 : undefined;

    // A breakeven deal has an unrealized P&L of exactly 0 (e.g. right after
    // entry, or while the market is closed and the live price is frozen at the
    // avg entry price — common for Kraken tokenized "xStocks"). The old
    // `unrealizedPnL &&` truthy-check treated that legitimate 0 as "no value"
    // and returned undefined, which the table renders as "Price unavailable".
    // Guard on `!== undefined` so a real 0 survives.
    unrealizedPnL =
      unrealizedPnL !== undefined && feeAmount !== undefined
        ? unrealizedPnL - feeAmount
        : undefined;
    if (
      combo &&
      isActiveDeal &&
      price !== undefined &&
      fee !== undefined &&
      usdRate !== undefined
    ) {
      const profitBase =
        (futures && coinm) ||
        (!futures && deal?.settings.profitCurrency === 'base');
      const qty = long
        ? deal.currentBalances.base
        : deal.initialBalances.base - deal.currentBalances.base;
      let quote =
        (long
          ? deal.initialBalances.quote - deal.currentBalances.quote
          : deal.currentBalances.quote) +
        (profitBase ? 0 : deal.profit.total * (long ? 1 : -1));
      const quoteTp = qty * price;
      let base =
        quote / price + (profitBase ? deal.profit.total * (long ? 1 : -1) : 0);
      let commission = profitBase ? qty * fee : qty * price * fee;
      let total =
        (deal.profit.total +
          (profitBase ? qty - base : quoteTp - quote) * (long ? 1 : -1) -
          commission) *
        usdRate *
        (profitBase ? price : 1);
      if (
        typeof deal.profit.pureBase !== 'undefined' &&
        typeof deal.profit.pureQuote !== 'undefined' &&
        typeof deal.feePaid !== 'undefined' &&
        `${deal.feePaid}` !== 'null' &&
        `${deal.profit.pureBase}` !== 'null' &&
        `${deal.profit.pureQuote}` !== 'null' &&
        deal.currentBalances.quote >= 0 &&
        deal.currentBalances.base >= 0
      ) {
        quote = long
          ? deal.initialBalances.quote - deal.currentBalances.quote
          : deal.currentBalances.quote;
        base = quote / price;
        commission = profitBase
          ? deal.feePaid
            ? (deal.feePaid.base ?? 0) +
              (deal.feePaid.quote ?? 0) / deal.avgPrice
            : 0
          : deal.feePaid
            ? (deal.feePaid.base ?? 0) * deal.avgPrice +
              (deal.feePaid.quote ?? 0)
            : 0;
        total =
          (+(profitBase ? qty - base : quoteTp - quote) * (long ? 1 : -1) -
            commission) *
          usdRate *
          (profitBase ? price : 1);
      }

      unrealizedPnL = total;
    }
  }

  return {
    id: deal._id,
    active: isActiveDeal,
    type: dealType,
    terminal: dealType === 'Terminal',
    symbol: deal.symbol,
    strategy: deal.strategy || '',
    status: String(deal.status),
    exchange: deal.exchange || '',
    exchangeUUID: deal.exchangeUUID || '',
    botName: bot?.name || '',
    botId: resolvedBotId,
    pair:
      deal.symbol?.symbol ||
      (typeof deal.symbol === 'string' ? deal.symbol : deal.symbol?.symbol),
    currentBalance: {
      base: deal.currentBalances?.base || 0,
      quote: deal.currentBalances?.quote || 0,
    },
    usage: {
      current: {
        base: ('base' in usage.current ? usage.current.base : 0) || 0,
        quote: usage.current.quote || 0,
      },
      currentUsd: usage.current.quote,
      max: {
        base: (usage.max && 'base' in usage.max ? usage.max.base : 0) || 0,
        quote: usage.max?.quote || 0,
      },
      maxUsd: usage.max?.quote,
    },
    profit: {
      total: ('pureBase' in profit ? profit.pureBase : 0) || 0,
      totalUsd: profit.totalUsd || 0,
      pureBase: ('pureBase' in profit ? profit.pureBase : 0) || 0,
      pureQuote: ('pureQuote' in profit ? profit.pureQuote : 0) || 0,
    },
    ...(deal.funding && { funding: deal.funding }),
    avgPrice: deal.avgPrice || 0,
    ...(() => {
      const basis = percentBasisFromDeal(deal);
      return basis ? { percentBasis: basis } : {};
    })(),
    levels,
    riskBased: deal.settings?.useRiskReward,
    created: createTime,
    initialPrice: deal.initialPrice || 0,
    entryPrice: deal.initialPrice || deal.avgPrice || 0,
    pnl: profit.totalUsd || 0,
    cost: calculateDealCost({
      strategy: deal.strategy,
      status: deal.status,
      avgPrice: deal.avgPrice,
      usage: {
        current: {
          base:
            usage.current.quote !== undefined
              ? ('base' in usage.current ? usage.current.base : 0) || 0
              : 0,
          quote: usage.current.quote || 0,
        },
      },
      futures,
      coinm,
      leverage,
      marginType,
    }),
    value: calculateDealValue({
      strategy: deal.strategy,
      status: deal.status,
      avgPrice: deal.avgPrice,
      usage: {
        current: {
          base: ('base' in usage.current ? usage.current.base : 0) || 0,
          quote: usage.current.quote || 0,
        },
      },
      futures,
      coinm,
      leverage,
      marginType,
    }),
    size: calculateDealSize({
      strategy: deal.strategy,
      status: deal.status,
      avgPrice: deal.avgPrice,
      usage: {
        current: {
          base: ('base' in usage.current ? usage.current.base : 0) || 0,
          quote: usage.current.quote || 0,
        },
      },
      currentBalances: deal.currentBalances,
      initialBalances: deal.initialBalances,
      futures,
      coinm,
      leverage,
      marginType,
    }),
    usagePercentage,
    outerGaugePercent: usagePercentage,
    centerText: `${Math.round(usagePercentage)}%`,
    showInnerGauge: false,
    unrealizedProfit: unrealizedPnL,
    side: deal.strategy === 'SHORT' ? 'SELL' : 'BUY',
    drawdown: deal.stats?.drawdownPercent
      ? deal.stats.drawdownPercent * 100
      : 0,
    runUp: deal.stats?.runUpPercent ? deal.stats.runUpPercent * 100 : 0,
    timeInLoss:
      deal.stats?.timeInLoss && deal.stats?.trackTime
        ? `${((deal.stats.timeInLoss / deal.stats.trackTime) * 100).toFixed(1)}%`
        : '-',
    timeInProfit:
      deal.stats?.timeInProfit && deal.stats?.trackTime
        ? `${((deal.stats.timeInProfit / deal.stats.trackTime) * 100).toFixed(1)}%`
        : '-',
    workingTime,
    // Additional fields for old dashboard parity
    initialBalances: deal.initialBalances,
    currentBalances: deal.currentBalances,
    closeTrigger: deal.closeTrigger,
    startBlocked: deal.startBlocked,
    closePrice: deal.lastPrice,
    gridProfit: deal.profit?.gridProfit,
    gridProfitUsd: deal.profit?.gridProfitUsd,
    transactionsBuy: deal.transactions?.buy ?? 0,
    transactionsSell: deal.transactions?.sell ?? 0,
    transactionsTotal:
      (deal.transactions?.buy ?? 0) + (deal.transactions?.sell ?? 0),
    updateTime: deal.updateTime
      ? new Date(deal.updateTime).toISOString()
      : undefined,
    closeTime: (deal.closeTime as number | undefined)
      ? new Date(deal.closeTime as number).toISOString()
      : undefined,
    trailingMode: deal.trailingMode,
    takeProfitConfig: (deal as DCADeals).settings
      ? tpSLConfig((deal as DCADeals).settings, 'tp', combo)
      : '-',
    stopLossConfig: (deal as DCADeals).settings
      ? tpSLConfig((deal as DCADeals).settings, 'sl', combo)
      : '-',
    exitPrice: deal.lastPrice,
    // Per-order auto-compounding breakdown, surfaced in the deal detail
    // drawer. Undefined when the bot isn't compounding.
    compoundBreakdown: computeCompoundBreakdown(deal.sizes),
  };
};
