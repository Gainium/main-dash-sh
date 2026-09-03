import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import { math } from '@/utils/math';
import {
  BotMarginTypeEnum,
  BotTypesEnum,
  PositionSide,
  type AdditionalBotData,
  type Bot,
  type ExchangeInUser,
  type Prices,
} from '.';

// Grid Bot types based on the GraphQL schema
export interface GridBotSettings {
  name: string;
  pair: string;
  topPrice: number;
  lowPrice: number;
  levels: number;
  gridStep: number;
  budget: number;
  ordersInAdvance: number;
  useOrderInAdvance: boolean;
  prioritize: string;
  profitCurrency: string;
  orderFixedIn: string;
  sellDisplacement: number;
  futures: boolean;
  coinm: boolean;
  leverage?: number;
}

export interface GridBotAssetsUsed {
  base: number;
  quote: number;
}

export interface GridBotAssetsRequired {
  base: number;
  quote: number;
}

export interface GridBotAssets {
  used: GridBotAssetsUsed;
  required: GridBotAssetsRequired;
}

export interface GridBotInitialBalances {
  base: number;
  quote: number;
}

export interface GridBotCurrentBalances {
  base: number;
  quote: number;
}

export interface GridBotLevelsActive {
  buy: number;
  sell: number;
}

export interface GridBotLevelsAll {
  buy: number;
  sell: number;
}

export interface GridBotLevels {
  active: GridBotLevelsActive;
  all: GridBotLevelsAll;
}

export interface GridBotWorkingShiftItem {
  start: number;
  end?: number;
}

export interface GridBotTransactionsCount {
  buy: number;
  sell: number;
}

export interface GridBotProfit {
  total: number;
  totalUsd: number;
}

export interface GridBotSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface GridBotProfitToday {
  start: number;
  end: number;
  totalToday: number;
  totalTodayUsd: number;
}

export type GridBot = Bot;

export interface GridBotListResponse {
  status: string;
  reason?: string | null;
  total: number;
  data: GridBot[];
}

export interface GridBotApiResponse {
  botList: GridBotListResponse;
}

// Transformed grid bot for UI (compatible with BotCard)
export type TransformedGridBot = Bot & AdditionalBotData; /* {
  id: string;
  name: string;
  type: 'grid';
  symbol: string;
  exchange: string;
  profitUsd: number;
  pnlPercent: number;
  runtime: string;
  status: 'active' | 'paused' | 'stopped' | 'error';
  levels: {
    active: number;
    all: number;
  };
  price: {
    current: number;
    top: number;
    low: number;
  };
  transactions: {
    buy: number;
    sell: number;
  };
  gridStep: number;
  budget: number;
  // Additional properties required by BotCard
  profit: number;
  invested: number;
  investedUsd: number;
  scanner: string;
  color: string;
  // Optional properties for better BotCard compatibility
  exchangeUUID?: string;
  pair?: string;
  // Numeric creation timestamp to enable reliable sorting (newest -> oldest)
  createdAt: number;
  symbols?: string[];
  coinPair?: string;
  strategy?: string;
  dailyProfit?: number;
  usage?: number;
  unrealizedPnl?: number;
  unrealizedPnlUsd?: number;
  unrealizedPnlPercent?: number;
  uPnL?: number;
  openTrades?: number;
  closedTrades?: number;
  value?: number;
  currentCost?: number;
  maxCost?: number;
  currentBaseUsage?: number;
  maxBaseUsage?: number;
  outerGaugePercent?: number;
  innerGaugePercent?: number;
  isLongStrategy?: boolean;
  // Advanced metrics (validated against old dashboard and DCA implementation)
  avgDaily?: number;
  avgDailyPerc?: number;
  annualizedReturn?: number;
  workingTime?: number;
  workingDays?: number;
  rawData?: {
    stats?: {
      chart?: Array<{
        equity: number;
        time: number;
      }>;
    };
  };
} */

const statsMap: Map<string, Bot['stats']> = new Map();

