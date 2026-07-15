import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { Switch } from '@/components/ui/switch';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { CoinFilter } from '@/components/widgets/shared/CoinSelect';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormActions,
  useBotFormAlerts,
  useBotFormIsNestedLeg,
  useBotFormSelector,
  useBotFormTopLevelSelector,
  type BotFormMode,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { NameInput } from '@/features/bots/shared/components/NameInput';
import { useBotFormDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext';
import { BotTypesEnum, type ExchangeInUser } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import React, { useCallback, useMemo, useState } from 'react';
import ExchangeSelector from '../components/exchangeSelector';
import { useBasicSettingsTab } from '../hooks/useBasicSettingsTab';

export interface BasicSettingsProps {
  currentExchange: ExchangeInUser | null;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  exchangesData?: ExchangeInUser[] | undefined;
  exchangesLoading?: boolean;
  onUpdateBalances?: () => void;
  mode: BotFormMode;
  isFieldLocked?: (field: Fields) => boolean;
  /**
   * Hide the bot name input. Used by Quick mode, which auto-generates
   * the name from the selected pair + preset and doesn't need the user
   * to set it manually.
   */
  hideName?: boolean;
}

export const BasicSettings: React.FC<BasicSettingsProps> = ({
  currentExchange,
  updateFormData,
  exchangesData,
  exchangesLoading,
  mode,
  isFieldLocked,
  hideName = false,
}) => {
  const formPair = useBotFormTopLevelSelector('pair');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const formType = useBotFormTopLevelSelector('type');
  const formExchangeUUID = useBotFormTopLevelSelector('exchangeUUID');
  // Minimal slice consumed by useBasicSettingsTab (pair/pairMetadata/type) and
  // the ExchangeSelector child (exchangeUUID). Built from narrow selectors so a
  // keystroke into an unrelated field doesn't re-render this section.
  const basicTabFormData = useMemo(
    () =>
      ({
        pair: formPair,
        pairMetadata: formPairMetadata,
        type: formType,
        exchangeUUID: formExchangeUUID,
      }) as unknown as BotFormData,
    [formPair, formPairMetadata, formType, formExchangeUUID]
  );
  const {
    pairError,
    exchangeProvider,
    livePairsIndex,
    normalizedExchangeProvider,
    multiToggleState,
    multiToggleMessage,
    pairLockState,
    limitReached,
    planLimitMessage,
    formattedMissingPairs,
    missingPairsExchangeLabel,
    splitPair,
    activeQuickSelectOption,
    pairSelectionFilter,
    handleCoinToggle,
    handlePairsPaste,
    handleSelectAllMatching,
    handleClearPairs,
    handleRemovePair,
    isExchangeLocked,
    pairs,
    selectedPairSymbols,
  } = useBasicSettingsTab({
    currentExchange,
    formData: basicTabFormData,
    updateFormData,
    exchangesLoading,
    mode,
    isFieldLocked,
  });

  useBotFormDcaTradingContext();

  const alerts = useBotFormAlerts();
  const { setActiveChartPair } = useBotFormActions();
  const isNestedLeg = useBotFormIsNestedLeg();

  // Clicking a pair chip (in create or locked edit mode) switches the
  // form chart to that pair. The chart effect keys off `formData.pair`,
  // so map the clicked symbol back to its matching `formData.pair`
  // element (normalizing away separators/case) and fall back to the
  // normalized symbol when there's no exact member.
  const handleChartPairSelect = useCallback(
    (rawPair: string) => {
      const normalized = rawPair.replace(/[\s\-/]/g, '').toUpperCase();
      if (!normalized) {
        return;
      }
      const match = pairs.find(
        (item) => item.replace(/[\s\-/]/g, '').toUpperCase() === normalized
      );
      setActiveChartPair(match ?? normalized);
    },
    [pairs, setActiveChartPair]
  );

  const useMulti = useBotFormSelector('useMulti');
  const missingPairsMessage =
    formattedMissingPairs && formattedMissingPairs.length > 0
      ? `Some saved pairs are no longer available on ${missingPairsExchangeLabel}: ${formattedMissingPairs.join(', ')}`
      : undefined;

  const pairAlerts = [
    ...(missingPairsMessage
      ? [
          {
            variant: 'error',
            message: missingPairsMessage,
            title: missingPairsMessage,
            navId: 'pair',
          },
        ]
      : []),
    ...(pairError
      ? [
          {
            variant: 'error',
            message: pairError,
            title: pairError,
            navId: 'pair',
          },
        ]
      : []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((alerts?.pair ?? []) as any[]),
  ];

  const isComboBot = useMemo(
    () => formType === BotTypesEnum.combo,
    [formType]
  );

  const PAIRS_PREVIEW_LIMIT = 10;
  const [showAllLockedPairs, setShowAllLockedPairs] = useState(false);

  return (
    <>
      <MasonryLayout
        gap={8}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        {/* Nested hedge legs share a single Bot Name on the Hedge tab, so
            the per-leg name input is hidden (isNestedLeg). Regular bots
            (isNestedLeg === false) are unaffected. */}
        {!hideName && !isNestedLeg && <NameInput />}

        <div data-tour="botForm.exchange">
          <ExchangeSelector
            isExchangeLocked={isExchangeLocked}
            currentExchange={currentExchange}
            formData={basicTabFormData}
            updateFormData={updateFormData}
            exchangesLoading={exchangesLoading}
            exchangesData={exchangesData}
            tooltip="Select the exchange account to use for this bot"
            mode={mode}
          />
        </div>
        <div data-tour="botForm.pair">
        <SettingsRow
          name="Trading Pairs"
          tooltip="Configure the trading pairs used by this bot. Toggle between single and multiple pair modes."
          alerts={pairAlerts}
          navId="pair"
          trailing={
            isComboBot ? null : (
              <div className="flex items-center gap-xs">
                <Label
                  htmlFor="multi-pair-switch"
                  className="text-xs text-muted-foreground"
                >
                  {useMulti ? 'Multiple' : 'Single'}
                </Label>
                <Switch
                  id="multi-pair-switch"
                  size="sm"
                  checked={Boolean(useMulti)}
                  onCheckedChange={(checked) => {
                    if (multiToggleState.disabled) {
                      return;
                    }
                    updateFormData('useMulti', checked);
                  }}
                  disabled={multiToggleState.disabled || pairs.length > 1}
                />
              </div>
            )
          }
        >
          <div className="space-y-xs">
            {multiToggleMessage && (
              <p className="text-xs text-muted-foreground/75">
                {multiToggleMessage}
              </p>
            )}
            {pairLockState.locked ? (
              <div className="space-y-sm rounded-lg border border-border bg-muted/30 p-sm">
                {pairs.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-xs">
                      {(showAllLockedPairs
                        ? pairs
                        : pairs.slice(0, PAIRS_PREVIEW_LIMIT)
                      ).map((pair, index) => {
                        const [baseAsset, quoteAsset] = splitPair(pair);
                        // Resolve the pair's asset class + venue so tokenized
                        // stocks render their real logo (not a letter tile) in
                        // this read-only view. Same lookup the edit picker uses.
                        const tp =
                          livePairsIndex.byExchange[
                            normalizedExchangeProvider ?? ''
                          ]?.[`${baseAsset}${quoteAsset}`.toUpperCase()] ??
                          livePairsIndex.aggregated[
                            `${baseAsset}${quoteAsset}`.toUpperCase()
                          ];
                        return (
                          <button
                            type="button"
                            key={`${pair}-${index}`}
                            onClick={() => handleChartPairSelect(pair)}
                            title={`Show ${baseAsset}/${quoteAsset} on chart`}
                            aria-label={`Show ${baseAsset}/${quoteAsset} on chart`}
                            className="flex min-w-0 cursor-pointer items-center gap-xs rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
                          >
                            <CoinPair
                              baseAsset={baseAsset}
                              quoteAsset={quoteAsset}
                              assetClass={tp?.assetCategory}
                              exchange={tp?.exchange}
                              iconSize="sm"
                              showText={false}
                            />
                            <span className="truncate">
                              {baseAsset}/{quoteAsset}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {pairs.length > PAIRS_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setShowAllLockedPairs((v) => !v)}
                        className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
                      >
                        {showAllLockedPairs
                          ? 'Show less'
                          : `+ Load all (${pairs.length - PAIRS_PREVIEW_LIMIT} more)`}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-xs text-sm text-muted-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                      <span className="text-xs">?</span>
                    </div>
                    <span>No pairs configured</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <CoinFilter
                  selectedCoins={selectedPairSymbols}
                  onCoinToggle={handleCoinToggle}
                  onRemoveCoin={handleRemovePair}
                  mode="pairs"
                  {...(exchangeProvider ? { exchangeProvider } : {})}
                  onPairsPaste={handlePairsPaste}
                  {...(pairSelectionFilter
                    ? {
                        pairFilter: pairSelectionFilter,
                        onClearSelection: handleClearPairs,
                      }
                    : {})}
                  shouldShowAddButton={!isComboBot}
                  showAllOption={false}
                  onPairClick={handleChartPairSelect}
                />
                {useMulti && (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-xs text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={handleSelectAllMatching}
                        className="underline transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!activeQuickSelectOption}
                      >
                        {activeQuickSelectOption
                          ? activeQuickSelectOption.label
                          : 'Select all matching pairs'}
                      </button>
                      {activeQuickSelectOption && (
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground/60"
                        >
                          •
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleClearPairs}
                        className="underline transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!pairs.length}
                      >
                        Clear
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground/70">
                      {activeQuickSelectOption
                        ? `${activeQuickSelectOption.description} Shortcut: ${activeQuickSelectOption.token}.`
                        : 'Add a seed pair to enable quick-select helpers or paste multiple pairs at once.'}
                    </p>
                  </div>
                )}

                {planLimitMessage && (
                  <p
                    className={`text-xs ${
                      limitReached
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {planLimitMessage}
                  </p>
                )}
              </>
            )}
          </div>
        </SettingsRow>
        </div>
      </MasonryLayout>
    </>
  );
};
