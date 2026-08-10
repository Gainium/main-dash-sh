import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
// import { logger } from '@/lib/loggerInstance';
import { StatusEnum, type PortfolioQuery } from '@/types';
import React, { useContext, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getCurrencyInfo as getCurrencyInfoUtil } from '@/utils/currencyUtils';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import CustomTooltip from '../../charts/CustomTooltip';
import { ListModal } from '../shared/ListModal';
import { FilterSection, type FilterItem } from '../shared/WidgetFilterArea';
import WidgetWrapper from '../WidgetWrapper';
import { getWidgetMetadata } from './index';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

// Mock logger to replace removed logger calls
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  setActive: (..._args: unknown[]) => {},
};

// Extended types for portfolio data with exchanges (same as PortfolioValue)
interface PortfolioExchange {
  uuid: string;
  amount: number;
  amountUsd: number;
}

interface PortfolioAssetWithExchanges {
  name: string;
  amount: number;
  amountUsd: number;
  exchanges?: PortfolioExchange[] | null;
}

// Type for allocation data structure
type AllocationDataItem = {
  name: string;
  value: number;
  color: string;
  percentage: number;
};

export interface PortfolioAllocationProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean; // Controls whether height styles are applied (for grid layouts)
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

export const PortfolioAllocation: React.FC<PortfolioAllocationProps> = ({
  widgetId = 'portfolio-allocation',
  isEditable = false,
  isCollapsible = true,
  allowResize = true, // Default to true for grid layouts
  height = '400px',
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
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
  const [selectedCurrency] = useState('USD');
  const [customName, setCustomName] = usePersistedState('customName', '');
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);

  // Sync with portfolio-level exchange selection when page context is available
  useEffect(() => {
    const contextSelections = portfolioContext?.selectedExchanges;
    if (!contextSelections) return;
    const areEqual =
      contextSelections.length === selectedExchanges.length &&
      contextSelections.every((val, idx) => val === selectedExchanges[idx]);
    if (!areEqual) {
      logger.debug('PortfolioAllocation: Syncing exchange selection', {
        contextSelectedExchanges: contextSelections,
        widgetSelectedExchanges: selectedExchanges,
      });
      setSelectedExchanges(contextSelections);
    }
  }, [
    portfolioContext?.selectedExchanges,
    selectedExchanges,
    setSelectedExchanges,
  ]);

  // Listen for external options open events (e.g., from widget manager)
  useEffect(() => {
    const handleOpenOptions = (event: CustomEvent) => {
      if (event.detail.widgetId === widgetId) {
        setShowOptionsDialog(true);
      }
    };

    window.addEventListener(
      'openWidgetOptions',
      handleOpenOptions as EventListener
    );
    return () => {
      window.removeEventListener(
        'openWidgetOptions',
        handleOpenOptions as EventListener
      );
    };
  }, [widgetId]);

  // Exchange management functions for this specific widget
  const handleExchangeToggle = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      // If ALL is being toggled off and it's the only selection, don't allow it
      if (selectedExchanges.includes('ALL') && selectedExchanges.length === 1) {
        return; // Prevent removing ALL if it's the only option
      }
      // If ALL is being toggled on, replace all selections with just ALL
      setSelectedExchanges(['ALL']);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(['ALL']);
      }
      return;
    }

    if (selectedExchanges.includes(exchangeId)) {
      // Removing an exchange
      const newSelectedExchanges = selectedExchanges.filter(
        (e) => e !== exchangeId
      );
      // If removing this exchange would result in an empty array, automatically select "ALL"
      if (newSelectedExchanges.length === 0) {
        setSelectedExchanges(['ALL']);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(['ALL']);
        }
      } else {
        setSelectedExchanges(newSelectedExchanges);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(newSelectedExchanges);
        }
      }
    } else {
      // Adding an exchange - remove "ALL" and add the specific exchange
      const newSelections = selectedExchanges.filter((e) => e !== 'ALL');
      const updatedSelection = [...newSelections, exchangeId];
      setSelectedExchanges(updatedSelection);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(updatedSelection);
      }
    }
  };

  const handleRemoveExchange = (exchangeId: string) => {
    // Special handling for "ALL" option
    if (exchangeId === 'ALL' && selectedExchanges.length === 1) {
      return; // Prevent removing ALL if it's the only option
    }

    const newSelectedExchanges = selectedExchanges.filter(
      (e) => e !== exchangeId
    );
    // If removing this exchange would result in an empty array, automatically select "ALL"
    if (newSelectedExchanges.length === 0) {
      setSelectedExchanges(['ALL']);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(['ALL']);
      }
    } else {
      setSelectedExchanges(newSelectedExchanges);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(newSelectedExchanges);
      }
    }
  };

  // Get currency conversion rate and formatting (use centralized function)
  const getCurrencyInfo = (currencyCode: string) => {
    return getCurrencyInfoUtil(currencyCode);
  };

  // Format value in selected currency
  const formatValueInCurrency = (value: number) => {
    const currencyInfo = getCurrencyInfo(selectedCurrency);
    const convertedValue = value * currencyInfo.rate;
    return {
      value: convertedValue,
      formatted: convertedValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      symbol: currencyInfo.symbol,
    };
  };

  // Note: Removed getPortfolioAllocationForExchanges as it was not being used

  // GraphQL data fetching
  const {
    data: portfolioData,
    isLoading,
    error,
  } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  // Activate logger for debugging
  React.useEffect(() => {
    logger.setActive(true);
  }, []);

  // Debug the raw GraphQL response
  React.useEffect(() => {
    if (portfolioData) {
      logger.debug('PortfolioAllocation: Raw GraphQL response:', {
        status: portfolioData.status,
        reason: portfolioData.reason,
        dataExists: !!portfolioData.data,
        resultExists: !!portfolioData.data?.result,
        resultLength: portfolioData.data?.result?.length || 0,
        fullResponse: portfolioData,
      });

      if (portfolioData.data?.result) {
        portfolioData.data.result.forEach((snapshot, index) => {
          logger.debug(`PortfolioAllocation: Snapshot ${index}:`, {
            updateTime: snapshot.updateTime,
            totalUsd: snapshot.totalUsd,
            assetsCount: snapshot.assets?.length || 0,
            firstFewAssets:
              snapshot.assets?.slice(0, 3).map((asset) => ({
                name: asset.name,
                amount: asset.amount,
                amountUsd: asset.amountUsd,
              })) || [],
          });
        });
      }
    }
  }, [portfolioData]);

  // Process GraphQL data into allocation format
  const getAllocationData = () => {
    // Check if we have valid portfolio data
    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok ||
      portfolioData.data.result.length === 0
    ) {
      logger.warn(
        'PortfolioAllocation: No portfolio data available:',
        portfolioData?.reason
      );
      return [];
    }

    // Get the most recent snapshot (highest updateTime)
    const latestSnapshot = portfolioData.data.result.reduce(
      (latest, current) => {
        return current.updateTime > latest.updateTime ? current : latest;
      }
    );

    logger.debug('PortfolioAllocation: Selected snapshot:', {
      selectedUpdateTime: latestSnapshot.updateTime,
      selectedTotalUsd: latestSnapshot.totalUsd,
      selectedAssetsCount: latestSnapshot.assets?.length || 0,
      allSnapshotTimes: portfolioData.data.result.map((s) => ({
        updateTime: s.updateTime,
        totalUsd: s.totalUsd,
        date: new Date(s.updateTime).toISOString(),
      })),
    });

    if (!latestSnapshot?.assets || latestSnapshot.assets.length === 0) {
      logger.warn('PortfolioAllocation: No assets in latest snapshot');
      return [];
    }

    // Cast to extended type to access exchanges property
    const extendedAssets =
      latestSnapshot.assets as PortfolioAssetWithExchanges[];

    // Debug: Log all assets before processing
    logger.debug('PortfolioAllocation: All assets from GraphQL:', {
      snapshotIndex: 0,
      updateTime: latestSnapshot.updateTime,
      totalUsd: latestSnapshot.totalUsd,
      assetsCount: extendedAssets.length,
      allAssets: extendedAssets.map((asset, index) => ({
        index,
        name: asset.name,
        amount: asset.amount,
        amountUsd: asset.amountUsd,
        exchanges: asset.exchanges || 'No exchange data',
      })),
      sumOfAllAssets: extendedAssets.reduce(
        (sum, asset) => sum + asset.amountUsd,
        0
      ),
    });

    // Determine if we should show all exchanges or filter by specific ones
    const showAllExchanges = selectedExchanges.includes('ALL');

    logger.debug('PortfolioAllocation: Exchange filtering:', {
      selectedExchanges,
      showAllExchanges,
    });

    let assetsToProcess: PortfolioAssetWithExchanges[] = extendedAssets;

    // Filter assets by selected exchanges if not showing all
    if (!showAllExchanges) {
      logger.debug('PortfolioAllocation: Applying exchange filter');

      assetsToProcess = extendedAssets
        .map((asset) => {
          // If exchanges is null (older data), exclude this asset when filtering by specific exchanges
          if (!asset.exchanges) {
            logger.debug(
              `PortfolioAllocation: Asset ${asset.name} has no exchange data, excluding`
            );
            return null;
          }

          // Filter the exchanges within this asset to only include selected ones
          const filteredExchanges = asset.exchanges.filter(
            (exchange: PortfolioExchange) =>
              selectedExchanges.includes(exchange.uuid)
          );

          // If no exchanges match the filter, exclude this asset
          if (filteredExchanges.length === 0) {
            logger.debug(
              `PortfolioAllocation: Asset ${asset.name} has no matching exchanges, excluding`
            );
            return null;
          }

          // Calculate the total amount and USD value for the filtered exchanges
          const totalAmountUsd = filteredExchanges.reduce(
            (sum: number, exchange: PortfolioExchange) =>
              sum + exchange.amountUsd,
            0
          );

          logger.debug(`PortfolioAllocation: Asset ${asset.name} filtered:`, {
            originalAmountUsd: asset.amountUsd,
            filteredAmountUsd: totalAmountUsd,
            selectedExchanges: filteredExchanges.map(
              (e: PortfolioExchange) => e.uuid
            ),
          });

          return {
            ...asset,
            amountUsd: totalAmountUsd,
            exchanges: filteredExchanges,
          };
        })
        .filter(Boolean) as PortfolioAssetWithExchanges[]; // Remove null entries and type assert
    }

    // Transform assets into allocation format
    const rawData = assetsToProcess.map((asset, index) => ({
      name: asset.name.toUpperCase(),
      value: asset.amountUsd,
      color: `hsl(${(index * 40) % 360}, 70%, 60%)`, // Generate colors dynamically
      percentage: 0, // Will be calculated later
    }));

    logger.debug('PortfolioAllocation: Raw data after processing:', {
      rawDataCount: rawData.length,
      totalValue: rawData.reduce((sum, item) => sum + item.value, 0),
      items: rawData.map((item) => ({ name: item.name, value: item.value })),
    });

    // Sort by value (highest first) and limit to top 9 tokens
    const sortedData = rawData.sort((a, b) => b.value - a.value);

    if (sortedData.length <= 9) {
      return sortedData;
    }

    // Take top 9 tokens
    const topTokens = sortedData.slice(0, 9);

    // Group remaining tokens into "Others"
    const remainingTokens = sortedData.slice(9);
    const othersValue = remainingTokens.reduce(
      (sum, token) => sum + token.value,
      0
    );

    if (othersValue > 0) {
      const othersToken = {
        name: 'Others',
        value: othersValue,
        color: '#6b7280', // Gray color for "Others"
        percentage: 0, // Will be calculated later
      };

      return [...topTokens, othersToken];
    }

    return topTokens;
  };

  const allocationData = getAllocationData();

  logger.debug('PortfolioAllocation: Raw allocation data:', allocationData);

  // Use the actual total from GraphQL data when showing all exchanges,
  // but calculate from filtered data when filtering by specific exchanges
  const showAllExchanges = selectedExchanges.includes('ALL');
  const allocationTotal = allocationData.reduce(
    (sum: number, item: AllocationDataItem) => sum + item.value,
    0
  );

  const latestSnapshot =
    showAllExchanges && portfolioData?.data?.result?.length
      ? portfolioData.data.result.reduce((latest, current) =>
          current.updateTime > latest.updateTime ? current : latest
        )
      : undefined;

  const totalValue = latestSnapshot?.totalUsd ?? allocationTotal;

  logger.debug('PortfolioAllocation: Total value calculated:', {
    totalValue,
    showAllExchanges,
    latestSnapshotTotal: latestSnapshot?.totalUsd,
    calculatedFromAllocationData: allocationTotal,
    itemCount: allocationData.length,
    selectedExchanges,
    isUsingGraphQLTotal:
      showAllExchanges && Boolean(portfolioData?.data?.result?.length),
    allSnapshots:
      portfolioData?.data?.result?.map((s) => ({
        updateTime: s.updateTime,
        totalUsd: s.totalUsd,
        date: new Date(s.updateTime).toISOString(),
      })) || [],
  });

  // Debug logging
  logger.debug('PortfolioAllocation Debug:', {
    allocationData,
    totalValue,
    dataLength: allocationData.length,
    graphqlTotalUsd: portfolioData?.data?.result?.[0]?.totalUsd,
    calculatedTotal: allocationData.reduce(
      (sum: number, item: AllocationDataItem) => sum + item.value,
      0
    ),
  });

  // Calculate percentages
  const allocationDataWithPercentages = allocationData
    .map((item: AllocationDataItem) => ({
      ...item,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }))
    .sort((a: AllocationDataItem, b: AllocationDataItem) => b.value - a.value); // Sort legend from more to less

  // Add logging for tooltip debugging
  logger.debug('PortfolioAllocation: Chart data for tooltip:', {
    allocationData,
    allocationDataWithPercentages,
    totalValue,
    hasData: allocationData.length > 0,
    sampleDataItem: allocationData[0], // Log first item to see structure
  });

  // Log each data item to ensure structure is correct
  allocationData.forEach((item, index) => {
    logger.debug(`PortfolioAllocation: Data item ${index}:`, {
      name: item.name,
      value: item.value,
      color: item.color,
      percentage: item.percentage,
      dataForChart: {
        name: item.name,
        value: item.value,
      },
    });
  });

  // Custom formatters for the tooltip
  const tooltipValueFormatter = (
    value: unknown,
    name: string
  ): [React.ReactNode, string] => {
    logger.debug('CustomTooltip valueFormatter called:', { value, name });

    if (privacyMode) {
      return ['***', name];
    }

    const numValue = Number(value);
    const currencyInfo = getCurrencyInfo(selectedCurrency);
    const convertedValue = numValue * currencyInfo.rate;
    const percentage = totalValue > 0 ? (numValue / totalValue) * 100 : 0;

    const formattedValue = `${currencyInfo.symbol}${convertedValue.toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )} (${percentage.toFixed(1)}%)`;

    logger.debug('CustomTooltip formatted value:', {
      formattedValue,
      numValue,
      percentage,
    });

    return [formattedValue, name];
  };

  const tooltipLabelFormatter = (label: unknown): React.ReactNode => {
    logger.debug('CustomTooltip labelFormatter called:', { label });
    return label ? String(label) : '';
  };

  // Custom tooltip renderer function
  const renderTooltip = (props: {
    active?: boolean;
    payload?: ReadonlyArray<Record<string, unknown>>;
    label?: unknown;
  }) => {
    logger.debug('Tooltip render function called:', {
      props,
      active: props.active,
    });

    if (!props.active || !props.payload || !props.payload.length) {
      return null;
    }

    // Transform Recharts payload to match CustomTooltip's expected format
    const transformedPayload = props.payload.map((entry) => {
      // Get the color from the original data item
      const dataItem = allocationData.find(
        (item) => item.name === entry['name']
      );
      const color =
        dataItem?.color ||
        ((entry['color'] || entry['fill'] || '#000000') as string);

      return {
        value: entry['value'] as unknown,
        name: (entry['name'] || entry['dataKey'] || 'Unknown') as string,
        color: color,
        dataKey: entry['dataKey'] as string,
        payload: entry['payload'] as Record<string, unknown>,
      };
    });

    logger.debug('Transformed payload for CustomTooltip:', {
      transformedPayload,
    });

    return (
      <CustomTooltip
        active={props.active}
        payload={transformedPayload}
        label={props.label}
        valueFormatter={tooltipValueFormatter}
        labelFormatter={tooltipLabelFormatter}
      />
    );
  };

  // Handle loading and error states
  if (isLoading) {
    return (
      <WidgetWrapper
        {...{
          metadata: {
            ...getWidgetMetadata('portfolio-allocation'),
            id: widgetId,
            title: customName || 'Portfolio Allocation',
            displayName: customName || 'Portfolio Allocation',
            hasOptions: true,
            hasFilters: true,
            filterContent: <div />,
            filtersActive: false,
            onClearFilters: () => {},
          },
          isEditable,
          isCollapsible,
          style: allowResize
            ? {}
            : {
                height: typeof height === 'number' ? `${height}px` : height,
                minHeight: typeof height === 'number' ? `${height}px` : height,
              },
          customName,
          onCustomNameChange: setCustomName,
          showOptionsDialog,
          onCloseOptionsDialog: () => setShowOptionsDialog(false),
          ...(onRemove && { onRemove }),
          ...(onSettings && { onSettings }),
          ...(onCollapse && { onCollapse }),
          ...(onTabMove && { onTabMove }),
        }}
      >
        <div className="flex flex-col h-full p-xs bg-card">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-pulse text-muted-foreground">
                Loading portfolio data...
              </div>
            </div>
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  if (error || allocationData.length === 0) {
    return (
      <WidgetWrapper
        {...{
          metadata: {
            ...getWidgetMetadata('portfolio-allocation'),
            id: widgetId,
            title: customName || 'Portfolio Allocation',
            displayName: customName || 'Portfolio Allocation',
            hasOptions: true,
            hasFilters: true,
            filterContent: <div />,
            filtersActive: false,
            onClearFilters: () => {},
          },
          isEditable,
          isCollapsible,
          style: allowResize
            ? {}
            : {
                height: typeof height === 'number' ? `${height}px` : height,
                minHeight: typeof height === 'number' ? `${height}px` : height,
              },
          customName,
          onCustomNameChange: setCustomName,
          showOptionsDialog,
          onCloseOptionsDialog: () => setShowOptionsDialog(false),
          ...(onRemove && { onRemove }),
          ...(onSettings && { onSettings }),
          ...(onCollapse && { onCollapse }),
          ...(onTabMove && { onTabMove }),
          ...(menuActions && {
            menuActions: {
              ...menuActions,
            },
          }),
        }}
      >
        <div className="flex flex-col h-full p-xs bg-card">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-muted-foreground mb-2">
                {error
                  ? 'Failed to load portfolio data'
                  : 'No portfolio data available'}
              </div>
            </div>
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  const content = (
    <div className="flex flex-col h-full p-xs bg-card">
      {/* Chart Area */}
      <div className="flex-1 min-h-[180px] sm:min-h-[200px] lg:min-h-[220px] flex items-center justify-center">
        <div className="relative w-full h-full max-w-full max-h-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            style={{ pointerEvents: 'auto' }}
          >
            <PieChart>
              <defs>
                {allocationData.map(
                  (item: AllocationDataItem, index: number) => (
                    <linearGradient
                      key={`gradient-${item.name}-${index}`}
                      id={`gradient-${index}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={item.color}
                        stopOpacity="0.4"
                      />
                      <stop
                        offset="50%"
                        stopColor={item.color}
                        stopOpacity="0.8"
                      />
                      <stop
                        offset="100%"
                        stopColor={item.color}
                        stopOpacity="1"
                      />
                    </linearGradient>
                  )
                )}
              </defs>
              <Pie
                data={allocationData}
                cx="50%"
                cy="50%"
                innerRadius="65%"
                outerRadius="85%"
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1}
                isAnimationActive={true}
              >
                {allocationData.map(
                  (item: AllocationDataItem, index: number) => (
                    <Cell
                      key={`cell-${item.name}-${index}`}
                      fill={`url(#gradient-${index})`}
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth={1}
                      style={{ pointerEvents: 'auto' }}
                    />
                  )
                )}
              </Pie>
              <Tooltip
                content={renderTooltip}
                cursor={false}
                isAnimationActive={false}
                wrapperStyle={{ zIndex: 2000, pointerEvents: 'auto' }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center text */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ zIndex: 1 }}
          >
            <div className="text-base sm:text-lg lg:text-xl font-bold text-foreground text-center leading-tight px-2">
              {privacyMode
                ? '***'
                : `${formatValueInCurrency(totalValue).symbol}${formatValueInCurrency(totalValue).formatted}`}
            </div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Check if any filters are active (not default state)
  const filtersActive =
    !selectedExchanges.includes('ALL') || selectedExchanges.length > 1;

  // Clear all filters to default state
  const clearAllFilters = () => {
    setSelectedExchanges(['ALL']);
    if (portfolioContext?.setSelectedExchanges) {
      portfolioContext.setSelectedExchanges(['ALL']);
    }
  };

  // Create exchange filter items for the generic filter system
  const exchangeFilterItems: FilterItem[] = exchanges
    .filter((exchange) => exchange.id !== 'ALL') // Exclude ALL since it's handled separately
    .map((exchange) => ({
      id: exchange.id, // Use UUID for consistency
      name: exchange.name,
      icon: exchange.icon,
      color: exchange.color || '#64748b',
      isExchange: true,
    }));

  // Prepare exchange data for ListModal
  const exchangeModalItems = [
    {
      symbol: 'ALL',
      name: 'All Exchanges',
      icon: '🏢',
      color: '#3b82f6',
      subtitle: 'Total portfolio value',
      isExchange: true,
    },
    ...exchanges
      .filter((exchange) => exchange.id !== 'ALL')
      .map((exchange) => ({
        symbol: exchange.id, // Use UUID for internal tracking
        name: exchange.name, // Just the name
        icon: exchange.icon,
        color: exchange.color || '#64748b',
        subtitle: exchange.provider, // Pass raw provider string
        balance: exchange.balance,
        isExchange: true,
      })),
  ];

  // Create filter content using the generic filter system
  const filterContent = (
    <div className="space-y-md">
      <FilterSection
        title="Exchanges"
        selectedItems={selectedExchanges}
        availableItems={exchangeFilterItems}
        onItemRemove={handleRemoveExchange}
        onShowDialog={() => setShowExchangeDialog(true)}
        addButtonText="Add exchanges"
        showAllOption={true}
      />

      {/* Use ListModal for exchange selection with proper icon rendering */}
      <ListModal
        isOpen={showExchangeDialog}
        onClose={() => setShowExchangeDialog(false)}
        title="Select Exchanges"
        items={exchangeModalItems}
        selectedItems={selectedExchanges}
        onItemToggle={handleExchangeToggle}
        searchPlaceholder="Search exchanges..."
      />
    </div>
  );

  const wrapperProps = {
    metadata: {
      ...getWidgetMetadata('portfolio-allocation'),
      id: widgetId,
      title: customName || 'Portfolio Allocation',
      displayName: customName || 'Portfolio Allocation',
      hasOptions: true,
      hasFilters: true,
      filterContent,
      filtersActive,
      onClearFilters: clearAllFilters,
    },
    isEditable,
    isCollapsible,
    style: allowResize
      ? {}
      : {
          height: typeof height === 'number' ? `${height}px` : height,
          minHeight: typeof height === 'number' ? `${height}px` : height,
        },
    customName,
    onCustomNameChange: setCustomName,
    showOptionsDialog,
    onCloseOptionsDialog: () => setShowOptionsDialog(false),
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && {
      menuActions: {
        ...menuActions,
      },
    }),
    cacheQueries: [
      {
        queryKey: 'getPortfolioByUser',
        variables: {} as Record<string, unknown>,
      },
    ],
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default PortfolioAllocation;
