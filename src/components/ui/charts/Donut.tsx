import React, { useId } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import CustomTooltip from '../../charts/CustomTooltip';

export interface DonutDataItem {
  name: string;
  value: number;
  color: string;
  percentage?: number;
}

export interface DonutProps {
  data: DonutDataItem[];
  totalValue?: number;
  centerLabel?: React.ReactNode;
  centerSubLabel?: string;
  height?: number | string;
  privacyMode?: boolean;
  valueFormatter?: (value: number) => string;
}

export const Donut: React.FC<DonutProps> = ({
  data,
  totalValue = 0,
  centerLabel,
  centerSubLabel,
  height = '100%',
  privacyMode = false,
  valueFormatter,
}) => {
  // SVG gradient ids are document-global. A fixed `gradient-${index}` collides
  // with every other Donut on the page, and the browser resolves each url(#…)
  // to the FIRST matching id — so this chart painted its slices with another
  // chart's colors while its tooltip showed its own.
  const gradientPrefix = `donut-gradient-${useId().replace(/:/g, '')}`;

  // Custom formatters for the tooltip
  const tooltipValueFormatter = (
    value: unknown,
    name: string
  ): [React.ReactNode, string] => {
    if (privacyMode) {
      return ['***', name];
    }

    const numValue = Number(value);
    const percentage = totalValue > 0 ? (numValue / totalValue) * 100 : 0;

    let formattedValue = numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (valueFormatter) {
      formattedValue = valueFormatter(numValue);
    }

    return [`${formattedValue} (${percentage.toFixed(1)}%)`, name];
  };

  const tooltipLabelFormatter = (label: unknown): React.ReactNode => {
    return label ? String(label) : '';
  };

  // Custom tooltip renderer function
  const renderTooltip = (props: {
    active?: boolean;
    payload?: readonly Record<string, unknown>[];
    label?: unknown;
  }) => {
    if (!props.active || !props.payload || !props.payload.length) {
      return null;
    }

    // Transform Recharts payload to match CustomTooltip's expected format
    const transformedPayload = props.payload.map((entry) => {
      // Get the color from the original data item
      const dataItem = data.find((item) => item.name === entry['name']);
      const color =
        dataItem?.color ||
        ((entry['color'] || entry['fill'] || '#000000') as string);

      return {
        value: entry['value'] as unknown,
        name: (entry['name'] || entry['dataKey'] || 'Unknown') as string,
        color: color,
        dataKey: entry['dataKey'] as string,
        payload: entry['payload'] as Record<string, unknown>,
      };
    });

    return (
      <CustomTooltip
        active={props.active}
        payload={transformedPayload}
        label={props.label}
        valueFormatter={tooltipValueFormatter}
        labelFormatter={tooltipLabelFormatter}
      />
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {data.map((item, index) => (
              <linearGradient
                key={`gradient-${item.name}-${index}`}
                id={`${gradientPrefix}-${index}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.4" />
                <stop offset="50%" stopColor={item.color} stopOpacity="0.8" />
                <stop offset="100%" stopColor={item.color} stopOpacity="1" />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={data as unknown as Record<string, unknown>[]}
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="85%"
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            isAnimationActive={true}
          >
            {data.map((item, index) => (
              <Cell
                key={`cell-${item.name}-${index}`}
                fill={`url(#${gradientPrefix}-${index})`}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1}
                style={{ pointerEvents: 'auto' }}
              />
            ))}
          </Pie>
          <Tooltip
            content={renderTooltip}
            cursor={false}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 2000, pointerEvents: 'auto' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center text */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ zIndex: 1 }}
      >
        <div className="text-base sm:text-lg lg:text-xl font-bold text-foreground text-center leading-tight px-2">
          {centerLabel}
        </div>
        {centerSubLabel && (
          <div className="text-xs text-muted-foreground">{centerSubLabel}</div>
        )}
      </div>
    </div>
  );
};
