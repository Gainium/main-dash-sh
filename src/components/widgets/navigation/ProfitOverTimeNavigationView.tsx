import { useGraphQL } from '@/hooks/useGraphQL';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import { useWidgetSettings } from '@/hooks/useWidgetSettings';
import { GraphQlQuery, type ReturnResult } from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import React, { useEffect, useState } from 'react';
import { ProfitLossPercChip } from '../../ui/chip/ProfitLossPercChip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

interface ProfitOverTimeSettings {
  timeframe: 'daily' | 'weekly' | 'monthly';
}

interface ProfitOverTimeNavigationViewProps {
  widgetId: string;
  compact?: boolean;
}

// Interface for GraphQL response data structure
interface ProfitData_API {
  result: Array<{
    base: number | null;
    quote: number;
    date: string | number;
  }>;
}

const ProfitOverTimeNavigationView: React.FC<
  ProfitOverTimeNavigationViewProps
> = ({ widgetId, compact: _compact = false }) => {
  const privacyMode = useUIStore((s) => s.privacyMode);
  const { currency, formatUsd } = useReportingCurrency();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profitData, setProfitData] = useState<{
    value: number;
    percentage: number;
    isPositive: boolean;
  }>({
    value: 0,
    percentage: 0,
    isPositive: true,
  });

  // Listen for widget options event from the WidgetsManager
  useEffect(() => {
    const handleWidgetOptions = (event: CustomEvent) => {
      if (event.detail?.widgetId === widgetId && event.detail?.isNavigation) {
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener(
      'openWidgetOptions',
      handleWidgetOptions as EventListener
    );
    return () => {
      window.removeEventListener(
        'openWidgetOptions',
        handleWidgetOptions as EventListener
      );
    };
  }, [widgetId]);

  // Use widget-specific settings
  const { usePersistedState } =
    useWidgetSettings<ProfitOverTimeSettings>(widgetId);
  const [timeframe, setTimeframe] = usePersistedState(
    'timeframe',
    'daily' as const
  );

  // Map timeframe to API parameter
  const getTimeframeNumber = () => {
    switch (timeframe) {
      case 'daily':
        return 0; // 0 - daily
      case 'weekly':
        return 1; // 1 - weekly
      case 'monthly':
        return 2; // 2 - monthly
      default:
        return 0;
    }
  };

  // Use real GraphQL API (same as dashboard Profit widget)
  const { data: profitResponse } = useGraphQL<ProfitData_API>(
    'getProfitByUser',
    GraphQlQuery.getProfitByUser({
      timezone: 'UTC',
      timeframe: getTimeframeNumber(),
    })
  );

  // Process profit data with the same logic as dashboard widget
  useEffect(() => {
    const tf = timeframe === 'daily' ? 0 : timeframe === 'weekly' ? 1 : 2;
    const processed = processGraphQLData(
      profitResponse as ReturnResult<ProfitData_API> | undefined,
      tf
    );

    setProfitData({
      value: Math.abs(processed.today),
      percentage: Math.abs(processed.differencePercent),
      isPositive: processed.difference >= 0,
    });
  }, [profitResponse, timeframe]);

  const getTimeframeLabel = () => {
    switch (timeframe) {
      case 'daily':
        return 'Today';
      case 'weekly':
        return 'This Week';
      case 'monthly':
        return 'This Month';
      default:
        return 'Today';
    }
  };

  // Reuse dashboard processing to ensure identical results
  const processGraphQLData = (
    response: import('@/lib/api').ReturnResult<ProfitData_API> | undefined,
    timeframeNumber: number
  ) => {
    if (!response || response.status !== 'OK' || !response.data?.result) {
      return {
        today: 0,
        yesterday: 0,
        difference: 0,
        differencePercent: 0,
      };
    }

    const results = response.data.result;

    const parseDate = (dateValue: string | number, tf: number): Date => {
      if (tf === 0) {
        return new Date(dateValue as string);
      } else if (tf === 1) {
        const [year, week] = (dateValue as string).split('-').map(Number);
        return new Date(year, 0, 1 + (week - 1) * 7);
      } else if (tf === 2) {
        const [year, month] = (dateValue as string).split('-').map(Number);
        return new Date(year, month - 1, 1);
      } else {
        return new Date(dateValue as number);
      }
    };

    const dataMap = new Map<string, number>();
    results.forEach((item) => {
      const key = item.date.toString();
      dataMap.set(key, item.quote || 0);
    });

    const generateTimeSeries = () => {
      const today = new Date();
      const timeSeries: Array<{ date: string | number; value: number }> = [];

      if (timeframeNumber === 0) {
        for (let i = 29; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          const dateString =
            date.toISOString().split('T')[0] + 'T00:00:00.000Z';
          const value = dataMap.get(dateString) || 0;
          timeSeries.push({ date: dateString, value });
        }
      } else if (timeframeNumber === 1) {
        for (let i = 11; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i * 7);
          const year = date.getFullYear();
          const weekNum = Math.ceil(
            (date.getTime() - new Date(year, 0, 1).getTime()) /
              (7 * 24 * 60 * 60 * 1000)
          );
          const weekString = `${year}-${weekNum}`;
          const value = dataMap.get(weekString) || 0;
          timeSeries.push({ date: weekString, value });
        }
      } else if (timeframeNumber === 2) {
        for (let i = 11; i >= 0; i--) {
          const date = new Date(today);
          date.setMonth(today.getMonth() - i);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const monthString = `${year}-${month}`;
          const value = dataMap.get(monthString) || 0;
          timeSeries.push({ date: monthString, value });
        }
      } else {
        results.forEach((item) => {
          timeSeries.push({ date: item.date, value: item.quote || 0 });
        });
      }

      return timeSeries;
    };

    const sortedResults = generateTimeSeries().sort((a, b) => {
      const dateA = parseDate(a.date, timeframeNumber);
      const dateB = parseDate(b.date, timeframeNumber);
      return dateA.getTime() - dateB.getTime();
    });

    let todayVal = 0;
    let yesterdayVal = 0;
    let difference = 0;
    let differencePercent = 0;

    if (timeframeNumber === 3) {
      todayVal = sortedResults.length > 0 ? sortedResults[0].value : 0;
      yesterdayVal = 0;
      difference = todayVal;
      differencePercent = 0;
    } else {
      todayVal =
        sortedResults.length > 0
          ? sortedResults[sortedResults.length - 1].value
          : 0;
      yesterdayVal =
        sortedResults.length > 1
          ? sortedResults[sortedResults.length - 2].value
          : 0;
      difference = todayVal - yesterdayVal;
      differencePercent =
        yesterdayVal !== 0 ? (difference / Math.abs(yesterdayVal)) * 100 : 0;
    }

    return {
      today: todayVal,
      yesterday: yesterdayVal,
      difference,
      differencePercent,
    };
  };

  return (
    <>
      <div className="flex flex-col gap-0.5 shrink-0 cursor-pointer hover:bg-accent/50 px-2 py-1 rounded transition-all duration-200 hover:scale-105 min-w-[80px]">
        <div className="flex items-center gap-1 justify-center">
          <span className="font-medium text-xs text-muted-foreground">
            {currency.symbol} {getTimeframeLabel()}
          </span>
        </div>

        <div className="text-xs font-medium text-center">
          {privacyMode
            ? '***'
            : formatUsd(profitData.value)}
        </div>

        <div className="flex justify-center">
          <ProfitLossPercChip
            value={privacyMode ? 0 : profitData.percentage}
            textValue={privacyMode ? '***' : ''}
            size="xs"
          />
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profit Over Time Settings</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-md">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Timeframe
              </label>
              <Select
                value={timeframe}
                onValueChange={(value: 'daily' | 'weekly' | 'monthly') =>
                  setTimeframe(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfitOverTimeNavigationView;
