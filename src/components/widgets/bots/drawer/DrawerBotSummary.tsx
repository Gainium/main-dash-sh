import type { DrawerBot } from '@/types/bots/drawer';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { BOT_METRIC_DESCRIPTIONS } from '@/lib/botMetricDescriptions';
import {
  Activity,
  Award,
  Clock,
  TrendingUp,
  Wallet,
  BarChart3,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { formatCurrency, formatPercentage } from '../../../../lib/utils';
import { DrawerSection } from './DrawerSection';
import {
  BotTypesEnum,
  type BotSettings,
  type ComboBot,
  type DCABot,
  type Usage,
} from '@/types';
import type { GridBot } from '@/types/gridBot';

export interface DrawerBotSummaryProps {
  widgetId: string;
  botId?: string;
  botSnapshot?: DrawerBot;
}

const formatMaybeCurrency = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return formatCurrency(value);
};

const formatMaybePercent = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return formatPercentage(value, 2);
};

const formatMaybeNumber = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString();
};

const formatMaybePrice = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

export const DrawerBotSummary: React.FC<DrawerBotSummaryProps> = ({
  widgetId,
  botSnapshot,
}) => {
  const bot = useMemo(() => botSnapshot, [botSnapshot]);
  /* const grid = bot?.extra?.grid;
  const combo = bot?.extra?.combo; */

  if (!bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-bot-summary"
        title="Bot Overview"
        icon={BarChart3}
        minSize={{ w: 4, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
      >
        <div className="text-center text-muted-foreground">
          No summary available for this bot.
        </div>
      </DrawerSection>
    );
  }

  const runtime = bot.workingTime;
  const profit = formatMaybeCurrency(bot.totalProfitUsd);
  const profitPercent = formatMaybePercent(bot.profitPerc);
  const invested = formatMaybeCurrency((bot.usage as Usage).maxUsd);
  const usagePercent = formatMaybePercent(bot.usageTotal);
  const openTrades = formatMaybeNumber(
    (bot as DCABot)?.dealsInBot?.active || 0
  );
  const closedTrades = formatMaybeNumber(
    ((bot as DCABot)?.dealsInBot?.all || 0) -
      ((bot as DCABot)?.dealsInBot?.active || 0)
  );

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-bot-summary"
      title="Bot Overview"
      icon={BarChart3}
      minSize={{ w: 4, h: 4 }}
      maxSize={{ w: 12, h: 8 }}
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Overview
        </div>
        <div className="mt-1 text-lg font-semibold text-foreground">
          {bot.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {bot.exchange} • {bot.pair} • {bot.type}
        </div>
      </div>

      <div className="grid gap-sm sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-success" /> Profit
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {profit}
          </div>
          <div className="text-xs text-muted-foreground">{profitPercent}</div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Wallet className="w-4 h-4 text-primary" /> Invested
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {invested}
          </div>
          <div className="text-xs text-muted-foreground">
            Current cost {formatMaybeCurrency((bot.usage as Usage).currentUsd)}{' '}
            / max {formatMaybeCurrency((bot.usage as Usage).maxUsd)}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Activity className="w-4 h-4 text-warning" /> Usage
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {usagePercent}
          </div>
          <div className="text-xs text-muted-foreground">
            Base {formatMaybeNumber(bot.usage?.current.base)} • Quote{' '}
            {formatMaybeCurrency(bot.usage?.current.quote)}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Clock className="w-4 h-4 text-white" /> Runtime
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {runtime}
          </div>
          <div className="text-xs text-muted-foreground">
            Open deals {openTrades} • Closed deals {closedTrades}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
        <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
          <Award className="h-3 w-3 text-primary" /> Totals
        </div>
        <div className="mt-1 grid gap-sm sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Current value
              <Tooltip
                tooltip={BOT_METRIC_DESCRIPTIONS.grid.currentValue}
                side="top"
              >
                <InfoIcon />
              </Tooltip>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {formatMaybeCurrency(bot.value)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Unrealized PnL
              <Tooltip
                tooltip={BOT_METRIC_DESCRIPTIONS.dca.unrealizedPnl}
                side="top"
              >
                <InfoIcon />
              </Tooltip>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {formatMaybeCurrency(bot.unPnl)}
            </div>
          </div>
        </div>
      </div>

      {bot.type === BotTypesEnum.grid && (
        <div className="grid gap-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Price Range
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {formatMaybePrice((bot.settings as BotSettings).lowPrice)} —{' '}
              {formatMaybePrice((bot.settings as BotSettings).topPrice)}
            </div>
            <div className="text-xs text-muted-foreground">
              Current {formatMaybePrice((bot as GridBot).lastPrice)} • Step{' '}
              {formatMaybePrice((bot.settings as BotSettings).gridStep)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Grid Levels
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {formatMaybeNumber(
                (bot as GridBot).levels.all.buy +
                  (bot as GridBot).levels.all.sell
              )}{' '}
              total
            </div>
            <div className="text-xs text-muted-foreground">
              Active buy {formatMaybeNumber((bot as GridBot).levels.active.buy)}{' '}
              • Active sell{' '}
              {formatMaybeNumber((bot as GridBot).levels.active.sell)}
            </div>
          </div>
        </div>
      )}

      {bot.type === BotTypesEnum.combo && (
        <div className="grid gap-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quote Usage
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {formatMaybeCurrency(bot.usage?.current.quote)} used
            </div>
            <div className="text-xs text-muted-foreground">
              Initial{' '}
              {formatMaybeCurrency(
                (bot as ComboBot).initialBalances?.quote?.[0]?.value
              )}{' '}
              • Current{' '}
              {formatMaybeCurrency(
                (bot as ComboBot).currentBalances?.quote?.[0]?.value
              )}
            </div>
          </div>
        </div>
      )}
    </DrawerSection>
  );
};

export default DrawerBotSummary;
