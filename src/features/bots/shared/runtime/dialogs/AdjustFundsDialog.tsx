import React, { useMemo } from 'react';
import { Plus, Minus, Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumberInput } from '@/components/ui/number-input';
import { BalanceInput } from '@/components/ui/balance-input';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import {
  ADD_AMOUNT_MODE_ORDER,
  AMOUNT_MODE_ORDER,
  MAX_PERCENT,
  resolvePercentOfAvailable,
  amountModeLabel,
  fromAmountMode,
  percentClosesDeal,
  resolvePercentQuantity,
  toAmountMode,
  type AmountMode,
  type PercentBasis,
} from './adjustFundsAmount';
import { useDealFreeBalance } from './useDealFreeBalance';
import {
  AddFundsTypeEnum,
  ExchangeEnum,
  OrderSizeTypeEnum,
  StatusEnum,
  type AddFundsSettings,
  type Prices,
} from '@/types';

/* export type FundsScopeOptionValue = 'bot' | 'deal' | string; */

/* export interface FundsScopeOption {
  value: FundsScopeOptionValue;
  label: string;
  description?: string;
} */

export interface FundsBalanceSnapshot {
  label: string;
  value: string;
  emphasis?: boolean;
}

interface AdjustFundsDialogBaseProps {
  /** Dialog visibility flag controlled by the parent */
  open: boolean;
  /** Update handler when dialog visibility changes */
  onOpenChange: (open: boolean) => void;
  /** Handler invoked when the user confirms the adjustment */
  onConfirm: (settings: AddFundsSettings) => void;
  /** Optional defaults when the dialog opens */
  defaultSettings?: Partial<AddFundsSettings>;
  /** Provide custom scope options (bot/deal). Defaults to bot-only */
  /* scopeOptions?: FundsScopeOption[]; */
  /** Controls loading state when confirm action is busy */
  isProcessing?: boolean;
  /** Human-friendly target (e.g. "BTC/USDT bot") */
  targetName?: string;
  /** Base asset string shown in selectors */
  baseAsset?: string;
  /** Quote asset string shown in selectors */
  quoteAsset?: string;
  /**
   * Symbol and exchange of the deal being adjusted. Supplied together they let
   * the dialog resolve a live market price and seed the limit-price box with
   * it. Both are optional because the bulk mount adjusts a selection that can
   * span several symbols, where no single price is meaningful.
   */
  symbol?: string;
  exchange?: string;
  /**
   * What a percentage resolves to for this deal, so the dialog can show the
   * base amount behind the percentage instead of leaving the user to work it
   * out. Absent for a multi-deal selection, where each deal resolves
   * differently and one number would be wrong for the rest.
   */
  percentBasis?: PercentBasis | undefined;
  /** Optional balance snapshot for quick reference */
  balances?: FundsBalanceSnapshot[];
  /**
   * The exchange account the deal trades on. Supplied for a single deal, it
   * lets an ADD resolve the free balance that caps it. Omitted for a bulk
   * selection spanning several accounts, where one balance would be wrong for
   * the rest — the same reason `percentBasis` is omitted there.
   */
  exchangeUUID?: string | undefined;
  /**
   * How many deals this adjustment will be applied to. Anything above 1
   * switches the copy to the bulk wording, so it is explicit that the amount
   * entered here is applied to EACH selected deal, not split between them.
   */
  targetCount?: number;
}

export type AdjustFundsDialogMode = 'add' | 'reduce';

export interface AdjustFundsDialogProps extends AdjustFundsDialogBaseProps {
  mode: AdjustFundsDialogMode;
}

/* const DEFAULT_SCOPE: FundsScopeOption = {
  value: 'bot',
  label: 'This bot',
}; */

const ICONS: Record<
  AdjustFundsDialogMode,
  React.ComponentType<{ className?: string }>
> = {
  add: Plus,
  reduce: Minus,
};

const TITLES: Record<AdjustFundsDialogMode, string> = {
  add: 'Add funds',
  reduce: 'Reduce funds',
};

const DESCRIPTIONS: Record<AdjustFundsDialogMode, string> = {
  add: 'Inject additional capital into the deal.' /* 'Inject additional capital into the running bot or a specific deal.' */,
  reduce:
    'Withdraw capital from the running deal.' /* 'Withdraw capital from the running bot or a specific deal.' */,
};

