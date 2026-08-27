import type {
  BotStatus,
  BotTypesEnum,
  CreateHedgeComboBotInput,
  DataGridFilterInput,
  GridSortModel,
  GridFilterModel,
  Bot,
  DCABot,
  ComboBot,
  BotVars,
  HedgeBotSettings,
  DCABacktestingResultShort,
  GRIDBacktestingResultShort,
  BacktestingSettings,
  ServerSideBacktestPayload,
  CloseDCATypeEnum,
  ExchangeIntervals,
} from '../../types';
import type { ExchangeEnum } from '../../types/exchange.types';
import type { BotWebhookOption } from '../../types/webhook';
import {
  backtest,
  botFragment,
  comboBacktest,
  comboBotFragment,
  dcaBotFragment,
  dcaBotSettingsFragment,
  dcaMultiBotFragment,
  gridBacktest,
  hedgeComboBotFragment,
  orders,
  keyValue,
  varsFragment,
  dcaDealFragment,
  comboDealFragment,
  minigridSchema,
  comboBotByIdSettingsFragment,
  botSettings,
  sharedSettings,
  statsFragment,
  symbolsStatsFragment,
} from './GraphQLQueries-fragments';

/**
 * Stats-only selection for the live-bot Statistics tab.
 *
 * The bot detail drawer normally renders a bot taken from the LIST query, and
 * `dcaBotListFragment` deliberately strips `stats` down to a chart-only slice
 * (the full block is ~2.5 MB on a 482-bot account). So `stats.numerical` — the
 * whole Statistics tab — is simply absent on that path.
 *
 * Rather than un-strip the list payload, the Statistics tab fetches the same
 * `stats`/`symbolStats` fields for the ONE bot being looked at, lazily, when
 * the tab is opened. Same root queries as `getDCABot` & friends, just a much
 * smaller selection set.
 */
const statsOnlySelection = `_id
            stats ${statsFragment}
            symbolStats ${symbolsStatsFragment}`;

const botWebhookOptionsFragment = `
  trigger
  url
  method
  body
  uuid`;

type CreateBotInput = Omit<
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
  uuid?: string;
  vars?: BotVars | null;
};

