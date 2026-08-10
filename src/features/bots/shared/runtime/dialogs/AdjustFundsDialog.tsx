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
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AddFundsTypeEnum,
  OrderSizeTypeEnum,
  type AddFundsSettings,
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
  /** Optional balance snapshot for quick reference */
  balances?: FundsBalanceSnapshot[];
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

const ASSET_OPTION_ORDER: OrderSizeTypeEnum[] = [
  OrderSizeTypeEnum.base,
  OrderSizeTypeEnum.quote,
];

const ASSET_LABELS: Record<OrderSizeTypeEnum, string> = {
  [OrderSizeTypeEnum.base]: 'Base asset',
  [OrderSizeTypeEnum.quote]: 'Quote asset',
  [OrderSizeTypeEnum.usd]: 'USD value',
  [OrderSizeTypeEnum.percFree]: '% of available balance',
  [OrderSizeTypeEnum.percTotal]: '% of total balance',
};

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

const resolvedAssetLabel = (
  asset: OrderSizeTypeEnum,
  baseAsset?: string,
  quoteAsset?: string
) => {
  switch (asset) {
    case OrderSizeTypeEnum.base:
      return baseAsset ? `Base (${baseAsset})` : ASSET_LABELS[asset];
    case OrderSizeTypeEnum.quote:
      return quoteAsset ? `Quote (${quoteAsset})` : ASSET_LABELS[asset];
    default:
      return ASSET_LABELS[asset];
  }
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
  balances,
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

  React.useEffect(() => {
    if (open) {
      setQuantity(defaultSettings?.qty ?? RESET_PAYLOAD.qty);
      setAsset(defaultSettings?.asset ?? RESET_PAYLOAD.asset);
      setType(defaultSettings?.type ?? RESET_PAYLOAD.type);
      setUseLimitPrice(
        defaultSettings?.useLimitPrice ?? RESET_PAYLOAD.useLimitPrice
      );
      setLimitPrice(defaultSettings?.limitPrice ?? RESET_PAYLOAD.limitPrice);
      /* setScope(scopeOptions[0]?.value ?? DEFAULT_SCOPE.value); */
      /* setFormError(null); */
    }
  }, [open, defaultSettings /* , scopeOptions */]);

  const Icon = ICONS[mode];

  const handleConfirm = () => {
    const normalizedQty = sanitizeQuantity(quantity);
    const numericQty = toNumber(normalizedQty);

    if (!numericQty || numericQty <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }

    if (
      type === AddFundsTypeEnum.perc &&
      (numericQty <= 0 || numericQty > 1000)
    ) {
      setFormError('Percentage must be greater than 0.');
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
      qty: normalizeNumberString(normalizedQty),
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
      type === AddFundsTypeEnum.perc &&
      (numericQty <= 0 || numericQty > 100)
    ) {
      return 'Percentage must be greater than 0.';
    }

    if (useLimitPrice) {
      const limit = sanitizeQuantity(limitPrice);
      const limitNumber = toNumber(limit);
      if (!limitNumber || limitNumber <= 0) {
        return 'Provide a valid limit price greater than zero.';
      }
    }
    return null;
  }, [limitPrice, quantity, type, useLimitPrice]);

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
            <div className="grid gap-md sm:grid-cols-[2fr_1fr] sm:items-end">
              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-amount">Quantity</Label>
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
                  placeholder="0.00"
                  showControls={false}
                />
              </div>

              <div className="space-y-xs">
                <Label htmlFor="adjust-funds-asset">Asset</Label>
                <Select
                  value={asset}
                  onValueChange={(value) =>
                    setAsset(value as OrderSizeTypeEnum)
                  }
                >
                  <SelectTrigger id="adjust-funds-asset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_OPTION_ORDER.map((option) => (
                      <SelectItem key={option} value={option}>
                        {resolvedAssetLabel(option, baseAsset, quoteAsset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-md sm:grid-cols-2 sm:items-end">
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
