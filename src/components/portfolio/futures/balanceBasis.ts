import { ExchangeEnum } from '@/types/exchange.types';

/**
 * What a futures account's stored balance means, per venue.
 *
 * - `wallet`  — excludes unrealized PnL; equity = balance + unrealized PnL.
 * - `equity`  — already includes unrealized PnL; adding it again double counts.
 * - `unknown` — not established; the card shows "—" rather than guess.
 *
 * ⚠️ This mirrors exchange-connector behaviour with no code link. The stored
 * balance is the connector's `free + locked` for the account's futures
 * `getBalance` (connector `core/src/exchange/exchanges/<venue>/index.ts`):
 *
 *   binance  usdm/coinm   walletBalance                          → wallet
 *   bybit    linear/inv   walletBalance                          → wallet
 *   okx      linear/inv   availBal + frozenBal (cash balance)    → wallet
 *   bitget   usdm         accountEquity − unrealizedPL           → wallet
 *   bitget   coinm        accountEquity (classic account)        → equity
 *   kucoin   linear/inv   available + position/order margin + frozen
 *                         = accountEquity                        → equity
 *   hyperliquid linear    marginSummary.accountValue             → equity
 *   kraken   usdm         flex collateral quantity               → wallet
 *   kraken   coinm        not implemented in the connector       → unknown
 *
 * Paper venues keep a ledger that books PnL only on close → wallet.
 *
 * If a connector's futures balance mapping changes, update this table.
 */
export type BalanceBasis = 'wallet' | 'equity' | 'unknown';

const BASIS: Partial<Record<ExchangeEnum, BalanceBasis>> = {
  [ExchangeEnum.binanceUsdm]: 'wallet',
  [ExchangeEnum.binanceCoinm]: 'wallet',
  [ExchangeEnum.bybitUsdm]: 'wallet',
  [ExchangeEnum.bybitCoinm]: 'wallet',
  [ExchangeEnum.okxLinear]: 'wallet',
  [ExchangeEnum.okxInverse]: 'wallet',
  [ExchangeEnum.bitgetUsdm]: 'wallet',
  [ExchangeEnum.bitgetCoinm]: 'equity',
  [ExchangeEnum.kucoinLinear]: 'equity',
  [ExchangeEnum.kucoinInverse]: 'equity',
  [ExchangeEnum.hyperliquidLinear]: 'equity',
  [ExchangeEnum.krakenUsdm]: 'wallet',

  [ExchangeEnum.paperBinanceUsdm]: 'wallet',
  [ExchangeEnum.paperBinanceCoinm]: 'wallet',
  [ExchangeEnum.paperBybitUsdm]: 'wallet',
  [ExchangeEnum.paperBybitCoinm]: 'wallet',
  [ExchangeEnum.paperOkxLinear]: 'wallet',
  [ExchangeEnum.paperOkxInverse]: 'wallet',
  [ExchangeEnum.paperBitgetUsdm]: 'wallet',
  [ExchangeEnum.paperBitgetCoinm]: 'wallet',
  [ExchangeEnum.paperKucoinLinear]: 'wallet',
  [ExchangeEnum.paperKucoinInverse]: 'wallet',
  [ExchangeEnum.paperHyperliquidLinear]: 'wallet',
  [ExchangeEnum.paperKrakenUsdm]: 'wallet',
  [ExchangeEnum.paperKrakenCoinm]: 'wallet',
};

export function balanceBasisFor(
  provider: ExchangeEnum | string | null | undefined
): BalanceBasis {
  if (!provider) return 'unknown';
  return BASIS[provider as ExchangeEnum] ?? 'unknown';
}
