import React from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDealOrders } from '@/hooks/useDealOrders';
import getLatestPrices from '@/helper/price';
import {
  BotTypesEnum,
  DCAOrderTypeEnum,
  type DCABotSettings,
} from '@/types';
import { formatNumber } from '@/utils/numberFormatter';
import { useDcaBotsStore, useDealStore } from '@/stores/live';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import { splitDealOrders } from '@/utils/orders/viewOrder';
import {
  dcaLadderLevels,
  nextDcaLevelNumber,
  resolveNextLevels,
  type LadderLevel,
} from './executeNextDcaEligibility';

/** What this dialog reads off a deal. */
export interface ExecuteNextDcaTrade {
  id: string;
  botId?: string | undefined;
  symbol: string | { symbol: string; baseAsset: string; quoteAsset: string };
  strategy?: string | undefined;
  levels?: { complete: number; all: number } | undefined;
  avgPrice?: number | undefined;
  takeProfitPrice?: number | undefined;
  usage?: { current?: { base: number; quote: number } | undefined } | undefined;
  /**
   * Pre-resolved position size in base units. Preferred over `usage` because it
   * is the one field already computed with every input the engine reads
   * (futures/coinm, leverage, margin type) — `usage.current.base` is 0 on a
   * spot deal, where the position is carried in quote.
   */
  percentBasis?: { remainingBase?: number | undefined } | undefined;
}

export interface ExecuteNextDcaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The deal whose next safety order will be filled at market. Typed as the
   * structural subset actually read here rather than `TransformedTrade`,
   * because the three call sites carry three near-identical but separately
   * declared deal shapes.
   */
  trade: ExecuteNextDcaTrade;
  /**
   * Live price for the pair, when the call site has one. Falls back to the
   * deal's own last price — which for a DCA deal is the LOWEST price seen
   * (`deal.lastPrice` is a running min for longs), so it is only a fallback.
   */
  currentPrice?: number | null | undefined;
  /**
   * Invoked with the level the dialog quoted. Passed to the engine as
   * `expectedLevel` so a stale confirmation can never execute a different
   * level than the one priced here.
   */
  onConfirm: (expectedLevel: number) => void;
  isProcessing?: boolean;
}

/**
 * Confirm filling a DCA deal's next safety order now, at market.
 * https://community.gainium.io/t/execute-next-dca-manually/5072
 *
 * The projection block is best-effort: it needs the level's resting/projected
 * order to know the size, and that is only loaded while the dialog is open. The
 * dialog is still correct and safe without it — what the action DOES is stated
 * in prose either way, and the numbers are labelled as estimates because the
 * fill price is whatever the venue gives us, not what we render here.
 */