export const botQueries = {
  getBotOrders: (input: {
    id: string;
    type: BotTypesEnum;
    status?: string;
    page?: number;
    pageSize?: number;
    shareId?: string;
  }) => {
    const query = `query getBotOrders($input: getBotOrdersInput!) {
      getBotOrders(input: $input) {
        status
        reason
        data {
          orders {${orders}}
          total
          page
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },
  moveGridToTerminal: (input: { gridId: string }) => {
    const query = `mutation moveGridToTerminal($input: moveGridToTerminalInput!) {
      moveGridToTerminal(input: $input) {
        status
        reason
        data
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  botDashboardStats: (input: { type: BotTypesEnum }) => {
    const query = `query botDashboardStats($input: botDashboardStatsInput!) {
                        botDashboardStats(input: $input) {
                            status
                            reason
                            data {
                              result {
                                status
                                count
                              }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  dealDashboardStats: (input: { type: BotTypesEnum; terminal?: boolean }) => {
    const query = `query dealDashboardStats($input: dealDashboardStatsInput!) {
                        dealDashboardStats(input: $input) {
                            status
                            reason
                            data {
                              result {
                                normal
                                inProfit
                                eighty
                                max
                                unrealizedProfit
                              }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getBot: (input: { id: string; shareId?: string }) => {
    const query = `query getBot($input: getBotInput!) {
                    getBot(input: $input) {
                        status
                        reason
                        data {${botFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getLeverageBracket: (input: { uuid: string }) => {
    const query = `query getLeverageBracket($input: getLeverageInput){
                    getLeverageBracketsByUUID(input: $input) {
                        status
                        reason
                        data {
                          symbol
                          leverage
                          step
                          min
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getDCABot: (input: { id: string; shareId?: string }) => {
    const query = `query getDCABot($input: getBotInput!) {
                    getDCABot(input: $input) {
                        status
                        reason
                        data {${dcaBotFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBot: (input: { id: string; shareId?: string }) => {
    const query = `query getComboBot($input: getBotInput!) {
                    getComboBot(input: $input) {
                        status
                        reason
                        data {${comboBotFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBot: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeComboBot($input: getBotInput!) {
                    getHedgeComboBot(input: $input) {
                        status
                        reason
                        data {${hedgeComboBotFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDCABot: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeDCABot($input: getBotInput!) {
                    getHedgeDCABot(input: $input) {
                        status
                        reason
                        data {${hedgeComboBotFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getDCABotStats: (input: { id: string; shareId?: string }) => {
    const query = `query getDCABot($input: getBotInput!) {
                    getDCABot(input: $input) {
                        status
                        reason
                        data {${statsOnlySelection}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotStats: (input: { id: string; shareId?: string }) => {
    const query = `query getComboBot($input: getBotInput!) {
                    getComboBot(input: $input) {
                        status
                        reason
                        data {${statsOnlySelection}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBotStats: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeComboBot($input: getBotInput!) {
                    getHedgeComboBot(input: $input) {
                        status
                        reason
                        data {${statsOnlySelection}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDCABotStats: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeDCABot($input: getBotInput!) {
                    getHedgeDCABot(input: $input) {
                        status
                        reason
                        data {${statsOnlySelection}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  /**
   * DCA-usage histogram for the DCA Analysis widget — the deal-derived half.
   *
   * Replaces walking `getBotDeals` pages (100 full deal documents at a time,
   * capped at 5 pages by the display loader) just to read one integer per
   * deal. main-app folds it in Mongo over EVERY deal the bot has ever had, so
   * the widget is no longer analysing whatever subset the loader happened to
   * reach. Buckets are raw used-DCA counts; clamping them to the bot's current
   * configured count stays on the client, in `useBotDcaProjection` territory.
   */
  getBotDcaUsage: (input: { id: string; shareId?: string }) => {
    const query = `query getBotDcaUsage($input: getBotDealsStatsInput!) {
                    getBotDcaUsage(input: $input) {
                        status
                        reason
                        data {
                            finished { dcas deals configured }
                            active { dcas deals configured }
                            maxConfiguredDcas
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotDcaUsage: (input: { id: string; shareId?: string }) => {
    const query = `query getComboBotDcaUsage($input: getBotDealsStatsInput!) {
                    getComboBotDcaUsage(input: $input) {
                        status
                        reason
                        data {
                            finished { dcas deals configured }
                            active { dcas deals configured }
                            maxConfiguredDcas
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getMultiPairDCABot: (input: { id: string; shareId?: string }) => {
    const query = `query getMultiPairDCABot($input: getBotInput!) {
                    getMultiPairDCABot(input: $input) {
                        status
                        reason
                        data {${dcaMultiBotFragment}}
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  restartBot: (input: { id: string; type: BotTypesEnum }) => {
    const query = `query restartBot($input: restartBotInput!) {
                    restartBot(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  restartMultiPairBot: (input: { id: string }) => {
    const query = `query restartMultiPairBot($input: restartMultiPairBotInput!) {
                    restartMultiPairBot(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  deleteBot: (input: { id: string; type?: BotTypesEnum }) => {
    const query = `mutation deleteBot($input: deleteBotInput!) {
                        deleteBot(input: $input) {
                            status
                            reason
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  deleteMultiPairBot: (input: { id: string }) => {
    const query = `mutation deleteMultiPairBot($input: deleteMultiPairBotInput!) {
      deleteMultiPairBot(input: $input) {
                            status
                            reason
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  deleteBotMessage: (input: { id?: string }) => {
    const query = `mutation deleteBotMessage($input: deleteBotMessageInput!) {
        deleteBotMessage(input: $input) {
            status
            reason
        }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getDCADeals: (input?: { terminal?: boolean }) => {
    const query = `query getDCADeals($input: getDCADealsInput) {
        getDCADeals(input: $input) {
            status
            reason
            data {
                result {
                    dcaBot{
                        exchange
                    }
                    levels{
                        complete
                        all
                    }
                    status
                    currentBalances {
                        base
                        quote
                    }
                    initialBalances {
                        base
                        quote
                    }
                    symbol {
                      symbol
                      quoteAsset
                    }
                    strategy
                    botId
                    botName
                    settings {
                      futures
                      coinm
                    }
                      usage {
                        current {
                          base
                          quote
                        }
                      }
                        exchangeUUID
                        initialPrice
                        createTime
                }
            }
        }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getComboDeals: () => {
    const query = `query getComboDeals{
        getComboDeals {
            status
            reason
            data {
                result {
                    dcaBot{
                        exchange
                    }
                    levels{
                        complete
                        all
                    }
                    status
                    currentBalances {
                        base
                        quote
                    }
                    initialBalances {
                        base
                        quote
                    }
                    symbol {
                      symbol
                      quoteAsset
                    }
                    strategy
                    botName
                    usage {
                      current {
                        base
                        quote
                      }
                      max {
                        base
                        quote
                      }
                    }
                    avgPrice
                    profit {
                      total
                      totalUsd
                      pureBase
                      pureQuote
                    }
                    feePaid {
                      base
                      quote
                    }
                    settings {
                      leverage
                      marginType
                      futures
                      coinm
                      profitCurrency
                    }
                    exchangeUUID
                    initialPrice
                    createTime
                }
            }
        }
    }`;
    return { query };
  },

  getHedgeComboDeals: () => {
    const query = `query getHedgeComboDeals{
        getHedgeComboDeals {
            status
            reason
            data {
                result {
                    dcaBot{
                        exchange
                    }
                    levels{
                        complete
                        all
                    }
                    status
                    currentBalances {
                        base
                        quote
                    }
                    initialBalances {
                        base
                        quote
                    }
                    symbol {
                      symbol
                      quoteAsset
                    }
                    strategy
                    botName
                    usage {
                      current {
                        base
                        quote
                      }
                      max {
                        base
                        quote
                      }
                    }
                    avgPrice
                    profit {
                      total
                      totalUsd
                      pureBase
                      pureQuote
                    }
                    feePaid {
                      base
                      quote
                    }
                    settings {
                      leverage
                      marginType
                      futures
                      coinm
                      profitCurrency
                    }
                    exchangeUUID
                    initialPrice
                    createTime
                }
            }
        }
    }`;
    return { query };
  },

  getHedgeDcaDeals: () => {
    const query = `query getHedgeDcaDeals{
        getHedgeDcaDeals {
            status
            reason
            data {
                result {
                    dcaBot{
                        exchange
                    }
                    levels{
                        complete
                        all
                    }
                    status
                    currentBalances {
                        base
                        quote
                    }
                    initialBalances {
                        base
                        quote
                    }
                    symbol {
                      symbol
                      quoteAsset
                    }
                    strategy
                    botName
                    usage {
                      current {
                        base
                        quote
                      }
                      max {
                        base
                        quote
                      }
                    }
                    avgPrice
                    profit {
                      total
                      totalUsd
                      pureBase
                      pureQuote
                    }
                    feePaid {
                      base
                      quote
                    }
                    settings {
                      leverage
                      marginType
                      futures
                      coinm
                      profitCurrency
                    }
                    exchangeUUID
                    initialPrice
                    createTime
                }
            }
        }
    }`;
    return { query };
  },

  createComboBot: (input: CreateHedgeComboBotInput) => {
    const query = `mutation createComboBot($input: createComboBotInput!) {
            createComboBot(input: $input) {
                status
                reason
                data {
                    ${comboBotFragment}
                }
            }
        }`;
    const variables = { input };
    return { query, variables };
  },

  botList: (
    input?: { status?: BotStatus[]; dataGridInput?: DataGridFilterInput },
    fields?: string
  ) => {
    const query = `query botList($input: getDcaBotListInput) {
                        botList(input: $input) {
                            status
                            reason
                            total
                            data {
                               ${
                                 fields ??
                                 ` _id
                                userId
                                status
                                statusReason
                                settings {
                                    name
                                    pair
                                    topPrice
                                    lowPrice
                                    levels
                                    gridStep
                                    budget
                                    ordersInAdvance
                                    useOrderInAdvance
                                    prioritize
                                    profitCurrency
                                    orderFixedIn
                                    sellDisplacement
                                    futures
                                    coinm
                                }
                                exchange
                                exchangeUUID
                                created
                                updated
                                assets {
                                    used {
                                        base
                                        quote
                                    }
                                    required {
                                        base
                                        quote
                                    }
                                }
                                initialPrice
                                created
                                initialBalances {
                                    base
                                    quote
                                }
                                currentBalances {
                                    base
                                    quote
                                }
                                levels {
                                    active {
                                        buy
                                        sell
                                    }
                                    all {
                                        buy
                                        sell
                                    }
                                }
                                workingShift {
                                    start
                                    end
                                }
                                transactionsCount {
                                    buy
                                    sell
                                }
                                usdRate
                                lastPrice
                                lastUsdRate
                                profit {
                                    total
                                    totalUsd
                                }
                                symbol {
                                    symbol
                                    baseAsset
                                    quoteAsset
                                }
                                profitToday {
                                    start
                                    end
                                    totalToday
                                    totalTodayUsd
                                }
                                public`
                               }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  dcaBotList: (
    input?: {
      all?: boolean;
      status?: BotStatus[];
      dataGridInput?: DataGridFilterInput;
    },
    fields?: string
  ) => {
    const query = `query dcaBotList($input: getDcaBotListInput) {
                        dcaBotList(input: $input) {
                            status
                            reason
                            total
                            data {

                                ${fields ?? dcaDealFragment}

                            }

                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  comboBotList: (
    input?: {
      all?: boolean;
      status?: BotStatus[];
      dataGridInput?: DataGridFilterInput;
    },
    fields?: string
  ) => {
    const query = `query comboBotList($input: getDcaBotListInput) {
                        comboBotList(input: $input) {
                            status
                            reason
                            total
                            data {

                                ${fields ?? comboDealFragment}

                            }

                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  hedgeComboBotList: (
    input?: {
      all?: boolean;
      status?: BotStatus[];
      dataGridInput?: DataGridFilterInput;
    },
    fields?: string
  ) => {
    const query = `query hedgeComboBotList($input: getDcaBotListInput) {
                        hedgeComboBotList(input: $input) {
                            status
                            reason
                            total
                            data {
                                ${fields ?? hedgeComboBotFragment}

                            }

                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  hedgeDCABotList: (
    input?: {
      all?: boolean;
      status?: BotStatus[];
      dataGridInput?: DataGridFilterInput;
    },
    fields?: string
  ) => {
    const query = `query hedgeDCABotList($input: getDcaBotListInput) {
                        hedgeDCABotList(input: $input) {
                            status
                            reason
                            total
                            data {
                                ${fields ?? hedgeComboBotFragment}

                            }

                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getTradingTerminalBotsList: () => {
    const query = `query getTradingTerminalBotsList{
        getTradingTerminalBotsList {
            status
            reason
            data {
                _id
                settings {
                    name
                    pair
                    strategy
                    type
                    futures
                    coinm
                }
                status
                statusReason
                exchange
                exchangeUUID
                symbol {
                  key
                  value {
                    symbol
                    baseAsset
                    quoteAsset
                  }
                }
                profit {
                    total
                    totalUsd
                    pureBase
                    pureQuote
                }
                dealsInBot {
                    active
                    all
                }
                usage {
                    current {
                        base
                        quote
                    }
                    max {
                        base
                        quote
                    }
                }
                public
                currentBalances {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
                initialBalances {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
                created
            }
        }
    }`;
    return { query };
  },

  // Backtest queries
  getBacktests: (input?: DataGridFilterInput) => {
    const query = `query getBacktests($input: DataGridFilterInput){ 
                    getBacktests(input: $input) {
                        status
                        reason
                        data {
                            ${backtest}
                        }
                        total
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBacktests: (input?: DataGridFilterInput) => {
    const query = `query getComboBacktests($input: DataGridFilterInput){ 
                    getComboBacktests(input: $input) {
                        status
                        reason
                        data {
                            ${comboBacktest}
                        }
                        total
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getGridBacktests: (input?: DataGridFilterInput) => {
    const query = `query getGridBacktests($input: DataGridFilterInput){ 
                    getGridBacktests(input: $input) {
                        status
                        reason
                        data {
                            ${gridBacktest}
                        }
                        total
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getBacktestByShareId: (input: { shareId: string }) => {
    const query = `query getBacktestByShareId($input: getBacktestsInput!){ 
                    getBacktestByShareId(input: $input) {
                        status
                        reason
                        data {
                            ${backtest}
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBacktestByShareId: (input: { shareId: string }) => {
    const query = `query getComboBacktestByShareId($input: getBacktestsInput!){
                    getComboBacktestByShareId(input: $input) {
                        status
                        reason
                        data {
                            ${comboBacktest}
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  getGridBacktestByShareId: (input: { shareId: string }) => {
    const query = `query getGridBacktestByShareId($input: getBacktestsInput!){
                    getGridBacktestByShareId(input: $input) {
                        status
                        reason
                        data {
                            ${gridBacktest}
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  deleteBacktests: (input: { ids: string[] }) => {
    const query = `mutation deleteBacktests($input: deleteBacktestsInput!) { 
                    deleteBacktests(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  deleteComboBacktests: (input: { ids: string[] }) => {
    const query = `mutation deleteComboBacktests($input: deleteBacktestsInput!) { 
                    deleteComboBacktests(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  shareBacktest: (input: { _id: string }) => {
    const query = `mutation shareBacktest($input: shareBacktestInput!) { 
                    shareBacktest(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  shareComboBacktest: (input: { _id: string }) => {
    const query = `mutation shareComboBacktest($input: shareBacktestInput!) {
                    shareComboBacktest(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  shareGridBacktest: (input: { _id: string }) => {
    const query = `mutation shareGridBacktest($input: shareBacktestInput!) {
                    shareGridBacktest(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  requestOnboardingBacktest: (input: {
    presets: {
      id: string;
      type: BotTypesEnum;
      exchange: ExchangeEnum;
      from?: number;
      to?: number;
      interval?: ExchangeIntervals;
      fromBacktest?: boolean;
      trades?: boolean;
    }[];
  }) => {
    const query = `mutation requestOnboardingBacktest($input:requestOnboardingBacktestInput!) { 
                        requestOnboardingBacktest(input: $input) {
                            status
                            reason
                            data 
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Backtest creation mutations
  saveBacktest: (
    input: DCABacktestingResultShort & {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      userId: string;
      time: number;
      savePermanent: boolean;
      config: BacktestingSettings;
      exchange: string;
      exchangeUUID: string;
      settings: CreateBotInput;
    }
  ) => {
    const query = `mutation saveBacktest($input: backtestInput!) { 
                    saveBacktest(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },
  saveGridBacktest: (
    input: GRIDBacktestingResultShort & {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      userId: string;
      time: number;
      savePermanent: boolean;
      config: BacktestingSettings;
      exchange: string;
      exchangeUUID: string;
      settings: Bot['settings'];
    }
  ) => {
    const query = `mutation saveGridBacktest($input: gridBacktestInput!) { 
                    saveGridBacktest(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },
  requestServerSideBacktest: (input: {
    payload: ServerSideBacktestPayload;
    symbols: { pair: string; quoteAsset: string; baseAsset: string }[];
  }) => {
    const query = `mutation requestServerSideBacktest($input:requestServerSideBacktestInput!) { 
                        requestServerSideBacktest(input: $input) {
                            status
                            reason
                            data 
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },
  // Get DCA Bot Settings for editing - investigating 400 error
  getDCABotSettings: (input: { botId: string; shareId?: string }) => {
    const query = `query getDCABotSettings($input: getBotSettingsInput!) { 
      getDCABotSettings(input: $input) {
        status
        reason
        data {
          settings {
            ${dcaBotSettingsFragment}
          }
          exchange
          exchangeUUID
          baseAsset
          quoteAsset
          created
          updated
          vars {${varsFragment}}
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  // Order Management Queries

  // Order Management Mutations
  cancelTerminalDealOrder: (input: { dealId: string; orderId: string }) => {
    const query = `mutation cancelTerminalDealOrder($input: cancelTerminalDealOrderInput!) { 
                    cancelTerminalDealOrder(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  cancelPendingAddFundsDealOrder: (input: {
    dealId: string;
    botId: string;
    orderId: string;
  }) => {
    const query = `mutation cancelPendingAddFundsDealOrder($input: cancelTerminalDealOrderInput!) { 
                    cancelPendingAddFundsDealOrder(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // Deal Management Mutations
  closeDCADeal: (input: {
    dealId: string;
    type: CloseDCATypeEnum;
    botId: string;
  }) => {
    const query = `mutation closeDCADeal($input: closeDCADeal!) { 
                    closeDCADeal(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  closeComboDeal: (input: {
    dealId: string;
    type: CloseDCATypeEnum;
    botId: string;
  }) => {
    const query = `mutation closeComboDeal($input: closeDCADeal!) { 
                    closeComboDeal(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  closeMultiPairDCADeal: (input: { dealId: string; type: string }) => {
    const query = `mutation closeMultiPairDCADeal($input: closeDCADeal!) { 
                    closeMultiPairDCADeal(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // Profit Chart Data Query
  // Backend `getBotProfitChartDataInput` does not accept `shareId` — strip it
  // before sending. The `demo` token header + parent share context still
  // authorize the request (mirrors main-dash/fetch/query.ts:7698).
  getBotProfitChartData: (input: {
    id: string;
    type: BotTypesEnum;
    shareId?: string;
  }) => {
    const query = `query getBotProfitChartData($input: getBotProfitChartDataInput!) {
      getBotProfitChartData(input: $input) {
        status
        reason
        data {
          value
          time
        }
      }
    }`;
    const { shareId: _shareId, ...rest } = input;
    void _shareId;
    const variables = { input: rest };
    return { query, variables };
  },

  // Bot Events Query
  // Backend `getBotEventsInput` does not accept `shareId` — strip it before
  // sending. Demo-token header still authorizes the request when a share
  // context is active (mirrors main-dash/fetch/query.ts:3863).
  getBotEvents: (input: {
    botId: string;
    page?: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
    hedge?: boolean;
    combo?: boolean;
    shareId?: string;
    category?: 'recent' | 'deals' | 'alerts';
  }) => {
    const query = `query getBotEvents($input: getBotEventsInput!) {
      getBotEvents(input: $input) {
        status
        reason
        data {
          botId
          botType
          userId
          event
          description
          type
          created
          metadata
          deal
          symbol
          _id
        }
        total
        counts {
          recent
          deals
          alerts
        }
      }
    }`;
    const { shareId: _shareId, ...rest } = input;
    void _shareId;
    const variables = { input: rest };
    return { query, variables };
  },

  // ===== AUTO-ADDED MISSING FUNCTIONS =====
  // Added by API Enhancer - DO NOT EDIT MANUALLY

  searchByBotName: (input: { type: BotTypesEnum; search: string }) => {
    const query = `query searchByBotName($input:searchByBotNameInput!) { 
  searchByBotName(input: $input) {
  status
  reason
  data {
  id
  name
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getBotTransactions: (
    input: {
      id: string;
      shareId?: string;
      page: number;
    },
    fields?: string
  ) => {
    const query = `query getBotTransactions($input: getBotTransactionsInput!) { 
  getBotTransactions(input: $input) {
  status
  reason
  data {
  transactions {
  ${
    fields ??
    `_id
  updateTime
  side
  amountBaseBuy
  amountQuoteBuy
  amountBaseSell
  amountQuoteSell
  idBuy
  idSell
  priceBuy
  priceSell
  feeBase
  feeQuote
  profitBase
  profitQuote
  botId
  userId
  symbol
  baseAsset
  quoteAsset
  profitCurrency
  profitUsdt
  cummulativeProfitBase
  cummulativeProfitQuote
  cummulativeProfitUsdt`
  }
  }
  page
  total
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getBotAvgPriceLines: (input: {
    botId: string;
    type: BotTypesEnum;
    shareId?: string;
  }) => {
    const query = `query getBotAvgPriceLines($input: getBotAvgPriceLinesInput!) {
  getBotAvgPriceLines(input: $input) {
  status
  reason
  data {
  avgPrice {
  price
  label
  symbol
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getBotHistoryLines: (input: {
    botId: string;
    type: BotTypesEnum;
    dealId?: string;
    page?: number;
    shareId?: string;
  }) => {
    const query = `query getBotHistoryLines($input: getBotHistoryLinesInput!) { 
  getBotHistoryLines(input: $input) {
  status
  reason
  data {
  lines {
  botId
  userId
  dealId
  type
  startTime
  filledTime
  side
  orderId
  price
  }
  page
  total
  }
  }
  }`;
    const normalizedInput = { ...input, page: input.page ?? 0 };
    const variables = { input: normalizedInput };
    return { query, variables };
  },

  getIndicatorEventsHistory: (input: {
    botId: string;
    botType: BotTypesEnum;
    page?: number;
    shareId?: string;
  }) => {
    const query = `query getIndicatorEventsHistory($input: getInidcatorEventsHistoryLinesInput!) { 
  getInidcatorEventsHistory(input: $input) {
  status
  reason
  data {
  history {
  botId
  userId
  type
  side
  time
  price
  symbol
  }
  page
  total
  }
  }
  }`;
    const normalizedInput = { ...input, page: input.page ?? 0 };
    const variables = { input: normalizedInput };
    return { query, variables };
  },

  getBotDeals: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
  }) => {
    const query = `query getBotDeals($input: getBotDealsInput!) { 
  getBotDeals(input: $input) {
  status
  reason
  data {
  deals {
  ${dcaDealFragment}
  }
  page
  total
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotDeals: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
  }) => {
    const query = `query getComboBotDeals($input: getBotDealsInput!) { 
  getComboBotDeals(input: $input) {
  status
  reason
  data {
  deals {
  ${comboDealFragment}
  }
  page
  total
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBotDeals: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
  }) => {
    const query = `query getHedgeComboBotDeals($input: getBotDealsInput!) { 
  getHedgeComboBotDeals(input: $input) {
  status
  reason
  data {
  deals {
  ${comboDealFragment}
  }
  page
  total
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDcaBotDeals: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
  }) => {
    const query = `query getHedgeDcaBotDeals($input: getBotDealsInput!) { 
  getHedgeDcaBotDeals(input: $input) {
  status
  reason
  data {
  deals {
  ${comboDealFragment}
  }
  page
  total
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotDealsById: (input: { botId: string; id: string[] }) => {
    const query = `query getComboBotDealsById($input: getComboBotDealsByIdInput!) { 
  getComboBotDealsById(input: $input) { status
  reason
  data {
  deals {
  ${comboDealFragment}
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getDCABotDealsById: (input: { botId: string; id: string[] }) => {
    const query = `query getDCABotDealsById($input: getComboBotDealsByIdInput!) { 
  getDCABotDealsById(input: $input) {
  status
  reason
  data {
  deals {
  ${dcaDealFragment}
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getBotDealsStats: (input: { id: string; shareId?: string }) => {
    const query = `query getBotDealsStats($input: getBotDealsStatsInput!) { 
  getBotDealsStats(input: $input) {
  status
  reason
  data {
  stats {
  avgUsage
  avgProfit
  avgTradingTime
  avgTimeInLoss
  avgTimeInProfit
  winRate
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotDealsStats: (input: { id: string; shareId?: string }) => {
    const query = `query getComboBotDealsStats($input: getBotDealsStatsInput!) { 
  getComboBotDealsStats(input: $input) {
  status
  reason
  data {
  stats {
  avgUsage
  avgProfit
  avgTradingTime
  avgTimeInLoss
  avgTimeInProfit
  winRate
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBotDealsStats: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeComboBotDealsStats($input: getBotDealsStatsInput!) { 
  getHedgeComboBotDealsStats(input: $input) {
  status
  reason
  data {
  stats {
  avgUsage
  avgProfit
  avgTradingTime
  avgTimeInLoss
  avgTimeInProfit
  winRate
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDCABotDealsStats: (input: { id: string; shareId?: string }) => {
    const query = `query getHedgeDCABotDealsStats($input: getBotDealsStatsInput!) { 
  getHedgeDCABotDealsStats(input: $input) {
  status
  reason
  data {
  stats {
  avgUsage
  avgProfit
  avgTradingTime
  avgTimeInLoss
  avgTimeInProfit
  winRate
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboBotMinigrids: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
  }) => {
    const query = `query getComboBotMinigrids($input: getBotDealsInput!) { 
  getComboBotMinigrids(input: $input) {
  status
  reason
  data {
  ${minigridSchema}  
  }
  total
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBotMinigrids: (input: {
    id: string;
    shareId?: string;
    status: string;
    page: number;
  }) => {
    const query = `query getHedgeComboBotMinigrids($input: getBotDealsInput!) { 
  getHedgeComboBotMinigrids(input: $input) {
  status
  reason
  data {
  ${minigridSchema}  
  }
  total
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getProfitByBot: (input: {
    botId: string;
    timezone?: string;
    timeframe?: number;
    botType?: BotTypesEnum;
  }) => {
    const query = `query getProfitByBot($input: getProfitByBot!) {
  getProfitByBot(input:$input){
  status
  reason
  data{
  result{
  profitUsd
  quote
  base
  date
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getMessageBot: (input?: {
    unreadOnly?: boolean;
    page?: number;
    pageSize?: number;
    search?: string;
  }) => {
    const query = `query getMessageBot ($input: getMessageBotInput){
  getMessageBot(input: $input) {
  status
  reason
  data {
  result {
  _id
  userId
  botId
  botType
  botName
  message
  time
  type
  paperContext
  terminal

  symbol
  exchange
  }
  }
  total
  }
  } `;
    const variables = { input };
    return { query, variables };
  },

  getComboBotSettings: (input: { botId: string; shareId?: string }) => {
    const query = `query getComboBotSettings($input: getBotSettingsInput!) { 
  getComboBotSettings(input: $input) {
  status
  reason
  data {
  ${comboBotByIdSettingsFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBotSettings: (input: { botId: string; shareId?: string }) => {
    const query = `query getHedgeComboBotSettings($input: getBotSettingsInput!) { 
  getHedgeComboBotSettings(input: $input) {
  status
  reason
  data {
  long {
  ${comboBotByIdSettingsFragment}
  }
  short {
  ${comboBotByIdSettingsFragment}
  }
  sharedSettings{${sharedSettings}}
  created
  updated
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDCABotSettings: (input: { botId: string; shareId?: string }) => {
    const query = `query getHedgeDCABotSettings($input: getBotSettingsInput!) { 
  getHedgeDCABotSettings(input: $input) {
  status
  reason
  data {
  long {
  ${comboBotByIdSettingsFragment}
  }
  short {
  ${comboBotByIdSettingsFragment}
  }
  sharedSettings{${sharedSettings}}
  created
  updated
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getGridBotSettings: (input: { botId: string; shareId?: string }) => {
    const query = `query getGridBotSettings($input: getBotSettingsInput!) { 
  getGridBotSettings(input: $input) {
  status
  reason
  data {
  settings {
  ${botSettings}
  }
  exchange
  exchangeUUID
  baseAsset
  quoteAsset
  created
  updated
  vars {${varsFragment}}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getGlobalVariableRelatedBots: (input: { id: string }) => {
    const query = `
  query getGlobalVariableRelatedBots($input: getGlobalVariableRelatedBotsInput!) {
  getGlobalVariableRelatedBots(input: $input) {
  status
  reason
  data {
  type
  total
  bots {
  _id
  name
  status
  paperContext
  }
  }
  }
  }
  `;
    const variables = { input };
    return { query, variables };
  },

  getUserAvailableBotsNumber: (input: {
    type: BotTypesEnum;
    uuid?: string;
    premium?: boolean;
  }) => {
    const query = `query getUserAvailableBotsNumber($input:getUserAvailableBotsNumberInput!) { 
  getUserAvailableBotsNumber(input: $input) {
  status
  reason
  data {
  availableBots
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createBot: (
    input: Bot['settings'] & {
      baseAsset: string;
      quoteAsset: string;
      exchange: ExchangeEnum;
      exchangeUUID: string;
      vars?: BotVars | null;
    }
  ) => {
    const query = `mutation createBot($input: createBotInput!) { 
  createBot(input: $input) {
  status
  reason
  data {
  botId
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeBot: (
    input: {
      id: string;
      initialPrice?: number;
      buyType?: string;
      buyCount?: string;
      buyAmount?: number;
      vars?: BotVars | null;
    } & Partial<Bot['settings']>
  ) => {
    const query = `mutation changeBot($input: changeBotInput!) { 
  changeBot(input: $input) {
  status
  reason
  data {${botFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createDCABot: (input: CreateBotInput) => {
    const query = `mutation createDCABot($input: createDCABotInput!) { 
  createDCABot(input: $input) {
  status
  reason
  data {
  ${dcaBotFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createHedgeComboBot: (input: {
    long: CreateHedgeComboBotInput;
    short: CreateHedgeComboBotInput;
    sharedSettings?: HedgeBotSettings;
  }) => {
    const query = `mutation createHedgeComboBot($input: createHedgeComboBotInput!) { 
  createHedgeComboBot(input: $input) {
  status
  reason
  data {
  ${hedgeComboBotFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createHedgeDCABot: (input: {
    long: CreateHedgeComboBotInput;
    short: CreateHedgeComboBotInput;
    sharedSettings?: HedgeBotSettings;
  }) => {
    const query = `mutation createHedgeDCABot($input: createHedgeComboBotInput!) { 
  createHedgeDCABot(input: $input) {
  status
  reason
  data {
  ${hedgeComboBotFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createMultiPairDCABot: (
    input: Omit<
      DCABot['settings'],
      'ordersCount' | 'activeOrdersCount' | 'pair' | 'baseAsset' | 'quoteAsset'
    > & {
      pairs?: string[];
      baseAssets: string[];
      quoteAssets: string[];
      ordersCount: number;
      activeOrdersCount: number;
      exchange: ExchangeEnum;
      exchangeUUID: string;
    }
  ) => {
    const query = `mutation createMultiPairDCABot($input: createMultiPairDCABotInput!) { 
  createMultiPairDCABot(input: $input) {
  status
  reason
  data {
  ${dcaMultiBotFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeDCABot: (
    input: { id: string; vars?: BotVars | null } & Partial<DCABot['settings']>
  ) => {
    const query = `mutation changeDCABot($input: changeDCABotInput!) { 
  changeDCABot(input: $input) {
  status
  reason
  data {${dcaBotFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeComboBot: (
    input: { id: string; vars?: BotVars | null } & Partial<ComboBot['settings']>
  ) => {
    const query = `mutation changeComboBot($input: changeComboBotInput!) { 
  changeComboBot(input: $input) {
  status
  reason
  data {${comboBotFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeHedgeComboBot: (input: {
    long: { id: string; vars?: BotVars | null } & Partial<ComboBot['settings']>;
    short: { id: string; vars?: BotVars | null } & Partial<
      ComboBot['settings']
    >;
    id: string;
    sharedSettings?: HedgeBotSettings;
  }) => {
    const query = `mutation changeHedgeComboBot($input: changeHedgeComboBotInput!) { 
  changeHedgeComboBot(input: $input) {
  status
  reason
  data {${hedgeComboBotFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeHedgeDCABot: (input: {
    long: { id: string; vars?: BotVars | null } & Partial<ComboBot['settings']>;
    short: { id: string; vars?: BotVars | null } & Partial<
      ComboBot['settings']
    >;
    id: string;
    sharedSettings?: HedgeBotSettings;
  }) => {
    const query = `mutation changeHedgeDCABot($input: changeHedgeComboBotInput!) { 
  changeHedgeDCABot(input: $input) {
  status
  reason
  data {${hedgeComboBotFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeMultiPairDCABot: (
    input: { id: string } & Partial<DCABot['settings'] & { pairs: string[] }>
  ) => {
    const query = `mutation changeMultiPairDCABot($input: changeMultiPairDCABotInput!) { 
  changeMultiPairDCABot(input: $input) {
  status
  reason
  data {${dcaMultiBotFragment}}
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeBotShare: (input: {
    botId: string;
    type: BotTypesEnum;
    share: boolean;
  }) => {
    const query = `mutation changeBotShare($input: changeBotShareInput!) { 
  changeBotShare(input: $input) {
  status
  reason
  data {
  share
  shareId
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeMultiPairBotShare: (input: { botId: string; share: boolean }) => {
    const query = `mutation changeMultiPairBotShare($input: changeMultiPairBotShareInput!) { 
  changeMultiPairBotShare(input: $input) {
  status
  reason
  data {
  share
  shareId
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  // Outgoing webhook options (one option per trigger). Persisted via a
  // dedicated mutation, independent of the main bot save — mirrors
  // main-dash's webhookDialog flow.
  getBotWebhookOptions: (input: { botId: string }) => {
    const query = `query getBotWebhookOptions($input: getBotWebhookOptionsInput!) {
      getBotWebhookOptions(input: $input) {
        status
        reason
        data {${botWebhookOptionsFragment}}
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  updateBotWebhookOptions: (input: {
    options: BotWebhookOption[];
    botId: string;
  }) => {
    const query = `mutation updateBotWebhookOptions($input: botWebhookOptionsInput!) {
      updateBotWebhookOptions(input: $input) {
        status
        reason
        data {${botWebhookOptionsFragment}}
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getBotWebhookLogs: (input: { botId: string }) => {
    const query = `query getBotWebhookLogs($input: getBotWebhookOptionsInput!) {
      getBotWebhookLogs(input: $input) {
        status
        reason
        data {
          _id
          optionUuid
          requestBody
          responseBody
          status
          trigger
          method
          url
          created
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },
};
