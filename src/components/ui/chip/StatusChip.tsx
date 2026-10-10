import { cn } from '@/lib/utils';
import { getBotStatusConfig } from '@/utils/botUtils';
import React from 'react';
import { Tooltip } from '../tooltip';
import { Chip } from './chip';

interface StatusChipProps {
  status: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  chipStyle?: 'solid' | 'outline' | 'ghost' | 'soft';
  showDot?: boolean;
  dotOnly?: boolean;
  className?: string;
  /**
   * Override tooltip text — e.g. the bot's `statusReason` for an error
   * status, so hovering the chip explains *why* it errored instead of just
   * repeating the status label. Falls back to the status label when omitted.
   */
  tooltip?: string;
  /**
   * Override the visible label while keeping the status's colour — for a
   * record whose own state names map onto a bot status colour.
   */
  label?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  size = 'sm',
  chipStyle = 'soft',
  showDot = true,
  dotOnly = false,
  className,
  tooltip,
  label,
}) => {
  const base = getBotStatusConfig(status);
  const config = label ? { ...base, label } : base;

  // Explicit tooltip (e.g. an error reason) wins over the static status label.
  const tooltipText = tooltip || config.label;

  // Disable pulse for statuses that use the 'default' variant (closed, archive, unknown)
  const shouldPulse = (config.variant || '') !== 'default';

  // If dotOnly is true, render just the dot with tooltip
  if (dotOnly) {
    // Size mappings for the dot container
    const boxSizeMap: Record<string, string> = {
      xs: 'w-6 h-6',
      sm: 'w-7 h-7',
      md: 'w-8 h-8',
      lg: 'w-9 h-9',
      xl: 'w-10 h-10',
    };

    return (
      <Tooltip tooltip={tooltipText}>
        <div
          className={cn(
            'relative flex items-center justify-center shrink-0',
            boxSizeMap[size],
            className
          )}
          aria-label={tooltipText}
          title={tooltipText}
        >
          {/* Pulse ring (only when not closed) */}
          {shouldPulse && (
            <span
              className="absolute inset-0 rounded-full bot-status-pulse"
              style={{ backgroundColor: config.color, opacity: 0.25 }}
              aria-hidden
            />
          )}

          {/* Solid dot centered and smaller than the container */}
          <span
            className="rounded-full flex items-center justify-center w-1/2 h-1/2"
            style={{ backgroundColor: config.color }}
          />
        </div>
      </Tooltip>
    );
  }

  const chip = (
    <Chip
      variant={config.variant}
      size={size}
      chipStyle={chipStyle}
      className={cn('', className)}
    >
      {showDot && (
        <div
          className={cn(
            'relative flex items-center justify-center shrink-0',
            size === 'xs' && 'w-3 h-3',
            size === 'sm' && 'w-4 h-4',
            size === 'md' && 'w-5 h-5',
            size === 'lg' && 'w-6 h-6',
            size === 'xl' && 'w-7 h-7'
          )}
        >
          {/* Pulse ring (only when not closed) */}
          {shouldPulse && (
            <span
              className="absolute inset-0 rounded-full bot-status-pulse"
              style={{ backgroundColor: config.color, opacity: 0.25 }}
              aria-hidden
            />
          )}

          {/* Solid dot centered and smaller than the container */}
          <span
            className={cn(
              'rounded-full shrink-0',
              size === 'xs' && 'w-1.5 h-1.5',
              size === 'sm' && 'w-2 h-2',
              size === 'md' && 'w-2.5 h-2.5',
              size === 'lg' && 'w-3 h-3',
              size === 'xl' && 'w-3.5 h-3.5'
            )}
            style={{ backgroundColor: config.color }}
          />
        </div>
      )}
      <span className="truncate">{config.label}</span>
    </Chip>
  );

  // The label is already visible on the chip, so only attach a tooltip when an
  // explicit one (e.g. an error reason) is supplied — a label-only tooltip
  // would just repeat what's on screen.
  if (tooltip) {
    return <Tooltip tooltip={tooltipText}>{chip}</Tooltip>;
  }

  return chip;
};
