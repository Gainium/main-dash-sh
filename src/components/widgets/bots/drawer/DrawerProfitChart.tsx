import { BarChart3 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
/* import { useDcaBots } from '../../../../hooks/useDcaBots'; */
import { useDcaDeals } from '../../../../hooks/useDcaDeals';
import { CHART_COLORS } from '../../../../lib/colors';
import CustomTooltip from '../../../charts/CustomTooltip';
import { FilterSection, SelectionDialog } from '../../shared/WidgetFilterArea';
import WidgetStats from '../../shared/WidgetStats';
import { DrawerSection } from './DrawerSection';
import type { DrawerBot } from '@/types/bots/drawer';

// Interface for processed profit data
interface ProfitData {
  today: number;
  yesterday: number;
  difference: number;
  differencePercent: number;
  avgDaily: number;
  chartData: Array<{
    date: string;
    value: number;
    buyAndHoldValue?: number;
    fullDate: string;
    label: string;
  }>;
}

export interface DrawerProfitChartProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

export const DrawerProfitChart: React.FC<DrawerProfitChartProps> = ({
  widgetId,
  botId,
  bot,
}) => {
  // State for filters
  const [timeFilter, setTimeFilter] = useState('Daily');
  const [selectedExchanges, setSelectedExchanges] = useState(['ALL']);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showBuyAndHold, setShowBuyAndHold] = useState(false);

  // Get bot data
  /*  const { bots, isLoading: botsLoading } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  }); */
  /* const bot = bots.find((b) => b._id === botId); */

  // Get deals data and filter for this bot
  const { deals, isLoading: dealsLoading } = useDcaDeals({
    paperContext: false,
  });
  const botDeals = deals.filter((deal) => deal.botId === botId);

  const isLoading = /* botsLoading ||  */ dealsLoading;

  // Process profit data from bot deals
  const currentProfitData = useMemo((): ProfitData => {
    if (!botDeals || !bot) {
      return {
        today: 0,
        yesterday: 0,
        difference: 0,
        differencePercent: 0,
        avgDaily: 0,
        chartData: [],
      };
    }

    // Filter completed deals with profit data
    const completedDeals = botDeals.filter(
      (deal) => deal.status === 'closed' && deal.profit?.totalUsd !== undefined
    );

    if (completedDeals.length === 0) {
      return {
        today: 0,
        yesterday: 0,
        difference: 0,
        differencePercent: 0,
        avgDaily: 0,
        chartData: [],
      };
    }

    // Sort deals by creation time for cumulative calculations
    const sortedDeals = completedDeals.sort(
      (a, b) =>
        new Date(a.createTime).getTime() - new Date(b.createTime).getTime()
    );

    // Calculate total invested amount for buy-and-hold comparison
    const totalInvested = sortedDeals.reduce((sum, deal) => {
      // For DCA deals, the invested amount is typically the quote currency spent
      // This is a simplified calculation - in reality we'd need the exact amount spent per deal
      return (
        sum +
        (deal.profit?.totalUsd || 0) +
        Math.abs(deal.profit?.pureQuote || 0)
      );
    }, 0);

    // Get data based on timeFilter
    let chartData: Array<{
      date: string;
      value: number;
      buyAndHoldValue?: number;
      fullDate: string;
      label: string;
    }> = [];
    let today = 0;
    let yesterday = 0;
    let difference = 0;
    let differencePercent = 0;
    let avgDaily = 0;

    if (timeFilter === 'Daily') {
      // Calculate daily profits
      const dailyProfits = new Map<string, number>();
      completedDeals.forEach((deal) => {
        const date = new Date(deal.createTime).toISOString().split('T')[0];
        const current = dailyProfits.get(date) || 0;
        dailyProfits.set(date, current + (deal.profit?.totalUsd || 0));
      });

      // Get last 30 days
      const todayDate = new Date();
      const chartDataArray: Array<{
        date: string;
        value: number;
        buyAndHoldValue?: number;
        fullDate: string;
        label: string;
      }> = [];
      let runningTotal = 0;
      for (let i = 29; i >= 0; i--) {
        const date = new Date(todayDate);
        date.setDate(todayDate.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        const profitValue = dailyProfits.get(dateString) || 0;
        runningTotal += profitValue;

        const buyAndHoldValue = showBuyAndHold
          ? (totalInvested / 30) * (30 - i)
          : undefined;

        chartDataArray.push({
          date: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          value: runningTotal,
          ...(buyAndHoldValue !== undefined && { buyAndHoldValue }),
          fullDate: date.toISOString(),
          label: date.toLocaleDateString(),
        });
      }
      chartData = chartDataArray;

      // Calculate today/yesterday
      today = runningTotal;
      yesterday =
        chartDataArray.length > 1
          ? chartDataArray[chartDataArray.length - 2].value
          : 0;
      difference = today - yesterday;
      differencePercent = yesterday !== 0 ? (difference / yesterday) * 100 : 0;
      avgDaily =
        chartDataArray.reduce((sum, item) => sum + item.value, 0) /
        chartDataArray.length;
    } else if (timeFilter === 'Weekly') {
      // Calculate weekly profits
      const weeklyProfits = new Map<string, number>();
      completedDeals.forEach((deal) => {
        const date = new Date(deal.createTime);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        const current = weeklyProfits.get(weekKey) || 0;
        weeklyProfits.set(weekKey, current + (deal.profit?.totalUsd || 0));
      });

      // Get last 12 weeks
      const todayDate = new Date();
      const chartDataArray: Array<{
        date: string;
        value: number;
        buyAndHoldValue?: number;
        fullDate: string;
        label: string;
      }> = [];
      let runningTotal = 0;
      for (let i = 11; i >= 0; i--) {
        const date = new Date(todayDate);
        date.setDate(todayDate.getDate() - i * 7);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        const profitValue = weeklyProfits.get(weekKey) || 0;
        runningTotal += profitValue;

        const buyAndHoldValue = showBuyAndHold
          ? (totalInvested / 12) * (12 - i)
          : undefined;

        const weekNum = Math.ceil(
          (date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        );
        chartDataArray.push({
          date: `W${weekNum}`,
          value: runningTotal,
          ...(buyAndHoldValue !== undefined && { buyAndHoldValue }),
          fullDate: weekStart.toISOString(),
          label: `Week ${weekNum}`,
        });
      }
      chartData = chartDataArray;

      // Calculate this week/last week
      today = runningTotal;
      yesterday =
        chartDataArray.length > 1
          ? chartDataArray[chartDataArray.length - 2].value
          : 0;
      difference = today - yesterday;
      differencePercent = yesterday !== 0 ? (difference / yesterday) * 100 : 0;
      avgDaily =
        chartDataArray.reduce((sum, item) => sum + item.value, 0) /
        chartDataArray.length;
    } else if (timeFilter === 'Monthly') {
      // Calculate monthly profits
      const monthlyProfits = new Map<string, number>();
      completedDeals.forEach((deal) => {
        const date = new Date(deal.createTime);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = monthlyProfits.get(monthKey) || 0;
        monthlyProfits.set(monthKey, current + (deal.profit?.totalUsd || 0));
      });

      // Get last 12 months
      const todayDate = new Date();
      const chartDataArray: Array<{
        date: string;
        value: number;
        buyAndHoldValue?: number;
        fullDate: string;
        label: string;
      }> = [];
      let runningTotal = 0;
      for (let i = 11; i >= 0; i--) {
        const date = new Date(todayDate);
        date.setMonth(todayDate.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const profitValue = monthlyProfits.get(monthKey) || 0;
        runningTotal += profitValue;

        const buyAndHoldValue = showBuyAndHold
          ? (totalInvested / 12) * (12 - i)
          : undefined;

        chartDataArray.push({
          date: date.toLocaleDateString('en-US', {
            month: 'short',
            year: '2-digit',
          }),
          value: runningTotal,
          ...(buyAndHoldValue !== undefined && { buyAndHoldValue }),
          fullDate: date.toISOString(),
          label: date.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
        });
      }
      chartData = chartDataArray;

      // Calculate this month/last month
      today = runningTotal;
      yesterday =
        chartDataArray.length > 1
          ? chartDataArray[chartDataArray.length - 2].value
          : 0;
      difference = today - yesterday;
      differencePercent = yesterday !== 0 ? (difference / yesterday) * 100 : 0;
      avgDaily =
        chartDataArray.reduce((sum, item) => sum + item.value, 0) /
        chartDataArray.length;
    } else {
      // Total
      // Calculate cumulative profit over time
      const sortedDeals = completedDeals.sort(
        (a, b) =>
          new Date(a.createTime).getTime() - new Date(b.createTime).getTime()
      );
      let runningTotal = 0;
      const chartDataArray: Array<{
        date: string;
        value: number;
        buyAndHoldValue?: number;
        fullDate: string;
        label: string;
      }> = [];

      sortedDeals.forEach((deal) => {
        runningTotal += deal.profit?.totalUsd || 0;
        const date = new Date(deal.createTime);
        const buyAndHoldValue = showBuyAndHold ? totalInvested : undefined;
        chartDataArray.push({
          date: date.toLocaleDateString(),
          value: runningTotal,
          ...(buyAndHoldValue !== undefined && { buyAndHoldValue }),
          fullDate: date.toISOString(),
          label: date.toLocaleDateString(),
        });
      });

      chartData = chartDataArray;
      today = runningTotal;
      yesterday =
        chartDataArray.length > 1
          ? chartDataArray[chartDataArray.length - 2].value
          : 0;
      difference = today - yesterday;
      differencePercent = yesterday !== 0 ? (difference / yesterday) * 100 : 0;
      avgDaily =
        chartDataArray.length > 0 ? runningTotal / chartDataArray.length : 0;
    }

    return {
      today,
      yesterday,
      difference,
      differencePercent,
      avgDaily,
      chartData,
    };
  }, [botDeals, bot, timeFilter, showBuyAndHold]);

  // Create stats data array for the WidgetStats component
  const createStatsData = () => {
    const stats = [];

    // First stat - Today/This Period
    stats.push({
      label:
        timeFilter === 'Total'
          ? 'Total'
          : timeFilter === 'Monthly'
            ? 'This Month'
            : timeFilter === 'Weekly'
              ? 'This Week'
              : 'Today',
      value: currentProfitData.today,
    });

    // Conditional stats for non-Total timeframes
    if (timeFilter !== 'Total') {
      // Second stat - Yesterday/Last Period
      stats.push({
        label:
          timeFilter === 'Monthly'
            ? 'Last Month'
            : timeFilter === 'Weekly'
              ? 'Last Week'
              : 'Yesterday',
        value: currentProfitData.yesterday,
      });

      // Third stat - Change
      stats.push({
        label: 'Change',
        value: currentProfitData.difference,
        badge: {
          value: currentProfitData.differencePercent,
        },
      });

      // Fourth stat - Average
      stats.push({
        label:
          timeFilter === 'Monthly'
            ? 'Avg monthly'
            : timeFilter === 'Weekly'
              ? 'Avg weekly'
              : 'Avg daily',
        value: currentProfitData.avgDaily,
      });
    }

    return stats;
  };

  // Exchange management functions
  const handleExchangeToggle = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      if (!selectedExchanges.includes('ALL')) {
        setSelectedExchanges(['ALL']);
        return;
      }
    }

    if (selectedExchanges.includes(exchangeId)) {
      const newSelectedExchanges = selectedExchanges.filter(
        (e) => e !== exchangeId
      );
      if (newSelectedExchanges.length === 0) {
        setSelectedExchanges(['ALL']);
      } else {
        setSelectedExchanges(newSelectedExchanges);
      }
    } else {
      const newSelectedExchanges = selectedExchanges.includes('ALL')
        ? [exchangeId]
        : [...selectedExchanges, exchangeId];
      setSelectedExchanges(newSelectedExchanges);
    }
  };

  if (isLoading) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-profit-chart"
        title="Profit Chart"
        minSize={{ w: 6, h: 8 }}
        maxSize={{ w: 12, h: 16 }}
        hasOptions
      >
        <div className="p-lg">
          <div className="flex items-center gap-xs mb-4">
            <BarChart3 className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold">Profit Chart</h3>
          </div>
          <div className="text-center text-muted-foreground py-8">
            Loading profit data...
          </div>
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-profit-chart"
      title="Profit Chart"
      minSize={{ w: 6, h: 8 }}
      maxSize={{ w: 12, h: 16 }}
      hasOptions
    >
      <div className="p-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-xs">
            <BarChart3 className="w-5 h-5 text-white" />
            <h3 className="text-lg font-semibold">Profit Chart</h3>
          </div>
        </div>

        {/* Stats Section */}
        <WidgetStats stats={createStatsData()} className="mb-6" />

        {/* Chart Area */}
        <div className="flex-1 mb-6 min-h-[200px]">
          <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={currentProfitData.chartData}
                margin={{
                  top: 5,
                  right: 5,
                  left: 5,
                  bottom: 5,
                }}
              >
                <defs>
                  <linearGradient
                    id="profitGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-profit)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-profit)"
                      stopOpacity={0.3}
                    />
                  </linearGradient>
                  <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-loss)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-loss)"
                      stopOpacity={0.3}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_COLORS.stroke}
                  opacity={0.3}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 10,
                    className: 'text-muted-foreground',
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 8,
                    className: 'text-muted-foreground',
                  }}
                  tickFormatter={(value) => `$${value}`}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar
                  isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]}>
                  {currentProfitData.chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.value >= 0
                          ? 'url(#profitGradient)'
                          : 'url(#lossGradient)'
                      }
                    />
                  ))}
                </Bar>
                {showBuyAndHold && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="buyAndHoldValue"
                    stroke="#6b7280"
                    strokeWidth={2}
                    dot={false}
                    name="Buy & Hold"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Time Filter Buttons */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {['Daily', 'Weekly', 'Monthly', 'Total'].map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-3 py-1 text-xs rounded ${
                filter === timeFilter
                  ? 'bg-muted text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Buy and Hold Toggle */}
        <div className="flex items-center justify-center gap-xs mb-4">
          <label className="flex items-center gap-xs text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showBuyAndHold}
              onChange={(e) => setShowBuyAndHold(e.target.checked)}
              className="rounded"
            />
            Show Buy & Hold Comparison
          </label>
        </div>

        {/* Exchange Filter Section */}
        <FilterSection
          title="Exchanges"
          selectedItems={selectedExchanges}
          availableItems={[
            { id: 'ALL', name: 'All Exchanges' },
            { id: 'binance', name: 'Binance' },
            { id: 'kucoin', name: 'KuCoin' },
            { id: 'bybit', name: 'Bybit' },
          ]}
          onItemRemove={handleExchangeToggle}
          onShowDialog={() => setShowExchangeDialog(true)}
        />

        {/* Exchange Selection Dialog */}
        <SelectionDialog
          isOpen={showExchangeDialog}
          onClose={() => setShowExchangeDialog(false)}
          title="Select Exchanges"
          items={[
            { id: 'ALL', name: 'All Exchanges' },
            { id: 'binance', name: 'Binance' },
            { id: 'kucoin', name: 'KuCoin' },
            { id: 'bybit', name: 'Bybit' },
          ]}
          selectedItems={selectedExchanges}
          onItemToggle={handleExchangeToggle}
        />
      </div>
    </DrawerSection>
  );
};

export default DrawerProfitChart;
