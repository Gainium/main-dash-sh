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

type Fields = Record<string, { sort?: string; filter?: string }>;

export const DEAL_SEARCH_FIELD = 'symbol.symbol';

export const OPEN_DEAL_SERVER_FIELDS: Fields = {
  createdTime: { sort: 'createTime' },
  cost: { sort: 'stats.usage' },
  value: { sort: 'stats.valueUsd' },
  realizedProfit: { sort: 'profit.totalUsd' },
  unrealizedProfit: { sort: 'stats.unrealizedProfitNet' },
  unrealizedProfitPercentage: { sort: 'stats.unrealizedPercentNet' },
  status: { sort: 'status' },
};

export const CLOSED_DEAL_SERVER_FIELDS: Fields = {
  createdTime: { sort: 'createTime' },
  closeTime: { sort: 'closeTime' },
};

export const CLOSED_DEAL_SORT_TOOLTIP =
  "Closed deals of large accounts sort by open or close time only — use the search box to find a pair";

export { SERVER_SORT_UNAVAILABLE_TOOLTIP };

/** Bot drawer deal tables (DrawerDealsTable column ids). */
export const DRAWER_OPEN_DEAL_SERVER_FIELDS: Fields = {
  created: { sort: 'createTime' },
  cost: { sort: 'stats.usage' },
  value: { sort: 'stats.valueUsd' },
  unrealizedPnl: { sort: 'stats.unrealizedProfitNet' },
  unrealizedPnlPercentage: { sort: 'stats.unrealizedPercentNet' },
  realizedPnl: { sort: 'profit.totalUsd' },
  status: { sort: 'status' },
};

export const DRAWER_CLOSED_DEAL_SERVER_FIELDS: Fields = {
  created: { sort: 'createTime' },
  closeTime: { sort: 'closeTime' },
};
