/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrecisionGuard } from '@/features/bots/shared/utils/order-guard';
import type { AssetClass } from '@/hooks/useTradingPairs';
import type { VarBindingPath } from '@/hooks/bots/global-variables/useBotVarBinding';
import type {
  EntityId,
  IOrderLineAdapter,
} from 'public/static/charting_library/charting_library';
import { type ReactElement } from 'react';
import { ExchangeEnum } from './exchange.types';

export const indicatorsLimit = 20;
export { ExchangeEnum, TradeTypeEnum } from './exchange.types';
export type { ExchangeInUser, ExchangesTotal } from './exchange.types';
export {
  getWidgetQueries,
  getWidgetTypeIdentifier,
  isValidWidgetType,
  WIDGET_QUERY_MAP,
  WIDGET_TYPE_MAP,
} from './widgets';
export type { DashboardWidgetType, WidgetType } from './widgets';
export const MIN_ORDERDS = 3;
export const MIN_ORDERS_IN_ADVANCE = 3;
export const MAX_LEVELS = 200;
export const DEFAULT_LEVELS = 2;
export const REMOVE_TOKEN = 'REMOVE_TOKEN';
export const SET_TOKEN = 'SET_TOKEN';
export const REMOVE_USER = 'REMOVE_USER';
export const SET_USER = 'SET_USER';
export const ADD_MESSAGE = 'ADD_MESSAGE';
export const ADD_STATUS = 'ADD_STATUS';
export const ADD_CONNECTION = 'ADD_CONNECTION';
export const SLICE_MESSAGE = 'SLICE_MESSAGE';
export const CLEAR_MESSAGE = 'CLEAR_MESSAGE';
export const ADD_BOT_STATS = 'ADD_BOT_STATS';
export const ADD_ORDER = 'ADD_ORDER';
export const ADD_ORDERS_MASS = 'ADD_ORDERS_MASS';
export const CLEAR_ORDERS = 'CLEAR_ORDERS';
export const CLEAR_BOT_STATS = 'CLEAR_BOT_STATS';
export const CLEAR_TRANSACTIONS = 'CLEAR_TRANSACTIONS';
export const CLEAR_BOT_SETTINGS = 'CLEAR_BOT_SETTINGS';
export const CLEAR_DCA_BOT_SETTINGS = 'CLEAR_DCA_BOT_SETTINGS';
export const CLEAR_COMBO_BOT_SETTINGS = 'CLEAR_COMBO_BOT_SETTINGS';
export const CLEAR_HEDGE_COMBO_BOT_SETTINGS = 'CLEAR_HEDGE_COMBO_BOT_SETTINGS';
export const CLEAR_BACKTEST_BOT_SETTINGS = 'CLEAR_BACKTEST_BOT_SETTINGS';
export const CLEAR_BACKTEST_DCA_BOT_SETTINGS =
  'CLEAR_BACKTEST_DCA_BOT_SETTINGS';
export const ADD_TRANSACTION = 'ADD_TRANSACTION';
export const ADD_TRANSACTIONS_MASS = 'ADD_TRANSACTION_MASS';
export const ADD_DEALS = 'ADD_DEALS';
export const ADD_MINIGRIDS = 'ADD_MINIGRIDS';
export const ADD_BALANCE = 'ADD_BALANCE';
export const CLEAR_BALANCE = 'CLEAR_BALANCE';
export const ADD_DEALS_MASS = 'ADD_DEALS_MASS';
export const ADD_MINIGRIDS_MASS = 'ADD_MINIGRIDS_MASS';
export const CLEAR_DEALS = 'CLEAR_DEALS';
export const CLEAR_MINIGRIDS = 'CLEAR_MINIGRIDS';
export const ADD_DEAL_STATS = 'ADD_DEALS';
export const CLEAR_DEAL_STATS = 'CLEAR_DEAL_STATS';
export const ADD_BOT_MESSAGE = 'ADD_BOT_MESSAGE';
export const ADD_MASS_BOT_MESSAGE = 'ADD_MASS_BOT_MESSAGE';
export const CLEAR_BOT_MESSAGE = 'CLEAR_BOT_MESSAGE';
export const ADD_BOT_SETTINGS = 'ADD_BOT_SETTINGS';
export const ADD_HEDGE_COMBO_BOT_SETTINGS = 'ADD_HEDGE_COMBO_BOT_SETTINGS';
export const ADD_HEDGE_DCA_BOT_SETTINGS = 'ADD_HEDGE_DCA_BOT_SETTINGS';
export const CLEAR_HEDGE_DCA_BOT_SETTINGS = 'CLEAR_HEDGE_DCA_BOT_SETTINGS';
export const ADD_DCA_BOT_SETTINGS = 'ADD_DCA_BOT_SETTINGS';
export const ADD_COMBO_BOT_SETTINGS = 'ADD_COMBO_BOT_SETTINGS';
export const ADD_BACKTEST_BOT_SETTINGS = 'ADD_BACKTEST_BOT_SETTINGS';
export const ADD_BACKTEST_DCA_BOT_SETTINGS = 'ADD_BACKTEST_DCA_BOT_SETTINGS';
export const ADD_BACKTEST_COMBO_BOT_SETTINGS =
  'ADD_BACKTEST_COMBO_BOT_SETTINGS';
export const ADD_ACTIVE_DEAL = 'ADD_ACTIVE_DEAL';
export const CLEAR_ACTIVE_DEAL = 'CLEAR_ACTIVE_DEAL';
export const CLEAR_BACKTEST_COMBO_BOT_SETTINGS =
  'CLEAR_BACKTEST_COMBO_BOT_SETTINGS';
export const SET_GLOBAL_VARIABLES = 'SET_GLOBAL_VARIABLES';
export const DELETE_GLOBAL_VARIABLES = 'DELETE_GLOBAL_VARIABLES';
export const CLEAR_GLOBAL_VARIABLES = 'CLEAR_GLOBAL_VARIABLES';
export const MIN_DCA_TP = 0.001;
export const MIN_DCA_TP_NEW = 0.01;
export const MIN_DCA_ORDERS = 1;
/**
 * Ceiling on a DCA/Combo ladder's *depth* — how many orders the plan describes.
 * Mirrors the flat `ordersCount` max in main-app's v2 validator
 * (`core/src/server/v2/validators/bots/config.ts`), which is the authority.
 * Ladder depth on its own costs nothing on the exchange: with smart orders on,
 * only `activeOrdersCount` levels ever rest there.
 */
export const MAX_DCA_ORDERS = 200;
/**
 * Ceiling on the orders a bot may have *resting on the exchange at any one
 * moment*, summed across its concurrent deals. This is the real constraint —
 * venues cap open orders per symbol (Binance's `MAX_NUM_ORDERS` filter, Bybit's
 * 500 conditional/TP-SL/active ceiling, Kraken's `EOrder:Orders limit
 * exceeded`), and blowing through it makes the bot fail to place orders rather
 * than fail to save.
 *
 * Deliberately a separate constant from `MAX_DCA_ORDERS`: they happen to share
 * a value today, but they constrain different things and should be free to
 * diverge (ideally this one becomes per-symbol, read from `exchangeLimits`).
 */
export const MAX_RESTING_EXCHANGE_ORDERS = 200;
export const MIN_DCA_ORDER_STEP = 0.001;
export const MIN_COMBO_ORDER_STEP = 0.003;
export const MAX_DCA_ORDER_STEP = Infinity;
export const MIN_DCA_STEP_SCALE = 0.5;
export const MAX_DCA_STEP_SCALE = 10;
export const MIN_DCA_VOLUME_SCALE = 0.5;
export const MAX_DCA_VOLUME_SCALE = 10;

export type Currency = 'quote' | 'base';

export type AssetView = 'value' | 'cost';

export type BotStatus =
  | 'open'
  | 'closed'
  | 'range'
  | 'error'
  | 'archive'
  | 'monitoring';

export type TokenState = string | null;

export type UserState = {
  hasExchanges: boolean | null;
  hasPaperExchanges: boolean | null;
  hasLiveExchanges: boolean | null;
  bigAccount: boolean | null;
  email: string | null;
  timezone: string | null;
  id: string | null;
  theme: string | null;
  weekStart: string | null;
  name: string | null;
  lastName: string | null;
  picture: string | null;
  onboardingSteps: {
    signup: boolean | null;
    liveExchange: boolean | null;
    deployLiveBot: boolean | null;
    earnProfit: boolean | null;
  } | null;
  paperContext: boolean | null;
  videos?: { id: string; watch80: boolean; closed: boolean }[];
  // Cloud returns String; sh returns `{ key, isPremium }`. See
  // `types/auth.ts` notes — read via the license adapter, not directly.
  licenseKey?:
    | string
    | {
        key: string | null;
        isPremium: boolean | null;
      };
  balance: number | null;
  credits: {
    subscription: {
      arrived: string | null;
      expired: string | null;
      amount: number | null;
    } | null;
    paid: number | null;
    blocked: number | null;
  } | null;
  subscription: {
    newSubscription?: boolean | null;
    credits?: {
      balance?: number | null;
      locked?: number | null;
    } | null;
    subscriptionPlanName: SubscriptionPlans | null;
    startDate: string | null;
    automaticCharge: boolean;
    status: string | null;
    type: SubscriptionType | null;
    price: number | null;
    nextPayment: {
      credits?: {
        balance?: number | null;
        locked?: number | null;
      } | null;
      type: SubscriptionType | null;
      subscriptionPlanName: SubscriptionPlans | null;
      date: Date | null;
    } | null;
    charged?: boolean;
    extensions?: {
      type: SubscriptionType;
      subscriptionPlanName: SubscriptionPlans;
      date: Date;
      endDate: Date;
      price: number;
    }[];
  } | null;
  groups?: string[] | null;
};

export type OrdersState = OrderData[];

export type BotStatsState = { id: string; data: botStatsInStore }[];

export type TransactionsState = Transaction[];

export type DealsState = DCADeals[];

export type MinigridsState = ComboMinigrid[];

export type DealStatsState = ProfitLossStats | null;

export type BotMessageState = MessageSocket[];

export type BotSettingsState = Partial<Bot>[];

export type BotDCASettingsState = Partial<DCABot>[];

export type BotComboSettingsState = Partial<ComboBot>[];

export type PartialHedge = Partial<Omit<HedgeBot, 'bots'>>;

export type HedgeBotSettingsState = PartialHedge[];

export type ActiveDealState = {
  _id?: string;
};

export type TokenActionType = SetToken | RemoveToken;

export type UserActionType = SetUser | RemoveUser;

export type OrderActionType = AddOrder | AddOrdersMass | ClearOrders;

export type StatsActionType = AddStats | ClearStats;

export type TransactionActionType =
  | AddTransaction
  | AddTransactionsMass
  | ClearTransactions;

export type DealsActionType = AddDeals | AddDealsMass | ClearDeals;

export type DealStatsActionType = AddDealStats | ClearDealStats;

export type BalanceActionType = AddBalance | ClearBalance;

export type BotMessageActionType =
  | AddBotMessage
  | AddBotMassMessage
  | ClearBotMessage;

export type BotSettingsActionType = AddBotSettings | ClearBotSettings;

export type BotDCASettingsActionType = AddDCABotSettings | ClearDCABotSettings;

export type BotComboSettingsActionType =
  | AddComboBotSettings
  | ClearComboBotSettings;

export type HedgeBotComboSettingsActionType =
  | AddHedgeComboBotSettings
  | ClearHedgeComboBotSettings;

export type HedgeBotDCASettingsActionType =
  | AddHedgeDCABotSettings
  | ClearHedgeDCABotSettings;

export type MinigridsActionType =
  | AddMinigrids
  | AddMinigridsMass
  | ClearMinigrids;

export type MessageActionType = AddMessage | SliceMessage | ClearMessage;

export type StatsType = AddStats | ClearStats;

export type ActiveDealType = AddActiveDeal | ClearActiveDeal;

interface SetToken {
  type: typeof SET_TOKEN;
  payload: NonNullable<TokenState>;
}

interface RemoveToken {
  type: typeof REMOVE_TOKEN;
}

interface SetUser {
  type: typeof SET_USER;
  payload: UserState;
}

interface RemoveUser {
  type: typeof REMOVE_USER;
}

interface AddOrder {
  type: typeof ADD_ORDER;
  order?: OrderData;
}

export type botStatsInStore = {
  stats?: BotStats;
  symbolStats?: BotSymbolsStats[];
};

interface AddStats {
  type: typeof ADD_BOT_STATS;
  data?: botStatsInStore;
  id?: string;
}

interface AddOrdersMass {
  type: typeof ADD_ORDERS_MASS;
  orders?: OrderData[];
}

interface ClearOrders {
  type: typeof CLEAR_ORDERS;
}

interface ClearStats {
  type: typeof CLEAR_BOT_STATS;
}

interface AddTransaction {
  type: typeof ADD_TRANSACTION;
  transaction?: Transaction;
}

interface AddTransactionsMass {
  type: typeof ADD_TRANSACTIONS_MASS;
  transactions?: Transaction[];
}

interface ClearTransactions {
  type: typeof CLEAR_TRANSACTIONS;
}

interface AddBalance {
  type: typeof ADD_BALANCE;
  balance?: StoreBalance;
}

interface ClearBalance {
  type: typeof CLEAR_BALANCE;
}

interface AddDeals {
  type: typeof ADD_DEALS;
  deals?: DCADeals;
}

interface AddDealStats {
  type: typeof ADD_DEAL_STATS;
  dealStats?: ProfitLossStats;
}

interface ClearDealStats {
  type: typeof CLEAR_DEAL_STATS;
}

interface AddMinigrids {
  type: typeof ADD_MINIGRIDS;
  minigrids?: ComboMinigrid;
}

interface AddMinigridsMass {
  type: typeof ADD_MINIGRIDS_MASS;
  minigrids?: ComboMinigrid[];
}

interface ClearMinigrids {
  type: typeof CLEAR_MINIGRIDS;
}

interface AddDealsMass {
  type: typeof ADD_DEALS_MASS;
  deals?: DCADeals[];
}

interface ClearDeals {
  type: typeof CLEAR_DEALS;
}

interface AddBotMessage {
  type: typeof ADD_BOT_MESSAGE;
  message?: MessageSocket;
}

interface AddBotMassMessage {
  type: typeof ADD_MASS_BOT_MESSAGE;
  message?: MessageSocket[];
}

interface ClearBotMessage {
  type: typeof CLEAR_BOT_MESSAGE;
}
interface AddBotSettings {
  type: typeof ADD_BOT_SETTINGS;
  settings?: Partial<Bot>;
}

interface AddDCABotSettings {
  type: typeof ADD_DCA_BOT_SETTINGS;
  settings?: Partial<DCABot>;
}

interface AddComboBotSettings {
  type: typeof ADD_COMBO_BOT_SETTINGS;
  settings?: Partial<DCABot>;
}

interface AddHedgeComboBotSettings {
  type: typeof ADD_HEDGE_COMBO_BOT_SETTINGS;
  settings?: PartialHedge;
}

interface AddHedgeDCABotSettings {
  type: typeof ADD_HEDGE_DCA_BOT_SETTINGS;
  settings?: PartialHedge;
}

interface AddActiveDeal {
  type: typeof ADD_ACTIVE_DEAL;
  data?: ActiveDealState;
}

interface ClearBotSettings {
  type: typeof CLEAR_BOT_SETTINGS;
}

interface ClearDCABotSettings {
  type: typeof CLEAR_DCA_BOT_SETTINGS;
}

interface ClearComboBotSettings {
  type: typeof CLEAR_COMBO_BOT_SETTINGS;
}

interface ClearHedgeComboBotSettings {
  type: typeof CLEAR_HEDGE_COMBO_BOT_SETTINGS;
}

interface ClearHedgeDCABotSettings {
  type: typeof CLEAR_HEDGE_DCA_BOT_SETTINGS;
}
interface ClearActiveDeal {
  type: typeof CLEAR_ACTIVE_DEAL;
}

export type StoreBalance = {
  asset: string;
  free: string;
  locked: string;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  paperContext: boolean;
  id: string;
}[];

export type MessageSocket = {
  _id: string;
  type: 'error' | 'success' | 'info' | 'warning';
  message: string;
  time: number;
  botId: string;
  userId: string;
  botName?: string;
  botType?: BotTypesEnum;
  terminal?: boolean;
  paperContext?: boolean;
  symbol?: string;
  exchange?: string;
};

export type MessageState = Message[] | null;

export type SocketState = {
  active: boolean;
};

export type ConnectionState = {
  active: boolean;
  lock?: boolean;
};

export type StoreState = {
  token: TokenState;
  user: UserState;
  message: MessageState;
  orders: OrdersState;
  transactions: TransactionsState;
  botMessages: BotMessageState;
  botSettings: BotSettingsState;
  botDCASettings: BotDCASettingsState;
  botComboSettings: BotComboSettingsState;
  hedgeBotComboSettings: HedgeBotSettingsState;
  hedgeBotDCASettings: HedgeBotSettingsState;
  deals: DealsState;
  minigrids: MinigridsState;
  dealStats: DealStatsState;
  socket: SocketState;
  balance: StoreBalance;
  connection: ConnectionState;
  botStats: BotStatsState;
  activeDeal: ActiveDealState;
  variables: GlobalVariablesState;
};

