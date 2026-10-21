import { cn } from '@/lib/utils';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import type { Currency } from '@/utils/currencyUtils';
import { formatUsdAsReporting } from '@/utils/reportingCurrency';
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

/** A USD value in full form in the reporting currency, e.g. +$1,514.88 */
function formatFull(value: number, showSign: boolean, currency: Currency) {
  return formatUsdAsReporting(
    value,
    { sign: showSign ? 'always' : 'auto' },
    currency
  );
}

/** Compact form, e.g. +$1.5K, -€3.2M; small numbers stay in full. */
function formatCompact(value: number, showSign: boolean, currency: Currency) {
  return formatUsdAsReporting(
    value,
    { sign: showSign ? 'always' : 'auto', compact: true },
    currency
  );
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
  steps: readonly FontStep[],
  currency: Currency
): { sizeClass: string; text: string } {
  return fitPresentation(
    formatFull(value, showSign, currency),
    formatCompact(value, showSign, currency),
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
  const { currency } = useReportingCurrency();
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
          fontSteps,
          currency
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
