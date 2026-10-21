import { useCallback, useMemo } from 'react';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';

import { useGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import type { GridCurrency } from '@/types/bots/grid';

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

type FormatAmountFn = (
  value: number,
  options?: { currency?: GridCurrency; maximumFractionDigits?: number }
) => string;
type FormatPercentFn = (
  value: number,
  options?: { maximumFractionDigits?: number }
) => string;
type FormatDateTimeFn = (value: number | string | Date) => string;
type OrdersTabChangeFn = (
  tab: ReturnType<typeof useGridPageContext>['state']['orders']['activeTab']
) => void;
type MarketOverviewChangeFn = (
  state: ReturnType<typeof useGridPageContext>['state']['marketOverview']
) => void;

export interface UseGridBotDataResult {
  status: ReturnType<typeof useGridPageContext>['state']['status'];
  error: string | null | undefined;
  botId: string | null | undefined;
  botName: string;
  pairLabel: string;
  exchangeLabel: string;
  currency: GridCurrency;
  currencyOptions: Array<{ value: GridCurrency; label: string }>;
  onCurrencyChange: (currency: GridCurrency) => void;
  onRefresh: () => Promise<void>;
  metrics: ReturnType<typeof useGridPageContext>['state']['metrics'];
  funds: ReturnType<typeof useGridPageContext>['state']['funds'];
  isFuturesBot: boolean;
  leverage: ReturnType<typeof useGridPageContext>['state']['leverage'];
  orders: ReturnType<typeof useGridPageContext>['state']['orders'];
  transactions: ReturnType<typeof useGridPageContext>['state']['transactions'];
  events: ReturnType<typeof useGridPageContext>['state']['events'];
  charts: ReturnType<typeof useGridPageContext>['state']['charts'];
  overlays: ReturnType<typeof useGridPageContext>['state']['overlays'];
  marketOverview: ReturnType<
    typeof useGridPageContext
  >['state']['marketOverview'];
  onOrdersTabChange: OrdersTabChangeFn;
  onMarketOverviewChange: MarketOverviewChangeFn;
  formatAmount: FormatAmountFn;
  formatPercent: FormatPercentFn;
  formatDateTime: FormatDateTimeFn;
}

export const useGridBotData = (): UseGridBotDataResult => {
  const { currency: reportingCurrency, formatUsd } = useReportingCurrency();
  const { state, actions } = useGridPageContext();
  const {
    bot,
    metrics,
    funds,
    orders,
    transactions,
    charts,
    overlays,
    leverage,
    marketOverview,
    events,
    preferences,
    status,
    error,
  } = state;

  const botId = bot?._id ?? state.botId ?? null;
  const botName = bot?.settings?.name ?? bot?.symbol?.symbol ?? 'Grid Bot';
  const pairLabel = bot?.settings?.pair ?? bot?.symbol?.symbol ?? '—';
  const exchangeLabel = bot?.exchange ?? '—';
  const baseAsset =
    funds?.baseAsset ??
    bot?.symbol?.baseAsset ??
    pairLabel.split('/')?.[0] ??
    'BASE';
  const quoteAsset =
    funds?.quoteAsset ??
    bot?.symbol?.quoteAsset ??
    pairLabel.split('/')?.[1] ??
    'QUOTE';

  const currencyOptions = useMemo(
    () => [
      { value: 'usd' as GridCurrency, label: reportingCurrency.code },
      { value: 'quote' as GridCurrency, label: quoteAsset.toUpperCase() },
      { value: 'base' as GridCurrency, label: baseAsset.toUpperCase() },
    ],
    [baseAsset, quoteAsset, reportingCurrency.code]
  );

  const decimalFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 6,
      }),
    []
  );

  const formatAmount = useCallback<FormatAmountFn>(
    (value, options) => {
      if (!Number.isFinite(value)) {
        return '—';
      }

      const targetCurrency = options?.currency ?? preferences.currency;

      if (targetCurrency === 'usd') {
        // USD values, shown in the reporting currency.
        return formatUsd(value, {
          decimals: options?.maximumFractionDigits ?? 2,
        });
      }

      const formatter = options?.maximumFractionDigits
        ? new Intl.NumberFormat(undefined, {
            maximumFractionDigits: options.maximumFractionDigits,
          })
        : decimalFormatter;

      return formatter.format(value);
    },
    [decimalFormatter, preferences.currency, formatUsd]
  );

  const formatPercent = useCallback<FormatPercentFn>((value, options) => {
    if (!Number.isFinite(value)) {
      return '—';
    }

    const formatter = new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    });

    return formatter.format(value / 100);
  }, []);

  const formatDateTime = useCallback<FormatDateTimeFn>((value) => {
    if (!value) {
      return '—';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return new Intl.DateTimeFormat(undefined, DEFAULT_DATE_FORMAT).format(date);
  }, []);

  const handleCurrencyChange = useCallback(
    (currency: GridCurrency) => {
      actions.setCurrency(currency);
    },
    [actions]
  );

  const handleOrdersTabChange = useCallback<OrdersTabChangeFn>(
    (tab) => {
      actions.setOrdersTab(tab);
    },
    [actions]
  );

  const handleMarketOverviewChange = useCallback<MarketOverviewChangeFn>(
    (next) => {
      actions.setMarketOverview(next);
    },
    [actions]
  );

  return {
    status,
    error,
    botId,
    botName,
    pairLabel,
    exchangeLabel,
    currency: preferences.currency,
    currencyOptions,
    onCurrencyChange: handleCurrencyChange,
    onRefresh: actions.refresh,
    metrics,
    funds,
    isFuturesBot: Boolean(bot?.settings?.futures),
    leverage,
    orders,
    transactions,
    events,
    charts,
    overlays,
    marketOverview,
    onOrdersTabChange: handleOrdersTabChange,
    onMarketOverviewChange: handleMarketOverviewChange,
    formatAmount,
    formatPercent,
    formatDateTime,
  };
};