export type Message = {
  id?: string;
  type: 'error' | 'success' | 'info' | 'warning';
  message: string | React.ReactNode;
  origMessage?: string;
  page?: string;
  subtype?: string;
  permanent?: boolean;
  textVersion?: string;
};

export interface AddMessage {
  type: typeof ADD_MESSAGE;
  message: Message;
}

export interface AddSocketStatus {
  type: typeof ADD_STATUS;
  active?: boolean;
}

export interface AddConnectionStatus {
  type: typeof ADD_CONNECTION;
  active?: boolean;
}

interface SliceMessage {
  type: typeof SLICE_MESSAGE;
  id?: string;
}

interface ClearMessage {
  type: typeof CLEAR_MESSAGE;
}

export type GridType = 'geometric' | 'arithmetic';

export type TpSlCondition = 'valueChanged' | 'priceReached';

export type TpSlAction = 'stop' | 'stopAndSell';

export type Settings = {
  pair: string;
  name: string;
  topPrice: string;
  lowPrice: string;
  levels: string;
  gridStep: string;
  budget: string;
  ordersInAdvance?: string;
  useOrderInAdvance: boolean;
  prioritize: 'gridStep' | 'level';
  profitCurrency: Currency;
  orderFixedIn: Currency;
  sellDisplacement: string;
  gridType: GridType;
  tpSl?: boolean;
  tpSlCondition?: TpSlCondition;
  tpSlAction?: TpSlAction;
  tpSlLimit?: boolean;
  sl?: boolean;
  slCondition?: TpSlCondition;
  slAction?: TpSlAction;
  slLimit?: boolean;
  tpPerc?: string;
  slPerc?: string;
  tpTopPrice?: string;
  slLowPrice?: string;
  updatedBudget?: boolean;
  startPrice?: string;
  useStartPrice?: boolean;
  marginType?: BotMarginTypeEnum;
  leverage?: number;
  futures?: boolean;
  coinm?: boolean;
  newProfit?: boolean;
  strategy?: StrategyEnum;
  futuresStrategy?: FuturesStrategyEnum;
  feeOrder?: boolean;
};

export enum FuturesStrategyEnum {
  long = 'LONG',
  short = 'SHORT',
  neutral = 'NEUTRAL',
}

export enum StrategyEnum {
  long = 'LONG',
  short = 'SHORT',
}

export enum CloseGRIDTypeEnum {
  cancel = 'cancel',
  closeByLimit = 'closeByLimit',
  closeByMarket = 'closeByMarket',
}

export enum CloseTypeEnum {
  cancelAll = 'cancelAll',
  cancelExceptPartiallyFilled = 'cancelExceptPartiallyFilled',
  cancelAndSellByLimit = 'cancelAndSellByLimit',
  cancelAndSellByMarket = 'cancelAndSellByMarket',
}

export enum CloseDCATypeEnum {
  leave = 'leave',
  cancel = 'cancel',
  closeByLimit = 'closeByLimit',
  closeByMarket = 'closeByMarket',
}

//TODO: install github:Gainium/backtester
export type BuyAndHoldEquity = {
  value: number;
  time: number;
};

//TODO: install github:Gainium/backtester
export type IndicatorsEvents = {
  type: IndicatorAction;
  time: number;
  side: BotOrderSideEnum;
  price: number;
  symbol: string;
};

//TODO: install github:Gainium/backtester
export type PreparedTransaction = {
  updateTime: number;
  side: BotOrderSideEnum;
  amountBaseBuy: string;
  amountQuoteBuy: string;
  amountBaseSell: string;
  amountQuoteSell: string;
  priceBuy: string;
  priceSell: string;
  profit: string;
  profitUsd: number;
  baseAsset: string;
  quoteAsset: string;
  profitAsset: string;
  index: number;
  _id: string;
};

//TODO: install github:Gainium/backtester
export type PreparedMinigrid = {
  id: string;
  status: 'open' | 'close';
  initialPrice: number;
  lastPrice: number;
  profit: {
    total: number;
    totalUsd: number;
  };
  avgPrice: number;
  createTime: number;
  updateTime: number;
  closeTime?: number;
  transactions: {
    buy: number;
    sell: number;
  };
  settings: {
    profitCurrency: Currency;
  };
};

//TODO: install github:Gainium/backtester
export type PreparedGrid = {
  price: number;
  side: BotOrderSideEnum;
  id: string;
  filledTime?: number;
  startTime?: number;
  dealId?: string;
  /** Order origin — `DCAOrderTypeEnum.grid` marks a combo minigrid order. */
  type?: DCAOrderTypeEnum;
  /** Ties a grid order to its `mingrids[]` entry. */
  minigridId?: string;
};

//TODO: install github:Gainium/backtester
export type PreparedDeal = {
  symbol: Symbols;
  transactions: PreparedTransaction[];
  transactionsCount?: {
    buy: number;
    sell: number;
  };
  mingrids: PreparedMinigrid[];
  id: string;
  filledOrders: PreparedGrid[];
  ordersHistory: (PreparedGrid & {
    avgLine?: boolean;
  })[];
  status: 'open' | 'closed';
  startTime: number;
  closedTime?: number;
  profit: {
    total: number;
    totalUsd: number;
    perc: number;
  };
  usage: {
    current: Balance;
    max: Balance;
  };
  levels: {
    all: number;
    complete: number;
    max: number;
  };
  duration: number;
  splitDuration: SplitTime;
  number?: number;
  avgPrice: number;
  startPrice: number;
  liquidationPrice?: number;
  closePrice?: number;
  volume: number;
  equity: number;
  equityInAsset: {
    base: number;
    quote: number;
  };
};

//TODO: install github:Gainium/backtester
export type SymbolStatsProfit = {
  total: number;
  totalUsd: number;
  perc: number;
};

//TODO: install github:Gainium/backtester
export type SymbolStats = {
  pair: string;
  deals: {
    profit: number;
    loss: number;
    open: number;
  };
  netProfit: SymbolStatsProfit;
  dailyReturn: SymbolStatsProfit;
  profitAsset: string;
  winRate: number;
  profitFactor: string;
  maxDealDuration: SplitTime;
  avgDealDuration: SplitTime;
};

//TODO: install github:Gainium/backtester
export type PeriodicStats = {
  period: string;
  startTime: number;
  netResult: number;
  drawdown: number;
  runup: number;
  deals: {
    profit: number;
    loss: number;
  };
};

//TODO: install github:Gainium/backtester
export type DCABacktestingResult = {
  // pair: string
  portfolio?: { x: number; y: number }[];
  buyAndHoldEquity?: BuyAndHoldEquity[];
  indicatorsEvents?: IndicatorsEvents[];
  deals: PreparedDeal[];
  profits?: Profit[];
  noData?: boolean;
  maxLeverage?: number;
  financial: {
    netProfitTotal: number;
    netProfitTotalUsd: number;
    netProfitTotalPerc: number;
    grossProfit: number;
    grossProfitUsd: number;
    grossProfitPerc: number;
    grossLoss: number;
    grossLossUsd: number;
    grossLossPerc: number;
    avgGrossProfit: number;
    avgGrossProfitUsd: number;
    avgGrossProfitPerc: number;
    avgGrossLoss: number;
    avgGrossLossUsd: number;
    avgGrossLossPerc: number;
    avgNetProfit: number;
    avgNetProfitUsd: number;
    avgNetProfitPerc: number;
    avgNetDaily: number;
    avgNetDailyUsd: number;
    avgNetDailyPerc: number;
    unrealizedPnL?: number;
    unrealizedPnLUsd?: number;
    unrealizedPnLPerc?: number;
    maxDealProfit: number;
    maxDealLoss: number;
    maxDealProfitUsd: number;
    maxDealProfitPerc: number;
    maxDealLossUsd: number;
    maxDealLossPerc: number;
    maxRunUp: number;
    maxRunUpUsd: number;
    maxRunUpPerc: number;
    maxDrawDown: number;
    maxDrawDownUsd: number;
    maxDrawDownPerc: number;
    maxDrawDownEquityUsd?: number;
    maxDrawDownEquityPerc?: number;
    initialBalanceUsd: number;
    stDevWinningTrade?: number;
    stDevLosingTrade?: number;
    stDownDevLosingTrade?: number;
    annualizedReturn?: number;
  };
  duration: {
    avgDealDuration: number;
    avgSplitDealDuration: SplitTime;
    firstDataTime: number;
    lastDataTime: number;
    loadingDataTime: number;
    processingDataTime: number;
    botWorkingTime: SplitTime;
    maxDealDuration: SplitTime;
    maxDealDurationTime: number;
    periodName?: string;
    botWorkingTimeNumber: number;
    avgWinningTrade?: number;
    maxWinningTrade?: number;
    avgLosingTrade?: number;
    maxLosingTrade?: number;
  };
  usage: {
    maxTheoreticalUsage: number;
    maxRealUsage: number;
    avgRealUsage: number;
  };
  numerical: {
    all: number;
    profit: number;
    loss: number;
    open: number;
    closed: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    maxDCATriggered: number;
    avgDCATriggered: number;
    dealsPerDay: number;
    coveredPriceDeviation: number;
    actualPriceDeviation: number;
    liquidationEvents?: number;
    confidenceGrade?: string;
    dealsForConfidenceGrade?: number;
    priceDeviation?: number;
  };
  ratios: {
    profitFactor: number;
    profitByPeriod: number[];
    buyAndHold: {
      value: number;
      valueUsd: number;
      perc: number;
    };
    periodRatio: number;
    sharpe: number;
    sortino: number;
    cwr: number;
  };
  interval: ExchangeIntervals;
  quoteRate: number;
  precision?: number;
  _id?: string;
  shared?: boolean;
  multi?: boolean;
  multiPairs?: number;
  symbolStats?: SymbolStats[];
  periodicStats?: PeriodicStats[];
  messages?: string[];
};

export type DCABacktestingResultShort = Omit<DCABacktestingResult, 'deals'> & {
  deals?: DCABacktestingResult['deals'];
};

export type DCABacktestingResultHistory = DCABacktestingResultShort & {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  _id: string;
  time: number;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  settings: DCABotSettings;
  savePermanent: boolean;
  serverSide?: boolean;
  shareId?: string;
  userId: string;
  shared?: boolean;
  author?: string;
  sent?: boolean;
  config?: BacktestingSettings;
  note?: string;
};

//TODO: install github:Gainium/backtester
export type GridBacktestingResult = {
  buyAndHoldEquity?: BuyAndHoldEquity[];
  values: ValueChangeHistory[];
  firstUsdRate: number;
  lastUsdRate: number;
  transaction: PreparedTransaction[];
  filledOrders?: Grid[];
  orders: (PreparedGrid & { qty: number })[];
  ordersHistory?: (PreparedGrid & {
    avgLine?: boolean;
  })[];
  noData?: boolean;
  financial: {
    freeProfitTotal: number;
    freeProfitTotalUsd: number;
    profitTotal: string;
    profitTotalUsd: number;
    profitTotalPerc: number;
    budgetUsd: number;
    avgNetDaily: string;
    avgNetDailyUsd: number;
    avgNetDailyPerc: number;
    annualizedReturn?: number;
    avgTransactionProfit: string;
    avgTransactionProfitUsd: number;
    avgTransactionProfitPerc: number;
    initialBalances: string;
    initialBalancesByAsset: {
      base: string;
      quote: string;
    };
    initialBalancesUsd: number;
    currentBalances: string;
    currentBalancesByAsset: {
      base: string;
      quote: string;
    };
    currentBalancesUsd: number;
    valueChange: string;
    valueChangeUsd: number;
    valueChangePerc: number;
    startPrice: string;
    lastPrice: string;
    breakevenPrice: number;
  };
  duration: {
    firstDataTime: number;
    lastDataTime: number;
    loadingDataTime: number;
    processingDataTime: number;
    botWorkingTime: SplitTime;
    periodName?: string;
    botWorkingTimeNumber: number;
  };
  numerical: {
    all: number;
    transactionsPerDay: number;
    buy: number;
    sell: number;
  };
  ratios: {
    profitByPeriod: number[];
    buyAndHold: {
      value: number;
      valueUsd: number;
      perc: number;
    };
    periodRatio: number;
    sharpe: number;
    sortino: number;
  };
  interval?: ExchangeIntervals;
  quoteRate: number;
  precision?: number;
  _id?: string;
  shared?: boolean;
  position: {
    count: number;
    qty: number;
    price: number;
    side: string;
    pnl: {
      value: number;
      perc: number;
    };
  };
};

export type GRIDBacktestingResultShort = Omit<
  GridBacktestingResult,
  'orders' | 'transaction'
> & {
  orders?: GridBacktestingResult['orders'];
  transaction?: GridBacktestingResult['transaction'];
};

export type GRIDBacktestingResultHistory = GRIDBacktestingResultShort & {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  _id: string;
  time: number;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  settings: Settings;
  savePermanent: boolean;
  serverSide?: boolean;
  shareId?: string;
  userId: string;
  shared?: boolean;
  value?: number;
  author?: string;
  sent?: boolean;
  config?: BacktestingSettings;
  note?: string;
};

export type UserNotifications = {
  profit: boolean;
  payment: boolean;
  subscription: boolean;
  subscriptionExpiration: boolean;
  affiliate: boolean;
};

export type SurveyResult = {
  surveyId: string;
  answers: {
    question: string;
    answer: string;
  }[];
  close?: boolean;
  closeAndDontAsk?: boolean;
  complete: boolean;
};

//TODO: install github:Gainium/backtester
export type BacktestingInput<T> = {
  exchange: ExchangeEnum;
  symbols: Symbols[];
  interval?: ExchangeIntervals;
  balances?: Asset[] | null;
  from?: number | undefined;
  to?: number | undefined;
  slippage?: number | undefined;
  userFee: number;
  prices: Prices;
  settings: T;
  combo?: boolean | undefined;
  trades?: boolean | undefined;
  multi?: boolean | undefined;
  timezone?: string | null | undefined;
  fullResult?: boolean | undefined;
  useFile?: boolean | undefined;
};

//TODO: install github:Gainium/backtester
export enum EdgeBacktestEnum {
  random = 'random',
  randomMulti = 'randomMulti',
}

//TODO: install github:Gainium/backtester
export type DCABacktestingInput = BacktestingInput<DCABotSettings> & {
  edge?: EdgeBacktestEnum;
  previousData?: DCABacktestingResult;
};

//TODO: install github:Gainium/backtester
export type GRIDBacktestingInput = BacktestingInput<Settings>;

export type ServerSideBacktestPayload =
  | {
      type: BotTypesEnum.dca | BotTypesEnum.combo;
      data: Omit<DCABacktestingInput, 'prices' | 'symbols' | 'exchange'> & {
        exchange: ExchangeEnum;
        exchangeUUID: string;
      };
      config: BacktestingSettings & { periodName?: string };
    }
  | {
      type: BotTypesEnum.grid;
      data: Omit<GRIDBacktestingInput, 'prices' | 'symbols' | 'exchange'> & {
        exchange: ExchangeEnum;
        exchangeUUID: string;
      };
      config: BacktestingSettings & { periodName?: string };
    };

export enum AlertProvider {
  telegram = 'telegram',
  email = 'email',
}

export enum AlertType {
  dealStarted = 'dealStarted',
  dealClosed = 'dealClosed',
  dealPartiallyClosed = 'dealPartiallyClosed',
  botError = 'botError',
  botWarning = 'botWarning',
  dailyProfit = 'dailyProfit',
  gridClose = 'gridClose',
  botController = 'botController',
  ssb = 'ssb',
  dca80 = 'dca80',
  dca100 = 'dca100',
  priceOutOfRange = 'priceOutOfRange',
}

export type UserAlerts = {
  type: AlertType;
  providers: AlertProvider[];
}[];

export type ChangeAlertsInput = {
  data: UserAlerts;
};

export enum ActionsEnum {
  useBalance = 'useBalance',
  buyForAll = 'buyForAll',
  buyDiff = 'buyDiff',
  sellForAll = 'sellForAll',
  sellDiff = 'sellDiff',
  noAction = 'noAction',
  useOppositeBalance = 'useOppositeBalance',
}

export type SubscriptionPlans =
  | 'pro'
  | 'advanced'
  | 'free'
  | 'basic'
  | 'trial'
  | 'enterprise'
  | 'affiliate'
  // New subscription plans
  | 'mini'
  | 'edge'
  | 'prime'
  | 'elite'
  | 'master'
  | 'legend'
  | 'vip1'
  | 'vip2'
  | 'vip3'
  | 'vip4';
export type SubscriptionType = 'yearly' | 'monthly';

export type GridSortDirection = 'asc' | 'desc' | null | undefined;

