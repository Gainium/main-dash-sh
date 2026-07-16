import type {
  ExchangeEnum,
  CoinbaseKeysType,
  OKXSource,
} from '../../types/exchange.types';
import {
  exchangeFragment,
  shortExchangeFragment,
  dcaBotFragment,
} from './GraphQLQueries-fragments';

export const exchangeQueries = {
  getExchange: (input: { uuid: string }) => {
    const query = `query getExchange($input: getExchangeInput!) {
                        getExchange(input: $input) {
                            status
                            reason
                            data {
                                ${exchangeFragment}
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getAllExchanges: (params: { short?: boolean } = {}) => {
    const { short = false } = params;
    const query = `query getAllExchanges{
                        user{
                            status
                            reason
                            data {
                                exchanges {
                                    ${
                                      short
                                        ? shortExchangeFragment
                                        : exchangeFragment
                                    }
                                }
                            }
                        }
                    }`;
    return { query };
  },

  deleteExchange: (input: { uuid: string }) => {
    const query = `mutation deleteExchange($input: deleteExchangeInput!) {
                        deleteExchange(input: $input) {
                            status
                            reason
                            data
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getExchangesTotal: () => {
    const query = `query getExchangesTotal{
                        getPortfolioByUser{
                            status
                            reason
                            data{
                                result{
                                    updateTime
                                    exchangesTotal{
                                        uuid
                                        totalUsd
                                    }
                                }
                            }
                        }
                    }`;
    return { query };
  },

  getPairInfo: (input: { pair: string; exchange: ExchangeEnum }) => {
    const query = `query getPairInfo($input: getPairInput!){
            getPairInfo(input: $input){
                status
                reason
                data {
                    pair
                    exchange
                    wsCode
                    code
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

  // Add exchange mutation
  addExchange: (input: {
    provider: ExchangeEnum;
    key: string;
    secret: string;
    name: string;
    passphrase?: string | undefined;
    stablecoinBalance?: number | undefined;
    coinToTopUp?: string | undefined;
    topUps?:
      | { provider: ExchangeEnum; asset: string; amount: number }[]
      | undefined;
    tradeType?: string | undefined;
    keysType?: CoinbaseKeysType | undefined;
    okxSource?: OKXSource | undefined;
    bybitHost?: string | undefined;
    shouldCheckAffiliate?: boolean | undefined;
    subaccount?: boolean | undefined;
  }) => {
    const query = `mutation addExchange($input: addExchangeInput!) {
                        addExchange(input: $input) {
                            status
                            reason
                            data {
                                ${exchangeFragment}
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Update exchange mutation
  updateExchange: (input: {
    uuid: string;
    key?: string | undefined;
    secret?: string | undefined;
    name?: string | undefined;
    passphrase?: string | undefined;
    stablecoinBalance?: number | undefined;
    coinToTopUp?: string | undefined;
    keysType?: CoinbaseKeysType | undefined;
    okxSource?: OKXSource | undefined;
    bybitHost?: string | undefined;
  }) => {
    const query = `mutation updateExchange($input: updateExchangeInput!) {
                        updateExchange(input: $input) {
                            status
                            reason
                            data {
                                ${exchangeFragment}
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Set hedge mode mutation. Server returns `setHedgeResponse { status,
  // reason, data: Boolean }` — `data` is a scalar success flag, NOT the
  // exchange object. Selecting subfields here used to fail with
  // "Field 'data' must not have a selection since type 'Boolean' has no
  // subfields." The caller synthesizes the updated ExchangeInUser from
  // the input + cached state.
  setHedge: (input: { uuid: string; hedge: boolean }) => {
    const query = `mutation setHedge($input: setHedgeInput!) {
                        setHedge(input: $input) {
                            status
                            reason
                            data
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Set zero fee mutation. Same `data: Boolean` shape as setHedge.
  setZeroFee: (input: { uuid: string; value: boolean }) => {
    const query = `mutation setZeroFee($input: setZeroFeeInput!) {
                        setZeroFee(input: $input) {
                            status
                            reason
                            data
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Update balance query (note: this is a query, not a mutation)
  updateBalance: (input?: { skipSnapshot?: boolean | undefined }) => {
    const query = `query updateBalance($input: updateBalanceInput) {
                        updateBalance(input: $input) {
                            status
                            reason
                            data {
                                result {
                                    updateTime
                                    exchangesTotal {
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

  // Update status query (note: this is a query, not a mutation)
  updateStatus: () => {
    const query = `query updateStatus {
                        updateStatus {
                            status
                            reason
                            data {
                                ${exchangeFragment}
                            }
                        }
                    }`;
    return { query };
  },

  // ===== AUTO-ADDED MISSING FUNCTIONS =====
  // Added by API Enhancer - DO NOT EDIT MANUALLY

  importExchangeOrder: (input: {
    exchangeUUID: string;
    orderId: string;
    symbol: string;
    newBotSettings: {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      price: string;
      quantity: string;
      side: string;
    };
  }) => {
    const query = `mutation importExchangeOrder($input: importExchangeOrderInput!) { 
  importExchangeOrder(input: $input) {
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

  closeOrderOnExchange: (input: {
    symbol: string;
    orderId: string;
    exchangeUUID: string;
  }) => {
    const query = `mutation closeOrderOnExchange($input: closeOrderOnExchangeInput!) { 
  closeOrderOnExchange(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  closePositionOnExchange: (input: {
    positionId: string;
    exchangeUUID: string;
  }) => {
    const query = `mutation closePositionOnExchange($input: closePositionOnExchangeInput!) {
  closePositionOnExchange(input: $input) {
  status
  reason
  data
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

};
