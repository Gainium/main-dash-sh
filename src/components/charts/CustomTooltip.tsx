import React from 'react';
import { formatNumber } from '../../utils/numberFormatter';

interface PayloadEntry {
  value: unknown;
  name: string;
  color: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface CustomTooltipProps {
  /**
   * Whether the tooltip is active
   */
  active?: boolean;
  /**
   * The payload data for the tooltip
   */
  payload?: PayloadEntry[];
  /**
   * The label for the tooltip
   */
  label?: unknown;
  /**
   * Background opacity for the translucent effect
   * @default 0.85
   */
  backgroundOpacity?: number;
  /**
   * Additional CSS classes for styling
   */
  className?: string;
  /**
   * Custom formatter for the label
   */
  labelFormatter?: (label: unknown) => React.ReactNode;
  /**
   * Custom formatter for values
   */
  valueFormatter?:
    | ((value: unknown, name: string) => [React.ReactNode, string])
    | undefined;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  className = '',
  labelFormatter,
  valueFormatter,
}) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Default label formatter that handles dates automatically
  const defaultLabelFormatter = (labelValue: unknown): React.ReactNode => {
    // The payload check runs FIRST: charts that key their X axis on the row
    // index (see `withAxisIndex` — recharts resolves an axis tooltip by
    // matching the axis value, so repeated labels resolve to the wrong row)
    // hand us a numeric label, and index 0 is falsy. Bailing on falsy before
    // reading the row's own date blanked the date line on the first point.
    if (payload && payload.length > 0) {
      const firstPayload = payload[0];
      const payloadData = firstPayload.payload;

      // Check for common raw date fields in the payload
      const rawDateFields = ['updateTime', 'fullDate', 'timestamp', 'rawDate'];
      for (const field of rawDateFields) {
        if (payloadData && payloadData[field]) {
          try {
            const rawDate = payloadData[field] as string | number;
            const date = new Date(rawDate);
            if (!isNaN(date.getTime())) {
              return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
            }
          } catch {
            // Continue to next field if this one fails
          }
        }
      }
    }

    if (labelValue == null || labelValue === '') return '';

    const labelStr = String(labelValue);

    // Check if the label looks like a date (ISO string, timestamp, etc.)
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO date string
      /^\d{4}-\d{2}-\d{2}/, // Date only format
      /^\d{13}$/, // 13-digit timestamp (milliseconds)
      /^\d{10}$/, // 10-digit timestamp (seconds)
    ];

    const isDate =
      datePatterns.some((pattern) => pattern.test(labelStr)) ||
      !isNaN(Date.parse(labelStr));

    if (isDate) {
      try {
        const date = new Date(labelValue as string | number);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
        }
      } catch {
        // Fall back to original value if date parsing fails
      }
    }

    return labelStr;
  };

  // Default value formatter that handles common data keys
  const defaultValueFormatter = (
    value: unknown,
    name: string
  ): [React.ReactNode, string] => {
    const numValue = Number(value);

    // Custom name mapping for specific data keys - be conservative to avoid conflicts
    const nameMapping: { [key: string]: string } = {
      quote: 'Daily Profit',
      base: 'Base Value',
      dailyProfit: 'Daily Profit',
      total: 'Total Value',
      amount: 'Amount',
    };

    // For 'value' data key, try to determine context from payload data if available
    let displayName = name;

    if (name === 'value' && payload && payload.length > 0) {
      const firstPayload = payload[0];
      const payloadData = firstPayload.payload;

      // Check for context clues in the payload data to determine appropriate label
      if (payloadData) {
        if (payloadData['dailyProfit'] !== undefined) {
          // If there's dailyProfit in the same data, this is likely accumulated profit
          displayName = 'Accumulated Profit';
        } else if (
          payloadData['profit'] !== undefined ||
          payloadData['quote'] !== undefined
        ) {
          // If there's profit data, this is likely a profit chart
          displayName = 'Profit';
        } else if (
          payloadData['totalValue'] !== undefined ||
          payloadData['portfolioValue'] !== undefined
        ) {
          // If there's portfolio/total value data, this is likely a value chart
          displayName = 'Value';
        } else {
          // Default case - use the original name but capitalize it
          displayName = name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
    } else {
      // Use mapping for other data keys or fallback to original name
      displayName =
        nameMapping[name] || name.charAt(0).toUpperCase() + name.slice(1);
    }

    const formattedValue = formatNumber(numValue);

    return [formattedValue, displayName];
  };

  return (
    <div
      className={`rounded-lg border border-border/30 p-md shadow-xl backdrop-blur-md text-foreground bg-background ${className}`}
      style={{
        position: 'relative',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Label */}
      {label !== undefined && (
        <div className="mb-2 text-sm font-medium text-foreground/90">
          {labelFormatter
            ? labelFormatter(label)
            : defaultLabelFormatter(label)}
        </div>
      )}

      {/* Payload Items */}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const { value, name, color } = entry;

          let formattedValue: React.ReactNode;
          let formattedName: string;
          if (valueFormatter) {
            [formattedValue, formattedName] = valueFormatter(value, name);
          } else {
            [formattedValue, formattedName] = defaultValueFormatter(
              value,
              name
            );
          }

          return (
            <div key={index} className="flex items-center gap-xs text-sm">
              {/* Color indicator */}
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Name and value */}
              <div className="flex items-center justify-between gap-sm min-w-0 flex-1">
                <span className="text-foreground/80 truncate">
                  {String(formattedName)}
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formattedValue}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomTooltip;
