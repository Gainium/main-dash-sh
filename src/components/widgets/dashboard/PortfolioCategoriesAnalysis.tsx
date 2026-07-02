import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { StatusEnum, type PortfolioQuery } from '@/types';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import { useChartColors } from '../../../hooks/useChartColors';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import { useWidgetDisplayName } from '../../../utils/widgetUtils';
import CustomTooltip from '../../charts/CustomTooltip';
import { SelectionDialog, type FilterItem } from '../shared/WidgetFilterArea';
import WidgetWrapper from '../WidgetWrapper';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
// import { getWidgetMetadata } from './index';

// Mock logger to replace removed logger calls
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  setActive: (..._args: unknown[]) => {},
};

// Extended types for portfolio data with categories
// interface PortfolioAssetWithCategories {
//   name: string;
//   amount: number;
//   amountUsd: number;
//   categories?: string[] | null;
// }

// Type for category data structure
type CategoryDataItem = {
  name: string;
  value: number;
  percentage: number;
  color: string;
};

// Mock category data for assets (in real implementation, this would come from CoinGecko API)
const ASSET_CATEGORIES: Record<string, string[]> = {
  BTC: ['Store of Value', 'Layer 1'],
  ETH: ['Smart Contract Platform', 'Layer 1'],
  USDT: ['Stablecoin'],
  USDC: ['Stablecoin'],
  BNB: ['Exchange Token', 'Smart Contract Platform'],
  SOL: ['Smart Contract Platform', 'Layer 1'],
  ADA: ['Smart Contract Platform', 'Layer 1'],
  AVAX: ['Smart Contract Platform', 'Layer 1'],
  DOT: ['Interoperability', 'Layer 0'],
  MATIC: ['Layer 2', 'Scaling'],
  LINK: ['Oracle', 'DeFi'],
  UNI: ['DEX', 'DeFi'],
  AAVE: ['Lending', 'DeFi'],
  COMP: ['Lending', 'DeFi'],
  MKR: ['Stablecoin', 'DeFi'],
  SNX: ['Derivatives', 'DeFi'],
  SUSHI: ['DEX', 'DeFi'],
  CRV: ['DEX', 'DeFi'],
  YFI: ['Yield Farming', 'DeFi'],
  BAL: ['DEX', 'DeFi'],
};

export interface PortfolioCategoriesAnalysisProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean;
  height?: string | number;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: import('../WidgetWrapper').WidgetMenuActions;
}

export const PortfolioCategoriesAnalysis: React.FC<
  PortfolioCategoriesAnalysisProps
