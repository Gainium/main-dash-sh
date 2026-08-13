import { NumberInput } from '@/components/ui';
import { BalanceInput } from '@/components/ui/balance-input';
import { Button } from '@/components/ui/button';
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import {
  formatNumberWithTrim,
  type PrecisionGuard,
} from '@/features/bots/shared/utils/order-guard';
import { OrderSizeTypeEnum } from '@/types';
import type { AssetClass } from '@/hooks/useTradingPairs';
import { Lock } from 'lucide-react';
import React, { useState } from 'react';

/** Caption above each field. The lock marks which unit is canonical (legacy
 *  `#FF9551`) and is shown only on that field — the derived one carries no
 *  lock. It sits here rather than in the field's icon slot so the coin icon
 *  can occupy that slot, as on the DCA and grid forms. */
const FieldCaption: React.FC<{ label: string; active: boolean }> = ({
  label,
  active,
}) => (
  <span className="flex items-center gap-1 text-muted-foreground text-xs">
    {active ? <Lock className="h-3 w-3 text-[#FF9551]" /> : null}
    {label}
  </span>
);

export interface TerminalAmountTotalFieldsProps {
  /** Value shown in the Amount field (base units). */
  amountValue: number;
  /** Value shown in the Total field (quote / contract units). */
  totalValue: number;
  orderSizeType: OrderSizeTypeEnum;
  onAmountFocus: () => void;
  onAmountChange: (value: number | string) => void;
  onTotalFocus: () => void;
  onTotalChange: (value: number | string) => void;
  /** Max amount/total, pre-formatted strings (legacy `convertFromExponential`). */
  maxAmount: string;
  maxTotal: string;
  baseAsset: string;
  quoteAsset: string;
  /**
   * Base asset's normalized class + venue, resolved by the parent via
   * `useResolvePairAsset`. Without them the Amount icon falls through to the
   * crypto coin host, which has no entry for a non-crypto base — an index
   * (`xyz:SP500`), a tokenized stock or a metal then renders as a first-letter
   * tile. `undefined` keeps the previous crypto behavior.
   */
  baseAssetClass?: AssetClass | undefined;
  baseAssetExchange?: string | undefined;
  coinm: boolean;
  providerIsBybit: boolean;
  /** USD equivalent of the Amount field (base -> quote -> USD). */
  usdEquivalent: number;
  percentButtons: number[];
  activePerc: string;
  setPercent: (num: number) => () => void;
  guard?: PrecisionGuard | null;
  /** Decimals to format Amount with when it is the DERIVED field (the guard
   *  then describes the quote unit, not this one). */
  derivedAmountPrecision: number;
  /** Decimals to format Total with when it is the derived field. */
  derivedTotalPrecision: number;
  disabled?: boolean;
  /** Free balance of the wallet that funds this order (quote for a long,
   *  base for a short — see `resolveBaseOrderContext`). Shown as "Bal". */
  fundingBalanceAmount: number;
  /** Symbol of the funding wallet above. */
  fundingBalanceCurrency: string;
  /** Refreshes the balances shown in the "Bal" readout. */
  onRefreshBalance?: (() => void) | undefined;
  showRefreshButton?: boolean;
  /** Futures size is funded by margin x leverage, not the free spot balance,
   *  so the wallet cap must not be enforced (forum #4921 / bug #94). */
  disableBalanceValidation?: boolean;
}

/**
 * Dual Amount/Total order-size fields, ported from the legacy
 * `TerminalBotSettings`. Both fields are always visible and kept in sync via
 * price by the parent hook. The active field (per `orderSizeType`) shows the
 * raw canonical value; the inactive field shows the price-derived value. The
 * lock icon tint signals which unit is canonical (legacy `#FF9551`).
 *
 * Both fields render the shared `BalanceInput` — the same funds control the
 * DCA/grid bot forms use — so the terminal gets the balance readout and
 * refresh control instead of a bare number field.
 *
 * Purely presentational: all state lives in `useStrategySettingsTab`.
 */
