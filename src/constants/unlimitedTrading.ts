import { ExchangeEnum } from '@/types/exchange.types';

/**
 * Exchanges with unlimited trading on the free plan, and how a connection
 * proves it — mirrors `unlimitedTradingExchanges` in main-app's types.ts.
 * The proof is stored per connection as `affiliate`; this list only says
 * where it can be earned.
 *  - builderFee: the wallet approves our builder fee (Hyperliquid)
 *  - referral: the account was registered through our affiliate link
 */
export const unlimitedTradingExchanges: Partial<
  Record<ExchangeEnum, 'builderFee' | 'referral'>
> = {
  [ExchangeEnum.hyperliquid]: 'builderFee',
  [ExchangeEnum.hyperliquidLinear]: 'builderFee',
  [ExchangeEnum.hyperliquidAll]: 'builderFee',
};

export const offersUnlimitedTrading = (provider?: string) =>
  !!provider && provider in unlimitedTradingExchanges;
