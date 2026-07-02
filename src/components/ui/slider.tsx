import * as React from 'react';
import { cn } from '../../lib/utils';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onChange, min, max, step, className, disabled, ...props }, ref) => {
    const [localValue, setLocalValue] = React.useState(value);
    const [isDragging, setIsDragging] = React.useState(false);
    const [startValue, setStartValue] = React.useState(value);

    // Sync local value with prop value when not dragging
    React.useEffect(() => {
      if (!isDragging) {
        setLocalValue(value);
        setStartValue(value);
      }
    }, [value, isDragging]);

    // Clamp the value and guard against zero range to prevent the
    // fill track from overflowing when a value outside [min, max]
    // is provided (e.g., user typed an out-of-range value).
    const range = max - min;
    const clampedValue = Number.isFinite(localValue)
      ? Math.max(min, Math.min(max, localValue))
      : min;
    const percentage = range > 0 ? ((clampedValue - min) / range) * 100 : 0;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value);
      setLocalValue(newValue);

      // Only call onChange when not dragging to prevent re-render conflicts
      if (!isDragging) {
        onChange(newValue);
      }
    };

    const handleMouseDown = () => {
      setStartValue(localValue);
      setIsDragging(true);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Only call onChange if value actually changed
      if (localValue !== startValue) {
        onChange(localValue);
      }
    };

    const handleTouchStart = () => {
      setStartValue(localValue);
      setIsDragging(true);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      // Only call onChange if value actually changed
      if (localValue !== startValue) {
        onChange(localValue);
      }
    };

    return (
      <div
        className={cn(
          'relative w-full h-5 flex items-center',
          disabled && 'opacity-50',
          className
        )}
      >
        {/* Custom track background - works reliably on all browsers.
            Uses a theme-inverting wash so the track stays visible on any
            surface (bg-muted containers would otherwise swallow a bg-muted track). */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-foreground/10 pointer-events-none" />
        {/* Custom track fill */}
        <div
          className="absolute left-0 h-1.5 rounded-full bg-primary pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
        {/* Native range input - transparent track, only thumb visible */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          disabled={disabled}
          className={cn(
            'absolute inset-0 w-full h-full bg-transparent appearance-none cursor-pointer z-10',
            'focus:outline-none',
            'disabled:cursor-not-allowed',
            // Hide native track completely
            '[&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full',
            '[&::-moz-range-track]:bg-transparent [&::-moz-range-track]:h-full',
            // Thumb styling
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background',
            '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md',
            // Firefox thumb
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background',
            '[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md'
          )}
          {...props}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider, type SliderProps };
