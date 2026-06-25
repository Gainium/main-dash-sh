import { Tooltip } from '@/components/ui/tooltip';
import { useComponentError } from '@/hooks/bots/useComponentError';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useBalanceStore } from '@/stores/live/balanceStore';
import type { OrderSizeTypeEnum } from '@/types';
import {
  formatBalance as formatBalanceUtil,
  formatPercentage,
} from '@/utils/numberFormatter';
import { RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Input } from './input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import SettingsAlert from './SettingsAlert';
import { Skeleton } from './skeleton';

export interface BalanceInputProps {
  value?: number;
  onChange?: (value: number) => void;
  availableBalance?: number;
  currency?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  showPercentageButtons?: boolean;
  percentageButtons?: number[];
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  onRefreshBalance?: () => void;
  showRefreshButton?: boolean;
  coinIcon?: React.ReactNode;
  /** Unit symbol shown as text next to the coin icon (e.g. "USDT", "BTC").
   *  Opt-in: when set, the left adornment becomes icon + label and the input
   *  gains room for it. Used by order-size fields across all bot types. */
  unitLabel?: string;
  endAdornment?: React.ReactNode;
  // Currency reference integration
  currencyReference?: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd';
  onCurrencyReferenceChange?: (value: OrderSizeTypeEnum) => void;
  currencyReferenceOptions?: Array<{
    value: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd';
    label: string;
  }>;
  // Whether to disable the currency reference dropdown (but keep the input active)
  currencyReferenceDisabled?: boolean;
  // When disabling the currency dropdown, show a tooltip explaining why
  currencyReferenceTooltip?: string;
  // Balance display override (for showing different currency than input)
  balanceCurrency?: string; // Currency to display in balance section
  balanceAmount?: number; // Amount to display in balance section
  // Component error registration
  errorField?: string; // Field name for error registration (e.g., 'baseOrderSize')
  navId?: string; // Navigation ID for linking from alert summary
  readOnly?: boolean; // If true, input is read-only and shows value without allowing edits
}

