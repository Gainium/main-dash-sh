import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { StatusEnum, type PortfolioQuery } from '@/types';
import React, { useMemo } from 'react';
// Legend from recharts not needed; we use Donut for visuals
import { useChartColors } from '../../../hooks/useChartColors';
import { useUIStore } from '../../../stores/uiStore';
import { useWidgetDisplayName } from '../../../utils/widgetUtils';
import { Donut, type DonutDataItem } from '../../ui/charts/Donut';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

type ExchangeDistributionItem = {
  name: string;
  value: number;
  fill: string;
  count: number;
};

export interface PortfolioExchangeDistributionProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean;
  height?: string | number;
  onRemove?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  // Optional data props when the wrapper passes precomputed values
  donutData?: { name: string; value: number; color: string }[];
  totalValue?: number;
  valueFormatter?: (value: number) => string;
}

export const PortfolioExchangeDistribution: React.FC<
  PortfolioExchangeDistributionProps
> = ({
  widgetId = 'portfolio-exchange-distribution',
  isEditable = false,
  isCollapsible = true,
  allowResize = true,
  height = '400px',
  onRemove,
  onCollapse,
  onTabMove,
  menuActions,
  donutData,
  totalValue,
  valueFormatter,
}) => {
  const chartColors = useChartColors();
  const privacyMode = useUIStore((s) => s.privacyMode);
  const { exchanges: exchangesList } = useTransformedExchangesFromContext();

  const { data: portfolioData, isLoading } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  const roundTo2 = (value: number) => Math.round(value * 100) / 100;

  const hasWrapperData =
    Array.isArray(donutData) && typeof totalValue === 'number';
  const exchangeData = useMemo((): ExchangeDistributionItem[] => {
    if (hasWrapperData) {
      return (donutData || []).map((d) => ({
        name: d.name,
        value: d.value,
        fill: d.color,
        count: 0,
      }));
    }
    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok
    ) {
      return [];
    }

    const timeSeries = portfolioData.data.result;
    const latestSnapshot = timeSeries[timeSeries.length - 1];
    if (!latestSnapshot?.assets) return [];

    const exchangeTotals: Record<string, { value: number; count: number }> = {};

    latestSnapshot.assets.forEach((asset) => {
      if (!asset.exchanges || asset.exchanges.length === 0) {
        const key = 'Unknown';
        if (!exchangeTotals[key]) exchangeTotals[key] = { value: 0, count: 0 };
        exchangeTotals[key].value += asset.amountUsd;
        exchangeTotals[key].count += 1;
        return;
      }

      asset.exchanges.forEach((ex) => {
        // Exchanges don't always include a name in the payload, use the transformed exchange list
        // fallback to uuid when a name isn't available
        const exchangeName =
          exchangesList.find((e) => e.id === ex.uuid)?.name ||
          ex.uuid ||
          'Unknown';
        if (!exchangeTotals[exchangeName])
          exchangeTotals[exchangeName] = { value: 0, count: 0 };
        const exAmountUsd =
          typeof ex.amountUsd === 'number'
            ? ex.amountUsd
            : (ex.amount || 0) *
              (asset.amount && asset.amount !== 0
                ? asset.amountUsd / asset.amount
                : 0);
        if (!Number.isFinite(exAmountUsd) || exAmountUsd <= 0) return;
        exchangeTotals[exchangeName].value += exAmountUsd;
        exchangeTotals[exchangeName].count += 1;
      });
    });

    const colors = [
      chartColors.chart1,
      chartColors.chart2,
      chartColors.chart3,
      chartColors.chart4,
      chartColors.chart5,
    ];
    const items = Object.entries(exchangeTotals)
      .filter(([_, data]) => data.value > 0)
      .map(([name, data], idx) => ({
        name,
        value: roundTo2(data.value),
        fill: colors[idx % colors.length],
        count: data.count,
      }));
    // If donutData passed from wrapper, prefer wrapper's values
    // (wrapper will also handle filtering)
    return items;
  }, [portfolioData, exchangesList, chartColors, donutData, hasWrapperData]);

  const displayName = useWidgetDisplayName({
    id: widgetId,
    type: 'portfolio-exchange-distribution',
    title: 'Exchange Distribution',
  });

  return (
    <WidgetWrapper
      metadata={{
        id: widgetId,
        type: 'portfolio-exchange-distribution',
        title: displayName || 'Exchange Distribution',
        defaultSize: { w: 6, h: 7 },
        minSize: { w: 6, h: 4 },
        maxSize: { w: 12, h: 8 },
      }}
      isEditable={isEditable}
      isCollapsible={isCollapsible}
      {...(onRemove && { onRemove })}
      {...(onCollapse && { onCollapse })}
      {...(onTabMove && { onTabMove })}
      {...(menuActions && { menuActions })}
      style={allowResize ? {} : { height }}
      cacheQueries={[
        {
          queryKey: 'getPortfolioByUser',
          variables: {} as Record<string, unknown>,
        },
      ]}
    >
      {exchangeData.length > 0 ? (
        <Donut
          data={
            exchangeData.map((d) => ({
              name: d.name,
              value: d.value,
              color: d.fill,
            })) as DonutDataItem[]
          }
          totalValue={exchangeData.reduce((s, i) => s + i.value, 0)}
          centerLabel={(() => {
            if (privacyMode) return '***';
            const total = exchangeData.reduce((s, i) => s + i.value, 0);
            if (valueFormatter) return valueFormatter(total);
            return `$${total.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          })()}
          centerSubLabel={'Exchange Distribution'}
          height={'100%'}
          valueFormatter={valueFormatter}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? 'Loading...' : 'No data'}
        </div>
      )}
    </WidgetWrapper>
  );
};
