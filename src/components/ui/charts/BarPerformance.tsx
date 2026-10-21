import React, { useState } from 'react';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import CustomTooltip from '../../charts/CustomTooltip';

export type PerformanceDataItem = {
  name: string;
  usdImpact: number;
  percentChange: number;
  fill: string;
};

export interface BarPerformanceProps {
  data: PerformanceDataItem[];
  height?: number | string;
  privacyMode?: boolean;
}

export const BarPerformance: React.FC<BarPerformanceProps> = ({
  data,
  height = '100%',
  privacyMode = false,
}) => {
  const [_activeIndex, setActiveIndex] = useState<number | null>(null);
  const { formatUsd } = useReportingCurrency();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = (props: any) => {
    if (!props.active || !props.payload || !props.payload.length) return null;
    const payload = props.payload[0];
    const tooltipValueFormatter = (
      value: unknown,
      name: string
    ): [React.ReactNode, string] => {
      if (privacyMode) return ['***', name];
      const numValue = Number(value);
      return [formatUsd(numValue), name];
    };

    const tooltipLabelFormatter = (label: unknown) => {
      return label ? String(label) : '';
    };

    return (
      <CustomTooltip
        active={props.active}
        payload={[
          {
            value: payload.value,
            name: payload.name,
            color: payload.fill || payload.payload?.fill,
          },
        ]}
        label={props.label || payload.name}
        valueFormatter={tooltipValueFormatter}
        labelFormatter={tooltipLabelFormatter}
      />
    );
  };

  const content = (
    <div className="bar-perf-chart w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 32 }}
        >
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={48}
            fontSize={12}
            interval={0}
          />
          <YAxis
            fontSize={12}
            tickFormatter={(v) =>
              privacyMode ? '***' : formatUsd(v, { decimals: 0 })
            }
          />
          <Tooltip
            content={renderTooltip}
            wrapperStyle={{ zIndex: 2000 }}
            cursor={false}
          />
          <Bar
            dataKey="usdImpact"
            radius={[6, 6, 3, 3]}
            isAnimationActive={true}
            animationDuration={800}
            animationEasing="ease-in-out"
            activeBar={false}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                stroke="transparent"
                onMouseEnter={() => setActiveIndex(index)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return content;
};

export default BarPerformance;
