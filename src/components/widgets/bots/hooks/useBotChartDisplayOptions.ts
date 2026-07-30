import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useWidgetSettings } from '@/hooks/useWidgetSettings';

import type { TradingViewDropdownItem } from '../../shared/TradingViewChart/types';
import type { BotChartWidgetSettings } from '../BotChart';

/**
 * TradingView's dropdown entries are plain `{ title, onSelect }` — the vendor
 * has no checked/active state for them — so the only place a toggle's current
 * value can live is its label. The bracketed marker keeps every row aligned in
 * the menu's proportional font, which a bare "✓"/no-prefix pair would not.
 */
const checkbox = (checked: boolean, label: string): string =>
  `${checked ? '[✓]' : '[  ]'} ${label}`;

export interface BotChartDisplayOptionsResult {
  showOrders: boolean;
  showTransactions: boolean;
  showPastOrders: boolean;
  showSignals: boolean;
  /** Draw the active deal's ladder instead of the settings preview. */
  showDealOrders: boolean;
  toolbarDropdownItems: TradingViewDropdownItem[];
}

export interface BotChartDisplayOptions {
  /**
   * True when the host actually has an active deal to overlay. Only then does
   * the toggle appear in the Chart dropdown — every other chart (terminal,
   * create-bot, grid) would show an item that does nothing.
   */
  hasDealOrders?: boolean;
}

export const useBotChartDisplayOptions = (
  widgetId: string,
  options?: BotChartDisplayOptions
): BotChartDisplayOptionsResult => {
  const hasDealOrders = options?.hasDealOrders ?? false;
  const { usePersistedState } =
    useWidgetSettings<BotChartWidgetSettings>(widgetId);

  const [showOrders, setShowOrders] = usePersistedState('showOrders', true);
  const [showTransactions, setShowTransactions] = usePersistedState(
    'showTransactions',
    true
  );
  const [showPastOrders, setShowPastOrders] = usePersistedState(
    'showPastOrders',
    true
  );
  const [showSignals, setShowSignals] = usePersistedState('showSignals', true);
  const [showDealOrders, setShowDealOrders] = usePersistedState(
    'showDealOrders',
    true
  );

  const showOrdersRef = useRef(showOrders);
  const showTransactionsRef = useRef(showTransactions);
  const showPastOrdersRef = useRef(showPastOrders);
  const showSignalsRef = useRef(showSignals);
  const showDealOrdersRef = useRef(showDealOrders);

  useEffect(() => {
    showOrdersRef.current = showOrders;
  }, [showOrders]);

  useEffect(() => {
    showTransactionsRef.current = showTransactions;
  }, [showTransactions]);

  useEffect(() => {
    showPastOrdersRef.current = showPastOrders;
  }, [showPastOrders]);

  useEffect(() => {
    showSignalsRef.current = showSignals;
  }, [showSignals]);

  useEffect(() => {
    showDealOrdersRef.current = showDealOrders;
  }, [showDealOrders]);

  const toggleShowOrders = useCallback(() => {
    setShowOrders(!showOrdersRef.current);
  }, [setShowOrders]);

  const toggleShowTransactions = useCallback(() => {
    setShowTransactions(!showTransactionsRef.current);
  }, [setShowTransactions]);

  const toggleShowPastOrders = useCallback(() => {
    setShowPastOrders(!showPastOrdersRef.current);
  }, [setShowPastOrders]);

  const toggleShowSignals = useCallback(() => {
    setShowSignals(!showSignalsRef.current);
  }, [setShowSignals]);

  const toggleShowDealOrders = useCallback(() => {
    setShowDealOrders(!showDealOrdersRef.current);
  }, [setShowDealOrders]);

  const toolbarDropdownItems = useMemo<TradingViewDropdownItem[]>(
    () => [
      {
        title: checkbox(showOrders, 'Order lines'),
        onSelect: toggleShowOrders,
      },
      {
        title: checkbox(showTransactions, 'Buy/sell icons'),
        onSelect: toggleShowTransactions,
      },
      {
        title: checkbox(showPastOrders, 'Past orders'),
        onSelect: toggleShowPastOrders,
      },
      {
        title: checkbox(showSignals, 'Entry/exit signals'),
        onSelect: toggleShowSignals,
      },
      ...(hasDealOrders
        ? [
            {
              title: checkbox(showDealOrders, 'Active deal orders'),
              onSelect: toggleShowDealOrders,
            },
          ]
        : []),
    ],
    [
      hasDealOrders,
      showDealOrders,
      showOrders,
      showPastOrders,
      showSignals,
      showTransactions,
      toggleShowDealOrders,
      toggleShowOrders,
      toggleShowPastOrders,
      toggleShowSignals,
      toggleShowTransactions,
    ]
  );

  return {
    showOrders,
    showTransactions,
    showPastOrders,
    showSignals,
    showDealOrders,
    toolbarDropdownItems,
  };
};