export interface GridSortItem {
  /**
   * The column field identifier.
   */
  field: string;
  /**
   * The direction of the column that the grid should sort.
   */
  sort: GridSortDirection;
}
/**
 * The model used for sorting the grid.
 */
export type GridSortModel = GridSortItem[];

export interface GridFilterItem {
  /**
   * Must be unique.
   * Only useful when the model contains several items.
   */
  id?: number | string;
  /**
   * The column from which we want to filter the rows.
   */
  field: string;
  /**
   * The filtering value.
   * The operator filtering function will decide for each row if the row values is correct compared to this value.
   */
  value?: any;
  /**
   * The name of the operator we want to apply.
   */
  operator: string;
}
enum GridLogicOperator {
  And = 'and',
  Or = 'or',
}

export interface GridFilterModel {
  /**
   * @default []
   */
  items: GridFilterItem[];
  /**
   * Legacy MUI key the backend's `mapDataGridOptionsToMongoOptions`
   * actually reads to combine filter items with `$or` (vs the default
   * `$and`). Kept alongside `logicOperator` for backend compatibility.
   */
  linkOperator?: 'and' | 'or';
  /**
   * - `GridLogicOperator.And`: the row must pass all the filter items.
   * - `GridLogicOperator.Or`: the row must pass at least on filter item.
   * @default `GridLogicOperator.Or`
   */
  logicOperator?: GridLogicOperator;
  /**
   * values used to quick filter rows
   * @default `[]`
   */
  quickFilterValues?: any[];
  /**
   * - `GridLogicOperator.And`: the row must pass all the values.
   * - `GridLogicOperator.Or`: the row must pass at least one value.
   * @default `GridLogicOperator.And`
   */
  quickFilterLogicOperator?: GridLogicOperator;
  /**
   * If `true`, the quick filter will skip cell values from hidden columns.
   * @default false
   */
  quickFilterExcludeHiddenColumns?: boolean;
}

export enum OrderTypeEnum {
  limit = 'LIMIT',
  market = 'MARKET',
}

export enum StartConditionEnum {
  asap = 'ASAP',
  manual = 'Manual',
  tradingviewSignals = 'TradingviewSignals',
  timer = 'Timer',
  ti = 'TechnicalIndicators',
}

export type DCASettings = {
  pair: string;
  name: string;
  strategy: StrategyEnum;
  profitCurrency: Currency;
  baseOrderSize: string;
  startOrderType: OrderTypeEnum;
  startCondition: StartConditionEnum;
  tpPerc: string;
  orderFixedIn: Currency;
  orderSize: string;
  step: string;
  ordersCount: number;
  activeOrdersCount: number;
  volumeScale: string;
  stepScale: string;
  useTp: boolean;
  useSmartOrders: boolean;
};
export type DCASettingsInputErrors = {
  [x in keyof (DCABotSettings & {
    indicatorsClose: unknown;
    indicatorsDca: unknown;
    indicatorsCloseSL: unknown;
    stopIndicators: unknown;
    startIndicators: unknown;
    maxOrders?: unknown;
  })]: {
    status: boolean;
    msg: string;
  };
};

export type SettingsInputErrors = {
  [x in keyof Settings]: {
    status: boolean;
    msg: string;
  };
};

export type Symbols = {
  pair: string;
  exchange: ExchangeEnum;
  baseAsset: {
    minAmount: number;
    maxAmount: number;
    step: number;
    name: string;
  };
  quoteAsset: {
    minAmount: number;
    name: string;
  };
  maxOrders: number;
  priceAssetPrecision: number;
  crossAvailable?: boolean;
};

export enum BotOrderSideEnum {
  buy = 'BUY',
  sell = 'SELL',
}

export type Grid = {
  price: number;
  side: BotOrderSideEnum;
  qty: number;
  id: string;
};

export type WorkingShift = {
  start: number;
  end?: number;
};
type Balance = {
  base: number;
  quote: number;
};
type Level = {
  buy: number;
  sell: number;
};
export interface BaseSettings {
  name: string;
  profitCurrency: Currency;
  orderFixedIn: Currency;
}

export interface MainBot<T = BaseSettings> {
  notEnoughBalance?: {
    thresholdPassed?: boolean;
  };
  userId: string;
  status: BotStatus;
  statusReason?: string;
  /** Cold-store flag: true once the bot's history moved to ClickHouse (design
   *  phase 3). Informational only — archiving is reversible (un-archive
   *  rehydrates). Only fetched when the cold-store UX is live (see
   *  COLD_ARCHIVED_SELECTION in the bot fragments). */
  coldArchived?: boolean;
  showErrorWarning?: 'error' | 'warning' | 'none';
  exchange: ExchangeEnum;
  exchangeUUID: string;
  settings: T;
  workingShift: WorkingShift[];
  profitByAssets?: { asset: string; total: number; totalUsd: number }[];
  profit: {
    total: number;
    totalUsd: number;
    freeTotal: number;
    freeTotalUsd: number;
    pureBase?: number;
    pureQuote?: number;
  };
  profitToday: {
    start: number;
    end: number;
    totalToday: number;
    totalTodayUsd: number;
  };
  created: string;
  updated: string;
  _id: string;
  process: { step: number; total: number };
  uuid: string;
  type?: BotTypesEnum;
  usage?: {
    current: Balance;
    max: Balance;
  };
  exchangeUnassigned?: boolean | null;
  paperContext?: boolean;
  parentBotId?: string;
  vars?: BotVars | null;
  shareId?: string;
  share?: boolean;
  cost?: number;
}

export enum IndicatorStartConditionEnum {
  cd = 'cd',
  cu = 'cu',
  gt = 'gt',
  lt = 'lt',
}
export enum rsiValueEnum {
  k = 'k',
  d = 'd',
}
export enum rsiValue2Enum {
  k = 'k',
  d = 'd',
  custom = 'custom',
}

export enum rsiValue2Enum2 {
  k = 'k',
  custom = 'custom',
}
export enum BBCrossingEnum {
  middle = 'middle',
  upper = 'upper',
  lower = 'lower',
}
export enum SRCrossingEnum {
  support = 'support',
  resistance = 'resistance',
}
export enum IndicatorAction {
  startDeal = 'startDeal',
  closeDeal = 'closeDeal',
  startDca = 'startDca',
  stopBot = 'stopBot',
  riskReward = 'riskReward',
  startBot = 'startBot',
}
export enum IndicatorSection {
  tp = 'tp',
  sl = 'sl',
  dca = 'dca',
  controller = 'controller',
}
export enum IndicatorEnum {
  rsi = 'RSI',
  adx = 'ADX',
  bbw = 'BBW',
  macd = 'MACD',
  tv = 'TV',
  ma = 'MA',
  bb = 'BB',
  stoch = 'Stoch',
  stochRSI = 'StochRSI',
  sr = 'SR',
  qfl = 'QFL',
  mfi = 'MFI',
  psar = 'PSAR',
  vo = 'VO',
  cci = 'CCI',
  ao = 'AO',
  wr = 'WR',
  uo = 'UO',
  mom = 'MOM',
  bbwp = 'BBWP',
  ecd = 'ECD',
  xo = 'XO',
  mar = 'MAR',
  bbpb = 'BBPB',
  div = 'DIV',
  st = 'ST',
  pc = 'PC',
  atr = 'ATR',
  pp = 'PP',
  adr = 'ADR',
  ath = 'ATH',
  kc = 'KC',
  kcpb = 'KCPB',
  unpnl = 'UNPNL',
  dc = 'DC',
  obfvg = 'OBFVG',
  session = 'SESSION',
  lw = 'LW',
}

export enum SessionRuleEnum {
  in = 'in',
  out = 'out',
}

export enum LWValueEnum {
  top = 'top',
  bottom = 'bottom',
  any = 'any',
}

export type SettingsIndicators = {
  type: IndicatorEnum;
  indicatorLength: number;
  indicatorValue: string;
  indicatorCondition: IndicatorStartConditionEnum;
  groupId: string;
  uuid: string;
  indicatorInterval: ExchangeIntervals;
  signal?: TradingviewAnalysisSignalEnum;
  condition?: TradingviewAnalysisConditionEnum;
  rsiValue?: rsiValueEnum;
  rsiValue2?: rsiValue2Enum;
  rsiValue2a?: rsiValue2Enum2;
  valueInsteadof?: number;
  checkLevel?: number;
  maType?: MAEnum;
  maCrossingValue?: MAEnum;
  maCrossingLength?: number;
  maCrossingInterval?: ExchangeIntervals;
  maUUID?: string;
  xoUUID?: string;
  bbCrossingValue?: BBCrossingEnum;
  stochSmoothK?: number;
  stochSmoothD?: number;
  stochUpper?: string;
  stochLower?: string;
  stochRSI?: number;
  srCrossingValue?: SRCrossingEnum;
  leftBars?: number;
  rightBars?: number;
  basePeriods?: number;
  pumpPeriods?: number;
  pump?: number;
  interval?: number;
  baseCrack?: number;
  indicatorAction: IndicatorAction;
  section?: IndicatorSection | undefined;
  psarStart?: number;
  psarInc?: number;
  psarMax?: number;
  stochRange?: StochRangeEnum;
  minPercFromLast?: string;
  orderSize?: string;
  keepConditionBars?: string;
  voShort?: number;
  voLong?: number;
  uoFast?: number;
  uoMiddle?: number;
  uoSlow?: number;
  momSource?: string;
  bbwpLookback?: number;
  ecdTrigger?: ECDTriggerEnum;
  xOscillator1?:
    | IndicatorEnum.rsi
    | IndicatorEnum.cci
    | IndicatorEnum.mfi
    | IndicatorEnum.vo;
  xOscillator2?:
    | IndicatorEnum.rsi
    | IndicatorEnum.cci
    | IndicatorEnum.mfi
    | IndicatorEnum.vo;
  xOscillator2length?: number;
  xOscillator2Interval?: ExchangeIntervals;
  xOscillator2voLong?: number;
  xOscillator2voShort?: number;
  percentile?: boolean;
  percentileLookback?: number;
  percentilePercentage?: number;
  mar1length?: number;
  mar1type?: MAEnum;
  mar2length?: number;
  mar2type?: MAEnum;
  bbwMult?: number;
  bbwMa?: MAEnum;
  bbwMaLength?: number;
  macdFast?: number;
  macdSlow?: number;
  macdMaSource?: MAEnum;
  macdMaSignal?: MAEnum;
  divOscillators?: DivergenceOscillators[];
  divType?: DivTypeEnum;
  divMinCount?: number;
  trendFilter?: boolean;
  trendFilterLookback?: number;
  trendFilterType?: TrendFilterOperatorEnum;
  trendFilterValue?: number;
  factor?: number;
  atrLength?: number;
  stCondition?: STConditionEnum;
  pcUp?: string;
  pcDown?: string;
  pcCondition?: PCConditionEnum;
  pcValue?: string;
  ppHighLeft?: number;
  ppHighRight?: number;
  ppLowLeft?: number;
  ppLowRight?: number;
  ppMult?: number;
  ppValue?: ppValueEnum;
  ppType?: ppValueTypeEnum;
  riskAtrMult?: string;
  dynamicArFactor?: string;
  athLookback?: number;
  kcMa?: MAEnum;
  kcRange?: RangeType;
  kcRangeLength?: number;
  unpnlValue?: number;
  unpnlCondition?: IndicatorStartConditionEnum;
  dcValue?: DCValueEnum;
  obfvgValue?: OBFVGValueEnum;
  obfvgRef?: OBFVGRefEnum;
  sessionDays?: number[];
  sessionRule?: SessionRuleEnum;
  lwThreshold?: string;
  lwMaxDuration?: string;
  lwValue?: LWValueEnum;
  lwCondition?: LWConditionEnum;
};

export enum LWConditionEnum {
  onStart = 'onStart',
  during = 'during',
}

export enum OBFVGValueEnum {
  bullish = 'bullish',
  bearish = 'bearish',
  any = 'any',
}

export enum OBFVGRefEnum {
  high = 'high',
  low = 'low',
  middle = 'middle',
}

export enum DCValueEnum {
  basis = 'basis',
  lower = 'lower',
  upper = 'upper',
}

export enum STConditionEnum {
  up = 'up',
  down = 'down',
  upToDown = 'upToDown',
  downToUp = 'downToUp',
}

export enum TrendFilterOperatorEnum {
  lower = 'lower',
  higher = 'higher',
  between = 'between',
}

export enum StochRangeEnum {
  upper = 'upper',
  lower = 'lower',
  both = 'both',
  none = 'none',
}

export enum OrderSizeTypeEnum {
  base = 'base',
  quote = 'quote',
  percTotal = 'percTotal',
  percFree = 'percFree',
  usd = 'usd',
}

export enum AddFundsTypeEnum {
  fixed = 'fixed',
  perc = 'perc',
}

export enum CloseConditionEnum {
  tp = 'tp',
  techInd = 'techInd',
  manual = 'manual',
  webhook = 'webhook',
  dynamicAr = 'dynamicAr',
}

export enum TerminalDealMainTypeEnum {
  simple = 'simple',
  smart = 'smart',
  import = 'import',
}

export enum TerminalDealTypeEnum {
  simple = 'simple',
  smart = 'smart',
  import = 'import',
}

export type MultiTP = {
  _id?: string;
  target: string;
  amount: string;
  uuid: string;
  fixed?: string;
};

export enum DCAConditionEnum {
  percentage = 'percentage',
  indicators = 'indicators',
  custom = 'custom',
  dynamicAr = 'dynamicAr',
}

export type DCACustom = {
  _id?: string;
  step: string;
  size: string;
  uuid: string;
  fixed?: string; // Fixed price for terminal mode
};

export enum CooldownOptionsEnum {
  symbol = 'symbol',
  bot = 'bot',
}

export enum BaseSlOnEnum {
  start = 'start',
  avg = 'avg',
}

export enum DCAVolumeType {
  scale = 'scale',
  change = 'change',
}

export enum DcaVolumeRequiredChangeRef {
  tp = 'tp',
  avg = 'avg',
}

export type SettingsIndicatorGroup = {
  id: string;
  logic: IndicatorsLogicEnum;
  action: IndicatorAction;
  section?: IndicatorSection;
};