const SECONDARY_ACTION_TEXT: Record<AdjustFundsDialogMode, string> = {
  add: 'Add funds',
  reduce: 'Reduce funds',
};

const BULK_DESCRIPTIONS: Record<AdjustFundsDialogMode, (count: number) => string> =
  {
    add: (count) =>
      `Inject additional capital into each of the ${count} selected deals.`,
    reduce: (count) =>
      `Withdraw capital from each of the ${count} selected deals.`,
  };

const BULK_FOOTNOTES: Record<AdjustFundsDialogMode, (count: number) => string> = {
  add: (count) =>
    `The selected amount is appended to each of the ${count} deals — it is not split between them.`,
  reduce: (count) =>
    `The selected amount is withdrawn from each of the ${count} deals — it is not split between them.`,
};

const RESET_PAYLOAD = {
  qty: '',
  useLimitPrice: false,
  limitPrice: '',
  asset: OrderSizeTypeEnum.quote,
  type: AddFundsTypeEnum.fixed,
} satisfies Partial<AddFundsSettings> & { limitPrice: string };

const sanitizeQuantity = (value: string) => value.replace(/[^0-9.,]/g, '');

const toNumber = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  const normalized = value.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNumberString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.replace(/,/g, '.');
  return normalized;
};

/**
 * Enough digits to be useful for both a ~1900-XPL position and a 0.0024-BTC
 * one, without implying a precision the exchange will honour: the engine
 * rounds to the pair's own base precision, which this dialog does not have.
 * Every number built from this is therefore prefixed with "≈".
 */
const formatQty = (value: number) =>
  value
    .toFixed(value >= 1 ? 4 : 8)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');

/**
 * Live market price for one symbol, or null when the caller did not say which
 * symbol this is for, or prices have not arrived yet.
 *
 * The dialog resolves this itself rather than taking a price prop: every mount
 * has the symbol to hand, but only some already hold a price, and seeding a
 * limit order from a stale one is worse than leaving the box empty.
 */
const useMarketPrice = (symbol?: string, exchange?: string) => {
  const [price, setPrice] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!symbol) {
      setPrice(null);
      return;
    }

    // Prefer the exact venue, but fall back to the symbol on any venue: the
    // feed labels some entries 'all', and a price from a sibling venue is a
    // better starting point than none.
    const pick = (prices: Prices) =>
      (exchange
        ? prices.find((p) => p.symbol === symbol && p.exchange === exchange)
        : undefined) ?? prices.find((p) => p.symbol === symbol);

    const cached = pick(getLocalPrices());
    setPrice(cached ? cached.price : null);

    const unsubscribe = getLatestPrices((result) => {
      if (result.status !== StatusEnum.ok || !result.data) {
        return;
      }
      const match = pick(result.data);
      if (match) {
        setPrice(match.price);
      }
    }, exchange === ExchangeEnum.binanceUS);

    return () => unsubscribe();
  }, [symbol, exchange]);

  return price;
};

