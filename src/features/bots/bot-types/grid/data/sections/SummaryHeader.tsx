import { Activity, ArrowUpRight, Layers, RefreshCw } from 'lucide-react';
import { useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GridBotSummaryMetrics, GridCurrency } from '@/types/bots/grid';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { BOT_METRIC_DESCRIPTIONS } from '@/lib/botMetricDescriptions';

interface SummaryHeaderProps {
  botName: string;
  pairLabel: string;
  exchangeLabel: string;
  status?: string;
  statusReason?: string | null;
  workingTime?: string;
  currency: GridCurrency;
  currencyOptions: Array<{ value: GridCurrency; label: string }>;
  onCurrencyChange: (currency: GridCurrency) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  metrics?: GridBotSummaryMetrics;
  formatAmount: (
    value: number,
    options?: { currency?: GridCurrency; maximumFractionDigits?: number }
  ) => string;
}

const STATUS_COLOR: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  monitoring: 'secondary',
  open: 'default',
  range: 'default',
  paused: 'secondary',
  closed: 'outline',
  stopped: 'outline',
  archive: 'outline',
  error: 'destructive',
};

export const SummaryHeader: React.FC<SummaryHeaderProps> = ({
  botName,
  pairLabel,
  exchangeLabel,
  status,
  statusReason,
  workingTime,
  currency,
  currencyOptions,
  onCurrencyChange,
  onRefresh,
  isRefreshing,
  metrics,
  formatAmount,
}) => {
  const handleRefresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const profitUsd = metrics?.profitUsd ?? 0;
  const dailyProfitUsd = metrics?.dailyProfitUsd ?? 0;
  const activeOrders = metrics?.activeOrders ?? 0;
  const totalOrders = metrics?.totalOrders ?? 0;
  const filledOrders = metrics?.filledOrders ?? 0;

  return (
    <div className="flex flex-col gap-lg rounded-lg border border-border/60 bg-card/60 p-lg shadow-sm">
      <div className="flex flex-col gap-md md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-xs">
            <h2 className="text-xl font-semibold leading-none tracking-tight">
              {botName}
            </h2>
            {status && (
              <Badge
                variant={STATUS_COLOR[status.toLowerCase()] ?? 'outline'}
                className="capitalize"
              >
                {status.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {pairLabel}
            {exchangeLabel ? ` · ${exchangeLabel}` : ''}
          </p>
          {statusReason && (
            <p className="text-xs text-destructive/80">{statusReason}</p>
          )}
          {workingTime && (
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span>Working for {workingTime}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          {currencyOptions.map((option) => (
            <Button
              key={option.value}
              variant={currency === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onCurrencyChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-background/40 p-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              Realized PnL
              <Tooltip
                tooltip={BOT_METRIC_DESCRIPTIONS.grid.realizedPnl}
                side="top"
              >
                <InfoIcon />
              </Tooltip>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-success" />
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatAmount(profitUsd, {
              currency: 'usd',
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Daily Profit</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-info" />
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatAmount(dailyProfitUsd, {
              currency: 'usd',
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Orders</span>
            <Layers className="h-3.5 w-3.5 text-warning" />
          </div>
          <div className="mt-2 text-lg font-semibold">
            {activeOrders}
            <span className="ml-1 text-sm text-muted-foreground">
              / {totalOrders}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Filled Orders</span>
            <Layers className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="mt-2 text-lg font-semibold">{filledOrders}</div>
        </div>
      </div>
    </div>
  );
};

export default SummaryHeader;