export interface DCABotSettings extends BaseSettings {
  minimumDeviation?: string;
  skipBalanceCheck?: boolean;
  dcaCondition?: DCAConditionEnum | undefined;
  dcaVolumeBaseOn?: DCAVolumeType | undefined;
  dcaVolumeRequiredChange?: string;
  dcaVolumeRequiredChangeRef?: DcaVolumeRequiredChangeRef;
  dcaVolumeMaxValue?: string;
  dcaByMarket?: boolean;
  dcaCustom?: DCACustom[] | undefined;
  strategy: StrategyEnum;
  baseOrderSize: string;
  baseOrderPrice?: string | undefined;
  startOrderType: OrderTypeEnum;
  useLimitPrice?: boolean;
  startCondition: StartConditionEnum;
  tpPerc: string;
  slPerc: string;
  baseSlOn?: BaseSlOnEnum;
  orderSize: string;
  step: string;
  ordersCount: string;
  activeOrdersCount: string;
  volumeScale: string;
  stepScale: string;
  useTp: boolean;
  useSl: boolean;
  useSmartOrders: boolean;
  minOpenDeal?: string | undefined;
  maxOpenDeal?: string | undefined;
  useDca: boolean;
  hodlDay: string;
  hodlAt: string;
  hodlHourly?: boolean;
  hodlNextBuy: number;
  maxNumberOfOpenDeals?: string | undefined;
  indicators: SettingsIndicators[];
  indicatorGroups: SettingsIndicatorGroup[];
  type?: DCATypeEnum | undefined;
  orderSizeType: OrderSizeTypeEnum;
  limitTimeout?: string;
  useLimitTimeout?: boolean;
  notUseLimitReposition?: boolean;
  cooldownAfterDealStart?: boolean | undefined;
  cooldownAfterDealStartUnits?: CooldownUnits | undefined;
  cooldownAfterDealStartInterval?: number | undefined;
  cooldownAfterDealStartOption?: CooldownOptionsEnum | undefined;
  cooldownAfterDealStop?: boolean | undefined;
  cooldownAfterDealStopUnits?: CooldownUnits | undefined;
  cooldownAfterDealStopInterval?: number | undefined;
  cooldownAfterDealStopOption?: CooldownOptionsEnum | undefined;
  moveSL?: boolean;
  moveSLTrigger?: string;
  moveSLValue?: string;
  moveSLForAll?: boolean;
  trailingSl?: boolean;
  //useExperimental?: boolean;
  trailingTp?: boolean | undefined;
  trailingTpPerc?: string | undefined;
  maxDealsPerPair?: string | undefined;
  useCloseAfterX?: boolean | undefined;
  closeAfterX?: string | undefined;
  pair: string[];
  useMulti?: boolean | undefined;
  pairPrioritization?: PairPrioritizationEnum;
  useCloseAfterXopen?: boolean | undefined;
  closeAfterXopen?: string | undefined;
  useCloseAfterXwin?: boolean | undefined;
  closeAfterXwin?: string | undefined;
  useCloseAfterXloss?: boolean | undefined;
  closeAfterXloss?: string | undefined;
  useCloseAfterXprofit?: boolean | undefined;
  closeAfterXprofitValue?: string | undefined;
  closeAfterXprofitCond?: IndicatorStartConditionEnum | undefined;
  botStart?: BotStartTypeEnum | undefined;
  useBotController?: boolean | undefined;
  stopType?: CloseDCATypeEnum | undefined;
  stopStatus?: BotStatus | undefined;
  dealCloseCondition?: CloseConditionEnum | undefined;
  dealCloseConditionSL?: CloseConditionEnum | undefined;
  useMinTP?: boolean | undefined;
  minTp?: string | undefined;
  closeDealType?: CloseDCATypeEnum;
  terminalDealType?: TerminalDealTypeEnum | undefined;
  useMultiTp?: boolean;
  multiTp?: MultiTP[];
  useMultiSl?: boolean;
  multiSl?: MultiTP[];
  marginType?: BotMarginTypeEnum | undefined;
  leverage?: number | undefined;
  futures?: boolean | undefined;
  coinm?: boolean | undefined;
  importFrom?: string;
  gridLevel?: string;
  useVolumeFilter?: boolean | undefined;
  volumeTop?: string | undefined;
  volumeValue?: VolumeValueEnum | undefined;
  useFixedTPPrices?: boolean;
  useFixedSLPrices?: boolean;
  fixedTpPrice?: string;
  fixedSlPrice?: string;
  baseStep?: string;
  baseGridLevels?: string;
  useActiveMinigrids?: boolean;
  comboActiveMinigrids?: string;
  comboSlLimit?: boolean;
  comboTpLimit?: boolean;
  closeByTimer?: boolean;
  closeByTimerValue?: number;
  closeByTimerUnits?: CooldownUnits;
  useRelativeVolumeFilter?: boolean | undefined;
  relativeVolumeTop?: string | undefined;
  relativeVolumeValue?: VolumeValueEnum | undefined;
  feeOrder?: boolean;
  maxDealsPerHigherTimeframe?: string | undefined;
  useMaxDealsPerHigherTimeframe?: boolean | undefined;
  ignoreStartDeals?: boolean;
  remainderFullAmount?: boolean;
  autoRebalancing?: boolean;
  adaptiveClose?: boolean;
  comboTpBase?: ComboTpBase;
  useStaticPriceFilter?: boolean;
  useCooldown?: boolean;
  useDynamicPriceFilter?: boolean | undefined;
  useVolumeFilterAll?: boolean;
  dynamicPriceFilterDeviation?: string | undefined;
  dynamicPriceFilterOverValue?: string | undefined;
  dynamicPriceFilterUnderValue?: string | undefined;
  dynamicPriceFilterPriceType?: DynamicPriceFilterPriceTypeEnum | undefined;
  dynamicPriceFilterDirection?: DynamicPriceFilterDirectionEnum | undefined;
  useRiskReward?: boolean | undefined;
  riskSlType?: RiskSlTypeEnum | undefined;
  riskSlAmountPerc?: string | undefined;
  riskSlAmountValue?: string | undefined;
  riskUseTpRatio?: boolean | undefined;
  riskTpRatio?: string | undefined;
  riskMaxSl?: string | undefined;
  riskMinSl?: string | undefined;
  comboUseSmartGrids?: boolean;
  comboSmartGridsCount?: string;
  riskMinPositionSize?: string | undefined;
  riskMaxPositionSize?: string | undefined;
  dynamicArLockValue?: boolean;
  scaleDcaType?: ScaleDcaTypeEnum;
  startDealLogic?: IndicatorsLogicEnum;
  stopDealLogic?: IndicatorsLogicEnum;
  stopDealSlLogic?: IndicatorsLogicEnum;
  stopBotLogic?: IndicatorsLogicEnum;
  useRiskReduction?: boolean;
  riskReductionValue?: string;
  useReinvest?: boolean;
  reinvestValue?: string;
  startBotPriceCondition?: IndicatorStartConditionEnum | undefined;
  startBotPriceValue?: string | undefined;
  stopBotPriceCondition?: IndicatorStartConditionEnum | undefined;
  stopBotPriceValue?: string | undefined;
  startBotLogic?: IndicatorsLogicEnum;
  botActualStart?: BotStartTypeEnum | undefined;
  useNoOverlapDeals?: boolean;
  closeOrderType?: OrderTypeEnum;
  rrSlType?: RRSlTypeEnum;
  rrSlFixedValue?: string;
}

export enum RRSlTypeEnum {
  fixed = 'fixed',
  indicator = 'indicator',
}

export enum IndicatorsLogicEnum {
  and = 'and',
  or = 'or',
}

export enum ScaleDcaTypeEnum {
  percentage = 'percentage',
  atr = 'atr',
  adr = 'adr',
}

export enum RiskSlTypeEnum {
  perc = 'perc',
  fixed = 'fixed',
}

export enum DynamicPriceFilterDirectionEnum {
  over = 'over',
  under = 'under',
  overAndUnder = 'overAndUnder',
}

export enum PairPrioritizationEnum {
  alphabetical = 'alphabetical',
  random = 'random',
}

export enum DynamicPriceFilterPriceTypeEnum {
  avg = 'avg',
  entry = 'entry',
}

export enum ComboTpBase {
  full = 'full',
  filled = 'filled',
}

export type TopPreset = {
  id: string;
  type: BotTypesEnum;
  roi: number;
  symbol: string;
  exchange: ExchangeEnum;
};

export enum VolumeValueEnum {
  top25 = 'top25',
  top100 = 'top100',
  top200 = 'top200',
  custom = 'custom',
}

export enum BotMarginTypeEnum {
  inherit = 'inherit',
  cross = 'cross',
  isolated = 'isolated',
}

export const BotMarginTypeMap = {
  [BotMarginTypeEnum.inherit]: 'Default',
  [BotMarginTypeEnum.cross]: 'Cross',
  [BotMarginTypeEnum.isolated]: 'Isolated',
};

export const BotMarginTypeList = [
  BotMarginTypeEnum.isolated,
  BotMarginTypeEnum.cross,
];

export enum BotStartTypeEnum {
  manual = 'manual',
  webhook = 'webhook',
  indicators = 'indicators',
  price = 'price',
}

export interface MultiPairDCABotSettings extends BaseSettings {
  pair: string[];
  strategy: StrategyEnum;
  baseOrderSize: string;
  baseOrderPrice?: string;
  startOrderType: OrderTypeEnum;
  useLimitPrice?: boolean;
  startCondition: StartConditionEnum;
  tpPerc: string;
  slPerc: string;
  orderSize: string;
  step: string;
  ordersCount: string;
  activeOrdersCount: string;
  volumeScale: string;
  stepScale: string;
  useTp: boolean;
  useSl: boolean;
  useSmartOrders: boolean;
  minOpenDeal?: string;
  maxOpenDeal?: string;
  useDca: boolean;
  hodlDay: string;
  hodlAt: string;
  hodlNextBuy: number;
  maxNumberOfOpenDeals?: string;
  indicators: SettingsIndicators[];
  indicatorGroups: SettingsIndicatorGroup[];
  type?: DCATypeEnum;
  orderSizeType: OrderSizeTypeEnum;
  limitTimeout?: string;
  useLimitTimeout?: boolean;
  cooldownAfterDealStart?: boolean;
  cooldownAfterDealStartUnits?: CooldownUnits;
  cooldownAfterDealStartInterval?: number;
  cooldownAfterDealStop?: boolean;
  cooldownAfterDealStopUnits?: CooldownUnits;
  cooldownAfterDealStopInterval?: number;
  moveSL?: boolean;
  moveSLTrigger?: string;
  moveSLValue?: string;
  moveSLForAll?: boolean;
  maxDealsPerPair?: number;
  trailingSl?: boolean;
  trailingTp?: boolean;
  trailingTpPerc?: string;
  useCloseAfterX?: boolean;
  closeAfterX?: string;
  useCloseAfterXopen?: boolean;
  closeAfterXopen?: string;
  useCloseAfterXwin?: boolean;
  closeAfterXwin?: string;
  useCloseAfterXloss?: boolean;
  closeAfterXloss?: string;
  useCloseAfterXprofit?: boolean;
  closeAfterXprofitValue?: string;
  closeAfterXprofitCond?: IndicatorStartConditionEnum;
  botStart?: BotStartTypeEnum;
  useBotController?: boolean;
  stopType?: CloseDCATypeEnum;
}
export enum CooldownUnits {
  seconds = 'seconds',
  minutes = 'minutes',
  hours = 'hours',
  days = 'days',
}

export type Prioritze = 'gridStep' | 'level';
export interface BotSettings extends BaseSettings {
  topPrice: number;
  lowPrice: number;
  levels: number;
  gridStep: number;
  budget: number;
  ordersInAdvance?: number;
  useOrderInAdvance: boolean;
  prioritize: Prioritze;
  sellDisplacement: number;
  gridType: GridType;
  tpSl?: boolean;
  tpSlCondition?: TpSlCondition;
  tpSlAction?: TpSlAction;
  tpSlLimit?: boolean;
  slLimit?: boolean;
  sl?: boolean;
  slCondition?: TpSlCondition;
  slAction?: TpSlAction;
  tpPerc?: number;
  slPerc?: number;
  tpTopPrice?: number;
  slLowPrice?: number;
  updatedBudget?: boolean;
  useStartPrice?: boolean;
  startPrice?: string;
  pair: string;
  marginType?: BotMarginTypeEnum;
  leverage?: number;
  futures?: boolean;
  coinm?: boolean;
  newProfit?: boolean;
  strategy?: StrategyEnum;
  futuresStrategy?: FuturesStrategyEnum;
  feeOrder?: boolean;
  skipBalanceCheck?: boolean;
}
export type Usage = {
  current: Balance;
  max: Balance;
  currentUsd?: number;
  maxUsd?: number;
  relative?: number;
};
export type MultiAssets = {
  base: { key: string; value: number }[];
  quote: { key: string; value: number }[];
};
export type UsdAssetNumber = {
  usd: number;
  asset: number;
};

export type BotStatsSeries = {
  count: number;
  value: UsdAssetNumber;
  minValue: UsdAssetNumber;
  maxValue: UsdAssetNumber;
  perc: number;
};

export type BotStatsBestDay = {
  time: number;
  value: number;
  percentage: number;
};

export type BotStats = {
  numerical: {
    profit: {
      grossProfit: UsdAssetNumber;
      grossProfitPerc: number;
      maxDealProfit: UsdAssetNumber;
      maxDealProfitPerc: number;
      avgDealProfit: UsdAssetNumber;
      avgDealProfitPerc: number;
      maxRunUp: UsdAssetNumber;
      maxRunUpPerc: number;
      maxConsecutiveWins: number;
      standardDeviationOfPositiveReturns: number;
      series: BotStatsSeries;
    };
    loss: {
      grossLoss: UsdAssetNumber;
      grossLossPerc: number;
      maxDealLoss: UsdAssetNumber;
      maxDealLossPerc: number;
      avgDealLoss: UsdAssetNumber;
      avgDealLossPerc: number;
      maxDrawdown: UsdAssetNumber;
      maxDrawdownPerc: number;
      maxEquityDrawdown: UsdAssetNumber;
      maxEquityDrawdownPerc: number;
      maxConsecutiveLosses: number;
      standardDeviationOfNegativeReturns: number;
      standardDeviationOfDownside: number;
      series: BotStatsSeries;
    };
    general: {
      netProfitPerc: number;
      avgDaily: UsdAssetNumber;
      avgDailyPerc: number;
      startBalance: UsdAssetNumber;
      maxDCAOrdersTriggered: number;
      avgDCAOrdersTriggered?: number;
      coveredPriceDeviation: number;
      actualPriceDeviation: number;
      confidenceGrade: string;
      bestDay?: BotStatsBestDay;
      worstDay?: BotStatsBestDay;
    };
    ratios: {
      profitFactor: number;
      sharpeRatio?: number;
      sortinoRatio?: number;
      cwr?: number;
      buyAndHold: {
        result: number;
        perc: number;
        symbol: string;
        startPrice: number;
      };
    };
    usage: {
      maxTheoreticalUsage: number;
      maxActualUsage: number;
      avgDealUsage?: number;
    };
    deals: {
      profit: number;
      loss: number;
    };
  };
  duration: {
    profit: {
      avgWinningTradeDuration: number;
      maxWinningTradeDuration: number;
    };
    loss: {
      avgLosingTradeDuration: number;
      maxLosingTradeDuration: number;
    };
    general: {
      maxDealDuration: number;
      avgDealDuration?: number;
      dealsPerDay: number;
      workingTime: number;
    };
  };
  chart: {
    realizedProfit: number;
    buyAndHold: number;
    equity: number;
    time: number;
  }[];
};

export type BotProfitsData = { value: number; time: number }[];

export type BotSymbolsStats = {
  numerical: {
    deals: {
      profit: number;
      loss: number;
    };
    general: {
      startBalance: UsdAssetNumber;
      netProfit: UsdAssetNumber;
      netProfitPerc: number;
      dailyProfit: UsdAssetNumber;
      dailyProfitPerc: number;
      winRate: number;
      profitFactor: number;
    };
  };
  duration: {
    maxDealDuration: number;
    avgDealDuration?: number;
  };
  symbol: string;
};
export type HedgeBotSettings = Pick<
  DCABotSettings,
  | 'useTp'
  | 'tpPerc'
  | 'useSl'
  | 'slPerc'
  | 'comboTpBase'
  | 'comboTpLimit'
  | 'comboSlLimit'
  | 'dealCloseConditionSL'
  | 'dealCloseCondition'
>;
export interface HedgeBot
  extends
    Pick<
      MainBot,
      | '_id'
      | 'created'
      | 'paperContext'
      | 'profitByAssets'
      | 'showErrorWarning'
      | 'status'
      | 'statusReason'
      | 'type'
      | 'updated'
      | 'userId'
      | 'uuid'
      | 'workingShift'
    >,
    Pick<
      ComboBot,
      'profit' | 'symbol' | 'dealsInBot' | 'stats' | 'symbolStats' | 'flags'
    > {
  bots: (ComboBot | DCABot)[];
  initialBalances: {
    long: ComboBot['initialBalances'];
    short: ComboBot['initialBalances'];
  };
  currentBalances: {
    long: ComboBot['currentBalances'];
    short: ComboBot['currentBalances'];
  };
  assets: {
    long: ComboBot['assets'];
    short: ComboBot['assets'];
  };
  sharedSettings?: HedgeBotSettings;
}
export type CreateHedgeComboBotInput = Omit<
  DCABot['settings'],
  'ordersCount' | 'activeOrdersCount'
