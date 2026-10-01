import type { BacktestLimitationRule } from '@/lib/extensions/backtestLimitations';

// DCA / Combo settings the backtester does not simulate, or only partly.
// Each rule fires only while the setting is active on the bot being tested.
// Source: the backtest support matrix (dashboard spec 077, assets). Settings
// that differ for every bot (fees, slippage, the default balance checks,
// Combo TP/SL checked on candle close) are left out on purpose — a dialog
// that always shows teaches people to skip it.

type S = Readonly<Record<string, unknown>>;

const on = (v: unknown) => v === true || v === 'true';
const eq = (v: unknown, want: string) =>
  typeof v === 'string' && v.toLowerCase() === want.toLowerCase();

export const BUILTIN_BACKTEST_LIMITATION_RULES: readonly BacktestLimitationRule[] =
  [
    // ── Deal start ──────────────────────────────────────────────────────
    {
      key: 'startCondition:webhook',
      label: 'TradingView / webhook signals',
      status: 'ignored',
      when: (s: S) => eq(s['startCondition'], 'TradingviewSignals'),
      explanation:
        'Signals from outside cannot be replayed: deals open as soon as possible instead of waiting for a signal.',
    },
    {
      key: 'startCondition:manual',
      label: 'Manual start',
      status: 'ignored',
      when: (s: S) => eq(s['startCondition'], 'Manual'),
      explanation: 'Deals open automatically, as soon as possible.',
    },
    {
      key: 'startCondition:timer',
      label: 'Timer start',
      status: 'partial',
      when: (s: S) => eq(s['startCondition'], 'Timer'),
      explanation:
        'A buy happens only on a candle that opens exactly at the set time, and the next-buy date is not used. Pick a timeframe that lines up with the timer.',
    },
    {
      key: 'volumeFilter',
      label: 'Volume filters',
      status: 'ignored',
      when: (s: S) => on(s['useVolumeFilter']) || on(s['useRelativeVolumeFilter']),
      explanation:
        'There is no historical 24h-volume data in a backtest: every pair trades, whatever its volume.',
    },
    {
      key: 'botController:webhook',
      label: 'Start / stop the bot by webhook',
      status: 'ignored',
      when: (s: S) =>
        on(s['useBotController']) &&
        (eq(s['botStart'], 'webhook') || eq(s['botActualStart'], 'webhook')),
      explanation:
        'The bot runs from the first candle of the test and is never stopped by a webhook.',
    },
    {
      key: 'globalVariables',
      label: 'Global variables',
      status: 'ignored',
      when: (s: S) => {
        const vars = s['vars'] as { paths?: unknown[] } | null | undefined;
        return Array.isArray(vars?.paths) && vars.paths.length > 0;
      },
      explanation:
        "Fields bound to a variable are tested with the value stored in the field, not the variable's current value.",
    },

    // ── Orders and sizing ──────────────────────────────────────────────
    {
      key: 'orderSize:percent',
      label: 'Order size as % of balance',
      status: 'partial',
      when: (s: S) =>
        eq(s['orderSizeType'], 'percFree') || eq(s['orderSizeType'], 'percTotal'),
      explanation:
        'Sizes come from your balance when the test starts plus the profit made during the test; a server-side backtest has no balance and falls back to the exchange minimum.',
    },
    {
      key: 'reduceToAvailableBalance',
      label: 'Use available balance',
      status: 'ignored',
      when: (s: S) => on(s['reduceToAvailableBalance']),
      explanation: 'Deals are never scaled down to the balance that is free.',
    },
    {
      key: 'startOrder:limit',
      label: 'Limit base order',
      status: 'ignored',
      when: (s: S) => eq(s['startOrderType'], 'LIMIT') || on(s['useLimitPrice']),
      explanation:
        'The base order fills at the candle close (plus slippage); limit prices and limit timeouts are not used.',
    },
    {
      key: 'dcaByMarket',
      label: 'Safety orders at market',
      status: 'ignored',
      when: (s: S) => on(s['dcaByMarket']),
      explanation: 'Safety orders fill exactly at their level price.',
    },
    {
      key: 'closeOrder:market',
      label: 'Take profit at market',
      status: 'ignored',
      when: (s: S) => eq(s['closeOrderType'], 'MARKET'),
      explanation: 'Take profit fills exactly at the target price, with no slippage.',
    },

    // ── Take profit / stop loss ─────────────────────────────────────────
    {
      key: 'fixedTpSlPrices',
      label: 'Fixed TP / SL prices',
      status: 'ignored',
      when: (s: S) => on(s['useFixedTPPrices']) || on(s['useFixedSLPrices']),
      explanation: 'The take profit % and stop loss % are used instead.',
    },
    {
      key: 'dealCloseCondition:external',
      label: 'Take profit by webhook / manually',
      status: 'ignored',
      when: (s: S) =>
        on(s['useTp']) &&
        (eq(s['dealCloseCondition'], 'webhook') ||
          eq(s['dealCloseCondition'], 'manual')),
      explanation:
        'No close signal arrives in a backtest: deals end only by stop loss, timer, liquidation or the end of the test.',
    },
    {
      key: 'dealCloseConditionSL:external',
      label: 'Stop loss by webhook / manually',
      status: 'ignored',
      when: (s: S) =>
        on(s['useSl']) &&
        (eq(s['dealCloseConditionSL'], 'webhook') ||
          eq(s['dealCloseConditionSL'], 'manual')),
      explanation: 'No stop loss is simulated.',
    },
    {
      key: 'closeByTimer',
      label: 'Close by timer',
      status: 'partial',
      when: (s: S) => on(s['closeByTimer']),
      explanation: (s: S) =>
        on(s['useTp'])
          ? 'Deals close at the open of the candle after the timer runs out.'
          : 'Only applied while take profit is on, so deals here are never closed by the timer.',
    },
    {
      key: 'adaptiveClose',
      label: 'Adaptive close',
      status: 'ignored',
      when: (s: S) => on(s['adaptiveClose']),
      explanation: 'Deals close exactly at their take profit / stop loss.',
    },

    // ── Combo only ──────────────────────────────────────────────────────
    {
      key: 'combo:trailingTp',
      label: 'Trailing take profit',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['trailingTp']),
      explanation:
        'Combo backtests close at the plain take profit %. (DCA backtests do simulate trailing.)',
    },
    {
      key: 'combo:trailingSl',
      label: 'Trailing stop loss',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['useSl']) && on(s['trailingSl']),
      explanation: 'Combo backtests use a fixed stop loss.',
    },
    {
      key: 'combo:moveSl',
      label: 'Move stop loss',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['moveSL']),
      explanation: "The stop stays at the bot's stop loss % for the whole deal.",
    },
    {
      key: 'combo:multiTpSl',
      label: 'Multiple TP / SL targets',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['useMultiTp']) || on(s['useMultiSl']),
      explanation: 'A single take profit and stop loss are used.',
    },
    {
      key: 'combo:riskReward',
      label: 'Risk / reward stop',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['useRiskReward']),
      explanation: 'No risk / reward stop is placed.',
    },
    {
      key: 'combo:smartGrids',
      label: 'Smart grids',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['comboUseSmartGrids']),
      explanation: 'Every grid level is placed.',
    },
    {
      key: 'combo:autoRebalancing',
      label: 'Auto rebalancing',
      status: 'ignored',
      botTypes: ['combo'],
      when: (s: S) => on(s['autoRebalancing']),
      explanation: 'Not simulated.',
    },

    // ── Futures ─────────────────────────────────────────────────────────
    {
      key: 'futures',
      label: 'Futures: funding and liquidation',
      status: 'partial',
      when: (s: S) => on(s['futures']),
      explanation:
        'Funding fees are not charged, and liquidation is estimated from the entry price and leverage alone (no maintenance margin, no other collateral).',
    },
  ];
