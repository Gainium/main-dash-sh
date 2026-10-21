import { formatUsdAsReporting } from '@/utils/reportingCurrency';
/**
 * Bot Calculation Utilities
 *
 * This file contains calculation functions for bot metrics that are not available
 * directly from the backend but can be calculated from available data.
 *
 * Based on legacy dashboard implementation from:
 * gainium-dev/main-dash/components/dcabot/components/botDataGridTable.tsx
 */

/**
 * Calculate working time in milliseconds from working shift
 */
export const calculateWorkingTime = (workingShift: {
  start: string;
  end: string;
}): number => {
  if (!workingShift?.start || !workingShift?.end) {
    return 0;
  }

  const start = new Date(workingShift.start).getTime();
  const end = new Date(workingShift.end).getTime();

  return end - start;
};

/**
 * Calculate average daily profit
 * Based on legacy formula: totalProfitUsd / (workingTimeInDays)
 */
export const calculateAvgDaily = (
  totalProfitUsd: number,
  workingTimeMs: number
): number => {
  if (!totalProfitUsd || !workingTimeMs || workingTimeMs <= 0) {
    return 0;
  }

  // Convert working time from milliseconds to days
  const workingTimeDays = workingTimeMs / (24 * 60 * 60 * 1000);

  // Calculate average daily profit
  const avgDaily = totalProfitUsd / workingTimeDays;

  // Round to 2 decimal places
  return Math.round(avgDaily * 100) / 100;
};

/**
 * Calculate average daily percentage
 * Based on legacy formula: (avgDaily / maxValue) * 100
 */
export const calculateAvgDailyPerc = (
  avgDaily: number,
  maxValue: number
): number => {
  if (!avgDaily || !maxValue || maxValue <= 0) {
    return 0;
  }

  const avgDailyPerc = (avgDaily / maxValue) * 100;
  return Math.round(avgDailyPerc * 100) / 100;
};

/**
 * Calculate annualized return
 * Based on legacy formula: avgDailyPerc * 365 * 100
 */
export const calculateAnnualizedReturn = (avgDailyPerc: number): number => {
  if (!avgDailyPerc || isNaN(avgDailyPerc) || !isFinite(avgDailyPerc)) {
    return 0;
  }

  const annualizedReturn = avgDailyPerc * 365 * 100;

  // Handle edge case for very large numbers
  if (annualizedReturn > Number.MAX_SAFE_INTEGER) {
    return Infinity;
  }

  return Math.round(annualizedReturn * 100) / 100;
};

/**
 * Calculate usage percentage
 * Based on legacy formula: (currentValue / maxValue) * 100
 */
export const calculateUsagePercentage = (
  currentValue: number,
  maxValue: number
): number => {
  if (!currentValue || !maxValue || maxValue <= 0) {
    return 0;
  }

  const usagePercentage = (currentValue / maxValue) * 100;
  return Math.round(usagePercentage * 100) / 100;
};

/**
 * Calculate ROI percentage
 * Based on legacy formula: (profit / investment) * 100
 */
export const calculateROI = (profit: number, investment: number): number => {
  if (!profit || !investment || investment <= 0) {
    return 0;
  }

  const roi = (profit / investment) * 100;
  return Math.round(roi * 100) / 100;
};

/**
 * Calculate value change
 * Based on legacy formula: (current + profit) - initial
 */
export const calculateValueChange = (
  currentValue: number,
  profit: number,
  initialValue: number
): number => {
  if (!currentValue || !initialValue) {
    return 0;
  }

  return currentValue + profit - initialValue;
};

/**
 * Calculate value change percentage
 * Based on legacy formula: (change / initial) * 100
 */
export const calculateValueChangePercentage = (
  valueChange: number,
  initialValue: number
): number => {
  if (!valueChange || !initialValue || initialValue <= 0) {
    return 0;
  }

  const changePercentage = (valueChange / initialValue) * 100;
  return Math.round(changePercentage * 100) / 100;
};

/**
 * Format a USD value for display, in the user's reporting currency
 */
export const formatCurrency = (
  value: number,
  _currency: string = 'USD'
): string => {
  if (!value || isNaN(value) || !isFinite(value)) {
    return formatUsdAsReporting(0, { decimals: 0 });
  }

  return formatUsdAsReporting(value);
};

/**
 * Format percentage value for display
 */
export const formatPercentage = (value: number): string => {
  if (!value || isNaN(value) || !isFinite(value)) {
    return '0%';
  }

  return `${value.toFixed(2)}%`;
};

/**
 * Main function to calculate all bot metrics
 * This is the primary function that should be used to calculate all missing metrics
 */
export const calculateBotMetrics = (bot: {
  profit: { totalUsd: number };
  workingShift: { start: string; end: string };
  usage: { current: { quote: number }; max: { quote: number } };
  currentBalances?: { quote: { value: number } } | undefined;
  initialBalances?: { quote: { value: number } } | undefined;
}) => {
  const workingTimeMs = calculateWorkingTime(bot.workingShift);
  const avgDaily = calculateAvgDaily(bot.profit.totalUsd, workingTimeMs);
  const avgDailyPerc = calculateAvgDailyPerc(avgDaily, bot.usage.max.quote);
  const annualizedReturn = calculateAnnualizedReturn(avgDailyPerc);
  const usagePercentage = calculateUsagePercentage(
    bot.usage.current.quote,
    bot.usage.max.quote
  );
  const roi = calculateROI(bot.profit.totalUsd, bot.usage.current.quote);

  // Calculate value change if initial balances are available
  const currentValue =
    bot.currentBalances?.quote?.value || bot.usage.current.quote;
  const initialValue =
    bot.initialBalances?.quote?.value || bot.usage.current.quote;
  const valueChange = calculateValueChange(
    currentValue,
    bot.profit.totalUsd,
    initialValue
  );
  const valueChangePercentage = calculateValueChangePercentage(
    valueChange,
    initialValue
  );

  return {
    avgDaily,
    avgDailyFriendly: formatCurrency(avgDaily),
    avgDailyPerc,
    annualizedReturn,
    annualizedReturnFriendly: formatPercentage(annualizedReturn),
    usagePercentage,
    usagePercentageFriendly: formatPercentage(usagePercentage),
    roi,
    roiFriendly: formatPercentage(roi),
    valueChange,
    valueChangeFriendly: formatCurrency(valueChange),
    valueChangePercentage,
    valueChangePercentageFriendly: formatPercentage(valueChangePercentage),
    workingTimeMs,
    workingTimeDays: workingTimeMs / (24 * 60 * 60 * 1000),
  };
};
