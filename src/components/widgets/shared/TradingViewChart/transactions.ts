import { logger } from '@/lib/loggerInstance';
import { getCSSVar } from '@/lib/utils/chart';
import type {
  ChartInstance,
  TradingViewWidgetInstance,
  TransactionExtended,
} from './types';

export function normalizeTimeToSeconds(time: number): number {
  if (time >= 1e15) return Math.floor(time / 1_000_000); // microseconds -> s
  if (time >= 1e12) return Math.floor(time / 1_000); // ms -> s
  return Math.floor(time); // seconds
}

export function addTransactionInternal(
  widget: TradingViewWidgetInstance,
  isChartReady: boolean,
  raw: unknown,
  registerEntities: (id: string, entities: unknown[]) => void
): string | null {
  if (!widget || !isChartReady) {
    logger.warn('Cannot add transaction: chart not ready');
    return null;
  }

  const tr = raw as TransactionExtended;
  const timeInSeconds = normalizeTimeToSeconds(tr.time);

  try {
    if (typeof widget['chart'] !== 'function') return null;
    const chart = widget['chart']() as ChartInstance & {
      createMultipointShape?: (
        points: Array<{ time: number; price: number }>,
        options: Record<string, unknown>
      ) => unknown;
      getVisiblePriceRange?: () => { from?: number; to?: number } | null;
    };
    if (!chart || (!chart.createShape && !chart['createMultipointShape']))
      return null;
    try {
      // Try to get visible price range - will fail if chart internals aren't ready
      const priceRange = chart['getVisiblePriceRange']?.();
      const hasPriceRange =
        priceRange &&
        priceRange.from !== undefined &&
        priceRange.to !== undefined;

      if (!hasPriceRange) {
        logger.debug('Chart data not ready for order line creation', {
          hasPriceRange,
        });
        return null;
      }
    } catch (readinessError) {
      logger.debug('Chart readiness check failed', {
        error:
          readinessError instanceof Error
            ? readinessError.message
            : String(readinessError),
      });
      return null;
    }
    const side = tr.side?.toString().toLowerCase().trim();
    const isBuy = side === 'buy' || side === 'long';
    const entities: unknown[] = [];

    if (
      tr.isCompletedTrade === true &&
      tr.entryTime != null &&
      tr.exitTime != null &&
      tr.entryPrice != null &&
      tr.exitPrice != null &&
      typeof chart.createMultipointShape === 'function'
    ) {
      const entryTimeSeconds = tr.entryTime / 1000;
      const exitTimeSeconds = tr.exitTime / 1000;
      const entryPrice = tr.entryPrice;
      const exitPrice = tr.exitPrice;
      const pnlPercentExternal =
        typeof tr.pnlPercent === 'number' ? tr.pnlPercent : undefined;
      const isLong = isBuy;
      const isProfitable =
        pnlPercentExternal != null
          ? pnlPercentExternal >= 0
          : isLong
            ? exitPrice > entryPrice
            : exitPrice < entryPrice;
      const profitColor = '#00ff00';
      const lossColor = '#ff0040';
      const lineColor = isProfitable ? profitColor : lossColor;

      const lineEntity = chart.createMultipointShape?.(
        [
          { time: entryTimeSeconds, price: entryPrice },
          { time: exitTimeSeconds, price: exitPrice },
        ],
        {
          disableSave: true,
          shape: 'trend_line',
          lock: true,
          disableSelection: true,
          zOrder: 'top',
          overrides: { linecolor: lineColor, linewidth: 3, linestyle: 1 },
        }
      );

      const areaZOrder = 'bottom';
      const fillOpacity = 85;
      const greenFill = '#00ff00';
      const redFill = '#ff0040';

      const createRect = (p1: number, p2: number, color: string) => {
        try {
          const y1 = Math.min(p1, p2);
          const y2 = Math.max(p1, p2);
          const rectEntity = chart.createMultipointShape?.(
            [
              { time: entryTimeSeconds, price: y1 },
              { time: exitTimeSeconds, price: y2 },
            ],
            {
              disableSave: true,
              shape: 'rectangle',
              lock: true,
              disableSelection: true,
              zOrder: areaZOrder,
              overrides: {
                backgroundColor: color,
                transparency: fillOpacity,
                linewidth: 0,
                linecolor: color,
              },
            }
          );
          if (rectEntity) entities.push(rectEntity);
        } catch (e) {
          logger.warn('Failed creating rectangle area:', e);
        }
      };

      // Use original TP/SL values if available (before any modifications)
      // This ensures boxes show the original risk/reward areas even if SL was trailed
      if (tr.takeProfitTargets?.length) {
        const lastTPTarget = isLong
          ? tr.takeProfitTargets.reduce((max, t) =>
              t.price > max.price ? t : max
            )
          : tr.takeProfitTargets.reduce((min, t) =>
              t.price < min.price ? t : min
            );
        const tpPrice =
          typeof tr.originalTakeProfit === 'number' && tr.originalTakeProfit > 0
            ? tr.originalTakeProfit
            : lastTPTarget.price;
        createRect(entryPrice, tpPrice, greenFill);
      }
      const slPrice =
        typeof tr.originalStopLoss === 'number' && tr.originalStopLoss > 0
          ? tr.originalStopLoss
          : tr.stopLoss;
      if (typeof slPrice === 'number' && slPrice > 0) {
        createRect(entryPrice, slPrice, redFill);
      }

      try {
        const entryLineEntity = chart.createMultipointShape?.(
          [
            { time: entryTimeSeconds, price: entryPrice },
            { time: exitTimeSeconds, price: entryPrice },
          ],
          {
            disableSave: true,
            shape: 'trend_line',
            lock: true,
            disableSelection: true,
            zOrder: 'top',
            overrides: { linecolor: '#ffffff', linewidth: 1, linestyle: 1 },
          }
        );
        if (entryLineEntity) entities.push(entryLineEntity);
      } catch (e) {
        logger.warn('Failed creating entry line:', e);
      }

      if (tr.tradeNumber && chart.createShape) {
        try {
          const middleTime =
            entryTimeSeconds + (exitTimeSeconds - entryTimeSeconds) / 2;
          const pnlPercent =
            typeof tr.pnlPercent === 'number' ? tr.pnlPercent : undefined;
          const pnlFormatted =
            pnlPercent != null ? pnlPercent.toFixed(2) : null;
          const rrRatio =
            typeof tr.rrRatio === 'number' ? tr.rrRatio.toFixed(2) : null;
          let commentText = `#${tr.tradeNumber}`;
          if (pnlFormatted != null) commentText += `\nPnL: ${pnlFormatted}%`;
          if (rrRatio) commentText += `\nR:R: ${rrRatio}`;
          const tradeNumberLabel = chart.createShape(
            { time: middleTime, price: entryPrice },
            {
              disableSave: true,
              shape: 'comment',
              lock: true,
              disableSelection: true,
              zOrder: 'top',
              text: commentText,
              overrides: {
                color: getCSSVar('--color-foreground', '#ffffff'),
                fontsize: 12,
                bold: true,
                backgroundColor: getCSSVar('--color-background', '#000000'),
                backgroundTransparency: 75,
                borderColor: 'transparent',
                linewidth: 0,
              },
            }
          );
          if (tradeNumberLabel) entities.push(tradeNumberLabel);
        } catch (e) {
          logger.warn('Failed creating trade number label:', e);
        }
      }

      if (lineEntity) entities.push(lineEntity);

      if (chart.createShape) {
        const entryIcon = chart.createShape(
          { time: entryTimeSeconds, price: entryPrice },
          {
            disableSave: true,
            shape: isBuy ? 'arrow_up' : 'arrow_down',
            lock: true,
            disableSelection: true,
            zOrder: 'top',
            overrides: { color: isBuy ? '#00ff00' : '#ff0040', linewidth: 3 },
          }
        );
        if (entryIcon) entities.push(entryIcon);
        const exitIcon = chart.createShape(
          { time: exitTimeSeconds, price: exitPrice },
          {
            disableSave: true,
            shape: isBuy ? 'arrow_down' : 'arrow_up',
            lock: true,
            disableSelection: true,
            zOrder: 'top',
            overrides: { color: isBuy ? '#ff0040' : '#00ff00', linewidth: 3 },
          }
        );
        if (exitIcon) entities.push(exitIcon);
      }
    } else if (chart.createShape) {
      const entity = chart.createShape(
        { time: timeInSeconds, price: tr.price },
        {
          disableSave: true,
          shape: 'icon',
          lock: true,
          disableSelection: true,
          zOrder: 'top',
          overrides: {
            icon: 0xf01d,
            angle: isBuy ? 45 : 90,
            color: isBuy ? '#00ff00' : '#ff0040',
            linewidth: 3,
            size: 20,
          },
        }
      );
      if (entity) entities.push(entity);
    }

    if (entities.length) {
      registerEntities(tr.id, entities);
      tr.entity = entities[0];
      return tr.id;
    }
    return null;
  } catch (error) {
    logger.error('Error adding transaction to chart:', error);
    return null;
  }
}

export function clearTransactionsInternal(
  widget: TradingViewWidgetInstance | null,
  isChartReady: boolean,
  all: Map<string, unknown>
) {
  if (!widget || !isChartReady) return;
  try {
    if (typeof widget['chart'] !== 'function') return;
    const chart = widget['chart']() as ChartInstance;
    if (!chart.removeEntity) return;
    for (const [_id, entityOrEntities] of all.entries()) {
      const entities = Array.isArray(entityOrEntities)
        ? entityOrEntities
        : [entityOrEntities];
      entities.forEach((e) => {
        try {
          chart.removeEntity?.(e);
        } catch (err) {
          logger.warn('Transaction entity removal failed:', err);
        }
      });
    }
    all.clear();
  } catch (error) {
    logger.error('Error clearing transactions:', error);
  }
}
