import { DCACloseTriggerEnum, DCADealFlags } from '@/types';

/**
 * How a deal whose position was closed on the exchange (not by the bot) must
 * be shown. The backend marks such a deal with the `closedExternally` flag,
 * plus `profitUnknown` when the exchange's fills could not price the close —
 * its stored profit is then only what it had realised before, not its result.
 */
export interface DealClosedOutside {
  /** The stored profit is not the deal's result; show "Unknown" instead. */
  profitUnknown: boolean;
  /** Short badge text for the close. */
  label: string;
  /** Tooltip explaining the badge / the unknown profit. */
  tooltip: string;
}

type DealCloseFields = {
  flags?: readonly (string | null | undefined)[] | null | undefined;
  closeTrigger?: string | null | undefined;
};

export const PROFIT_UNKNOWN_TOOLTIP =
  "Closed outside Gainium. The exchange's fills do not show the close, so this deal's profit is unknown. Check the position history on the exchange for the real result.";

const LIQUIDATED_TOOLTIP =
  "The exchange liquidated this deal's position. The profit shown was taken from the exchange's fills.";

const CLOSED_ON_EXCHANGE_TOOLTIP =
  "This deal's position was closed on the exchange, outside Gainium. The profit shown was taken from the exchange's fills.";

/**
 * `null` for every deal the bot closed itself — those render exactly as
 * before.
 */
export function dealClosedOutside(
  deal: DealCloseFields
): DealClosedOutside | null {
  const flags = deal.flags ?? [];
  if (!flags.includes(DCADealFlags.closedExternally)) return null;
  if (flags.includes(DCADealFlags.profitUnknown)) {
    return {
      profitUnknown: true,
      label: 'Profit unknown',
      tooltip: PROFIT_UNKNOWN_TOOLTIP,
    };
  }
  if (deal.closeTrigger === DCACloseTriggerEnum.liquidation) {
    return {
      profitUnknown: false,
      label: 'Liquidated',
      tooltip: LIQUIDATED_TOOLTIP,
    };
  }
  return {
    profitUnknown: false,
    label: 'Closed on exchange',
    tooltip: CLOSED_ON_EXCHANGE_TOOLTIP,
  };
}

/**
 * True when a CLOSED deal's stored profit must not be shown as its result.
 * An open deal is never affected: the flag is only set on the close.
 */
export function isDealProfitUnknown(
  deal: DealCloseFields & { active?: boolean | undefined }
): boolean {
  return !deal.active && !!dealClosedOutside(deal)?.profitUnknown;
}
