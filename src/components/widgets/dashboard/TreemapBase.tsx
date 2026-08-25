/* eslint-disable spacing/no-hardcoded-font-size */
/* import { type DCADeals } from '@/hooks/useDcaDeals'; */
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useUsdRate } from '@/hooks/useUsdRate';
import { GraphQlQuery } from '@/lib/api';
import type { ReturnResult } from '@/lib/api/types';
import {
  calculateUnrealizedPnL,
  type PriceData,
} from '@/lib/utils/unrealizedPnL';
import {
  BotTypesEnum,
  StatusEnum,
  type DCADeals,
  type PortfolioQuery,
  type ScreenerCoinData,
} from '@/types';
import { useAllScreenerCoins } from '@/hooks/useScreenerCoins';
import { extractPairAssets } from '@/utils/pairs';
import {
  buildScreenerSymbolMap,
  findBestScreenerMatch,
  findPortfolioAssetBySymbol,
} from '@/utils/portfolioScreenerMatching';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Treemap as RechartsTreemap, ResponsiveContainer } from 'recharts';
import { useWidgetSettings } from '../../../hooks/useWidgetSettings';
import logger from '../../../lib/loggerInstance';
import { useUIStore } from '../../../stores/uiStore';
import { BotTypeChip, ExchangeChip } from '../../ui/chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import CoinIcon from '../shared/CoinIcon';
import { ListModal } from '../shared/ListModal';
import { FilterSection, type FilterItem } from '../shared/WidgetFilterArea';
import { WidgetWrapper } from '../WidgetWrapper';

// Base Treemap widget settings interface
interface TreemapBaseSettings {
  period:
    | '1 Min'
    | '5 Min'
    | '15 Min'
    | 'Hour'
    | '4 Hours'
    | 'Day'
    | 'Week'
    | 'Month'
    | '3 Months'
    | 'Year';
  bubbleSize: 'Performance' | 'Rank' | 'Market Cap' | '24h Volume';
  bubbleContent:
    | 'Performance'
    | 'Rank'
    | 'Market Cap'
    | '24h Volume'
    | 'Price'
    | 'Name'
    | 'Dominance';
  bubbleColor: 'Performance' | 'Rank' | 'Neutral';
  selectedExchanges: string[];
}

type TreemapScope = 'market' | 'portfolio' | 'deals';

type ApiScreenerCoin = {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChangePercentage1h: number;
  priceChangePercentage24h: number;
  marketCap: number;
  totalVolume: number;
  priceChangePercentage7d: number;
  priceChangePercentage30d: number;
  priceChangePercentage1y: number;
  category: string[] | string;
  atlChangePercentage: number;
  athChangePercentage: number;
  marketCapChangePercentage24h: number;
  marketCapRank: number;
  liquidityScore: number;
  volumeChange24h?: number;
  volatility1d?: number;
  volatility3d?: number;
  volatility7d?: number;
  sparkline?: number[];
};

export interface TreemapBaseProps {
  widgetId: string;
  scope: TreemapScope;
  title: string;
  widgetType: string;
  isEditable?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: import('../WidgetWrapper').WidgetMenuActions;
  // Optional data props for different scopes
  portfolioData?: ReturnResult<PortfolioQuery>;
  dcaDeals?: DCADeals[];
  // Optional precomputed metrics for deals; if provided we will use these instead of local calculations
  dealMetrics?: Record<
    string,
    {
      unrealizedUsd: number;
      unrealizedPct: number; // percentage relative to usage.currentUsd (or quote)
    }
  >;
}

// Screener data. Market mode charts the WHOLE coin universe, so this is the
// paged fetch — it used to share the `['screener','all']` key with the
// portfolio widgets' single clamped page, which meant whichever mounted first
// decided whether this widget saw ~950 coins or 100. See useScreenerCoins.
const useScreenerData = useAllScreenerCoins;

interface NodeContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  symbol?: string;
  displayName?: string;
  change24h?: number;
  onHover?: (
    coinOrSymbol: { coin: ScreenerCoinData | null; symbol: string } | null,
    payload?: HoverPayload
  ) => void;
  screenerSymbolMap?: Map<string, ScreenerCoinData>;
}

interface HoverPayload {
  containerRect: { width: number; height: number };
  pointerX: number;
  pointerY: number;
  targetRect: { x: number; y: number; width: number; height: number };
}