export const calculateCurrentStats = (
  bot: Bot,
  price?: number
  /*  usdRate?: number, */
) => {
  const stats = statsMap.get(bot._id);
  const {
    initialBalances,
    initialPrice,
    currentBalances,
    position: current,
  } = bot;
  if (bot.status !== 'open' || !initialPrice || !price) {
    return bot.stats;
  }
  const futures = isFuturesExchange(bot.exchange);
  const currentStats = stats ?? bot.stats;
  const initialValue =
    initialBalances.base * initialPrice + initialBalances.quote; /* *
    (futures ? 1 : bot.usdRate || usdRate || 1) */
  let currentValue = 0;
  let valueChange = 0;
  let newPercent = 0;
  if (futures) {
    const diff = current
      ? current.side === PositionSide.LONG
        ? price - current.price
        : current.price - price
      : 0;

    const perc = current && current.price !== 0 ? diff / current.price : 0;
    const val = current ? current.qty * perc * price : 0;
    const leverage =
      bot.settings.marginType !== BotMarginTypeEnum.inherit
        ? (bot.settings.leverage ?? 1)
        : 1;
    currentValue = bot.profit.totalUsd + initialValue / leverage + val;
    valueChange = bot.profit.totalUsd + val;
    newPercent = Math.abs(valueChange / (initialValue / leverage));
  } else {
    currentValue =
      currentBalances.base * price +
      currentBalances.quote +
      bot.profit.total *
        (bot.settings.profitCurrency === 'base' ? price : 1); /* *
      (usdRate || 1) */
    newPercent = Math.abs(currentValue - initialValue) / initialValue;
    valueChange = currentValue - initialValue;
  }
  if (!currentStats.currentCount && price) {
    currentStats.currentCount = valueChange > 0 ? 'profit' : 'loss';
    currentStats.timeCountStart = Date.now();
  }
  currentStats.timeCountStart = +currentStats.timeCountStart;
  if (price && currentStats && currentStats.currentCount) {
    if (valueChange > 0 && newPercent > currentStats.runUpPercent) {
      currentStats.runUpPercent = newPercent;
    } else if (valueChange < 0 && newPercent > currentStats.drawdownPercent) {
      currentStats.drawdownPercent = newPercent;
    }
    const now = Date.now();
    currentStats.trackTime += now - currentStats.timeCountStart;
    if (valueChange > 0) {
      if (currentStats.currentCount === 'loss') {
        currentStats.timeInLoss += now - currentStats.timeCountStart;
        currentStats.currentCount = 'profit';
      } else {
        currentStats.timeInProfit += now - currentStats.timeCountStart;
      }
      currentStats.timeCountStart = now;
    } else if (valueChange < 0) {
      if (currentStats.currentCount === 'profit') {
        currentStats.timeInProfit += now - currentStats.timeCountStart;
        currentStats.currentCount = 'loss';
      } else {
        currentStats.timeInLoss += now - currentStats.timeCountStart;
      }
      currentStats.timeCountStart = now;
    }
  }
  statsMap.set(bot._id, currentStats);
  return currentStats;
};