export const BalanceInput: React.FC<BalanceInputProps> = ({
  value = 0,
  onChange,
  availableBalance = 0,
  currency = 'USD',
  placeholder = '0',
  disabled = false,
  error,
  className,
  showPercentageButtons = true,
  percentageButtons = [25, 50, 75],
  min = 0,
  max,
  step = 0.01,
  precision = 8,
  onRefreshBalance,
  showRefreshButton = true,
  coinIcon,
  unitLabel,
  endAdornment,
  currencyReference,
  onCurrencyReferenceChange,
  currencyReferenceOptions = [],
  currencyReferenceDisabled = false,
  currencyReferenceTooltip,
  balanceCurrency,
  balanceAmount,
  errorField,
  navId,
  readOnly,
}) => {
  const [inputValue, setInputValue] = useState<string>(
    value?.toString() || '0'
  );
  const [manualRefreshActive, setManualRefreshActive] = useState(false);
  const manualRefreshFallback = React.useRef<number | undefined>(undefined);
  const prevBalanceRef = React.useRef<number | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [containerRef, containerWidth] = useContainerWidth();

  // Subscribe to balance store loading state using the selector
  const isBalanceLoading = useBalanceStore((state) => state.loading);
  const [showSpinner, setShowSpinner] = useState(false);
  const [manualSpinner, setManualSpinner] = useState(false);

  // Keep the spinner visible for a minimum duration so it's noticeable
  useEffect(() => {
    let hideTimer: number | undefined;
    if (isBalanceLoading || manualSpinner) {
      setShowSpinner(true);
    } else if (showSpinner) {
      // Delay hiding the spinner to make it noticeable
      hideTimer = window.setTimeout(() => {
        setShowSpinner(false);
      }, 600); // 600ms minimum visibility
    }
    return () => {
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [isBalanceLoading, showSpinner, manualSpinner]);

  // Cleanup fallback timeout on unmount
  useEffect(() => {
    return () => {
      if (manualRefreshFallback.current) {
        window.clearTimeout(manualRefreshFallback.current);
        manualRefreshFallback.current = undefined;
      }
    };
  }, []);

  const handleManualRefresh = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      // Immediately show spinner and mark manual refresh as active
      setManualSpinner(true);
      setManualRefreshActive(true);
      prevBalanceRef.current = availableBalance;

      // Call the refresh callback if provided
      if (typeof onRefreshBalance === 'function') {
        const maybeP = onRefreshBalance() as unknown;
        // Clear manual spinner when the returned promise resolves (or rejects)
        if (
          maybeP &&
          typeof (maybeP as Promise<unknown>)?.finally === 'function'
        ) {
          (maybeP as Promise<unknown>).finally(() => {
            setManualSpinner(false);
            setManualRefreshActive(false);
            if (manualRefreshFallback.current) {
              window.clearTimeout(manualRefreshFallback.current);
              manualRefreshFallback.current = undefined;
            }
          });
        }
      }

      // Start fallback timeout
      if (manualRefreshFallback.current)
        window.clearTimeout(manualRefreshFallback.current);
      manualRefreshFallback.current = window.setTimeout(() => {
        setManualSpinner(false);
        setManualRefreshActive(false);
        manualRefreshFallback.current = undefined;
      }, 30000);
    },
    [availableBalance, onRefreshBalance]
  );

  // If the balances changed (reflected in availableBalance) while a manual
  // refresh was active, clear the manual spinner even if the refresh handler
  // didn't return a promise or the promise was not awaited.
  useEffect(() => {
    if (
      manualRefreshActive &&
      typeof prevBalanceRef.current === 'number' &&
      availableBalance !== prevBalanceRef.current
    ) {
      setManualSpinner(false);
      setManualRefreshActive(false);
      if (manualRefreshFallback.current) {
        window.clearTimeout(manualRefreshFallback.current);
        manualRefreshFallback.current = undefined;
      }
    }
  }, [availableBalance, manualRefreshActive]);

  const isStackedLayout = useMemo(() => {
    if (!containerWidth) {
      return false;
    }
    return containerWidth < 340;
  }, [containerWidth]);

  // Format number for display. Respects `precision` and trims trailing
  // zeros so the input doesn't show "100.00" or carry the raw float
  // noise that `Number.toString()` leaks (e.g. 100.12000000001).
  const formatNumber = useCallback(
    (num: number): string => {
      if (!Number.isFinite(num) || num === 0) return '0';
      const decimals = Math.max(0, precision);
      const fixed = num.toFixed(decimals);
      if (!fixed.includes('.')) return fixed;
      return fixed.replace(/0+$/, '').replace(/\.$/, '');
    },
    [precision]
  );

  // Sync inputValue with value prop when not editing.
  useEffect(() => {
    if (!isEditing) {
      setInputValue(formatNumber(value ?? 0));
    }
  }, [value, isEditing, formatNumber]);

  // Format balance display
  // Use shared formatting util for balance display.
  // This ensures we always apply consistent rounding/precision rules here
  // and avoid callers rounding values differently depending on context.
  const formatBalance = useCallback(
    (amount: number, currency?: string): string => {
      if (currency === '%') {
        return formatPercentage(amount);
      }
      return formatBalanceUtil(amount, currency);
    },
    []
  );

  // Calculate maximum allowed value
  const maxValue = useMemo(() => {
    if (max !== undefined) return Math.min(max, availableBalance);
    return availableBalance;
  }, [max, availableBalance]);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      // Parse and validate the input
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue) /* && numValue >= min */) {
        onChange?.(numValue);
      } else if (newValue === '' || newValue === '0') {
        onChange?.(0);
      }
    },
    [/* min, */ onChange]
  );

  // Handle percentage button click
  const handlePercentageClick = useCallback(
    (percentage: number) => {
      const calculatedAmount = (availableBalance * percentage) / 100;
      const clampedAmount = Math.min(Math.max(calculatedAmount, min), maxValue);
      const formattedValue = formatNumber(clampedAmount);

      setInputValue(formattedValue);
      onChange?.(clampedAmount);
    },
    [availableBalance, min, maxValue, formatNumber, onChange]
  );

  // Check if amount exceeds available balance
  const exceedsBalance = useMemo(() => {
    if (readOnly) {
      return false;
    }
    const numValue = parseFloat(inputValue);
    return !isNaN(numValue) && numValue > availableBalance;
  }, [inputValue, availableBalance, readOnly]);

  // Register component error with form context (if within a bot form)
  useComponentError(
    errorField ?? 'balance',
    exceedsBalance && !error, // Only register if no explicit error prop
    'The value exceeds the available balance',
    { navId }
  );

  // Handle input blur
  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Handle Enter key to finish editing
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
    }
  }, []);

  // Default coin icon
  const defaultCoinIcon = (
    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
      <span className="text-xs text-primary-foreground font-bold">$</span>
    </div>
  );
  const showCurrencyDropdown =
    currencyReferenceOptions.length > 0 &&
    currencyReference &&
    onCurrencyReferenceChange;

  const renderCurrencyDropdown = (variant: 'inline' | 'stacked') => {
    if (!showCurrencyDropdown) {
      return null;
    }

    const content = (
      <div
        className={cn(
          'shrink-0',
          variant === 'stacked' && 'flex-1 min-w-[140px]',
          variant === 'inline' && 'min-w-[88px]'
        )}
      >
        <Select
          value={currencyReference}
          onValueChange={(nextValue) =>
            onCurrencyReferenceChange?.(nextValue as OrderSizeTypeEnum)
          }
          disabled={disabled || currencyReferenceDisabled}
        >
          <SelectTrigger className="h-8 w-full text-xs border-muted-foreground/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencyReferenceOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="text-xs"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );

    if (currencyReferenceDisabled && currencyReferenceTooltip) {
      return <Tooltip tooltip={currencyReferenceTooltip}>{content}</Tooltip>;
    }

    return content;
  };

  const renderBalanceDisplay = (variant: 'inline' | 'stacked') => {
    if (readOnly) {
      return null;
    }
    // Prefer explicitly provided balanceCurrency/amount when present.
    // If not provided, fall back to availableBalance/currency prop.
    const displayBalance =
      typeof balanceAmount === 'number' ? balanceAmount : availableBalance;
    const displayCurrency = balanceCurrency ?? currency;

    return (
      <div
        className={cn(
          'flex flex-col items-end rounded-md bg-card text-xs',
          // Keep the balance compact when used as an adornment (both inline and stacked)
          // Allow the balance width to expand a bit to show larger numbers
          variant === 'stacked'
            ? 'shrink-0 w-auto min-w-12 max-w-[120px] px-1 py-1'
            : 'shrink-0 w-auto min-w-12 max-w-[120px] px-1 py-1'
        )}
      >
        <div className="flex w-full items-center justify-end gap-1 font-medium uppercase tracking-wide text-muted-foreground">
          <span>{variant === 'inline' ? 'Bal' : 'Bal'}</span>
          {showRefreshButton ? (
            <button
              type="button"
              onClick={(e) => handleManualRefresh(e)}
              disabled={
                disabled ||
                showSpinner ||
                typeof onRefreshBalance !== 'function'
              }
              className={cn(
                'text-muted-foreground transition-opacity hover:opacity-80',
                disabled ||
                  showSpinner ||
                  typeof onRefreshBalance !== 'function'
                  ? 'cursor-not-allowed opacity-40'
                  : 'cursor-pointer'
              )}
              aria-label={
                typeof onRefreshBalance === 'function'
                  ? 'Refresh balance'
                  : 'Refresh balance (unconfigured)'
              }
              title={
                typeof onRefreshBalance === 'function'
                  ? 'Refresh balance'
                  : 'Refresh balance (unconfigured)'
              }
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  showSpinner && 'animate-spin'
                )}
              />
            </button>
          ) : null}
        </div>
        <div className="w-full overflow-hidden text-right font-semibold leading-tight text-foreground">
          {showSpinner ? (
            <Skeleton className="h-4 w-full" />
          ) : (
            <span
              className="whitespace-nowrap text-ellipsis"
              title={`${formatBalance(displayBalance, displayCurrency)} ${displayCurrency}`}
            >
              {formatBalance(displayBalance, displayCurrency)} {displayCurrency}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', className)} ref={containerRef}>
      {/* Main Container */}

      <div
        className={cn(
          'flex gap-3',
          isStackedLayout ? 'flex-col' : 'items-center justify-between'
        )}
      >
        {/* Left Side - Coin Icon, Value, and Currency Dropdown */}
        <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              {/* {isEditing ? ( */}
              <Input
                type="number"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                min={min}
                max={maxValue}
                step={step}
                className={cn(
                  'w-full text-base font-semibold text-foreground [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                  'pr-1',
                  // Make room for the icon + unit label on the left.
                  unitLabel && 'pl-[4.5rem]'
                )}
                startAdornment={
                  unitLabel ? (
                    <span className="flex items-center gap-1.5">
                      {coinIcon || defaultCoinIcon}
                      <span className="text-xs font-semibold text-muted-foreground">
                        {unitLabel}
                      </span>
                    </span>
                  ) : (
                    coinIcon || defaultCoinIcon
                  )
                }
                startAdornmentOnClick={undefined}
                endAdornment={
                  <div className="flex items-center gap-1 pr-0">
                    {endAdornment}
                    {renderBalanceDisplay(
                      isStackedLayout ? 'stacked' : 'inline'
                    )}
                  </div>
                }
              />
              {/* ) : (
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded border-none bg-transparent px-1 py-0.5 text-left text-base font-semibold text-foreground transition-colors hover:bg-accent/20',
                      endAdornment ? 'pr-8' : ''
                    )}
                    onClick={handleContainerClick}
                    disabled={disabled}
                  >
                    {formatNumber(value)}
                  </button>
                )} */}
              {/* Input handles endAdornment and startAdornment */}
            </div>
            {/* Currency Reference Dropdown (inline) - moved to right side for tighter spacing */}
          </div>
        </div>

        {/* Right Side - Currency dropdown (inline layout) */}
        {!isStackedLayout && (
          <div className="flex items-center gap-2">
            {renderCurrencyDropdown('inline')}
          </div>
        )}
      </div>

      {/* Secondary row for stacked layout */}
      {isStackedLayout && (
        <div className="flex w-full flex-wrap items-stretch gap-3 border-t border-border/60 pt-3">
          {renderCurrencyDropdown('stacked')}
          {/* Balance now lives inside input endAdornment for stacked layout as well */}
        </div>
      )}

      {/* Error Alert - Only show explicit errors passed via props */}
      {error && <SettingsAlert variant="error" title={error} />}

      {/* Percentage and Max Buttons */}
      {showPercentageButtons && !disabled && (
        <div className="flex items-center gap-2 w-full">
          <div className="flex flex-wrap gap-2">
            {percentageButtons.map((percentage) => (
              <Button
                key={percentage}
                variant="outline"
                size="sm"
                onClick={() => handlePercentageClick(percentage)}
                className="h-8 px-3 text-xs"
                disabled={availableBalance === 0}
              >
                {percentage}%
              </Button>
            ))}
          </div>

          {/* Balance is rendered inside Input endAdornment for stacked layout */}
        </div>
      )}
    </div>
  );
};

export default BalanceInput;
