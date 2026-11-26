import type { JournalExecution } from '@/stores/tradeJournalStore';
import type { TransactionChart } from '@/types';

export interface JournalExecutionsSummary {
  entrySide: 'buy' | 'sell' | null;
  totalBuyQty: number;
  totalSellQty: number;
  averageBuyPrice?: number;
  averageSellPrice?: number;
  averageEntryPrice?: number;
  averageExitPrice?: number;
  realizedQuantity: number;
  realizedEntryValue: number;
  realizedExitValue: number;
  realizedPnl: number;
  realizedRoi: number;
  positionRemainderQty: number;
  positionRemainderNotional: number;
  firstTimestamp?: number;
  lastTimestamp?: number;
  transactions: TransactionChart[];
}

const roundNumber = (value: number, precision = 8) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const calculateExecutionsSummary = (
  executions: JournalExecution[]
): JournalExecutionsSummary => {
  if (!executions.length) {
    return {
      entrySide: null,
      totalBuyQty: 0,
      totalSellQty: 0,
      realizedQuantity: 0,
      realizedEntryValue: 0,
      realizedExitValue: 0,
      realizedPnl: 0,
      realizedRoi: 0,
      positionRemainderQty: 0,
      positionRemainderNotional: 0,
      transactions: [],
    };
  }

  const ordered = [...executions].sort((a, b) => a.timestamp - b.timestamp);
  const firstExecution = ordered[0];
  const lastExecution = ordered[ordered.length - 1];

  const mutableTotals: {
    buy: { qty: number; gross: number; fees: number };
    sell: { qty: number; gross: number; fees: number };
  } = {
    buy: { qty: 0, gross: 0, fees: 0 },
    sell: { qty: 0, gross: 0, fees: 0 },
  };

  ordered.forEach((execution) => {
    const sideTotals = mutableTotals[execution.action];
    sideTotals.qty += execution.quantity;
    sideTotals.gross += execution.quantity * execution.price;
    sideTotals.fees += execution.fee;
  });

  const averageBuyPrice =
    mutableTotals.buy.qty > 0
      ? mutableTotals.buy.gross / mutableTotals.buy.qty
      : undefined;

  const averageSellPrice =
    mutableTotals.sell.qty > 0
      ? mutableTotals.sell.gross / mutableTotals.sell.qty
      : undefined;

  const entrySide = firstExecution.action;
  const exitSide = entrySide === 'buy' ? 'sell' : 'buy';

  const entryTotals = mutableTotals[entrySide];
  const exitTotals = mutableTotals[exitSide];

  const entryValuePerUnit =
    entryTotals.qty > 0
      ? entrySide === 'buy'
        ? (entryTotals.gross + entryTotals.fees) / entryTotals.qty
        : (entryTotals.gross - entryTotals.fees) / entryTotals.qty
      : 0;

  const exitValuePerUnit =
    exitTotals.qty > 0
      ? exitSide === 'buy'
        ? (exitTotals.gross + exitTotals.fees) / exitTotals.qty
        : (exitTotals.gross - exitTotals.fees) / exitTotals.qty
      : 0;

  const realizedQuantity = Math.min(entryTotals.qty, exitTotals.qty);
  const realizedEntryValue = realizedQuantity * entryValuePerUnit;
  const realizedExitValue = realizedQuantity * exitValuePerUnit;

  const realizedPnl =
    entrySide === 'buy'
      ? realizedExitValue - realizedEntryValue
      : realizedEntryValue - realizedExitValue;

  const realizedRoi = realizedEntryValue
    ? (realizedPnl / realizedEntryValue) * 100
    : 0;

  const netQuantity = mutableTotals.buy.qty - mutableTotals.sell.qty;
  const positionRemainderQty = roundNumber(netQuantity, 8);

  const entryReferenceValue =
    entryValuePerUnit > 0 ? entryValuePerUnit : firstExecution.price;
  const positionRemainderNotional = roundNumber(
    Math.abs(positionRemainderQty) * entryReferenceValue,
    2
  );

  const transactions: TransactionChart[] = ordered.map((execution, index) => ({
    id: execution.id,
    side: execution.action,
    time: execution.timestamp,
    price: execution.price,
    tradeNumber: index + 1,
    qty: execution.quantity,
  }));

  const summary: JournalExecutionsSummary = {
    entrySide,
    totalBuyQty: mutableTotals.buy.qty,
    totalSellQty: mutableTotals.sell.qty,
    realizedQuantity,
    realizedEntryValue,
    realizedExitValue,
    realizedPnl,
    realizedRoi,
    positionRemainderQty,
    positionRemainderNotional,
    firstTimestamp: firstExecution.timestamp,
    lastTimestamp: lastExecution.timestamp,
    transactions,
  };

  if (averageBuyPrice !== undefined) {
    summary.averageBuyPrice = averageBuyPrice;
  }

  if (averageSellPrice !== undefined) {
    summary.averageSellPrice = averageSellPrice;
  }

  const averageEntryPrice =
    entrySide === 'buy' ? averageBuyPrice : averageSellPrice;
  const averageExitPrice =
    entrySide === 'buy' ? averageSellPrice : averageBuyPrice;

  if (averageEntryPrice !== undefined) {
    summary.averageEntryPrice = averageEntryPrice;
  }

  if (averageExitPrice !== undefined) {
    summary.averageExitPrice = averageExitPrice;
  }

  return summary;
};
