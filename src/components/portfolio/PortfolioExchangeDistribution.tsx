import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import type { PortfolioQuery } from '@/types';
import React, { useContext, useMemo } from 'react';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import { PortfolioContext } from '../../contexts/PortfolioContext';
import { PortfolioExchangeDistribution as DashboardPortfolioExchangeDistribution } from '../widgets/dashboard/PortfolioExchangeDistribution';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

export interface PortfolioExchangeDistributionProps {
  widgetId?: string;
  height?: string | number;
  className?: string;
}

/**
 * Portfolio-specific PortfolioExchangeDistribution component that wraps the dashboard widget
 * without resizing conflicts. This component is specifically designed for the
 * portfolio page with fixed sizing and no grid layout interference.
 */
const PortfolioExchangeDistribution: React.FC<
  PortfolioExchangeDistributionProps
> = ({
  widgetId = 'portfolio-exchange-distribution-page',
  height = '400px',
  className,
}) => {
  const { selectedExchanges } = useContext(PortfolioContext) || {
    selectedExchanges: ['ALL'],
  };
  const { holding, toReporting, format } = useReportingCurrency();
  const { exchanges: transformedExchanges } =
    useTransformedExchangesFromContext();
  const { data: portfolioData } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );
  const donutData = useMemo(() => {
    if (!portfolioData?.data?.result) return [];
    const timeSeries = portfolioData.data.result;
    const latestSnapshot = timeSeries[timeSeries.length - 1];
    if (!latestSnapshot?.assets) return [];
    const showAll =
      !selectedExchanges ||
      selectedExchanges.length === 0 ||
      selectedExchanges.includes('ALL');
    const exchangeTotals: Record<string, number> = {};
    const roundTo2 = (value: number) => Math.round(value * 100) / 100;
    latestSnapshot.assets.forEach((asset) => {
      const assetExchanges = asset.exchanges || [];
      if (!showAll && assetExchanges.length === 0) return;

      const filteredExchanges = showAll
        ? assetExchanges
        : assetExchanges.filter((ex) => selectedExchanges.includes(ex.uuid));

      if (!filteredExchanges.length) return;

      filteredExchanges.forEach((ex) => {
        const exchangeName =
          /* ex.name || */
          transformedExchanges.find((e) => e.id === ex.uuid)?.name ||
          ex.uuid ||
          'Unknown';
        const baseAmountUsd =
          typeof ex.amountUsd === 'number'
            ? ex.amountUsd
            : (ex.amount || 0) *
              (asset.amount && asset.amount !== 0
                ? asset.amountUsd / asset.amount
                : 0);
        if (!Number.isFinite(baseAmountUsd) || baseAmountUsd <= 0) return;
        // In the reporting currency; a fiat holding in it at face amount
        exchangeTotals[exchangeName] =
          (exchangeTotals[exchangeName] || 0) +
          (typeof ex.amount === 'number'
            ? holding(asset.name, ex.amount, baseAmountUsd)
            : toReporting(baseAmountUsd));
      });
    });
    // Use the same HSL based color generation as Portfolio Allocation for consistency
    return Object.entries(exchangeTotals)
      .filter(([_, v]) => v > 0)
      .map(([name, value], idx) => ({
        name,
        value: roundTo2(value),
        color: `hsl(${(idx * 40) % 360}, 70%, 60%)`,
      }));
  }, [
    portfolioData,
    selectedExchanges,
    transformedExchanges,
    holding,
    toReporting,
  ]);

  return (
    <div className={className}>
      <DashboardPortfolioExchangeDistribution
        widgetId={widgetId}
        isEditable={false}
        isCollapsible={false}
        allowResize={false}
        height={height}
        donutData={donutData}
        totalValue={donutData.reduce((s, i) => s + i.value, 0)}
        valueFormatter={(value: number) => format(value)}
        menuActions={{}}
      />
    </div>
  );
};

export default PortfolioExchangeDistribution;