> = ({
  widgetId = 'portfolio-categories-analysis',
  isEditable = false,
  isCollapsible = true,
  allowResize = true,
  height = '400px',
  onRemove,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Get chart colors for consistent theming
  const chartColors = useChartColors();
  const colorArray = useMemo(
    () => [
      chartColors.chart1,
      chartColors.chart2,
      chartColors.chart3,
      chartColors.chart4,
      chartColors.chart5,
    ],
    [chartColors]
  );

  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<PortfolioWidgetSettings>(widgetId);

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Get exchange data
  const { exchanges } = useTransformedExchangesFromContext();
  const portfolioContext = useContext(PortfolioContext);

  // Persisted settings for this widget instance
  const [selectedExchanges, setSelectedExchanges] = usePersistedState(
    'selectedExchanges',
    ['ALL']
  );
  // const [customName] = usePersistedState('customName', '');
  // const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);

  // Sync with portfolio-level exchange selection when page context is available
  useEffect(() => {
    const contextSelections = portfolioContext?.selectedExchanges;
    if (!contextSelections) return;
    const areEqual =
      contextSelections.length === selectedExchanges.length &&
      contextSelections.every((val, idx) => val === selectedExchanges[idx]);
    if (!areEqual) {
      setSelectedExchanges(contextSelections);
    }
  }, [
    portfolioContext?.selectedExchanges,
    selectedExchanges,
    setSelectedExchanges,
  ]);

  // GraphQL data fetching
  const {
    data: portfolioData,
    isLoading,
    // error,
    // refetch: refetchPortfolioData,
  } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  // Process portfolio data to calculate category distribution
  const categoryData = useMemo((): CategoryDataItem[] => {
    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok
    ) {
      logger.error(
        'PortfolioCategoriesAnalysis: Error fetching portfolio data:',
        portfolioData?.reason
      );
      return [];
    }

    // Get the most recent snapshot
    const timeSeries = portfolioData.data.result;
    const latestSnapshot = timeSeries[timeSeries.length - 1];
    if (!latestSnapshot?.assets) {
      return [];
    }

    // For now, use all assets (exchange filtering can be added later when we have proper exchange data structure)
    const filteredAssets = latestSnapshot.assets;

    // Calculate category totals
    const categoryTotals = new Map<string, number>();
    let totalValue = 0;

    filteredAssets.forEach((asset) => {
      const categories = ASSET_CATEGORIES[asset.name.toUpperCase()] || [
        'Other',
      ];
      const assetValue = asset.amountUsd;
      totalValue += assetValue;

      categories.forEach((category) => {
        categoryTotals.set(
          category,
          (categoryTotals.get(category) || 0) + assetValue
        );
      });
    });

    // Convert to chart data format and sort by value
    const chartData = Array.from(categoryTotals.entries())
      .map(([name, value], index) => ({
        name,
        value: Math.round(value * 100) / 100,
        percentage:
          totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
        color: colorArray[index % colorArray.length],
      }))
      .sort((a, b) => b.value - a.value);

    logger.debug('PortfolioCategoriesAnalysis: Category data calculated:', {
      totalCategories: chartData.length,
      totalValue,
      topCategory: chartData[0]?.name,
    });

    return chartData;
  }, [portfolioData, colorArray]);

  // Exchange filter options
  const exchangeFilterOptions: FilterItem[] = useMemo(() => {
    const options: FilterItem[] = [{ id: 'ALL', name: 'All Exchanges' }];

    exchanges.forEach((exchange) => {
      options.push({
        id: exchange.id,
        name: exchange.name,
      });
    });

    return options;
  }, [exchanges]);

  // Handle exchange selection
  const handleExchangeSelection = (itemId: string) => {
    if (itemId === 'ALL') {
      setSelectedExchanges(['ALL']);
    } else {
      const newSelection = selectedExchanges.includes(itemId)
        ? selectedExchanges.filter((id) => id !== itemId && id !== 'ALL')
        : [...selectedExchanges.filter((id) => id !== 'ALL'), itemId];

      if (newSelection.length === 0) {
        setSelectedExchanges(['ALL']);
      } else {
        setSelectedExchanges(newSelection);
      }
    }
    logger.debug(
      'PortfolioCategoriesAnalysis: Exchange selection changed:',
      selectedExchanges
    );
    if (portfolioContext?.setSelectedExchanges) {
      portfolioContext.setSelectedExchanges(selectedExchanges);
    }
  };

  // Get widget display name
  const displayName = useWidgetDisplayName({
    id: widgetId,
    type: 'portfolio-categories-analysis',
    title: 'Categories Analysis',
  });

  // Custom tooltip formatter
  const formatTooltip = (
    value: unknown,
    name: string
  ): [React.ReactNode, string] => {
    if (privacyMode) {
      return ['***', name];
    }
    const numValue = typeof value === 'number' ? value : 0;
    const item = categoryData.find((d) => d.name === name);
    return [
      `$${numValue.toLocaleString()}`,
      `${name} (${item?.percentage || 0}%)`,
    ];
  };

  return (
    <WidgetWrapper
      metadata={{
        id: widgetId,
        type: 'portfolio-categories-analysis',
        title: displayName || 'Categories Analysis',
        defaultSize: { w: 6, h: 7 },
        minSize: { w: 6, h: 4 },
        maxSize: { w: 12, h: 8 },
        hasOptions: true,
      }}
      isEditable={isEditable}
      isCollapsible={isCollapsible}
      {...(onRemove && { onRemove })}
      onSettings={() => {}} // Disable settings for now
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
      {/* Filter Section */}
      <div className="mb-4">
        <div className="flex items-center gap-xs">
          <span className="text-sm text-muted-foreground">Exchange:</span>
          <button
            onClick={() => setShowExchangeDialog(true)}
            className="text-sm text-primary hover:text-primary/80 underline"
          >
            {selectedExchanges.includes('ALL')
              ? 'All Exchanges'
              : selectedExchanges.length === 1
                ? exchanges.find((e) => e.id === selectedExchanges[0])?.name ||
                  'Unknown'
                : `${selectedExchanges.length} exchanges`}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1">
        {categoryData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
                interval={0}
              />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                fontSize={12}
              />
              <Tooltip
                content={<CustomTooltip valueFormatter={formatTooltip} />}
              />
              <Bar
                isAnimationActive={false}
                dataKey="value"
                fill={chartColors.chart1}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No category data available</p>
              <p className="text-sm">
                {isLoading
                  ? 'Loading portfolio data...'
                  : 'No assets found for the selected exchanges'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Exchange Selection Dialog */}
      <SelectionDialog
        isOpen={showExchangeDialog}
        onClose={() => setShowExchangeDialog(false)}
        title="Select Exchanges"
        items={exchangeFilterOptions}
        selectedItems={selectedExchanges}
        onItemToggle={handleExchangeSelection}
        showAllOption={true}
      />
    </WidgetWrapper>
  );
};

export default PortfolioCategoriesAnalysis;
