import { BotMarginTypeEnum } from '@/types';

export interface CostReferenceInput {
  futures: boolean | undefined;
  orderSizeType: string | undefined;
  orderSizeReference: 'notional' | 'cost' | undefined;
  marginType: string | undefined;
  leverage: number | string | undefined;
}

/**
 * Factor between a futures order amount as typed and as stored. With the
 * "Cost" order-size reference the user types the margin; the bot stores the
 * notional value (margin × leverage). Notional, spot, percentage references and
 * `inherit` margin all return 1. Same rule as the Base Order field
 * (`useStrategySettignsTab` `convertDisplayToNotional`) and legacy V1's
 * `assetMultiplier` in `DcaModeSettings`.
 */
export const costReferenceMultiplier = ({
  futures,
  orderSizeType,
  orderSizeReference,
  marginType,
  leverage,
}: CostReferenceInput): number => {
  if (!futures || orderSizeReference !== 'cost') {
    return 1;
  }
  if (orderSizeType === 'percFree' || orderSizeType === 'percTotal') {
    return 1;
  }
  if (marginType === BotMarginTypeEnum.inherit) {
    return 1;
  }
  const parsed = Math.round(Number(leverage));
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
};
