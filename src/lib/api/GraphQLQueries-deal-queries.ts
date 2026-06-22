import type {
  AddFundsTypeEnum,
  Bot,
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  DCADealsSettings,
  DataGridFilterInput,
  OrderSizeTypeEnum,
} from '../../types';

import {
  comboDealFragment,
  dcaBotSettingsFragment,
  dcaDealFragment,
  orders,
} from './GraphQLQueries-fragments';

export const dealQueries = {
  getDCADeals: (input?: { terminal?: boolean }) => {
    const query = `query getDCADeals($input: getDCADealsInput) {
        getDCADeals(input: $input) {
            status
            reason
            data {
                result {
                    _id
                    botName
                    dcaBot{
                        exchange
                        settings {
                            name
                        }
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
                      baseAsset
                      quoteAsset
                    }
                    strategy
                    botId
                    settings {
                      futures
                      coinm
                    }
                      usage {
                        current {
                          base
                          quote
                        }
                        currentUsd
                        max {
                          base
                          quote
                        }
                        maxUsd
                      }
                      avgPrice
                      profit {
                        total
                        totalUsd
                        pureBase
                        pureQuote
                      }
                      funding {
                        total
                        totalUsd
                        lastTime
                      }
                        exchangeUUID
                        initialPrice
                        createTime
                        stats {
                  drawdownPercent
                  runUpPercent
                  timeInProfit
                  timeInLoss
                  trackTime
                  timeCountStart
                  currentCount
                  unrealizedProfit
                }
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
                    _id
                    botId
                    botName
                    dcaBot{
                        exchange
                        settings {
                            name
                        }
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
                      baseAsset
                      quoteAsset
                    }
                    strategy
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
                    funding {
                      total
                      totalUsd
                      lastTime
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
                    stats {
                  drawdownPercent
                  runUpPercent
                  timeInProfit
                  timeInLoss
                  trackTime
                  timeCountStart
                  currentCount
                  unrealizedProfit
                }
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
                    _id
                    botId
                    botName
                    dcaBot{
                        exchange
                        settings {
                            name
                        }
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
                      baseAsset
                      quoteAsset
                    }
                    strategy
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
                    funding {
                      total
                      totalUsd
                      lastTime
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
                    _id
                    botId
                    botName
                    dcaBot{
                        exchange
                        settings {
                            name
                        }
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
                      baseAsset
                      quoteAsset
                    }
                    strategy
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
                    funding {
                      total
                      totalUsd
                      lastTime
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

  // ===== AUTO-ADDED MISSING FUNCTIONS =====
  // Added by API Enhancer - DO NOT EDIT MANUALLY

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

  dcaDealList: (
    input?: {
      all?: boolean;
      status?: DCADealStatusEnum;
      dataGridInput?: DataGridFilterInput;
      botId?: string;
      exchange?: string;
      terminal?: boolean;
    },
    fields?: string
  ) => {
    const query = `query dcaDealList($input: getDcaDealListInput) {
  dcaDealList(input: $input) {
  status
  reason
  total
  data {
  page
  totalPages
  totalResults
  result {
  ${fields ?? dcaDealFragment}
  botName
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  comboDealList: (
    input?: {
      all?: boolean;
      status?: DCADealStatusEnum;
      dataGridInput?: DataGridFilterInput;
      botId?: string;
      exchange?: string;
    },
    fields?: string
  ) => {
    const query = `query comboDealList($input: getDcaDealListInput) {
  comboDealList(input: $input) {
  status
  reason
  total
  data {
  page
  totalPages
  totalResults
  result {
  ${fields ?? comboDealFragment}
  botName
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  hedgeComboDealList: (
    input?: {
      all?: boolean;
      status?: DCADealStatusEnum;
      dataGridInput?: DataGridFilterInput;
      botId?: string;
      exchange?: string;
    },
    fields?: string
  ) => {
    const query = `query hedgeComboDealList($input: getDcaDealListInput) {
  hedgeComboDealList(input: $input) {
  status
  reason
  total
  data {
  page
  totalPages
  totalResults
  result {
  ${
    fields ??
    ` _id
  botId
  userId
  status
  initialBalances{
  base
  quote
  }
  currentBalances{
  base
  quote
  }
  initialPrice
  lastPrice
  profit{
  totalUsd
  total
  }
  funding{
  totalUsd
  total
  lastTime
  }
  avgPrice
  commission
  createTime
  updateTime
  closeTime
  levels{
  all
  complete
  }
  usage{
  current{
  quote
  base
  }
  max {
  quote
  base
  }
  }
  settings{
  ordersCount
  tpPerc
  profitCurrency
  avgPrice
  baseOrderSize
  orderSize
  useTp
  useSl
  slPerc
  useDca
  changed
  useSmartOrders
  activeOrdersCount
  orderSizePercQty
  }
  orders{
  _id
  clientOrderId
  cummulativeQuoteQty
  executedQty
  fills{
  tradeId
  price
  qty
  commission
  commissionAsset
  }
  icebergQty
  isIsolated
  isWorking
  orderId
  orderListId
  origQty
  price
  side
  status
  stopPrice
  symbol
  baseAsset
  quoteAsset
  time
  timeInForce
  transactTime
  type
  updateTime
  created
  updated
  exchange
  exchangeUUID
  botId
  userId
  typeOrder
  dealId
  }
  stats {
  drawdownPercent
  runUpPercent
  timeInProfit
  timeInLoss
  trackTime
  timeCountStart
  currentCount
  }
  assets{
  used{
  base
  quote
  }
  required{
  base
  quote
  }
  }
  dcaBot{
  settings{
  ${dcaBotSettingsFragment}
  }
  symbol{
  symbol
  baseAsset
  quoteAsset
  }
  _id
  status
  public
  }
  gridBreakpoints{
  price
  displacedPrice
  }`
  }
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  hedgeDcaDealList: (
    input?: {
      all?: boolean;
      status?: DCADealStatusEnum;
      dataGridInput?: DataGridFilterInput;
      botId?: string;
      exchange?: string;
    },
    fields?: string
  ) => {
    const query = `query hedgeDcaDealList($input: getDcaDealListInput) {
  hedgeDcaDealList(input: $input) {
  status
  reason
  total
  data {
  page
  totalPages
  totalResults
  result {
  ${
    fields ??
    ` _id
  botId
  userId
  status
  initialBalances{
  base
  quote
  }
  currentBalances{
  base
  quote
  }
  initialPrice
  lastPrice
  profit{
  totalUsd
  total
  }
  funding{
  totalUsd
  total
  lastTime
  }
  avgPrice
  commission
  createTime
  updateTime
  closeTime
  levels{
  all
  complete
  }
  usage{
  current{
  quote
  base
  }
  max {
  quote
  base
  }
  }
  settings{
  ordersCount
  tpPerc
  profitCurrency
  avgPrice
  baseOrderSize
  orderSize
  useTp
  useSl
  slPerc
  useDca
  changed
  useSmartOrders
  activeOrdersCount
  orderSizePercQty
  }
  orders{
  _id
  clientOrderId
  cummulativeQuoteQty
  executedQty
  fills{
  tradeId
  price
  qty
  commission
  commissionAsset
  }
  icebergQty
  isIsolated
  isWorking
  orderId
  orderListId
  origQty
  price
  side
  status
  stopPrice
  symbol
  baseAsset
  quoteAsset
  time
  timeInForce
  transactTime
  type
  updateTime
  created
  updated
  exchange
  exchangeUUID
  botId
  userId
  typeOrder
  dealId
  }
  stats {
  drawdownPercent
  runUpPercent
  timeInProfit
  timeInLoss
  trackTime
  timeCountStart
  currentCount
  }
  assets{
  used{
  base
  quote
  }
  required{
  base
  quote
  }
  }
  dcaBot{
  settings{
  ${dcaBotSettingsFragment}
  }
  symbol{
  symbol
  baseAsset
  quoteAsset
  }
  _id
  status
  public
  }
  gridBreakpoints{
  price
  displacedPrice
  }`
  }
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getDealOrders: (input: {
    id: string;
    shareId?: string;
    dealId: string;
    all?: boolean;
  }) => {
    const query = `query getDealOrders($input: getDealOrdersInput!) {
  getDealOrders(input: $input) {
  status
  reason
  data {
  ${orders}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getComboDealOrders: (input: {
    id: string;
    shareId?: string;
    dealId: string;
    all?: boolean;
  }) => {
    const query = `query getComboDealOrders($input: getDealOrdersInput!) {
  getComboDealOrders(input: $input) {
  status
  reason
  data {
  ${orders}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeComboDealOrders: (input: {
    id: string;
    shareId?: string;
    dealId: string;
    all?: boolean;
  }) => {
    const query = `query getHedgeComboDealOrders($input: getDealOrdersInput!) {
  getHedgeComboDealOrders(input: $input) {
  status
  reason
  data {
  ${orders}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getHedgeDCADealOrders: (input: {
    id: string;
    shareId?: string;
    dealId: string;
    all?: boolean;
  }) => {
    const query = `query getHedgeDCADealOrders($input: getDealOrdersInput!) {
  getHedgeDCADealOrders(input: $input) {
  status
  reason
  data {
  ${orders}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  resetDealSettings: (input: { botId: string; dealId: string }) => {
    const query = `query resetDealSettings($input: resetDealSettingsInput!) {
  resetDealSettings(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  resetComboDealSettings: (input: { botId: string; dealId: string }) => {
    const query = `query resetComboDealSettings($input: resetDealSettingsInput!) {
  resetComboDealSettings(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  moveDealToTerminal: (input: {
    botId: string;
    dealId: string;
    combo: boolean;
  }) => {
    const query = `mutation moveDealToTerminal($input: moveDealToTerminalInput!) {
  moveDealToTerminal(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  addDealFunds: (
    input: {
      dealId: string;
      botId: string;
      qty: string;
      useLimitPrice: boolean;
      limitPrice?: string;
      asset: OrderSizeTypeEnum;
      type?: AddFundsTypeEnum;
    } & Partial<Bot['settings']>
  ) => {
    const query = `mutation addDealFunds($input: addDealFundsInput!) {
  addDealFunds(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  reduceDealFunds: (
    input: {
      dealId: string;
      botId: string;
      qty: string;
      useLimitPrice: boolean;
      limitPrice?: string;
      asset: OrderSizeTypeEnum;
      type?: AddFundsTypeEnum;
    } & Partial<Bot['settings']>
  ) => {
    const query = `mutation reduceDealFunds($input: addDealFundsInput!) {
  reduceDealFunds(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  cancelTerminalDealOrder: (input: {
    dealId: string;
    botId: string;
    orderId: string;
  }) => {
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

  openDCADeal: (input: { botId: string; symbol?: string }) => {
    const query = `mutation openDCADeal($input: openDCADeal!) {
  openDCADeal(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  openComboDeal: (input: { botId: string; symbol?: string }) => {
    const query = `mutation openComboDeal($input: openDCADeal!) {
  openComboDeal(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  openMultiPairDCADeal: (input: { botId: string; symbol: string }) => {
    const query = `mutation openMultiPairDCADeal($input: openMultiPairDCADeal!) {
  openMultiPairDCADeal(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  closeDCADeal: (input: {
    botId: string;
    dealId: string;
    type: CloseDCATypeEnum;
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
    botId: string;
    dealId: string;
    type: CloseDCATypeEnum;
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

  closeMultiPairDCADeal: (input: {
    botId: string;
    dealId: string;
    type: CloseDCATypeEnum;
  }) => {
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

  changeDCADealSettings: (input: {
    botId: string;
    dealId: string;
    settings: Partial<DCADealsSettings>;
  }) => {
    const query = `mutation changeDCADealSettings($input: dcaDealSettingsInput!) {
  changeDCADealSettings(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  changeComboDealSettings: (input: {
    botId: string;
    dealId: string;
    settings: Partial<DCADealsSettings>;
  }) => {
    const query = `mutation changeComboDealSettings($input: comboDealSettingsInput!) {
  changeComboDealSettings(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  mergeDeals: (input: { botId: string; dealIds: string[] }) => {
    const query = `mutation mergeDeals($input: mergeDealsInput!) {
  mergeDeals(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setDealNote: (input: { note?: string; type: BotTypesEnum; id: string }) => {
    const query = `mutation setDealNote($input: setDealNoteInput!) {
  setDealNote(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = {
      input,
    };
    return { query, variables };
  },

  setBacktestTextFields: (input: {
    name?: string;
    note?: string;
    type: BotTypesEnum;
    id: string;
  }) => {
    const query = `mutation setBacktestTextFields($input: setBacktestTextFieldsInput!) {
  setBacktestTextFields(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },
};
