import React from 'react';

import { BalanceInput } from '@/components/ui/balance-input';
import { Label } from '@/components/ui/label';
import { computeGridBudgetRangeFromForm } from '@/utils/bots/grid/budget-ranges';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import SettingsRow, {
  SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { useBalanceStore } from '@/stores/live/balanceStore';
import { normalizeBalanceAsset } from '@/utils/exchangeUtils';
import type { BotFormAlert } from '@/types/bots/form';

interface GridBudgetSettingsProps {
  /** Refreshes the balance shown next to the investment field. */
  onUpdateBalances?: (() => void) | undefined;
}

export const GridBudgetSettings: React.FC<GridBudgetSettingsProps> = ({
  onUpdateBalances,
}) => {
  const { formState, quoteAsset } = useGridForm();
  const { updateFormData, errors, formData, mode } = formState;
  const budget = useBotFormSelector('budget');
  const futures = useBotFormSelector('futures');
  const useOrderInAdvance = useBotFormSelector('useOrderInAdvance');
  const ordersInAdvance = useBotFormSelector('ordersInAdvance');
  const handleBudgetChange = (value: number | string) => {
    updateFormData(
      'budget',
      typeof value === 'string' ? value : value.toString()
    );
  };

  // Free balance of the asset the grid is funded in. Scoped by
  // `formData.exchangeUUID` — the same key `useDcaTradingContext` keys its
  // balance map on — rather than a `currentExchange` prop, which resolves late
  // (and stays null on some tabs), leaving the readout stuck at 0. Wallet
  // symbols are canonicalized the same way so aliased assets reconcile.
  const balances = useBalanceStore((state) => state.balances);
  const availableBalance = React.useMemo(() => {
    const wanted = normalizeBalanceAsset(quoteAsset);
    const exchangeUUID = formData.exchangeUUID;
    if (!wanted || !exchangeUUID) {
      return 0;
    }
    const total = balances
      .filter(
        (balance) =>
          balance.exchangeUUID === exchangeUUID &&
          normalizeBalanceAsset(balance.asset) === wanted
      )
      .reduce((sum, balance) => sum + (Number(balance.free) || 0), 0);
    return Number.isFinite(total) ? total : 0;
  }, [balances, quoteAsset, formData.exchangeUUID]);

  const handleActiveOrdersChange = (value: number | string) => {
    if (value === '') {
      updateFormData('ordersInAdvance', 0);
      return;
    }

    const parsed = typeof value === 'string' ? Number(value) : value;
    updateFormData(
      'ordersInAdvance',
      Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
    );
  };

  const quoteAdornmentLabel = quoteAsset ?? 'quote';

  // Minimum budget needed for every grid level to clear the exchange's
  // per-order minimum — the "Min budget is X" hint the legacy dashboard
  // showed under this input. Only surfaced while creating a bot, matching
  // the legacy `isAddingNew` gate.
  const minBudget = React.useMemo(() => {
    if (mode !== 'create') {
      return null;
    }
    const primaryPair = Array.isArray(formData.pair)
      ? formData.pair[0]
      : formData.pair;
    if (!primaryPair) {
      return null;
    }
    const seedPrice = Number(formData.initialPrice ?? 0) || undefined;
    const range = computeGridBudgetRangeFromForm({
      grid: formData.grid,
      primaryPair,
      pairPrecisionMap: formData.pairPrecisionMap,
      userFee: formData.userFee,
      latestPrice: seedPrice,
      initialPrice: seedPrice,
    });
    return range && range.min > 0 ? range.min : null;
  }, [
    mode,
    formData.pair,
    formData.grid,
    formData.pairPrecisionMap,
    formData.userFee,
    formData.initialPrice,
  ]);

  // Grid form populates `errors` (the legacy bag) instead of the
  // newer `alerts` map. Adapt locally to the SettingsRow alert chip
  // shape — same pattern as DCA rows that don't yet have validator
  // support for alerts (see BotControllerSettings).
  const budgetAlerts: BotFormAlert[] = errors['budget']
    ? [{ variant: 'error', message: errors['budget'], navId: 'budget' }]
    : [];
  const ordersInAdvanceAlerts: BotFormAlert[] = errors['ordersInAdvance']
    ? [
        {
          variant: 'error',
          message: errors['ordersInAdvance'],
          navId: 'ordersInAdvance',
        },
      ]
    : [];

  return (
    <MasonryLayout
      gap={16}
      containerBreakpoints={{
        default: 1,
        640: 2,
        1024: 3,
      }}
    >
      <SettingsRow
        name={`Investment (${quoteAsset || 'quote'})`}
        tooltip="Define the total capital allocation the bot can utilize. The allocated funds determine how many buy and sell levels can be filled at once."
        tooltipURL="/help/budget-grid"
        navId="budget"
        alerts={budgetAlerts}
      >
        <div className="space-y-xs">
          <BalanceInput
            value={Number(budget ?? 0)}
            onChange={handleBudgetChange}
            placeholder="Enter total investment"
            availableBalance={availableBalance}
            currency={quoteAdornmentLabel}
            balanceAmount={availableBalance}
            balanceCurrency={quoteAdornmentLabel}
            coinIcon={<CoinIcon symbol={quoteAdornmentLabel} size="w-6 h-6" />}
            unitLabel={quoteAdornmentLabel}
            precision={2}
            step={0.01}
            {...(onUpdateBalances ? { onRefreshBalance: onUpdateBalances } : {})}
            showRefreshButton={typeof onUpdateBalances === 'function'}
            // A futures grid funds its levels from margin x leverage, not the
            // free spot balance, so the wallet figure isn't a valid cap
            // (same reasoning as the DCA order size — forum #4921 / bug #94).
            disableBalanceValidation={Boolean(futures)}
            errorField="budget"
            navId="budget"
          />
          {minBudget !== null && (
            <p className="text-xs text-muted-foreground">
              Min budget is {minBudget}
              {quoteAsset ? ` ${quoteAsset}` : ''}
            </p>
          )}
        </div>
      </SettingsRow>

      <SettingsRow
        name="Smart orders"
        tooltip="Keep a subset of orders live on the exchange while staging the rest for faster execution."
        tooltipURL="/help/smart-orders"
        alerts={ordersInAdvanceAlerts}
        trailing={
          <Switch
            id="grid-use-smart-orders"
            checked={useOrderInAdvance ?? false}
            onCheckedChange={(checked) =>
              updateFormData('useOrderInAdvance', checked)
            }
          />
        }
        className="space-y-sm!"
        contentClassName="space-y-sm"
      >
        {useOrderInAdvance ? (
          <SettingsRowSurface tone="faint" spacing="sm" className="space-y-xs">
            <div className="flex items-center gap-xs">
              <Label htmlFor="grid-active-orders">Active orders</Label>
              <Tooltip tooltip="Choose how many buy and sell orders should remain on the book simultaneously.">
                <InfoIcon />
              </Tooltip>
            </div>
            <NumberInput
              id="grid-active-orders"
              value={ordersInAdvance?.toString() ?? ''}
              onChange={handleActiveOrdersChange}
              inputMode="numeric"
              placeholder="Number of orders to keep active"
              min={0}
              step={1}
              precision={0}
              showControls={false}
            />
          </SettingsRowSurface>
        ) : null}
      </SettingsRow>
    </MasonryLayout>
  );
};