> & {
  pair?: string[];
  baseAsset?: string[];
  quoteAsset: string[];
  ordersCount: number;
  activeOrdersCount: number;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  vars?: BotVars | null;
};
export interface DCABot extends MainBot<DCABotSettings> {
  dealsReduceForBot?: {
    id: string;
    profit: number;
    profitUsd: number;
    base: number;
    quote: number;
  }[];
  dealsInBot: {
    all: number;
    active: number;
  };
  active?: number;
  all?: number;
  usage: Usage;
  symbol: {
    key: string;
    value: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
  }[];
  initialBalances: MultiAssets;
  currentBalances: MultiAssets;
  assets: {
    used: MultiAssets;
    required: MultiAssets;
  };
  stats?: BotStats;
  symbolStats?: BotSymbolsStats[];
  useAssets?: boolean;
  flags?: string[];
  liveStats?: BotLiveStats;
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
export type AllFees = { exchange: string; symbol: string; fee: number }[];

export type DealStatsForBot = {
  dealId: string;
  avgPrice: number;
  usage: Usage;
  profit: {
    total: number;
    totalUsd: number;
    pureBase?: number;
    pureQuote?: number;
  };
  feePaid?: {
    base?: number;
    quote?: number;
  };
  currentBalances: Balance;
  initialBalances: Balance;
  symbol: string;
  comboTpBase?: ComboTpBase;
};

export interface ComboBot extends MainBot<ComboBotSettings> {
  dealsReduceForBot?: {
    id: string;
    profit: number;
    profitUsd: number;
    base: number;
    quote: number;
  }[];
  dealsInBot: {
    all: number;
    active: number;
  };
  active?: number;
  all?: number;
  usage: Usage;
  symbol: {
    key: string;
    value: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
  }[];
  initialBalances: MultiAssets;
  currentBalances: MultiAssets;
  assets: {
    used: MultiAssets;
    required: MultiAssets;
  };
  dealsStatsForBot: DealStatsForBot[];
  stats?: BotStats;
  symbolStats?: BotSymbolsStats[];
  useAssets?: boolean;
  flags?: string[];
  liveStats?: BotLiveStats;
}

type MultiPairAsset = {
  used: number;
  required: number;
};
export interface MultiPairDCABot extends Omit<
  MainBot<MultiPairDCABotSettings>,
  | 'symbol'
  | 'profit'
  | 'assets'
  | 'usage'
  | 'currentBalances'
  | 'initialBalances'
  | 'currentBaseBalances'
  | 'currentQuoteBalances'
  | 'quoteAsset'
> {
  dealsInBot: {
    all: number;
    active: number;
  };
  active?: number;
  all?: number;
  usage: Usage;
  symbols: {
    key: string;
    value: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
  }[];
  profit: {
    total: number;
    totalUsd: number;
  };
  baseAssets: {
    key: string;
    value: MultiPairAsset;
  }[];
  quoteAssets: {
    key: string;
    value: MultiPairAsset;
  }[];
  initialBaseBalances: { key: string; value: number }[];
  initialQuoteBalances: { key: string; value: number }[];
  currentBaseBalances: { key: string; value: number }[];
  currentQuoteBalances: { key: string; value: number }[];
}
export interface Bot extends MainBot<BotSettings> {
  initialPrice: number;
  initialPriceFrom?: InitialPriceFromEnum;
  initialPriceStart?: number;
  initialPriceStartFrom?: InitialPriceFromEnum;
  levels: {
    active: Level;
    all: Level;
  };
  transactionsCount: Level;
  avgPrice?: number;
  progress?: {
    stage: number;
    total: number;
    text: string;
    isAllowedToCancel: boolean;
  };
  initialBalances: Balance;
  currentBalances: Balance;
  usdRate: number;
  lastPrice: number;
  lastUsdRate: number;
  symbol: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
  assets: {
    used: Balance;
    required: Balance;
  };
  position?: {
    side: PositionSide;
    qty: number;
    price: number;
  };
  stats: ProfitLossStats;
  liveStats?: GridLiveStats;
}

export type GridLiveStats = {
  budget: number;
  value: number;
  valueChange: number;
  valueChangePerc: number;
  avgDaily: number;
  avgDailyPerc: number;
  annualizedReturn: number;
  freePorfit: number;
  freeProfitUsd: number;
  totalProfit: number;
  totalProfitUsd: number;
  tradingTime: number;
  tradingTimeString: string;
};

export const enum PositionSide {
  BOTH = 'BOTH',
  SHORT = 'SHORT',
  LONG = 'LONG',
}

export enum InitialPriceFromEnum {
  start = 'start',
  swap = 'swap',
  user = 'user',
}

export type OrderData = {
  userId: string;
  botId: string;
  id: string;
  clientOrderId: string;
  cummulativeQuoteQty: string;
  executedQty: string;
  icebergQty: string;
  isWorking: boolean;
  orderId?: number;
  origQty: string;
  price: string;
  side: string;
  status: string;
  stopPrice: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  time: number;
  timeInForce: string;
  type: string;
  updateTime: number;
  transactTime: number;
  typeOrder?:
    | 'swap'
    | 'regular'
    | 'dealStart'
    | 'dealTP'
    | 'dealRegular'
    | 'stop'
    | 'stab'
    | 'dealGrid'
    | 'split'
    | 'fee'
    | 'liquidation'
    | 'rebalance'
    | 'br';
  dealId: string;
  exchangeUUID: string;
  exchange: ExchangeEnum;
  paperContext?: boolean;
  tpSlTarget?: string;
  botName?: string;
  botType?: BotTypesEnum;
  terminal?: boolean;
  sl?: boolean;
  acAfter?: number;
  acBefore?: number;
  reduceFundsId?: string;
};

export type ProfitLossStats = {
  drawdownPercent: number;
  runUpPercent: number;
  timeInProfit: number;
  timeInLoss: number;
  trackTime: number;
  timeCountStart: number;
  currentCount: string;
  unrealizedProfit: number;
};

export type Transaction = {
  _id: string;
  updateTime: number;
  side: string;
  amountBaseBuy: number;
  amountQuoteBuy: number;
  amountBaseSell: number;
  amountQuoteSell: number;
  priceBuy: number;
  priceSell: number;
  idBuy: string;
  idSell: string;
  feeBase: number;
  feeQuote: number;
  profitBase: number;
  profitQuote: number;
  botId: string;
  userId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  profitCurrency: string;
  profitUsdt: number;
  cummulativeProfitBase?: number;
  cummulativeProfitQuote?: number;
  cummulativeProfitUsdt?: number;
  paperContext?: boolean;
};

export type BacktestingTransaction = {
  _id: string;
  updateTime: number;
  side: BotOrderSideEnum;
  amountBaseBuy: string;
  amountQuoteBuy: string;
  amountBaseSell: string;
  amountQuoteSell: string;
  priceBuy: string;
  priceSell: string;
  profit: string;
  profitUsd: number;
  baseAsset: string;
  quoteAsset: string;
  profitAsset: string;
  index: number;
};

export type Asset = {
  asset: string;
  free: string;
  locked: string;
  exchange?: string;
  exchangeName?: string;
  exchangeUUID?: string;
  /**
   * Venue-derived USD valuation, only present when the caller asked for it with
   * `getBalances(input: { includeUsdValues: true })`. `null` means the venue
   * publishes no USD rate for the asset - NOT that it is worth zero.
   */
  price?: string | null;
  usdValue?: string | null;
};

export type Profit = {
  base: number;
  quote: number;
  profitUsd: number;
  date: string;
};

export type ProfitQuery = { result: Profit[] };

export type AssetUsd = {
  name: string;
  amount: number;
  amountUsd: number;
  exchanges?: { uuid: string; amount?: number; amountUsd?: number }[];
};

export type Portfolio = {
  updateTime: number;
  totalUsd: number;
  assets: AssetUsd[];
};

export type PortfolioQuery = { result: Portfolio[] };

export type QueryNames =
  | 'getPortfolioByUser'
  | 'getProfitByUser'
  | 'getProfitByBot'
  | 'getBalances'
  | 'getBotEvents'
  | 'addUserFavoritePair'
  | 'removeUserFavoritePair'
  | 'getUserFavoritePairs'
  | 'deleteToken'
  | 'user'
  | 'botList'
  | 'createBot'
  | 'userFee'
  | 'getBot'
  | 'changeBot'
  | 'changeStatus'
  | 'deleteBot'
  | 'setTimezone'
  | 'token'
  | 'userSettings'
  | 'getLatestOrders'
  | 'getUsdRate'
  | 'getPairInfo'
  | 'getAllPairs'
  | 'createDCABot'
  | 'getDCABot'
  | 'changeDCABot'
  | 'dcaBotList'
  | 'dcaDealList'
  | 'closeDCADeal'
  | 'openDCADeal'
  | 'changeDCADealSettings'
  | 'resetDealSettings'
  | 'updateProfilePicture'
  | 'getExchange'
  | 'addExchange'
  | 'updateExchange'
  | 'deleteExchange'
  | 'getMessageBot'
  | 'deleteBotMessage'
  | 'getTradingTerminalBotsList'
  | 'mergeDeals'
  | 'getDCADeals'
  | 'restartBot'
  | 'getBacktests'
  | 'saveBacktest'
  | 'deleteBacktests'
  | 'setBacktestPermanentStatus'
  | 'setArchive'
  | 'createAPIKeys'
  | 'renewAPIKeys'
  | 'changeAPIKeysPermission'
  | 'deleteAPIKeys'
  | 'getDCABotSettings'
  | 'getGridBotSettings'
  | 'getBotOrders'
  | 'getBotTransactions'
  | 'getBotDeals'
  | 'getDealOrders'
  | 'getGridBacktests'
  | 'saveGridBacktest'
  | 'setGridBacktestPermanentStatus'
  | 'deleteGridBacktests'
  | 'getBacktestByShareId'
  | 'getGridBacktestByShareId'
  | 'changePassword'
  | 'updateBalance'
  | 'getUserPeriods'
  | 'saveUserPeriod'
  | 'updateUserPeriod'
  | 'deleteUserPeriod'
  | 'getLeverageBracketsByUUID'
  | 'setHedge'
  | 'getAllOpenOrders'
  | 'closeOrderOnExchange'
  | 'importExchangeOrder'
  | 'getAllOpenPositions'
  | 'closePositionOnExchange'
  | 'multipleUserFees'
  | 'addDealFunds'
  | 'createComboBot'
  | 'getComboBot'
  | 'getComboBotDeals'
  | 'changeComboBot'
  | 'getComboBacktests'
  | 'comboBotList'
  | 'comboDealList'
  | 'closeComboDeal'
  | 'getComboDeals'
  | 'getComboBotMinigrids'
  | 'getComboBotSettings'
  | 'getComboDealOrders'
  | 'saveComboBacktest'
  | 'getComboBacktestByShareId'
  | 'setComboBacktestPermanentStatus'
  | 'deleteComboBacktests'
  | 'openComboDeal'
  | 'changeComboDealSettings'
  | 'setVideoUpdate'
  | 'cancelTerminalDealOrder'
  | 'cancelPendingAddFundsDealOrder'
  | 'setBacktestTextFields'
  | 'getUserFavoriteIndicators'
  | 'addUserFavoriteIndicator'
  | 'removeUserFavoriteIndicator'
  | 'setDealNote'
  | 'resetComboDealSettings'
  | 'requestServerSideBacktest'
  | 'removeUserFiles'
  | 'getUserFiles'
  | 'getServerSideBacktestRequests'
  | 'resetShowError'
  | 'updateStatus'
  | 'getBotProfitChartData'
  | 'reduceDealFunds'
  | 'botDashboardStats'
  | 'dealDashboardStats'
  | 'manageBalanceDiff'
  | 'compareBalances'
  | 'setZeroFee'
  | 'searchByBotName'
  | 'getBotDealsStats'
  | 'getComboBotDealsStats'
  | 'moveDealToTerminal'
  | 'moveGridToTerminal'
  | 'createHedgeComboBot'
  | 'hedgeComboBotList'
  | 'hedgeComboDealList'
  | 'getHedgeComboBot'
  | 'getHedgeComboBotDeals'
  | 'getHedgeComboBotDealsStats'
  | 'getHedgeComboBotMinigrids'
  | 'getHedgeComboBotSettings'
  | 'getHedgeComboDealOrders'
  | 'getHedgeComboDeals'
  | 'getGlobalVariables'
  | 'deleteGlobalVariable'
  | 'createGlobalVariable'
  | 'updateGlobalVariable'
  | 'getGlobalVariablesByIds'
  | 'getDCABotDealsById'
  | 'getComboBotDealsById'
  | 'getGlobalVariableRelatedBots'
  | 'changeHedgeComboBot'
  | 'resetAccount'
  | 'hedgeDCABotList'
  | 'createHedgeDCABot'
  | 'changeHedgeDCABot'
  | 'getHedgeDCABotSettings'
  | 'getHedgeDCABot'
  | 'getHedgeDCABotDealsStats'
  | 'getHedgeDCADealOrders'
  | 'getHedgeDcaBotDeals'
  | 'hedgeDcaDealList'
  | 'getHedgeDcaDeals'
  | 'changeAPIKeysName'
  | 'changeAPIKeysPaperContext'
  | 'changeAPIKeysBotId'
  | 'checkUserExist'
  | 'registerAccount'
  | 'setLicenseKey'
  | 'deleteLicenseKey';

export enum BacktestRequestStatus {
  pending = 'pending',
  success = 'success',
  failed = 'failed',
  loadingData = 'loadingData',
  processing = 'processing',
}

export type BacktestRequest = {
  _id: string;
  symbols: {
    pair: string;
    baseAsset: string;
    quoteAsset: string;
  }[];
  exchange: ExchangeEnum;
  exchangeUUID: string;
  userId: string;
  status: BacktestRequestStatus;
  backtestId?: string;
  type: BotTypesEnum;
  created: Date;
  cost?: number;
  statusReason?: string;
  statusHistory?: {
    status: BacktestRequestStatus;
    time: number;
  }[];
};
export type UserFee = {
  symbol: string;
  makerCommission: string;
  takerCommission: string;
};

export enum OrderLineHistoryTypeEnum {
  tp = 'tp',
  sl = 'sl',
  avg = 'avg',
  regular = 'regular',
}

export interface OrderLineHistory {
  botId: string;
  userId: string;
  dealId?: string;
  type: OrderLineHistoryTypeEnum;
  startTime: number;
  filledTime?: number;
  side: BotOrderSideEnum;
  orderId: string;
  price: number;
}

export interface BotIndicatorsHistory {
  type: IndicatorAction;
  time: number;
  side: BotOrderSideEnum;
  price: number;
  botId: string;
  userId: string;
  symbol: string;
}

export type MultipleUserFees = {
  symbol: string;
  maker: number;
  taker: number;
};

export type LeverageBracket = {
  symbol: string;
  leverage: number;
  step: number;
  min: number;
  contractAsset?: string;
};

export type PaperOrders = {
  amount: number;
  filledAmount: number;
  filledQuoteAmount: number;
  quoteAmount: number;
  price: number;
  avgFilledPrice: number;
  fee: number;
  feePerc: number;
  symbol: string;
  user: string;
  exchange: string;
  status: string;
  type: string;
  side: string;
  externalId: string;
  createdAt: Date;
  updatedAt: Date;
  reduceOnly: boolean;
  positionSide: string;
};

export type PaperPositions = {
  _id: string;
  symbol: string;
  margin: number;
  entryPrice: number;
  closePrice: number;
  liquidationPrice: number;
  positionSide: string;
  positionAmt: number;
  user: string;
  exchange: string;
  createdAt: Date;
  updatedAt: Date;
  id: string;
  status: string;
  profit: number;
  fee: number;
  leverage: number;
  uuid: string;
};

export type Series = {
  date: string;
  value: number;
};

export enum ChartTypes {
  line = 'line',
  area = 'area',
  bar = 'bar',
  histogram = 'histogram',
  pie = 'pie',
  donut = 'donut',
  radialBar = 'radialBar',
  scatter = 'scatter',
  bubble = 'bubble',
  heatmap = 'heatmap',
}

export type ChartType = {
  title: string;
  value: number;
};

export enum ChartStackTypes {
  full = '100%',
  normal = 'normal',
}

export type Prices = {
  symbol: string;
  price: number;
  exchange: ExchangeEnum | 'all';
}[];

export type UnPromise<T> = T extends Promise<infer U> ? U : T;

export type EstimateBalance = {
  totalBase: number;
  totalQuote: number;
  nowBase: number;
  nowQuote: number;
};

export type Ranges = {
  orderInAdvance: RangeResult;
  levels: RangeResult;
  budget: RangeResult;
  gridStep: RangeResult;
};

export type DCARanges = {
  baseOrderSize: RangeResult;
  baseOrderSizeBase: RangeResult;
  tpPerc: RangeResult;
  ordersCount: RangeResult;
  orderSize: RangeResult;
  orderSizeBase: RangeResult;
  step: RangeResult;
  baseStep?: RangeResult;
  activeOrdersCount: RangeResult;
  volumeScale: RangeResult;
  stepScale: RangeResult;
  slPerc: RangeResult;
  gridLevel?: RangeResult;
  baseGridLevel?: RangeResult;
};

type RangeResult = {
  min: number;
  max: number;
};

export enum BotTypesEnum {
  dca = 'dca',
  grid = 'grid',
  combo = 'combo',
  hedgeCombo = 'hedgeCombo',
  hedgeDca = 'hedgeDca',
  terminal = 'terminal',
}

export type DCAGrid = {
  qty: number;
  price: number;
  note?: string;
  side: BotOrderSideEnum;
  id: string;
  priceDeviation?: string;
  avgPrice?: number;
  requiredPrice?: number;
  type?: DCAOrderTypeEnum;
  base?: number;
  quote?: number;
  tpSlTarget?: string;
  label?: string;
  grey?: boolean;
  greyLabel?: string;
  noLabel?: boolean;
  minigridBudget?: number;
  hide?: boolean;
  relatedToLevel?: number;
  pair: string;
  strategy: StrategyEnum;
  exchange?: ExchangeEnum;
  draggable?: boolean;
  onPriceChange?: (price: number, id: string) => void;
};

export enum DCAOrderTypeEnum {
  tp = 'TP order',
  sl = 'SL order',
  bo = 'Start order',
  dca = 'DCA order',
  grid = 'Grid',
  limit = 'Limit order',
}

export type navbarPropsType = {
  name: string;
  OutlinedIcon: ReactElement;
  FilledIcon: ReactElement;
  link?: string;
  isFeatured?: boolean;
  isDrawer?: boolean;
}[];

export enum DCADealStatusEnum {
  closed = 'closed',
  open = 'open',
  start = 'start',
  error = 'error',
  canceled = 'canceled',
}
export type DCADealsSettings = Pick<
  DCABotSettings,
  | 'ordersCount'
  | 'step'
  | 'baseOrderSize'
  | 'baseOrderPrice'
  | 'useLimitPrice'
  | 'startOrderType'
  | 'tpPerc'
  | 'profitCurrency'
  | 'baseOrderSize'
  | 'orderSize'
  | 'useTp'
  | 'useDca'
  | 'useSmartOrders'
  | 'activeOrdersCount'
  | 'volumeScale'
  | 'stepScale'
  | 'minimumDeviation'
  | 'useSl'
  | 'slPerc'
  | 'trailingSl'
  | 'moveSL'
  | 'moveSLTrigger'
  | 'moveSLValue'
  | 'moveSLForAll'
  | 'trailingTp'
  | 'trailingTpPerc'
  | 'useMinTP'
  | 'minTp'
  | 'orderSizeType'
  | 'useMultiSl'
  | 'multiSl'
  | 'useMultiTp'
  | 'multiTp'
  | 'dealCloseCondition'
  | 'dealCloseConditionSL'
  | 'closeDealType'
  | 'futures'
  | 'coinm'
  | 'marginType'
  | 'leverage'
  | 'gridLevel'
  | 'useFixedTPPrices'
  | 'useFixedSLPrices'
  | 'dcaCondition'
  | 'closeByTimer'
  | 'closeByTimerUnits'
  | 'closeByTimerValue'
  | 'dcaCustom'
  | 'comboTpBase'
  | 'fixedSlPrice'
  | 'fixedTpPrice'
  | 'useRiskReward'
  | 'comboUseSmartGrids'
  | 'comboSmartGridsCount'
  | 'riskUseTpRatio'
  | 'scaleDcaType'
  | 'baseSlOn'
  | 'dcaVolumeBaseOn'
  | 'dcaVolumeRequiredChangeRef'
  | 'dcaVolumeMaxValue'
  | 'dcaVolumeRequiredChange'
> & {
  avgPrice: number;
  changed: boolean;
  orderSizePercQty?: number;
  slChangedByUser?: boolean;
  updatedComboAdjustments?: boolean;
};

export const CloseOptions = {
  [CloseDCATypeEnum.cancel]: 'Cancel',
  [CloseDCATypeEnum.closeByLimit]: 'Close by LIMIT',
  [CloseDCATypeEnum.closeByMarket]: 'Close by MARKET',
  [CloseDCATypeEnum.leave]: 'Leave',
};

export type DCADeal = {
  page: number;
  totalPages: number;
  totalResults: number;
  result: DCADeals[];
};

export enum TrailingModeEnum {
  ttp = 'ttp',
  tsl = 'tsl',
}

export type BotEvent = {
  botId: string;
  botType: BotTypesEnum;
  userId: string;
  event: string;
  description: string;
  created: Date;
  _id: string;
  type?: Message['type'];

  metadata?: unknown;
  deal?: string;
  symbol?: string;
};

export type DCADeals = {
  note?: string;
  _id: string;
  botId: string;
  botName?: string;
  userId: string;
  status: DCADealStatusEnum;
  initialBalances: Balance;
  currentBalances: Balance;
  initialPrice: number;
  lastPrice: number;
  profit: {
    total: number;
    totalUsd: number;
    pureBase?: number;
    pureQuote?: number;
    gridProfit?: number;
    gridProfitUsd?: number;
  };
  funding?: {
    total: number;
    totalUsd: number;
    lastTime?: number;
    history?: {
      time: number;
      rate: number;
      markPrice?: number;
      qty: number;
      feeQuote: number;
      feeUsd: number;
    }[];
  };
  feePaid?: {
    base?: number;
    quote?: number;
  };
  avgPrice: number;
  displayAvg?: number;
  commission: number;
  createTime: number;
  updateTime: number;
  closeTime?: number;
  levels: {
    all: number;
    complete: number;
  };
  usage: Usage;
  settings: DCADealsSettings;
  assets: {
    used: Balance;
    required: Balance;
  };
  dcaBot?: {
    settings: DCABotSettings;
    symbol: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
    };
    exchange?: string;
  };
  gridBreakpoints: GridBreakpoint[];
  strategy: StrategyEnum;
  symbol: {
    baseAsset: string;
    quoteAsset: string;
    symbol: string;
  };
  exchange?: ExchangeEnum;
  exchangeUUID?: string;
  bestPrice?: number;
  trailingLevel?: number;
  trailingMode?: TrailingModeEnum;
  stats: ProfitLossStats;
  tpSlTargetFilled?: string[];
  tpFilledHistory?: { id: string; qty: number; price: number }[];
  dynamicAr?: DynamicArPrices[];
  paperContext?: boolean;
  type?: DCATypeEnum;
  funds?: {
    price: number;
    qty: number;
  }[];
  reduceFunds?: {
    price: number;
    qty: number;
  }[];
  combo?: boolean;
  pendingAddFunds?: (AddFundsSettings & { id: string })[];
  pendingReduceFunds?: (AddFundsSettings & { id: string })[];
  blockOrders?: BlockOrder[];
  moveSlActivated?: boolean;
  parent?: boolean;
  feeBalance?: number;
  transactions?: {
    buy: number;
    sell: number;
  };
  sizes?: Sizes;
  tags?: string[];
  ac?: {
    before: number;
    after: number;
  };
  flags?: DCADealFlags[];
  closeTrigger?: DCACloseTriggerEnum;
  parentBotId?: string;
  /** Why a created deal has never opened. See {@link DealStartBlock}. */
  startBlocked?: DealStartBlock;
};