const TerminalAmountTotalFields: React.FC<TerminalAmountTotalFieldsProps> = ({
  amountValue,
  totalValue,
  orderSizeType,
  onAmountFocus,
  onAmountChange,
  onTotalFocus,
  onTotalChange,
  maxAmount,
  maxTotal,
  baseAsset,
  quoteAsset,
  baseAssetClass,
  baseAssetExchange,
  coinm,
  providerIsBybit,
  usdEquivalent,
  percentButtons,
  activePerc,
  setPercent,
  guard,
  derivedAmountPrecision,
  derivedTotalPrecision,
  disabled,
  fundingBalanceAmount,
  fundingBalanceCurrency,
  onRefreshBalance,
  showRefreshButton = false,
  disableBalanceValidation = false,
}) => {
  const [freePerc, setFreePerc] = useState<string>('');

  const totalUnit = coinm ? (providerIsBybit ? 'USD' : 'Cont') : quoteAsset;

  const amountActive = orderSizeType === OrderSizeTypeEnum.base;
  const totalActive = orderSizeType === OrderSizeTypeEnum.quote;

  // The guard describes the CANONICAL unit only (whichever field
  // `orderSizeType` points at), so its bounds and decimals apply to that field
  // alone. Feeding them to the derived field is wrong in both directions: a
  // quote-unit minimum would cap a base-unit amount, and quote decimals round a
  // BTC figure away entirely ("0.0000765" -> "0").
  const guardProps: {
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
  } = {};
  if (typeof guard?.min === 'number') {
    guardProps.min = guard.min;
  }
  if (typeof guard?.max === 'number') {
    guardProps.max = guard.max;
  }
  if (typeof guard?.step === 'number') {
    guardProps.step = guard.step;
  }
  if (typeof guard?.decimals === 'number') {
    guardProps.precision = guard.decimals;
  }

  // Each field falls back to its own unit's decimals when it isn't canonical.
  const amountProps = amountActive
    ? guardProps
    : { precision: derivedAmountPrecision };
  const totalProps = totalActive
    ? guardProps
    : { precision: derivedTotalPrecision };

  // The wallet-derived cap for each field, already adjusted for direction,
  // fee, leverage and COIN-M contract sizing by the parent hook. Used as the
  // "exceeds available balance" ceiling — the raw wallet free balance is the
  // wrong unit for the Amount field (base) on a long.
  const maxAmountValue = Number(maxAmount);
  const maxTotalValue = Number(maxTotal);

  // Only the canonical field validates: both render the same underlying
  // baseOrderSize, so validating the derived one would double-report.
  const balanceProps = {
    balanceAmount: fundingBalanceAmount,
    balanceCurrency: fundingBalanceCurrency,
    showRefreshButton,
    showPercentageButtons: false,
    // The terminal keeps its own percentage row (below the Amount field): it
    // has a free-form % entry and an active-selection highlight, and it sizes
    // off the leverage/fee-adjusted max rather than the raw wallet balance.
    commitOn: 'blur' as const,
    ...(onRefreshBalance ? { onRefreshBalance } : {}),
  };

  return (
    <div className="space-y-3">
      {/* Amount field */}
      <div className="space-y-xs">
        <FieldCaption label="Amount" active={amountActive} />
        <BalanceInput
          value={amountValue}
          // Commit on blur only (legacy parity): committing per-keystroke
          // would thrash the form store and re-derive the linked field on
          // every character.
          onChange={onAmountChange}
          onFocus={onAmountFocus}
          disabled={disabled}
          availableBalance={
            Number.isFinite(maxAmountValue) ? maxAmountValue : 0
          }
          currency={baseAsset}
          unitLabel={baseAsset}
          coinIcon={
            <CoinIcon
              symbol={baseAsset}
              size="w-6 h-6"
              assetClass={baseAssetClass}
              exchange={baseAssetExchange}
            />
          }
          disableBalanceValidation={disableBalanceValidation || !amountActive}
          errorField="terminalAmount"
          navId="baseOrderSize"
          {...balanceProps}
          {...amountProps}
        />

        {/* Percentage row (Amount only) */}
        <div className="flex flex-wrap items-center gap-1">
          {percentButtons.map((val) => (
            <Button
              key={val}
              type="button"
              size="sm"
              variant={activePerc === `${val}` ? 'default' : 'outline'}
              disabled={disabled}
              onClick={setPercent(val)}
            >
              {val}%
            </Button>
          ))}
          <div className="w-20">
            <NumberInput
              value={freePerc}
              onChange={(v) => setFreePerc(String(v))}
              onBlur={() => {
                if (!isNaN(+freePerc) && freePerc !== '') {
                  setPercent(+freePerc)();
                }
              }}
              disabled={disabled}
              showControls={false}
              endAdornment={<span className="opacity-50">%</span>}
            />
          </div>
        </div>

        {/* The USD equivalent used to sit inside the field; the balance
            readout now occupies that slot, so it joins the max hint. */}
        <p className="text-xs text-muted-foreground">
          ≈ {formatNumberWithTrim(usdEquivalent, 2)} USD · Max amount{' '}
          {maxAmount} {baseAsset}
        </p>
      </div>

      {/* Total field */}
      <div className="space-y-xs">
        <FieldCaption label="Total" active={totalActive} />
        <BalanceInput
          value={totalValue}
          // Commit on blur only (legacy parity) — see Amount field above.
          onChange={onTotalChange}
          onFocus={onTotalFocus}
          disabled={disabled}
          availableBalance={Number.isFinite(maxTotalValue) ? maxTotalValue : 0}
          currency={totalUnit}
          unitLabel={totalUnit}
          // COIN-M totals are denominated in contracts/USD, which have no coin
          // icon of their own — fall back to the settlement (quote) asset.
          coinIcon={<CoinIcon symbol={quoteAsset} size="w-6 h-6" />}
          disableBalanceValidation={disableBalanceValidation || !totalActive}
          errorField="terminalTotal"
          navId="baseOrderSize"
          {...balanceProps}
          {...totalProps}
        />
        <p className="text-xs text-muted-foreground">
          Max total {maxTotal} {totalUnit}
        </p>
      </div>
    </div>
  );
};

export default TerminalAmountTotalFields;
