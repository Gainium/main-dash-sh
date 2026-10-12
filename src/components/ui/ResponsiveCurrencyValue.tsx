import { cn } from '@/lib/utils';
import React from 'react';
import { fitPresentation } from './fitPresentation';
import { ResponsiveValue } from './ResponsiveValue';

export interface FontStep {
  sizeClass: string;
  px: number;
}

export interface ResponsiveCurrencyValueProps {
  value: number;
  /** Show +/- sign prefix. Default: true */
  showSign?: boolean;
  /** Extra className on the span */
  className?: string;
  /** Override the descending font-size ladder. Largest first. */
  fontSteps?: FontStep[];
  /** Override color class (e.g. fixed 'text-foreground' for hero values) */
  colorClassOverride?: string;
  /** Text alignment of the rendered value. Default: 'right'. */
  align?: 'left' | 'right' | 'center';
}

/**
 * Formats a currency value in full form, e.g. +$1,514.88
 */
function formatFull(value: number, showSign: boolean): string {
  const abs = Math.abs(value);
  const sign = showSign
    ? value > 0
      ? '+'
      : value < 0
        ? '-'
        : ''
    : value < 0
      ? '-'
      : '';
  return `${sign}${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)}`;
}

/**
 * Formats a currency value in compact form, e.g. +$1.5K, -$3.2M
 */
function formatCompact(value: number, showSign: boolean): string {
  const abs = Math.abs(value);
  const sign = showSign
    ? value > 0
      ? '+'
      : value < 0
        ? '-'
        : ''
    : value < 0
      ? '-'
      : '';

  if (abs >= 1_000_000_000)
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  // Small numbers: no abbreviation needed
  return formatFull(value, showSign);
}

function colorClass(value: number): string {
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-foreground';
}

// Font sizes tried in descending order (prefer largest that fits)
const FONT_STEPS: readonly FontStep[] = [
  { sizeClass: 'text-2xl', px: 24 },
  { sizeClass: 'text-xl', px: 20 },
  { sizeClass: 'text-lg', px: 18 },
  { sizeClass: 'text-base', px: 16 },
  { sizeClass: 'text-sm', px: 14 },
];

function selectPresentation(
  value: number,
  showSign: boolean,
  containerWidth: number,
  steps: readonly FontStep[]
): { sizeClass: string; text: string } {
  return fitPresentation(
    formatFull(value, showSign),
    formatCompact(value, showSign),
    containerWidth,
    steps
  );
}

/**
 * ResponsiveCurrencyValue
 *
 * Observes its own container width and automatically picks the best combination
 * of font size and number format (full vs. abbreviated K/M/B) so the value
 * always fits cleanly without overflow and is shown as large as possible.
 *
 * Usage:
 * ```tsx
 * <ResponsiveCurrencyValue value={1514.88} showSign />
 * ```
 */
export const ResponsiveCurrencyValue: React.FC<
  ResponsiveCurrencyValueProps
> = ({
  value,
  showSign = true,
  className,
  fontSteps = FONT_STEPS,
  colorClassOverride,
  align = 'right',
}) => {
  const alignClass =
    align === 'left'
      ? 'text-left'
      : align === 'center'
        ? 'text-center'
        : 'text-right';
  return (
    <ResponsiveValue className={alignClass}>
      {(width) => {
        const { sizeClass, text } = selectPresentation(
          value,
          showSign,
          width,
          fontSteps
        );
        return (
          <span
            className={cn(
              'font-bold',
              colorClassOverride ?? colorClass(value),
              sizeClass,
              className
            )}
          >
            {text}
          </span>
        );
      }}
    </ResponsiveValue>
  );
};

export default ResponsiveCurrencyValue;
