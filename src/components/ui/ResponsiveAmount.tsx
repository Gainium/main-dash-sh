import React from 'react';
import { fitPresentation } from './fitPresentation';
import type { FontStep } from './ResponsiveCurrencyValue';
import { ResponsiveValue } from './ResponsiveValue';
import { Tooltip } from './tooltip';
import { formatAssetAmount } from '@/utils/formatters';
import { formatNumber } from '@/utils/numberFormatter';

export interface ResponsiveAmountProps {
  value: number;
  /** Decimals of the exact form; unknown → the exact value up to 8 decimals. */
  precision?: number;
  /** Text before the amount, e.g. "Base: ". */
  label?: string;
  /** Asset ticker printed after the amount. */
  asset?: string;
  /** Applied to the measuring container. */
  className?: string;
}

// Table cells keep their own size; only the number format adapts.
const CELL_STEPS: readonly FontStep[] = [{ sizeClass: 'text-xs', px: 12 }];

/**
 * An asset amount that fits its container the way the dashboard value widgets
 * do: the exact amount at `precision` when it fits, the compact K/M form when
 * it does not — and then the exact amount on hover.
 */
export const ResponsiveAmount: React.FC<ResponsiveAmountProps> = ({
  value,
  precision,
  label = '',
  asset = '',
  className,
}) => {
  const unit = asset ? ` ${asset}` : '';
  const exact = `${formatAssetAmount(value, precision)}${unit}`;
  const full = `${label}${exact}`;
  const compact = `${label}${formatNumber(value, false)}${unit}`;
  return (
    <ResponsiveValue className={className}>
      {(width) => {
        const { text } = fitPresentation(full, compact, width, CELL_STEPS);
        return (
          <Tooltip tooltip={text === full ? undefined : exact}>
            <span>{text}</span>
          </Tooltip>
        );
      }}
    </ResponsiveValue>
  );
};

export default ResponsiveAmount;
