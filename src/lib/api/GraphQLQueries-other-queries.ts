import type {
  ExchangeEnum,
  GridSortModel,
  GridFilterModel,
  DataGridFilterInput,
  UserState,
  BotTypesEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  StrategyEnum,
  ActionsEnum,
  APIPermission,
  TrackEventEnum,
  SurveyResult,
  ChangeAlertsInput,
  BotOrderSideEnum,
  GlobalVariablesTypeEnum,
  ResetAccountTypeEnum,
  ExchangeIntervals,
  IndicatorEnum,
  BuyTypeEnum,
  HedgeDCABacktestingResultShort,
  HedgeComboBacktestingResultShort,
} from '../../types';

import {
  credits,
  exchangeFragment,
  payout,
  backtest,
  comboBacktest,
  gridBacktest,
  apiKeysFragment,
} from './GraphQLQueries-fragments';

export type ChangeStatusInput = {
  id: string;
  status: 'open' | 'closed';
  cancelPartiallyFilled?: boolean;
  type?: BotTypesEnum;
  closeType?: CloseDCATypeEnum;
  buyType?: BuyTypeEnum;
  buyCount?: string;
  buyAmount?: number;
  closeGridType?: CloseGRIDTypeEnum;
  hedgeConfig?: { [x in StrategyEnum]: ActionsEnum };
};

// Hedge backtest selection — mirrors legacy
// `dash/fetch/query.ts` fragments (financial/duration/usage/numerical/
// ratios + per-leg result + side configs). Deals/profits/portfolio are
// intentionally excluded — those are stripped before save and only
// survive locally in IndexedDB.
const HEDGE_BACKTEST_FINANCIAL = `netProfitTotal
  netProfitTotalUsd
  grossProfit
  grossProfitUsd
  grossLoss
  grossLossUsd
  avgGrossProfit
  avgGrossProfitUsd
  avgGrossLoss
  avgGrossLossUsd
  avgNetProfit
  avgNetProfitUsd
  avgNetDaily
  avgNetDailyUsd
  unrealizedPnL
  unrealizedPnLUsd
  unrealizedPnLPerc
  maxDealProfit
  maxDealLoss
  maxDealProfitUsd
  maxDealLossUsd
  maxRunUp
  maxRunUpUsd
  maxDrawDown
  maxDrawDownUsd
  maxDrawDownEquityUsd
  maxDrawDownEquityPerc
  netProfitTotalPerc
  grossProfitPerc
  grossLossPerc
  avgGrossProfitPerc
  avgGrossLossPerc
  avgNetProfitPerc
  avgNetDailyPerc
  annualizedReturn
  maxDealProfitPerc
  maxDealLossPerc
  maxRunUpPerc
  maxDrawDownPerc
  initialBalanceUsd
  stDevWinningTrade
  stDevLosingTrade
  stDownDevLosingTrade
  unrealizedUsage`;

const HEDGE_BACKTEST_DURATION = `avgDealDuration
  avgSplitDealDuration { d h min s }
  firstDataTime
  lastDataTime
  loadingDataTime
  processingDataTime
  botWorkingTime { d h min s }
  botWorkingTimeNumber
  maxDealDuration { d h min s }
  periodName
  avgWinningTrade
  maxWinningTrade
  avgLosingTrade
  maxLosingTrade`;

const HEDGE_BACKTEST_USAGE = `maxTheoreticalUsage
  maxRealUsage
  avgRealUsage
  maxTheoreticalUsageWithRate`;

const HEDGE_BACKTEST_NUMERICAL = `all
  profit
  loss
  open
  closed
  maxConsecutiveWins
  maxConsecutiveLosses
  maxDCATriggered
  avgDCATriggered
  dealsPerDay
  coveredPriceDeviation
  actualPriceDeviation
  liquidationEvents
  confidenceGrade
  dealsForConfidenceGrade
  priceDeviation`;

const HEDGE_BACKTEST_RATIOS = `profitFactor
  profitByPeriod
  buyAndHold { value valueUsd perc }
  periodRatio
  sharpe
  sortino
  cwr`;

const HEDGE_BACKTEST_HEDGE_RESULT = `financial { ${HEDGE_BACKTEST_FINANCIAL} }
  duration { ${HEDGE_BACKTEST_DURATION} }
  usage { ${HEDGE_BACKTEST_USAGE} }
  numerical { ${HEDGE_BACKTEST_NUMERICAL} }
  ratios { ${HEDGE_BACKTEST_RATIOS} }`;

const HEDGE_BACKTEST_SIDE_RESULT = `noData
  maxLeverage
  financial { ${HEDGE_BACKTEST_FINANCIAL} }
  duration { ${HEDGE_BACKTEST_DURATION} }
  usage { ${HEDGE_BACKTEST_USAGE} }
  numerical { ${HEDGE_BACKTEST_NUMERICAL} }
  ratios { ${HEDGE_BACKTEST_RATIOS} }
  interval
  quoteRate
  multi`;

const HEDGE_BACKTEST_SIDE_CONFIG = `symbol
  baseAsset
  quoteAsset
  exchange
  exchangeUUID
  duration { ${HEDGE_BACKTEST_DURATION} }
  settings {
    futures
    coinm
    profitCurrency
  }`;