export const ExecuteNextDcaDialog: React.FC<ExecuteNextDcaDialogProps> = ({
  open,
  onOpenChange,
  trade,
  currentPrice,
  onConfirm,
  isProcessing = false,
}) => {
  const level = nextDcaLevelNumber(trade);
  const usedLevels = Math.max(0, (trade.levels?.complete ?? 1) - 1);
  const maxLevels = Math.max(0, (trade.levels?.all ?? 1) - 1);
  const isLong = `${trade.strategy}`.toLowerCase() !== 'short';

  // Only queried while the dialog is open — same gating trick TradeCard uses
  // for its orders dialog.
  const { orders } = useDealOrders(
    open ? (trade.botId ?? '') : '',
    open ? (trade.id ?? '') : '',
    BotTypesEnum.dca
  );

  /**
   * Market price. Call sites that already track one (the deal cards) pass it;
   * the deal-detail ladder does not, so the dialog subscribes for itself while
   * it is open rather than making every surface wire up a price feed. Without
   * this the cost, slippage and projected-average rows silently disappear on
   * whichever surface forgot to pass one.
   */
  const [livePrice, setLivePrice] = React.useState<number | null>(null);
  const symbolString =
    typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;
  const needsLivePrice =
    open && !(typeof currentPrice === 'number' && currentPrice > 0);
  React.useEffect(() => {
    if (!needsLivePrice) {
      return;
    }
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK') {
        const match = result.data.find((p) => p.symbol === symbolString);
        if (match) {
          setLivePrice(match.price);
        }
      }
    }, false);
    return () => {
      unsubscribe();
    };
  }, [needsLivePrice, symbolString]);

  const resolvedPrice =
    typeof currentPrice === 'number' && currentPrice > 0
      ? currentPrice
      : livePrice;
  const market =
    typeof resolvedPrice === 'number' &&
    isFinite(resolvedPrice) &&
    resolvedPrice > 0
      ? resolvedPrice
      : undefined;

  /**
   * The raw deal off the live store — initialPrice, grid breakpoints, per-deal
   * settings, pending add-funds. The same source the deal drawer projects from.
   */
  const rawDeal = useDealStore((s) =>
    trade.botId ? (s.deals[trade.botId]?.[trade.id] ?? null) : null
  );

  /**
   * The bot's FULL settings, from the live DCA bots store — again the deal
   * drawer's source. It has to be the bot record: the deals list fetches deals
   * with a settings stub (`futures`, `coinm`) and `dcaBot.settings { name }`, so
   * nothing on the deal itself can size a level. Reading `dcaBot.settings` off
   * the deal was exactly why this dialog showed no figures from the list.
   */
  const bot = useDcaBotsStore((s) =>
    trade.botId ? s.bots[trade.botId] : undefined
  );
  const botSettings = (bot as { settings?: DCABotSettings } | undefined)
    ?.settings;

  const { pendingOrders, completedOrders } = React.useMemo(
    () => splitDealOrders(open ? orders : []),
    [open, orders]
  );

  /**
   * The whole configured ladder, built from the bot's settings and the deal's
   * opening price — computed regardless of smart orders, because the level is
   * picked from it by POSITION below, not from its projected rows.
   */
  const { fullLadder } = useDealSmartOrders({
    bot: botSettings
      ? {
          settings: botSettings,
          exchangeUUID:
            (bot as { exchangeUUID?: string } | undefined)?.exchangeUUID ??
            rawDeal?.exchangeUUID,
        }
      : null,
    deal: rawDeal,
    pendingOrders,
    completedOrders,
    enabled: open,
    computeRegardlessOfSmartOrders: true,
  });

  /**
   * Indicator-triggered levels fire on a signal plus a minimum move, not at a
   * price, so they have no ladder price worth quoting. Every other condition's
   * level does — for DCA-by-market it is the price that triggers the market
   * buy.
   */
  const isIndicatorDca = botSettings?.dcaCondition === 'indicators';

  const { current: nextLevel, after: levelAfter } = React.useMemo(() => {
    if (!open) {
      return { current: undefined, after: undefined };
    }
    const resting: LadderLevel[] = orders
      .filter(
        (o) =>
          o.typeOrder === 'dealRegular' &&
          (o.status === 'NEW' || o.status === 'PARTIALLY_FILLED')
      )
      .map((o) => ({
        price: parseFloat(o.price),
        qty: parseFloat(o.origQty),
        baseAsset: o.baseAsset,
        quoteAsset: o.quoteAsset,
        projected: false,
      }));
    // A resting limit add-funds order is dealRegular too; it is not a level.
    const excludePrices = (rawDeal?.pendingAddFunds ?? [])
      .filter((p) => p.useLimitPrice && p.limitPrice)
      .map((p) => Number(p.limitPrice));
    return resolveNextLevels({
      resting,
      ladder: dcaLadderLevels(fullLadder, DCAOrderTypeEnum.dca),
      levelsComplete: trade.levels?.complete ?? 1,
      isLong,
      excludePrices,
    });
  }, [open, orders, fullLadder, rawDeal, trade.levels?.complete, isLong]);

  // The level carries its own assets, which beats re-splitting a concatenated
  // pair string (the splitter has genuine ambiguity on 4-char quotes).
  // When the level comes from the ladder rather than a resting order it has no
  // assets of its own, and on the deals list `trade.symbol` is a bare string —
  // so fall back to the raw deal's symbol, or the figures render unitless.
  const symbolObj = typeof trade.symbol === 'object' ? trade.symbol : undefined;
  const baseAsset =
    nextLevel?.baseAsset ??
    symbolObj?.baseAsset ??
    rawDeal?.symbol?.baseAsset ??
    '';
  const quoteAsset =
    nextLevel?.quoteAsset ??
    symbolObj?.quoteAsset ??
    rawDeal?.symbol?.quoteAsset ??
    '';

  const ladderPrice = isIndicatorDca ? undefined : nextLevel?.price;
  const qty = nextLevel?.qty;

  // How far from the ladder price we would be filling. Signed so that a
  // POSITIVE number always means "worse for this deal" on either side.
  const slippagePerc =
    ladderPrice && market
      ? ((isLong ? market - ladderPrice : ladderPrice - market) / ladderPrice) *
        100
      : undefined;

  // Projected average, from the deal's own books: current position and cost are
  // the only inputs, so this holds for spot and futures alike.
  const projected = React.useMemo(() => {
    const avg = trade.avgPrice;
    // How much base the deal currently holds. Three sources, best first:
    // `percentBasis.remainingBase` is already leverage/coinm-aware; then the
    // usage snapshot's base; and finally quote/avg, which is the only one that
    // works for a spot deal (there `usage.current.base` is 0 and the position
    // lives in `quote`). Without the fallback the projection silently vanished
    // on every spot deal.
    const baseNow =
      trade.percentBasis?.remainingBase ||
      trade.usage?.current?.base ||
      (avg && trade.usage?.current?.quote
        ? trade.usage.current.quote / avg
        : 0);
    if (!avg || !market || !qty || !baseNow || baseNow <= 0) {
      return undefined;
    }
    const costNow = avg * baseNow;
    const nextAvg = (costNow + market * qty) / (baseNow + qty);
    if (!isFinite(nextAvg) || nextAvg <= 0) {
      return undefined;
    }
    // Carry the deal's own TP distance across rather than re-deriving it from
    // settings — `takeProfitPrice` is what the deal is actually working to.
    const tpNow = trade.takeProfitPrice;
    const nextTp =
      tpNow && avg > 0 ? nextAvg * (tpNow / avg) : undefined;
    return { nextAvg, nextTp, avg, tpNow };
  }, [
    trade.avgPrice,
    trade.usage,
    trade.percentBasis,
    trade.takeProfitPrice,
    market,
    qty,
  ]);

  const fmt = (v: number | undefined) =>
    typeof v === 'number' && isFinite(v) ? formatNumber(v) : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Execute next DCA now
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {ladderPrice
              ? `Safety order ${level} will be filled at market instead of waiting for ${fmt(ladderPrice)}. The deal counts it as level ${level} and continues with level ${level + 1} at its original price.`
              : `Safety order ${level} will be filled at market now, without waiting for its condition. The deal counts it as level ${level} and continues with level ${level + 1} as configured.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          <div className="grid grid-cols-2 gap-sm text-sm">
            <div className="rounded-lg bg-muted/20 p-sm">
              <div className="text-xs text-muted-foreground">
                {ladderPrice ? 'Ladder price' : 'DCA levels used'}
              </div>
              <div className="text-lg font-medium">
                {ladderPrice ? fmt(ladderPrice) : `${usedLevels} / ${maxLevels}`}
              </div>
            </div>
            <div className="rounded-lg bg-muted/20 p-sm">
              <div className="text-xs text-muted-foreground">Market price</div>
              <div className="text-lg font-medium">{fmt(market)}</div>
            </div>
          </div>

          {(qty || projected) && (
            <div className="rounded-lg border border-border overflow-hidden text-sm">
              {qty ? (
                <div className="flex justify-between px-sm py-xs border-b border-border/60">
                  <span className="text-muted-foreground">Amount</span>
                  <span>
                    {fmt(qty)} {baseAsset}
                  </span>
                </div>
              ) : null}
              {qty && market ? (
                <div className="flex justify-between px-sm py-xs border-b border-border/60">
                  <span className="text-muted-foreground">Estimated cost</span>
                  <span>
                    {fmt(qty * market)} {quoteAsset}
                  </span>
                </div>
              ) : null}
              {projected ? (
                <div className="flex justify-between px-sm py-xs border-b border-border/60 bg-primary/5">
                  <span className="text-muted-foreground">Average price</span>
                  <span>
                    {fmt(projected.avg)}{' '}
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="font-medium">{fmt(projected.nextAvg)}</span>
                  </span>
                </div>
              ) : null}
              {projected?.nextTp ? (
                <div className="flex justify-between px-sm py-xs border-b border-border/60 bg-primary/5">
                  <span className="text-muted-foreground">Take profit</span>
                  <span>
                    {fmt(projected.tpNow)}{' '}
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="font-medium">{fmt(projected.nextTp)}</span>
                  </span>
                </div>
              ) : null}
              <div
                className={
                  levelAfter
                    ? 'flex justify-between px-sm py-xs border-b border-border/60'
                    : 'flex justify-between px-sm py-xs'
                }
              >
                <span className="text-muted-foreground">DCA level</span>
                <span>
                  {usedLevels} / {maxLevels}
                  <span className="text-muted-foreground mx-1">→</span>
                  {usedLevels + 1} / {maxLevels}
                </span>
              </div>
              {/* The rung after this one, spelled out. Executing early does not
                  move it: every level's price and size come from the deal's
                  opening price and the bot's settings, never from where an
                  earlier level actually filled — so showing it is the clearest
                  way to say "nothing below shifts". */}
              {levelAfter ? (
                <div className="flex justify-between px-sm py-xs">
                  <span className="text-muted-foreground">
                    Level {level + 1} after this
                  </span>
                  <span>
                    {fmt(levelAfter.qty)} {baseAsset}
                    <span className="text-muted-foreground"> @ </span>
                    {fmt(levelAfter.price)}
                    <span className="text-muted-foreground"> · unchanged</span>
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <Alert className="border-warning/40 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-sm text-muted-foreground">
              {typeof slippagePerc === 'number' && slippagePerc > 0
                ? `Filled at market — about ${slippagePerc.toFixed(2)}% worse than the ladder price. `
                : 'Filled at market, so the fill price is whatever the exchange gives. '}
              {ladderPrice
                ? 'Any resting order at that level is cancelled first. '
                : ''}
              The levels below keep the prices and sizes they were configured
              with — they are worked out from the deal's opening price, not
              from where this one fills — and the take profit is re-placed
              against the new average. Figures here are estimates.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(level)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Processing…' : `Execute level ${level}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
