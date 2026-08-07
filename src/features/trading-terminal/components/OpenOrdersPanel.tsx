// Trading Terminal wrapper for the shared OpenOrdersWidget.
import OpenOrdersWidget from '@/components/widgets/shared/OpenOrdersWidget';

export function OpenOrdersPanel() {
  return (
    <div className="h-full overflow-hidden">
      <OpenOrdersWidget
        widgetId="trading-terminal-open-orders"
        hideBotName={true}
        botTypeOverride="Terminal"
        enableStatusToggle={true}
      />
    </div>
  );
}