/**
 * Why a deal that exists has never been opened: the venue refused its opening
 * order, or one of our pre-send guards held it back on the venue's behalf.
 *
 * A deal is created before its base order reaches the exchange, so a refusal
 * leaves it sitting with no orders. Present only while the deal is unstarted;
 * cleared as soon as an opening order is accepted. Descriptive - the deal is
 * NOT in an error state, and for a Binance Quantitative Rules cooldown it will
 * open itself once the restriction lifts.
 */
export type DealStartBlock = {
  /** User-facing reason the opening order was not accepted. */
  reason?: string;
  /** Bot-error subType the reason classified as, e.g. `Exchange rules`. */
  subType?: string;
  /** ms epoch of the first refusal in this run of refusals. */
  since?: number;
  /** ms epoch of the most recent refusal. */
  lastAttempt?: number;
  /** How many opening attempts have been refused since `since`. */
  attempts?: number;
  /** ms epoch the restriction is expected to lift, when the venue grades it. */
  retryAfter?: number;
  /** Restriction scope where the venue distinguishes one, e.g. `account`. */
  scope?: string;
  /** Restriction level where the venue grades one (Binance QR 1 | 2 | 3). */
  level?: number;
};

export enum DCACloseTriggerEnum {
  combined = 'combined',
  manual = 'manual',
  tp = 'tp',
  sl = 'sl',
  webhook = 'webhook',
  api = 'api',
  trailing = 'trailing',
  liquidation = 'liquidation',
  auto = 'auto',
  bot = 'bot',
  timer = 'timer',
  indicator = 'indicator',
  base = 'base',
}

export const DCACloseTriggerEnumMap: { [x in DCACloseTriggerEnum]: string } = {
  [DCACloseTriggerEnum.combined]: 'Combined',
  [DCACloseTriggerEnum.manual]: 'Manual',
  [DCACloseTriggerEnum.tp]: 'Take Profit',
  [DCACloseTriggerEnum.sl]: 'Stop Loss',
  [DCACloseTriggerEnum.webhook]: 'Webhook',
  [DCACloseTriggerEnum.api]: 'API',
  [DCACloseTriggerEnum.trailing]: 'Trailing',
  [DCACloseTriggerEnum.liquidation]: 'Liquidation',
  [DCACloseTriggerEnum.auto]: 'Auto',
  [DCACloseTriggerEnum.bot]: 'Bot',
  [DCACloseTriggerEnum.timer]: 'Timer',
  [DCACloseTriggerEnum.indicator]: 'Indicator',
  [DCACloseTriggerEnum.base]: 'Base Minigrid',
};

export enum DCADealFlags {
  newMultiTp = 'newMultiTp',
  futuresPrecision = 'futuresPrecision',
  externalSl = 'externalSl',
  externalTp = 'externalTp',
}

export type Sizes = {
  base: number;
  dca: number[];
  origBase: number;
  origDca: number[];
};
export type BlockOrder = { price: number; qty: number; side: BotOrderSideEnum };
export type AddFundsSettings = {
  qty: string;
  useLimitPrice: boolean;
  limitPrice?: string;
  asset: OrderSizeTypeEnum;
  type?: AddFundsTypeEnum;
};
export interface ComboBotSettings extends DCABotSettings {
  gridLevel?: string;
}

export enum ComboMinigridStatusEnum {
  active = 'active',
  range = 'range',
  closed = 'closed',
}

export interface ComboMinigrid {
  _id: string;
  botId: string;
  userId: string;
  dealId: string;
  dcaOrderId: string;
  grids: { buy: number; sell: number };
  status: ComboMinigridStatusEnum;
  initialBalances: Balance;
  currentBalances: Balance;
  initialPrice: number;
  realInitialPrice: number;
  lastPrice: number;
  profit: {
    total: number;
    totalUsd: number;
  };
  avgPrice: number;
  createTime: number;
  updateTime: number;
  closeTime?: number;
  assets: { used: Balance; required: Balance };
  paperContext?: boolean;
  exchange: string;
  exchangeUUID: string;
  symbol: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
  settings: {
    topPrice: number;
    lowPrice: number;
    levels: number;
    budget: number;
    sellDisplacement: number;
  };
  transactions: {
    buy: number;
    sell: number;
  };
}

export type ComboDealsSettings = DCADealsSettings &
  Pick<ComboBotSettings, 'gridLevel'> & { updatedComboAdjustments?: boolean };

export interface ComboDeals extends DCADeals {
  botId: string;
  userId: string;
  status: DCADealStatusEnum;
  initialBalances: Balance;
  currentBalances: Balance;
  initialPrice: number;
  lastPrice: number;
  profit: {
    total: number;
    totalUsd: number;
    pureBase?: number;
    pureQuote?: number;
    gridProfit?: number;
    gridProfitUsd?: number;
  };
  avgPrice: number;
  displayAvg?: number;
  commission: number;
  createTime: number;
  updateTime: number;
  closeTime?: number;
  levels: {
    all: number;
    complete: number;
  };
  usage: Usage;
  assets: { used: Balance; required: Balance };
  settings: ComboDealsSettings;
  paperContext?: boolean;
  strategy: StrategyEnum;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  symbol: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
  stats: ProfitLossStats;
  lastFilledLevel?: number;
  totalAssetAmount?: number;
}

export type DealsStats = {
  avgUsage: number;
  avgProfit: number;
  avgTradingTime: number;
  avgTimeInLoss: number;
  avgTimeInProfit: number;
  winRate: number;
};

export type GridBreakpoint = {
  price: number;
  displacedPrice: number;
};

export enum DCATypeEnum {
  regular = 'regular',
  terminal = 'terminal',
}
export type withDecimals = {
  wholeNumber: string;
  decimal: string;
};

export type AdditionalBotData = {
  id: string;
  color: string;
  budget?: number;
  value?: number;
  valueChange?: string;
  symbolProfit?: string;
  workingTime?: string;
  workingTimeNumber?: number;
  valueChangeUsd?: string;
  profitTodayPerc?: string;
  avgDaily?: number;
  avgDailyFriendly?: string;
  totalProfitUsd: number;
  profitFriendly?: string;
  profitFriendlyInAsset?: string;
  profitFriendlyInAssetTooltip?: MainBot['profitByAssets'];
  fullProfitFriendly?: string;
  fullProfitFriendlyInAsset?: string;
  avgDailyPerc?: number;
  annualizedReturn?: number;
  profitPerc?: number;
  fullProfitPerc?: number;
  unPnl?: number;
  unPnlPerc?: number;
  maxValue?: number;
  currentValue?: number;
  exchangeName?: string;
  currentValueFriendly?: string;
  maxValueFriendly?: string;
  unPnlFriendly?: string;
  usageTotal?: number;
  usageTootltip?: string;
  transactionsCountFriendly?: {
    buy: string;
    sell: string;
    total: string;
  };
  combo?: boolean;
  loadedPrices?: boolean;
  name: string;
  mode?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt: number;
  pair: string;
  type: BotTypesEnum;
  // Base and quote assets for coin pair display
  baseAsset?: string;
  quoteAsset?: string;
};

export type Precision = {
  base: number;
  quote: number;
  price: number;
};

export type Cryptocurrency = {
  label: string;
  value: string;
};

export type ShortBot = Pick<MainBot, 'status' | '_id'> & { symbol: Symbols };

export enum StatusEnum {
  ok = 'OK',
  notok = 'NOTOK',
}

export type GetLatestPricesResult =
  | {
      status: StatusEnum.ok;
      reason: null;
      data: Prices;
    }
  | {
      status: StatusEnum.notok;
      reason: string;
      data: null;
    };

export type TransactionChart = {
  side: string;
  time: number;
  price: number;
  id: string;
  takeProfitTargets?: Array<{ price: number; percentage: number }> | undefined;
  tradeNumber?: number; // For displaying trade labels on chart
  // Optional: precomputed PnL percent for the trade (includes fees, slippage, etc.)
  // If provided, the chart will use this for coloring and labels instead of computing locally
  pnlPercent?: number;
  // Optional: precomputed Risk:Reward ratio for the trade
  // If provided, the chart will use this instead of calculating from prices
  rrRatio?: number;
};

export type PositionChart = {
  side: BotOrderSideEnum;
  entryPrice: number;
  profitPrice: number;
  stopPrice: number;
  risk: number;
  accountSize: number;
};

export enum WebhookActionEnum {
  start = 'startDeal',
  close = 'closeDeal',
  closeSl = 'closeDealSl',
  startBot = 'startBot',
  stopBot = 'stopBot',
  addFunds = 'addFunds',
  reduceFunds = 'reduceFunds',
  changePairs = 'changePairs',
}

export enum PairsToSetMode {
  add = 'add',
  remove = 'remove',
  replace = 'replace',
}

export type BalanceLegend = {
  name: string;
  id: string;
  amount: string;
  type: BotTypesEnum;
  terminal?: boolean;
};

export type BalanceType = {
  free: number;
  freeUsd: number;
  used: number;
  usedUsd: number;
  required: number;
  requiredUsd?: number;
  name: string;
  requiredRatio: number;
  exchange?: string;
  exchangeName?: string;
  exchangeUUID?: string;
  total: number;
  totalUsd: number;
  planned?: number;
  plannedUsd?: number;
  freeAndOver?: number;
  freeAndOverUsd?: number;
  usdRate?: string;
  legend?: BalanceLegend[];
};

export enum RangeType {
  atr = 'ATR',
  tr = 'TR',
  r = 'R',
}

export enum MAEnum {
  sma = 'sma',
  ema = 'ema',
  wma = 'wma',
  price = 'price',
  dema = 'dema',
  tema = 'tema',
  vwma = 'vwma',
  hma = 'hma',
  rma = 'rma',
}

export enum TradingviewAnalysisSignalEnum {
  strongBuy = 'strongBuy',
  strongSell = 'strongSell',
  buy = 'buy',
  sell = 'sell',
  bothBuy = 'bothBuy',
  bothSell = 'bothSell',
}

export enum TradingviewAnalysisConditionEnum {
  every = 'every',
  entry = 'entry',
}

export type CommonIndicatorSettings = {
  length: number;
  upperLimit?: number;
  lowerLimit?: number;
  uuid: string;
  signal?: TradingviewAnalysisSignalEnum;
  condition?: TradingviewAnalysisConditionEnum;
  checkLevel?: number;
  maType?: MAEnum;
  valueInsteadof?: number;
  stochSmoothK?: number;
  stochSmoothD?: number;
  stochRSI?: number;
  leftBars?: number;
  rightBars?: number;
  basePeriods?: number;
  pumpPeriods?: number;
  pump?: number;
  baseCrack?: number;
  psarStart?: number;
  psarInc?: number;
  psarMax?: number;
  stochRange?: StochRangeEnum;
  voShort?: number;
  voLong?: number;
  uoFast?: number;
  uoMiddle?: number;
  uoSlow?: number;
  momSource?: string;
  bbwpLookback?: number;
  ecdTrigger?: ECDTriggerEnum;
  xOscillator1?: IndicatorEnum | 'None';
  xOscillator2?: IndicatorEnum | 'None';
  xOscillator2length?: number;
  xOscillator2Interval?: ExchangeIntervals;
  xOscillator2voLong?: number;
  xOscillator2voShort?: number;
  percentile?: boolean;
  percentileLookback?: number;
  percentilePercentage?: number;
  percentileCondition?: IndicatorStartConditionEnum;
  mar1length?: number;
  mar1type?: MAEnum;
  mar2length?: number;
  mar2type?: MAEnum;
  bbwMult?: number;
  bbwMa?: MAEnum;
  bbwMaLength?: number;
  macdFast?: number;
  macdSlow?: number;
  macdMaSource?: MAEnum;
  macdMaSignal?: MAEnum;
  divOscillators?: DivergenceOscillators[];
  divType?: DivTypeEnum;
  divMinCount?: number;
  trendFilter?: boolean;
  trendFilterLookback?: number;
  trendFilterType?: TrendFilterOperatorEnum;
  trendFilterValue?: number;
  factor?: number;
  atrLength?: number;
  pcUp?: string;
  pcDown?: string;
  pcCondition?: PCConditionEnum;
  pcValue?: string;
  ppHighLeft?: number;
  ppHighRight?: number;
  ppLowLeft?: number;
  ppLowRight?: number;
  ppMult?: number;
  ppValue?: ppValueEnum;
  ppType?: ppValueTypeEnum;
  showHH?: boolean;
  showHL?: boolean;
  showLH?: boolean;
  showLL?: boolean;
  showSBullBoS?: boolean;
  showSBearBoS?: boolean;
  showSBullCHoCH?: boolean;
  showSBearCHoCH?: boolean;
  showIBullBoS?: boolean;
  showIBearBoS?: boolean;
  showIBullCHoCH?: boolean;
  showIBearCHoCH?: boolean;
  showBullMarket?: boolean;
  showBearMarket?: boolean;
  showSl?: boolean;
  showWl?: boolean;
  showSh?: boolean;
  showWh?: boolean;
  showSupport?: boolean;
  showResistance?: boolean;
  showUpper?: boolean;
  showMiddle?: boolean;
  showLower?: boolean;
  showUp?: boolean;
  showDown?: boolean;
  useCallback?: boolean;
  arPrice?: boolean;
  arFactor?: number;
  athLookback?: number;
  kcMa?: MAEnum;
  kcRange?: RangeType;
  kcRangeLength?: number;
  unpnlValue?: number;
  unpnlCondition?: IndicatorStartConditionEnum;
  obfvgValue?: OBFVGValueEnum;
  obfvgRef?: OBFVGRefEnum;
  sessionDays?: number[];
  sessionRule?: SessionRuleEnum;
  lwThreshold?: number;
  lwMaxDuration?: number;
  lwValue?: LWValueEnum;
  lwCondition?: LWConditionEnum;
};

