import { cn } from '@/lib/utils';
import React from 'react';

interface CustomPercentChipProps {
  /** Direction of the field: +1 above the reference price, -1 below it. */
  sign: 1 | -1;
  /** Signed % of the field's current price vs the reference; NaN if unknown. */
  currentPercent: number;
  /** Signed preset values shown next to the chip. */
  presets: number[];
  /** Receives the signed percent to apply. */
  onApply: (percent: number) => void;
  disabled?: boolean;
}

const PRESET_TOLERANCE = 0.005;

const trimPercent = (value: number) =>
  Number.parseFloat(value.toFixed(2)).toString();

/**
 * Typeable chip that sits after a row of % preset buttons on a price field.
 * The sign is locked by the field, so users type magnitudes only ("50" on a
 * low price means -50%). When the field's price matches no preset, the chip
 * shows that price's % so hand-typed or chart-picked prices are readable.
 */
export const CustomPercentChip: React.FC<CustomPercentChipProps> = ({
  sign,
  currentPercent,
  presets,
  onApply,
  disabled = false,
}) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const cancelRef = React.useRef(false);

  // A price of 0 (unset) reads as -100%; it is not a custom value.
  const isCustom =
    Number.isFinite(currentPercent) &&
    currentPercent > -100 &&
    Math.sign(currentPercent) === sign &&
    !presets.some(
      (preset) => Math.abs(preset - currentPercent) < PRESET_TOLERANCE
    );

  const displayValue =
    draft ?? (isCustom ? trimPercent(Math.abs(currentPercent)) : '');

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    if (draft === null) {
      return;
    }
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed === '') {
      setError(null);
      return;
    }
    const magnitude = Math.abs(Number.parseFloat(trimmed));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError('Enter a percentage above 0.');
      return;
    }
    if (sign < 0 && magnitude >= 100) {
      setError('Enter less than 100% so the price stays above 0.');
      return;
    }
    setError(null);
    onApply(sign * magnitude);
  };

  return (
    <>
      <label
        className={cn(
          'flex h-9 min-w-[96px] items-center gap-0.5 rounded-md border border-dashed border-primary px-2 text-sm text-primary',
          isCustom && draft === null && 'border-solid bg-primary/15',
          error && 'border-solid border-destructive',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <span aria-hidden="true">{sign > 0 ? '+' : '−'}</span>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          placeholder="Custom"
          disabled={disabled}
          aria-label={`Custom percentage ${sign > 0 ? 'above' : 'below'} start price`}
          aria-invalid={Boolean(error)}
          className="w-14 bg-transparent text-right text-sm text-primary outline-none placeholder:text-primary/60"
          onChange={(event) => {
            setError(null);
            setDraft(
              event.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
            );
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              cancelRef.current = true;
              setDraft(null);
              setError(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span aria-hidden="true">%</span>
      </label>
      {error && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
};

export default CustomPercentChip;
