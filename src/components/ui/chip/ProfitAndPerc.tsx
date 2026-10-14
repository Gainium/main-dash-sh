import { cn } from '@/lib/utils';
import React from 'react';
import { PendingLiveValue } from '../pending-live-value';
import { ProfitLossPercChip } from './ProfitLossPercChip';

export interface ProfitAndPercProps {
  /** Absolute profit/loss value */
  value: number;
  /** Percentage value for the chip */
  percentage: number;
  /** Privacy mode - hides values with *** */
  privacyMode: boolean;
  /** Position of percentage chip: 'right' (inline) or 'bottom' (stacked) */
  chipPosition?: 'right' | 'bottom';
  /** Hide the percentage chip entirely */
  hidePercentage?: boolean;
  /** Size variant - affects both value and chip sizing */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Show sign prefix (+/-) */
  showSign?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Additional className for the value */
  valueClassName?: string;
  /** Additional className for the chip */
  chipClassName?: string;
  /**
   * The figure is not live (the server's saved value, or priced from the
   * previous session's snapshot): dimmed, with a tooltip. See
   * `PendingLiveValue`.
   */
  pending?: boolean | undefined;
}

/**
 * ProfitAndPerc component displays an absolute profit/loss value
 * with an optional percentage chip positioned next to it or below it.
 *
 * Features:
 * - Privacy mode support (shows ***)
 * - Configurable chip position (right/bottom)
 * - Multiple size variants
 * - Can hide percentage chip
 * - Automatic profit/loss color styling
 *
 * @example
 * <ProfitAndPerc
 *   value={1234.56}
 *   percentage={12.5}
 *   privacyMode={false}
 *   chipPosition="right"
 *   size="md"
 * />
 */
export const ProfitAndPerc: React.FC<ProfitAndPercProps> = ({
  value,
  percentage,
  privacyMode,
  chipPosition = 'right',
  hidePercentage = false,
  size = 'md',
  showSign = true,
  className = '',
  valueClassName = '',
  chipClassName = '',
  pending = false,
}) => {
  // Size configuration
  const sizeConfig = {
    xs: {
      valueText: 'text-xs',
      chipSize: 'xs' as const,
      gap: chipPosition === 'right' ? 'gap-1' : 'gap-0.5',
    },
    sm: {
      valueText: 'text-sm',
      chipSize: 'xs' as const,
      gap: chipPosition === 'right' ? 'gap-1.5' : 'gap-0.5',
    },
    md: {
      valueText: 'text-base',
      chipSize: 'sm' as const,
      gap: chipPosition === 'right' ? 'gap-2' : 'gap-1',
    },
    lg: {
      valueText: 'text-lg',
      chipSize: 'sm' as const,
      gap: chipPosition === 'right' ? 'gap-2' : 'gap-1',
    },
    xl: {
      valueText: 'text-xl',
      chipSize: 'md' as const,
      gap: chipPosition === 'right' ? 'gap-2.5' : 'gap-1',
    },
  };

  const config = sizeConfig[size];

  // Format value for display
  const formatValue = (val: number): string => {
    if (privacyMode) return '***';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(val));
  };

  // Determine color class based on profit/loss
  const getColorClass = () => {
    if (privacyMode) return 'text-muted-foreground';
    if (value > 0) return 'text-profit';
    if (value < 0) return 'text-loss';
    return 'text-foreground';
  };

  const sign =
    showSign && !privacyMode && value !== 0 ? (value > 0 ? '+' : '-') : '';
  const displayValue = formatValue(value);

  return (
    <PendingLiveValue pending={pending}>
      <div
        className={cn(
          'inline-flex items-center',
          chipPosition === 'right' ? 'flex-row' : 'flex-col',
          config.gap,
          className
        )}
      >
        {/* Absolute value */}
        <span
          className={cn(
            'font-semibold',
            config.valueText,
            getColorClass(),
            valueClassName
          )}
        >
          {sign}
          {displayValue}
        </span>

        {/* Percentage chip */}
        {!hidePercentage && (
          <ProfitLossPercChip
            value={percentage}
            size={config.chipSize}
            showSign={true}
            showPercent={true}
            className={chipClassName}
          />
        )}
      </div>
    </PendingLiveValue>
  );
};

export default ProfitAndPerc;