export enum ppValueTypeEnum {
  price = 'Price Based',
  event = 'Event Based',
  market = 'Market Based',
}

export enum ppValueEnum {
  hh = 'HH',
  hl = 'HL',
  lh = 'LH',
  ll = 'LL',
  anyH = 'Any High',
  anyL = 'Any Low',
  sl = 'SL',
  wl = 'WL',
  sh = 'SH',
  wh = 'WH',
  anySWL = 'anyL',
  anySWH = 'anyH',
  bullMarket = 'BullM',
  bearMarket = 'BearM',
  sBullBoS = 'SBullBoS',
  sBearBoS = 'SBearBoS',
  sBullCHoCH = 'SBullCHoCH',
  sBearCHoCH = 'SBearCHoCH',
  iBullBoS = 'IBullBoS',
  iBearBoS = 'IBearBoS',
  iBullCHoCH = 'IBullCHoCH',
  iBearCHoCH = 'IBearCHoCH',
  IanyBull = 'IAnyBull',
  IanyBear = 'IAnyBear',
  SanyBull = 'SAnyBull',
  SanyBear = 'SAnyBear',
  bullAnyBoS = 'BullAnyBoS',
  bearAnyBoS = 'BearAnyBoS',
  bullAnyCHoCH = 'BullAnyCHoCH',
  bearAnyCHoCH = 'BearAnyCHoCH',
}

export enum PCConditionEnum {
  up = 'UP',
  down = 'DOWN',
}

export enum DivTypeEnum {
  bull = 'Bullish',
  bear = 'Bearish',
  hbull = 'Hidden Bullish',
  hbear = 'Hidden Bearish',
  abull = 'Any Bullish',
  abear = 'Any Bearish',
}

type DivergenceOscillators =
  | IndicatorEnum.adx
  | IndicatorEnum.cci
  | IndicatorEnum.mfi
  | IndicatorEnum.rsi
  | IndicatorEnum.wr
  | IndicatorEnum.macd
  | IndicatorEnum.uo
  | IndicatorEnum.ao
  | IndicatorEnum.mom
  | IndicatorEnum.bbw
  | IndicatorEnum.vo
  | IndicatorEnum.bbpb
  | IndicatorEnum.stoch;

export enum ECDTriggerEnum {
  bearish = 'bearish',
  bullish = 'bullish',
  both = 'both',
}

export type STOCHRSISettings = {
  type: IndicatorEnum.stochRSI;
} & CommonIndicatorSettings;

export type ECDSettings = {
  type: IndicatorEnum.ecd;
} & CommonIndicatorSettings;

export type XOSettings = {
  type: IndicatorEnum.xo;
} & CommonIndicatorSettings;

export type MARSettings = {
  type: IndicatorEnum.mar;
} & CommonIndicatorSettings;

export type SRSettings = {
  type: IndicatorEnum.sr;
} & CommonIndicatorSettings;

export type MFISettings = {
  type: IndicatorEnum.mfi;
} & CommonIndicatorSettings;

export type STOCHSettings = {
  type: IndicatorEnum.stoch;
} & CommonIndicatorSettings;

export type RSISettings = {
  type: IndicatorEnum.rsi;
} & CommonIndicatorSettings;

export type CCISettings = {
  type: IndicatorEnum.cci;
} & CommonIndicatorSettings;

export type MOMSettings = {
  type: IndicatorEnum.mom;
} & CommonIndicatorSettings;

export type AOSettings = {
  type: IndicatorEnum.ao;
} & CommonIndicatorSettings;

export type WRSettings = {
  type: IndicatorEnum.wr;
} & CommonIndicatorSettings;

export type UOSettings = {
  type: IndicatorEnum.uo;
} & CommonIndicatorSettings;

export type BBSettings = {
  type: IndicatorEnum.bb;
} & CommonIndicatorSettings;

export type BBWSettings = {
  type: IndicatorEnum.bbw;
} & CommonIndicatorSettings;

export type BBPBSettings = {
  type: IndicatorEnum.bbpb;
} & CommonIndicatorSettings;

export type DIVSettings = {
  type: IndicatorEnum.div;
} & CommonIndicatorSettings;

export type STSettings = {
  type: IndicatorEnum.st;
} & CommonIndicatorSettings;

export type BBWPSettings = {
  type: IndicatorEnum.bbwp;
} & CommonIndicatorSettings;

export type ADXSettings = {
  type: IndicatorEnum.adx;
} & CommonIndicatorSettings;

export type MACDSettings = {
  type: IndicatorEnum.macd;
} & CommonIndicatorSettings;

export type TVSettings = {
  type: IndicatorEnum.tv;
} & CommonIndicatorSettings;

export type MASettings = {
  type: IndicatorEnum.ma;
} & CommonIndicatorSettings;

export type QFLSettings = {
  type: IndicatorEnum.qfl;
} & CommonIndicatorSettings;

export type PSARSettings = {
  type: IndicatorEnum.psar;
} & CommonIndicatorSettings;

export type VOSettings = {
  type: IndicatorEnum.vo;
} & CommonIndicatorSettings;

export type PCSettings = {
  type: IndicatorEnum.pc;
} & CommonIndicatorSettings;

export type DCSettings = {
  type: IndicatorEnum.dc;
} & CommonIndicatorSettings;

export type ChartIndicatorConfig = CommonIndicatorSettings & {
  type: IndicatorEnum;
};

export type ChartIndicatorsConfig = ChartIndicatorConfig[];

export enum ExchangeIntervals {
  oneM = '1m',
  threeM = '3m',
  fiveM = '5m',
  fifteenM = '15m',
  thirtyM = '30m',
  oneH = '1h',
  twoH = '2h',
  fourH = '4h',
  eightH = '8h',
  oneD = '1d',
  oneW = '1w',
}

export type DCAIdBot = DCABot & { deals: DCADeals[]; orders: OrderData[] };
export type HedgeIdBot = HedgeBot & {
  deals: DCADeals[];
  orders: OrderData[];
};
export type ComboIdBot = DCABot & { deals: DCADeals[]; orders: OrderData[] };
export type MultiPairDCAIdBot = MultiPairDCABot & {
  deals: DCADeals[];
  orders: OrderData[];
};

export type AvgPrice = {
  price: number;
  label?: string;
  symbol: string;
};

export interface AvgPriceLinesResponse {
  avgPrice: AvgPrice[];
}

export const tvIntervalMap = {
  [ExchangeIntervals.oneM]: '1',
  [ExchangeIntervals.threeM]: '3',
  [ExchangeIntervals.fiveM]: '5',
  [ExchangeIntervals.fifteenM]: '15',
  [ExchangeIntervals.thirtyM]: '30',
  [ExchangeIntervals.oneH]: '60',
  [ExchangeIntervals.twoH]: '120',
  [ExchangeIntervals.fourH]: '240',
  [ExchangeIntervals.eightH]: '480',
  [ExchangeIntervals.oneD]: '1D',
  [ExchangeIntervals.oneW]: '1W',
};

export const tvToExchangeIntervalMap = {
  '1': ExchangeIntervals.oneM,
  '3': ExchangeIntervals.threeM,
  '5': ExchangeIntervals.fiveM,
  '15': ExchangeIntervals.fifteenM,
  '30': ExchangeIntervals.thirtyM,
  '60': ExchangeIntervals.oneH,
  '120': ExchangeIntervals.twoH,
  '240': ExchangeIntervals.fourH,
  '480': ExchangeIntervals.eightH,
  '1D': ExchangeIntervals.oneD,
  '1W': ExchangeIntervals.oneW,
};

export const timeIntervalMap = {
  [ExchangeIntervals.oneM]: 60 * 1000,
  [ExchangeIntervals.threeM]: 3 * 60 * 1000,
  [ExchangeIntervals.fiveM]: 5 * 60 * 1000,
  [ExchangeIntervals.fifteenM]: 15 * 60 * 1000,
  [ExchangeIntervals.thirtyM]: 30 * 60 * 1000,
  [ExchangeIntervals.oneH]: 60 * 60 * 1000,
  [ExchangeIntervals.twoH]: 2 * 60 * 60 * 1000,
  [ExchangeIntervals.fourH]: 4 * 60 * 60 * 1000,
  [ExchangeIntervals.eightH]: 8 * 60 * 60 * 1000,
  [ExchangeIntervals.oneD]: 24 * 60 * 60 * 1000,
  [ExchangeIntervals.oneW]: 7 * 24 * 60 * 60 * 1000,
};

export type FullGrid = DCAGrid & { filledTime?: number; startTime?: number };

export type SplitTime = {
  d: string;
  h: string;
  min: string;
  s: string;
};

export type Minigrid = {
  initialOrders: FullGrid[];
  filledOrders: FullGrid[];
  activeOrders: FullGrid[];
  id: string;
  dealId: string;
  dcaOrderId: string;
  grids: { buy: number; sell: number };
  status: 'open' | 'close';
  initialBalances: Balance;
  currentBalances: Balance;
  initialPrice: number;
  lastPrice: number;
  lastSide: BotOrderSideEnum;
  profit: {
    total: number;
    totalUsd: number;
  };
  avgPrice: number;
  createTime: number;
  updateTime: number;
  closeTime?: number;
  assets: { used: Balance; required: Balance };
  settings: {
    topPrice: number;
    lowPrice: number;
    levels: number;
    budget: number;
    sellDisplacement: number;
    profitCurrency: Currency;
    orderFixedIn: Currency;
    step: number;
  };
  transactions: {
    buy: number;
    sell: number;
  };
  lockClose: boolean;
};

export type Deal = {
  transactions: BacktestingTransaction[];
  mingrids: Minigrid[];
  initialOrders: FullGrid[];
  id: string;
  filledOrders: (FullGrid & { dealId: string })[];
  activeOrders: FullGrid[];
  ordersHistory: (FullGrid & {
    slLine?: boolean;
    avgLine?: boolean;
    dealId: string;
  })[];
  status: 'open' | 'closed';
  startTime: number;
  closedTime?: number;
  profit: {
    total: number;
    totalUsd: number;
    perc: number;
  };
  usage: {
    current: Balance;
    max: Balance;
  };
  levels: {
    all: number;
    complete: number;
    max: number;
  };
  step: number;
  duration: number;
  splitDuration: SplitTime;
  number?: number;
  avgPrice: number;
  startPrice: number;
  closePrice?: number;
  liquidationPrice?: number;
  currentBalance: Balance;
  initialBalance: Balance;
  slPerc?: number;
  changed?: boolean;
  bestPrice?: number;
  trailingLevel?: number;
  trailingMode?: TrailingModeEnum;
  bestPriceSet?: boolean;
  tpSlTargetFilled?: string[];
  dynamicAr?: DynamicArPrices[];
  lastFilled: number;
};

export type FullGridWithTime = FullGrid & { filledTime: number };

export type ValueChangeHistory = {
  value: number;
  time: number;
};

export type ProfitBacktest = {
  total: number;
  totalUsd: number;
  time: number;
};

export type GeneralOpenOrder = {
  symbol: string;
  orderId: string;
  botId?: string;
  botName?: string;
  side: string;
  type: string;
  created: Date;
  botType?: 'dca' | 'grid' | 'terminal' | 'combo' | 'hedgeDca' | 'hedgeCombo';
  exchange: ExchangeEnum;
  exchangeUUID: string;
  exchangeName: string;
  status: string;
  dealId?: string;
  price: string;
  quantity: string;
  quoteAssetName?: string;
  baseAssetName?: string;
  executedQty: string;
  clientOrderId: string;
};

export type PositionSide_LT = 'BOTH' | 'SHORT' | 'LONG';

export type GeneralOpenPosition = {
  symbol: string;
  created: Date;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  exchangeName: string;
  leverage: string;
  side: PositionSide_LT;
  price: string;
  quantity: string;
  baseAssetName?: string;
  quoteAssetName?: string;
  positionId: string;
  botId?: string;
  botName?: string;
  botType?: 'dca' | 'grid' | 'terminal' | 'combo' | 'hedgeDca' | 'hedgeCombo';
  marginType: BotMarginTypeEnum;
};

export type BacktestingSettings = {
  userFee: string;
  slippage: string;
  firstDataTime?: number | undefined;
  lastDataTime?: number | undefined;
  RFR?: string;
  MAR?: string;
  usage?: 'maxRealUsage' | 'maxTheoreticalUsage';
  pair?: string;
  locked?: boolean;
  multiIdependent?: boolean;
  multiCombined?: boolean;
  forceCustom?: boolean;
};

export type MAResult = {
  ma: number;
  maType: string;
  price: number;
};

export type DCResult = {
  high: number;
  low: number;
  basis: number;
};

export type IndicatorConfigBackTesting =
  | {
      type: IndicatorEnum.tv;
      checkLevel?: number;
      useAsEntryExitPoints?: boolean;
    }
  | {
      type: IndicatorEnum.rsi | IndicatorEnum.adx | IndicatorEnum.mfi;
      interval: number;
    }
  | {
      type: IndicatorEnum.bbw;
      interval: number;
      deviationMultiplier?: number;
    }
  | {
      type: IndicatorEnum.bb;
      interval: number;
    }
  | {
      type: IndicatorEnum.macd;
      longInterval: number;
      shortInterval: number;
      signalInterval: number;
    }
  | {
      type: IndicatorEnum.ma;
      maType: MAEnum;
      interval: number;
    }
  | {
      type: IndicatorEnum.stoch;
      length: number;
      smoothK: number;
      smoothD: number;
    }
  | {
      type: IndicatorEnum.stochRSI;
      length: number;
      rsiLength: number;
      smoothK: number;
      smoothD: number;
    }
  | {
      type: IndicatorEnum.sr;
      leftBars: number;
      rightBars: number;
    }
  | {
      type: IndicatorEnum.qfl;
      basePeriods: number;
      pumpPeriods: number;
      pump: number;
      baseCrack: number;
    };

export type FullDeal = DCADeals & AdditionalDealData;

export type AdditionalDealData = {
  riskBased?: boolean;
  riskBasedEdit?: boolean;
  workingTime?: string;
  unrealizedPnL?: number;
  unrealizedPnLUsage?: number;
  precision?: Precision;
  unrealizedPnLPerc?: number;
  gridProfitPerc?: number;
  number?: number;
  usagePerc: number;
  usageText: string;
  profitPerc?: number;
  loadedPrices: boolean;
  exchangeName?: string;
  trailing?: TrailingModeEnum;
  cost?: string;
  size?: string;
  value?: string;
  toggleAddFundsDialog?: () => void;
  toggleReduceFundsDialog?: () => void;
  showOrdersDialog?: () => void;
  showAcWarning?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  profitByAsset?: {
    base: number | string;
    quote: number | string;
    feeBase: number | string;
    feeQuote: number | string;
    baseName: string;
    quoteName: string;
  };
  reduceProfitBreakdown?: {
    unrealized: number;
    realized: number;
  };
  showProfitByAsset?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  showReduceProfitBreakdown?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  showCompoundBreakdown?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  transactionsFriendly?: {
    buy: string;
    sell: string;
    total: string;
  };
  compoundBreakdown?: {
    key: string;
    valueOrig: number;
    valueAdded: number;
  }[];
  compareBalaces?: () => void;
};

export type AdditionalMinigridData = {
  precision?: Precision;
  loadedPrices: boolean;
  exchangeName?: string;
  workingTime?: string;
};

