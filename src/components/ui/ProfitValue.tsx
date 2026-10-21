import { cn } from "@/lib/utils";
import { useReportingCurrency } from "@/hooks/useReportingCurrency";
import React from "react";

interface ProfitValueProps {
  value: number;
  className?: string;
  showSign?: boolean;
  formatAsCurrency?: boolean;
  isPercentage?: boolean;
  size?: "sm" | "base" | "lg";
  /**
   * The same figure in the pair's quote asset. When that asset is the
   * reporting currency (a EUR-quoted deal viewed in EUR) it is shown as-is
   * instead of converting `value` from USD and back.
   */
  quoteAsset?: string | undefined;
  quoteValue?: number | undefined;
}

export const ProfitValue: React.FC<ProfitValueProps> = ({
  value,
  className = "",
  showSign = true,
  formatAsCurrency = true,
  isPercentage = false,
  size = "base",
  quoteAsset,
  quoteValue,
}) => {
  const { holding, toReporting, format } = useReportingCurrency();
  const inReporting = (usd: number) =>
    quoteValue !== undefined && Number.isFinite(quoteValue)
      ? holding(quoteAsset, quoteValue, usd)
      : toReporting(usd);
  const formatValue = (val: number) => {
    if (isPercentage) {
      return `${val.toFixed(1)}%`;
    }

    if (formatAsCurrency) {
      return format(Math.abs(inReporting(val)));
    }

    return val.toString();
  };

  const getColorClass = () => {
    if (value > 0) return "text-profit";
    if (value < 0) return "text-loss";
    return "text-foreground";
  };

  const getSizeClass = () => {
    switch (size) {
      case "sm":
        return "text-xs";
      case "lg":
        return "text-lg";
      default:
        return "text-base";
    }
  };

  const displayValue = formatValue(Math.abs(value));
  const sign = showSign && value !== 0 ? (value > 0 ? "+" : "-") : "";

  return (
    <span
      className={cn("font-bold", getColorClass(), getSizeClass(), className)}
    >
      {sign}
      {displayValue}
    </span>
  );
};

interface ProfitBadgeProps {
  value: number;
  className?: string;
  showSign?: boolean;
}

export const ProfitBadge: React.FC<ProfitBadgeProps> = ({
  value,
  className = "",
  showSign = true,
}) => {
  const getBadgeClass = () => {
    if (value > 0) return "bg-profit text-white";
    if (value < 0) return "bg-loss text-white";
    return "bg-muted text-muted-foreground";
  };

  const sign = showSign && value !== 0 ? (value > 0 ? "+" : "") : "";
  const displayValue = `${Math.abs(value).toFixed(1)}%`;

  return (
    <div
      className={cn(
        "text-xs px-1.5 py-0.5 rounded self-start",
        getBadgeClass(),
        className,
      )}
    >
      {sign}
      {displayValue}
    </div>
  );
};

export default ProfitValue;
