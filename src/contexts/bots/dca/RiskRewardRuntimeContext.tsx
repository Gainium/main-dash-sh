import React, { useCallback, useMemo, useSyncExternalStore } from 'react';

interface RiskRewardRuntimeState {
  /** Current stop-loss price derived from indicator or chart runtime */
  stopLossPrice?: number;
  /** Last known ATR value supporting stop-loss derivation */
  atrValue?: number;
  /** Multiplier applied to ATR distance */
  atrMultiplier?: number;
  /** Explicit flag to force ATR-based calculations */
  useAtrForSl?: boolean;
  /** Optional description of the upstream source (indicator id, chart, etc.) */
  sourceId?: string;
  /** Timestamp (ms) of the latest runtime update */
  updatedAt?: number;
}

interface RiskRewardRuntimeContextValue {
  runtime: RiskRewardRuntimeState;
  updateRuntime: (patch: Partial<RiskRewardRuntimeState>) => void;
  resetRuntime: () => void;
}

// Module-scoped store. We need the runtime to live above the form panel
// because the chart (which emits values) and the RR settings tab (which
// consumes them) are siblings — the original React context was scoped
// inside the settings tab only, so chart-emitted values never reached
// the engine. A tiny external store sidesteps the provider problem and
// lets non-React consumers (the chart's indicator callback) push values
// in without needing context access.
let runtimeState: RiskRewardRuntimeState = {};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): RiskRewardRuntimeState => runtimeState;

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

const applyPatch = (patch: Partial<RiskRewardRuntimeState>): void => {
  // The chart pushes a value on every indicator callback; most carry the same
  // numbers. A patch that changes no runtime field (ignoring the timestamp,
  // which no consumer reads) must not notify — that re-rendered every
  // subscriber per bar during study computation.
  const changes = (
    Object.keys(patch) as Array<keyof RiskRewardRuntimeState>
  ).some((key) => key !== 'updatedAt' && !Object.is(runtimeState[key], patch[key]));
  if (!changes) {
    return;
  }
  runtimeState = {
    ...runtimeState,
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  notify();
};

const resetState = (): void => {
  runtimeState = {};
  notify();
};

/**
 * Imperative API for non-React consumers (e.g. TradingView's indicator
 * callback wrapper in BotChart). Components should prefer
 * `useRiskRewardRuntime`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const riskRewardRuntimeStore = {
  getState: getSnapshot,
  setState: applyPatch,
  reset: resetState,
  subscribe,
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRiskRewardRuntime = (): RiskRewardRuntimeContextValue => {
  const runtime = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const updateRuntime = useCallback(
    (patch: Partial<RiskRewardRuntimeState>) => applyPatch(patch),
    []
  );
  const resetRuntime = useCallback(() => resetState(), []);
  return useMemo(
    () => ({ runtime, updateRuntime, resetRuntime }),
    [runtime, updateRuntime, resetRuntime]
  );
};

interface RiskRewardRuntimeProviderProps {
  children: React.ReactNode;
  initialState?: RiskRewardRuntimeState;
}

/**
 * Backwards-compatible wrapper. State now lives in module scope, so the
 * provider is a no-op except for seeding `initialState` on first mount.
 */
export const RiskRewardRuntimeProvider: React.FC<
  RiskRewardRuntimeProviderProps
> = ({ children, initialState }) => {
  if (initialState && Object.keys(runtimeState).length === 0) {
    // eslint-disable-next-line react-hooks/globals
    runtimeState = { ...initialState };
  }
  return <>{children}</>;
};