export type BacktestingTab =
  | 'overview'
  | 'stats'
  | 'deals'
  | 'history'
  | 'config'
  | 'minigrids'
  | 'transactions'
  | 'equity curve'
  | 'analysis'
  | 'requests';

export type GridBacktestingTab =
  | 'info'
  | 'transactions'
  | 'history'
  | 'config'
  | 'equity curve'
  | 'requests';

export const startConditionsMap = {
  [StartConditionEnum.asap]: 'ASAP',
  [StartConditionEnum.manual]: 'Manual',
  [StartConditionEnum.timer]: 'Time-based',
  [StartConditionEnum.tradingviewSignals]: 'Webhook',
  [StartConditionEnum.ti]: 'Indicators',
};

export const startConditions = [
  StartConditionEnum.asap,
  StartConditionEnum.manual,
  StartConditionEnum.timer,
  StartConditionEnum.tradingviewSignals,
  StartConditionEnum.ti,
];

export const closeConditionsMap = {
  [CloseConditionEnum.tp]: 'Percentage',
  [CloseConditionEnum.techInd]: 'Indicators',
  [CloseConditionEnum.manual]: 'Manual',
  [CloseConditionEnum.webhook]: 'Webhook',
  [CloseConditionEnum.dynamicAr]: 'Dynamic ATR/ADR',
};

export enum APIPermission {
  read = 'read',
  write = 'write',
}

export enum TrackEventEnum {
  PAGE_VISIT = 'PAGE_VISIT',
}

export type userAPI = {
  _id?: string;
  created: Date;
  expired: Date;
  permission: APIPermission;
  name?: string;
  secret?: string;
};

export const intervals = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.eightH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

export const intervalMap = {
  [ExchangeIntervals.oneM]: '1 minute',
  [ExchangeIntervals.threeM]: '3 minutes',
  [ExchangeIntervals.fiveM]: '5 minutes',
  [ExchangeIntervals.fifteenM]: '15 minutes',
  [ExchangeIntervals.thirtyM]: '30 minutes',
  [ExchangeIntervals.oneH]: '1 hour',
  [ExchangeIntervals.twoH]: '2 hours',
  [ExchangeIntervals.fourH]: '4 hours',
  [ExchangeIntervals.eightH]: '8 hours',
  [ExchangeIntervals.oneD]: '1 day',
  [ExchangeIntervals.oneW]: '1 week',
};

export type Period = {
  name: string;
  to: number;
  from: number;
  _id: string;
  uuid: string;
};

export type DataGridFilterInput = {
  page?: number;
  pageSize?: number;
  sortModel?: any;
  filterModel?: { items: any[]; linkOperator?: string };
};

export type FavoritePairs = {
  provider: ExchangeEnum;
  pairs: string[];
};

type SentimentData = {
  positiveNews: number;
  negativeNews: number;
  neutralNews: number;
  sentiment: number;
  updateTime: Date;
};

export type ScreenerCoinData = {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChangePercentage1h: number;
  priceChangePercentage24h: number;
  marketCap: number;
  totalVolume: number;
  priceChangePercentage7d: number;
  priceChangePercentage30d: number;
  priceChangePercentage1y: number;
  category: string[];
  atlChangePercentage: number;
  athChangePercentage: number;
  marketCapChangePercentage24h: number;
  marketCapRank: number;
  liquidityScore: number;
  sentimentData30d?: SentimentData;
  sentimentData7d?: SentimentData;
  sentimentData24h?: SentimentData;
  volumeChange24h?: number;
  availablePresets?: boolean;
  volatility1d?: number;
  volatility3d?: number;
  volatility7d?: number;
  sparkline?: number[];
  exchanges?: ExchangeEnum[];
};

export type StoreCandles = {
  data: string;
  symbol: string;
  interval: ExchangeIntervals;
  periods: { from: number; to: number }[];
  size: number;
  id: string;
  exchange: ExchangeEnum;
  baseAsset: string;
  quoteAsset: string;
  firstTime?: number | undefined;
};

export type StoreBacktest = {
  data: string;
  size: number;
  id: string;
  exchange: ExchangeEnum;
  baseAsset: string;
  quoteAsset: string;
  symbol: string;
  type: string;
};

export type StoreHedgeSideBacktest = {
  exchange: ExchangeEnum;
  baseAsset: string;
  quoteAsset: string;
  symbol: string;
};

export type StoreHedgeBacktest = {
  data: string;
  size: number;
  id: string;
  long: StoreHedgeSideBacktest;
  short: StoreHedgeSideBacktest;
  type: string;
};

// ---------------------------------------------------------------------
// Hedge backtest persistence types — mirror legacy `dash/types/index.ts`.
// Hedge backtests run locally (HedgeBacktesting in @gainium/backtester);
// we ship a stripped "Short" summary to the server (no deals/profits/
// portfolio) and keep the full payload in IndexedDB via `saveHedge`.
// ---------------------------------------------------------------------

/**
 * Local mirror of `@gainium/backtester/dist/types`'s
 * `HedgeBacktestingResult`. The backtester returns this shape from
 * `HedgeBacktesting.test()`; we duplicate it here (rather than
 * re-exporting from the package) to keep `types/index.ts` self-contained,
 * matching the existing pattern with `DCABacktestingResult`.
 */
export interface HedgeBacktestingResult {
  longResult: DCABacktestingResult;
  shortResult: DCABacktestingResult;
  hedgeResult: Pick<
    DCABacktestingResult,
    'financial' | 'duration' | 'usage' | 'numerical' | 'ratios'
  >;
}

export type InputDCABotSettings = Omit<
  DCABotSettings,
  'ordersCount' | 'activeOrdersCount'
> & {
  ordersCount: number;
  activeOrdersCount: number;
};

export type InputComboBotSettings = Omit<
  ComboBotSettings,
  'ordersCount' | 'activeOrdersCount'
> & {
  ordersCount: number;
  activeOrdersCount: number;
};

export type HedgeDCABacktestSideConfig = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  settings: InputDCABotSettings;
  duration: HedgeBacktestingResult['longResult']['duration'] & {
    periodName?: string;
  };
};

export type HedgeComboBacktestSideConfig = Omit<
  HedgeDCABacktestSideConfig,
  'settings'
> & {
  settings: InputComboBotSettings;
};

export type HedgeBacktestResultSideShort = Omit<
  HedgeBacktestingResult['longResult'],
  'deals'
> & {
  deals?: HedgeBacktestingResult['longResult']['deals'];
};

export type HedgeDCABacktestingResultShort = {
  hedgeResult: HedgeBacktestingResult['hedgeResult'];
  longResult: HedgeBacktestResultSideShort;
  shortResult: HedgeBacktestResultSideShort;
  long: HedgeDCABacktestSideConfig;
  short: HedgeDCABacktestSideConfig;
  userId: string;
  time: number;
  savePermanent: boolean;
  config: BacktestingSettings;
};

export type HedgeComboBacktestingResultShort = Omit<
  HedgeDCABacktestingResultShort,
  'long' | 'short'
> & {
  long: HedgeComboBacktestSideConfig;
  short: HedgeComboBacktestSideConfig;
};

export type HedgeDCABacktestingResultHistory =
  HedgeDCABacktestingResultShort & {
    _id: string;
    serverSide?: boolean;
    shareId?: string;
    shared?: boolean;
    author?: string;
    sent?: boolean;
    note?: string;
  };

export type HedgeComboBacktestingResultHistory =
  HedgeComboBacktestingResultShort & {
    _id: string;
    serverSide?: boolean;
    shareId?: string;
    shared?: boolean;
    author?: string;
    sent?: boolean;
    note?: string;
  };

export type BacktestProgress = {
  step: number;
  progress: number;
  text: string;
};

export type DCAChartOrders = {
  price: number;
  side: string;
  qty: number;
  label?: string;
  greyLabel?: string;
  id: string;
  time: number;
  sl: boolean;
  acAfter?: number;
  acBefore?: number;
  reduceFunds: boolean;
  pair: string;
  provider?: ExchangeEnum;
};

export type DCARealChartOrders = {
  id: string;
  side: string;
  time: number;
  price: number;
  qty: number;
  status: string;
  label: string;
  dealId: string;
  sl: boolean;
  acAfter?: number;
  acBefore?: number;
  reduceFunds: boolean;
  pair: string;
  provider: ExchangeEnum;
};

export const MAX_DEALS_IN_BACKTEST = 20 * 1000;

export type ReturnGood<T> = { status: StatusEnum.ok; data: T; reason?: null };

export type ReturnBad = {
  status: StatusEnum.notok;
  data: null;
  reason: string;
};

export type BaseReturn<T = any> = ReturnGood<T> | ReturnBad;

export type AllPricesResponse = {
  pair: string;
  price: number;
};

export type DynamicArPrices = { id: string; value: number };

export enum RewardSectionEnum {
  daily = 'daily',
  gettingStarted = 'gettingStarted',
  community = 'community',
  contributions = 'contributions',
  spreadTheWord = 'spreadTheWord',
  connect = 'connect',
}

export enum RewardPeriodTypeEnum {
  day = 'day',
  week = 'week',
  month = 'month',
}

export enum RewardActionEnum {
  signUp = 'signUp',
  backtest = 'backtest',
  createABot = 'createABot',
  createLiveBot = 'createLiveBot',
}

export enum RewardPayloadTypeEnum {
  link = 'link',
  text = 'text',
  image = 'image',
}

export type Rewards = {
  section: RewardSectionEnum;
  name: string;
  description: string;
  amount: number;
  claimable: boolean;
  multiple: boolean;
  frequency?: {
    period: number;
    periodType: RewardPeriodTypeEnum;
  };
  link?: string;
  discourseBadgeId?: number;
  action: RewardActionEnum;
  payload: RewardPayloadTypeEnum;
  active: boolean;
  _id: string;
  submitText?: string;
  instructionText?: string;
};

export enum UserRewardsStatusEnum {
  achieved = 'achieved',
  collected = 'collected',
  submitted = 'submitted',
  rejected = 'rejected',
}

export type UserRewards = {
  userId: string;
  status: UserRewardsStatusEnum;
  reason?: string;
  multiply?: number;
  active: boolean;
  rewardId: string;
  amount: number;
  _id: string;
  lastAchieved?: number;
};

export type RewardCredit = {
  _id: string;
  cost: number;
  balance: number;
};

export type IOnChangeInputOverload = {
  (
    field: 'orderSizeType',
    value: OrderSizeTypeEnum,
    notModified?: boolean,
    both?: boolean,
    skipShared?: boolean
  ): Promise<void> | void;
  (
    field: keyof NonNullable<DCABotSettings>,
    value: string | string[] | number | boolean | OrderSizeTypeEnum,
    notModified?: boolean,
    both?: boolean,
    skipShared?: boolean
  ): Promise<void> | void;
};

export const limitPairs = 500;

export interface SelectedItemsState {
  [key: string]: boolean;
}

export const dashboardDefaultSelectedItems: SelectedItemsState = {
  'portfolio-value': true,
  profit: true,
  'terminal-deals': true,
  'bot-status': true,
  'hedge-combo-bots': true,
  'latest-orders': true,
  'latest-deals': true,
  'highest-earner-bots': true,
  'highest-loser-bots': true,
  bankroll: true,
};

export const activeStatuses = ['range', 'error', 'open'];
export enum GlobalVariablesTypeEnum {
  text = 'text',
  int = 'int',
  float = 'float',
}

export type RelatedBot = {
  id: string;
  name: string;
};

export type GlobalVariables = {
  id: string;
  name: string;
  type: GlobalVariablesTypeEnum;
  value: string;
  botAmount: number;
};

export type GlobalVariablesState = {
  variables: GlobalVariables[];
};

export type SetGlobalVariables = {
  type: typeof SET_GLOBAL_VARIABLES;
  payload: { variables: GlobalVariables[] };
};

export type DeleteGlobalVariables = {
  type: typeof DELETE_GLOBAL_VARIABLES;
  payload: { ids: string[] };
};

export type ClearGlobalVariables = {
  type: typeof CLEAR_GLOBAL_VARIABLES;
};

export type GlobalVariablesActionType =
  | SetGlobalVariables
  | ClearGlobalVariables
  | DeleteGlobalVariables;

export enum PaymentProviderEnum {
  paypal = 'paypal',
  stripe = 'stripe',
}

export type PaymentConfig = {
  provider: PaymentProviderEnum;
  key: string;
  /**
   * Discount percent applied to Bitcart crypto top-ups. The frontend
   * pre-discounts the requested amount before creating the invoice
   * (e.g. 5% means we create the invoice for `amount * 0.95`).
   * Server-side; admin-controlled. Undefined / 0 disables the discount.
   */
  cryptoDiscountPercent?: number;
};

export type Var = {
  id: string;
  name: string;
  value: string;
};

export type BotVars = {
  list: string[];
  paths: { path: VarBindingPath; variable: string }[];
};

export type VarToSearchType = 'text' | 'number' | 'int' | 'float';

export type RowGroupExpand = {
  groupingKey: string;
  groupingField: string;
  expanded: boolean;
};

export enum ResetAccountTypeEnum {
  whole = 'whole',
  paper = 'paper',
  live = 'live',
}

export type Snapshots = {
  updateTime: number;
  totalUsd: number;
  assets: {
    name: string;
    amount: number;
    amountUsd: number;
    exchanges?: {
      uuid: string;
      amount?: number;
      amountUsd?: number;
    }[];
  }[];
};

export type ChartOrderLine = {
  price: number;
  side: string;
  qty: number;
  lineSeries?: IOrderLineAdapter;
  label?: string;
  greyLabel?: string;
  noLabel?: boolean;
  lineStyle?: 'solid' | 'dotted';
  onPriceChange?: (newPrice: number, lineId: string) => void;
  onMove?: (newPrice: number, lineId: string) => void;
  onModify?: (newPrice: number, lineId: string) => void;
  isDraggable?: boolean;
  /** Optional explicit color override (hex or rgba). When provided supersedes side-derived color. */
  color?: string;
  /** Optional opacity (0-1) applied to line & body background for visual states like pending. */
  opacity?: number;
};

export type ChartOrderDrawing = {
  price: number;
  side: string;
  startTime: number;
  endTime: number;
  entity?: EntityId | null;
};

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export declare type Nominal<T, Name extends string> = T & {
  [Symbol.species]: Name;
};
export declare type ResolutionString = Nominal<string, 'ResolutionString'>;

export interface PeriodParams {
  from: number;
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

export type BotChartData = {
  symbol?: string;
  exchange?: ExchangeEnum;
  exchangeUUID?: string;
  botId?: string;
};

export interface CoinListItem {
  symbol: string;
  name: string;
  color: string;
  baseAsset?: string;
  quoteAsset?: string;
  // Human-readable name of the BASE asset (e.g. "Apple Inc.", "Bitcoin"),
  // resolved backend-side. Optional: absent until resolved; the UI falls back
  // to the ticker (`baseAsset`). Shown alongside the ticker in the pair picker.
  baseDisplayName?: string;
  subtitle?: string;
  isHelper?: boolean;
  // The base pair's exchange (ExchangeEnum value). Forwarded to CoinIcon so it
  // can venue-gate tokenized-stock ticker normalization (Bitget reality / Bybit
  // spot xstocks). Optional; only meaningful for stock/etf pairs.
  exchange?: string;
  // The pair's authoritative asset class ON ITS OWN EXCHANGE (from the pair
  // record). Set for pairs-mode items so the picker's asset-class filter is
  // exchange-correct — a base like `CAT` is a stock on Bitget but crypto on
  // OKX/Hyperliquid, so it must NOT be classified from a cross-exchange map.
  // Missing (coins mode / helpers) => treated as crypto.
  assetCategory?: AssetClass;
  // Canonical/curated-listing flag (HL spot only; missing elsewhere =>
  // canonical). Drives the picker's "Canonical only" toggle.
  isCanonical?: boolean;
  // Why this candidate can't be picked in the current context (e.g. its quote
  // asset doesn't match the bot's anchored quote). Present => the picker shows
  // the row dimmed and inert with this as its tooltip, rather than hiding it.
  disabledReason?: string;
  // Optional market-data enrichment (cloud only — populated from the
  // screener + curated-presets via the pairMarketData provider). All
  // optional so sh and coins-mode are unaffected.
  price?: number;
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
  change1h?: number;
  change24h?: number;
  change7d?: number;
  change30d?: number;
  volatility?: number;
  rsi?: number;
  /** Best positive curated-strategy ROI for this coin, percent. */
  roi?: number;
  isFavorite?: boolean;
}

export const ENTER_MARKET_TIMEOUT_GUARD: PrecisionGuard = {
  min: 1,
  max: 600,
  step: 1,
  decimals: 0,
  unit: 'sec',
  label: 'timeout range (1-600 seconds)',
};

export enum BuyTypeEnum {
  X = 'X',
  all = 'all',
  proceed = 'proceed',
  diff = 'diff',
  sellDiff = 'sellDiff',
}
