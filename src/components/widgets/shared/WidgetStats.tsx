import { ResponsiveCurrencyValue } from '@/components/ui/ResponsiveCurrencyValue';
import { ProfitLossPercChip } from '@/components/ui/chip';
import React from 'react';

export interface StatItem {
  label: string;
  value: number;
  showSign?: boolean;
  badge?: {
    value: number;
    textValue?: string;
  };
  icon?: string;
  textValue?: string;
  subLabel?: string;
  /** Explicit profit/loss coloring for `textValue` stats. */
  tone?: 'success' | 'destructive' | 'neutral';
}

export interface WidgetStatsProps {
  stats: StatItem[];
  className?: string;
}

export const WidgetStats: React.FC<WidgetStatsProps> = ({
  stats,
  className = '',
}) => {
  return (
    <div className={`@container ${className}`}>
      <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[450px]:grid-cols-4 gap-xs">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-muted rounded-lg p-sm flex flex-col gap-1"
          >
            {/* Label row — left-aligned label, badge (if any) right-aligned on same line */}
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-muted-foreground text-xs">
                  {stat.label}
                </div>
                {stat.subLabel && (
                  <div className="text-muted-foreground text-xs">
                    {stat.subLabel}
                  </div>
                )}
              </div>
              {stat.badge && (
                <ProfitLossPercChip
                  value={stat.badge.value}
                  textValue={stat.badge.textValue}
                />
              )}
            </div>

            {/* Value — bottom, right-aligned, larger */}
            <div className="text-right">
              {stat.textValue ? (
                <div className="flex items-center justify-end gap-1">
                  {stat.icon && <span>{stat.icon}</span>}
                  <span
                    className={`text-xl font-bold ${
                      stat.tone === 'success'
                        ? 'text-success'
                        : stat.tone === 'destructive'
                          ? 'text-destructive'
                          : stat.textValue === 'Rising'
                            ? 'text-success'
                            : stat.textValue === 'Falling'
                              ? 'text-destructive'
                              : 'text-foreground'
                    }`}
                  >
                    {stat.textValue}
                  </span>
                </div>
              ) : (
                <ResponsiveCurrencyValue
                  value={stat.value}
                  showSign={stat.showSign ?? true}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WidgetStats;
