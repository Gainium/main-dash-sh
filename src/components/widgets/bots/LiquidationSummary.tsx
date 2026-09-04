/**
 * "Est. liquidation price" readout for the Margin & Leverage section.
 *
 * Shows where liquidation sits for the position the ladder builds — after the
 * base order alone, and after the whole ladder has been deployed — plus the
 * buffer to the nearest safety order and a cascade warning when filling one
 * safety order would push liquidation past the trigger of the next.
 *
 * The number is an ESTIMATE (see `@/utils/bots/dca/liquidation`): exchanges do
 * not give us their maintenance-margin bracket table, and funding/fees are
 * excluded. Every surface labels it "Est." for that reason.
 */

import { Badge } from '@/components/ui/badge';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import {
  DEFAULT_MAINTENANCE_MARGIN_RATE,
  formatLiquidationPrice,
  type LadderLiquidation,
  type LiquidationRisk,
} from '@/utils/bots/dca/liquidation';
import React from 'react';

const RISK_LABEL: Record<LiquidationRisk, string> = {
  safe: 'Safe',
  caution: 'Caution',
  danger: 'Danger',
};

const RISK_CLASS: Record<LiquidationRisk, string> = {
  safe: 'bg-profit/15 text-profit border-profit/30',
  caution: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
  danger: 'bg-loss/15 text-loss border-loss/30',
};

const DOT_CLASS: Record<LiquidationRisk, string> = {
  safe: 'bg-profit',
  caution: 'bg-yellow-500',
  danger: 'bg-loss',
};

export interface LiquidationSummaryProps {
  liquidation: LadderLiquidation | null;
  /** Cross margin borrows from the whole wallet — the estimate is a floor. */
  isCross?: boolean;
  quoteAsset?: string;
  className?: string;
}

export const LiquidationSummary: React.FC<LiquidationSummaryProps> = ({
  liquidation,
  isCross = false,
  quoteAsset = '',
  className = '',
}) => {
  if (!liquidation || !liquidation.initial?.liquidationPrice) return null;

  const { initial, final, effective, cascadeSteps, risk } = liquidation;
  const mmrPercent = (
    (liquidation.maintenanceMarginRate ?? DEFAULT_MAINTENANCE_MARGIN_RATE) * 100
  ).toFixed(2);
  const multipleSteps = (final?.index ?? 0) > 0;
  const cascades = cascadeSteps.length > 0;

  const priceLabel = (value: number | null | undefined) =>
    value == null
      ? '—'
      : `${formatLiquidationPrice(value)}${quoteAsset ? ` ${quoteAsset}` : ''}`;

  return (
    <div
      className={`space-y-xs border-t border-border/60 pt-sm ${className}`}
      data-testid="liquidation-summary"
    >
      <div className="flex items-center justify-between gap-xs">
        <div className="flex items-center gap-xs">
          <span className={`size-2 rounded-full ${DOT_CLASS[risk]}`} />
          <span className="text-xs font-medium">Est. liquidation price</span>
          <Tooltip
            tooltip={`Estimated from your average entry and ${liquidation.leverage}x leverage, assuming a ${mmrPercent}% maintenance margin rate. Exchanges do not expose their maintenance-margin tiers to us, and funding and fees are excluded — treat this as an indication, not the exchange's own figure.`}
          >
            <InfoIcon />
          </Tooltip>
        </div>
        <Badge variant="outline" className={`text-xs ${RISK_CLASS[risk]}`}>
          {RISK_LABEL[risk]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-xs">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {multipleSteps ? 'After base order' : 'At entry'}
          </p>
          <p className="font-mono text-sm font-semibold text-loss">
            {priceLabel(initial.liquidationPrice)}
          </p>
          {initial.bufferPercent != null && (
            <p className="text-xs text-muted-foreground">
              {initial.bufferPercent.toFixed(2)}% away
            </p>
          )}
        </div>

        {multipleSteps && effective && (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {cascades
                ? `Liquidates after order #${effective.index + 1}`
                : `After all ${(final?.index ?? 0) + 1} orders`}
            </p>
            <p className="font-mono text-sm font-semibold text-loss">
              {priceLabel(effective.liquidationPrice)}
            </p>
            {effective.bufferPercent != null && (
              <p className="text-xs text-muted-foreground">
                {effective.bufferPercent.toFixed(2)}% away
              </p>
            )}
          </div>
        )}
      </div>

      {cascadeSteps.length > 0 && (
        <p className="rounded-md border border-loss/25 bg-loss/10 p-xs text-xs leading-snug text-loss">
          <strong>Cascade risk:</strong> filling order #
          {cascadeSteps[0].index + 1} at {priceLabel(cascadeSteps[0].orderPrice)}{' '}
          moves liquidation to {priceLabel(cascadeSteps[0].liquidationPrice)},
          past the trigger of the next safety order — the ladder would liquidate
          before it finishes deploying. Widen the spacing, cut the order size or
          lower the leverage.
        </p>
      )}

      {isCross && (
        <p className="text-xs leading-snug text-muted-foreground">
          Cross margin: your free wallet balance also backs this position, so
          the real liquidation price sits further away than shown.
        </p>
      )}
    </div>
  );
};

export default LiquidationSummary;
