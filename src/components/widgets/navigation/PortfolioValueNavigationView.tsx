import { useGraphQL } from '@/hooks/useGraphQL';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import { GraphQlQuery } from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import { StatusEnum, type PortfolioQuery, type Snapshots } from '@/types';
import { DollarSign } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ProfitLossPercChip } from '../../ui/chip/ProfitLossPercChip';

interface PortfolioValueNavigationViewProps {
  widgetId: string;
  compact?: boolean;
}

const PortfolioValueNavigationView: React.FC<
  PortfolioValueNavigationViewProps
> = ({ widgetId: _widgetId, compact: _compact = false }) => {
  const privacyMode = useUIStore((s) => s.privacyMode);
  const { formatUsd } = useReportingCurrency();

  const [portfolioData, setPortfolioData] = useState<{
    currentValue: number;
    previousValue: number;
    difference: number;
    percentage: number;
    isPositive: boolean;
  }>({
    currentValue: 0,
    previousValue: 0,
    difference: 0,
    percentage: 0,
    isPositive: true,
  });

  const [snapshots, setSnapshots] = useState<Snapshots[]>([]);

  // Use real GraphQL API (same as dashboard PortfolioValue widget)
  const { data: p } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  useEffect(() => {
    if (p?.status === StatusEnum.notok) {
      console.error(`Error fetching portfolio data: ${p.reason}`);
    } else {
      setSnapshots(
        p?.data.result.map((portfolio) => ({
          ...portfolio,
          assets: portfolio.assets.map((asset) => ({
            ...asset,
            name: asset.name === 'looks' ? 'RARE' : asset.name, // Normalize asset names
          })),
        })) || []
      );
    }
  }, [p]);

  // Calculate portfolio value and change
  useEffect(() => {
    if (snapshots.length >= 2) {
      // Sort by updateTime to ensure chronological order
      const sortedSnapshots = [...snapshots].sort(
        (a, b) => a.updateTime - b.updateTime
      );

      const currentValue = sortedSnapshots[sortedSnapshots.length - 1].totalUsd;
      const previousValue =
        sortedSnapshots[sortedSnapshots.length - 2].totalUsd;

      const difference = currentValue - previousValue;
      const percentage =
        previousValue !== 0 ? (difference / previousValue) * 100 : 0;

      setPortfolioData({
        currentValue,
        previousValue,
        difference,
        percentage,
        isPositive: difference >= 0,
      });
    } else if (snapshots.length === 1) {
      // Only one data point available
      const currentValue = snapshots[0].totalUsd;
      setPortfolioData({
        currentValue,
        previousValue: 0,
        difference: 0,
        percentage: 0,
        isPositive: true,
      });
    }
  }, [snapshots]);

  return (
    <div className="flex flex-col gap-0.5 shrink-0 cursor-pointer hover:bg-accent/50 px-2 py-1 rounded transition-all duration-200 hover:scale-105 min-w-[90px]">
      <div className="flex items-center gap-1 justify-center">
        <DollarSign className="w-3 h-3 text-muted-foreground" />
        <span className="font-medium text-xs text-muted-foreground">
          Portfolio
        </span>
      </div>

      <div className="text-xs font-medium text-center">
        {privacyMode
          ? '***'
          : formatUsd(portfolioData.currentValue)}
      </div>

      {portfolioData.percentage !== 0 && (
        <div className="flex justify-center">
          <ProfitLossPercChip
            value={privacyMode ? 0 : portfolioData.percentage}
            textValue={privacyMode ? '***' : ''}
            size="xs"
          />
        </div>
      )}
    </div>
  );
};

export default PortfolioValueNavigationView;