// Utility function to transform GridBot to UI format
export function transformGridBotToBot(
  gridBot: Bot,
  latestPrices: Prices,
  userExchanges?: ExchangeInUser[]
): TransformedGridBot {
  let currentStats = gridBot.stats;
  let res = { ...gridBot } as Bot & AdditionalBotData;
  const symbolProfit =
    res.settings.profitCurrency === 'base'
      ? res.symbol?.baseAsset
      : res.symbol?.quoteAsset;
  let initialBalance = 0;
  if (res.initialBalances && res.initialPrice && res.usdRate) {
    initialBalance =
      (res.initialBalances.base * res.initialPrice +
        res.initialBalances.quote) *
      res.usdRate;
  }
  const useLiveStats = latestPrices.length === 0;
  let valueCurrent = useLiveStats ? res.liveStats?.value || 0 : 0;
  let valueChange = 0;
  let notUseValueChange = false;
  const leverage =
    res.settings.marginType !== BotMarginTypeEnum.inherit
      ? (res.settings.leverage ?? 1)
      : 1;
  let usdRateBudget = 1;

  const findPrice = latestPrices.find(
    (p) => p.symbol === res.settings.pair && p.exchange === res.exchange
  );
  if (res.status !== 'closed') {
    if (!findPrice) {
      notUseValueChange = true;
    }
    const usdRate = findUSDRate(
      res.symbol.quoteAsset,
      latestPrices,
      res.exchange
    );
    usdRateBudget = usdRate;
    currentStats = calculateCurrentStats(
      gridBot,
      findPrice?.price /* , usdRate */
    );
    if (res.settings.futures && findPrice) {
      const current = res.position;
      if (!current) {
        notUseValueChange = true;
      } else {
        const diff =
          current.side === PositionSide.LONG
            ? +findPrice.price - current.price
            : current.price - +findPrice.price;

        const perc = current.price !== 0 ? diff / current.price : 0;
        const val = current.qty * perc * +findPrice.price;
        valueCurrent = res.profit.totalUsd + initialBalance / leverage + val;
        valueChange = res.profit.totalUsd + val;
      }
    } else if (res.currentBalances && findPrice && res.symbol) {
      const profitBase = res.settings.profitCurrency === 'base';
      valueCurrent =
        (res.currentBalances.base +
          (profitBase
            ? ((res.profit.freeTotal || res.profit?.total) ?? 0)
            : 0)) *
          findPrice.price +
        res.currentBalances.quote +
        (!profitBase ? ((res.profit.freeTotal || res.profit?.total) ?? 0) : 0);

      if (usdRate) {
        valueCurrent *= usdRate;
      }
    }
  } else if (
    res.status === 'closed' &&
    res.lastPrice &&
    res.lastUsdRate &&
    res.currentBalances
  ) {
    if (res.settings.futures) {
      valueCurrent = res.profit.totalUsd + initialBalance / leverage;
      valueChange = res.profit.totalUsd;
    } else {
      valueCurrent =
        res.currentBalances.base * res.lastPrice + res.currentBalances.quote;
      valueCurrent += res.profit?.total || 0;
      valueCurrent *= res.lastUsdRate;
    }
  } else {
    notUseValueChange = true;
  }
  if (isCoinmExchange(res.exchange) && res.status === 'closed') {
    usdRateBudget = findUSDRate(
      res.symbol.baseAsset,
      latestPrices,
      res.exchange
    );
  }
  const valueChangeUsd = useLiveStats
    ? res.liveStats?.valueChange || 0
    : notUseValueChange
      ? 0
      : res.settings.futures
        ? math.round(valueChange, 2)
        : math.round(math.round(valueCurrent) - math.round(initialBalance), 2);
  valueChange = useLiveStats
    ? res.liveStats?.valueChangePerc || 0
    : notUseValueChange
      ? 0
      : res.settings.futures
        ? math.round((valueChange / (initialBalance / leverage)) * 100, 2)
        : math.round(
            ((valueCurrent - initialBalance) / (initialBalance / leverage)) *
              100,
            2
          );
  const workingTime = useLiveStats
    ? res.liveStats?.tradingTime || 0
    : res.workingShift && res.workingShift.length > 0
      ? res.workingShift.reduce((acc, v) => {
          if (v.end) {
            acc += v.end - v.start;
          } else if (!v.end) {
            acc += new Date().getTime() - v.start;
          }
          return acc;
        }, 0)
      : 0;
  const avgDaily = useLiveStats
    ? res.liveStats?.avgDaily || 0
    : math.round(
        (res.profit?.totalUsd || 0) /
          math.round(workingTime / (24 * 60 * 60 * 1000), 4),
        2
      );
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
  if (useLiveStats) {
    resWork = res.liveStats?.tradingTimeString || resWork;
  }
  const date = new Date().getTime();
  const showToday =
    date > (res.profitToday?.start || 0) && date < (res.profitToday?.end || 0);
  const val =
    res.initialBalances && res.initialPrice && res.usdRate
      ? math.round(initialBalance * res.usdRate, 2)
      : 0;
  const freeProfit = math.round(
    res.status === 'closed' || res.status === 'archive'
      ? res.profit.totalUsd || 0
      : res.profit.freeTotalUsd || res.profit?.totalUsd || 0,
    2
  );
  const freeProfitInAsset = math.round(
    res.status === 'closed' || res.status === 'archive'
      ? res.profit.total || 0
      : res.profit.freeTotal || res.profit?.total || 0,
    2
  );
  const basePrecision = math.getPrecision(
    findUSDRate(res.symbol.baseAsset, latestPrices, res.exchange)
  );
  const quotePrecision = math.getPrecision(
    findUSDRate(res.symbol.quoteAsset, latestPrices, res.exchange)
  );

  const profitAsset =
    res.settings.profitCurrency === 'base' || res.settings.coinm
      ? res.symbol.baseAsset
      : res.symbol.quoteAsset;

  const profitPrecision =
    res.settings.profitCurrency === 'base' || res.settings.coinm
      ? basePrecision
      : quotePrecision;
  let avgDailyPerc = avgDaily / initialBalance;
  let annualizedReturn = 0;
  if (!isNaN(avgDailyPerc) && isFinite(avgDailyPerc) && avgDailyPerc) {
    annualizedReturn = avgDailyPerc * 365 * 100;
    if (annualizedReturn > Number.MAX_SAFE_INTEGER) {
      annualizedReturn = Infinity;
    } else {
      annualizedReturn = math.round(annualizedReturn, 2);
    }
  }
  avgDailyPerc = math.round(avgDailyPerc * 100, 2);
  res = {
    ...res,
    id: res._id,
    totalProfitUsd: res.profit.totalUsd,
    value: math.round(valueCurrent || val, 2),
    budget: math.round(
      res.settings.budget *
        (res.usdRate || usdRateBudget) *
        (isCoinmExchange(res.exchange) ? res.initialPrice || 1 : 1),
      2
    ),
    profit: {
      total: math.round(res.profit?.total || 0, 2),
      totalUsd: math.round(res.profit?.totalUsd || 0, 2),
      freeTotal: res.profit.freeTotal,
      freeTotalUsd: res.profit.freeTotalUsd,
    },
    profitToday: {
      start: res.profitToday?.start || 0,
      end: res.profitToday?.end || 0,
      totalToday: showToday
        ? math.round(res.profitToday?.totalToday || 0, 2)
        : 0,
      totalTodayUsd: showToday
        ? math.round(res.profitToday?.totalTodayUsd || 0, 2)
        : 0,
    },
    currentValue: valueCurrent,
    valueChange: `${valueChange}`,
    workingTimeNumber: workingTime,
    workingTime: resWork,
    valueChangeUsd: math.friendly(valueChangeUsd),
    valueChangeUsdNumber: math.round(valueChangeUsd, 2),
    initialBalanceUsd: math.round(initialBalance, 2),
    // Net minus realized. A grid books profit per completed pair and holds
    // inventory between levels; what the inventory is worth beyond what it
    // cost is the only part of `valueChange` that is not already booked.
    //
    // When the bot's pair has no price in the feed, `valueChangeUsd` above
    // degrades to a fabricated 0 rather than a real net. Subtracting realized
    // from that zero would report the bot's booked profit back as an open
    // LOSS of the same size — seen live as "Net PnL $0.00 / Unrealized
    // −$3.82" on a bot whose only movement was +$3.82 booked. Degrade to 0
    // the same way Net PnL does instead of inventing a number.
    unrealizedPnlUsd:
      !useLiveStats && notUseValueChange
        ? 0
        : math.round(valueChangeUsd - (res.profit?.totalUsd || 0), 2),
    symbolProfit,
    profitTodayPerc: showToday
      ? `${math.round(
          ((res.profitToday?.totalTodayUsd || 0) /
            (initialBalance * (res.usdRate || 1))) *
            100,
          2
        )}`
      : '0',
    /* profitUsdWithDecimals: math.splitBigNumberToParts(
            math.round(
              res.status === 'closed' || res.status === 'archive'
                ? res.profit.totalUsd || 0
                : res.profit.freeTotalUsd || res.profit?.totalUsd || 0,
              2,
            ),
          ), */
    /* fullProfitUsdWithDecimals: math.splitBigNumberToParts(
            math.round(res.profit.totalUsd || 0, 2),
          ), */
    profitFriendly:
      (freeProfit || 0) < 0
        ? `-$${math.friendly(math.round(Math.abs(freeProfit || -0)))}`
        : `$${math.friendly(math.round(freeProfit || 0))}`,
    fullProfitFriendly:
      (avgDaily || 0) < 0
        ? `-$${math.friendly(math.round(Math.abs(res.profit.totalUsd || -0)))}`
        : `$${math.friendly(math.round(res.profit.totalUsd || 0))}`,
    profitFriendlyInAsset:
      (freeProfit || 0) < 0
        ? `-${math.friendly(
            math.round(Math.abs(freeProfitInAsset || -0), profitPrecision)
          )} ${profitAsset}`
        : `${math.friendly(
            math.round(freeProfitInAsset || 0, profitPrecision)
          )} ${profitAsset}`,
    fullProfitFriendlyInAsset:
      (avgDaily || 0) < 0
        ? `-${math.friendly(
            math.round(Math.abs(res.profit.total || -0))
          )} ${profitAsset}`
        : `${math.friendly(math.round(res.profit.total || 0))} ${profitAsset}`,
    profitPerc: math.round((freeProfit / initialBalance) * 100, 2),
    fullProfitPerc: math.round((res.profit.totalUsd / initialBalance) * 100, 2),
    avgDaily,
    avgDailyPerc,
    annualizedReturn,
    transactionsCountFriendly: {
      buy: math.friendly(res.transactionsCount?.buy || 0),
      sell: math.friendly(res.transactionsCount?.sell || 0),
      total: math.friendly(
        (res.transactionsCount?.buy || 0) + (res.transactionsCount?.sell || 0)
      ),
    },
    stats: currentStats,
    avgDailyFriendly:
      (res.avgDaily || 0) < 0
        ? `-$${math.friendly((avgDaily || -0) * -1)}`
        : `$${math.friendly(avgDaily || 0)}`,
    exchangeName:
      userExchanges?.find((e) => e.uuid === res.exchangeUUID)?.name ||
      res.exchange,
    loadedPrices: !!findPrice,
    cost: res.cost && res.cost > 0 ? res.cost : undefined,
    isActive: res.status !== 'closed' && res.status !== 'archive',
    createdAt: new Date(res.created).getTime(),
    updatedAt: new Date(res.updated || res.created).getTime(),
    pair: res.settings.pair,
    name: res.settings.name,
    type: BotTypesEnum.grid,
  };
  return res;
}
