/**
 * Which bot-list columns the server can sort / filter, by column id.
 * Every other column is client-derived (live P&L, value, display composites
 * such as coin pair or exchange) and shows a greyed sort icon in server mode.
 *
 * Fields are Mongo paths on the bot documents (`dcabots`, `combobots`,
 * `bots` for grid, `hedge*`).
 */
import { formatCount } from '../largeAccount/largeAccount';

export const DCA_BOT_SERVER_FIELDS: Record<
  string,
  { sort?: string; filter?: string }
> = {
  name: { sort: 'settings.name', filter: 'settings.name' },
  strategy: { sort: 'settings.strategy', filter: 'settings.strategy' },
  totalProfitUsd: { sort: 'profit.totalUsd' },
  created: { sort: 'created' },
  status: { sort: 'status', filter: 'status' },
  deals: { sort: 'deals.active' },
};

/** Combo bots share the DCA document shape. */
export const COMBO_BOT_SERVER_FIELDS = DCA_BOT_SERVER_FIELDS;

export const GRID_BOT_SERVER_FIELDS: Record<
  string,
  { sort?: string; filter?: string }
> = {
  name: { sort: 'settings.name', filter: 'settings.name' },
  budget: { sort: 'settings.budget' },
  totalProfit: { sort: 'profit.totalUsd' },
  created: { sort: 'created' },
  status: { sort: 'status', filter: 'status' },
};

export const HEDGE_BOT_SERVER_FIELDS: Record<
  string,
  { sort?: string; filter?: string }
> = {
  name: { sort: 'settings.name', filter: 'settings.name' },
  created: { sort: 'created' },
  status: { sort: 'status', filter: 'status' },
};

export function BOT_LIST_PARTIAL_TOOLTIP(shown: number, total: number): string {
  return `This account has ${formatCount(total)} bots; lists load ${formatCount(shown)} at a time. The table pages, sorts and searches on our servers so every bot is reachable. Totals above are based on the first ${formatCount(shown)}.`;
}