const HEDGE_BACKTEST_HISTORY_FIELDS = `_id
  serverSide
  userId
  time
  savePermanent
  note
  shareId
  hedgeResult { ${HEDGE_BACKTEST_HEDGE_RESULT} }
  longResult { ${HEDGE_BACKTEST_SIDE_RESULT} }
  shortResult { ${HEDGE_BACKTEST_SIDE_RESULT} }
  long { ${HEDGE_BACKTEST_SIDE_CONFIG} }
  short { ${HEDGE_BACKTEST_SIDE_CONFIG} }`;

export const otherQueries = {
  getUserFiles: () => {
    const query = `query getUserFiles{
                        getUserFiles {
                            status
                            reason
                            data {
                                meta
                                size
                                id
                            }
                        }
                    }`;
    return { query };
  },

  getFriendDiscount: () => {
    const query = `query getFriendDiscount{
                        getFriendDiscount {
                            status
                            reason
                            data {
                              discount
                              referralName
                            }
                        }
                  }`;
    return { query };
  },

  getMaintenanceWarning: () => {
    const query = `query getMaintenanceWarning{
                        getMaintenanceWarning {
                            status
                            reason
                            data {
                              scheduledDate
                              title
                              textf
                            }
                        }
                  }`;
    return { query };
  },

  binance: () => {
    const query = `query binance{
                        binance {
                            status
                            reason
                            data {
                                key
                                secret
                            }
                        }
                    }`;
    return { query };
  },

  addManualPayment: (input: {
    image: string;
    amount: number;
    /**
     * Discriminates manual top-ups: `'bank'` for USDT bank-transfer
     * style proofs, `'crypto'` for direct on-chain payment screenshots.
     * Optional for backward compatibility with older callers.
     */
    type?: 'bank' | 'crypto';
  }) => {
    const query = `mutation addManualPayment($input: addManualPaymentInput!) {
      addManualPayment(input: $input) {
        status
        reason
        data
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getCoinData: (input: { assets: string[]; uuid?: string }) => {
    const query = `query getCoinData($input: getCoinsInput!){
            getCoins(input: $input){
                status
                reason
                data {
                    result {
                        id
                        _id
                        symbol
                        market_cap_rank
                        categories
                        market_data {
                            current_price {
                                usd
                            }
                            price_change_percentage_24h
                        }
                    }
                }
            }
      }`;

    const variables = { input };
    return { query, variables };
  },

  setBinance: (input: { key: string; secret: string }) => {
    const query = `mutation setBinance($input: setBinanceInput!) {
                    setBinance(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  setTimezone: (input: { timezone: string; weekStart: string }) => {
    const query = `mutation setTimezone($input: setTimezoneInput!) {
                    setTimezone(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  loginByEmail: (input: { token: string; timezone: string }) => {
    const query = `mutation loginByEmail($input: loginByEmailInput!) {
                        loginByEmail(input: $input) {
                            status
                            reason
                            data {
                                token
                                isOTP
                                shouldOnBoard
                                shouldOnBoardExchange
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  discordAuth: (input: { token: string; timezone: string }) => {
    const query = `mutation discordAuth($input: discordAuthInput!) {
                        discordAuth(input: $input) {
                            status
                            reason
                            data {
                                token
                                isOTP
                                shouldOnBoard
                                shouldOnBoardExchange
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  deleteToken: () => {
    const query = `mutation deleteToken{
                        deleteToken {
                            status
                            reason
                        }
                    }`;
    return { query };
  },

  setAutomaticCharge: (input: { automaticCharge: boolean }) => {
    const query = `mutation setAutomaticCharge($input: automaticChargeInput!) {
                        userCheckAutomaticCharge(input: $input) {
                            status
                            reason
                            data {
                              updatedUser {
                                subscription {
                                  automaticCharge
                                }
                              }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getAffiliateLevels: () => {
    const query = `
      query getAffiliateLevels {
              getAffiliateLevels {
                status
                reason
                data {
                    tag
                    percent
                    usersToInvite
                }
            }
      }
    `;
    return { query };
  },

  getCreditCost: () => {
    const query = `query getCreditCost{
                        getCreditCost{
                            status
                            reason
                            data {
                                plans{minAmount
                                cost}
                            }
                        }
                    }`;
    return { query };
  },

  purchaseCredits: (input: { amount: number }) => {
    const query = `mutation purchaseCredits($input: purchaseCreditsInput!) {
                        purchaseCredits(input: $input) {
                            status
                            reason
                            data {
                                credits {${credits}}
                                balance
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  twitterRequestToken: () => {
    const query = `mutation twitterRequestToken{
                     twitterRequestToken {
                            status
                            reason
                            data {
                                oauthToken
                            }
                        }
                    }`;
    return { query };
  },

  checkAffiliateAutoWithdrawal: (input: { auto: boolean }) => {
    const query = `mutation checkAffiliateAutoWithdrawal($input: affiliateAutoWithdrawal!)  {
                        checkAffiliateAutoWithdrawal(input: $input) {
                          status
                          reason
                          data {
                              auto
                          }
                        }
                      }`;
    const variables = { input };
    return { query, variables };
  },

  addAffiliateWallet: (input: { wallet: string; walletProtocol: string }) => {
    const query = `mutation addAffiliateWallet($input: affiliateWallet!)  {
                      addAffiliateWallet(input: $input) {
                        status
                        reason
                        data {
                            wallet
                        }
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  updateBalance: (input?: { skipSnapshot?: boolean }) => {
    const query = `query updateBalance($input: updateBalanceInput){
                        updateBalance(input: $input) {
                            status
                            reason
                            data {
                               result{
                                    updateTime
                                    exchangesTotal{
                                        uuid
                                        totalUsd
                                    }
                                    updated
                                }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  updateStatus: () => {
    const query = `query updateStatus{
                        updateStatus{
                            status
                            reason
                            data {
                               ${exchangeFragment}
                            }
                        }
                    }`;
    return { query };
  },

  getLatestOrders: (input?: { page?: number }) => {
    const query = `query getLatestOrders($input:getLatestOrdersInput) {
        getLatestOrders(input: $input) {
            status
            reason
            data {
                result {
                    clientOrderId
                    origQty
                    price
                    side
                    updateTime
                    baseAsset
                    quoteAsset
                    botName
                    botId
                    typeOrder
                    botType
                    terminal
                }
            }
            total
        }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getUsdRate: () => {
    const query = `query getUsdRate{
                        getUsdRate{
                            status
                            reason
                            data
                        }
                    }`;
    return { query };
  },

  getAllPairs: (fields?: string) => {
    const query = `query getAllPairs{
            getAllPairs{
                status
                reason
                data {
                    result {
                        ${
                          fields ??
                          `pair
                        exchange
                        wsCode
                        code
                        baseAsset {
                            name
                            minAmount
                            maxAmount
                            step
                        }
                        quoteAsset {
                            name
                            minAmount
                        }
                        priceAssetPrecision
                        crossAvailable
                        assetCategory`
                        }
                    }
                }
            }
        }`;
    return { query };
  },

  // Additional subscription-related queries
  createStripeOrder: (input: { amount: number }) => {
    const query = `mutation createStripeOrder($input: createStripeOrderInput!){
      createStripeOrder(input: $input) {
        status
        reason
        data {
          clientSecret
          id
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  captureStripeOrder: (input: { orderId: string }) => {
    const query = `mutation captureStripeOrder($input: captureStripeOrderInput!){
      captureStripeOrder(input: $input) {
        status
        reason
        data
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getPaymentData: () => {
    const query = `query getPaymentData{
      getPaymentData {
        status
        reason
        data {
          provider
          key
          cryptoDiscountPercent
        }
      }
    }`;
    return { query };
  },

  updateUserSubscriptionPlan: (input: {
    newSubscriptionPlanName: string;
    type: string;
    extend?: boolean;
    extendCount?: number;
  }) => {
    const query = `mutation updateUserSubscriptionPlan($input: newUserSubscriptionInput!) {
                      updateUserSubscriptionPlan(input: $input) {
                        status
                        reason
                        data {
                          updatedUser {
                            balance
                            subscription {
                              subscriptionPlanName
                              automaticCharge
                              startDate
                              type
                              nextPayment {
                                subscriptionPlanName
                                date
                                type
                              }
                              extensions {
                                type
                                subscriptionPlanName
                                date
                                endDate
                                price
                              }
                            }
                          }
                        }
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  setUserNextSubscriptionPlan: (input: {
    newSubscriptionPlanName: string;
    type: string;
  }) => {
    const query = `mutation setUserNextSubscriptionPlan($input: newUserSubscriptionInput!) {
                      setUserNextSubscriptionPlan(input: $input) {
                        status
                        reason
                        data {
                          updatedUser {
                            balance
                            subscription {
                              subscriptionPlanName
                              automaticCharge
                              startDate
                              type
                              nextPayment {
                                subscriptionPlanName
                                date
                                type
                              }
                              extensions {
                                type
                                subscriptionPlanName
                                date
                                endDate
                                price
                              }
                            }
                          }
                        }
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getPayouts: () => {
    const query = `query getPayouts{
                    getPayouts{
                        status
                        reason
                        data {
                            ${payout}
                        }
                    }
                }`;
    return { query };
  },

  addPayout: (input: { amount: number }) => {
    const query = `mutation addPayout($input: addPayoutInput!){
                    addPayout(input: $input) {
                        status
                        reason
                        data {
                          ${payout}
                        }
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  transferAmount: (input: { amount: number }) => {
    const query = `mutation transferAmount($input: transferAmountInput!){
                    transferAmount(input: $input) {
                        status
                        reason
                        data {
                          amount
                        }
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  addAffiliateClick: (input: {
    a: string;
    link?: string;
    source?: 'app' | 'creation';
    referredPercent?: number;
  }) => {
    const query = `mutation addAffiliateClick($input: affiliateClickInput!)  {
                      addAffiliateClick(input: $input) {
                        status
                        reason
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  setPercentForAffiliateLink: (input: {
    a: string;
    link: string;
    referredPercent: number | null;
  }) => {
    const query = `mutation setPercentForAffiliateLink($input: setPercentForAffiliateLinkInput!)  {
                      setPercentForAffiliateLink(input: $input) {
                        status
                        reason
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Rewards-related queries
  getRewardsList: () => {
    const query = `query getRewardsList{
      getRewardsList{
        status
        reason
        data {
           section
           name
           description
           amount
           claimable
           multiple
           frequency {
              period
              periodType
           }
           link
           discourseBadgeId
           action
           payload
           active
           _id
           submitText
           instructionText
        }
      }
    }`;
    return { query };
  },

  getUserRewardsList: () => {
    const query = `query getUserRewardsList{
      getUserRewardsList{
        status
        reason
        data {
           userId
           status
           reason
           multiply
           active
           rewardId
           amount
           _id
           lastAchieved
        }
      }
    }`;
    return { query };
  },

  getUserCollectedRewardsList: () => {
    const query = `query getUserCollectedRewardsList{
      getUserCollectedRewardsList{
        status
        reason
        data {
           userId
           status
           reason
           multiply
           active
           rewardId
           amount
           _id
           lastAchieved
        }
      }
    }`;
    return { query };
  },

  getCreditsList: () => {
    const query = `query getCreditsList{
      getCreditsList{
        status
        reason
        data {
           _id
           cost
           balance
        }
      }
    }`;
    return { query };
  },

  claimReward: (input: { rewardId: string }) => {
    const query = `mutation claimReward($input: claimRewardInput!) {
      claimReward(input: $input) {
        status
        reason
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  submitReward: (input: { rewardId: string; payload: string }) => {
    const query = `mutation submitReward($input: submitRewardInput!) {
      submitReward(input: $input) {
        status
        reason
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  buyCredits: (input: { id: string }) => {
    const query = `mutation buyCredits($input: buyCreditsInput!) {
      buyCredits(input: $input) {
        status
        reason
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  // Notification queries
  getMessageBot: (input?: {
    unreadOnly?: boolean;
    page?: number;
    pageSize?: number;
    search?: string;
  }) => {
    // Always use parameterized query structure (matching legacy dashboard exactly)
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

    // Always pass { input } in variables, even if input is undefined (like legacy dashboard)
    const variables = { input };
    return { query, variables };
  },

  getPlatformNotifications: (input: {
    unreadOnly: boolean;
    page: number;
    pageSize: number;
    search?: string;
  }) => {
    const query = `query getPlatformNotifications($input: getPlatformNotificationsInput!) {
      getPlatformNotifications(input: $input) {
          status
          reason
          data {
              total
              totalUnread
              data {
                  id
                  type
                  title
                  description
                  date
                  image
                  url
                  isRead
              }
          }
      }
  }`;

    // Clean up input to avoid sending empty strings
    const cleanInput = { ...input };
    if (cleanInput.search === '') {
      delete cleanInput.search;
    }

    const variables = { input: cleanInput };
    return { query, variables };
  },

  getChangeLogs: (input?: {
    page?: number;
    pageSize?: number;
    search?: string;
    all?: boolean;
  }) => {
    const query = `query getChangeLogs($input: getChangeLogsInput!){
      getChangeLogs(input: $input) {
        status
        reason
        total
        data {
          result {
            id
            title
            shortDescription
            fullDescription
            type
            typeOther
            date
          }
        }
      }
    }`;

    // Clean up input to avoid sending empty strings
    const cleanInput = input ? { ...input } : {};
    if (cleanInput.search === '') {
      delete cleanInput.search;
    }

    const variables = {
      input: Object.keys(cleanInput).length > 0 ? cleanInput : undefined,
    };
    return { query, variables };
  },

  getUnreadChangeLogs: () => {
    const query = `query getUnreadChangeLogs{
      getUnreadChangeLogs{
        status
        reason
        data {
          result
        }
      }
    }`;
    return { query };
  },

  readChangeLog: () => {
    const query = `mutation readChangeLog{
      readChangeLog{
        status
        reason
        data
      }
    }`;
    return { query };
  },
  readPlatformNotificationByUser: (input: {
    notificationId?: number;
    isRead?: boolean;
  }) => {
    const query = `mutation readPlatformNotificationByUser($input: readPlatformNotificationByUserInput!) {
      readPlatformNotificationByUser(input: $input) {
        status
        reason
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  readAllPlatformNotifications: () => {
    const query = `mutation readAllPlatformNotifications {
      readAllPlatformNotifications {
        status
        reason
      }
    }`;
    return { query };
  },

  // Chat-related queries
  getChatMessages: (input?: { before?: number; limit?: number }) => {
    const query = `query getChatMessages($input: getChatMessagesInput){
      getChatMessages(input: $input) {
        status
        reason
        data {
          result {
            message
            time
            id
            type
            spoilers{
              title
              content
              id
            }
          }
          contextResetAt
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  resetChatContext: () => {
    const query = `mutation resetChatContext{
      resetChatContext {
        status
        reason
        data {
          contextResetAt
        }
      }
    }`;
    return { query };
  },

  getChatQueries: () => {
    const query = `query getChatQueries{
      getChatQueries{
        status
        reason
        data {
          used
          total
        }
      }
    }`;
    return { query };
  },

  // Cloud-only: poll for an in-flight AI run so the chat UI can show
  // progress and block sends after a refresh. App-sh has no AI; the
  // builder is shipped here as a type-safe stub so cloud's ChatCore
  // can call it through the shared `GraphQlQuery` aggregate.
  getActiveAiRun: () => {
    const query = `query getActiveAiRun{
      getActiveAiRun{
        status
        reason
        data {
          runId
          threadId
          status
          startedAt
          currentTool
          toolsTotal
          toolsDone
        }
      }
    }`;
    return { query };
  },

  getAvailableAiModels: () => {
    const query = `query getAvailableAiModels{
      getAvailableAiModels{
        status
        reason
        data {
          models {
            modelId
            name
            creditsPerMillionInput
            creditsPerMillionOutput
            isDefault
          }
          helpModel {
            modelId
            name
            creditsPerMillionInput
            creditsPerMillionOutput
          }
          chargeHelpMode
        }
      }
    }`;
    return { query };
  },

  // Screener-related queries
  getScreenerData: (input?: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortType?: 'asc' | 'desc';
    filterModel?: unknown;
  }) => {
    const query = `query getScreenerData($input: getScreenerDataInput){
      getScreenerData(input: $input) {
        status
        reason
        data {
          result {
            id
            name
            symbol
            currentPrice
            priceChangePercentage1h
            priceChangePercentage24h
            priceChangePercentage7d
            priceChangePercentage30d
            priceChangePercentage1y
            marketCap
            totalVolume
            atlChangePercentage
            athChangePercentage
            marketCapChangePercentage24h
            marketCapRank
            liquidityScore
            volumeChange24h
            volatility1d
            volatility3d
            volatility7d
            category
            exchanges
            sparkline
            availablePresets
          }
          total
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getLatestFearAndGreedIndex: (input?: { period?: '30D' | '1Y' }) => {
    const query = `query getLatestFearAndGreedIndex($input: getCMCDataInput) {
                        getLatestFearAndGreedIndex(input: $input) {
                            status
                            reason
                            data {
                              value
                              value_classification
                              update_time
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getLatestQuotes: (input?: { period?: '30D' | '1Y' }) => {
    const query = `query getLatestQuotes($input: getCMCDataInput) {
                        getLatestQuotes(input: $input) {
                            status
                            reason
                            data {
                              price
                              volume_24h
                              timestamp
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getAssetMetrics: (input: {
    interval:
      | ExchangeIntervals.oneH
      | ExchangeIntervals.fourH
      | ExchangeIntervals.oneD
      | ExchangeIntervals.oneW;
    type:
      | IndicatorEnum.rsi
      | IndicatorEnum.bbpb
      | IndicatorEnum.vo
      | IndicatorEnum.mar;
  }) => {
    const query = `query getAssetMetrics($input: getAssetMetricsInput!) {
                        getAssetMetrics(input: $input) {
                            status
                            reason
                            data {
                              asset
                              type
                              interval
                              timestamp
                              value
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // ===== AUTO-ADDED MISSING FUNCTIONS =====

  getPairInfo: (input: { pair: string; exchange: ExchangeEnum }) => {
    const query = `query getPairInfo($input: getPairInput!){ 
  getPairInfo(input: $input){
  status
  reason
  data {
  pair
  exchange
  baseAsset {
  minAmount
  maxAmount
  step
  name
  }
  quoteAsset {
  minAmount
  name
  }
  maxOrders
  priceAssetPrecision
  crossAvailable
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getBalances: (
    input: {
      assets?: string[];
      uuid?: string | undefined;
      shouldSumBalance?: boolean;
      includeUsdValues?: boolean;
    },
    fields?: string
  ) => {
    const query = `query getBalances($input: getBalancesInput!) {
  getBalances(input: $input) {
  status
  reason
  data {
  ${
    fields ??
    `asset
  free
  locked
  exchange
  exchangeUUID
  exchangeName`
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getAllOpenOrders: (input?: { exchangeUUID: string }) => {
    const query = `query getAllOpenOrders($input: getAllOpenOrdersInput) { 
  getAllOpenOrders(input: $input) {
  status
  reason
  data {
  symbol
  botId
  botName
  side
  type
  created
  exchange
  exchangeUUID
  exchangeName
  status
  botType
  dealId
  price
  quantity
  baseAssetName
  quoteAssetName
  orderId
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getAllOpenPositions: (input?: { exchangeUUID: string }) => {
    const query = `query getAllOpenPositions($input: getAllOpenOrdersInput) { 
  getAllOpenPositions(input: $input) {
  status
  reason
  data {
  symbol
  created
  exchange
  exchangeUUID
  exchangeName
  leverage
  side
  price
  quantity
  baseAssetName
  quoteAssetName
  positionId
  botId
  botName
  botType
  marginType
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  compareBalances: (input: { botId: string; dealId: string }) => {
    const query = `query compareBalances($input: compareBalancesInput!){
  compareBalances(input: $input) {
  status
  reason
  data {
  currentBase
  currentQuote
  realBase
  realQuote
  filledBase
  filledQuote
  feeBase
  feeQuote
  suggestedAction
  diffBase
  diffQuote
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getGlobalVariables: (input: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortModel?: GridSortModel;
    filterModel?: GridFilterModel;
  }) => {
    const query = `
  query GetGlobalVariables($input: GetGlobalVariablesInput!) {
  getGlobalVariables(input: $input) {
  status
  reason
  data {
  id
  name
  type
  value
  botAmount
  }
  total
  }
  }
  `;
    const variables = { input };
    return { query, variables };
  },

  getGlobalVariablesByIds: (input: { ids: string[] }) => {
    const query = `
  query getGlobalVariablesByIds($input: GetGlobalVariablesByIdsInput!) {
  getGlobalVariablesByIds(input: $input) {
  status
  reason
  data {
  id
  name
  type
  value
  botAmount
  }
  total
  }
  }
  `;
    const variables = { input };
    return { query, variables };
  },

  isAvailableSurvey: (input: { surveyId: string }) => {
    const query = `query isAvailableSurvey($input: isAvailableSurveyInput!) {
  isAvailableSurvey(input: $input) {
  status
  reason
  data 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getDcaPresets: (input?: DataGridFilterInput) => {
    const query = `query getDcaPresets($input: DataGridFilterInput){ 
  getDcaPresets(input: $input) {
  status
  reason
  data {
  ${backtest}
  additionalExchanges
  }
  total
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboPresets: (input?: DataGridFilterInput) => {
    const query = `query getComboPresets($input: DataGridFilterInput){ 
  getComboPresets(input: $input) {
  status
  reason
  data {
  ${comboBacktest}
  additionalExchanges
  }
  total
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getGridPresets: (input?: DataGridFilterInput) => {
    const query = `query getGridPresets($input: DataGridFilterInput){ 
  getGridPresets(input: $input) {
  status
  reason
  data {
  ${gridBacktest}
  additionalExchanges
  }
  total
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getDcaPresetById: (input: { id: string }) => {
    const query = `query getDcaPresetById($input: getPresetByIdInput!){ 
  getDcaPresetById(input: $input) {
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

  getComboPresetById: (input: { id: string }) => {
    const query = `query getComboPresetById($input: getPresetByIdInput!){ 
  getComboPresetById(input: $input) {
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

  getGridPresetById: (input: { id: string }) => {
    const query = `query getGridPresetById($input: getPresetByIdInput!){ 
  getGridPresetById(input: $input) {
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

  setVideoUpdate: (input: NonNullable<UserState['videos']>[0]) => {
    const query = `mutation setVideoUpdate($input: setVideoUpdateInput!) {
  setVideoUpdate(input: $input) {
  status
  reason
  data 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeStatus: (input: ChangeStatusInput) => {
    const query = `mutation changeStatus($input: changeStatusInput!) { 
  changeStatus(input: $input) {
  status
  reason
  data {
  _id
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeMultiPairStatus: (input: {
    id: string;
    status: 'open' | 'closed';
    cancelPartiallyFilled?: boolean;
    closeType?: CloseDCATypeEnum;
    buyType?: string;
    buyCount?: string;
    closeGridType?: CloseGRIDTypeEnum;
  }) => {
    const query = `mutation changeMultiPairStatus($input: changeMultiPairStatusInput!) { 
  changeMultiPairStatus(input: $input) {
  status
  reason
  data {
  _id
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  token: (input: { username: string; password: string }) => {
    const query = `mutation token($input: tokenInput!) { 
  token(input: $input) {
  status
  reason
  data {
  token
  isOTP
  shouldOnBoard
  shouldOnBoardExchange
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  oauth: (input: {
    type: 'google' | 'twitter' | 'discord';
    token: string;
    verifyToken?: string;
    timezone: string;
  }) => {
    const query = `mutation oauth($input: oauthInput!) { 
  oauth(input: $input) {
  status
  reason
  data {
  token
  isOTP
  shouldOnBoard
  shouldOnBoardExchange
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  twitterAccessToken: (input: {
    oauthVerifier: string;
    oauthToken: string;
    timezone: string;
  }) => {
    const query = `mutation twitterAccessToken($input: twitterAccessTokenInput!){ 
  twitterAccessToken(input: $input) {
  status
  reason
  data {
  token
  isOTP
  shouldOnBoard
  shouldOnBoardExchange
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setPublicity: (input: {
    id: string;
    public: boolean;
    type?: BotTypesEnum;
  }) => {
    const query = `mutation setPublicity($input: publicInput!) {
  setPublicity(input: $input) {
  status
  reason
  data {
  id
  public
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  updateProfilePicture: (input: { picture: string }) => {
    const query = `mutation updateProfilePicture($input: updateProfilePictureInput!) { 
  updateProfilePicture(input: $input) {
  status
  reason
  }
  }`;

    const variables = { input };
    return { query, variables };
  },

  verifyOTP: (input: { otpToken: string }) => {
    const query = `mutation verifyOTP($input: verifyOTPInput!) { 
  verifyOTP(input: $input) {
  status
  reason
  data {
  recoveryCodes
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  validateOTP: (input: { otpToken: string }) => {
    const query = `mutation validateOTP($input: validateOTPInput!) { 
  validateOTP(input: $input) {
  status
  reason
  data {
  token
  isOTP
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  validateRecoveryCode: (input: { recoveryCode: string }) => {
    const query = `mutation validateRecoveryCode($input: validateRecoveryCodeInput!) { 
  validateRecoveryCode(input: $input) {
  status
  reason
  data {
  token
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setArchive: (input: {
    botIds: string[];
    archive: boolean;
    type: BotTypesEnum;
  }) => {
    const query = `mutation setArchive($input: setArchiveInput!) { 
  setArchive(input: $input) {
  status
  reason
  data {
  _id
  status
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setArchiveMultiPair: (input: { botIds: string[]; archive: boolean }) => {
    const query = `mutation setArchiveMultiPair($input: setArchiveMultiPairInput!) { 
  setArchiveMultiPair(input: $input) {
  status
  reason
  data {
  _id
  status
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  renewAPIKeys: (input: { key: string }) => {
    const query = `mutation renewAPIKeys($input: apiKeysInput!) { 
  renewAPIKeys(input: $input) {
  status
  reason
  data {
  ${apiKeysFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeAPIKeysPermission: (input: {
    key: string;
    permission: APIPermission;
  }) => {
    const query = `mutation changeAPIKeysPermission($input: changeAPIKeysPermissionInput!) { 
  changeAPIKeysPermission(input: $input) {
  status
  reason
  data {
  ${apiKeysFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeAPIKeysName: (input: { key: string; name: string }) => {
    const query = `mutation changeAPIKeysName($input: changeAPIKeysNameInput!) { 
  changeAPIKeysName(input: $input) {
  status
  reason
  data {
  ${apiKeysFragment}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  deleteAPIKeys: (input: { key: string }) => {
    const query = `mutation deleteAPIKeys($input: apiKeysInput!) { 
  deleteAPIKeys(input: $input) {
  status
  reason
  data {
  created
  expired
  permission
  _id
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  trackEvent: (input: {
    event: TrackEventEnum;
    time: number;
    page: string;
  }) => {
    const query = `mutation trackEvent($input: trackEventInput!) { 
  trackEvent(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changePassword: (input: { password: string }) => {
    const query = `mutation changePassword($input: changePasswordInput!) { 
  changePassword(input: $input) {
  status
  reason
  data 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setHedge: (input: { uuid: string; hedge: boolean }) => {
    const query = `mutation setHedge($input: setHedgeInput!){ 
  setHedge(input: $input) {
  status
  reason
  data 
  }
  }`;

    const variables = { input };
    return { query, variables };
  },

  setZeroFee: (input: { uuid: string; value: boolean }) => {
    const query = `mutation setZeroFee($input: setZeroFeeInput!){ 
  setZeroFee(input: $input) {
  status
  reason
  data 
  }
  }`;

    const variables = { input };
    return { query, variables };
  },

  addSurveyResult: (input: SurveyResult) => {
    const query = `mutation addSurveyResult($input: addSurveyResultInput!) {
  addSurveyResult(input: $input) {
  status
  reason
  data 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  resetShowError: (input: { data: { id: string; type: BotTypesEnum }[] }) => {
    const query = `mutation resetShowError($input: resetShowErrorInput!) {
  resetShowError(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeAlertsSettings: (input: ChangeAlertsInput) => {
    const query = `mutation changeAlertsSettings($input: userAlertsInput!) {
  changeAlertsSettings(input: $input) {
  status
  reason
  data {
  type
  providers
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  // Cloud-only: Telegram link is a cloud feature. App-sh has no
  // Telegram integration; shipped here as type-safe stubs so cloud's
  // NotificationPreferencesSection can call through `otherQueries`.
  getTelegramUsername: () => {
    const query = `query getTelegramUsername {
      getTelegramUsername {
        status
        reason
        data
      }
    }`;
    return { query, variables: {} };
  },

  disconnectTelegram: () => {
    const query = `query disconnectTelegram {
      disconnectTelegram {
        status
        reason
      }
    }`;
    return { query, variables: {} };
  },

  manageBalanceDiff: (input: {
    botId: string;
    dealId: string;
    qty: number;
    side: BotOrderSideEnum;
  }) => {
    const query = `mutation manageBalanceDiff($input: manageBalanceDiffInput!){
  manageBalanceDiff(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  deleteGlobalVariable: (input: { id: string }) => {
    const query = `mutation deleteGlobalVariable($input: DeleteGlobalVariableInput!) {
  deleteGlobalVariable(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  createGlobalVariable: (input: {
    name: string;
    type: GlobalVariablesTypeEnum;
    value: string;
  }) => {
    const query = `mutation createGlobalVariable($input: CreateGlobalVariableInput!) {
  createGlobalVariable(input: $input) {
  status
  reason
  data {
  id
  name
  type
  value
  botAmount
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  updateGlobalVariable: (input: {
    id: string;
    name: string;
    type: GlobalVariablesTypeEnum;
    value: string;
  }) => {
    const query = `mutation updateGlobalVariable($input: UpdateGlobalVariableInput!) {
  updateGlobalVariable(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  resetAccount: (input: { type: ResetAccountTypeEnum }) => {
    const query = `mutation resetAccount($input: resetAccountInput!) {
  resetAccount(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  // Backtest queries
  getBacktests: (
    input: {
      page?: number;
      pageSize?: number;
      filters?: {
        strategy?: string;
        exchange?: string;
        pair?: string;
        dateFrom?: string;
        dateTo?: string;
        minProfit?: number;
        maxProfit?: number;
      };
      sort?: {
        field: string;
        order: 'asc' | 'desc';
      };
    } = {}
  ) => {
    const query = `query getBacktests($input: DataGridFilterInput) {
      getBacktests(input: $input) {
        status
        reason
        data {
          _id
          symbol
          baseAsset
          quoteAsset
          exchange
          exchangeUUID
          time
          settings {
            name
            pair
            strategy
          }
          financial {
            netProfitTotal
            netProfitTotalUsd
            annualizedReturn
          }
          numerical {
            all
            profit
            loss
          }
          duration {
            firstDataTime
            lastDataTime
          }
          time
          note
          serverSide
          savePermanent
          shareId
          userId
          value
          author
          sent
          config {
            userFee
            slippage
            firstDataTime
            lastDataTime
            RFR
            MAR
            usage
            pair
            multiIdependent
            multiCombined
          }
        }
        total
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getDcaBacktests: (
    input: {
      page?: number;
      pageSize?: number;
      filters?: {
        strategy?: string;
        exchange?: string;
        pair?: string;
        dateFrom?: string;
        dateTo?: string;
        minProfit?: number;
        maxProfit?: number;
      };
      sort?: {
        field: string;
        order: 'asc' | 'desc';
      };
    } = {}
  ) => {
    const query = `query getDcaBacktests($input: getBacktestsInput) {
      getDcaBacktests(input: $input) {
        status
        reason
        data {
          _id
          symbol
          baseAsset
          quoteAsset
          exchange
          exchangeUUID
          time
          created
          updated
          settings {
            name
            pair
            strategy
          }
          financial {
            netProfitTotal
            netProfitTotalUsd
            annualizedReturn
          }
          numerical {
            all
            profit
            loss
          }
          duration {
            firstDataTime
            lastDataTime
          }
          size
          note
          serverSide
          savePermanent
          shareId
          userId
          value
          author
          sent
          config {
            userFee
            slippage
            firstDataTime
            lastDataTime
            RFR
            MAR
            usage
            pair
            multiIdependent
            multiCombined
          }
        }
        total
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  /**
   * Cloud has separate hedge-backtest history endpoints per bot variant
   * (`getHedgeDCABacktests` / `getHedgeComboBacktests`). The selection
   * mirrors the legacy `hedgeDCABacktest` / `hedgeComboBacktest`
   * fragments — including the full per-leg `longResult` / `shortResult`
   * so the active viewer can show per-leg Overview/Stats/Analysis
   * without re-running the backtest. `deals`/`profits`/`portfolio` are
   * intentionally NOT requested — those live only in IndexedDB on the
   * device that ran the backtest. Input matches `DataGridFilterInput`
   * (legacy convention).
   */
  getHedgeDCABacktests: (input?: DataGridFilterInput) => {
    const query = `query getHedgeDCABacktests($input: DataGridFilterInput) {
      getHedgeDCABacktests(input: $input) {
        status
        reason
        data {
          ${HEDGE_BACKTEST_HISTORY_FIELDS}
        }
        total
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboBacktests: (input?: DataGridFilterInput) => {
    const query = `query getHedgeComboBacktests($input: DataGridFilterInput) {
      getHedgeComboBacktests(input: $input) {
        status
        reason
        data {
          ${HEDGE_BACKTEST_HISTORY_FIELDS}
        }
        total
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  getGridBacktests: (
    input: {
      page?: number;
      pageSize?: number;
      filters?: {
        strategy?: string;
        exchange?: string;
        pair?: string;
        dateFrom?: string;
        dateTo?: string;
        minProfit?: number;
        maxProfit?: number;
      };
      sort?: {
        field: string;
        order: 'asc' | 'desc';
      };
    } = {}
  ) => {
    const query = `query getGridBacktests($input: getBacktestsInput) {
      getGridBacktests(input: $input) {
        status
        reason
        data {
          _id
          symbol
          baseAsset
          quoteAsset
          exchange
          exchangeUUID
          time
          created
          updated
          settings {
            name
            pair
            strategy
          }
          financial {
            netProfitTotal
            netProfitTotalUsd
            annualizedReturn
          }
          numerical {
            all
            profit
            loss
          }
          duration {
            firstDataTime
            lastDataTime
          }
          size
          note
          serverSide
          savePermanent
          shareId
          userId
          value
          author
          sent
          config {
            userFee
            slippage
            firstDataTime
            lastDataTime
            RFR
            MAR
            usage
            pair
            multiIdependent
            multiCombined
          }
        }
        total
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  // Backtest management mutations
  /**
   * Persist a hedge-DCA backtest summary to the server. Hedge backtests
   * run locally (HedgeBacktesting in @gainium/backtester); the server
   * receives a stripped payload — no `deals`, `profits`, `portfolio`,
   * `indicatorsEvents`, or `buyAndHoldEquity` — and returns the new
   * record id, which we mirror into IndexedDB via `saveHedge` so the
   * full result is available locally.
   */
  saveHedgeDCABacktest: (input: HedgeDCABacktestingResultShort) => {
    const query = `mutation saveHedgeDCABacktest($input: hedgeDCABacktestInput!) {
      saveHedgeDCABacktest(input: $input) {
        status
        reason
        data
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  /** Combo variant of `saveHedgeDCABacktest`. */
  saveHedgeComboBacktest: (input: HedgeComboBacktestingResultShort) => {
    const query = `mutation saveHedgeComboBacktest($input: hedgeComboBacktestInput!) {
      saveHedgeComboBacktest(input: $input) {
        status
        reason
        data
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
        data {
          deletedCount
          failedIds
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  exportBacktests: (input: { ids: string[]; format: 'json' | 'csv' }) => {
    const query = `mutation exportBacktests($input: exportBacktestsInput!) {
      exportBacktests(input: $input) {
        status
        reason
        data {
          url
          expiresAt
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  importBacktests: (input: { data: string }) => {
    const query = `mutation importBacktests($input: importBacktestsInput!) {
      importBacktests(input: $input) {
        status
        reason
        data {
          importedCount
          failedCount
          errors
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  sendError: (input: {
    error: { message: string; stack: string };
    errorInfo: { componentStack: string };
    subType: string;
    source?: string;
  }) => {
    const query = `mutation sendError($input: sendErrorInput!) {
      sendError(input: $input) {
        status
        reason
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  // Cloud-only account-delete-flow mutations. App-sh doesn't expose
  // these — calling them from sh would 400 — but cloud's overlay
  // (DeleteAccountSection, PendingDeleteBanner) is the only caller,
  // so the builders are kept here purely as type-safe stubs.
  requestAccountDeleteChallenge: () => {
    const query = `mutation requestAccountDeleteChallenge {
  requestAccountDeleteChallenge {
    status
    reason
    data {
      challenge
      difficulty
      expiresAt
    }
  }
}`;
    return { query, variables: {} };
  },

  requestAccountDelete: (input: { challenge: string; nonce: string }) => {
    const query = `mutation requestAccountDelete($input: requestAccountDeleteInput!) {
  requestAccountDelete(input: $input) {
    status
    reason
    data {
      deletedAt
      deletedScheduledAt
    }
  }
}`;
    const variables = { input };
    return { query, variables };
  },

  restoreAccount: () => {
    const query = `mutation restoreAccount {
  restoreAccount {
    status
    reason
    data
  }
}`;
    return { query, variables: {} };
  },
};