export const AdjustFundsDialog: React.FC<AdjustFundsDialogProps> = ({
  mode,
  open,
  onOpenChange,
  onConfirm,
  defaultSettings,
  /* scopeOptions = [DEFAULT_SCOPE], */
  isProcessing = false,
  targetName,
  baseAsset,
  quoteAsset,
  symbol,
  exchange,
  percentBasis,
  balances,
  exchangeUUID,
  targetCount = 1,
}) => {
  const isBulk = targetCount > 1;
  const [quantity, setQuantity] = React.useState<string>(RESET_PAYLOAD.qty);
  const [asset, setAsset] = React.useState<OrderSizeTypeEnum>(
    defaultSettings?.asset ?? RESET_PAYLOAD.asset
  );
  const [type, setType] = React.useState<AddFundsTypeEnum>(
    defaultSettings?.type ?? RESET_PAYLOAD.type
  );
  const [useLimitPrice, setUseLimitPrice] = React.useState<boolean>(
    defaultSettings?.useLimitPrice ?? RESET_PAYLOAD.useLimitPrice
  );
  const [limitPrice, setLimitPrice] = React.useState<string>(
    defaultSettings?.limitPrice ?? RESET_PAYLOAD.limitPrice
  );
  /* const [scope, setScope] = React.useState<FundsScopeOptionValue>(
    scopeOptions[0]?.value ?? DEFAULT_SCOPE.value
  ); */
  const [formError, setFormError] = React.useState<string | null>(null);
  // Purely a UI mode. It submits as a fixed quote order, so it is
  // indistinguishable from plain `quote` in the payload and cannot be
  // recovered from (asset, type) the way the other three can.
  const [percentOfAvailable, setPercentOfAvailable] = React.useState(false);

  const amountMode: AmountMode = percentOfAvailable
    ? 'percAvailable'
    : toAmountMode(asset, type);
  const isPercentOfPosition = type === AddFundsTypeEnum.perc;
  // Both percentage modes type a 0-100 figure rather than an asset amount.
  const isPercent = isPercentOfPosition || percentOfAvailable;

  const handleAmountModeChange = (mode: AmountMode) => {
    setPercentOfAvailable(mode === 'percAvailable');
    const next = fromAmountMode(mode);
    setAsset(next.asset);
    setType(next.type);
  };

  const marketPrice = useMarketPrice(symbol, exchange);

  // The base amount behind the percentage, computed exactly as the engine
  // computes it — see `percentBasis`. Rendered only when every input was
  // available; a confident "0" would read as "this order does nothing".
  const resolvedQty = isPercentOfPosition
    ? resolvePercentQuantity(percentBasis, quantity)
    : null;
  const willCloseDeal =
    mode === 'reduce' && percentClosesDeal(percentBasis, resolvedQty);

  // What caps this adjustment, in the unit the user is currently typing in.
  //
  // The two directions are capped by different things, and conflating them
  // would put a confident wrong number in front of the user:
  //   • ADD is capped by the exchange balance the funds come OUT of.
  //   • REDUCE is capped by the position the funds come out of — the deal's
  //     own holdings. The exchange balance is irrelevant to it.
  // A percentage is capped at 100 in both directions and needs no figure.
  //
  // Only fetch balances when an add is actually open and denominated in an
  // asset, so opening a reduce (or a percentage add) costs no request.
  const needsExchangeBalance =
    open &&
    !isBulk &&
    mode === 'add' &&
    !isPercentOfPosition &&
    !!exchangeUUID;
  const {
    free: freeBalances,
    loading: balanceLoading,
    known: balanceKnown,
    refresh: refreshBalances,
  } = useDealFreeBalance(exchangeUUID, needsExchangeBalance);

  const ceilingAsset = amountMode === 'base' ? baseAsset : quoteAsset;

  /** Free quote balance the "% of available" percentage multiplies. */
  const availableQuote =
    balanceKnown && quoteAsset
      ? (freeBalances[quoteAsset.toUpperCase()] ?? 0)
      : null;
  const resolvedFromAvailable = percentOfAvailable
    ? resolvePercentOfAvailable(availableQuote, quantity)
    : null;

  const ceiling = React.useMemo<number | null>(() => {
    if (isPercent || isBulk) return null;
    if (mode === 'add') {
      if (!balanceKnown || !ceilingAsset) return null;
      return freeBalances[ceilingAsset.toUpperCase()] ?? 0;
    }
    if (!percentBasis) return null;
    return amountMode === 'base'
      ? percentBasis.remainingBase
      : percentBasis.perHundredQuote;
  }, [
    isPercent,
    isBulk,
    mode,
    balanceKnown,
    ceilingAsset,
    freeBalances,
    percentBasis,
    amountMode,
  ]);

  // A reduce reads its ceiling straight off `percentBasis`, so it is either
  // known immediately or not coming at all — only the add has a fetch to wait
  // on.
  const ceilingLoading =
    mode === 'add' &&
    needsExchangeBalance &&
    (balanceLoading || !balanceKnown);

  const showBalanceField =
    !isPercent && !isBulk && (ceiling !== null || ceilingLoading);

  // Surfaced as a warning, never as a block.
  //
  // An add over the wallet balance is a genuine mistake, but the balance here
  // is a snapshot and futures margin is not spot free balance, so refusing the
  // order on it would sometimes be refusing a valid one. A reduce over the
  // position is not a mistake at all — the engine closes the deal, which is a
  // thing users deliberately do. Both get told what will happen and keep the
  // button.
  const exceedsCeiling = React.useMemo(() => {
    if (ceiling === null || ceilingLoading) return false;
    const qty = Number(quantity);
    return Number.isFinite(qty) && qty > 0 && qty > ceiling;
  }, [ceiling, ceilingLoading, quantity]);

  React.useEffect(() => {
    if (open) {
      setQuantity(defaultSettings?.qty ?? RESET_PAYLOAD.qty);
      setAsset(defaultSettings?.asset ?? RESET_PAYLOAD.asset);
      setType(defaultSettings?.type ?? RESET_PAYLOAD.type);
      // UI-only, so it has no counterpart in defaultSettings to restore from;
      // a reopened dialog starts on a concrete amount.
      setPercentOfAvailable(false);
      setUseLimitPrice(
        defaultSettings?.useLimitPrice ?? RESET_PAYLOAD.useLimitPrice
      );
      setLimitPrice(defaultSettings?.limitPrice ?? RESET_PAYLOAD.limitPrice);
      /* setScope(scopeOptions[0]?.value ?? DEFAULT_SCOPE.value); */
      /* setFormError(null); */
    }
  }, [open, defaultSettings /* , scopeOptions */]);

  // Seed the limit price once per opening. The box used to open empty, so the
  // price had to be read off the chart and retyped every time. It is only ever
  // written while the field is untouched, and never rewritten as the feed
  // ticks — a limit price that moves under the user would be worse than the
  // empty box it replaces.
  const seededLimitRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      seededLimitRef.current = false;
      return;
    }
    if (seededLimitRef.current || !useLimitPrice || limitPrice || !marketPrice) {
      return;
    }
    seededLimitRef.current = true;
    setLimitPrice(`${marketPrice}`);
  }, [open, useLimitPrice, limitPrice, marketPrice]);

  const Icon = ICONS[mode];

  const handleConfirm = () => {
    const normalizedQty = sanitizeQuantity(quantity);
    const numericQty = toNumber(normalizedQty);

    if (!numericQty || numericQty <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }

    // Confirm and the live validator below used to disagree — 1000 here, 100
    // there — so the ceiling the button enforced was not the one this branch
    // checked. One constant now, checked identically in both places.
    if (
      (type === AddFundsTypeEnum.perc || percentOfAvailable) &&
      (numericQty <= 0 || numericQty > MAX_PERCENT)
    ) {
      setFormError(`Enter a percentage between 0 and ${MAX_PERCENT}.`);
      return;
    }

    // "% of available" is resolved here, not by the engine — it has no
    // percent-of-balance path. Refuse rather than guess if the balance never
    // arrived, otherwise the percentage would fall through as a raw quote
    // amount (a "40" meaning 40 USDT instead of 40%).
    if (percentOfAvailable && resolvedFromAvailable === null) {
      setFormError(
        'Your available balance could not be read, so a percentage of it cannot be calculated. Enter an amount instead.'
      );
      return;
    }

    if (useLimitPrice) {
      const normalizedLimit = sanitizeQuantity(limitPrice);
      const limitNumber = toNumber(normalizedLimit);
      if (!limitNumber || limitNumber <= 0) {
        setFormError('Provide a valid limit price greater than zero.');
        return;
      }
    }

    const settings: AddFundsSettings = {
      qty:
        percentOfAvailable && resolvedFromAvailable !== null
          ? normalizeNumberString(String(resolvedFromAvailable))
          : normalizeNumberString(normalizedQty),
      useLimitPrice,
      asset,
      type,
      ...(useLimitPrice
        ? { limitPrice: normalizeNumberString(limitPrice) }
        : {}),
    };

    onConfirm(settings /* { settings, scope } */);
  };

  const error = useMemo(() => {
    const qty = sanitizeQuantity(quantity);
    const numericQty = toNumber(qty);
    if (!numericQty || numericQty <= 0) {
      return 'Enter an amount greater than zero.';
    }

    if (
      (type === AddFundsTypeEnum.perc || percentOfAvailable) &&
      (numericQty <= 0 || numericQty > MAX_PERCENT)
    ) {
      return `Enter a percentage between 0 and ${MAX_PERCENT}.`;
    }

    if (useLimitPrice) {
      const limit = sanitizeQuantity(limitPrice);
      const limitNumber = toNumber(limit);
      if (!limitNumber || limitNumber <= 0) {
        return 'Provide a valid limit price greater than zero.';
      }
    }
    return null;
  }, [limitPrice, quantity, type, useLimitPrice, percentOfAvailable]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Icon className="h-5 w-5" />
            {TITLES[mode]}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isBulk
              ? BULK_DESCRIPTIONS[mode](targetCount)
              : targetName
                ? `${DESCRIPTIONS[mode]} (${targetName}).`
                : DESCRIPTIONS[mode]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {balances && balances.length > 0 ? (
            <Alert className="bg-muted/20 border-border/50">
              <AlertTitle className="flex items-center gap-xs text-sm font-medium">
                <Wallet className="h-4 w-4" />
                Available balances
              </AlertTitle>
              <AlertDescription>
                <div className="mt-2 grid gap-1 text-xs sm:text-sm">
                  {balances.map((entry) => (
                    <div
                      key={`${entry.label}-${entry.value}`}
                      className={
                        entry.emphasis ? 'font-medium text-foreground' : ''
                      }
                    >
                      {entry.label}: {entry.value}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-md">
            {/* Top-aligned, like the order-type row below: the amount column
                grows a line taller whenever the resolved-quantity preview is
                showing, and bottom alignment pushed "Amount in" and its select
                down out of line with the field beside them. */}
            <div className="grid gap-md sm:grid-cols-[2fr_1fr] sm:items-start">
              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-amount">
                  {isPercent ? 'Percentage' : 'Quantity'}
                </Label>
                {showBalanceField ? (
                  <BalanceInput
                    value={Number(quantity) || 0}
                    onChange={(value) => setQuantity(String(value))}
                    availableBalance={ceiling ?? 0}
                    currency={ceilingAsset || ''}
                    unitLabel={ceilingAsset || undefined}
                    isBalanceLoading={ceilingLoading}
                    precision={8}
                    // The refresh button only has something to re-read for an
                    // add; a reduce's ceiling comes from the deal, which this
                    // dialog does not own and cannot refetch.
                    showRefreshButton={mode === 'add'}
                    {...(mode === 'add'
                      ? { onRefreshBalance: refreshBalances }
                      : {})}
                    // A reduce is bounded by the position, not by a wallet, so
                    // the "exceeds available balance" copy would name the wrong
                    // thing. It gets its own message below.
                    disableBalanceValidation={mode === 'reduce'}
                  />
                ) : (
                  <NumberInput
                    id="adjust-funds-amount"
                    value={quantity}
                    onChange={(value) =>
                      setQuantity(
                        typeof value === 'number'
                          ? value.toString()
                          : (value ?? '')
                      )
                    }
                    placeholder={isPercent ? '0' : '0.00'}
                    showControls={false}
                    {...(isPercent ? { endAdornment: '%' } : {})}
                  />
                )}
                {resolvedQty !== null ? (
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatQty(resolvedQty)}
                    {baseAsset ? ` ${baseAsset}` : ''}
                  </p>
                ) : null}
                {percentOfAvailable ? (
                  <p className="text-xs text-muted-foreground">
                    {ceilingLoading
                      ? 'Reading your available balance…'
                      : availableQuote === null
                        ? 'Available balance unavailable — enter an amount instead.'
                        : resolvedFromAvailable !== null
                          ? `≈ ${formatQty(resolvedFromAvailable)} ${quoteAsset ?? ''} of ${formatQty(availableQuote)} ${quoteAsset ?? ''} available`
                          : `${formatQty(availableQuote)} ${quoteAsset ?? ''} available`}
                  </p>
                ) : null}
                {exceedsCeiling ? (
                  <p className="text-xs text-destructive">
                    {mode === 'add'
                      ? `Exceeds your available ${ceilingAsset} balance (${formatQty(ceiling ?? 0)}).`
                      : `The deal only holds ${formatQty(ceiling ?? 0)} ${ceilingAsset}.`}
                  </p>
                ) : null}
              </div>

              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-asset">Amount in</Label>
                <Select
                  value={amountMode}
                  onValueChange={(value) =>
                    handleAmountModeChange(value as AmountMode)
                  }
                >
                  <SelectTrigger id="adjust-funds-asset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(mode === 'add'
                      ? ADD_AMOUNT_MODE_ORDER
                      : AMOUNT_MODE_ORDER
                    ).map((option) => (
                      <SelectItem key={option} value={option}>
                        {amountModeLabel(option, baseAsset, quoteAsset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Aligned to the top rather than the bottom: the limit column
                grows a line taller when the market-price hint is showing, and
                bottom alignment pushed its label out of line with "Order
                type". */}
            <div className="grid gap-md sm:grid-cols-2 sm:items-start">
              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-order-type">Order type</Label>
                <Select
                  value={useLimitPrice ? 'limit' : 'market'}
                  onValueChange={(value) => setUseLimitPrice(value === 'limit')}
                >
                  <SelectTrigger id="adjust-funds-order-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {useLimitPrice ? (
                <div className="space-y-xs">
                  <Label htmlFor="adjust-funds-limit-price">Limit price</Label>
                  <Input
                    id="adjust-funds-limit-price"
                    value={limitPrice}
                    onChange={(event) =>
                      setLimitPrice(event.target.value ?? '')
                    }
                    placeholder={
                      quoteAsset ? `Price in ${quoteAsset}` : 'Price'
                    }
                    inputMode="decimal"
                  />
                  {marketPrice ? (
                    <button
                      type="button"
                      onClick={() => setLimitPrice(`${marketPrice}`)}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Market: {marketPrice}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div />
              )}
            </div>

            {/* {scopeOptions.length > 1 ? (
              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-scope">Apply to</Label>
                <Select
                  value={scope}
                  onValueChange={(value) =>
                    setScope(value as FundsScopeOptionValue)
                  }
                >
                  <SelectTrigger id="adjust-funds-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          {option.description ? (
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null} */}

            <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 p-sm text-xs text-muted-foreground">
              <p>
                {isBulk
                  ? BULK_FOOTNOTES[mode](targetCount)
                  : mode === 'add'
                    ? 'The selected amount will be appended to the deal once confirmed.'
                    : 'The selected amount will be withdrawn from the deal once confirmed.'}
              </p>
              {isPercentOfPosition ? (
                <p className="mt-1">
                  The percentage is taken from the position this deal currently
                  holds — not from your exchange balance.
                </p>
              ) : null}
              {percentOfAvailable ? (
                <p className="mt-1">
                  The percentage is taken from your free exchange balance, and
                  is converted to a fixed amount when you confirm — not re-read
                  when the order is placed.
                </p>
              ) : null}
              {willCloseDeal && percentBasis ? (
                <p className="mt-1 text-warning">
                  That is at or above the whole remaining position (
                  {formatQty(percentBasis.remainingBase)}
                  {baseAsset ? ` ${baseAsset}` : ''}), so this will close the
                  deal rather than reduce it.
                </p>
              ) : null}
            </div>
            {!!error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          {formError ? (
            <Alert className="border-destructive/40 bg-destructive/10">
              <AlertDescription className="text-sm text-destructive">
                {formError}
              </AlertDescription>
            </Alert>
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
            disabled={isProcessing || !!error}
            className="w-full sm:w-auto"
          >
            {isProcessing
              ? 'Processing…'
              : isBulk
                ? `${SECONDARY_ACTION_TEXT[mode]} (${targetCount})`
                : SECONDARY_ACTION_TEXT[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export type AddFundsDialogProps = Omit<AdjustFundsDialogProps, 'mode'>;

export const AddFundsDialog: React.FC<AddFundsDialogProps> = (props) => (
  <AdjustFundsDialog mode="add" {...props} />
);

export const ReduceFundsDialog: React.FC<AddFundsDialogProps> = (props) => (
  <AdjustFundsDialog mode="reduce" {...props} />
);
