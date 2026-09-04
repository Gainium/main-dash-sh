import {
  BotOrderSideEnum,
  DCADealStatusEnum,
  DCAOrderTypeEnum,
  StrategyEnum,
  type DCABotSettings,
  type DCADeals,
  type DCAGrid,
} from '@/types';
import {
  dealStrategy,
  getDealSl,
  getDealTrailing,
  mergeDealSettings,
} from '@/utils/deals/trailing';

/**
 * Chart lines for the exits an open deal will actually close on.
 *
 * The deal chart otherwise draws only orders that are RESTING on the exchange
 * plus the projected DCA ladder. That is empty for every exit the engine
 * manages itself: with trailing TP on, no TP order is ever placed (the engine
 * market-closes on its own trailing level), and stop losses are evaluated in
 * the worker rather than rested as orders. So a deal riding a trailing take
 * profit showed nothing on the chart except its breakeven line.
 *
 * Mirrors legacy main-dash's terminal chart (`components/terminal/index.tsx`),
 * which drew exactly two of these: the trailing-TP activation price while the
 * deal has not armed yet, and `trailingLevel` once it has.
 *
 * Lines the engine has ARMED render solid; ones it is still waiting on render
 * grey, the same treatment the projected DCA ladder already gets — so "this
 * will close the deal now" never looks the same as "this might, later".
 *
 * @param deal        raw deal (NOT the lossy `TradeDetails`).
 * @param botSettings the bot's settings — merged under the deal's own snapshot.
 * @param takerFee    taker fee rate (e.g. 0.001); the engine adds `2 * taker`
 *                    to every threshold as the round-trip displacement.
 * @param existingPrices prices already drawn from real resting orders, so a
 *                    computed line never doubles up on one the exchange holds.
 */
export function buildDealExitLines(
  deal: DCADeals | null | undefined,
  botSettings: Partial<DCABotSettings> | undefined,
  takerFee = 0,
  existingPrices: number[] = []
): DCAGrid[] {
  if (!deal || deal.status !== DCADealStatusEnum.open) return [];

  const settings = mergeDealSettings(botSettings, deal);
  // Direction comes from the deal when the merged settings don't carry one — a
  // terminal deal has no bot settings at all, and no deal's own settings
  // snapshot has ever had a `strategy` key (bug #642).
  const strategy = dealStrategy(deal, settings);
  const isLong = strategy === StrategyEnum.long;
  const exitSide = isLong ? BotOrderSideEnum.sell : BotOrderSideEnum.buy;
  const pair = deal.symbol?.symbol ?? '';

  // A resting order within 0.05% counts as "already on the chart" — the
  // computed price carries fee displacement the exchange copy does not.
  const isDuplicate = (price: number) =>
    existingPrices.some((p) => p > 0 && Math.abs(p - price) / price < 0.0005);

  const lines: DCAGrid[] = [];
  const push = (
    price: number,
    label: string,
    type: DCAOrderTypeEnum,
    armed: boolean
  ) => {
    if (!Number.isFinite(price) || price <= 0 || isDuplicate(price)) return;
    lines.push({
      qty: 0,
      price,
      side: exitSide,
      id: `deal-exit-${type}-${label}-${deal._id}`,
      type,
      label,
      noLabel: false,
      draggable: false,
      pair,
      strategy,
      ...(deal.exchange ? { exchange: deal.exchange } : {}),
      // `grey` is the chart's existing "projected, not live" treatment.
      ...(armed ? {} : { grey: true, greyLabel: label }),
    });
  };

  const trailing = getDealTrailing(deal, settings, takerFee);
  if (trailing.active) {
    // The live trailing stop. This is the price the deal exits at right now, so
    // it is the single most useful line on the chart while trailing is armed.
    push(trailing.level, trailing.description, DCAOrderTypeEnum.tp, true);
  } else if (trailing.pending) {
    // Not armed yet — show where trailing STARTS, so the user can see how far
    // price still has to run. Legacy parity: "Trailing take profit start".
    push(
      trailing.armPrice,
      'Trailing take profit start',
      DCAOrderTypeEnum.tp,
      false
    );
  }

  const sl = getDealSl(deal, settings, takerFee);
  if (sl.price > 0) {
    push(sl.price, sl.label, DCAOrderTypeEnum.sl, sl.moveSlActivated);
  }
  if (sl.moveSlTriggerPrice > 0) {
    // Move SL leaves no trace until it fires — it just rewrites `slPerc`. Show
    // the trigger so "my stop jumps to +X% at this price" is visible up front.
    push(
      sl.moveSlTriggerPrice,
      'Move stop loss trigger',
      DCAOrderTypeEnum.sl,
      false
    );
  }

  return lines;
}
