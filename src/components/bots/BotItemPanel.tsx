/* eslint-disable @typescript-eslint/no-explicit-any */
import { BotTypeChip, StatusChip } from '@/components/ui/chip';
import { ExchangeChip } from '@/components/ui/chip/ExchangeChip';
import { ProfitAndPerc } from '@/components/ui/chip/ProfitAndPerc';
import { StrategyChip as StrategyChipDirect } from '@/components/ui/chip/StrategyChip';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { useResolvePairAsset } from '@/hooks/useResolvePairAsset';
import { logger } from '@/lib/loggerInstance';
import { cn } from '@/lib/utils';
import type { BotTypesEnum } from '@/types';
import { Star } from 'lucide-react';
import React from 'react';

const PREFIX = 'BotItemPanel';

interface BotItemPanelProps {
  bot: any;
  botType: BotTypesEnum;
  privacyMode?: boolean;
  onClick?: (bot: any) => void;
  onStarToggle?: (botId: string) => void;
  isStarred?: boolean;
  className?: string;
}

export const BotItemPanel: React.FC<BotItemPanelProps> = ({
  bot,
  botType,
  privacyMode = false,
  onClick,
  onStarToggle,
  isStarred = false,
  className,
}) => {
  const resolvePairAsset = useResolvePairAsset();
  const name =
    bot?.settings?.name ||
    bot?.name ||
    bot?.botName ||
    bot?._id?.slice(-8) ||
    'Bot';

  // Debug logging for missing exchange/pair data
  React.useEffect(() => {
    if (!bot?.exchangeUUID && !bot?.exchange) {
      logger.warn(`[${PREFIX}] Bot missing exchange data`, {
        botId: bot?._id,
        botName: name,
        bot: {
          exchange: bot?.exchange,
          exchangeUUID: bot?.exchangeUUID,
          symbol: bot?.symbol,
          baseAsset: bot?.baseAsset,
          quoteAsset: bot?.quoteAsset,
        },
      });
    }
  }, [bot, name]);

  // Use passed botType prop, or fall back to bot data
  const finalBotType = botType;

  // Robust numeric extractor mirroring TradingPanel behavior
  function extractNumeric(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    if (typeof val.value === 'number') return val.value;
    if (typeof val.totalUsd === 'number') return val.totalUsd;
    if (typeof val.total === 'number') return val.total;
    if (val?.value && typeof val.value === 'number') return val.value;
    if (val?.value && typeof val.value.totalUsd === 'number')
      return val.value.totalUsd;
    if (typeof val.value === 'string' && !isNaN(Number(val.value)))
      return Number(val.value);
    if (typeof val.totalUsd === 'string' && !isNaN(Number(val.totalUsd)))
      return Number(val.totalUsd);
    if (typeof val.total === 'string' && !isNaN(Number(val.total)))
      return Number(val.total);
    return 0;
  }

  const profit = extractNumeric(
    bot.profit ??
      bot.profitUsd ??
      bot.unrealizedPnl ??
      bot.unrealizedPnlUsd ??
      0
  );

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStarToggle && bot._id) {
      onStarToggle(bot._id);
    }
  };

  // Extract base/quote assets from bot data
  const baseAsset = React.useMemo(() => {
    // Try direct bot properties first
    if (bot?.baseAsset) return bot.baseAsset;
    // Try symbol array
    if (Array.isArray(bot?.symbol) && bot.symbol[0]?.value?.baseAsset) {
      return bot.symbol[0].value.baseAsset;
    }
    return undefined;
  }, [bot?.baseAsset, bot?.symbol]);

  const quoteAsset = React.useMemo(() => {
    // Try direct bot properties first
    if (bot?.quoteAsset) return bot.quoteAsset;
    // Try symbol array
    if (Array.isArray(bot?.symbol) && bot.symbol[0]?.value?.quoteAsset) {
      return bot.symbol[0].value.quoteAsset;
    }
    return undefined;
  }, [bot?.quoteAsset, bot?.symbol]);

  // Compute a safe pair string when base/quote assets are not provided
  const computedPair: string | undefined = React.useMemo(() => {
    const sym = typeof bot?.symbol === 'string' ? bot.symbol : undefined;
    const coinPair =
      typeof bot?.coinPair === 'string' ? bot.coinPair : undefined;

    if (
      bot?.pair &&
      typeof bot.pair === 'string' &&
      bot.pair.includes('pairs')
    ) {
      if (sym && sym.includes('USDT')) return sym.replace('USDT', '/USDT');
      if (sym) return `${sym}/USDT`;
      return coinPair || bot.pair;
    }

    if (sym) {
      return sym.includes('USDT')
        ? sym.replace('USDT', '/USDT')
        : coinPair || `${sym}/USDT`;
    }

    // Fall back to top-level base/quote pair values if present
    if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;

    return coinPair || bot?.pair;
  }, [bot?.symbol, bot?.coinPair, bot?.pair, baseAsset, quoteAsset]);

  // Resolve asset class + venue so tokenized-stock pairs show their real logo.
  // Fall back to the computed "BASE/QUOTE" string when base/quote aren't set.
  const panelBaseAsset =
    baseAsset ??
    (typeof computedPair === 'string' && computedPair.includes('/')
      ? computedPair.split('/')[0]
      : undefined);
  const panelQuoteAsset =
    quoteAsset ??
    (typeof computedPair === 'string' && computedPair.includes('/')
      ? computedPair.split('/')[1]
      : undefined);
  const stockMeta = resolvePairAsset(
    bot?.exchange,
    panelBaseAsset,
    panelQuoteAsset
  );

  return (
    <button
      onClick={() => onClick?.(bot)}
      className={`w-full text-left p-xs rounded-lg bg-inner-container hover:bg-primary-foreground/5 transition-colors ${className || ''}`}
    >
      <div className="flex items-center justify-between gap-sm">
        <div className="flex items-center gap-xs min-w-0">
          <BotTypeChip
            botType={finalBotType}
            size="xs"
            chipStyle="solid"
            iconOnly
          />
          <div className="text-sm font-medium truncate">{name}</div>
          <StatusChip
            status={bot.status || 'inactive'}
            size="xs"
            dotOnly
            className="ml-1"
          />
        </div>
        {onStarToggle && (
          <div
            onClick={handleStarClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStarClick(e as any);
              }
            }}
            className="shrink-0 p-1 hover:bg-primary-foreground/10 rounded transition-colors cursor-pointer"
          >
            <Star
              size={14}
              className={cn(
                'transition-colors',
                isStarred
                  ? 'text-yellow-500 fill-yellow-500'
                  : 'text-muted-foreground hover:text-yellow-500'
              )}
            />
          </div>
        )}
      </div>

      <div className="mt-1">
        <div className="flex items-center justify-between">
          {/* Bot type removed from secondary row (kept in header) */}

          <div className="flex items-center gap-sm flex-1 min-w-0">
            <ExchangeChip
              exchangeId={bot?.exchangeUUID || bot?.exchange || ''}
              size="xs"
              chipStyle="ghost"
              layout="stacked"
              className="min-w-0"
            />

            <div className="min-w-0 flex items-center gap-xs">
              <CoinPair
                {...(!baseAsset && {
                  pair: computedPair,
                })}
                baseAsset={baseAsset}
                quoteAsset={quoteAsset}
                symbols={bot.symbols || []}
                assetClass={stockMeta.assetClass}
                exchange={stockMeta.exchange}
                maxDisplay={1}
                iconSize="sm"
                showText={false}
                className="text-sm font-medium text-muted-foreground"
              />
              {bot.strategy && (
                <StrategyChipDirect
                  strategy={bot.strategy}
                  size="xs"
                  chipStyle="solid"
                />
              )}
            </div>

            <div className="shrink-0">
              <ProfitAndPerc
                value={profit}
                percentage={0}
                privacyMode={privacyMode}
                hidePercentage={true}
                size="xs"
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

export default BotItemPanel;
