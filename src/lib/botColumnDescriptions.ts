/**
 * Column explanations for the bot list tables (DCA, Combo, Grid, Hedge).
 *
 * They render as the header tooltip via `meta.description` (see
 * `ColumnDescriptionMeta` in `components/ui/data-table/data-table.tsx`).
 *
 * Two rules for anything added here:
 *
 * 1. **Say what the number is made of.** Every money column is a sum of named
 *    parts and every percentage has a denominator; the point of these strings
 *    is that the user doesn't have to guess which. The three PnL columns use
 *    different denominators on purpose (max cost / current cost / initial
 *    balance), so each one states its own.
 * 2. **Keep the vocabulary fixed.** Realized PnL = closed only, Unrealized
 *    PnL = open only, Net PnL = the two added together. That triple is the
 *    same on every bot type; only the field it is computed from changes.
 */

/** Columns that mean the same thing on every bot list. */
const SHARED = {
  name: 'The name you gave this bot.',
  coinPair:
    'The pair this bot trades. Multi-pair bots list every pair they are allowed to open deals on.',
  strategy: 'Whether the bot trades the long or the short side.',
  exchange: 'The exchange account this bot trades on.',
  status: 'Whether the bot is running, stopped, in error, or archived.',
  created: 'When the bot was created.',
  tradingTime:
    'Total time this bot has spent running, summed across every start/stop cycle. This is the denominator behind Avg daily and Annualized return.',
  creditsCost: 'Gainium credits this bot has consumed so far.',
  botId: "The bot's internal ID. Quote it when reporting an issue to support.",
} as const;

/**
 * DCA and Combo lists. Both are built from `transformDcaBotToBot`, so the
 * fields — and therefore these explanations — are identical.
 */
const DCA = {
  ...SHARED,
  currentCost:
    "How much money is deployed in this bot's open deals right now, converted to USD.",
  maxCost:
    'The most this bot can have deployed at once — base order plus every safety order — converted to USD.',
  realizedPnl:
    'Profit already banked from the deals this bot has closed. Deals still running are not counted here; they show under Unrealized PnL.',
  realizedPnlPerc:
    "Realized PnL as a percentage. Uses the bot's own net-profit stat when the backend provides one, otherwise realized PnL ÷ max cost.",
  unrealizedPnl:
    'Open profit or loss on the deals running right now, after subtracting the estimated entry and exit fees. Reads $0.00 when the bot has nothing open.',
  unrealizedPnlPerc:
    'Unrealized PnL ÷ the cost currently deployed in the open deals.',
  netPnl:
    'Realized PnL + Unrealized PnL — everything this bot has made, banked and still open.',
  netPnlPerc:
    'Net PnL ÷ current cost. Falls back to max cost when the bot has nothing open.',
  avgDaily:
    'Realized PnL ÷ days of trading time. Open deals are not included, so a bot holding a large unrealized position can still read $0.00 here.',
  avgDailyPerc: 'Avg daily ÷ max cost.',
  annualizedReturn:
    'Avg daily % projected over a year: compounded ((1 + daily%)^365 − 1) when the bot reinvests or sizes orders as a percentage of balance, otherwise simple daily% × 365. The dollar figure is avg daily × 365.',
  usage:
    'How much of the maximum cost is deployed right now (current cost ÷ max cost). The figure under the ring is filled / total DCA orders across the open deals.',
  deals: 'Deals currently open, and deals this bot has run in total.',
} as const;

/**
 * Grid list. Grid bots book profit per closed grid and hold inventory between
 * levels, so the decomposition is built from `profit.totalUsd` (realized) and
 * `valueChangeUsd` (net) — the unrealized leg is the difference.
 */
const GRID = {
  ...SHARED,
  budget: 'The budget you allocated to this bot, converted to USD.',
  currentValue:
    "What the bot is worth right now: the coins and quote currency it holds plus the profit it has booked, converted to USD. This is a total, not a profit — see Net PnL for what it has made.",
  realizedPnl:
    'Profit already booked from completed grid trades (a buy matched with its sell). Inventory the bot is still holding is not counted here.',
  realizedPnlPerc:
    'Free profit ÷ initial balance. Free profit is the booked profit the bot has released for withdrawal, which on a running bot is less than the dollar figure beside it.',
  netPnl:
    'Everything this bot has made: current value − initial balance, i.e. booked grid profit plus the change in value of the inventory it still holds. On futures bots it is booked profit plus the open position PnL.',
  netPnlPerc:
    'Net PnL ÷ initial balance (divided by leverage on futures bots) — the return on what you put in.',
  avgDaily:
    'Realized PnL ÷ days of trading time. The percentage divides that by the initial balance.',
  annualizedReturn:
    'Avg daily % projected over a year (daily% × 365, no compounding). The dollar figure is avg daily × 365.',
  transactions: 'Total orders this bot has filled — buys plus sells.',
  totalGrids: 'How many grid levels the bot is configured with, buy plus sell.',
  gridLevels:
    'Grid levels with a live order resting on the exchange, out of the total levels configured.',
  drawdown:
    'Worst drop below the initial balance the bot has been through, as a percentage of it. Tracked continuously while the bot runs.',
  runUp:
    'Best rise above the initial balance the bot has reached, as a percentage of it. Tracked continuously while the bot runs.',
  timeInLoss:
    'Share of tracked time the bot has spent valued below its initial balance.',
  timeInProfit:
    'Share of tracked time the bot has spent valued above its initial balance.',
} as const;

/**
 * Hedge DCA and Hedge Combo lists. Each row is a pair of legs on two
 * exchanges, so every money column is the two legs added together.
 */
const HEDGE = {
  ...SHARED,
  pair: 'The pair both legs of this hedge trade.',
  longExchange: 'The exchange account running the long leg.',
  shortExchange: 'The exchange account running the short leg.',
  deals: 'Deals currently open across both legs, and deals run in total.',
  currentCost:
    'Money deployed in the open deals right now, both legs added together, in USD.',
  maxCost:
    'The most this hedge can have deployed at once — base order plus every safety order on both legs, in USD.',
  realizedPnl:
    'Profit already banked from closed deals on both legs. Deals still running show under Unrealized PnL.',
  unrealizedPnl:
    'Open profit or loss on the deals running right now, both legs added together, after estimated entry and exit fees.',
  avgDaily: 'Realized PnL ÷ days of trading time, both legs added together.',
  annualizedReturn: 'Avg daily % projected over a year.',
  usage:
    'How much of the maximum cost is deployed right now (current cost ÷ max cost).',
} as const;

export const BOT_COLUMN_DESCRIPTIONS = {
  dca: DCA,
  combo: DCA,
  grid: GRID,
  hedge: HEDGE,
} as const;
