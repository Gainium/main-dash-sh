import React from 'react';
import { PlayCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PendingLiveValue } from '@/components/ui/pending-live-value';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import getLatestPrices, { getPricesFetchedAt } from '@/helper/price';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useHedgeFundingPreview,
  useHedgeLegTotals,
} from '@/hooks/useHedgeStartFunding';
import {
  buildHedgeConfig,
  defaultHedgeLegAction,
  hedgeLegActionLabel,
  hedgeLegActionOptions,
  hedgeLegPreviewInput,
  hedgeStartLegs,
  resolvePairPrice,
  type HedgeLegSide,
  type HedgeStartLeg,
} from '@/lib/baseFunding/hedgeFunding';
import type {
  HedgeFundingLegPreview,
  PreviewHedgeFundingInput,
} from '@/lib/baseFunding/hedgeFundingApi';
import { cn } from '@/lib/utils';
import { useBalanceStore } from '@/stores/live';
import { ActionsEnum, StrategyEnum, type Prices } from '@/types';

export interface HedgeStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botName: string;
  /** Hedge combo legs run the combo ladder; hedge DCA legs the DCA one. */
  combo: boolean;
  /** The hedge wrapper (`{ bots: [long, short] }`). */
  hedge: unknown;
  onConfirm: (hedgeConfig: Record<HedgeLegSide, ActionsEnum>) => void;
  isProcessing?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 1 ? 4 : 8 });

const ACTION_TOOLTIP =
  'Use balance: the leg runs on the coin it already holds. Difference: the bot uses what you hold first and trades only the shortfall, before the deal opens. For all: the bot trades for everything the safety orders need. Use opposite balance: the leg runs on the other coin of the pair. The estimate covers both legs together, since they share the account.';
const RESERVED_TOOLTIP =
  'The base order is recorded at the current price without a trade. This amount is kept aside for the take profit and is not available to other bots.';
const TRADE_TOOLTIP =
  'Placed at market when the deal opens, before the safety orders. An estimate: both legs share the account, and the bot plans again at that moment, so the amount can differ slightly.';
const PENDING_TOOLTIP =
  'Waiting for the price and the funding estimate. Start is available once it has loaded.';
const MIN_TOOLTIP = ' Raised to the exchange minimum order size.';

const sideLabel = (side: HedgeLegSide) =>
  side === StrategyEnum.long ? 'Long' : 'Short';

const Row: React.FC<{
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}> = ({ label, tooltip, children }) => (
  <div className="flex items-center justify-between gap-sm text-sm">
    <span className="flex items-center gap-xs text-muted-foreground">
      {label}
      {tooltip ? (
        <Tooltip tooltip={tooltip}>
          <InfoIcon />
        </Tooltip>
      ) : null}
    </span>
    <span className="font-medium tabular-nums">{children}</span>
  </div>
);

const LegFunding: React.FC<{
  leg: HedgeStartLeg;
  plan: HedgeFundingLegPreview;
  baseAsset: string;
  quoteAsset: string;
}> = ({ leg, plan, baseAsset, quoteAsset }) => {
  if (plan.kind === 'refuse') {
    return (
      <div className="text-sm text-destructive" role="alert">
        {plan.message ||
          `Not enough ${plan.needAsset ?? ''}: ≈ ${fmt(plan.required ?? 0)} needed, ${fmt(
            plan.held ?? 0
          )} available`}
      </div>
    );
  }
  const required = plan.required ?? 0;
  const held = plan.held ?? 0;
  const heldUsed = Math.min(held, required);
  const reserved = plan.reservedForEntry ?? 0;
  const reservedAsset = leg.side === StrategyEnum.short ? quoteAsset : baseAsset;
  const trades = plan.kind === 'fund' && (plan.tradeBaseQty ?? 0) > 0;
  const forAll =
    plan.action === ActionsEnum.buyForAll || plan.action === ActionsEnum.sellForAll;
  return (
    <div className="space-y-xs">
      {trades ? (
        <Row
          label={plan.tradeSide === 'SELL' ? 'Bot sells at market' : 'Bot buys at market'}
          tooltip={TRADE_TOOLTIP + (plan.raisedToMin ? MIN_TOOLTIP : '')}
        >
          ≈ {fmt(plan.tradeBaseQty ?? 0)} {baseAsset} ({fmt(plan.tradeQuote ?? 0)}{' '}
          {quoteAsset})
        </Row>
      ) : null}
      {/* A "for all" leg trades for everything: a held figure next to its
          market trade reads as part of it, so it is left out. */}
      {heldUsed > 0 && plan.needAsset && !forAll ? (
        <Row label="Held used">
          ≈ {fmt(heldUsed)} {plan.needAsset}
        </Row>
      ) : null}
      {reserved > 0 ? (
        <Row label="Reserved for entry" tooltip={RESERVED_TOOLTIP}>
          ≈ {fmt(reserved)} {reservedAsset}
        </Row>
      ) : null}
    </div>
  );
};

