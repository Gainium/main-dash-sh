import logger from '@/lib/loggerInstance';

/**
 * Map order type to human-readable name
 * Copied from main-dash to ensure consistency with backend
 */
export const mapOrderName = (
  typeOrder: string | undefined,
  sl: boolean = false
): string => {
  if (!typeOrder) {
    return 'Unknown order';
  }
  switch (typeOrder) {
    case 'dealStart':
      return 'Base order';
    case 'dealTP':
      return sl ? 'SL order' : 'TP order';
    case 'dealRegular':
      return 'DCA order';
    case 'swap':
      return 'Start order';
    case 'regular':
      return 'Regular order';
    case 'stop':
      return 'Stop order';
    case 'stab':
      return 'Stabilization order';
    case 'dealGrid':
      return 'Combo grid order';
    case 'fee':
      return 'Fee order';
    case 'rebalance':
      return 'Rebalance order';
    case 'br':
      // "br" likely stands for "break" or "breakout" order type
      // This is not in the GraphQL schema enum but appears in backend data
      logger.warn('[mapOrderName] Unknown order type "br" encountered');
      return 'Breakout order';
    case 'split':
      return 'Split order';
    case 'liquidation':
      return 'Liquidation order';
    default:
      // Log unknown order types for debugging
      if (typeOrder && typeOrder !== '') {
        logger.warn(`[mapOrderName] Unknown order type: "${typeOrder}"`);
      }
      return typeOrder || 'Unknown order';
  }
};

/**
 * Check if an order ID is a ROA (Add funds) order
 * ROA orders have specific ID patterns
 */
export const isRoaOrder = (orderId: string): boolean => {
  return (
    orderId.includes('D-ROA') || orderId.startsWith('4b1c2ba2186cBCDEDROA')
  );
};

/**
 * Get full order type label including add/reduce funds annotations
 * @param typeOrder - The order type code
 * @param sl - Whether this is a stop loss order
 * @param orderId - The order ID (to check for ROA pattern)
 * @param reduceFundsId - If present, this is a reduce funds order
 * @param isRealOrder - If true, this is an actual order (vs projected order)
 * @param baseRemainder - The order is the rest of a part-filled base order
 *   (see `baseRemainderAddFundsIds`)
 */
export const getOrderTypeLabel = (
  typeOrder: string | undefined,
  sl: boolean = false,
  orderId?: string,
  reduceFundsId?: string,
  isRealOrder: boolean = true,
  baseRemainder: boolean = false
): string => {
  if (baseRemainder) {
    return 'Base order (remainder)';
  }
  const baseName = mapOrderName(typeOrder, sl);

  // For real orders, check for add/reduce funds annotations
  if (isRealOrder) {
    if (orderId && isRoaOrder(orderId) && typeOrder === 'dealRegular') {
      return `${baseName} (Add funds order)`;
    }
    if (reduceFundsId) {
      return `${baseName} (Reduce funds order)`;
    }
  }

  return baseName;
};

type RemainderOrder = {
  dealId?: string | null;
  typeOrder?: string | null;
  side?: string | null;
  addFundsId?: string | null;
  origQty?: string | number | null;
  executedQty?: string | number | null;
};

type RemainderDeal = {
  funds?: { id?: string | null; baseRemainder?: boolean | null }[] | null;
  pendingAddFunds?:
    | { id?: string | null; baseRemainder?: boolean | null }[]
    | null;
};

const sameQty = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(Math.abs(a), Math.abs(b));

/**
 * The `addFundsId`s of add-funds orders that are the rest of a part-filled
 * LIMIT base order, which the bot places as an add-funds order and whose
 * fill is not funds the user added.
 *
 * The deal's own `baseRemainder` marker (on its pending entry, and on the
 * `funds` entry booked by the fill) names them. Fills booked before the
 * marker was recorded are recognised from the orders: the first is placed for
 * exactly the base order's `origQty - executedQty`, and each re-placement for
 * what the previous one left unfilled.
 */
export const baseRemainderAddFundsIds = (
  orders: readonly RemainderOrder[],
  deal?: RemainderDeal | null
): Set<string> => {
  const ids = new Set<string>();
  for (const entry of [...(deal?.funds ?? []), ...(deal?.pendingAddFunds ?? [])]) {
    if (entry?.baseRemainder && entry.id) {
      ids.add(entry.id);
    }
  }
  for (const base of orders) {
    const origQty = +(base.origQty ?? NaN);
    const executedQty = +(base.executedQty ?? NaN);
    if (
      base.typeOrder !== 'dealStart' ||
      !(executedQty > 0) ||
      !(executedQty < origQty)
    ) {
      continue;
    }
    const candidates = orders.filter(
      (o) =>
        o.addFundsId &&
        o.typeOrder === 'dealRegular' &&
        o.dealId === base.dealId &&
        (!o.side || !base.side || o.side === base.side)
    );
    const chain = new Set<RemainderOrder>();
    let rest = origQty - executedQty;
    for (let found = true; found && rest > 0; ) {
      const next = candidates.find(
        (o) => !chain.has(o) && sameQty(+(o.origQty ?? NaN), rest)
      );
      found = !!next;
      if (next) {
        chain.add(next);
        ids.add(next.addFundsId as string);
        rest -= +(next.executedQty ?? 0) || 0;
      }
    }
  }
  return ids;
};
