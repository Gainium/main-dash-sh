import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CustomTooltip from '../../charts/CustomTooltip';

export interface SeriesItem {
  name: string;
  value: number;
  color: string;
  percentage?: number;
}

export interface HorizontalStackedProps {
  data: SeriesItem[];
  height?: number | string;
  hideLegend?: boolean;
  privacyMode?: boolean;
}

const HorizontalStacked: React.FC<HorizontalStackedProps> = ({
  data,
  height = 40,
  privacyMode = false,
  //hideLegend = true,
}) => {
  // Unique per instance: SVG ids are document-global, so a fixed `gradient-N`
  // collides with every other chart on the page.
  const gradientPrefix = `gradient-${useId().replace(/:/g, '')}`;
  const total = useMemo(
    () => data.reduce((s, i) => s + (i.value || 0), 0),
    [data]
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [forceLeft, setForceLeft] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const xRel = e.clientX - rect.left;
    const threshold = rect.width * 0.7; // if cursor is in rightmost 30%, force left
    setForceLeft(xRel > threshold);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height }} className="w-full flex gap-1">
      {data.map((item, index) => {
        const key = item.name.replace(/[^a-zA-Z0-9]/g, '_');
        const isFirst = index === 0;
        const isLast = index === data.length - 1;
        const widthPercent = (item.value / total) * 100;

        return (
          <div
            key={key}
            style={{ width: `${widthPercent}%` }}
            className="h-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setForceLeft(false)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={[{ name: key, [key]: item.value }]}
                margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`${gradientPrefix}-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={item.color} stopOpacity={1} />
                    <stop
                      offset="100%"
                      stopColor={item.color}
                      stopOpacity={0.8}
                    />
                  </linearGradient>
                </defs>
                <XAxis type="number" hide domain={[0, item.value]} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  wrapperStyle={
                    forceLeft
                      ? {
                          transform: 'translate(-100%, -20%)',
                          pointerEvents: 'none',
                        }
                      : { pointerEvents: 'none' }
                  }
                  content={(props) => {
                    if (!props || !props.active || !props.payload) return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const payload = props.payload as any[];

                    const transformed = payload
                      .filter((p) => p && p.value !== 0)
                      .map((p) => ({
                        value: privacyMode ? '***' : p.value,
                        name: item.name,
                        color: item.color,
                        dataKey: p.dataKey,
                        payload: p.payload,
                      }));

                    return (
                      <CustomTooltip
                        active={props.active}
                        payload={transformed}
                        label={props.label}
                      />
                    );
                  }}
                  cursor={false}
                  // wrapperStyle={{
                  //   transform: 'translate(-100%, -20%)',
                  //   pointerEvents: 'none',
                  // }}
                  allowEscapeViewBox={{ x: true, y: true }}
                />
                <Bar
                  dataKey={key}
                  fill={`url(#${gradientPrefix}-${key})`}
                  isAnimationActive={false}
                  barSize={
                    typeof height === 'number' ? Math.max(12, height - 8) : 20
                  }
                  radius={[
                    isFirst ? 8 : 0,
                    isLast ? 8 : 0,
                    isLast ? 8 : 0,
                    isFirst ? 8 : 0,
                  ]}
                  activeBar={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
};

export default HorizontalStacked;
