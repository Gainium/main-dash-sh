import { Chip } from '@/components/ui/chip';
import SettingsAlert from '@/components/ui/SettingsAlert';
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
import { useHedgeBotFormOptional } from '@/contexts/bots/form/HedgeBotFormProvider';
import { BotTypesEnum, StrategyEnum, type ExchangeInUser } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { Copy } from 'lucide-react';
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
    handleReplacePair,
    handlePairsPaste,
    handleSelectAllMatching,
    handleClearPairs,
    handleCopyPairs,
    handleRemovePair,
    isExchangeLocked,
    pairs,
    selectedPairSymbols,
    handleAddPairs,
    handleRemovePairs,
    planMaxPairs,
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

  // A hedge combo's legs each trade one pair. A standalone combo can trade
  // many.
  const isSinglePairOnly = useMemo(
    () => formType === BotTypesEnum.combo && Boolean(isNestedLeg),
    [formType, isNestedLeg]
  );

  // Hedge legs: copy the opposite leg's pairs. Each leg keeps its own
  // exchange, so the list is re-resolved against this leg's exchange and
  // pairs it doesn't list are reported, not copied.
  const hedge = useHedgeBotFormOptional();
  const strategy = useBotFormSelector('strategy');
  const otherLeg = strategy === StrategyEnum.short ? 'long' : 'short';
  const [copyNote, setCopyNote] = useState<{
    copied: string;
    skipped?: string;
  } | null>(null);
  const otherLegPairs = useCallback((): string[] => {
    const data = hedge?.legFormDataReaderRef.current?.(otherLeg);
    // The exact symbols, not BASE/QUOTE: a dated future and the perpetual
    // share base and quote but are different markets. The paste resolver
    // already ignores separators (BTCUSDT matches BTC-USDT).
    const list = Array.isArray(data?.pair)
      ? data.pair
      : data?.pair
        ? [data.pair]
        : [];
    return list.filter(Boolean);
  }, [hedge, otherLeg]);
  const handleCopyFromOtherLeg = useCallback(() => {
    const source = otherLegPairs();
    if (!source.length) {
      setCopyNote({ copied: `The ${otherLeg} leg has no pairs yet.` });
      return;
    }
    const result = handleCopyPairs(source);
    const copied = result?.shouldUpdatePairs
      ? (result.nextPairs?.length ?? 0)
      : 0;
    const missing = result?.invalidPairs ?? [];
    const note: { copied: string; skipped?: string } = {
      copied: `Copied ${copied} of ${source.length} ${source.length === 1 ? 'pair' : 'pairs'} from the ${otherLeg} leg.`,
    };
    if (missing.length) {
      const sample = missing.slice(0, 10).join(', ');
      note.skipped = `${missing.length} ${missing.length === 1 ? "isn't" : "aren't"} available on this leg's exchange and ${missing.length === 1 ? 'was' : 'were'} not copied: ${sample}${missing.length > 10 ? ` and ${missing.length - 10} more` : ''}.`;
    } else if (result?.error) {
      note.skipped = result.error;
    }
    setCopyNote(note);
  }, [handleCopyPairs, otherLeg, otherLegPairs]);

  const PAIRS_PREVIEW_LIMIT = 10;
  const [showAllLockedPairs, setShowAllLockedPairs] = useState(false);
  const toggleShowAllLockedPairs = useCallback(
    () => setShowAllLockedPairs((v) => !v),
    []
  );

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
            isSinglePairOnly ? null : (
              <div className="flex items-center gap-xs">
                {/* Multi-pair selections scroll out of view once the picker
                    grows, so surface the running count next to the toggle. */}
                {useMulti && pairs.length > 0 && (
                  <Chip
                    variant={limitReached ? 'warning' : 'primary'}
                    chipStyle="soft"
                    size="xs"
                    title={
                      limitReached
                        ? `Pair limit reached (${pairs.length})`
                        : `${pairs.length} pairs selected`
                    }
                  >
                    {pairs.length} {pairs.length === 1 ? 'pair' : 'pairs'}
                  </Chip>
                )}
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
              <div className="space-y-sm">
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
                            className="flex min-w-0 cursor-pointer items-center gap-xs rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
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
                      // Display-only expander: it reveals pairs already on the
                      // bot, it never edits the form. Deliberately NOT a
                      // <button> — this block also renders inside the bot
                      // drawer's read-only `<fieldset disabled>`, which
                      // natively disables every descendant form control and
                      // left the pairs past the preview limit unreachable.
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={toggleShowAllLockedPairs}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleShowAllLockedPairs();
                          }
                        }}
                        className="inline-block cursor-pointer text-xs text-muted-foreground underline transition-colors hover:text-foreground"
                      >
                        {showAllLockedPairs
                          ? 'Show less'
                          : `+ Load all (${pairs.length - PAIRS_PREVIEW_LIMIT} more)`}
                      </span>
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
                {pairLockState.reason === 'edit-single-pair' && (
                  <SettingsAlert
                    variant="info"
                    title="Pair is fixed"
                    description="Use Duplicate bot to run the same strategy on another pair."
                  />
                )}
              </div>
            ) : (
              <>
                <CoinFilter
                  selectedCoins={selectedPairSymbols}
                  onCoinToggle={handleCoinToggle}
                  onRemoveCoin={handleRemovePair}
                  onReplaceCoin={handleReplacePair}
                  mode="pairs"
                  {...(exchangeProvider ? { exchangeProvider } : {})}
                  onPairsPaste={handlePairsPaste}
                  {...(pairSelectionFilter
                    ? {
                        pairFilter: pairSelectionFilter,
                        onClearSelection: handleClearPairs,
                      }
                    : {})}
                  shouldShowAddButton={!isSinglePairOnly}
                  showAllOption={false}
                  onPairClick={handleChartPairSelect}
                  maxPairs={planMaxPairs}
                  onAddPairs={handleAddPairs}
                  onRemovePairs={handleRemovePairs}
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
                {isNestedLeg && hedge && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={handleCopyFromOtherLeg}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Copy className="size-3" aria-hidden />
                      Copy pairs from {otherLeg} leg
                    </button>
                    {copyNote && (
                      <p className="text-xs text-muted-foreground">
                        {copyNote.copied}
                      </p>
                    )}
                    {copyNote?.skipped && (
                      <p role="alert" className="text-xs text-warning">
                        {copyNote.skipped}
                      </p>
                    )}
                  </div>
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
