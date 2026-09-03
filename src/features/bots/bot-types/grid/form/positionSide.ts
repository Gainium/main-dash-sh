import { FuturesStrategyEnum, StrategyEnum } from '@/types';

/**
 * Futures grids carry a THIRD position side that spot grids have no analogue
 * for: NEUTRAL, which opens no position at start and simply works the grid.
 * The engine reads `settings.futuresStrategy` for futures bots and only falls
 * back to the spot `strategy` when that value is NEUTRAL
 * (`core/src/bot/helper.ts` → `get isShort()`), so a futures grid must bind
 * its side control to `futuresStrategy`, not to `strategy`.
 *
 * Shared by the Manual form's Strategy section and Quick Setup so the two
 * can't drift apart.
 */
export const FUTURES_STRATEGY_OPTIONS = [
  { value: FuturesStrategyEnum.long, label: 'Long' },
  { value: FuturesStrategyEnum.neutral, label: 'Neutral' },
  { value: FuturesStrategyEnum.short, label: 'Short' },
];

/**
 * The `strategy` value that matches a given position side, so the engine's
 * NEUTRAL fallback can never contradict what the form shows. Neutral maps to
 * long, which is the side legacy left `strategy` on for every futures grid.
 */
export const mirroredSpotStrategy = (
  futuresStrategy: FuturesStrategyEnum | undefined
): StrategyEnum =>
  futuresStrategy === FuturesStrategyEnum.short
    ? StrategyEnum.short
    : StrategyEnum.long;

export const FUTURES_STRATEGY_TOOLTIP =
  'Long: open a long position at the start. Buy orders increase the position, sell orders reduce it. ' +
  'Short: open a short position at the start. Sell orders increase the position, buy orders reduce it. ' +
  'Neutral: no position is opened at the start — the grid trades both sides from flat. One-way mode only.';