const NodeContent: React.FC<NodeContentProps> = (props) => {
  const {
    x,
    y,
    width,
    height,
    name,
    symbol,
    displayName: propDisplayName,
    change24h,
    onHover,
    screenerSymbolMap,
  } = props;

  const coinSymbol = ((symbol || name || '') as string)
    .toString()
    .trim()
    .toUpperCase();
  // Use propDisplayName if provided, otherwise fall back to name || symbol
  const displayName = (propDisplayName || name || symbol || '')
    .toString()
    .trim()
    .toUpperCase();
  // Try to split trading pair into BASE/QUOTE for better readability
  const trySplitPair = (s: string): { base: string; quote: string } | null => {
    if (!s) return null;
    const clean = s.replace(/\s+/g, '').toUpperCase();
    const { baseAsset, quoteAsset } = extractPairAssets(clean);
    if (baseAsset && quoteAsset) {
      return { base: baseAsset, quote: quoteAsset };
    }
    return null;
  };
  const pair = trySplitPair(displayName);
  const priceChange = Number(change24h) || 0;
  if (!coinSymbol || coinSymbol === 'N/A') return null;

  const isProfit = priceChange >= 0;
  const color = isProfit ? 'var(--color-profit)' : 'var(--color-loss)';

  const s = Math.max(1, Math.min(width, height));
  const ratio = width / Math.max(1, height);
  const layout: 'vertical' | 'standard' | 'compact' =
    ratio < 0.8 ? 'vertical' : ratio > 1.8 ? 'compact' : 'standard';

  // Dynamic spacing: shrink padding/gap for very small tiles so text can use more area
  const area = width * height;
  const verySmall = s < 42 || area < 1800;
  const tiny = s < 30 || area < 900;
  const pad = tiny ? 1 : verySmall ? 2 : 4;
  const gap = tiny
    ? 2
    : verySmall
      ? layout === 'compact'
        ? 3
        : 4
      : layout === 'compact'
        ? 6
        : 8;

  const iconPx =
    layout === 'vertical'
      ? Math.min(height * 0.45, width * 0.7)
      : Math.min(s * 0.5, height * 0.8, width * 0.35);

  const iconSize = s < 42 ? 'sm' : s < 72 ? 'md' : 'lg';

  const textWidth =
    layout === 'vertical'
      ? width - pad * 2
      : Math.max(0, width - pad * 2 - iconPx - gap);
  const textHeight =
    layout === 'vertical'
      ? Math.max(0, height - pad * 2 - iconPx - gap)
      : Math.max(0, height - pad * 2);

  const fitFont = (
    candidate: number,
    maxW: number,
    maxH: number,
    charCount: number
  ) => {
    const estW = candidate * 0.62 * Math.max(1, charCount);
    let size = candidate;
    if (estW > maxW && estW > 0) size *= maxW / estW;
    if (size > maxH) size = maxH;
    return Math.max(10, size);
  };

  const symbolCandidate = Math.min(s * 0.42, width * 0.22, 96);
  const changeCandidate = Math.min(s * 0.34, width * 0.18, 72);

  const symbolLen = (coinSymbol || '').length || 3;
  let symbolSize = fitFont(
    symbolCandidate,
    textWidth,
    textHeight * 0.6,
    symbolLen
  );
  let priceChangeSize = fitFont(
    changeCandidate,
    textWidth,
    textHeight * 0.5,
    6
  );
  // Quote font size will be derived as a fixed ratio of the base symbol size (after scaling)
  const quoteRatio = 0.6; // 60% of base size by design
  let quoteSize = 0; // will set after symbol size finalized

  if (layout !== 'compact') {
    // First estimate quote size from current symbol size to compute total height
    if (pair) {
      quoteSize = Math.max(8, symbolSize * quoteRatio);
    }
    const totalH =
      symbolSize + (pair ? quoteSize + 2 : 0) + priceChangeSize + 4;
    if (totalH > textHeight && totalH > 0) {
      const scale = textHeight / totalH;
      symbolSize *= scale;
      priceChangeSize *= scale;
      if (pair) {
        quoteSize = Math.max(8, symbolSize * quoteRatio);
      }
    }
  } else {
    const maxRowH = Math.min(height - pad * 2, s * 0.6);
    symbolSize = Math.min(symbolSize, maxRowH);
    priceChangeSize = Math.min(priceChangeSize, maxRowH * 0.9);
    if (pair) {
      quoteSize = Math.max(8, Math.min(symbolSize * quoteRatio, maxRowH * 0.7));
    }
  }

  // Final safety: ensure quote never exceeds base (can happen if min threshold triggers)
  if (pair) {
    quoteSize = Math.min(quoteSize, symbolSize - 1);
  }

  const isVerySmall = s < 36;

  const coinData = screenerSymbolMap
    ? findBestScreenerMatch(coinSymbol, screenerSymbolMap)
    : null;

  const emitHover = (
    node: HTMLElement,
    e: React.PointerEvent | React.MouseEvent
  ) => {
    if (!onHover) return;
    const container = node.closest(
      '[data-widget-container]'
    ) as HTMLElement | null;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = node.getBoundingClientRect();
    const clientX =
      'clientX' in e
        ? (e as React.PointerEvent).clientX
        : targetRect.left + targetRect.width / 2;
    const clientY =
      'clientY' in e
        ? (e as React.PointerEvent).clientY
        : targetRect.top + targetRect.height / 2;
    const pointerX = clientX - containerRect.left;
    const pointerY = clientY - containerRect.top;
    onHover(
      { coin: coinData, symbol: name || displayName },
      {
        containerRect: {
          width: containerRect.width,
          height: containerRect.height,
        },
        pointerX,
        pointerY,
        targetRect: { x, y, width, height },
      }
    );
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    const node = e.currentTarget as HTMLElement;
    emitHover(node, e);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const node = e.currentTarget as HTMLElement;
    emitHover(node, e);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    e.preventDefault();
    onHover?.(null);
  };

  const minVisibleChars = Math.min(4, symbolLen);
  let symbolMinWidthPx = symbolSize * 0.62 * minVisibleChars;

  if (layout === 'compact') {
    const totalAvail = Math.max(0, width - pad * 2 - iconPx - gap);
    symbolMinWidthPx = Math.min(symbolMinWidthPx, totalAvail * 0.7);
    const pctAvailableWidth = Math.max(0, totalAvail - symbolMinWidthPx - 8);
    priceChangeSize = fitFont(
      changeCandidate,
      pctAvailableWidth,
      height - pad * 2,
      6
    );
  }

  const compactSymbolMinWidth =
    layout === 'compact' ? Math.ceil(symbolMinWidthPx) : undefined;

  const horizontalSymbolContent = pair ? (
    <div
      className={
        layout === 'compact'
          ? 'shrink-0 text-left leading-tight min-w-0'
          : 'text-right leading-tight min-w-0'
      }
      style={{ minWidth: compactSymbolMinWidth }}
    >
      <div
        className={`font-extrabold whitespace-nowrap ${layout === 'compact' ? '' : ''}`}
        style={{ fontSize: symbolSize, lineHeight: 1 }}
      >
        {pair.base}
      </div>
      <div
        className={`text-muted-foreground whitespace-nowrap ${layout === 'compact' ? '' : ''}`}
        style={{ fontSize: quoteSize, lineHeight: 1 }}
      >
        {pair.quote}
      </div>
    </div>
  ) : (
    <div
      className={
        layout === 'compact'
          ? 'shrink-0 font-extrabold leading-tight text-left whitespace-nowrap'
          : 'font-bold leading-tight text-right whitespace-nowrap'
      }
      style={{
        fontSize: symbolSize,
        lineHeight: 1,
        minWidth: compactSymbolMinWidth,
      }}
    >
      {displayName}
    </div>
  );

  const horizontalPriceChange =
    s > 30 ? (
      <div
        className={`${layout === 'compact' ? 'shrink font-bold leading-tight text-left' : 'font-bold leading-tight text-right'} ${isProfit ? 'text-success' : 'text-destructive'}`}
        style={{ fontSize: priceChangeSize }}
      >
        {isProfit ? '+' : ''}
        {priceChange.toFixed(2)}%
      </div>
    ) : null;

  return (
    <g>
      <rect
        x={x}
        y={y}
        rx={6}
        ry={6}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.12}
        stroke={color}
        strokeOpacity={0.35}
      />
      <foreignObject
        x={x + 2}
        y={y + 2}
        width={Math.max(width - 4, 0)}
        height={Math.max(height - 4, 0)}
      >
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-white/10 rounded transition-all duration-200 hover:scale-105"
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {layout === 'vertical' ? (
            <div
              className="flex flex-col items-center justify-center"
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: Math.max(0, width - pad * 2),
                padding: pad,
                gap: verySmall ? 2 : 4,
              }}
            >
              {!isVerySmall && (
                <div
                  className="shrink-0"
                  style={{
                    lineHeight: 0,
                    width: Math.round(iconPx),
                    height: Math.round(iconPx),
                  }}
                >
                  <CoinIcon
                    symbol={coinSymbol}
                    size={iconSize}
                    className="w-full h-full"
                  />
                </div>
              )}
              {pair ? (
                <div className="text-center leading-tight">
                  <div
                    className="font-extrabold whitespace-nowrap"
                    style={{ fontSize: symbolSize, lineHeight: 1 }}
                  >
                    {pair.base}
                  </div>
                  <div
                    className="text-muted-foreground whitespace-nowrap"
                    style={{ fontSize: quoteSize, lineHeight: 1 }}
                  >
                    {pair.quote}
                  </div>
                </div>
              ) : (
                <div
                  className="whitespace-nowrap font-bold leading-tight text-center"
                  style={{ fontSize: symbolSize, lineHeight: 1 }}
                >
                  {displayName}
                </div>
              )}
              {s > 30 && (
                <div
                  className={`font-bold leading-tight text-center ${isProfit ? 'text-success' : 'text-destructive'}`}
                  style={{ fontSize: priceChangeSize }}
                >
                  {isProfit ? '+' : ''}
                  {priceChange.toFixed(2)}%
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex items-center justify-center"
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: Math.max(0, width - pad * 2),
                padding: pad,
                gap,
              }}
            >
              {!isVerySmall && (
                <div
                  className="shrink-0"
                  style={{
                    lineHeight: 0,
                    width: Math.round(iconPx),
                    height: Math.round(iconPx),
                  }}
                >
                  <CoinIcon
                    symbol={coinSymbol}
                    size={iconSize}
                    className="w-full h-full"
                  />
                </div>
              )}
              <div
                className={
                  layout === 'compact'
                    ? 'flex items-center gap-sm min-w-0'
                    : 'min-w-0 flex flex-col justify-between items-end'
                }
              >
                {horizontalSymbolContent}
                {horizontalPriceChange}
              </div>
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
};

