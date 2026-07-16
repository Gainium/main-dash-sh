import { useCallback, useMemo } from 'react';
import {
  useWidgetSettingsStore,
  createNamespacedWidgetId,
} from '../stores/widgetSettingsStore';

/**
 * Generic hook for managing widget-specific settings
 * Works with any widget type and any setting structure
 *
 * @param widgetId The widget ID (can be namespaced with storeKey:widgetId)
 * @param storeKey Optional store key to namespace the widgetId (e.g., 'trading-bot-store')
 */
export function useWidgetSettings<T = Record<string, unknown>>(
  widgetId: string,
  storeKey?: string
) {
  const setWidgetSetting = useWidgetSettingsStore((s) => s.setWidgetSetting);
  const getWidgetSetting = useWidgetSettingsStore((s) => s.getWidgetSetting);
  const resetWidgetSettings = useWidgetSettingsStore(
    (s) => s.resetWidgetSettings
  );

  // Create the namespaced widget ID if storeKey is provided
  const namespacedWidgetId = useMemo(() => {
    return storeKey ? createNamespacedWidgetId(storeKey, widgetId) : widgetId;
  }, [storeKey, widgetId]);

  /**
   * Get a specific setting value for this widget
   */
  const getSetting = useCallback(
    <K extends keyof T>(key: K, defaultValue?: T[K]): T[K] => {
      return getWidgetSetting(
        namespacedWidgetId,
        key as string,
        defaultValue
      ) as T[K];
    },
    [namespacedWidgetId, getWidgetSetting]
  );

  /**
   * Set a specific setting value for this widget
   */
  const setSetting = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setWidgetSetting(namespacedWidgetId, key as string, value);
    },
    [namespacedWidgetId, setWidgetSetting]
  );

  /**
   * Get multiple settings at once
   */
  const getSettings = useCallback(
    (keys: (keyof T)[], defaults: Partial<T> = {}): Partial<T> => {
      const settings: Partial<T> = {};
      keys.forEach((key) => {
        settings[key] = getSetting(key, defaults[key]);
      });
      return settings;
    },
    [getSetting]
  );

  /**
   * Set multiple settings at once
   */
  const setSettings = useCallback(
    (settings: Partial<T>) => {
      Object.entries(settings).forEach(([key, value]) => {
        setSetting(key as keyof T, value as T[keyof T]);
      });
    },
    [setSetting]
  );

  /**
   * Reset all settings for this widget
   */
  const resetSettings = useCallback(() => {
    resetWidgetSettings(namespacedWidgetId);
  }, [namespacedWidgetId, resetWidgetSettings]);

  /**
   * Create a stateful setting that automatically persists changes
   * Returns [value, setValue] similar to useState
   *
   * `setValue` is memoized (per `key`) so it stays referentially stable
   * across renders — passing it to memoized children no longer forces a
   * re-render every time the consumer re-renders. `setSetting` is already
   * stable, so the setter only changes when `key` changes.
   *
   * Defined as a nested custom hook: every consumer calls it
   * unconditionally at the top level, so the internal `useCallback`
   * registers a consistent hook slot each render (rules-of-hooks safe).
   */
  function usePersistedState<K extends keyof T>(
    key: K,
    defaultValue: T[K]
  ): [T[K], (value: T[K]) => void] {
    // Subscribe to THIS setting's stored value so the owning widget
    // re-renders the moment its own setting changes. Reading through the
    // non-reactive `getSetting` getter (as this hook did after v2.32.17
    // switched the store access to method selectors) severed that link:
    // clicking a timeframe chip wrote the store but re-rendered nothing —
    // the React.memo'd widget only repainted seconds later when an
    // unrelated tick (socket update, minute clock) happened to flush a
    // render, which users saw as the chip/chart freezing. The selector
    // returns only the raw stored value (`undefined` when unset — a stable
    // primitive), so inline array/object `defaultValue` args can't churn
    // the subscription.
    const stored = useWidgetSettingsStore(
      (s) => s.settings[namespacedWidgetId]?.[key as string]
    );
    const value = (stored ?? defaultValue) as T[K];
    const setValue = useCallback(
      (newValue: T[K]) => setSetting(key, newValue),
      // `setSetting` is itself a useCallback keyed on `namespacedWidgetId`, so
      // it is NOT stable — it changes when the widgetId/storeKey props change.
      // It must be a dep, otherwise `setValue` would keep writing to the old
      // namespace after a prop change. (eslint's analyzer treats the enclosing
      // hook's scope as non-reactive for this nested hook — it is reactive.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [key, setSetting]
    );
    return [value, setValue];
  }

  return {
    getSetting,
    setSetting,
    getSettings,
    setSettings,
    resetSettings,
    usePersistedState,
  };
}

// Type definitions for common widget settings
export interface PortfolioWidgetSettings {
  selectedExchanges: string[];
  selectedCoins: string[];
  timeFilter: string;
  selectedCurrency: string;
  customName?: string; // Add support for custom widget names
  startYAxisAtZero?: boolean; // Add support for Y axis starting at 0
}

export interface ProfitWidgetSettings {
  selectedExchanges: string[];
  timeFilter: string;
  selectedCurrency: string;
  customName?: string;
}

export interface AccumulatedProfitWidgetSettings {
  selectedExchanges: string[];
  timeFilter: string;
  selectedCurrency: string;
  customName?: string;
}

export interface PortfolioAllocationWidgetSettings {
  selectedExchanges: string[];
  viewType: 'pie' | 'bar';
  customName?: string;
}

export interface PortfolioBalancesWidgetSettings {
  selectedExchanges: string[];
  sortBy: 'value' | 'percentage' | 'name';
  sortOrder: 'asc' | 'desc';
  customName?: string;
}

export interface ChartWidgetSettings {
  chartType: 'line' | 'bar' | 'area';
  timeframe: string;
  indicators: string[];
}

export interface TableWidgetSettings {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  visibleColumns: string[];
  pageSize: number;
}

export interface BotStatsWidgetSettings {
  selectedBotType: 'all' | 'dca' | 'grid' | 'combo' | 'terminal' | 'hedge';
  selectedBotTypes: string[];
}

// Example usage:
// const { getSetting, setSetting, usePersistedState } = useWidgetSettings<PortfolioWidgetSettings>(widgetId);
// const [selectedExchange, setSelectedExchange] = usePersistedState('selectedExchange', 'ALL');
//
// For trading bot widgets:
// const { usePersistedState } = useWidgetSettings<TradingBotWidgetSettings>(widgetId);
// const [botId, setBotId] = usePersistedState('botId', null);
// const [isRunning, setIsRunning] = usePersistedState('isRunning', false);
//
// For table widgets:
// const { usePersistedState } = useWidgetSettings<TableWidgetSettings>(widgetId);
// const [sortBy, setSortBy] = usePersistedState('sortBy', 'name');
// const [sortOrder, setSortOrder] = usePersistedState('sortOrder', 'asc');

