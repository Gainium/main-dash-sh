/**
 * Which deal-table columns the server can sort / filter (OpenOrdersWidget
 * column ids → Mongo paths on `dcadeals`). Sort keys follow the server
 * contract: `stats.usage` (cost, USD), the fee-inclusive
 * `stats.unrealizedProfitNet` / `stats.unrealizedPercentNet`, `stats.valueUsd`,
 * `profit.totalUsd`, `createTime`. On a backend without the `*Net` fields
 * those columns sort as "missing" rather than erroring.
 *
 * Closed deals: only time columns. Sorting a user's whole closed history by
 * anything else is an unindexed in-memory sort on the server.
 */
import { SERVER_SORT_UNAVAILABLE_TOOLTIP } from '../../components/ui/data-table/serverSide';
import type { ServerFilterSpec } from './serverFilters';

type Fields = Record<string, { sort?: string; filter?: string | ServerFilterSpec }>;

/*
 * Filter capabilities (column id → server filter spec). Day filters go out as
 * epoch-ms bounds in the account's timezone, which every backend applies (the
 * time fields are stored as epoch ms). Bot name, cost and pair are
 * logical fields only newer backends resolve (`requiresNewBackend`); on an
 * older backend they stay visible as "not applied" and are not sent.
 * Status is not listed: the deal-list hook sets the status item itself (the
 * Open/Closed view), so a status column filter would not reach the server.
 */
const DAY_OPENED: ServerFilterSpec = { field: 'createTime', kind: 'day' };
const DAY_CLOSED: ServerFilterSpec = { field: 'closeTime', kind: 'day' };
const BOT_NAME: ServerFilterSpec = { field: 'botName', kind: 'text', requiresNewBackend: true };
const COST: ServerFilterSpec = { field: 'cost', kind: 'number', requiresNewBackend: true };
const PAIR: ServerFilterSpec = { field: 'pair', kind: 'text', requiresNewBackend: true };

export const DEAL_SEARCH_FIELD = 'symbol.symbol';

export const OPEN_DEAL_SERVER_FIELDS: Fields = {
  createdTime: { sort: 'createTime', filter: DAY_OPENED },
  botName: { filter: BOT_NAME },
  symbol: { filter: PAIR },
  cost: { sort: 'stats.usage', filter: COST },
  value: { sort: 'stats.valueUsd' },
  realizedProfit: { sort: 'profit.totalUsd' },
  unrealizedProfit: { sort: 'stats.unrealizedProfitNet' },
  unrealizedProfitPercentage: { sort: 'stats.unrealizedPercentNet' },
  status: { sort: 'status' },
};

export const CLOSED_DEAL_SERVER_FIELDS: Fields = {
  createdTime: { sort: 'createTime', filter: DAY_OPENED },
  closeTime: { sort: 'closeTime', filter: DAY_CLOSED },
  botName: { filter: BOT_NAME },
  symbol: { filter: PAIR },
  cost: { filter: COST },
};

export const CLOSED_DEAL_SORT_TOOLTIP =
  "Closed deals of large accounts sort by open or close time only — use the search box to find a pair";

export { SERVER_SORT_UNAVAILABLE_TOOLTIP };

/** Bot drawer deal tables (DrawerDealsTable column ids). */
export const DRAWER_OPEN_DEAL_SERVER_FIELDS: Fields = {
  created: { sort: 'createTime', filter: DAY_OPENED },
  symbol: { filter: PAIR },
  cost: { sort: 'stats.usage', filter: COST },
  value: { sort: 'stats.valueUsd' },
  unrealizedPnl: { sort: 'stats.unrealizedProfitNet' },
  unrealizedPnlPercentage: { sort: 'stats.unrealizedPercentNet' },
  realizedPnl: { sort: 'profit.totalUsd' },
  status: { sort: 'status' },
};

export const DRAWER_CLOSED_DEAL_SERVER_FIELDS: Fields = {
  created: { sort: 'createTime', filter: DAY_OPENED },
  closeTime: { sort: 'closeTime', filter: DAY_CLOSED },
  symbol: { filter: PAIR },
  cost: { filter: COST },
};
