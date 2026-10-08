// "Add to Journal" for a deal: one entry shape for every surface that offers it.
import type {
  JournalExecution,
  useTradeJournalStore,
} from '@/stores/tradeJournalStore';
import type { DealTradeSource } from './dealRef';

export type DealJournalEntry = Parameters<
  ReturnType<typeof useTradeJournalStore.getState>['addTrade']
>[0];

/** An order as either the order queries or the drawer's order list carry it. */
export interface JournalOrderLike {
  dealId?: string | undefined;
  clientOrderId: string;
  side: string;
  time?: number | string | undefined;
  updateTime?: number | string | undefined;
  transactTime?: number | string | undefined;
  executedQty?: number | string | undefined;
  origQty?: number | string | undefined;
  price?: number | string | undefined;
}

const toMs = (value: number | string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** The deal's filled orders as journal executions. */
export function journalExecutions(
  dealId: string,
  orders: readonly JournalOrderLike[]
): JournalExecution[] {
  return orders
    .filter((order) => order.dealId === dealId)
    .map((order) => {
      const quantity = Number(order.executedQty || order.origQty || 0);
      const price = Number(order.price || 0);
      return {
        id: order.clientOrderId,
        action: order.side.toLowerCase() === 'buy' ? 'buy' : 'sell',
        timestamp:
          toMs(order.updateTime) ??
          toMs(order.time) ??
          toMs(order.transactTime) ??
          Date.now(),
        quantity,
        price,
        fee: 0,
        cost: quantity * price,
      };
    });
}

const OPEN_STATUSES = new Set(['open', 'active', 'start', 'error']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

export const dealJournalEntryTime = (trade: DealTradeSource): number =>
  trade.createdTime?.getTime() ??
  (trade.created ? new Date(trade.created).getTime() : Date.now());

export function buildDealJournalEntry(
  trade: DealTradeSource,
  executions: JournalExecution[]
): DealJournalEntry {
  const status = String(trade.status || '').toLowerCase();
  const isOpen = OPEN_STATUSES.has(status);
  const isCanceled = CANCELED_STATUSES.has(status);
  const symbol =
    typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;
  const long = trade.side
    ? trade.side === 'BUY'
    : !String(trade.strategy || '').toLowerCase().includes('short');
  const futures = !!(
    trade.futures ??
    trade.settings?.futures ??
    trade.dealType === 'FUTURES'
  );
  const pnl = trade.profit?.totalUsd || 0;
  const cost = trade.cost || 0;

  const entry: Record<string, unknown> = {
    sourceDealId: trade.dealId || trade.id,
    symbol,
    exchange: trade.exchange,
    direction: long ? 'long' : 'short',
    entryPrice: trade.entryPrice || trade.avgPrice || 0,
    entryTime: dealJournalEntryTime(trade),
    amount: trade.size || trade.currentBalance?.base || 0,
    pnl,
    roi: cost > 0 ? (pnl / cost) * 100 : 0,
    marketType: futures ? 'futures' : 'spot',
    notes: `Deal from ${trade.type} bot${trade.botName ? ` (${trade.botName})` : ''}${isOpen ? ' (Open - Unrealized PNL)' : ''}${isCanceled ? ' (Cancelled)' : ''}`,
    tags: [trade.type, trade.strategy].filter(Boolean),
    executions: executions.length > 0 ? executions : undefined,
  };

  // Exit data only for a deal that really closed.
  if (!isOpen && !isCanceled && trade.exitPrice && trade.exitTime) {
    entry['exitPrice'] = trade.exitPrice;
    entry['exitTime'] = trade.exitTime;
    entry['exitReason'] = 'manual';
  }

  // The journal store's entry type requires fields (duration, …) a live deal
  // does not have; the store fills what it needs.
  return entry as unknown as DealJournalEntry;
}
