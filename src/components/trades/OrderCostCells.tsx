import React from 'react';

import { cn } from '@/lib/utils';
import type { ViewOrder } from '@/types/bots';
import { PendingLiveValue } from '../ui/pending-live-value';
import {
  ORDER_FEE_ESTIMATED_TOOLTIP,
  SLIPPAGE_RECONSTRUCTED_TOOLTIP,
  bpsTone,
  costTone,
  formatCost,
  formatPnlBps,
  isFiniteNumber,
  orderHasFee,
  orderHasSlippage,
} from '@/utils/tradingCosts';

type CostOrder = Pick<
  ViewOrder,
  | 'quoteAsset'
  | 'slippageBps'
  | 'slippageQuote'
  | 'slippageSource'
  | 'feeQuote'
  | 'feeEstimated'
> & { __smart?: boolean };

const TONE_CLASS = {
  up: 'text-profit',
  down: 'text-loss',
  neutral: 'text-foreground',
} as const;

/** Slippage in bps over its quote amount, both as their effect on P&L
 *  (adverse = negative, red; improvement = positive, green), like the Fee
 *  column. Renders nothing for an order without a figure. */
export const OrderSlippage: React.FC<{ order: CostOrder }> = ({ order }) => {
  if (!orderHasSlippage(order)) return null;
  const bps = order.slippageBps;
  const quote = order.slippageQuote;
  return (
    <PendingLiveValue
      pending={order.slippageSource === 'reconstructed'}
      variant="saved"
      tooltip={SLIPPAGE_RECONSTRUCTED_TOOLTIP}
    >
      <span className="flex flex-col">
        {isFiniteNumber(bps) && (
          <span
            className={cn(
              'text-sm tabular-nums whitespace-nowrap',
              TONE_CLASS[bpsTone(bps)]
            )}
          >
            {formatPnlBps(bps)}
          </span>
        )}
        {isFiniteNumber(quote) && (
          <span
            className={cn(
              'text-xs tabular-nums whitespace-nowrap',
              TONE_CLASS[costTone(quote, order.quoteAsset)]
            )}
          >
            {formatCost(quote, order.quoteAsset)}
          </span>
        )}
      </span>
    </PendingLiveValue>
  );
};

/** The order's fee in the quote asset, shown as a cost. Renders nothing when
 *  the fee is unknown. */
export const OrderFee: React.FC<{ order: CostOrder }> = ({ order }) => {
  if (!orderHasFee(order) || !isFiniteNumber(order.feeQuote)) return null;
  return (
    <PendingLiveValue
      pending={!!order.feeEstimated}
      variant="saved"
      tooltip={ORDER_FEE_ESTIMATED_TOOLTIP}
    >
      <span
        className={cn(
          'text-sm tabular-nums whitespace-nowrap',
          TONE_CLASS[costTone(order.feeQuote, order.quoteAsset)]
        )}
      >
        {formatCost(order.feeQuote, order.quoteAsset)}
      </span>
    </PendingLiveValue>
  );
};
