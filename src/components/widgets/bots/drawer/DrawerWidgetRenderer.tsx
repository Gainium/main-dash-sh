import type { DrawerBot } from '@/types/bots/drawer';
import { motion } from 'framer-motion';
import React from 'react';
import { logger } from '../../../../lib/loggerInstance';

// Import all drawer components
import {
  DrawerAdditionalDetails,
  DrawerAssetAllocation,
  DrawerBacktestResults,
  DrawerBalanceInfo,
  DrawerBotEvents,
  DrawerBotSettings,
  DrawerBotSummary,
  DrawerComboOverview,
  DrawerDCAMetrics,
  DrawerDealsTable,
  DrawerGeneralInfo,
  DrawerGridFundsOverview,
  DrawerGridProfitChart,
  /*  DrawerHedgePnl, */
  DrawerMinigridsTable,
  DrawerOrdersTable,
  DrawerPerformanceChart,
  DrawerProfitChart,
  DrawerProfitTabs,
  DrawerUnsupported,
  DrawerWebhookInfo,
  type DrawerWidgetType,
} from './index';

export interface DrawerWidget {
  type: DrawerWidgetType;
  botId?: string;
  props?: Record<string, unknown>;
}

export interface DrawerWidgetRendererProps {
  widgets: DrawerWidget[];
  botId?: string;
  bot?: DrawerBot;
  className?: string;
  privacyMode?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTradeSelect?: (trade: any) => void;
  /** Forwarded to widgets that render pairs (e.g. general info) so a pair
   *  click can drive the drawer chart. */
  onPairClick?: (symbol: string) => void;
}

// Animation component for staggered widget loading
const AnimatedSection: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

// Map widget types to their components
const WIDGET_COMPONENTS: Record<
  DrawerWidgetType,
  React.FC<{
    widgetId: string;
    botId: string;
    [key: string]: unknown;
  }>
> = {
  'drawer-performance-chart': DrawerPerformanceChart,
  'drawer-profit-tabs': DrawerProfitTabs,
  'drawer-asset-allocation': DrawerAssetAllocation,
  'drawer-deals-table': DrawerDealsTable,
  'drawer-minigrids-table': DrawerMinigridsTable,
  /*  'drawer-hedge-pnl': DrawerHedgePnl, */
  'drawer-orders-table': DrawerOrdersTable,
  'drawer-profit-chart': DrawerProfitChart,
  'drawer-grid-funds-overview': DrawerGridFundsOverview,
  'drawer-grid-profit-chart': DrawerGridProfitChart,
  'drawer-risk-metrics': DrawerDCAMetrics,
  'drawer-bot-events': DrawerBotEvents,
  'drawer-webhook-info': DrawerWebhookInfo,
  'drawer-balance-info': DrawerBalanceInfo,
  'drawer-backtest-results': DrawerBacktestResults,
  'drawer-additional-details': DrawerAdditionalDetails,
  'drawer-bot-summary': DrawerBotSummary,
  'drawer-combo-overview': DrawerComboOverview,
  'drawer-general-info': DrawerGeneralInfo,
  'drawer-bot-settings': DrawerBotSettings,
  'drawer-unsupported': DrawerUnsupported,
};

const DrawerWidgetRenderer: React.FC<DrawerWidgetRendererProps> = ({
  widgets,
  botId,
  bot,
  className = '',
  privacyMode = false,
  onTradeSelect,
  onPairClick,
}) => {
  if (!widgets || widgets.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 ${className}`}>
        <div className="text-sm text-muted-foreground">
          No widgets configured
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-5 sm:space-y-lg ${className}`}>
      {widgets.map((widget, index) => {
        const WidgetComponent = WIDGET_COMPONENTS[widget.type];

        if (!WidgetComponent) {
          logger.warn(
            `[DrawerWidgetRenderer] Unknown widget type: ${widget.type}`
          );
          return (
            <AnimatedSection key={`unknown-${index}`} delay={index * 0.1}>
              <div className="p-md border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="text-sm text-destructive">
                  Unknown widget type: {widget.type}
                </div>
              </div>
            </AnimatedSection>
          );
        }

        const widgetId = `drawer-${widget.type}-${index}`;
        const actualBotId = widget.botId || botId;

        // Skip widget if no botId is available
        if (!actualBotId) {
          logger.warn(`Skipping widget ${widget.type} - no botId provided`);
          return null;
        }

        // Combine widget props with additional props
        const widgetProps = {
          widgetId,
          botId: actualBotId,
          bot, // Pass the full bot object to widgets
          onTradeSelect, // Pass the trade selection handler
          onPairClick, // Pair-click → drawer chart symbol (general info)
          privacyMode, // Pass privacy mode to widgets
          ...widget.props,
        };

        return (
          <AnimatedSection
            key={widgetId}
            delay={index * 0.1}
            className="w-full"
          >
            <WidgetComponent {...widgetProps} />
          </AnimatedSection>
        );
      })}
    </div>
  );
};

export default DrawerWidgetRenderer;
