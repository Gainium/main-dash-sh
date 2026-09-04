import { logger } from '@/lib/loggerInstance';
import { getCSSVar } from '@/lib/utils/chart';
import type { ChartOrderLine } from '@/types';
import type { OrderLineInstance, TradingViewWidgetInstance } from './types';

interface ExtendedOrderLineInstance extends OrderLineInstance {
  setLineWidth?: (w: number) => void;
  setLineColor?: (c: string) => void;
  setCancellable?: (c: boolean) => void;
}

export function createOrderLine(
  widget: TradingViewWidgetInstance,
  order: ChartOrderLine,
  onRegister: (id: string, instance: OrderLineInstance) => void
): string | null {
  try {
    if (typeof widget['chart'] !== 'function') return null;
    const chart = widget['chart']();
    if (!chart || typeof chart['createOrderLine'] !== 'function') return null;

    // Check if chart data is ready before creating order line
    // This prevents "Value is null" errors from TradingView's _createTradingPrimitive
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
          order: { price: order.price, side: order.side, qty: order.qty },
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

    const orderLine = chart['createOrderLine']() as OrderLineInstance;

    const lineId = `order_${Date.now()}_${Math.random()}`;

    // Register IMMEDIATELY so clearAllOrderLines can always clean up,
    // even if configuration below throws.
    onRegister(lineId, orderLine);

    const profitColor = getCSSVar('--color-profit', '#22c55e');
    const lossColor = getCSSVar('--color-loss', '#ef4444');

    const normalizedSide = order.side?.toUpperCase() ?? '';
    const greyColor = getCSSVar('--color-muted-foreground', '#94a3b8');

    // Determine if this is a grey/smart order: either explicit GREY side or
    // color override (redesign passes color='#94a3b8' instead of side='GREY')
    const isGrey =
      normalizedSide === 'GREY' ||
      normalizedSide === 'NEUTRAL' ||
      Boolean(order.color);

    const baseColor = order.color
      ? order.color
      : normalizedSide === 'BUY' || normalizedSide === 'LONG'
        ? profitColor
        : isGrey
          ? greyColor
          : lossColor;

    // Match main-dash styling: colored line + colored text + transparent body
    const lineColor = baseColor;
    orderLine['setPrice']?.(order.price);
    (orderLine as ExtendedOrderLineInstance).setLineColor?.(lineColor);
    orderLine['setBodyTextColor']?.(lineColor);
    orderLine['setBodyBorderColor']?.(lineColor);
    orderLine['setQuantityBackgroundColor']?.(lineColor);
    orderLine['setBodyBackgroundColor']?.('rgb(0,0,0,0)');
    orderLine['setQuantityBorderColor']?.(lineColor);

    // Label & quantity — matches main-dash logic
    const isDraggable = order.isDraggable !== false;
    if (order.noLabel) {
      orderLine['setText']?.('');
      orderLine['setQuantity']?.('');
    } else {
      const label = isGrey
        ? (order.greyLabel ?? 'Smart order')
        : order.label || order.side;
      orderLine['setText']?.(label);
      // A zero quantity used to render as "0" painted in the line colour on a
      // same-coloured chip — an unreadable solid block. Informational lines
      // (e.g. the estimated liquidation level) carry no quantity at all, so
      // render no chip rather than an invisible one.
      orderLine['setQuantity']?.(order.qty ? order.qty.toString() : '');
    }
    if (order.qty === 0 && !order.qty) {
      orderLine['setQuantityTextColor']?.(lineColor);
    }

    orderLine['setModifiable']?.(isDraggable);
    orderLine['setEditable']?.(isDraggable);
    orderLine['setDraggable']?.(isDraggable);

    const lineStyleValue = order.lineStyle === 'dotted' ? 1 : 0;
    orderLine['setLineStyle']?.(lineStyleValue);
    orderLine['setLineLength']?.(2);
    (orderLine as ExtendedOrderLineInstance).setLineWidth?.(1);

    const invoke = (handler?: (p: number, id: string) => void) => {
      if (!handler) return () => void 0;
      return () => {
        try {
          const currentPrice = orderLine.getPrice?.();
          if (currentPrice != null) handler(currentPrice, lineId);
        } catch (e) {
          logger.error('Order line callback error:', e);
        }
      };
    };

    if (isDraggable) {
      orderLine.onMove?.(invoke(order.onMove || order.onPriceChange));
      orderLine.onModify?.(invoke(order.onModify || order.onPriceChange));
      orderLine.onMoving?.(invoke(order.onMove));
    }
    return lineId;
  } catch (error) {
    logger.error('Failed to add order line:', error);
    return null;
  }
}
