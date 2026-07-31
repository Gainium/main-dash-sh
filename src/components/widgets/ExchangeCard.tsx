/* eslint-disable @typescript-eslint/no-explicit-any */
import ExchangeIcon from '@/components/widgets/shared/ExchangeIcon';
import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { StatusEnum, type PortfolioQuery, type Snapshots } from '@/types';
import { ExchangeEnum, type ExchangeInUser } from '@/types/exchange.types';
import { StatusChip } from '@/components/ui/chip/StatusChip';
import { RotationChip } from '@/components/ui/chip/RotationChip';
import { formatExchangeProvider, getProviderIcon } from '@/utils/exchangeUtils';
import { MoreVertical, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useExchangesStore } from '../../stores/exchangesStore';
import { useUIStore } from '../../stores/uiStore';
import CustomTooltip from '../charts/CustomTooltip';
import { Button } from '../ui/button';
import { Donut, type DonutDataItem } from '../ui/charts/Donut';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import WidgetWrapper from './WidgetWrapper';
import { getWidgetMetadata } from './index';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

interface ExchangeCardProps {
  exchangeId?: string; // 'ALL' or single exchange uuid
  height?: number | string;
  isEditable?: boolean;
  onEdit?: (exchangeData: ExchangeInUser) => void;
  onDelete?: (exchangeData: ExchangeInUser) => void;
  onRefresh?: (exchangeData: ExchangeInUser) => void;
  isRefreshing?: boolean;
}

const coinColors = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

const getColorForIndex = (index: number) =>
  coinColors[index % coinColors.length];

// Look up the full `ExchangeInUser` (with `hedge`, `zeroFee`, `key`,
// `secret`, etc.) from the store by uuid. The card itself only carries
// the transformed `UIExchange` view; synthesizing a partial here is what
// caused the edit dialog to render hedge/ignoreFees as `false` even when
// the server had them `true`.
const resolveExchangeData = (
  exchange: { id: string; name: string; provider?: string; balance?: number }
): ExchangeInUser => {
  const full = useExchangesStore.getState().getExchange(exchange.id);
  if (full) return full;
  return {
    uuid: exchange.id,
    name: exchange.name,
    provider: exchange.provider as any,
    key: '',
    secret: '',
    status: true,
    balance: exchange.balance || 0,
  };
};

