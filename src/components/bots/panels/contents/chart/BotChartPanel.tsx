import { useEffect } from 'react';

import BotChart, {
  type BotChartProps,
} from '@/components/widgets/bots/BotChart';
import { useBotChartDisplayOptions } from '@/components/widgets/bots/hooks/useBotChartDisplayOptions';

export interface BotChartPanelProps extends BotChartProps {
  className?: string;
}

const BotChartPanel = ({
  className,
  onPanelMenuChange,
  widgetId: incomingWidgetId,
  menuActions,
  variant: _variant,
  displayOptions: _displayOptions,
  ...restProps
}: BotChartPanelProps) => {
  const resolvedWidgetId = incomingWidgetId ?? 'bot-chart';

  // This panel owns the display options (it overrides BotChart's internal
  // copy), so it — not BotChart — decides whether the active-deal toggle is
  // offered. Same source of truth: the overlay the bot page passed down.
  const hasDealOrders = Array.isArray(restProps.data?.['dealChartOrders'])
    ? (restProps.data['dealChartOrders'] as unknown[]).length > 0
    : false;

  const displayOptions = useBotChartDisplayOptions(resolvedWidgetId, {
    hasDealOrders,
  });

  useEffect(() => {
    if (!onPanelMenuChange) return;
    onPanelMenuChange(null);
    return () => {
      onPanelMenuChange(null);
    };
  }, [onPanelMenuChange]);

  return (
    <BotChart
      {...restProps}
      {...(menuActions ? { menuActions } : {})}
      widgetId={resolvedWidgetId}
      variant="panel"
      displayOptions={displayOptions}
      {...(onPanelMenuChange ? { onPanelMenuChange } : {})}
      {...(className ? { className } : {})}
    />
  );
};

BotChartPanel.displayName = 'BotChartPanel';

export default BotChartPanel;