const TreemapBase: React.FC<TreemapBaseProps> = ({
  widgetId,
  scope,
  title,
  widgetType,
  isEditable,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
  portfolioData: externalPortfolioData,
  dcaDeals: externalDcaDeals,
  dealMetrics: externalDealMetrics,
}) => {
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Helper to consistently read bot name (prefer flattened, fallback to nested)
  const getDealBotName = useCallback((deal: DCADeals | null | undefined) => {
    if (!deal) return '';
    return deal.botName || deal.dcaBot?.settings?.name || '';
  }, []);
  const queryClient = useQueryClient();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [popupSize, setPopupSize] = useState<{ width: number; height: number }>(
    { width: 320, height: 260 }
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);

  // Widget settings
  const { usePersistedState } =
    useWidgetSettings<TreemapBaseSettings>(widgetId);
  const [period, setPeriod] = usePersistedState('period', 'Day');
  const [bubbleSize, setBubbleSize] = usePersistedState(
    'bubbleSize',
    'Performance'
  );
  const [bubbleContent, setBubbleContent] = usePersistedState(
    'bubbleContent',
    'Performance'
  );
  const [bubbleColor, setBubbleColor] = usePersistedState(
    'bubbleColor',
    'Performance'
  );
  const [selectedExchanges, setSelectedExchanges] = usePersistedState(
    'selectedExchanges',
    ['ALL']
  );

  // Market data for price and change
  const {
    data: screenerResponse,
    isLoading: isScreenerLoading,
    error: screenerError,
  } = useScreenerData();
  const cached = queryClient.getQueryData(['screener', 'universe']) as
    | { status: StatusEnum; data?: { result?: ApiScreenerCoin[] } }
    | undefined;
  const screenerCoins: ScreenerCoinData[] = useMemo(() => {
    const apiCoins =
      cached?.data?.result ?? screenerResponse?.data?.result ?? [];
    return apiCoins as ScreenerCoinData[];
  }, [cached, screenerResponse]);

  // Portfolio snapshots (to compute sizes by USD value)
  const { data: portfolioData } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  // USD rate for unrealized PnL calculation
  const { rate: usdRateData } = useUsdRate();
  // Use external data if provided, otherwise use internal data
  const finalPortfolioData = externalPortfolioData || portfolioData;
  const finalDcaDeals = useMemo(
    () => externalDcaDeals || [],
    [externalDcaDeals]
  );

  // Exchanges and persisted settings
  const { exchanges } = useTransformedExchangesFromContext();
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);

  // Listen for external options open events
  useEffect(() => {
    const handleOpenOptions = (event: CustomEvent) => {
      if (event.detail?.widgetId === widgetId) {
        setShowOptionsDialog(true);
      }
    };

    document.addEventListener(
      'openWidgetOptions',
      handleOpenOptions as EventListener
    );

    return () => {
      document.removeEventListener(
        'openWidgetOptions',
        handleOpenOptions as EventListener
      );
    };
  }, [widgetId]);

  type PortfolioAsset = { name: string; amount: number; amountUsd: number };

  const assets: PortfolioAsset[] = useMemo(() => {
    if (!finalPortfolioData || finalPortfolioData.status !== StatusEnum.ok)
      return [];
    const series = finalPortfolioData.data?.result || [];
    const latest = series[series.length - 1];
    if (!latest?.assets) return [];

    const showAllExchanges = selectedExchanges.includes('ALL');

    return (latest.assets || [])
      .map((a) => {
        const name = (
          a?.name === 'looks' ? 'RARE' : a?.name || ''
        ).toUpperCase();
        if (!name) return null;

        // If showing all exchanges or no exchange breakdown available, use totals
        if (showAllExchanges || !Array.isArray(a?.exchanges)) {
          return {
            name,
            amount: a?.amount || 0,
            amountUsd: a?.amountUsd || 0,
          } as PortfolioAsset;
        }

        // Filter by selected exchanges
        const filtered =
          a.exchanges?.filter((ex) => selectedExchanges.includes(ex?.uuid)) ||
          [];
        if (filtered.length === 0) return null;
        const totalAmount = filtered.reduce(
          (sum, ex) => sum + (ex?.amount || 0),
          0
        );
        const totalAmountUsd = filtered.reduce(
          (sum, ex) => sum + (ex?.amountUsd || 0),
          0
        );
        return {
          name,
          amount: totalAmount,
          amountUsd: totalAmountUsd,
        } as PortfolioAsset;
      })
      .filter((a: PortfolioAsset | null): a is PortfolioAsset =>
        Boolean(a && a.name && a.amountUsd > 0)
      );
  }, [finalPortfolioData, selectedExchanges]);

  // Build screener symbol map with preference for higher market cap
  const screenerSymbolMap = useMemo(() => {
    return buildScreenerSymbolMap(screenerCoins);
  }, [screenerCoins]);

  // Build treemap data dynamically based on scope
  const treeData = useMemo(() => {
    if (scope === 'market') {
      // Market mode: use screener data for market cap treemap
      return screenerCoins
        .filter(
          (coin) => coin.marketCap > 0 && coin.priceChangePercentage24h !== null
        )
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 100) // Top 100 by market cap
        .map((coin) => ({
          name: coin.symbol?.toUpperCase() || coin.name?.toUpperCase() || '',
          symbol: coin.symbol?.toUpperCase() || coin.name?.toUpperCase() || '',
          size: Math.max(coin.marketCap, 1),
          change24h: Number.isFinite(coin.priceChangePercentage24h)
            ? coin.priceChangePercentage24h
            : 0,
        }));
    } else if (scope === 'deals') {
      // Deals mode: use DCA deals data for current cost and value % performance
      logger.info('TreemapBase deals scope - finalDcaDeals', {
        finalDcaDeals,
        length: finalDcaDeals.length,
      });

      const filteredDeals = finalDcaDeals.filter((deal) => {
        // More flexible status check - include 'active', 'open', etc.
        const statusValid =
          deal.status &&
          ['active', 'open', 'Active', 'Open'].includes(deal.status);
        const hasCurrentCost =
          deal.usage?.currentUsd && deal.usage.currentUsd > 0;
        // Make avgPrice optional for now - some deals might not have it yet

        if (!statusValid || !hasCurrentCost) {
          logger.info('Deal filtered out', {
            id: deal._id,
            status: deal.status,
            statusValid,
            currentUsd: deal.usage?.currentUsd,
            hasCurrentCost,
          });
        }
        return statusValid && hasCurrentCost;
      });

      logger.info('Filtered deals count', {
        filteredDealsCount: filteredDeals.length,
      });

      return filteredDeals
        .map((deal) => {
          // Convert screener data to PriceData format for unrealized PnL calculation
          // Use SYMBOLUSDT pairs and mark exchange as 'all' so it matches any deal exchange
          const latestPricesData: PriceData[] = [
            ...screenerCoins.map((coin) => ({
              symbol: `${(coin.symbol || '').toUpperCase()}USDT`,
              price: coin.currentPrice || 0,
              exchange: 'all',
            })),
            // Provide stable USDT/USD mapping to help USD rate resolution
            { symbol: 'USDTUSD', price: 1, exchange: 'all' },
            { symbol: 'USDUSDT', price: 1, exchange: 'all' },
          ];

          // Get USD rate
          const globalUsdRate = (usdRateData as { data?: number })?.data;

          // Calculate unrealized PnL using the same function as Trades page (unless provided via props)
          // Convert DCADeals to DealData format
          // Convert deal to DealData format for unrealized PnL calculation
          const dealForCalculation = {
            ...deal,
            // Prefer flattened exchange from hook to avoid nested dependency
            dcaBot: deal.exchange ? [{ exchange: deal.exchange }] : [],
          } as unknown as DCADeals;

          const metricKey = deal._id || deal.botId;
          const unrealizedPnL =
            externalDealMetrics?.[metricKey]?.unrealizedUsd ??
            calculateUnrealizedPnL(
              dealForCalculation,
              latestPricesData,
              globalUsdRate
            );

          // Calculate value percentage using unrealized PnL
          // Match Trades page denominator: usage.currentUsd fallback to usage.current.quote
          const currentCost =
            deal.usage?.currentUsd ?? deal.usage?.current?.quote ?? 0;
          let valuePercentage = 0;
          // If external metrics provided, prefer its percentage
          if (
            externalDealMetrics?.[metricKey] &&
            Number.isFinite(externalDealMetrics[metricKey].unrealizedPct)
          ) {
            valuePercentage = externalDealMetrics[metricKey].unrealizedPct;
          } else {
            if (unrealizedPnL !== undefined && currentCost > 0) {
              // Use unrealized PnL to calculate percentage
              valuePercentage = (unrealizedPnL / currentCost) * 100;
            } else {
              // Fallback to old calculation if unrealized PnL calculation fails
              const price =
                deal.avgPrice ||
                (deal.currentBalances?.quote && deal.currentBalances?.base
                  ? deal.currentBalances.quote / deal.currentBalances.base
                  : 0);
              const currentValue = (deal.currentBalances?.base || 0) * price;
              const fallbackDenominator =
                currentCost > 0
                  ? currentCost
                  : (deal.usage?.current?.quote ?? (currentValue || 1));
              const fallbackNumeratorBase =
                deal.usage?.currentUsd ??
                deal.usage?.current?.quote ??
                currentValue;
              valuePercentage =
                fallbackDenominator > 0
                  ? ((currentValue - fallbackNumeratorBase) /
                      fallbackDenominator) *
                    100
                  : 0;
            }
          }

          // Create unique name for each deal while preserving coin symbol for icon
          const baseSymbol = deal.symbol?.baseAsset || 'UNK';
          const botName = getDealBotName(deal);
          const dealIdShort = deal._id.slice(-6);

          // Create a unique display name that includes distinguishing info
          let uniqueName = baseSymbol;
          if (botName && botName !== baseSymbol) {
            // If bot has a custom name, append it
            uniqueName = `${baseSymbol}-${botName.slice(0, 8)}`;
          } else {
            // Otherwise use deal ID suffix for uniqueness
            uniqueName = `${baseSymbol}-${dealIdShort}`;
          }

          logger.info('Deal data', {
            id: deal._id,
            uniqueName,
            baseSymbol,
            currentCost,
            unrealizedPnL,
            valuePercentage,
          });

          return {
            name: uniqueName.toUpperCase(),
            symbol: baseSymbol.toUpperCase(), // Keep original symbol for coin icon
            displayName:
              deal.symbol?.symbol?.toUpperCase() || baseSymbol.toUpperCase(), // Clean trading pair for display
            size: Math.max(currentCost, 1), // Size based on current cost
            change24h: Number.isFinite(valuePercentage) ? valuePercentage : 0, // Color based on value %
          };
        })
        .sort((a, b) => b.size - a.size) // Sort by current cost (size)
        .slice(0, 50); // Limit to top 50 deals
    } else {
      // Portfolio mode: use portfolio data with improved matching
      return assets
        .map((a) => {
          const m = findBestScreenerMatch(a.name, screenerSymbolMap);
          return {
            name: a.name,
            symbol: a.name,
            size: Math.max(a.amountUsd, 1),
            change24h: Number.isFinite(m?.priceChangePercentage24h)
              ? (m?.priceChangePercentage24h ?? (0 as number))
              : 0,
          };
        })
        .sort((x, y) => y.size - x.size);
    }
  }, [
    scope,
    screenerCoins,
    screenerSymbolMap,
    assets,
    finalDcaDeals,
    usdRateData,
    externalDealMetrics,
    getDealBotName,
  ]);

  // Hover state combines screener coin + portfolio asset + deal
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const hoveredCoin = useMemo(() => {
    if (!hoveredSymbol) return null;
    // For deals, extract base symbol from unique name (format: "BTC-DealID" or "BTC-BotName")
    let symbolForLookup = hoveredSymbol;
    if (scope === 'deals' && hoveredSymbol.includes('-')) {
      symbolForLookup = hoveredSymbol.split('-')[0];
    }
    return findBestScreenerMatch(symbolForLookup, screenerSymbolMap);
  }, [screenerSymbolMap, hoveredSymbol, scope]);
  const hoveredAsset = useMemo(
    () => findPortfolioAssetBySymbol(hoveredSymbol || '', assets),
    [assets, hoveredSymbol]
  );
  const hoveredDeal = useMemo(() => {
    if (!hoveredSymbol || scope !== 'deals') return null;
    return finalDcaDeals.find((deal) => {
      // Recreate the unique name to match what was created in treeData
      const baseSymbol = deal.symbol?.baseAsset || 'UNK';
      const botName = getDealBotName(deal);
      const dealIdShort = deal._id.slice(-6);

      let uniqueName = baseSymbol;
      if (botName && botName !== baseSymbol) {
        uniqueName = `${baseSymbol}-${botName.slice(0, 8)}`;
      } else {
        uniqueName = `${baseSymbol}-${dealIdShort}`;
      }

      return uniqueName.toUpperCase() === hoveredSymbol.toUpperCase();
    });
  }, [finalDcaDeals, hoveredSymbol, scope, getDealBotName]);

  const popoverIconSymbol =
    scope === 'deals' && hoveredSymbol && hoveredSymbol.includes('-')
      ? hoveredSymbol.split('-')[0]
      : hoveredSymbol || '';

  const totalPortfolioUsd = assets.reduce(
    (sum, asset) => sum + asset.amountUsd,
    0
  );

  let hoveredAssetValueContent: React.ReactNode = '—';
  if (hoveredAsset) {
    if (privacyMode) {
      hoveredAssetValueContent = '***';
    } else {
      const val = hoveredAsset.amountUsd;
      const formatted =
        val >= 1e9
          ? `$${(val / 1e9).toFixed(2)}B`
          : val >= 1e6
            ? `$${(val / 1e6).toFixed(2)}M`
            : `$${val.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
      const pct = totalPortfolioUsd > 0 ? (val / totalPortfolioUsd) * 100 : 0;
      const pctStr = ` (${pct.toFixed(2)}%)`;
      hoveredAssetValueContent = (
        <>
          {formatted}
          <span className="text-muted-foreground">{pctStr}</span>
        </>
      );
    }
  }

  const hoveredDealMetricKey = hoveredDeal?._id || hoveredDeal?.botId || null;
  const hoveredDealMetrics = hoveredDealMetricKey
    ? externalDealMetrics?.[hoveredDealMetricKey]
    : undefined;
  const hoveredDealUnrealizedUsd = hoveredDealMetrics?.unrealizedUsd ?? 0;
  const hoveredDealUnrealizedPct = hoveredDealMetrics?.unrealizedPct ?? 0;
  const hoveredDealUnrealizedUsdClass =
    hoveredDealUnrealizedUsd >= 0 ? 'text-success' : 'text-destructive';
  const hoveredDealUnrealizedPctClass =
    hoveredDealUnrealizedPct >= 0 ? 'text-success' : 'text-destructive';

  const hoveredDealMetricsContent =
    hoveredDeal && hoveredDealMetricKey ? (
      <>
        <div className="bg-muted/30 rounded-lg p-sm">
          <span className="text-muted-foreground block mb-1">
            Unrealized PnL
          </span>
          <div className={`font-bold text-lg ${hoveredDealUnrealizedUsdClass}`}>
            {privacyMode
              ? '***'
              : `${hoveredDealUnrealizedUsd >= 0 ? '+' : '-'}$${Math.abs(
                  hoveredDealUnrealizedUsd
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
        </div>
        <div className="bg-muted/30 rounded-lg p-sm">
          <span className="text-muted-foreground block mb-1">Value %</span>
          <div className={`font-bold text-lg ${hoveredDealUnrealizedPctClass}`}>
            {privacyMode
              ? '***'
              : `${hoveredDealUnrealizedPct >= 0 ? '+' : ''}${hoveredDealUnrealizedPct.toFixed(2)}%`}
          </div>
        </div>
      </>
    ) : null;

  interface HoverPayload {
    containerRect: { width: number; height: number };
    pointerX: number;
    pointerY: number;
    targetRect: { x: number; y: number; width: number; height: number };
  }

  const handleCoinHover = useCallback(
    (
      coinOrSymbol: { coin: ScreenerCoinData | null; symbol: string } | null,
      payload?: HoverPayload
    ) => {
      if (!containerRef.current) return;
      if (
        coinOrSymbol &&
        payload &&
        typeof payload.pointerX === 'number' &&
        typeof payload.pointerY === 'number'
      ) {
        setHoveredSymbol(coinOrSymbol.symbol);

        const margin = 10;
        const container = containerRef.current;
        const { width: cW, height: cH } =
          payload.containerRect || container.getBoundingClientRect();
        const pW = popupSize.width;
        const pH = popupSize.height;

        let x = payload.pointerX + 12;
        let y = payload.pointerY + 12;

        if (x + pW > cW - margin) x = payload.pointerX - pW - 12;
        if (x < margin) x = margin;
        if (y + pH > cH - margin) y = payload.pointerY - pH - 12;
        if (y < margin) y = margin;

        setMousePosition({ x, y });
        setPopoverOpen(true);
      } else {
        setPopoverOpen(false);
        setHoveredSymbol(null);
      }
    },
    [popupSize.width, popupSize.height]
  );

  useLayoutEffect(() => {
    if (popupRef.current && popoverOpen) {
      const rect = popupRef.current.getBoundingClientRect();
      setPopupSize({ width: rect.width, height: rect.height });
    }
  }, [popoverOpen, hoveredSymbol]);

  const content = (
    <div
      className="w-full h-full relative"
      data-widget-container
      ref={containerRef}
    >
      {treeData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <RechartsTreemap
            data={treeData}
            dataKey="size"
            nameKey="name"
            stroke="var(--color-border)"
            content={(nodeProps) => (
              <NodeContent
                {...nodeProps}
                onHover={handleCoinHover}
                screenerSymbolMap={screenerSymbolMap}
              />
            )}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isScreenerLoading
            ? 'Loading data...'
            : screenerError
              ? 'Failed to load data.'
              : scope === 'portfolio'
                ? 'No portfolio assets available.'
                : scope === 'deals'
                  ? 'No active deals available.'
                  : 'No market data available.'}
        </div>
      )}

      {popoverOpen && hoveredSymbol && (
        <div
          className="absolute z-20 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-200"
          style={{ left: mousePosition.x, top: mousePosition.y }}
          ref={popupRef}
        >
          <div className="max-w-sm bg-background/98 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-md ring-1 ring-black/5">
            <div className="flex items-center gap-sm mb-3">
              <CoinIcon symbol={popoverIconSymbol} size="lg" />
              <div>
                <h3 className="text-xl font-bold text-card-foreground">
                  {scope === 'deals' && hoveredDeal
                    ? hoveredDeal.symbol.symbol
                    : hoveredSymbol.toUpperCase()}
                </h3>
                {hoveredCoin && (
                  <div className="text-lg font-semibold text-muted-foreground">
                    $
                    {hoveredCoin.currentPrice < 0.001
                      ? hoveredCoin.currentPrice.toFixed(8)
                      : hoveredCoin.currentPrice < 1
                        ? hoveredCoin.currentPrice.toFixed(5)
                        : hoveredCoin.currentPrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-sm text-sm">
              {scope === 'portfolio' && (
                <>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Holding Value
                    </span>
                    <div className="font-semibold text-card-foreground">
                      {hoveredAssetValueContent}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Amount
                    </span>
                    <div className="font-semibold text-card-foreground">
                      {hoveredAsset
                        ? hoveredAsset.amount < 0.001
                          ? hoveredAsset.amount.toFixed(8)
                          : hoveredAsset.amount < 1
                            ? hoveredAsset.amount.toFixed(6)
                            : hoveredAsset.amount < 100
                              ? hoveredAsset.amount.toFixed(4)
                              : hoveredAsset.amount.toFixed(2)
                        : '—'}
                    </div>
                  </div>
                </>
              )}
              {scope === 'deals' && hoveredDeal && (
                <>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Bot Name
                    </span>
                    <div className="font-semibold text-card-foreground">
                      {getDealBotName(hoveredDeal) || 'Unnamed Bot'}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Current Cost
                    </span>
                    <div className="font-semibold text-card-foreground">
                      $
                      {hoveredDeal.usage?.currentUsd?.toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      ) || '0.00'}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Exchange
                    </span>
                    <div className="flex items-center">
                      <ExchangeChip
                        exchangeId={hoveredDeal.exchange || ''}
                        size="sm"
                        chipStyle="soft"
                      />
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-sm">
                    <span className="text-muted-foreground block mb-1">
                      Bot Type
                    </span>
                    <div className="flex items-center">
                      <BotTypeChip
                        botType={BotTypesEnum.dca}
                        size="sm"
                        chipStyle="soft"
                      />
                    </div>
                  </div>
                  {hoveredDealMetricsContent}
                </>
              )}
              {scope !== 'deals' && (
                <div className="bg-muted/30 rounded-lg p-sm">
                  <span className="text-muted-foreground block mb-1">
                    24h Change
                  </span>
                  <div
                    className={`font-bold text-lg ${hoveredCoin && hoveredCoin.priceChangePercentage24h >= 0 ? 'text-success' : 'text-destructive'}`}
                  >
                    {hoveredCoin
                      ? `${hoveredCoin.priceChangePercentage24h >= 0 ? '+' : ''}${hoveredCoin.priceChangePercentage24h.toFixed(2)}%`
                      : '—'}
                  </div>
                </div>
              )}
              {scope !== 'deals' && (
                <div className="bg-muted/30 rounded-lg p-sm">
                  <span className="text-muted-foreground block mb-1">
                    {scope === 'market' ? 'Market Cap' : 'Volume 24h'}
                  </span>
                  <div className="font-semibold text-card-foreground">
                    {hoveredCoin
                      ? scope === 'market'
                        ? hoveredCoin.marketCap >= 1e12
                          ? `$${(hoveredCoin.marketCap / 1e12).toFixed(2)}T`
                          : hoveredCoin.marketCap >= 1e9
                            ? `$${(hoveredCoin.marketCap / 1e9).toFixed(2)}B`
                            : hoveredCoin.marketCap >= 1e6
                              ? `$${(hoveredCoin.marketCap / 1e6).toFixed(2)}M`
                              : `$${hoveredCoin.marketCap.toLocaleString()}`
                        : hoveredCoin.totalVolume >= 1e12
                          ? `$${(hoveredCoin.totalVolume / 1e12).toFixed(2)}T`
                          : hoveredCoin.totalVolume >= 1e9
                            ? `$${(hoveredCoin.totalVolume / 1e9).toFixed(2)}B`
                            : hoveredCoin.totalVolume >= 1e6
                              ? `$${(hoveredCoin.totalVolume / 1e6).toFixed(2)}M`
                              : `$${hoveredCoin.totalVolume.toLocaleString()}`
                      : '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Exchange filter logic and UI (only for portfolio scope)
  const handleExchangeToggle = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      if (selectedExchanges.includes('ALL') && selectedExchanges.length === 1)
        return;
      setSelectedExchanges(['ALL']);
      return;
    }
    if (selectedExchanges.includes(exchangeId)) {
      const next = selectedExchanges.filter((e) => e !== exchangeId);
      setSelectedExchanges(next.length === 0 ? ['ALL'] : next);
    } else {
      const next = selectedExchanges.filter((e) => e !== 'ALL');
      setSelectedExchanges([...next, exchangeId]);
    }
  };

  const handleRemoveExchange = (exchangeId: string) => {
    if (exchangeId === 'ALL' && selectedExchanges.length === 1) return;
    const next = selectedExchanges.filter((e) => e !== exchangeId);
    setSelectedExchanges(next.length === 0 ? ['ALL'] : next);
  };

  const exchangeFilterItems: FilterItem[] = exchanges
    .filter((exchange) => exchange.id !== 'ALL')
    .map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
      icon: exchange.icon,
      color: exchange.color || '#64748b',
      isExchange: true,
    }));

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
        symbol: exchange.id,
        name: exchange.name,
        icon: exchange.icon,
        color: exchange.color || '#64748b',
        subtitle: exchange.provider,
        balance: exchange.balance,
        isExchange: true,
      })),
  ];

  const filtersActive =
    !selectedExchanges.includes('ALL') || selectedExchanges.length > 1;
  const clearAllFilters = () => setSelectedExchanges(['ALL']);

  const filterContent =
    scope === 'portfolio' ? (
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
    ) : null;

  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: widgetType,
      title,
      displayName: title,
      hasOptions: true,
      hasFilters: scope === 'portfolio',
      ...(scope === 'portfolio' && {
        filterContent,
        filtersActive,
        onClearFilters: clearAllFilters,
      }),
    },
    isEditable: isEditable ?? false,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    menuActions: {
      ...menuActions,
      onOptions: () => setShowOptionsDialog(true),
    },
    // Centralized options modal props
    showOptionsDialog,
    onCloseOptionsDialog: () => setShowOptionsDialog(false),
    optionsTitle: `${title} Options`,
    renderOptionsContent: () => (
      <div className="space-y-md">
        {/* Period Selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Period
          </label>
          <Select
            value={period}
            onValueChange={(v) =>
              setPeriod(v as TreemapBaseSettings['period'])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1 Min">1 Min</SelectItem>
              <SelectItem value="5 Min">5 Min</SelectItem>
              <SelectItem value="15 Min">15 Min</SelectItem>
              <SelectItem value="Hour">Hour</SelectItem>
              <SelectItem value="4 Hours">4 Hours</SelectItem>
              <SelectItem value="Day">Day</SelectItem>
              <SelectItem value="Week">Week</SelectItem>
              <SelectItem value="Month">Month</SelectItem>
              <SelectItem value="3 Months">3 Months</SelectItem>
              <SelectItem value="Year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bubble Size */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Bubble Size
          </label>
          <Select
            value={bubbleSize}
            onValueChange={(v) =>
              setBubbleSize(v as TreemapBaseSettings['bubbleSize'])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Performance">Performance</SelectItem>
              <SelectItem value="Rank">Rank</SelectItem>
              <SelectItem value="Market Cap">Market Cap</SelectItem>
              <SelectItem value="24h Volume">24h Volume</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bubble Content */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Bubble Content
          </label>
          <Select
            value={bubbleContent}
            onValueChange={(v) =>
              setBubbleContent(v as TreemapBaseSettings['bubbleContent'])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Performance">Performance</SelectItem>
              <SelectItem value="Rank">Rank</SelectItem>
              <SelectItem value="Market Cap">Market Cap</SelectItem>
              <SelectItem value="24h Volume">24h Volume</SelectItem>
              <SelectItem value="Price">Price</SelectItem>
              <SelectItem value="Name">Name</SelectItem>
              <SelectItem value="Dominance">Dominance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bubble Color */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Bubble Color
          </label>
          <Select
            value={bubbleColor}
            onValueChange={(v) =>
              setBubbleColor(v as TreemapBaseSettings['bubbleColor'])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Performance">Performance</SelectItem>
              <SelectItem value="Rank">Rank</SelectItem>
              <SelectItem value="Neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    ),
    cacheQueries:
      scope === 'portfolio'
        ? [
            {
              queryKey: 'getPortfolioByUser',
              variables: {} as Record<string, unknown>,
            },
            {
              queryKey: 'getUsdRate',
              variables: {} as Record<string, unknown>,
            },
          ]
        : [],
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default TreemapBase;
