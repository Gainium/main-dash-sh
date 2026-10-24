import type { OrderData, OrderSlippageSource } from '..';

export interface Exchange {
  uuid: string;
  name?: string;
  provider: string;
}

export interface Order {
  orderId: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  price: string;
  quantity: string;
  baseAssetName: string;
  quoteAssetName: string;
  exchangeUUID: string;
  exchangeName?: string;
  exchange?: string;
  botId?: string;
  botType?: string;
  botName?: string;
}

export interface ViewOrder {
  id: string;
  dealId: string;
  type: 'buy' | 'sell';
  status: 'pending' | 'filled' | 'cancelled' | 'partial';
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  amount: number;
  price: number;
  filled: number;
  remaining: number;
  total: number;
  createTime: string;
  updateTime?: string;
  side: 'buy' | 'sell'; // Changed from 'base' | 'safety' to match actual buy/sell
  exchange?: string;
  executedQuantity?: number;
  executedPrice?: number;
  orderType?: string;
  origQty: string;
  executedQty: string;
  typeOrder: OrderData['typeOrder'];
  sl?: boolean;
  clientOrderId: string;
  reduceFundsId?: string;
  addFundsId?: string;
  time: number;
  slippageBps?: number | null | undefined;
  slippageQuote?: number | null | undefined;
  slippageSource?: OrderSlippageSource | null | undefined;
  feeQuote?: number | null | undefined;
  feeEstimated?: boolean | null | undefined;
  feeConverted?: boolean | null | undefined;
}

export interface Position {
  positionId: string;
  symbol: string;
  side: string;
  leverage: string;
  marginType: string;
  price: string;
  quantity: string;
  baseAssetName: string;
  quoteAssetName: string;
  exchangeUUID: string;
  exchangeName?: string;
  exchange?: string;
  botId?: string;
  botType?: string;
  botName?: string;
}
