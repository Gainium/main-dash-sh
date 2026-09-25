import { extractPairAssets } from '@/utils/pairs';
import { type ColumnDef } from '@tanstack/react-table';
import {
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Percent,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { ProfitAndPerc } from '../../ui/chip';
import { DataTable } from '../../ui/data-table/data-table';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import CoinPair from '../shared/CoinPair';

// Interface for Backtest data
export interface Backtest {
  id: string;
  pair: string;
  serverSide: boolean;
  savePermanently: boolean;
  name: string;
  notes: string;
  startCondition: string;
  strategy: string;
  createdTime: Date;
  avgNetDaily: number;
  annualizedReturn: number;
  maxDrawDown: number;
  maxEquityDrawDown: number;
  netProfit: number;
  unrealizedProfit: number;
  botWorkingTime: string;
  startDate: Date;
  endDate: Date;
  testingPeriod: string;
  testingPeriodName: string;
  maxDealDuration: string;
  interval: string;
  actualPriceDeviation: number;
  deals: number;
  avgDCAOrdersTriggered: number;
  dealsPerDay: number;
  avgRealUsage: number;
  buyAndHoldReturn: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  cwr: number;
}

export interface BacktestsProps {
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

const Backtests: React.FC<BacktestsProps> = ({
  widgetId = 'backtests',
  isEditable = false,
  onCollapse,
  onTabMove,
  menuActions,
  data: _data,
  settings: _settings,
}) => {
  // Generate mock backtest data
  const generateMockBacktests = (): Backtest[] => {
    const pairs = [
      'BTC/USDT',
      'ETH/USDT',
      'BNB/USDT',
      'ADA/USDT',
      'SOL/USDT',
      'DOT/USDT',
      'MATIC/USDT',
      'AVAX/USDT',
      'LINK/USDT',
      'UNI/USDT',
      'ATOM/USDT',
      'FTM/USDT',
      'NEAR/USDT',
      'ALGO/USDT',
      'VET/USDT',
    ];

    const strategies = [
      'DCA Long',
      'DCA Short',
      'Grid Bot',
      'Mean Reversion',
      'Trend Following',
      'RSI Divergence',
      'Bollinger Bands',
      'MACD Cross',
      'EMA Cross',
      'Support/Resistance',
    ];

    const startConditions = [
      'RSI < 30',
      'Price below EMA 50',
      'MACD Bullish',
      'Volume Spike',
      'Support Level',
      'Breakout',
      'Oversold',
      'Manual Start',
      'Signal Bot',
      'Price Drop 5%',
    ];

    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
    const testingPeriodNames = [
      'Bull Market 2023',
      'Bear Market 2022',
      'Sideways Q1 2023',
      'Volatile Q4 2022',
      'Recovery Q2 2023',
      'Correction Q3 2022',
      'Consolidation',
      'High Volatility',
      'Low Volatility',
      'Trending',
    ];

    return Array.from({ length: 50 }, (_, i) => {
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const strategy =
        strategies[Math.floor(Math.random() * strategies.length)];
      const startCondition =
        startConditions[Math.floor(Math.random() * startConditions.length)];
      const interval = intervals[Math.floor(Math.random() * intervals.length)];
      const testingPeriodName =
        testingPeriodNames[
          Math.floor(Math.random() * testingPeriodNames.length)
        ];

      // Generate realistic dates
      const createdTime = new Date(
        Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
      ); // Last 90 days
      const startDate = new Date(
        createdTime.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000
      ); // Up to 1 year before creation
      const testingDays = 30 + Math.random() * 180; // 30-210 days
      const endDate = new Date(
        startDate.getTime() + testingDays * 24 * 60 * 60 * 1000
      );

      // Generate realistic performance metrics
      const isProfit = Math.random() > 0.3; // 70% chance of profit
      const netProfit = isProfit
        ? 100 + Math.random() * 5000 // $100 - $5100 profit
        : -(50 + Math.random() * 1000); // $50 - $1050 loss

      const annualizedReturn = isProfit
        ? 5 + Math.random() * 150 // 5% - 155% annual return
        : -(5 + Math.random() * 50); // -5% to -55% annual return

      const maxDrawDown = -(2 + Math.random() * 25); // -2% to -27%
      const maxEquityDrawDown = -(1 + Math.random() * 20); // -1% to -21%

      const deals = Math.floor(5 + Math.random() * 200);
      const dealsPerDay = deals / testingDays;
      const avgDCAOrdersTriggered = 1 + Math.random() * 8;

      const botWorkingHours = Math.floor(
        testingDays * 24 * (0.7 + Math.random() * 0.3)
      );
      const workingDays = Math.floor(botWorkingHours / 24);
      const remainingHours = botWorkingHours % 24;
      const botWorkingTime = `${workingDays}D ${remainingHours}H`;

      const avgNetDaily = netProfit / testingDays;
      const avgRealUsage = 20 + Math.random() * 60; // 20% - 80%
      const buyAndHoldReturn = -20 + Math.random() * 80; // -20% to 60%

      const profitFactor = isProfit
        ? 1.1 + Math.random() * 2.5
        : 0.3 + Math.random() * 0.7;
      const sharpeRatio = isProfit
        ? 0.5 + Math.random() * 2.5
        : -(0.5 + Math.random() * 1.5);
      const sortinoRatio = isProfit
        ? 0.7 + Math.random() * 3
        : -(0.3 + Math.random() * 1.2);
      const cwr = isProfit
        ? 0.6 + Math.random() * 0.4
        : 0.1 + Math.random() * 0.5;

      const testingPeriod = `${Math.floor(testingDays)} days`;
      const maxDealDuration = `${Math.floor(1 + Math.random() * 14)}D ${Math.floor(Math.random() * 24)}H`;

      return {
        id: `bt_${i + 1}`,
        pair,
        serverSide: Math.random() > 0.5,
        savePermanently: Math.random() > 0.7,
        name: `${strategy} - ${pair.split('/')[0]} Test #${i + 1}`,
        notes: `Backtest of ${strategy} strategy on ${pair} during ${testingPeriodName}`,
        startCondition,
        strategy,
        createdTime,
        avgNetDaily,
        annualizedReturn,
        maxDrawDown,
        maxEquityDrawDown,
        netProfit,
        unrealizedProfit: netProfit * (0.1 + Math.random() * 0.3), // 10-40% of net profit
        botWorkingTime,
        startDate,
        endDate,
        testingPeriod,
        testingPeriodName,
        maxDealDuration,
        interval,
        actualPriceDeviation: 0.1 + Math.random() * 2, // 0.1% - 2.1%
        deals,
        avgDCAOrdersTriggered,
        dealsPerDay,
        avgRealUsage,
        buyAndHoldReturn,
        profitFactor,
        sharpeRatio,
        sortinoRatio,
        cwr,
      };
    });
  };

  const backtestData = useMemo(() => generateMockBacktests(), []);

  // BacktestCard component for DataTable card view
  const BacktestCard: React.FC<{ item: Backtest; index: number }> = ({
    item: backtest,
    index: _index,
  }) => {
    const { baseAsset, quoteAsset } = extractPairAssets(backtest.pair);

    return (
      <Card position={1}>
        <CardContent className="p-md" style={{ isolation: 'isolate' }}>
          {/* Header with pair and strategy */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-sm">
              <CoinPair
                baseAsset={baseAsset}
                quoteAsset={quoteAsset}
                pair={backtest.pair}
                iconSize="sm"
              />
              <Badge variant="outline" className="text-xs">
                {backtest.strategy}
              </Badge>
            </div>
            <div className="flex items-center gap-xs">
              {backtest.serverSide && (
                <Badge variant="secondary" className="text-xs">
                  Server
                </Badge>
              )}
              {backtest.savePermanently && (
                <Badge variant="default" className="text-xs">
                  Saved
                </Badge>
              )}
            </div>
          </div>

          {/* Backtest name and notes */}
          <div className="mb-3">
            <h4
              className="font-medium text-sm mb-1 truncate"
              title={backtest.name}
            >
              {backtest.name}
            </h4>
            <p
              className="text-xs text-muted-foreground truncate"
              title={backtest.notes}
            >
              {backtest.notes}
            </p>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-sm mb-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Net Profit
              </div>
              <div
                className="text-lg font-semibold flex items-center gap-1"
                style={{
                  color:
                    backtest.netProfit >= 0
                      ? 'oklch(var(--profit))'
                      : 'oklch(var(--loss))',
                }}
              >
                <DollarSign className="w-4 h-4" />
                {backtest.netProfit >= 0 ? '+' : ''}
                {backtest.netProfit.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Annual Return
              </div>
              <div
                className="text-lg font-semibold flex items-center gap-1"
                style={{
                  color:
                    backtest.annualizedReturn >= 0
                      ? 'oklch(var(--profit))'
                      : 'oklch(var(--loss))',
                }}
              >
                <Percent className="w-4 h-4" />
                {backtest.annualizedReturn >= 0 ? '+' : ''}
                {backtest.annualizedReturn.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Performance indicators */}
          <div className="grid grid-cols-2 gap-sm mb-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Max Drawdown
              </div>
              <div
                className="text-sm font-medium flex items-center gap-1"
                style={{ color: 'oklch(var(--loss))' }}
              >
                <TrendingDown className="w-3 h-3" />
                {backtest.maxDrawDown.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Profit Factor
              </div>
              <div
                className="text-sm font-medium flex items-center gap-1"
                style={{
                  color:
                    backtest.profitFactor >= 1
                      ? 'oklch(var(--profit))'
                      : 'oklch(var(--loss))',
                }}
              >
                <BarChart3 className="w-3 h-3" />
                {backtest.profitFactor.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Trading stats */}
          <div className="grid grid-cols-2 gap-sm mb-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Deals</div>
              <div className="text-sm font-medium">{backtest.deals}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Deals/Day
              </div>
              <div className="text-sm font-medium">
                {backtest.dealsPerDay.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Risk metrics */}
          <div className="grid grid-cols-2 gap-sm mb-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Sharpe Ratio
              </div>
              <div
                className="text-sm font-medium"
                style={{
                  color:
                    backtest.sharpeRatio >= 0
                      ? 'oklch(var(--profit))'
                      : 'oklch(var(--loss))',
                }}
              >
                {backtest.sharpeRatio.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">CWR</div>
              <div
                className="text-sm font-medium"
                style={{
                  color:
                    backtest.cwr >= 0.5
                      ? 'oklch(var(--profit))'
                      : 'oklch(var(--muted-foreground))',
                }}
              >
                {(backtest.cwr * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Footer with period and interval */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center gap-xs text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{backtest.testingPeriod}</span>
            </div>
            <div className="flex items-center gap-xs text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{backtest.interval}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Define table columns
  const columns: ColumnDef<Backtest>[] = useMemo(
    () => [
      {
        accessorKey: 'pair',
        header: 'PAIR',
        meta: {
          filterType: 'array',
          getOptionValue: (row: unknown) => (row as Backtest).pair,
          getFilterValue: (row: unknown) => {
            const { pair } = row as Backtest;
            const { baseAsset, quoteAsset } = extractPairAssets(pair);
            return [pair, baseAsset, quoteAsset, pair.replace('/', '')].filter(
              Boolean
            );
          },
        },
        cell: ({ row }) => {
          const pair = row.getValue('pair') as string;
          // Extract baseAsset and quoteAsset from pair string using shared helper
          const { baseAsset, quoteAsset } = extractPairAssets(pair);

          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              pair={pair}
              iconSize="sm"
            />
          );
        },
      },
      {
        accessorKey: 'serverSide',
        header: 'SERVER SIDE',
        meta: { filterType: 'boolean' },
        cell: ({ row }) => (
          <Badge variant={row.getValue('serverSide') ? 'default' : 'secondary'}>
            {row.getValue('serverSide') ? 'Yes' : 'No'}
          </Badge>
        ),
      },
      {
        accessorKey: 'savePermanently',
        header: 'SAVE PERMANENTLY',
        meta: { filterType: 'boolean' },
        cell: ({ row }) => (
          <Badge
            variant={row.getValue('savePermanently') ? 'default' : 'outline'}
          >
            {row.getValue('savePermanently') ? 'Yes' : 'No'}
          </Badge>
        ),
      },
      {
        accessorKey: 'name',
        header: 'NAME',
        meta: { filterType: 'string' },
        cell: ({ row }) => (
          <div
            className="max-w-[200px] truncate font-medium"
            title={row.getValue('name')}
          >
            {row.getValue('name')}
          </div>
        ),
      },
      {
        accessorKey: 'notes',
        header: 'NOTES',
        meta: { filterType: 'string' },
        cell: ({ row }) => (
          <div
            className="max-w-[250px] truncate text-sm text-muted-foreground"
            title={row.getValue('notes')}
          >
            {row.getValue('notes')}
          </div>
        ),
      },
      {
        accessorKey: 'startCondition',
        header: 'START CONDITION',
        meta: { filterType: 'array' },
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.getValue('startCondition')}
          </Badge>
        ),
      },
      {
        accessorKey: 'strategy',
        header: 'STRATEGY',
        meta: { filterType: 'array' },
        enableGrouping: true,
        aggregationFn: 'count',
        cell: ({ row }) => (
          <Badge variant="secondary">{row.getValue('strategy')}</Badge>
        ),
        aggregatedCell: ({ getValue }) => {
          const count = getValue() as number;
          return (
            <span className="text-sm font-semibold">{count} backtests</span>
          );
        },
      },
      {
        accessorKey: 'createdTime',
        header: 'CREATED TIME',
        meta: { filterType: 'date' },
        cell: ({ row }) => (
          <span className="text-xs">
            {(row.getValue('createdTime') as Date).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'avgNetDaily',
        header: 'AVG. NET DAILY',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('avgNetDaily') as number;
          return (
            <span
              className="font-mono text-sm"
              style={{
                color:
                  value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value >= 0 ? '+' : ''}${value.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: 'annualizedReturn',
        header: 'ANNUALIZED RETURN',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('annualizedReturn') as number;
          return (
            <div className="flex items-center gap-1">
              <span
                className="font-mono font-medium"
                style={{
                  color:
                    value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
                }}
              >
                {value >= 0 ? '+' : ''}
                {value.toFixed(1)}%
              </span>
              {value >= 0 ? (
                <TrendingUp
                  className="w-3 h-3"
                  style={{ color: 'oklch(var(--profit))' }}
                />
              ) : (
                <TrendingDown
                  className="w-3 h-3"
                  style={{ color: 'oklch(var(--loss))' }}
                />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'maxDrawDown',
        header: '% MAX. DRAW DOWN',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span
            className="font-mono text-sm"
            style={{ color: 'oklch(var(--loss))' }}
          >
            {(row.getValue('maxDrawDown') as number).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'maxEquityDrawDown',
        header: '% MAX. EQUITY DRAW DOWN',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span
            className="font-mono text-sm"
            style={{ color: 'oklch(var(--loss))' }}
          >
            {(row.getValue('maxEquityDrawDown') as number).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'netProfit',
        header: '% NET PROFIT',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('netProfit') as number;
          return (
            <span
              className="font-mono font-medium"
              style={{
                color:
                  value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value >= 0 ? '+' : ''}${value.toFixed(0)}
            </span>
          );
        },
      },
      {
        accessorKey: 'unrealizedProfit',
        header: 'UNREALIZED PROFIT',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('unrealizedProfit') as number;
          const netProfit = row.original.netProfit || 0;
          const percentage = netProfit > 0 ? (value / netProfit) * 100 : 0;
          return (
            <ProfitAndPerc
              value={value}
              percentage={percentage}
              privacyMode={false}
              chipPosition="right"
              size="xs"
            />
          );
        },
      },
      {
        accessorKey: 'botWorkingTime',
        header: 'BOT WORKING TIME',
        meta: {
          filterType: 'number',
          // "5D 3H" → fractional days.
          filterUnit: 'days',
          getNumericFilterValue: (row: unknown) => {
            const { botWorkingTime } = row as Backtest;
            const [d = 0, h = 0] =
              botWorkingTime.match(/\d+/g)?.map(Number) ?? [];
            return d + h / 24;
          },
        },
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.getValue('botWorkingTime')}
          </span>
        ),
      },
      {
        accessorKey: 'startDate',
        header: 'START DATE',
        meta: { filterType: 'date' },
        cell: ({ row }) => (
          <span className="text-xs">
            {(row.getValue('startDate') as Date).toLocaleDateString()}
          </span>
        ),
      },
      {
        accessorKey: 'endDate',
        header: 'END DATE',
        meta: { filterType: 'date' },
        cell: ({ row }) => (
          <span className="text-xs">
            {(row.getValue('endDate') as Date).toLocaleDateString()}
          </span>
        ),
      },
      {
        accessorKey: 'testingPeriod',
        header: 'TESTING PERIOD',
        meta: {
          filterType: 'number',
          // "N days" → N.
          filterUnit: 'days',
          getNumericFilterValue: (row: unknown) =>
            parseInt((row as Backtest).testingPeriod, 10),
        },
        cell: ({ row }) => (
          <span className="text-xs">{row.getValue('testingPeriod')}</span>
        ),
      },
      {
        accessorKey: 'testingPeriodName',
        header: 'TESTING PERIOD NAME',
        meta: { filterType: 'array' },
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.getValue('testingPeriodName')}
          </Badge>
        ),
      },
      {
        accessorKey: 'maxDealDuration',
        header: 'MAX DEAL DURATION',
        meta: {
          filterType: 'number',
          // "5D 3H" → fractional days.
          filterUnit: 'days',
          getNumericFilterValue: (row: unknown) => {
            const { maxDealDuration } = row as Backtest;
            const [d = 0, h = 0] =
              maxDealDuration.match(/\d+/g)?.map(Number) ?? [];
            return d + h / 24;
          },
        },
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.getValue('maxDealDuration')}
          </span>
        ),
      },
      {
        accessorKey: 'interval',
        header: 'INTERVAL',
        meta: { filterType: 'array' },
        cell: ({ row }) => (
          <Badge variant="outline">{row.getValue('interval')}</Badge>
        ),
      },
      {
        accessorKey: 'actualPriceDeviation',
        header: 'ACTUAL PRICE DEVIATION',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {(row.getValue('actualPriceDeviation') as number).toFixed(2)}%
          </span>
        ),
      },
      {
        accessorKey: 'deals',
        header: 'DEALS',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span className="text-center block font-medium">
            {row.getValue('deals')}
          </span>
        ),
      },
      {
        accessorKey: 'avgDCAOrdersTriggered',
        header: 'AVG DCA ORDERS TRIGGERED',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {(row.getValue('avgDCAOrdersTriggered') as number).toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: 'dealsPerDay',
        header: 'DEALS PER DAY',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {(row.getValue('dealsPerDay') as number).toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: 'avgRealUsage',
        header: 'AVG REAL USAGE',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {(row.getValue('avgRealUsage') as number).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'buyAndHoldReturn',
        header: 'BUY AND HOLD RETURN',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('buyAndHoldReturn') as number;
          return (
            <span
              className="font-mono text-sm"
              style={{
                color:
                  value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value >= 0 ? '+' : ''}
              {value.toFixed(1)}%
            </span>
          );
        },
      },
      {
        accessorKey: 'profitFactor',
        header: 'PROFIT FACTOR',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('profitFactor') as number;
          return (
            <span
              className="font-mono text-sm font-medium"
              style={{
                color:
                  value >= 1 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: 'sharpeRatio',
        header: 'SHARPE RATIO',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('sharpeRatio') as number;
          return (
            <span
              className="font-mono text-sm"
              style={{
                color:
                  value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: 'sortinoRatio',
        header: 'SORTINO RATIO',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.getValue('sortinoRatio') as number;
          return (
            <span
              className="font-mono text-sm"
              style={{
                color:
                  value >= 0 ? 'oklch(var(--profit))' : 'oklch(var(--loss))',
              }}
            >
              {value.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: 'cwr',
        header: 'CWR',
        meta: {
          filterType: 'number',
          // Stored as a ratio, shown as a percent.
          getNumericFilterValue: (row: unknown) => (row as Backtest).cwr * 100,
        },
        cell: ({ row }) => {
          const value = row.getValue('cwr') as number;
          return (
            <span
              className="font-mono text-sm"
              style={{
                color:
                  value >= 0.5
                    ? 'oklch(var(--profit))'
                    : 'oklch(var(--muted-foreground))',
              }}
            >
              {(value * 100).toFixed(1)}%
            </span>
          );
        },
      },
    ],
    []
  );

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalBacktests = backtestData.length;
    const profitableBacktests = backtestData.filter(
      (b) => b.netProfit > 0
    ).length;
    const avgAnnualReturn =
      backtestData.reduce((sum, b) => sum + b.annualizedReturn, 0) /
      totalBacktests;
    const avgProfitFactor =
      backtestData.reduce((sum, b) => sum + b.profitFactor, 0) / totalBacktests;

    return {
      total: totalBacktests,
      profitable: profitableBacktests,
      profitablePercent: (profitableBacktests / totalBacktests) * 100,
      avgAnnualReturn,
      avgProfitFactor,
    };
  }, [backtestData]);

  return (
    <WidgetWrapper
      metadata={{
        id: widgetId,
        type: 'backtests',
        title: 'Backtests',
        hasOptions: true,
        value: {
          primary: summaryStats.profitable,
          secondary: `${summaryStats.profitablePercent.toFixed(0)}% profitable`,
          isProfit: summaryStats.profitablePercent > 50,
        },
      }}
      isEditable={isEditable}
      {...(onCollapse && { onCollapse })}
      {...(onTabMove && { onTabMove })}
      {...(menuActions && { menuActions })}
    >
      <div className="h-full flex flex-col bg-background">
        <DataTable
          tableId={`backtests-${widgetId}`}
          columns={columns}
          data={backtestData}
          enableGlobalFilter={true}
          enableColumnFilters={true}
          enableSorting={true}
          enableColumnReordering={true}
          enableColumnVisibility={true}
          enableColumnResizing={true}
          enableGrouping={true}
          showPagination={true}
          className="flex-1"
          emptyMessage="No backtest results found."
          enableCardView={true}
          cardComponent={BacktestCard}
          cardViewBreakpoints={{
            default: 1,
            600: 2,
            900: 3,
            1200: 4,
          }}
          cardViewGap={16}
        />
      </div>
    </WidgetWrapper>
  );
};

export default Backtests;
