/**
 * The canonical bot-list window: the statuses every store-sharing list query
 * asks for, and the page size it asks for. Keeping these identical across
 * callers is what lets React Query dedupe them into ONE request per trading
 * context (see useDcaBots).
 */
import type { BotStatus } from '../../types';

/** Rows per canonical request. The server's own cap without paging is 500. */
export const BOT_LIST_WINDOW = 500;

export const CANONICAL_DCA_STATUSES: BotStatus[] = [
  'open',
  'range',
  'monitoring',
  'error',
  'closed',
];

export const CANONICAL_GRID_STATUSES: BotStatus[] = [
  'error',
  'open',
  'range',
  'monitoring',
  'closed',
];

/** A response is partial when the server holds more rows than it returned. */
export function isPartialList(
  rows: number,
  total: number | null | undefined
): boolean {
  return typeof total === 'number' && Number.isFinite(total) && total > rows;
}
