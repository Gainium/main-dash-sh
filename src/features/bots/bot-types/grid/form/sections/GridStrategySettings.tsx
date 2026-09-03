import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow, {
  SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { MarginLeverageBlock } from '@/features/bots/shared/components/MarginLeverageBlock';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { FuturesStrategyEnum, StrategyEnum } from '@/types';
import type { BotFormAlert } from '@/types/bots/form';
import React, { useMemo } from 'react';

const errorToAlerts = (
  errors: Record<string, string | undefined>,
  field: string
): BotFormAlert[] =>
  errors[field]
    ? [{ variant: 'error', message: errors[field] as string, navId: field }]
    : [];

const STRATEGY_OPTIONS = [
  {
    value: StrategyEnum.long,
    label: 'Long',
    description: 'Buy low, sell high – accumulate the base asset.',
  },
  {
    value: StrategyEnum.short,
    label: 'Short',
    description: 'Sell high, buy back lower – accumulate the quote asset.',
  },
];

// Futures grids carry a THIRD position side that spot grids have no analogue
// for: NEUTRAL, which opens no position at start and simply works the grid.
// The engine reads `settings.futuresStrategy` for futures bots and only falls
// back to the spot `strategy` when that value is NEUTRAL
// (`core/src/bot/helper.ts` → `get isShort()`), so a futures grid must bind
// this control to `futuresStrategy`, not to `strategy`.
const FUTURES_STRATEGY_OPTIONS = [
  { value: FuturesStrategyEnum.long, label: 'Long' },
  { value: FuturesStrategyEnum.neutral, label: 'Neutral' },
  { value: FuturesStrategyEnum.short, label: 'Short' },
];

const FUTURES_STRATEGY_TOOLTIP =
  'Long: open a long position at the start. Buy orders increase the position, sell orders reduce it. ' +
  'Short: open a short position at the start. Sell orders increase the position, buy orders reduce it. ' +
  'Neutral: no position is opened at the start — the grid trades both sides from flat. One-way mode only.';

export const GridStrategySettings: React.FC = () => {
  const {
    formState: { updateFormData, errors, mode },
    baseAsset,
    quoteAsset,
  } = useGridForm();
  const _profitCurrency = useBotFormSelector('profitCurrency');
  const _orderFixedIn = useBotFormSelector('orderFixedIn');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const spotStrategy = useBotFormSelector('strategy');
  const storedFuturesStrategy = useBotFormSelector('futuresStrategy');
  const startPrice = useBotFormSelector('startPrice');
  const useStartPrice = useBotFormSelector('useStartPrice');
  const profitCurrency = useMemo(
    () => _profitCurrency || 'quote',
    [_profitCurrency]
  );
  const orderFixedIn = useMemo(() => _orderFixedIn || 'quote', [_orderFixedIn]);

  // Futures exchanges constrain both profit currency and order sizing to the
  // margin asset — the user can't earn or denominate orders in anything else.
  // Mirrors legacy `dash/components/gridbot/index.tsx`:
  //   if (futures) {
  //     orderFixedIn = coinm ? 'quote' : 'base'
  //     profitCurrency = 'quote'
  //   }
  // For coinm (inverse) the contract is USD-denominated → orders size in
  // quote; for linear (USDT-M) you size positions in base contract units.
  // Profit always lands in the margin asset, which the API represents as
  // `quote` for both futures variants.
  React.useEffect(() => {
    if (!futures) return;
    const desiredOrderFixedIn = coinm ? 'quote' : 'base';
    if (_profitCurrency !== 'quote') {
      updateFormData('profitCurrency', 'quote');
    }
    if (_orderFixedIn !== desiredOrderFixedIn) {
      updateFormData('orderFixedIn', desiredOrderFixedIn);
    }
  }, [futures, coinm, _profitCurrency, _orderFixedIn, updateFormData]);

  const strategy = spotStrategy || StrategyEnum.long;
  const futuresStrategy = storedFuturesStrategy || FuturesStrategyEnum.neutral;

  // The spot Direction control is hidden on futures, so `strategy` keeps
  // whatever it held before the exchange switched — and the engine still
  // consults it whenever `futuresStrategy` is NEUTRAL. Left alone, a user who
  // picked Short on a spot pair and then moved to a futures pair would get a
  // "Neutral" grid the engine runs short. Mirror the position side onto
  // `strategy` so the two can never disagree (legacy avoided this by resetting
  // the whole settings object, including `strategy: LONG`, on exchange pick).
  // Create only — an existing bot's stored `strategy` is its own record and
  // must not be rewritten under it just because the form rendered.
  React.useEffect(() => {
    if (!futures || mode !== 'create') return;
    const mirrored =
      futuresStrategy === FuturesStrategyEnum.short
        ? StrategyEnum.short
        : StrategyEnum.long;
    if (spotStrategy !== mirrored) {
      updateFormData('strategy', mirrored);
    }
  }, [futures, mode, futuresStrategy, spotStrategy, updateFormData]);

  // Direction / position side is fixed at creation: the engine sizes and sides
  // every resting order from it, and `changeBotInput` has no `strategy` field
  // at all (the update mapper strips it). Legacy gates both controls on
  // `isAddingNew`; mirror that rather than offering a toggle that silently
  // does nothing.
  const directionLocked = mode !== 'create';

  const profitCurrencyOptions = React.useMemo(
    () => [
      { value: 'base', label: baseAsset || 'Base' },
      { value: 'quote', label: quoteAsset || 'Quote' },
    ],
    [baseAsset, quoteAsset]
  );

  const orderFixedInOptions = React.useMemo(
    () => [
      { value: 'base', label: baseAsset || 'Base' },
      { value: 'quote', label: quoteAsset || 'Quote' },
    ],
    [baseAsset, quoteAsset]
  );

  const strategyOptions = React.useMemo(
    () => STRATEGY_OPTIONS.map(({ value, label }) => ({ value, label })),
    []
  );

  const futuresStrategyOptions = React.useMemo(
    () => FUTURES_STRATEGY_OPTIONS.map(({ value, label }) => ({ value, label })),
    []
  );

  const handleStartPriceChange = React.useCallback(
    (value: number | string) => {
      updateFormData(
        'startPrice',
        typeof value === 'string' ? value : value.toString()
      );
    },
    [updateFormData]
  );

  // Leverage handling now lives in <MarginLeverageBlock />, which derives
  // maxLeverage from the exchange brackets and clamps + persists the value
  // itself. No local handler needed here.

  return (
    <MasonryLayout
      gap={16}
      containerBreakpoints={{
        default: 1,
        640: 2,
        1024: 3,
      }}
    >
        {/* Both rows hidden on futures — the choice is constrained to the
            margin asset, set automatically by the effect above. */}
        {!futures && (
          <SettingsRow
            name="Profit currency"
            tooltip={`Choose which asset to accumulate: select ${quoteAsset || 'quote'} to stack quote, or ${baseAsset || 'base'} to accumulate base.`}
            tooltipURL="/help/profit-in-base-and-quote"
          >
            <div className="space-y-sm">
              <TerminalButtonStack
                value={profitCurrency}
                onValueChange={(next) => updateFormData('profitCurrency', next)}
                options={profitCurrencyOptions}
              />
            </div>
          </SettingsRow>
        )}

        {!futures && (
          <SettingsRow
            name="Order fixed in"
            tooltip={`Define the currency used to size each grid order — whether each level commits a fixed amount of ${baseAsset || 'base'} or ${quoteAsset || 'quote'} on execution.`}
            tooltipURL="/help/order-fixed-in-base-and-quote-grid"
          >
            <div className="space-y-sm">
              <TerminalButtonStack
                value={orderFixedIn}
                onValueChange={(next) => updateFormData('orderFixedIn', next)}
                options={orderFixedInOptions}
              />
            </div>
          </SettingsRow>
        )}

        {futures ? (
          <SettingsRow name="Position side" tooltip={FUTURES_STRATEGY_TOOLTIP}>
            <div className="space-y-sm">
              <TerminalButtonStack
                value={futuresStrategy}
                onValueChange={(next) =>
                  updateFormData('futuresStrategy', next)
                }
                options={futuresStrategyOptions}
                disabled={directionLocked}
              />
            </div>
          </SettingsRow>
        ) : (
          <SettingsRow
            name="Direction"
            tooltip={`Pick between long and short grid logic. Long grids buy more ${baseAsset || 'base'} when price drops and sell as it rises. Short grids invert this behavior to accumulate ${quoteAsset || 'quote'} or hedge against downside moves.`}
          >
            <div className="space-y-sm">
              <TerminalButtonStack
                value={strategy}
                onValueChange={(next) => updateFormData('strategy', next)}
                options={strategyOptions}
                disabled={directionLocked}
              />
            </div>
          </SettingsRow>
        )}

        <SettingsRow
          name="Start price"
          tooltip="Delay activation until the market reaches a specific price. Useful for staging entries in trending markets."
          tooltipURL="/help/start-price-grid-bots"
          navId="startPrice"
          alerts={errorToAlerts(errors, 'startPrice')}
          trailing={
            <Switch
              id="grid-use-start-price"
              checked={useStartPrice ?? false}
              onCheckedChange={(checked) =>
                updateFormData('useStartPrice', checked)
              }
            />
          }
          className="space-y-sm!"
          contentClassName="space-y-sm"
        >
          {useStartPrice ? (
            <SettingsRowSurface
              tone="faint"
              spacing="sm"
              className="space-y-xs"
            >
              <Label htmlFor="grid-start-price">
                Activation price ({quoteAsset || 'quote'})
              </Label>
              <NumberInput
                id="grid-start-price"
                value={startPrice ?? ''}
                onChange={handleStartPriceChange}
                placeholder="Enter target price"
                showControls={false}
                endAdornment={unitAdornment(quoteAsset ?? 'quote', {
                  size: 'sm',
                  className: 'whitespace-nowrap',
                })}
              />
            </SettingsRowSurface>
          ) : null}
        </SettingsRow>

        {futures ? (
          <SettingsRow
            name="Margin & Leverage"
            tooltip="Select margin type and leverage for your futures position."
            navId="leverage"
            colSpan="full"
            alerts={errorToAlerts(errors, 'leverage')}
          >
            <MarginLeverageBlock />
          </SettingsRow>
        ) : null}
    </MasonryLayout>
  );
};