export const ExchangeCard: React.FC<ExchangeCardProps> = ({
  exchangeId = 'ALL',
  height = 200,
  isEditable = false,
  onEdit,
  onDelete,
  onRefresh,
  isRefreshing = false,
}) => {
  const { exchanges } = useTransformedExchangesFromContext();
  const { data: p } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );
  const privacyMode = useUIStore((s) => s.privacyMode);

  const [snapshots, setSnapshots] = useState<Snapshots[]>([]);

  useEffect(() => {
    if (p?.status === StatusEnum.ok && p.data?.result) {
      setSnapshots(
        p.data.result.map((s) => ({
          ...s,
          assets: s.assets.map((pa) => ({
            ...pa,
            name: pa.name === 'looks' ? 'RARE' : pa.name,
          })),
        }))
      );
    }
  }, [p]);

  // Compute chart data for this exchange only (or ALL)
  const processed = useMemo(() => {
    type ExObj = { uuid: string; amount?: number; amountUsd?: number };
    type AssetWithEx = {
      name: string;
      amount: number;
      amountUsd: number;
      exchanges?: ExObj[];
    };

    if (!snapshots || snapshots.length === 0) {
      return {
        currentValue: 0,
        changePercent: 0,
        changeValue: 0,
        chartData: [] as any[],
        breakdown: [] as DonutDataItem[],
      };
    }

    const exchangeIds = [exchangeId];
    const showAllExchanges = exchangeId === 'ALL';

    // Process snapshots: filter assets by exchange if necessary
    const processedSnapshots = snapshots.map((snapshot) => {
      if (showAllExchanges) {
        const totalUsd = snapshot.assets.reduce(
          (sum: number, a: any) => sum + (a.amountUsd || 0),
          0
        );
        return { ...snapshot, totalUsd, assets: snapshot.assets };
      }

      const filteredAssets = (snapshot.assets as AssetWithEx[])
        .map((asset: AssetWithEx | null) => {
          if (!asset || !asset.exchanges) return null;
          const filteredEx = (asset.exchanges as ExObj[]).filter((ex: ExObj) =>
            exchangeIds.includes(ex.uuid)
          );
          if (filteredEx.length === 0) return null;
          const amountUsd = filteredEx.reduce(
            (sum: number, ex: ExObj) => sum + (ex.amountUsd || 0),
            0
          );
          const amount = filteredEx.reduce(
            (sum: number, ex: ExObj) => sum + (ex.amount || 0),
            0
          );
          return {
            ...asset,
            amount,
            amountUsd,
            exchanges: filteredEx,
          } as AssetWithEx;
        })
        .filter(Boolean) as AssetWithEx[];

      const totalUsd = filteredAssets.reduce(
        (sum: number, a: AssetWithEx) => sum + (a.amountUsd || 0),
        0
      );

      return { ...snapshot, assets: filteredAssets, totalUsd };
    });

    // Convert to chart data
    const chartData = processedSnapshots
      .map((snapshot) => {
        const date = new Date(snapshot.updateTime);
        return {
          date: date.toISOString(),
          value: snapshot.totalUsd,
          updateTime: snapshot.updateTime,
        };
      })
      .sort((a, b) => a.updateTime - b.updateTime);

    const currentValue =
      chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
    const previousValue =
      chartData.length > 1
        ? chartData[chartData.length - 2].value
        : currentValue;
    const changeValue = currentValue - previousValue;
    const changePercent =
      previousValue > 0 ? (changeValue / previousValue) * 100 : 0;

    // Breakdown - use latest snapshot to compute per-coin values
    const latestSnapshot = processedSnapshots[processedSnapshots.length - 1];
    const breakdown: DonutDataItem[] = (
      (latestSnapshot?.assets as AssetWithEx[]) || []
    )
      .map(
        (asset: AssetWithEx, index: number) =>
          ({
            name: asset.name.toUpperCase(),
            value: Math.max(0, asset.amountUsd || 0),
            color: getColorForIndex(index),
          }) as DonutDataItem
      )
      .filter((item: DonutDataItem) => item.value > 0)
      .sort((a: DonutDataItem, b: DonutDataItem) => b.value - a.value)
      .slice(0, 10);

    return { currentValue, changeValue, changePercent, chartData, breakdown };
  }, [snapshots, exchangeId]);

  const exchange =
    exchanges.find((e) => e.id === exchangeId) || exchanges[0] || null;

  // Pull the full record so we can show the connection status indicator
  // (the transformed UIExchange carries `status` but not `lastUpdated`).
  const fullExchange = useExchangesStore((s) =>
    exchange && exchange.id !== 'ALL' ? s.getExchange(exchange.id) : undefined
  );

  const statusKey = useMemo(() => {
    if (!exchange || exchange.id === 'ALL') return null;
    if (
      fullExchange?.provider === ExchangeEnum.mexc ||
      fullExchange?.provider === ExchangeEnum.paperMexc
    ) {
      return 'disabled';
    }
    return exchange.status ? 'ok' : 'error';
  }, [exchange, fullExchange]);

  const statusTooltip = fullExchange?.lastUpdated
    ? `Last status update: ${new Date(fullExchange.lastUpdated).toLocaleString()}`
    : undefined;

  const totalValue = processed.currentValue;
  const changePercent = processed.changePercent;
  const chartData = processed.chartData;
  const breakdown = processed.breakdown;

  const headerValue = privacyMode
    ? '***'
    : totalValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

  return (
    <WidgetWrapper
      metadata={{
        ...getWidgetMetadata('portfolio-value'),
        id: `exchange-card-${exchangeId}`,
        title: exchange?.name || 'Exchange',
        header: false,
        value: {
          primary: privacyMode ? '***' : totalValue,
          secondary: 'USD',
          change: {
            value: privacyMode ? '***' : processed.changeValue,
            percentage: privacyMode
              ? '***'
              : Math.round(changePercent * 100) / 100,
            isPositive: processed.changeValue >= 0,
          },
        },
      }}
      isEditable={isEditable}
      style={{
        height: typeof height === 'number' ? `${height}px` : (height as string),
      }}
    >
      <div className="flex flex-col h-full p-sm overflow-hidden">
        {/* Header: Exchange chip (stacked) and donut on same row */}
        <div className="flex items-start justify-between gap-md mb-3">
          {/* Left: Stacked exchange chip with bigger name */}
          <div className="flex flex-col gap-xs min-w-0 flex-1">
            {exchange && (
              <div className="flex items-center gap-sm">
                <ExchangeIcon
                  icon={getProviderIcon(exchange.provider || exchange.id)}
                  size="w-16 h-16"
                />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-xs min-w-0">
                    <span className="text-3xl font-bold text-foreground truncate">
                      {exchange.name}
                    </span>
                    {statusKey && (
                      <span title={statusTooltip} className="shrink-0">
                        <StatusChip
                          status={statusKey}
                          size="xs"
                          chipStyle="soft"
                        />
                      </span>
                    )}
                    <RotationChip
                      rotationRequired={exchange.rotationRequired}
                      provider={exchange.provider}
                      onClick={
                        onEdit
                          ? (e) => {
                              e.stopPropagation();
                              onEdit(resolveExchangeData(exchange));
                            }
                          : undefined
                      }
                    />
                  </div>
                  {exchange.provider && (
                    <span className="text-base text-muted-foreground truncate">
                      {formatExchangeProvider(exchange.provider)}
                    </span>
                  )}
                </div>
              </div>
            )}
            {/* Value info below exchange name */}
            <div className="flex flex-col gap-0.5">
              <div className="text-3xl font-bold text-foreground">
                {headerValue}
              </div>
              <div
                className={`text-base font-medium ${processed.changeValue >= 0 ? 'text-success' : 'text-destructive'}`}
              >
                {privacyMode
                  ? '***'
                  : `${processed.changeValue >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
              </div>
            </div>
          </div>

          {/* Right: Donut and Menu */}
          <div className="flex items-start gap-xs">
            <div className="shrink-0 w-32 h-32">
              <Donut
                data={breakdown}
                totalValue={totalValue}
                height="100%"
                privacyMode={privacyMode}
              />
            </div>

            {/* Three-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (onRefresh && exchange) {
                      onRefresh(resolveExchangeData(exchange));
                    }
                  }}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (onEdit && exchange) {
                      onEdit(resolveExchangeData(exchange));
                    }
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (onDelete && exchange) {
                      onDelete(resolveExchangeData(exchange));
                    }
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Full width balance chart */}
        <div className="flex flex-col gap-1 flex-1 min-h-0">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id="exchangeColor"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip
                  content={
                    <CustomTooltip
                      valueFormatter={
                        privacyMode ? () => ['***', ''] as const : undefined
                      }
                    />
                  }
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  stroke="#60a5fa"
                  fill="url(#exchangeColor)"
                  dot={false}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </WidgetWrapper>
  );
};

export default ExchangeCard;
