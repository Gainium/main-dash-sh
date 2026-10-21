import React, { useMemo } from 'react';
/* import { useParams } from 'react-router-dom'; */

/* import { useDcaBots } from '../../../../hooks/useDcaBots'; */
import { ProgressBar } from '../../../ui/ProgressBar';
import { DrawerSection } from './DrawerSection';

import { PieChart } from 'lucide-react';
import { formatPercentage } from '../../../../lib/utils';
import { formatQuoteAmount } from '@/utils/formatters';
import type { DrawerBot } from '@/types/bots/drawer';

export interface DrawerAssetAllocationProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

const DrawerAssetAllocation: React.FC<DrawerAssetAllocationProps> = ({
  widgetId,
  //botId,
  bot,
}) => {
  /* const { id: paramBotId } = useParams<{ id: string }>(); */
  /* const actualBotId = botId || paramBotId; */

  // Get bot data using real GraphQL hook (exclude terminal deals)
  /*  const { bots, isLoading, isError } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  }); */
  /* bots.find((b) => b._id === actualBotId) */

  // Calculate asset allocation metrics from real data
  const allocationMetrics = useMemo(() => {
    if (!bot) {
      return {
        currentBaseUsage: 0,
        maxBaseUsage: 0,
        currentQuoteUsage: 0,
        maxQuoteUsage: 0,
        baseUtilization: 0,
        quoteUtilization: 0,
        totalValue: 0,
        baseSymbol: 'BTC',
        quoteSymbol: 'USDT',
        currentBase: [],
        currentQuote: [],
      };
    }

    // Extract asset information from bot data
    const currentBase = Array.isArray(bot.currentBalances?.base)
      ? bot.currentBalances?.base.map((b) => b.value)
      : [bot.currentBalances.base];
    const currentQuote = Array.isArray(bot.currentBalances?.quote)
      ? bot.currentBalances?.quote.map((b) => b.value)
      : [bot.currentBalances.quote];
    const currentBaseUsage =
      currentBase?.reduce((sum, asset) => sum + asset, 0) || 0;
    const maxBaseUsage = bot.usage?.max?.base || 0;
    const currentQuoteUsage =
      currentQuote?.reduce((sum, asset) => sum + asset, 0) || 0;
    const maxQuoteUsage = bot.usage?.max?.quote || 0;

    // Calculate utilization with proper validation and capping
    const baseUtilization =
      maxBaseUsage > 0
        ? Math.min(100, Math.max(0, (currentBaseUsage / maxBaseUsage) * 100))
        : 0;
    const quoteUtilization =
      maxQuoteUsage > 0
        ? Math.min(100, Math.max(0, (currentQuoteUsage / maxQuoteUsage) * 100))
        : 0;

    // Get symbol information
    const symbolInfo = Array.isArray(bot.symbol)
      ? bot.symbol[0].value
      : bot.symbol;
    const baseSymbol = symbolInfo?.baseAsset || 'BTC';
    const quoteSymbol = symbolInfo?.quoteAsset || 'USDT';

    // Calculate total value correctly - avoid double counting
    const totalValue = currentQuoteUsage; // Quote value represents the total USD value

    return {
      currentBaseUsage,
      maxBaseUsage,
      currentQuoteUsage,
      maxQuoteUsage,
      baseUtilization,
      quoteUtilization,
      totalValue,
      baseSymbol,
      quoteSymbol,
      currentBase: currentBase ?? [],
      currentQuote: currentQuote ?? [],
    };
  }, [bot]);

  /* if (isLoading) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-asset-allocation"
        title="Asset Allocation"
        minSize={{ w: 4, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
        hasOptions={false}
      >
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          Loading allocation data...
        </div>
      </DrawerSection>
    );
  } */

  if (/* isError || */ !bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-asset-allocation"
        title="Asset Allocation"
        minSize={{ w: 4, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
        hasOptions={false}
      >
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          {/* isError ? 'Error loading allocation data' :  */ 'Bot not found'}
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-asset-allocation"
      title="Asset Allocation"
      minSize={{ w: 4, h: 4 }}
      maxSize={{ w: 12, h: 8 }}
      hasOptions={false}
    >
      <div className="flex items-center gap-xs mb-3">
        <PieChart className="w-4 h-4 text-white" />
        <h3 className="text-base font-semibold">Asset Allocation</h3>
      </div>

      {/* Compact Asset Usage - removed Trading Pair (duplicate of header) */}
      <div className="space-y-sm">
        {/* Base Asset */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium">
              {allocationMetrics.baseSymbol} Usage
            </span>
            <span className="text-xs text-muted-foreground">
              {allocationMetrics.currentBaseUsage.toFixed(6)} /{' '}
              {allocationMetrics.maxBaseUsage.toFixed(6)}
            </span>
          </div>
          <ProgressBar
            value={allocationMetrics.baseUtilization}
            className="h-1.5"
            variant="default"
          />
          <div className="text-xs text-muted-foreground text-right">
            {formatPercentage(allocationMetrics.baseUtilization)} utilized
          </div>
        </div>

        {/* Quote Asset */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium">
              {allocationMetrics.quoteSymbol} Usage
            </span>
            <span className="text-xs text-muted-foreground">
              {formatQuoteAmount(
                allocationMetrics.currentQuoteUsage,
                allocationMetrics.quoteSymbol
              )}{' '}
              /{' '}
              {formatQuoteAmount(
                allocationMetrics.maxQuoteUsage,
                allocationMetrics.quoteSymbol
              )}
            </span>
          </div>
          <ProgressBar
            value={allocationMetrics.quoteUtilization}
            className="h-1.5"
            variant="default"
          />
          <div className="text-xs text-muted-foreground text-right">
            {formatPercentage(allocationMetrics.quoteUtilization)} utilized
          </div>
        </div>
      </div>

      {/* Exchange Balances if available - removed duplicate summary stats */}
      {bot.currentBalances &&
        (allocationMetrics.currentBase?.length > 0 ||
          allocationMetrics.currentQuote?.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">Exchange Balances</div>
              <div className="text-xs text-muted-foreground">Live</div>
            </div>
            <div className="space-y-1">
              {bot.currentBalances?.base &&
                allocationMetrics.currentBase.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {allocationMetrics.baseSymbol}
                    </span>
                    <span className="text-xs font-medium">
                      {(allocationMetrics.currentBase[0] || 0).toFixed(6)}
                    </span>
                  </div>
                )}

              {bot.currentBalances?.quote &&
                allocationMetrics.currentQuote.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {allocationMetrics.quoteSymbol}
                    </span>
                    <span className="text-xs font-medium">
                      {formatQuoteAmount(
                        allocationMetrics.currentQuote[0] || 0,
                        allocationMetrics.quoteSymbol
                      )}
                    </span>
                  </div>
                )}
            </div>
          </div>
        )}
    </DrawerSection>
  );
};

export default DrawerAssetAllocation;
