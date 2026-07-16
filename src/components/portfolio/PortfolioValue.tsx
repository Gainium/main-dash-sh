import React from 'react';
import DashboardPortfolioValue from '../widgets/dashboard/PortfolioValue';

export interface PortfolioValueProps {
  widgetId?: string;
  height?: string | number;
  className?: string;
}

/**
 * Portfolio-specific PortfolioValue component that wraps the dashboard widget
 * without resizing conflicts. This component is specifically designed for the
 * portfolio page with fixed sizing and no grid layout interference. The 1M/3M/12M
 * time-range chips are functional here (no `fixedTimeframe` — that would lock the
 * chips to a single range and render them inert).
 */
const PortfolioValue: React.FC<PortfolioValueProps> = ({
  widgetId = 'portfolio-value-page',
  height = '600px',
  className,
}) => {
  return (
    <div className={className}>
      <DashboardPortfolioValue
        widgetId={widgetId}
        isEditable={false}
        isCollapsible={false}
        allowResize={false}
        height={height}
        menuActions={{}}
      />
    </div>
  );
};

export default PortfolioValue;
