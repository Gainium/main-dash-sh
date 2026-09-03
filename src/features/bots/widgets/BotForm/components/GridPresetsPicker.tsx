/* eslint-disable spacing/no-hardcoded-font-size */
import { useEffect, useMemo, useRef, useState } from 'react';

import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { useBotFormState } from '@/contexts/bots/form/BotFormProvider';
import { useCuratedPresetRois } from '@/lib/curatedPresets';
import { useBotFormPreloadStore } from '@/stores/botFormPreloadStore';
import { useBotTemplatesStore } from '@/stores/botTemplatesStore';
import { BotTypesEnum, FuturesStrategyEnum, StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { formatPriceWithPrecision } from '@/utils/formatters';
import type { MarketStats } from '@/utils/marketStats';

import {
  QUICK_GRID_PRESETS,
  getGridPresetFormState,
  getGridPresetPreview,
  getQuickGridPreset,
  type GridRangeDirection,
  type QuickGridPreset,
} from './quickGridPresets';
import {
  PresetCard,
  PresetOverwriteDialog,
  TemplatesPopover,
} from './quick-setup/shared';

type PendingSource =
  | { kind: 'preset'; id: string }
  | { kind: 'template'; id: string };

interface GridPresetsPickerProps {
  /**
   * Live volatility readings for the currently-selected pair. When
   * present, presets calibrate the range bounds + grid step against
   * historical drawdowns; when null (loading, unavailable, or <1y
   * history), the static fallback values apply.
   */
  marketStats?: MarketStats | null;
  /**
   * The side the range tilts towards — `formData.grid.strategy` for a spot
   * grid, `formData.grid.futuresStrategy` for a futures one (which adds
   * NEUTRAL, a symmetric range).
   */
  strategy: GridRangeDirection | undefined;
  /** Base asset of the selected pair, e.g. "BTC". Used to look up curated ROIs. */
  coin?: string | null;
  /** Exchange of the selected pair, e.g. "binance". */
  exchange?: string | null;
  /**
   * Live ticker price for the current pair. Used as a fallback
   * reference when `marketStats` can't drive full calibration (paper
   * exchanges, fresh listings, <15 candles) — tier switches still
   * re-center the range around the actual current price using the
   * preset's `floorPct` half-width. Without this, the range either
   * stays stale or zeros out on every tier switch.
   */
  fallbackLatestPrice?: number | null;
}

/**
 * Mirror of `PresetsPicker` for grid bots. Grid presets operate on
 * formData.grid, calibrate against a *price range* rather than a
 * safety-order ladder, and never deal with multi-pair (grid bots are
 * single-pair).
 */
export const GridPresetsPicker: React.FC<GridPresetsPickerProps> = ({
  marketStats = null,
  strategy,
  coin = null,
  exchange = null,
  fallbackLatestPrice = null,
}) => {
  const {
    formData,
    setFormData,
    selectedPreset,
    setSelectedPreset,
    setIsDirty,
    isDirty,
    mode,
  } = useBotFormState();

  // Curated leaderboard ROI for the form's CURRENT direction so the
  // chip on each Risk Profile card matches what the wizard showed.
  // The curated leaderboard only publishes long/short ROIs, so a NEUTRAL
  // futures grid reads the long side — the closest available reference.
  const curatedStrategy =
    strategy === StrategyEnum.short || strategy === FuturesStrategyEnum.short
      ? 'short'
      : 'long';
  const roiByTier = useCuratedPresetRois({
    coin,
    exchange,
    strategy: curatedStrategy,
    botType: BotTypesEnum.grid,
  });

  const allTemplates = useBotTemplatesStore((s) => s.templates);
  const gridTemplates = useMemo(
    () => allTemplates.filter((t) => t.botType === BotTypesEnum.grid),
    [allTemplates]
  );

  const [pending, setPending] = useState<PendingSource | null>(null);

  const activePreset = useMemo(
    () => getQuickGridPreset(selectedPreset),
    [selectedPreset]
  );

  /**
   * Detect divergence from the active preset. We only check the fields
   * presets actually write: topPrice, lowPrice, levels, gridType,
   * gridStep. budget is excluded (managed independently by the
   * investment row); strategy is excluded (the user picks it
   * separately and we re-calibrate from it, not against it).
   */
  // Sanitize the fallback ticker price so downstream math sees a clean
  // number-or-zero (treat anything non-positive / non-finite as "no
  // signal", which falls through to the no-range path).
  const sanitizedFallbackPrice = useMemo(() => {
    const n = Number(fallbackLatestPrice);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [fallbackLatestPrice]);

  const hasUserDivergedFromPreset = useMemo(() => {
    if (!activePreset) return false;
    const expected = getGridPresetFormState(
      activePreset,
      marketStats,
      strategy,
      sanitizedFallbackPrice
    );
    const current = formData.grid;
    // When topPrice or lowPrice is still 0, the form hasn't been
    // calibrated yet (auto-pick fired before marketStats arrived, or
    // the staged settings carried no range). In that state ALL other
    // preset-derived fields are still at their static fallback, which
    // won't match the calibrated `expected` values (gridStep especially).
    // Treat the whole form as "not yet calibrated" so the re-apply
    // effect always recalibrates once marketStats lands — otherwise the
    // gridStep mismatch flags divergence and leaves the range at 0.
    if (Number(current.topPrice) <= 0 || Number(current.lowPrice) <= 0) {
      return false;
    }
    const keys = Object.keys(expected) as Array<keyof BotFormData['grid']>;
    return keys.some((k) => {
      const a = expected[k];
      const b = current[k];
      // Loose numeric compare for prices/steps — calibration emits
      // rounded numbers, the form may stringify them.
      if (typeof a === 'number' || typeof b === 'number') {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) {
          return Math.abs(na - nb) > 1e-6;
        }
      }
      return String(a ?? '') !== String(b ?? '');
    });
  }, [activePreset, formData.grid, marketStats, strategy, sanitizedFallbackPrice]);

  const applyPreset = (preset: QuickGridPreset) => {
    setFormData((prev) => {
      const presetPatch = getGridPresetFormState(
        preset,
        marketStats,
        strategy,
        sanitizedFallbackPrice
      );
      // Preserve the user's budget across preset switches — analogous
      // to how DCA preserves baseOrderSize/orderSize through the
      // investment-distribution helpers.
      const preservedBudget = prev.grid.budget;
      // When calibration can't run (no marketStats — paper exchange,
      // fresh listing, etc.), getGridPresetFormState omits topPrice /
      // lowPrice. Without preserving the previous values they'd snap
      // to 0 (GRID_FORM_DEFAULTS) and the chart loses its range. Keep
      // whatever the form already has — either staged from a curated
      // preset or the user's prior manual entry.
      const presetHasRange =
        presetPatch.topPrice !== undefined &&
        presetPatch.lowPrice !== undefined;
      const preservedTopPrice = presetHasRange
        ? undefined
        : prev.grid.topPrice;
      const preservedLowPrice = presetHasRange
        ? undefined
        : prev.grid.lowPrice;
      // Spreading GRID_FORM_DEFAULTS first guarantees the preset can
      // never leave TP/SL toggled on. Enabling TP/SL is a separate
      // user choice — the preset only sizes the range + steps.
      return {
        ...prev,
        grid: {
          ...GRID_FORM_DEFAULTS,
          ...presetPatch,
          ...(presetHasRange
            ? {}
            : {
                topPrice: preservedTopPrice,
                lowPrice: preservedLowPrice,
              }),
          budget: preservedBudget,
          // Strategy lives on the form's Direction row, not in the
          // preset — keep whatever the user selected.
          strategy: prev.grid.strategy,
          futuresStrategy: prev.grid.futuresStrategy,
          // Carry forward exchange-related toggles so applying a
          // preset doesn't flip the user out of futures mode etc.
          futures: prev.grid.futures,
          coinm: prev.grid.coinm,
          marginType: prev.grid.marginType,
          leverage: prev.grid.leverage,
        } as BotFormData['grid'],
      };
    });
    setSelectedPreset(preset.id);
    setIsDirty(true);
  };

  // Auto-pick on first mount in create mode. Honours a pending tier id
  // staged by the curated-presets flow (wizard slot, dashboard widget,
  // More-strategies overlay) so clicking a Short / Mid / Long card
  // out there lands on the matching Risk Profile here. Falls back to
  // Mid-term when nothing is staged, mirroring DCA's auto-pick.
  const consumePendingPresetId = useBotFormPreloadStore(
    (s) => s.consumePendingPresetId,
  );
  const didAutoPickRef = useRef(false);
  useEffect(() => {
    if (didAutoPickRef.current) return;
    if (mode !== 'create') return;
    if (selectedPreset !== null) {
      didAutoPickRef.current = true;
      return;
    }
    // Grid tier ids are bare 'short' | 'mid' | 'long' (no -term
    // suffix). useBotConfigPreload writes the bare id when staged.type
    // is grid, so this lookup is direct.
    const pendingId = consumePendingPresetId();
    const target =
      QUICK_GRID_PRESETS.find((p) => p.id === pendingId) ??
      QUICK_GRID_PRESETS.find((p) => p.id === 'mid');
    if (!target) return;
    didAutoPickRef.current = true;
    // When the form was preloaded with a curated preset that already
    // carries a valid range (topPrice/lowPrice > 0), DON'T run
    // applyPreset — it would reset those server-computed values with
    // the static fallbacks any time client calibration can't run
    // (marketStats unavailable, paper exchange, fresh listing, etc.).
    // Just visually select the matching tier and leave the staged
    // values alone.
    if (
      pendingId &&
      Number(formData.grid.topPrice) > 0 &&
      Number(formData.grid.lowPrice) > 0
    ) {
      setSelectedPreset(target.id);
      return;
    }
    applyPreset(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedPreset]);

  // Re-apply the active preset when fresh calibration data arrives
  // (or when the user changes Direction — long/short/neutral changes
  // the range shape). Only re-applies when the user hasn't tuned the
  // form away from the preset. fullPeriodMax + latestPrice + strategy
  // form a stable signature for "did the calibration inputs change".
  const lastAppliedRef = useRef<{
    presetId: string;
    ddMax: number;
    latestPrice: number;
    strategy: string;
  } | null>(null);
  useEffect(() => {
    if (!activePreset || !marketStats) return;
    if (hasUserDivergedFromPreset) {
      lastAppliedRef.current = null;
      return;
    }
    const signature = {
      presetId: activePreset.id,
      ddMax: marketStats.drawdowns.fullPeriodMax,
      latestPrice: marketStats.latestPrice,
      strategy: String(strategy ?? ''),
    };
    const prev = lastAppliedRef.current;
    if (
      prev &&
      prev.presetId === signature.presetId &&
      Math.abs(prev.ddMax - signature.ddMax) < 1e-6 &&
      Math.abs(prev.latestPrice - signature.latestPrice) < 1e-6 &&
      prev.strategy === signature.strategy
    ) {
      return;
    }
    lastAppliedRef.current = signature;
    applyPreset(activePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePreset,
    marketStats?.drawdowns.fullPeriodMax,
    marketStats?.latestPrice,
    strategy,
    hasUserDivergedFromPreset,
  ]);

  const applyTemplate = (templateId: string) => {
    const template = gridTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const incomingGrid =
      (template.formData.grid as Partial<BotFormData['grid']> | undefined) ??
      {};
    setFormData((prev) => {
      const mergedGrid = {
        ...GRID_FORM_DEFAULTS,
        ...incomingGrid,
      } as BotFormData['grid'];
      return {
        ...prev,
        ...template.formData,
        grid: mergedGrid,
      };
    });
    setSelectedPreset(null);
    setIsDirty(true);
  };

  const commitPending = (source: PendingSource) => {
    if (source.kind === 'preset') {
      const preset = getQuickGridPreset(source.id);
      if (preset) applyPreset(preset);
    } else {
      applyTemplate(source.id);
    }
  };

  const handlePresetClick = (preset: QuickGridPreset) => {
    if (preset.id === selectedPreset && !hasUserDivergedFromPreset) return;
    // Only warn about overwriting when the user has made manual edits.
    // Curated-preset launches stage values that may not match the
    // client-side synthesis (e.g. server-calibrated against a much
    // longer drawdown window) — those shouldn't trigger an "overwrite
    // your changes?" dialog when the user hasn't actually touched
    // anything yet.
    if (activePreset && hasUserDivergedFromPreset && isDirty) {
      setPending({ kind: 'preset', id: preset.id });
      return;
    }
    applyPreset(preset);
  };

  const handleTemplateClick = (templateId: string) => {
    if (activePreset && hasUserDivergedFromPreset && isDirty) {
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
      return getQuickGridPreset(pending.id)?.label ?? 'preset';
    }
    return gridTemplates.find((t) => t.id === pending.id)?.name ?? 'template';
  }, [pending, gridTemplates]);

  return (
    <div className="space-y-md">
      <div
        role="radiogroup"
        aria-label="Risk profile"
        className="grid grid-cols-1 gap-xs"
      >
        {QUICK_GRID_PRESETS.map((preset) => {
          const isSelected = preset.id === selectedPreset;
          const preview = getGridPresetPreview(preset, marketStats, strategy);
          // Grid preset ids are bare tier names ('short' | 'mid' | 'long'),
          // which line up 1:1 with the curated API's tier keys.
          const tierEntry = roiByTier?.[preset.id] ?? null;
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
                preview.isCalibrated && preview.halfWidth !== null ? (
                  <span className="bg-card text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                    Targeted ±{preview.halfWidth.toFixed(1)}%
                  </span>
                ) : null
              }
              metricsLine={
                preview.isCalibrated ? (
                  <>
                    Range {formatPriceWithPrecision(preview.rangeLow, '')}
                    {' — '}
                    {formatPriceWithPrecision(preview.rangeHigh, '')}
                    {' · '}
                    {preview.levels} levels
                    {' · '}
                    Step {preview.gridStep.toFixed(2)}%{' · '}
                    {preset.calibration.gridType}
                  </>
                ) : (
                  <>
                    {preview.levels} levels
                    {' · '}
                    Step {preview.gridStep.toFixed(2)}%{' · '}
                    {preset.calibration.gridType}
                  </>
                )
              }
            />
          );
        })}
      </div>

      <TemplatesPopover
        botType={BotTypesEnum.grid}
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

export default GridPresetsPicker;
