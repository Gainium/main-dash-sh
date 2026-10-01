// Trade-journal store stub. No-op actions and empty data.

import type { TradeResult } from '@/lib/manual-backtesting/manualBacktestingState';

export type JournalMarket = 'spot' | 'futures';

export interface JournalExecution {
  id: string;
  action: 'buy' | 'sell';
  timestamp: number;
  quantity: number;
  price: number;
  fee: number;
  cost: number;
}

export interface JournalTrade extends TradeResult {
  id: string;
  isJournal: true;
  executedAt?: number;
  sessionId?: string;
  sessionName?: string;
  notes?: string;
  tags?: string[];
  rating?: number;
  strategyName?: string;
  strategyId?: string;
  createdAt: number;
  updatedAt: number;
  marketType?: JournalMarket;
  executions?: JournalExecution[];
  exchange?: string;
  sourceDealId?: string;
}

interface TradeJournalState {
  trades: JournalTrade[];
  journalCheckboxEnabled: boolean;
  addTrade: (
    trade: Omit<JournalTrade, 'id' | 'isJournal' | 'createdAt' | 'updatedAt'>
  ) => string;
  getTrade: (id: string) => JournalTrade | undefined;
  updateTrade: (
    id: string,
    updates: Partial<Omit<JournalTrade, 'id' | 'isJournal' | 'createdAt'>>
  ) => void;
  deleteTrade: (id: string) => void;
  getTradesByDateRange: (startTime: number, endTime: number) => JournalTrade[];
  setJournalCheckboxEnabled: (enabled: boolean) => void;
  clearAllTrades: () => void;
}

const noopState: TradeJournalState = {
  trades: [],
  journalCheckboxEnabled: false,
  addTrade: () => '',
  getTrade: () => undefined,
  updateTrade: () => {},
  deleteTrade: () => {},
  getTradesByDateRange: () => [],
  setJournalCheckboxEnabled: () => {},
  clearAllTrades: () => {},
};

export function useTradeJournalStore(): TradeJournalState;
export function useTradeJournalStore<T>(
  selector: (state: TradeJournalState) => T
): T;
export function useTradeJournalStore<T>(
  selector?: (state: TradeJournalState) => T
): T | TradeJournalState {
  return selector ? selector(noopState) : noopState;
}

useTradeJournalStore.getState = (): TradeJournalState => noopState;
useTradeJournalStore.setState = (): void => {};
useTradeJournalStore.subscribe = (): (() => void) => () => {};
