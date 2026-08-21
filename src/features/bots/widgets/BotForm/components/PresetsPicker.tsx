/* eslint-disable spacing/no-hardcoded-font-size */
import { useEffect, useMemo, useRef, useState } from 'react';

import { useBotFormState } from '@/contexts/bots/form/BotFormProvider';
import { useBotFormPreloadStore } from '@/stores/botFormPreloadStore';
import { useBotTemplatesStore } from '@/stores/botTemplatesStore';
import { useCuratedPresetRois } from '@/lib/curatedPresets';
import { BotTypesEnum, StrategyEnum } from '@/types';
import type { MarketStats } from '@/utils/marketStats';

import {
  QUICK_SETUP_PRESETS,
  computeInvestmentFromDca,
  distributeInvestmentToDca,
  getCalibratedPresetValues,
  getPresetDcaState,
  getPresetPreview,
  getQuickSetupPreset,
  type QuickSetupDcaLike,
  type QuickSetupPreset,
} from './quickSetupPresets';
import {
  PresetCard,
  PresetOverwriteDialog,
  TemplatesPopover,
} from './quick-setup/shared';
import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { resolveOrderSizeDecimals } from '@/features/bots/shared/utils/order-guard';
import type { PairPrecisionInfo } from '@/types/bots';

type PendingSource =
  | { kind: 'preset'; id: string }
  | { kind: 'template'; id: string };

/** Order-size decimals for the slice being rewritten, resolved against the
 *  first selected pair — the same source the Quick form's investment field
 *  uses, so a preset/template swap can't re-round sizes the form accepted. */
const resolveOrderSizePrecision = (
  formData: {
    pair?: string | string[];
    pairPrecisionMap?: Record<string, PairPrecisionInfo>;
  },
  slice: QuickSetupDcaLike
): number => {
  const pair = Array.isArray(formData.pair) ? formData.pair[0] : formData.pair;
  return resolveOrderSizeDecimals(
    slice.orderSizeType,
    pair ? formData.pairPrecisionMap?.[pair] : undefined
  );
};

interface PresetsPickerProps {
  /**
   * Live volatility readings for the currently-selected pair. When
   * present, presets calibrate TP% / step% to the coin's ATR%; when
   * null (loading or unavailable), the static fallback values apply.
   */
  marketStats?: MarketStats | null;
  /**
   * Which form slice to read/write. Combo bots reuse the DCA presets
   * verbatim but live under `formData.combo`, and template filtering
   * switches to `BotTypesEnum.combo` so users only see combo
   * templates.
   */
  slice?: 'dca' | 'combo';
  /**
   * Base asset of the selected pair, e.g. "BTC". Used to look up
   * precomputed curated ROIs and render them on each tier card.
   */
  coin?: string | null;
  /**
   * Exchange of the selected pair, e.g. "binance". Same purpose as `coin`.
   */
  exchange?: string | null;
}