/**
 * Start dialog of a hedge bot with a spot leg (main-app spec 044 phase 3):
 * the start action per leg — the legacy dialog's choice, sent as
 * `changeStatus.hedgeConfig` — and what the bot would trade or reserve for it.
 * Futures legs are not listed and start on their balance. An API without the
 * funding preview still starts the bot with the chosen actions.
 */
export const HedgeStartDialog: React.FC<HedgeStartDialogProps> = ({
  open,
  onOpenChange,
  botName,
  combo,
  hedge,
  onConfirm,
  isProcessing = false,
}) => {
  const allLegs = React.useMemo(() => hedgeStartLegs(hedge), [hedge]);
  const legs = React.useMemo(
    () => allLegs.filter((leg) => !leg.futures),
    [allLegs]
  );

  const [prices, setPrices] = React.useState<Prices>([]);
  React.useEffect(() => {
    if (!open) return undefined;
    return getLatestPrices((res) => setPrices(res.data ?? []), false);
  }, [open]);

  // Last price seen per pair while the dialog is mounted: a poll that misses
  // the pair keeps the previous price instead of dropping the preview.
  const priceMemory = React.useRef(new Map<string, number>());
  const legPrices = React.useMemo(() => {
    const out = new Map<HedgeStartLeg, { price: number; remembered: boolean }>();
    for (const leg of legs) {
      out.set(leg, resolvePairPrice(prices, leg, priceMemory.current));
    }
    return out;
  }, [prices, legs]);
  const priceOf = React.useCallback(
    (leg: HedgeStartLeg) => legPrices.get(leg)?.price ?? 0,
    [legPrices]
  );
  const priceRemembered = legs.some((leg) => legPrices.get(leg)?.remembered);
  const priceLive = getPricesFetchedAt() > 0 && !priceRemembered;

  const totals = useHedgeLegTotals(legs, combo, priceOf, open);

  const balances = useBalanceStore((s) => s.balances);
  const freeOf = React.useCallback(
    (leg: HedgeStartLeg) => {
      const find = (asset: string) =>
        Number(
          balances.find((b) => b.exchangeUUID === leg.exchangeUUID && b.asset === asset)
            ?.free ?? 0
        ) || 0;
      return { base: find(leg.baseAsset), quote: find(leg.quoteAsset) };
    },
    [balances]
  );

  // Chosen action per leg. A leg the user has not touched follows its
  // default, which settles once the ladder (and so the deal size) is known.
  const [touched, setTouched] = React.useState<
    Partial<Record<HedgeLegSide, ActionsEnum>>
  >({});
  React.useEffect(() => {
    if (!open) setTouched({});
  }, [open]);
  const chosen = React.useMemo(() => {
    const out: Partial<Record<HedgeLegSide, ActionsEnum>> = {};
    for (const leg of legs) {
      const options = hedgeLegActionOptions(leg.side, leg.useDca);
      const pick = touched[leg.side];
      out[leg.side] =
        pick && options.includes(pick)
          ? pick
          : defaultHedgeLegAction(
              leg.side,
              leg.useDca,
              totals[leg.side] ?? {
                baseOrderQty: 0,
                baseOrderQuote: 0,
                safetyQty: 0,
                safetyQuote: 0,
                safetyLevels: 0,
              },
              freeOf(leg)
            );
    }
    return out;
  }, [legs, touched, totals, freeOf]);

  const anchor = legs[0];
  const anchorPrice = anchor ? priceOf(anchor) : 0;
  const roundedPrice = anchorPrice > 0 ? Number(anchorPrice.toPrecision(6)) : 0;
  const previewInput = React.useMemo<PreviewHedgeFundingInput | null>(() => {
    if (!open || !anchor || !(roundedPrice > 0)) return null;
    const legInputs = legs.flatMap((leg) => {
      const t = totals[leg.side];
      const action = chosen[leg.side];
      return t && action
        ? [hedgeLegPreviewInput(leg, action, t, combo ? t.combo : undefined)]
        : [];
    });
    if (legInputs.length !== legs.length) return null;
    return {
      exchangeUUID: anchor.exchangeUUID,
      exchange: anchor.exchange,
      pair: anchor.pair,
      price: roundedPrice,
      legs: legInputs,
    };
  }, [open, anchor, legs, totals, chosen, roundedPrice, combo]);
  // Debounced by value: live balance ticks rebuild the object, not the input.
  const inputKey = previewInput ? JSON.stringify(previewInput) : '';
  const debouncedKey = useDebounce(inputKey, 300);
  const debouncedInput = React.useMemo<PreviewHedgeFundingInput | null>(
    () =>
      debouncedKey ? (JSON.parse(debouncedKey) as PreviewHedgeFundingInput) : null,
    [debouncedKey]
  );
  const settling = debouncedKey !== inputKey;
  const { backend, preview, current, failure } =
    useHedgeFundingPreview(debouncedInput);

  // Start waits for a plan of the current choice. The one exception is an
  // API without the preview (old backend): it starts with the chosen actions
  // as before. No price yet, a ladder still building, a request in flight or
  // a failed request all keep Start disabled.
  const oldBackend = backend === 'old';
  const ready = oldBackend || (current && !settling && !!preview);
  const waiting = !oldBackend && !ready;
  const failed = waiting && !settling && !!failure;
  const showPreview = !oldBackend && !!preview;
  const planOf = (side: HedgeLegSide) =>
    showPreview ? preview?.legs.find((l) => l.side === side) : undefined;
  const refused = legs.some((leg) => planOf(leg.side)?.kind === 'refuse');

  const handleConfirm = () => {
    if (refused || waiting || isProcessing) return;
    onConfirm(buildHedgeConfig(allLegs, chosen));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-sm">
            <PlayCircle className="h-5 w-5" />
            Start hedge bot
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {botName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          {legs.map((leg) => {
            const options = hedgeLegActionOptions(leg.side, leg.useDca);
            const plan = planOf(leg.side);
            const assets = {
              baseAsset: preview?.baseAsset || leg.baseAsset,
              quoteAsset: preview?.quoteAsset || leg.quoteAsset,
            };
            const id = `hedge-start-action-${leg.side}`;
            return (
              <div
                key={leg.side}
                className="space-y-sm rounded-lg bg-muted/20 p-sm"
                data-testid={`hedge-start-leg-${leg.side}`}
              >
                <div className="flex items-center justify-between gap-sm">
                  <Label htmlFor={id} className="flex items-center gap-xs">
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wide',
                        leg.side === StrategyEnum.long
                          ? 'text-success'
                          : 'text-destructive'
                      )}
                    >
                      {sideLabel(leg.side)}
                    </span>
                    <Tooltip tooltip={ACTION_TOOLTIP}>
                      <InfoIcon />
                    </Tooltip>
                  </Label>
                  <Select
                    value={chosen[leg.side]}
                    onValueChange={(value) =>
                      setTouched((prev) => ({
                        ...prev,
                        [leg.side]: value as ActionsEnum,
                      }))
                    }
                    disabled={isProcessing}
                  >
                    <SelectTrigger
                      id={id}
                      size="sm"
                      className="min-w-[12rem]"
                      aria-label={`${sideLabel(leg.side)} start action`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((action) => (
                        <SelectItem key={action} value={action}>
                          {hedgeLegActionLabel(action, leg.side, assets)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {plan ? (
                  <PendingLiveValue
                    pending={!priceLive}
                    className="block w-full"
                  >
                    <div
                      className={cn(
                        'w-full transition-opacity',
                        waiting && 'opacity-50'
                      )}
                      aria-busy={waiting}
                    >
                      <LegFunding
                        leg={leg}
                        plan={plan}
                        baseAsset={assets.baseAsset}
                        quoteAsset={assets.quoteAsset}
                      />
                    </div>
                  </PendingLiveValue>
                ) : waiting && !failed ? (
                  <Tooltip
                    tooltip={PENDING_TOOLTIP}
                    triggerClassName="inline-flex opacity-50"
                  >
                    <span
                      className="text-sm text-muted-foreground"
                      aria-busy
                      data-testid={`hedge-start-pending-${leg.side}`}
                    >
                      Estimating…
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            );
          })}
          {failed ? (
            <div className="text-sm text-destructive" role="alert">
              {failure}
            </div>
          ) : null}
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
            onClick={handleConfirm}
            disabled={isProcessing || refused || waiting}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Starting…' : 'Start'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HedgeStartDialog;
