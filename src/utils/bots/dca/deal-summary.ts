import { BotMarginTypeEnum, StrategyEnum, type DCAGrid } from '@/types';

const trimTrailingZeros = (value: string): string =>
  value.includes('.') ? value.replace(/\.?0+$/, '') : value;

export interface TotalFundsContext {
  strategy?: StrategyEnum | string;
  futures?: boolean;
  coinm?: boolean;
  baseAsset?: string;
  quoteAsset?: string;
}

// "Total Funds" tile value. Funds are deposited in the base coin for
// spot short and coin-M futures, so those show the base figure with
// the base symbol; everything else keeps the quote figure with `$`.
export const formatTotalFunds = (
  summary: { totalCapital: number; totalCapitalBase: number },
  ctx: TotalFundsContext
): string => {
  const useBase = ctx.futures
    ? Boolean(ctx.coinm)
    : ctx.strategy === StrategyEnum.short;

  if (useBase) {
    const amount = summary.totalCapitalBase || 0;
    const abs = Math.abs(amount);
    const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
    return `${trimTrailingZeros(amount.toFixed(decimals))} ${ctx.baseAsset ?? 'Base'}`;
  }

  return `$${(summary.totalCapital || 0).toFixed(2)}`;
};

export interface FundsTile {
  title: string;
  value: string;
  tooltip?: string;
}

export interface FundsTilesContext extends TotalFundsContext {
  leverage?: number;
  marginType?: string;
}

// The deal overview's funds tiles. Order sizes on a futures bot are position
// sizes, so the deal total is the nominal value and the collateral it ties up
// is that divided by the leverage. Spot keeps the single "Total Funds" tile.
// With inherited margin the bot doesn't set the leverage, so only the nominal
// figure is known.
export const fundsTiles = (
  summary: { totalCapital: number; totalCapitalBase: number },
  ctx: FundsTilesContext,
  spotTitle = 'Total Funds'
): FundsTile[] => {
  if (!ctx.futures) {
    return [{ title: spotTitle, value: formatTotalFunds(summary, ctx) }];
  }

  const tiles: FundsTile[] = [
    {
      title: 'Nominal',
      value: formatTotalFunds(summary, ctx),
      tooltip:
        'Full position size of one deal once every order has filled, before leverage.',
    },
  ];

  const leverage = Number(ctx.leverage) || 0;
  if (ctx.marginType !== BotMarginTypeEnum.inherit && leverage > 0) {
    tiles.push({
      title: 'Margin',
      value: formatTotalFunds(
        {
          totalCapital: summary.totalCapital / leverage,
          totalCapitalBase: summary.totalCapitalBase / leverage,
        },
        ctx
      ),
      tooltip: `Collateral one deal needs once every order has filled: nominal ÷ ${leverage}x leverage.`,
    });
  }

  return tiles;
};

export interface DealOverviewSummary {
  /** Distance from the first buy to the last buy, as an absolute % string. */
  coverage: string;
  /** Distance from the first buy to the final average price, abs % string. */
  avgDownPower: string;
  /** Total quote capital committed across the deal (incl. combo minigrids). */
  totalCapital: number;
  /** Base-currency equivalent of the committed capital. */
  totalCapitalBase: number;
  /** Capital reserved for the initial base order (quote). */
  baseOrderCapital: number;
  /** Base-currency equivalent of the base-order capital. */
  baseOrderCapitalBase: number;
}

export const EMPTY_DEAL_SUMMARY: DealOverviewSummary = {
  coverage: '0.00',
  avgDownPower: '0.00',
  totalCapital: 0,
  totalCapitalBase: 0,
  baseOrderCapital: 0,
  baseOrderCapitalBase: 0,
};

// Pure projection of a generated DCA/combo order grid into the headline
// "deal overview" figures. Shared between the form's live overview
// (useDealOverviewData, fed by exampleOrdersStore) and the bot drawer's
// projection widget (useBotDcaProjection, fed by createDCAOrders directly) so
// both surfaces stay numerically identical.
export const computeDealSummary = (orders: DCAGrid[]): DealOverviewSummary => {
  const entryTypes = ['Start order', 'DCA order', 'Smart order'];
  const mapped = orders
    .filter((order) => !order.hide)
    .map((order) => ({
      type: order.type || 'Smart order',
      side: order.side,
      price: order.price,
      avgPrice: order.avgPrice,
      // Graph quantity is the quote notional of the order.
      quantity: order.qty * order.price,
      totalQuote: order.quote,
      totalBase: order.base,
    }));

  const buyOrders = mapped.filter((o) => entryTypes.includes(o.type));
  if (buyOrders.length === 0) {
    return EMPTY_DEAL_SUMMARY;
  }

  const referencePrice = buyOrders[0].price;
  const lastBuy = buyOrders[buyOrders.length - 1];

  const coverage =
    lastBuy && referencePrice
      ? Math.abs(
          ((lastBuy.price - referencePrice) / referencePrice) * 100
        ).toFixed(2)
      : '0.00';

  const lastBuyAvgPrice = lastBuy?.avgPrice;
  const avgDownPower =
    lastBuyAvgPrice && referencePrice
      ? Math.abs(
          ((lastBuyAvgPrice - referencePrice) / referencePrice) * 100
        ).toFixed(2)
      : '0.00';

  // For DCA-only flows the cumulative `totalQuote` on the last buy order
  // already represents the full capital commitment. Combo bots additionally
  // reserve funds for minigrid (`Grid` type) orders that sit alongside each
  // DCA/base order — those aren't reflected in any single DCA row's cumulative
  // `totalQuote`. Detect combo by the presence of grid-type buy orders and add
  // their notional cost so "Total funds" matches what's actually deployed.
  const baseCapital = lastBuy?.totalQuote || buyOrders[0]?.totalQuote || 0;
  const minigridCapital = mapped
    .filter(
      (o) =>
        o.type === 'Grid' &&
        o.side === 'BUY' &&
        typeof o.quantity === 'number' &&
        Number.isFinite(o.quantity)
    )
    .reduce((acc, o) => acc + o.quantity, 0);
  const totalCapital = baseCapital + minigridCapital;

  // Base-currency equivalent of the cumulative capital. Spot short bots
  // deposit the base coin they sell, so the funds tile shows this instead of
  // the quote figure (minigrid base isn't tracked separately, so combo short
  // slightly under-reports — DCA short, the common case, is exact).
  const totalCapitalBase = lastBuy?.totalBase || buyOrders[0]?.totalBase || 0;

  // The first entry order is the base order; its cumulative figure is the
  // base-order capital for a single deal.
  const baseOrderCapital = buyOrders[0]?.totalQuote || 0;
  const baseOrderCapitalBase = buyOrders[0]?.totalBase || 0;

  return {
    coverage,
    avgDownPower,
    totalCapital,
    totalCapitalBase,
    baseOrderCapital,
    baseOrderCapitalBase,
  };
};
