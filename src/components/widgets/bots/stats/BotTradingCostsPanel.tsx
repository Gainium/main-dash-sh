import type { FC } from 'react';

import { PendingLiveValue } from '@/components/ui/pending-live-value';
import { useBotTradingCosts } from '@/hooks/useTradingCosts';
import type { BotTypesEnum } from '@/types';
import {
  FEES_ESTIMATED_TOOLTIP,
  SLIPPAGE_RECONSTRUCTED_TOOLTIP,
  costShareOfGross,
  costTone,
  formatCost,
  hasCostFigures,
  isFiniteNumber,
} from '@/utils/tradingCosts';

import { MetricRow, Panel } from '../statsPrimitives';

export interface BotTradingCostsPanelProps {
  botId: string;
  botType: BotTypesEnum;
  /** False while the Stats tab is not the active one — gates the fetch. */
  active?: boolean;
}

/**
 * The bot's total fees and slippage over its deals, and what they took out
 * of the gross, beside the Statistics tab's profit figures. Amounts are in
 * the bot's quote asset. Renders nothing on a backend without them.
 */
export const BotTradingCostsPanel: FC<BotTradingCostsPanelProps> = ({
  botId,
  botType,
  active = true,
}) => {
  const costs = useBotTradingCosts({ botId, type: botType, enabled: active });
  if (!costs || !hasCostFigures(costs)) return null;

  const quoteAsset = costs.quoteAsset ?? undefined;
  const share = costShareOfGross(costs);

  return (
    <Panel title="Trading Costs">
      {isFiniteNumber(costs.feesQuote) && (
        <MetricRow
          k="Fees"
          v={
            <PendingLiveValue
              pending={!!costs.feesEstimated}
              variant="saved"
              tooltip={FEES_ESTIMATED_TOOLTIP}
            >
              {formatCost(costs.feesQuote, quoteAsset)}
            </PendingLiveValue>
          }
          tone={costTone(costs.feesQuote, quoteAsset)}
        />
      )}
      {isFiniteNumber(costs.slippageQuote) && (
        <MetricRow
          k="Slippage"
          v={
            <PendingLiveValue
              pending={!!costs.slippageReconstructed}
              variant="saved"
              tooltip={SLIPPAGE_RECONSTRUCTED_TOOLTIP}
            >
              {formatCost(costs.slippageQuote, quoteAsset)}
            </PendingLiveValue>
          }
          tone={costTone(costs.slippageQuote, quoteAsset)}
        />
      )}
      {share !== undefined && (
        <MetricRow k="Costs / Gross" v={`${share.toFixed(1)}%`} />
      )}
    </Panel>
  );
};
