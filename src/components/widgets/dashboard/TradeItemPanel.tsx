/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrategyChip } from '@/components/ui/chip';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import { formatQuoteAmount } from '@/utils/formatters';
import { extractPairAssets } from '@/utils/pairs';
import React, { useMemo } from 'react';

interface TradeItemPanelProps {
  trade: any;
  onClick?: (trade?: any) => void;
  privacyMode?: boolean;
  displayBotName?: string | undefined;
}

const TradeItemPanel: React.FC<TradeItemPanelProps> = ({
  trade,
  onClick,
  privacyMode = false,
  displayBotName: displayBotNameProp,
}) => {
  const { format, holding, toReporting } = useReportingCurrency();
  // Robust numeric extractor
  const extractNumeric = (val: any): number => {
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
    if (typeof val === 'string' && !isNaN(Number(val))) return Number(val);
    return 0;
  };

  // Resolve symbol/base/quote robustly
  let baseAsset: string | undefined = undefined;
  let quoteAsset: string | undefined = undefined;

  if (typeof trade?.symbol === 'string') {
    const { baseAsset: b, quoteAsset: q } = extractPairAssets(trade.symbol);
    baseAsset = b;
    quoteAsset = q;
  } else if (trade?.symbol && typeof trade.symbol === 'object') {
    baseAsset = trade.symbol.baseAsset || trade.symbol.base || undefined;
    quoteAsset = trade.symbol.quoteAsset || trade.symbol.quote || undefined;
  }

  // Amount (token) - prefer usage.current.base, fallbacks; try to derive from quote/price
  const amount = useMemo(() => {
    // DEV ONLY: Log the trade object structure to diagnose zero amounts

    const usageBase = trade?.usage?.current?.base;
    if (usageBase !== undefined && usageBase !== null) {
      const extracted = extractNumeric(usageBase);
      if (extracted > 0) return extracted;
    }

    // Check common flattened fields
    const qty = extractNumeric(
      trade.origQty ??
        trade.qty ??
        trade.amount ??
        trade.quantity ??
        trade.baseAmount
    );
    if (qty && qty > 0) return qty;

    // Try current balances that may include base amount
    const cb = trade?.currentBalances?.base ?? trade?.currentBalance?.base;
    if (cb !== undefined && cb !== null) {
      const extracted = extractNumeric(cb);
      if (extracted > 0) return extracted;
    }

    // Try initial balances for original purchase amount
    const ib = trade?.initialBalances?.base ?? trade?.initialBalance?.base;
    if (ib !== undefined && ib !== null) {
      const extracted = extractNumeric(ib);
      if (extracted > 0) return extracted;
    }

    // Try deriving from usage.current.quote and price
    const usageQuote =
      trade?.usage?.current?.quote ?? trade?.usage?.current?.quoteAmount;
    const price = extractNumeric(
      trade.price ?? trade.avgPrice ?? trade.closePrice ?? trade.initialPrice
    );
    if (usageQuote !== undefined && price > 0) {
      const q = extractNumeric(usageQuote) / price;
      if (q && q > 0) return q;
    }

    // Try deriving from currentBalances.quote and price
    const currentQuote = trade?.currentBalances?.quote;
    if (currentQuote !== undefined && price > 0) {
      const q = extractNumeric(currentQuote) / price;
      if (q && q > 0) return q;
    }

    return 0;
  }, [trade]);

  // Value: usage.currentUsd in the reporting currency; without it, the
  // usage.current.quote / amount*price fallbacks are quote amounts.
  const valueText = useMemo(() => {
    const uUsd = trade?.usage?.currentUsd;
    const uQuote = trade?.usage?.current?.quote;
    if (uUsd !== undefined && uUsd !== null)
      return format(
        uQuote !== undefined && uQuote !== null
          ? holding(quoteAsset, extractNumeric(uQuote), extractNumeric(uUsd))
          : toReporting(extractNumeric(uUsd))
      );
    if (uQuote !== undefined && uQuote !== null)
      return formatQuoteAmount(extractNumeric(uQuote), quoteAsset);
    const p = extractNumeric(trade.price ?? trade.avgPrice ?? trade.closePrice);
    return formatQuoteAmount(amount && p ? amount * p : 0, quoteAsset);
  }, [trade, amount, quoteAsset, format, holding, toReporting]);

  const timeAgo = useMemo(() => {
    const ts = trade.updateTime ?? trade.createTime ?? trade.timestamp ?? 0;
    const t = typeof ts === 'number' ? ts : Date.parse(String(ts));
    if (!t || Number.isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [trade]);

  const strategy = Array.isArray(trade.strategy)
    ? trade.strategy[0]
    : typeof trade.strategy === 'string'
      ? trade.strategy
      : trade.type || '';

  // Prefer human-readable bot name consistent with other components
  const getDealBotName = (t: any) => {
    if (!t) return '';
    return (
      t.botName ||
      t.dcaBot?.settings?.name ||
      t.comboBot?.settings?.name ||
      t.gridBot?.settings?.name ||
      t.hedgeDcaBot?.settings?.name ||
      t.hedgeComboBot?.settings?.name ||
      t.bot?.settings?.name ||
      t.bot?.name ||
      ''
    );
  };

  // Allow caller to override resolved bot name (TradingPanel passes a resolved value)
  const finalDisplayName =
    displayBotNameProp ||
    (typeof (trade as any).displayName === 'string' &&
      (trade as any).displayName) ||
    (typeof (trade as any).displayBotName === 'string' &&
      (trade as any).displayBotName) ||
    getDealBotName(trade) ||
    (trade.botId ? `Bot ${String(trade.botId).slice(-6)}` : 'Unknown');

  // Dev-only logging to help diagnose bad data shapes (non-production)
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      if (!finalDisplayName || finalDisplayName.startsWith('Bot ')) {
        Promise.resolve().then(() => {
          // Defer logging to avoid blocking render
          // Use logger when available
          try {
            // Import logger lazily to avoid bundle churn in prod builds

            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { logger } = require('@/lib/loggerInstance');
            logger.debug('[TradeItemPanel] Dev debug', {
              tradeId: trade?._id || trade?.id,
              botId: trade?.botId,
              botName: trade?.botName,
              usage: trade?.usage,
              origQty:
                trade?.origQty ??
                trade?.qty ??
                trade?.amount ??
                trade?.quantity,
              price: trade?.price ?? trade?.avgPrice ?? trade?.closePrice,
              computedAmount: amount,
              finalDisplayName,
            });
          } catch {
            // ignore logging errors in dev
          }
        });
      }
    }
  }, [trade, amount, finalDisplayName]);

  return (
    <button
      onClick={() => onClick?.(trade)}
      className="w-full text-left p-xs rounded-lg bg-inner-container hover:bg-primary-foreground/5 transition-colors"
    >
      <div className="flex items-center justify-between gap-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-sm min-w-0">
              <CoinPair
                baseAsset={baseAsset}
                quoteAsset={quoteAsset}
                iconSize="sm"
                showText={false}
              />
              {strategy ? (
                <StrategyChip strategy={String(strategy)} size="xs" iconOnly />
              ) : null}
            </div>

            <div className="text-right">
              <div className="text-sm font-medium text-card-foreground">
                {privacyMode
                  ? '***'
                  : `${amount < 1 ? amount.toFixed(6) : amount.toFixed(2)} ${
                      baseAsset || ''
                    }`}
              </div>
              <div className="text-xs text-muted-foreground">
                {privacyMode ? '***' : valueText}
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm text-primary-foreground/80 truncate">
              {finalDisplayName}
            </div>
            <div className="text-xs text-muted-foreground">{timeAgo}</div>
          </div>
        </div>
      </div>
    </button>
  );
};

export default TradeItemPanel;
