/**
 * Hedge bot — chart panel.
 *
 * Renders the shared `BotChartPanel` for the *active* leg — the same
 * altitude every other bot uses (DCA/grid via BotWorkbench, terminal via
 * TradingTerminal). Each leg owns its own pair and exchange; the chart
 * reflects whichever leg is mounted, and symbol picks via the TradingView
 * widget land on that leg's formData only (the other leg's pair is
 * unaffected). The active-leg publisher inside the leg's BotFormWidget
 * supplies `activeLegPair`, `activeLegExchangeUUID`, and a writer the
 * chart calls on pick.
 *
 * This panel intentionally does NOT compute order lines, indicators, or
 * the Risk:Reward overlay itself — `BotChart` derives all of those from
 * the module-level singletons (`exampleOrdersStore`, `indicatorStore`,
 * `riskRewardPositionStore`) that the single mounted leg populates. The
 * panel's only job is to resolve the active leg's symbol + exchange and
 * hand them to `BotChartPanel` as props.
 */
import { useMemo } from 'react';

import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import {
  useExchangesFromContext,
  useTradingPairsFromContext,
} from '@/contexts/ExchangeDataContext';
import { useHedgeBotForm } from '@/contexts/bots/form/HedgeBotFormProvider';
import { ExampleOrdersStoreContext } from '@/contexts/bots/form/formStoreContexts';
import type { ExampleOrdersStore } from '@/utils/bots/dca/example-orders';
import type { Symbols } from '@/types';

export interface HedgeChartPanelProps {
  /**
   * A merged example-orders store fed by BOTH Quick legs (long + short). When
   * provided, the chart draws both legs' base/safety/TP lines together (legacy
   * `chartView === 'both'`). Omitted in Manual mode, where only the active leg
   * is mounted and the shared singleton already reflects it.
   */
  ordersStore?: ExampleOrdersStore | undefined;
}

export const HedgeChartPanel: React.FC<HedgeChartPanelProps> = ({
  ordersStore,
}) => {
  const {
    botType,
    activeLegPair,
    activeLegExchangeUUID,
    activeLegBotId,
    chartSymbolWriterRef,
  } = useHedgeBotForm();
  const { pairsByExchange } = useTradingPairsFromContext();
  const { data: exchangesData } = useExchangesFromContext();

  const exchange = useMemo(() => {
    if (!activeLegExchangeUUID) return undefined;
    const match = exchangesData?.data?.exchanges?.find(
      (e) => e.uuid === activeLegExchangeUUID
    );
    return match?.provider;
  }, [activeLegExchangeUUID, exchangesData?.data?.exchanges]);

  const exchangeSymbols: Symbols[] = useMemo(() => {
    if (!exchange) return [];
    const pairs = pairsByExchange?.[exchange];
    if (!pairs) return [];
    // TradingPair (from useTradingPairs) and Symbols (chart's expected
    // shape) are nearly identical except for `maxOrders` — the picker
    // doesn't use that field, so we fill it in defensively.
    return pairs.map((p) => ({
      ...p,
      maxOrders: 0,
      crossAvailable: p.crossAvailable ?? false,
    })) as Symbols[];
  }, [exchange, pairsByExchange]);

  if (!exchange || !activeLegPair) {
    return (
      <div className="flex h-full items-center justify-center p-md text-sm text-muted-foreground">
        Pick an exchange and pair in the active leg to render the chart.
      </div>
    );
  }

  // Fully-qualified `pair@exchange` so BotChart resolves the exchange
  // unambiguously (it also derives `fallbackExchange` from `data.exchange`).
  const symbol = `${activeLegPair}@${exchange}`;

  const chart = (
    <BotChartPanel
      // Mode-stable, exchange-independent id so interval + display-options
      // persist across leg switches (mirrors regular bots' shared chart
      // widget ids). Deliberately excludes botId + exchange.
      widgetId={`hedge-${botType}-bot-chart`}
      className="h-full"
      symbol={symbol}
      data={{
        symbol,
        exchange,
        // In edit mode, thread the active leg's persisted _id so BotChart
        // subscribes to the Risk:Reward position RiskRewardSettings writes
        // for that leg. Absent in create mode → both sides use the global
        // key, so RR still works with zero plumbing.
        ...(activeLegBotId ? { botId: activeLegBotId } : {}),
      }}
      availableSymbols={exchangeSymbols}
      onSymbolChange={(pair) => chartSymbolWriterRef.current?.(pair)}
    />
  );

  // In Quick mode, route BotChart's example-orders subscription to the merged
  // store so it draws BOTH legs' orders. In Manual mode (no merged store),
  // BotChart reads the shared singleton the active leg writes, as before.
  return ordersStore ? (
    <ExampleOrdersStoreContext.Provider value={ordersStore}>
      {chart}
    </ExampleOrdersStoreContext.Provider>
  ) : (
    chart
  );
};

export default HedgeChartPanel;