export const PresetsPicker: React.FC<PresetsPickerProps> = ({
  marketStats = null,
  slice = 'dca',
  coin = null,
  exchange = null,
}) => {
  const {
    formData,
    setFormData,
    selectedPreset,
    setSelectedPreset,
    setIsDirty,
    mode,
  } = useBotFormState();

  // Surface the curated ROI for the form's CURRENT direction so the
  // chip here matches whatever the user picked in the new-bot wizard's
  // Top Strategies (otherwise the backend returns both long+short
  // entries per tier and the hook used to silently keep the last one).
  const formStrategy = (formData[slice] as QuickSetupDcaLike).strategy;
  const curatedStrategy =
    formStrategy === StrategyEnum.short ? 'short' : 'long';
  const roiByTier = useCuratedPresetRois({
    coin,
    exchange,
    strategy: curatedStrategy,
  });

  const templateBotType =
    slice === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;
  const allTemplates = useBotTemplatesStore((s) => s.templates);
  const dcaTemplates = useMemo(
    () => allTemplates.filter((t) => t.botType === templateBotType),
    [allTemplates, templateBotType]
  );

  const [pending, setPending] = useState<PendingSource | null>(null);

  const activePreset = useMemo(
    () => getQuickSetupPreset(selectedPreset),
    [selectedPreset]
  );

  // Detect divergence from the currently-applied preset (built-in only;
  // templates aren't tracked since they may overlay any subset). Uses
  // the current marketStats so calibration changes don't read as
  // divergence.
  //
  // Only fields the preset explicitly sets are compared. The preset's
  // applied state is `{...DCA_FORM_DEFAULTS, ...preset.values}`, but
  // most of DCA_FORM_DEFAULTS are unrelated to the preset's tier
  // philosophy — e.g. `profitCurrency` can be restored from the user's
  // last-used config and would otherwise show up as a false-positive
  // divergence the moment Quick Setup mounts. baseOrderSize/orderSize
  // are also excluded because the investment slider manages them
  // independently.
  const hasUserDivergedFromPreset = useMemo(() => {
    if (!activePreset) return false;
    const calibrated = getCalibratedPresetValues(activePreset, marketStats);
    const IGNORED: ReadonlyArray<keyof QuickSetupDcaLike> = [
      'baseOrderSize',
      'orderSize',
    ];
    const current = formData[slice] as QuickSetupDcaLike;
    return Object.keys(calibrated).some((key) => {
      const k = key as keyof QuickSetupDcaLike;
      if (IGNORED.includes(k)) return false;
      const a = calibrated[k];
      const b = current[k];
      if (Array.isArray(a) || Array.isArray(b)) {
        return JSON.stringify(a) !== JSON.stringify(b);
      }
      return String(a ?? '') !== String(b ?? '');
    });
  }, [activePreset, formData, slice, marketStats]);

  const applyPreset = (preset: QuickSetupPreset) => {
    setFormData((prev) => {
      // Preserve the current total investment when ordersCount /
      // volumeScale change (otherwise the preset's defaults reset
      // baseOrderSize back to 10 and the slider snaps to a tiny value).
      const prevSlice = prev[slice] as QuickSetupDcaLike;
      const currentInvestment = computeInvestmentFromDca(prevSlice);
      const nextDca = getPresetDcaState(preset, marketStats);
      // Carry the investment across at the pair's real order-size scale.
      // Omitting this fell back to 2 decimals — which zeroed sub-0.01 sizes
      // on BTC-/ETH-quoted pairs AND in base mode (bug #467).
      const sizes = distributeInvestmentToDca(
        currentInvestment,
        nextDca,
        resolveOrderSizePrecision(prev, prevSlice)
      );
      return {
        ...prev,
        [slice]: {
          ...nextDca,
          // Risk profiles tune step/tp/orders ladders — they're
          // direction-agnostic (drawdown % and ATR % are symmetric),
          // so the user's chosen direction should survive. Keep
          // orderSizeType too since it's linked to strategy via
          // handle-settings.ts.
          strategy: prevSlice.strategy,
          orderSizeType: prevSlice.orderSizeType,
          baseOrderSize: sizes.baseOrderSize,
          orderSize: sizes.orderSize,
        },
      };
    });
    setSelectedPreset(preset.id);
    setIsDirty(true);
  };

  // On first mount in create mode, auto-select a tier so the user
  // lands on a reasonable starting point instead of an unconfigured
  // form. Priority order:
  //   1. A pending preset id staged by the curated-presets widget
  //      (the user clicked a specific tier card on the Overview —
  //      respect that explicit choice).
  //   2. An existing selection from a restored session.
  //   3. Mid-term as the balanced default.
  // The ref guards against re-applying after the user explicitly
  // clears the selection or edits away.
  const consumePendingPresetId = useBotFormPreloadStore(
    (s) => s.consumePendingPresetId,
  );
  const didAutoPickRef = useRef(false);
  useEffect(() => {
    if (didAutoPickRef.current) return;
    if (mode !== 'create') return;
    if (selectedPreset !== null) {
      // User (or a restored session) already has a selection; respect it.
      didAutoPickRef.current = true;
      return;
    }
    const pendingId = consumePendingPresetId();
    const target =
      QUICK_SETUP_PRESETS.find((p) => p.id === pendingId) ??
      QUICK_SETUP_PRESETS.find((p) => p.id === 'mid-term');
    if (!target) return;
    didAutoPickRef.current = true;
    applyPreset(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedPreset]);

  // Re-apply the active preset when fresh calibration data arrives
  // (e.g. user picked a preset before candles loaded, or switched
  // pair afterwards). We only re-apply if the user hasn't tuned away
  // from the preset — otherwise we'd silently overwrite their edits.
  // The ref tracks the last (preset, drawdown-target) combo so we
  // don't loop off our own setFormData call. fullPeriodMax is the most
  // stable signature — it's a single number that summarizes the
  // calibration's view of this coin.
  const lastAppliedRef = useRef<{ presetId: string; ddMax: number } | null>(
    null
  );
  useEffect(() => {
    if (!activePreset || !marketStats) return;
    if (hasUserDivergedFromPreset) {
      lastAppliedRef.current = null;
      return;
    }
    const signature = {
      presetId: activePreset.id,
      ddMax: marketStats.drawdowns.fullPeriodMax,
    };
    const prev = lastAppliedRef.current;
    if (
      prev &&
      prev.presetId === signature.presetId &&
      Math.abs(prev.ddMax - signature.ddMax) < 1e-6
    ) {
      return;
    }
    lastAppliedRef.current = signature;
    applyPreset(activePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePreset,
    marketStats?.drawdowns.fullPeriodMax,
    hasUserDivergedFromPreset,
  ]);

  const applyTemplate = (templateId: string) => {
    const template = dcaTemplates.find((t) => t.id === templateId);
    if (!template) return;
    // Templates for combo bots are stored under `formData.combo`; DCA
    // templates under `formData.dca`. Both have the same investment
    // math fields (combo settings extend DCA settings).
    const incomingDca = template.formData[slice] as
      | QuickSetupDcaLike
      | undefined;
    setFormData((prev) => {
      const prevSlice = prev[slice] as QuickSetupDcaLike;
      const currentInvestment = computeInvestmentFromDca(prevSlice);
      // DCA_FORM_DEFAULTS is a safe base for both slices since
      // COMBO_FORM_DEFAULTS = { ...DCA_FORM_DEFAULTS, ... } and the
      // fields presets/templates touch are identical between the two.
      const mergedDca = {
        ...DCA_FORM_DEFAULTS,
        ...incomingDca,
      } as QuickSetupDcaLike;
      // If the template itself defined sizing fields, respect them;
      // otherwise carry the user's investment forward through the new
      // divisor.
      const templateSetSizes =
        incomingDca?.baseOrderSize !== undefined ||
        incomingDca?.orderSize !== undefined;
      const sizes = templateSetSizes
        ? {
            baseOrderSize: String(mergedDca.baseOrderSize),
            orderSize: String(mergedDca.orderSize),
          }
        : distributeInvestmentToDca(
            currentInvestment,
            mergedDca,
            resolveOrderSizePrecision(prev, prevSlice)
          );
      return {
        ...prev,
        ...template.formData,
        [slice]: {
          ...mergedDca,
          baseOrderSize: sizes.baseOrderSize,
          orderSize: sizes.orderSize,
        } as QuickSetupDcaLike,
      };
    });
    setSelectedPreset(null);
    setIsDirty(true);
  };

  const commitPending = (source: PendingSource) => {
    if (source.kind === 'preset') {
      const preset = getQuickSetupPreset(source.id);
      if (preset) applyPreset(preset);
    } else {
      applyTemplate(source.id);
    }
  };

  const handlePresetClick = (preset: QuickSetupPreset) => {
    if (preset.id === selectedPreset && !hasUserDivergedFromPreset) return;
    if (activePreset && hasUserDivergedFromPreset) {
      setPending({ kind: 'preset', id: preset.id });
      return;
    }
    applyPreset(preset);
  };

  const handleTemplateClick = (templateId: string) => {
    if (activePreset && hasUserDivergedFromPreset) {
      setPending({ kind: 'template', id: templateId });
      return;
    }
    applyTemplate(templateId);
  };

  const handleConfirmOverwrite = () => {
    if (pending) commitPending(pending);
    setPending(null);
  };

  const pendingLabel = useMemo(() => {
    if (!pending) return 'preset';
    if (pending.kind === 'preset') {
      return getQuickSetupPreset(pending.id)?.label ?? 'preset';
    }
    return dcaTemplates.find((t) => t.id === pending.id)?.name ?? 'template';
  }, [pending, dcaTemplates]);

  return (
    <div className="space-y-md">
      <div
        role="radiogroup"
        aria-label="Risk profile"
        className="grid grid-cols-1 gap-xs"
      >
        {QUICK_SETUP_PRESETS.map((preset) => {
          const isSelected = preset.id === selectedPreset;
          const preview = getPresetPreview(preset, marketStats);
          const tierKey =
            preset.id === 'short-term'
              ? 'short'
              : preset.id === 'mid-term'
                ? 'mid'
                : 'long';
          const tierEntry = roiByTier?.[tierKey] ?? null;
          const roi = tierEntry?.roi ?? null;
          const generatedAt = tierEntry?.generatedAt ?? null;
          return (
            <PresetCard
              key={preset.id}
              label={preset.label}
              explanation={preset.explanation}
              isSelected={isSelected}
              roi={roi}
              generatedAt={generatedAt}
              onClick={() => handlePresetClick(preset)}
              targetChip={
                preview.isCalibrated && preview.targetDrawdown !== null ? (
                  <span className="bg-card text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                    Target dip {preview.targetDrawdown.toFixed(1)}%
                  </span>
                ) : null
              }
              metricsLine={
                <>
                  Deviation {preview.deviation.toFixed(2)}%
                  {' · '}
                  {preview.ordersCount} SOs
                  {' · '}
                  Step {preview.step.toFixed(2)}%
                  {' · '}
                  TP {preview.tpPerc.toFixed(2)}%
                </>
              }
            />
          );
        })}
      </div>

      <TemplatesPopover
        botType={templateBotType}
        onApply={handleTemplateClick}
      />

      <PresetOverwriteDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        pendingLabel={pendingLabel}
        onConfirm={handleConfirmOverwrite}
      />
    </div>
  );
};

export default PresetsPicker;
