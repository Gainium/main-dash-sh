// The deal details view's action bar (with the inline form of the action
// being set up) and its chart price picker. State lives in useDealDetailView.
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart/TVChartPicker';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import { ChartPricePickerContext } from '@/features/bots/shared/runtime/dialogs/chartPricePicker';
import { DealActionBar } from '@/features/deals/actions/DealActionBar';
import { DealActionsContext } from '@/features/deals/actions/dealActionsContext';
import type React from 'react';
import type { DealDetailView } from './useDealDetailView';

/**
 * The action bar and, under it, the form of the action being set up. Empty
 * below the bar until an action is picked. `chartBeside` says whether a chart
 * is on screen next to it; only then can a limit price be picked on it.
 */
export function DealDetailActions({
  view,
  chartBeside,
  className,
}: {
  view: DealDetailView;
  chartBeside: boolean;
  className?: string;
}) {
  const content = (
    <>
      <DealActionBar
        deal={view.dealRef}
        surface={view.surface}
        activeId={view.openActionId}
        className="mb-sm"
      />
      <div className={view.openActionId ? 'mb-md' : undefined}>
        {view.panels}
      </div>
    </>
  );
  return (
    <div className={className}>
      <DealActionsContext.Provider value={view.runner}>
        {chartBeside ? (
          <ChartPricePickerContext.Provider value={view.picker.value}>
            {content}
          </ChartPricePickerContext.Provider>
        ) : (
          content
        )}
      </DealActionsContext.Provider>
    </div>
  );
}

/** Lets the view's price fields take a price from a click on this chart. */
export function DealDetailChartPicker({
  view,
  chartRef,
}: {
  view: DealDetailView;
  chartRef: React.RefObject<TradingViewChartRef | null>;
}) {
  return (
    <TVChartPicker
      chartRef={chartRef}
      isActive={view.picker.isActive}
      onPick={view.picker.onPick}
    />
  );
}
