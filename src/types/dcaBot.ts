// Types for real DCA Bot data from GraphQL API
import { logger } from '@/lib/loggerInstance';
/* import { calculateBotValue } from '../utils/botValueCalculation'; */
import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import { math } from '@/utils/math';
import type { DrawerBot } from './bots/drawer';
import {
  BotTypesEnum,
  ComboTpBase,
  OrderSizeTypeEnum,
  StrategyEnum,
  type AdditionalBotData,
  type AllFees,
  type BotStats,
  type BotStatus,
  type ComboBot,
  type DCABot,
  type ExchangeInUser,
  type Prices,
} from './index';

export interface DcaBotSymbol {
  key: string;
  value: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

export interface DcaBotSettings {
  name: string;
  pair: string[];
  strategy: string;
  type: string;
  futures: unknown;
  coinm: unknown;
  // Extended DCA settings from actual bot configurations
  enabled?: boolean;
  profitCurrency?: string;
  orderFixedIn?: string;
  baseOrderSize?: string;
  baseOrderPrice?: string;
  orderSize?: string;
  step?: string;
  ordersCount?: number;
  activeOrdersCount?: number;
  volumeScale?: string;
  stepScale?: string;
  useTp?: boolean;
  tpPerc?: string;
  useLimitPrice?: boolean;
  startPrice?: string;
  useSmartOrders?: boolean;
  useDca?: boolean;
  useSl?: boolean;
  slPerc?: string;
  orderSizeType?: string;
  useReinvest?: boolean;
  exchange?: string;
  exchangeUUID?: string;
  startOrderType?: string;
  startCondition?: string;
  hodlDay?: string;
  hodlAt?: string;
  hodlNextBuy?: number;
  indicators?: unknown[];
  indicatorGroups?: unknown[];
  vars?: { list: unknown[]; paths: unknown[] };
}

export interface DcaBotProfit {
  totalUsd: number;
  unrealizedPnLUsd?: number;
}

export interface DcaBotDeals {
  active: number;
  all: number;
}

export interface DcaBotDealsReduce {
  id: string;
  profit: number;
  profitUsd: number;
  base: number;
  quote: number;
}

export interface DcaBotWorkingShift {
  start?: number;
  end?: number;
}

export interface DcaBotAssetValue {
  key: string;
  value: number;
}

export interface DcaBotBalanceAsset {
  key: string;
  value: number;
}

export interface DcaBotBalances {
  base: DcaBotBalanceAsset[];
  quote: DcaBotBalanceAsset[];
}

export interface DcaBotExchangeRate {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface DcaBotAssets {
  used: {
    base?: DcaBotAssetValue[];
    quote?: DcaBotAssetValue[];
  };
  required: {
    base?: DcaBotAssetValue[];
    quote?: DcaBotAssetValue[];
  };
}

export interface DcaBotUsage {
  current: {
    base?: number;
    quote?: number;
  };
  max: {
    base?: number;
    quote?: number;
  };
}

export interface DcaBotStats {
  chart: Array<{
    equity: number;
    realizedProfit: number;
    time: number;
    buyAndHold?: number;
  }>;
  numerical?: {
    general?: {
      netProfitPerc?: number;
      avgDaily?: { usd: number };
      avgDailyPerc?: number;
      annualizedReturn?: number;
      startBalance?: { usd: number };
      maxDCAOrdersTriggered?: number;
      avgDCAOrdersTriggered?: number;
      coveredPriceDeviation?: number;
      actualPriceDeviation?: number;
      confidenceGrade?: string;
      winRate?: number;
      dailyProfit?: { usd: number };
      dailyProfitPerc?: number;
    };
    duration?: {
      general?: {
        maxDealDuration?: number;
        avgDealDuration?: number;
        dealsPerDay?: number;
        workingTime?: number;
      };
    };
    profit?: {
      total?: { usd: number };
      maxDealProfit?: { usd: number };
      avgDealProfit?: { usd: number };
      totalDeals?: number;
      profitableDeals?: number;
      profitFactor?: number;
      sharpeRatio?: number;
      sortinoRatio?: number;
      calmarRatio?: number;
      maxDrawdown?: { usd: number };
      maxDrawdownPercent?: number;
    };
    loss?: {
      total?: { usd: number };
      maxDealLoss?: { usd: number };
      avgDealLoss?: { usd: number };
      totalDeals?: number;
      losingDeals?: number;
      maxDrawdown?: { usd: number };
      maxDrawdownPercent?: number;
    };
    deals?: {
      profit?: number;
      loss?: number;
    };
    usage?: {
      maxTheoreticalUsage?: number;
      maxActualUsage?: number;
      avgDealUsage?: number;
    };
  };
  duration?: {
    general?: {
      workingTime?: number;
      dealsPerDay?: number;
    };
  };
}

export type BotLiveStats = {
  currentCost: number;
  maxCost: number;
  relativeCost: number;
  relativeCostString: string;
  totalProfit: number;
  relativeProfit: number;
  value: number;
  relativeValue: number;
  avgDaily: number;
  avgDailyRelative: number;
  annualizedReturn: number;
  tradingTimeString: string;
  tradingTimeNumber: number;
  dealsTotal: number;
};

export interface DcaBot {
  _id: string;
  cost?: number;
  status: string;
  statusReason: string | null;
  share?: boolean;
  shareId?: string | null;
  settings: DcaBotSettings;
  symbol: DcaBotSymbol[];
  exchange: string;
  exchangeUUID: string;
  profit: DcaBotProfit;
  dealsInBot: DcaBotDeals;
  dealsReduceForBot?: DcaBotDealsReduce[];
  workingShift: DcaBotWorkingShift[];
  assets: DcaBotAssets;
  usage: DcaBotUsage;
  currentBalances?: DcaBotBalances;
  initialBalances?: DcaBotBalances;
  exchangeRates?: DcaBotExchangeRate[];
  stats?: DcaBotStats;
  created: string;
  liveStats?: BotLiveStats;
}

export interface DcaBotListResponse {
  status: string;
  reason: string | null;
  total: number;
  data: DCABot[];
}

export interface DcaBotListData {
  dcaBotList: DcaBotListResponse;
}

export function sumBalances(
  balances: { key: string; value: number }[],
  rates: { [key: string]: Prices[0] },
  symbols: {
    key: string;
    value: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
  }[],
  base?: boolean
) {
  return balances.reduce((acc, { key, value }) => {
    const sym = symbols.filter(
      (s) => s.value.baseAsset === key || s.value.quoteAsset === key
    );
    if (!sym.length) return acc;
    const rate = sym.map((s) => rates[s.value.symbol]).filter(Boolean)[0];
    if (!rate) return acc;
    return acc + value * (base ? 1 / rate.price : rate.price);
  }, 0);
}

export function sumPureBalances(balances: { key: string; value: number }[]) {
  return balances.reduce((acc, { value }) => {
    return acc + value;
  }, 0);
}

// Helper function to transform DcaBot to the format expected by the UI
export function transformDcaBotToBot(
  b: DCABot | ComboBot,
  allFees: AllFees,
  latestPrices: Prices,
  combo?: boolean,
  userExchanges?: ExchangeInUser[],
  stats?: BotStats | undefined
): DrawerBot {
  const useLiveStats = latestPrices.length === 0;
  if (import.meta.env.DEV) {
    logger.debug('[transformDcaBotToBot] Processing bot', {
      botId: b._id,
      symbol: b.symbol,
      settings: b.settings,
      profit: b.profit,
      assets: b.assets,
    });
  }

  let res = { ...b } as (DCABot | ComboBot) & AdditionalBotData;
  if (stats) {
    res.stats = stats;
  }
  const fee =
    allFees.find(
      (f) => f.exchange === b.exchangeUUID && f.symbol === b.settings.pair[0]
    )?.fee ?? 0;
  const workingTime =
    res.workingShift && res.workingShift.length > 0
      ? res.workingShift.reduce((acc, v) => {
          if (v.end) {
            acc += v.end - v.start;
          } else if (!v.end) {
            acc += new Date().getTime() - v.start;
          }
          return acc;
        }, 0)
      : 0;

  let avgDaily =
    (res.profit?.totalUsd || 0) /
    math.round(workingTime / (24 * 60 * 60 * 1000), 4);

  let resWork = '';
  let count: number;
  count = Math.floor(workingTime / (24 * 60 * 60 * 1000));
  if (count >= 1) {
    resWork = `${resWork} ${count}d`;
  }
  count = Math.floor(workingTime / (60 * 60 * 1000));
  if (count >= 1) {
    resWork = `${resWork} ${count % 24}h`;
  }
  count = Math.floor(workingTime / (60 * 1000));
  if (count >= 1) {
    resWork = `${resWork} ${count % 60}min`;
  }
  if (resWork === '') {
    resWork = `${Math.floor(workingTime / 1000)}s`;
  }
  let unPnl = 0;
  let unPnlPerc = 0;
  let currentValues = 0;
  let comboDealCurrentValues = 0;
  const long = res.settings.strategy === StrategyEnum.long;
  const usdRate = res.settings.futures
    ? res.settings.coinm
      ? findUSDRate(res.symbol[0].value.baseAsset, latestPrices, res.exchange)
      : findUSDRate(res.symbol[0].value.quoteAsset, latestPrices, res.exchange)
    : long
      ? findUSDRate(res.symbol[0].value.quoteAsset, latestPrices, res.exchange)
      : findUSDRate(res.symbol[0].value.baseAsset, latestPrices, res.exchange);
  const usdRatesQuote = res.symbol.reduce(
    (acc: { [key: string]: number }, { key, value }) => ({
      ...acc,
      [key]: findUSDRate(value.quoteAsset, latestPrices, res.exchange),
    }),
    {}
  );
  const usdRatesBase = res.symbol.reduce(
    (acc: { [key: string]: number }, { key, value }) => ({
      ...acc,
      [key]: findUSDRate(value.baseAsset, latestPrices, res.exchange),
    }),
    {}
  );

  const active = res.usage.current.quote !== 0 || res.usage.current.base !== 0;
  let maxValue =
    (res.settings.futures
      ? res.settings.coinm
        ? res.usage.max.base
        : res.usage.max.quote
      : long
        ? res.usage.max.quote
        : res.usage.max.base) * usdRate;
  let avgDailyPerc = avgDaily / maxValue;
  let annualizedReturn = 0;
  if (!isNaN(avgDailyPerc) && isFinite(avgDailyPerc) && avgDailyPerc) {
    const compound =
      [OrderSizeTypeEnum.percFree, OrderSizeTypeEnum.percTotal].includes(
        b.settings.orderSizeType
      ) || b.settings.useReinvest;
    annualizedReturn = compound
      ? ((1 + avgDailyPerc) ** 365 - 1) * 100
      : avgDailyPerc * 365 * 100;
    if (annualizedReturn > Number.MAX_SAFE_INTEGER) {
      annualizedReturn = Infinity;
    } else {
      annualizedReturn = math.round(annualizedReturn, 2);
    }
  }

  // `numerical`/`general` are optional on `DcaBotStats` and genuinely absent on
  // list bots: `dcaBotListFragment` requests a chart-only `stats` slice, so
  // `stats` is present while `stats.numerical` is not. Guard every hop or this
  // throws for every card in the Trading Bots list.
  const statsNetProfitPerc = res.stats?.numerical?.general?.netProfitPerc;
  let profitPerc =
    typeof statsNetProfitPerc !== 'undefined' &&
    `${statsNetProfitPerc}` !== 'null' &&
    statsNetProfitPerc
      ? statsNetProfitPerc
      : (res.profit?.totalUsd ?? 0) / maxValue;
  profitPerc = math.round(profitPerc * 100, 2);
  maxValue = math.round(maxValue, 2);
  avgDailyPerc = math.round(avgDailyPerc * 100, 2);
  avgDaily = math.round(avgDaily, 2, avgDaily < 0, avgDaily > 0);
  const botSymbols = res.symbol.concat(
    ...res.currentBalances.base.flatMap((bv) => {
      const quoteKey = res.currentBalances.quote[0]?.key;
      const name1 = `${bv.key}${res.currentBalances.quote[0]?.key}`;
      const name2 = `${bv.key}-${res.currentBalances.quote[0]?.key}`;
      return [
        {
          key: name1,
          value: {
            symbol: name1,
            baseAsset: bv.key,
            quoteAsset: quoteKey,
          },
        },
        {
          key: name2,
          value: {
            symbol: name2,
            baseAsset: bv.key,
            quoteAsset: quoteKey,
          },
        },
      ];
    }),
    ...res.currentBalances.quote.flatMap((qv) => {
      const baseKey = res.currentBalances.base[0].key;
      const name1 = `${qv.key}${res.currentBalances.quote[0].key}`;
      const name2 = `${qv.key}-${res.currentBalances.quote[0].key}`;
      return [
        {
          key: name1,
          value: {
            symbol: name1,
            baseAsset: baseKey,
            quoteAsset: qv.key,
          },
        },
        {
          key: name2,
          value: {
            symbol: name2,
            baseAsset: baseKey,
            quoteAsset: qv.key,
          },
        },
      ];
    })
  );
  const findRates = latestPrices
    .filter(
      (lp) =>
        botSymbols.map((bs) => bs.key).includes(lp.symbol) &&
        lp.exchange === res.exchange
    )
    .reduce((acc, lp) => ({ ...acc, [lp.symbol]: lp }), {}) as {
    [key: string]: Prices[0];
  };
  // Whether the price feed actually carries a usable rate for THIS bot's
  // symbol on THIS bot's exchange — the only input the client-side unPnL
  // formula below can work from.
  const botHasUsablePrices = Object.values(findRates).some(
    (r) => r.price !== 0
  );
  if (active && (latestPrices.length > 0 || useLiveStats)) {
    currentValues = useLiveStats
      ? res.liveStats?.currentCost || 0
      : math.round(
          (res.settings.futures
            ? res.settings.coinm
              ? res.usage.current.base
              : res.usage.current.quote
            : long
              ? res.usage.current.quote
              : res.usage.current.base) * usdRate
        );
    if (botHasUsablePrices && !useLiveStats) {
      unPnl = useLiveStats
        ? res.liveStats?.value || 0
        : long
          ? sumBalances(res.currentBalances.base, findRates, botSymbols) +
            sumPureBalances(res.currentBalances.quote) -
            sumPureBalances(res.initialBalances.quote)
          : sumBalances(
              res.currentBalances.quote,
              findRates,
              botSymbols,
              true
            ) -
            (sumPureBalances(res.initialBalances.base) -
              sumPureBalances(res.currentBalances.base));
      if (res.settings.futures) {
        if (res.settings.coinm) {
          unPnl = long
            ? sumPureBalances(res.currentBalances.base) +
              sumBalances(
                res.currentBalances.quote,
                findRates,
                botSymbols,
                true
              ) -
              sumBalances(
                res.initialBalances.quote,
                findRates,
                botSymbols,
                true
              )
            : sumBalances(
                res.currentBalances.quote,
                findRates,
                botSymbols,
                true
              ) -
              (sumPureBalances(res.initialBalances.base) -
                sumPureBalances(res.currentBalances.base));
        } else {
          unPnl = long
            ? sumBalances(res.currentBalances.base, findRates, botSymbols) +
              sumPureBalances(res.currentBalances.quote) -
              sumPureBalances(res.initialBalances.quote)
            : sumPureBalances(res.currentBalances.quote) -
              (sumBalances(res.initialBalances.base, findRates, botSymbols) -
                sumBalances(res.currentBalances.base, findRates, botSymbols));
        }
      }
      unPnl *= usdRate;
      if (combo && 'dealsStatsForBot' in res) {
        unPnl = 0;
        res.dealsStatsForBot.map((d) => {
          const price = findRates[d.symbol]?.price;
          const profitBase =
            (res.settings.futures && res.settings.coinm) ||
            (!res.settings.futures && res.settings.profitCurrency === 'base');
          const qty = long
            ? (d.currentBalances?.base ?? 0)
            : (d.initialBalances?.base ?? 0) - (d.currentBalances?.base ?? 0);
          let quote =
            (long
              ? (d.initialBalances?.quote ?? 0) -
                (d.currentBalances?.quote ?? 0)
              : (d.currentBalances?.quote ?? 0)) +
            (profitBase ? 0 : d.profit.total * (long ? 1 : -1));
          const quoteTp = qty * price;
          let base =
            quote / price + (profitBase ? d.profit.total * (long ? 1 : -1) : 0);
          let commission = res.settings.futures
            ? res.settings.coinm
              ? qty * fee
              : qty * price * fee
            : profitBase
              ? qty * fee
              : qty * price * fee;
          let total =
            d.profit.total +
            (profitBase ? qty - base : quoteTp - quote) * (long ? 1 : -1) -
            commission;
          if (
            typeof d.profit.pureBase !== 'undefined' &&
            typeof d.profit.pureQuote !== 'undefined' &&
            typeof d.feePaid !== 'undefined' &&
            `${d.feePaid}` !== 'null' &&
            `${d.profit.pureBase}` !== 'null' &&
            `${d.profit.pureQuote}` !== 'null' &&
            d.currentBalances.quote >= 0 &&
            d.currentBalances.base >= 0
          ) {
            quote = long
              ? d.initialBalances.quote - d.currentBalances.quote
              : d.currentBalances.quote;
            base = quote / price;
            commission = profitBase
              ? d.feePaid
                ? (d.feePaid.base ?? 0) + (d.feePaid.quote ?? 0) / d.avgPrice
                : 0
              : d.feePaid
                ? (d.feePaid.base ?? 0) * d.avgPrice + (d.feePaid.quote ?? 0)
                : 0;
            total =
              (profitBase ? qty - base : quoteTp - quote) * (long ? 1 : -1) -
              commission;
          }
          const comboBasedOn =
            !d.comboTpBase || d.comboTpBase === ComboTpBase.full
              ? ComboTpBase.full
              : ComboTpBase.filled;
          const usageBase =
            comboBasedOn === ComboTpBase.full
              ? d.usage.max.base
              : d.usage.current.base;
          const usageQuote =
            comboBasedOn === ComboTpBase.full
              ? d.usage.max.quote
              : d.usage.current.quote;
          comboDealCurrentValues +=
            (res.settings.futures
              ? res.settings.coinm
                ? usageBase
                : usageQuote
              : long
                ? usageQuote
                : usageBase) * usdRate;
          unPnl +=
            total *
            (profitBase ? usdRatesBase[d.symbol] : usdRatesQuote[d.symbol]);
        });
      }
      let usage = combo ? comboDealCurrentValues || maxValue : currentValues;
      let tpUsage = 0;
      if (!combo && res.dealsReduceForBot?.length) {
        for (const d of res.dealsReduceForBot) {
          const u = math.round(
            res.settings.futures
              ? res.settings.coinm
                ? d.base
                : d.quote
              : long
                ? d.quote
                : d.base
          );
          usage += u;
          tpUsage += u;
          unPnl += d.profitUsd;
        }
      }

      if (!combo && !tpUsage) {
        unPnlPerc = unPnl / usage;
        unPnlPerc -= fee * 2;
        unPnl = usage * unPnlPerc;
      }
      if (!combo && tpUsage) {
        const feeAmount = Math.max(0, usage - tpUsage) * fee;
        unPnl -= feeAmount;
        unPnlPerc = unPnl / usage;
      }
      if (combo) {
        unPnlPerc = unPnl / usage;
      }
      unPnlPerc = math.round(unPnlPerc * 100, 2);
    }
    if (useLiveStats) {
      unPnl = res.liveStats?.value || 0;
      unPnlPerc = res.liveStats?.relativeValue || 0;
      currentValues = res.liveStats?.currentCost || 0;
    } else if (!botHasUsablePrices) {
      // Prices are loaded globally, but none for this bot's exchange/symbol.
      // `useLiveStats` is a global "no prices at all" gate, so as soon as any
      // venue's tickers land it flips off for EVERY bot — including ones whose
      // own venue is missing from the feed. Those fell through the block above
      // with unPnl/unPnlPerc still 0 and rendered a hard "$0.00" instead of the
      // value the server already computed. Degrade to liveStats per-bot rather
      // than reporting a fabricated zero. `currentValues` is deliberately left
      // alone: it only needs `usdRate`, which usually still resolves here.
      unPnl = res.liveStats?.value || 0;
      unPnlPerc = res.liveStats?.relativeValue || 0;
    }
  }

  const usdRateBaseValues = Object.values(usdRatesBase);
  const basePrecision =
    usdRateBaseValues.length === 1
      ? math.getPrecision(usdRateBaseValues[0])
      : 0;

  const usdRateQuoteValues = Object.values(usdRatesQuote);
  const quotePrecision =
    usdRateQuoteValues.length === 1
      ? math.getPrecision(usdRateQuoteValues[0])
      : 0;

  const ex = userExchanges?.find((e) => e.uuid === res.exchangeUUID);

  unPnl = active ? math.round(unPnl, 2, unPnl < 0, unPnl > 0) : 0;
  res.usage = {
    current: {
      base: math.round(res.usage.current.base, basePrecision),
      quote: math.round(res.usage.current.quote, quotePrecision),
    },
    max: {
      base: math.round(res.usage.max.base, basePrecision),
      quote: math.round(res.usage.max.quote, quotePrecision),
    },
    currentUsd: math.round(res.usage.currentUsd || 0, 2),
    maxUsd: math.round(res.usage.maxUsd || 0, 2),
  };

  const totalUsd = math.round(res.profit?.totalUsd || 0, 2);

  const profitAsset =
    res.settings.profitCurrency === 'base' || res.settings.coinm
      ? res.symbol[0].value.baseAsset
      : res.symbol[0].value.quoteAsset;

  const profitPrecision =
    res.settings.profitCurrency === 'base' || res.settings.coinm
      ? basePrecision
      : quotePrecision;
  const profitByAsset =
    res.settings.useMulti &&
    res.flags?.includes('newBaseProfit') &&
    res.profitByAssets?.length;
  const notShowProfitInAsset =
    res.settings.useMulti &&
    !res.settings.futures &&
    ((res.settings.profitCurrency === 'base' &&
      res.settings.strategy === StrategyEnum.long) ||
      (res.settings.profitCurrency === 'quote' &&
        res.settings.strategy === StrategyEnum.short));
  const profitFriendlyInAssetTooltip =
    profitByAsset && res.profitByAssets
      ? res.profitByAssets.map((p) => ({
          ...p,
          total: math.round(
            p.total,
            math.getPrecision(
              (res.settings.profitCurrency === 'base'
                ? Object.entries(usdRatesBase).find(([k]) =>
                    k.startsWith(p.asset)
                  )?.[1]
                : Object.entries(usdRatesQuote).find(([k]) =>
                    k.endsWith(p.asset)
                  )?.[1]) ?? 0
            ) + 2
          ),
          totalUsd: math.round(p.totalUsd, 3),
        }))
      : undefined;
  const profitInAsset = res.profit.total || -0;
  const name = res.settings.name;

  const creditsCost =
    typeof b.cost === 'number' && b.cost > 0 ? b.cost : undefined;

  // Determine color based on status
  const statusColors: Record<BotStatus, string> = {
    closed: 'gray', // Gray for stopped bots
    error: 'red',
    open: 'blue',
    range: 'orange',
    monitoring: 'purple',
    archive: 'darkgray',
  };
  res = {
    ...res,
    id: b._id,
    color: statusColors[b.status] || 'gray',
    combo,
    profit: {
      total: math.round(res.profit.total, 2),
      totalUsd,
      freeTotal: 0,
      freeTotalUsd: 0,
    },
    totalProfitUsd: totalUsd,
    workingTimeNumber: workingTime,
    workingTime: resWork,
    unPnl,
    unPnlFriendly:
      (unPnl || 0) < 0
        ? `-$${math.friendly((unPnl || -0) * -1)}`
        : `$${math.friendly(unPnl || 0)}`,
    avgDaily,
    avgDailyFriendly:
      (avgDaily || 0) < 0
        ? `-$${math.friendly((avgDaily || -0) * -1)}`
        : `$${math.friendly(avgDaily || 0)}`,
    profitFriendly:
      (res.profit.totalUsd || 0) < 0
        ? `-$${math.friendly(math.round(Math.abs(res.profit.totalUsd || -0)))}`
        : `$${math.friendly(math.round(res.profit.totalUsd || 0))}`,
    profitFriendlyInAsset: notShowProfitInAsset
      ? undefined
      : (res.profit.totalUsd || 0) < 0
        ? `-${math.friendly(
            math.round(Math.abs(profitInAsset), profitPrecision)
          )} ${profitAsset}`
        : `${math.friendly(
            math.round(profitInAsset, profitPrecision)
          )} ${profitAsset}`,
    profitFriendlyInAssetTooltip,
    avgDailyPerc,
    annualizedReturn,
    profitPerc,
    unPnlPerc,
    maxValue,
    currentValue: currentValues,
    exchangeName: ex?.name ?? ex?.provider ?? res.exchange,
    currentValueFriendly: !currentValues
      ? 'N/A'
      : `$${math.friendly(currentValues)}`,
    maxValueFriendly: `$${math.friendly(maxValue || 0)}`,
    usageTotal: res.settings.futures
      ? res.settings.coinm
        ? math.round((res.usage.current.base / res.usage.max.base) * 100, 1)
        : math.round((res.usage.current.quote / res.usage.max.quote) * 100, 1)
      : res.settings.strategy === StrategyEnum.short
        ? math.round((res.usage.current.base / res.usage.max.base) * 100, 1)
        : math.round((res.usage.current.quote / res.usage.max.quote) * 100, 1),
    usageTootltip: `${math.round(
      res.settings.futures
        ? res.settings.coinm
          ? res.usage.current.base
          : res.usage.current.quote
        : res.settings.strategy === StrategyEnum.long
          ? res.usage.current.quote
          : res.usage.current.base,
      res.settings.coinm ? basePrecision : (quotePrecision ?? 2)
    )} / ${math.round(
      res.settings.futures
        ? res.settings.coinm
          ? res.usage.max.base
          : res.usage.max.quote
        : res.settings.strategy === StrategyEnum.long
          ? res.usage.max.quote
          : res.usage.max.base,
      res.settings.coinm ? basePrecision : (quotePrecision ?? 2)
    )}${' '}${
      res.settings.futures
        ? res.settings.coinm
          ? res.symbol[0]?.value.baseAsset
          : res.symbol[0]?.value.quoteAsset
        : res.settings.strategy === StrategyEnum.long
          ? res.symbol[0]?.value.quoteAsset
          : res.symbol[0]?.value.baseAsset
    }`,
    loadedPrices: !!Object.keys(findRates).length,
    name,
    isActive:
      res.status === 'open' ||
      res.status === 'monitoring' ||
      res.status === 'range' ||
      res.status === 'error' ||
      (res.status === 'closed' && res.dealsInBot.active > 0),
    createdAt: new Date(res.created).getTime(),
    updatedAt: new Date(res.updated || res.created).getTime(),
    pair: res.settings.pair[0],
    type: combo ? BotTypesEnum.combo : BotTypesEnum.dca,
    cost: creditsCost,
  };

  return res;
}
