import { useEffect, useMemo, useState } from 'react';
import { useAllStrategiesPanel } from './components/allStrategiesPanelContext';

import { Slot } from '@/lib/extensions';
import { BalanceInput } from '@/components/ui/balance-input';
import { Slider } from '@/components/ui/slider';
import SettingsRow, {
  SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import StrategySelector from '@/components/widgets/bots/StrategySelector';
import {
  useBotFormSelector,
  useBotFormState,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { BasicSettings } from '@/features/bots/bot-types/dca/form/sections/BasicSettings';
import {
  BotTypesEnum,
  OrderSizeTypeEnum,
  StrategyEnum,
  type ExchangeInUser,
} from '@/types';
import type { BotFormAlert, BotFormErrors } from '@/types/bots/form';

import { computePlannedDeviation } from '@/utils/bots/dca/capital-summary';
import {
  aggregatePrecisionConstraints,
  computeStepDecimals,
  createOrderGuard,
} from '@/features/bots/shared/utils/order-guard';

import { PresetsPicker } from './components/PresetsPicker';
import {
  computeInvestmentDivisor,
  computeInvestmentFromDca,
  distributeInvestmentToDca,
  getQuickSetupPreset,
  QUICK_SETUP_PRESETS,
  type QuickSetupDcaLike,
} from './components/quickSetupPresets';
import {
  MultiPairCalibrationStatus,
  RecalculateAcrossPairsButton,
  useAutoNameFromPreset,
  useQuickBalance,
} from './components/quick-setup/shared';
import { useMarketStats } from './hooks/useMarketStats';
import { useMultiPairMarketStats } from './hooks/useMultiPairMarketStats';

const PRESET_LABELS = QUICK_SETUP_PRESETS.map((p) => p.label);

const SummaryRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-md py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
);

/** Fallback for the rare case where pairMetadata hasn't loaded yet —
 *  pairs are stored without a separator (e.g. "ADAUSDT"), so a naïve
 *  `split('/')` returns the whole pair as base. Prefer pairMetadata
 *  whenever it's available; only use this as a last resort. */
const splitPair = (pair: string): [string, string] => {
  // `formData.pair` is typed `string | string[]`, but malformed/legacy
  // form state can surface a non-string element (e.g. a number), which
  // would throw "pair.split is not a function" inside the calibration
  // useMemos. Guard the crashing input so the Quick form stays mounted.
  if (typeof pair !== 'string') return ['', ''];
  const [base = '', quote = ''] = pair.split('/');
  return [base, quote];
};

interface QuickBotFormProps {
  currentExchange: ExchangeInUser | null;
  exchangesData?: ExchangeInUser[];
  exchangesLoading?: boolean;
  errors: BotFormErrors;
  /**
   * Which form slice this Quick Setup is driving. Combo bots reuse the
   * DCA presets verbatim (same calibration math, same investment math)
   * but read/write `formData.combo` instead of `formData.dca`. Combo
   * also hides multi-pair calibration UI — combo always calibrates on
   * the first pair only.
   */
  slice?: 'dca' | 'combo';
}

export const QuickBotForm: React.FC<QuickBotFormProps> = ({
  currentExchange,
  exchangesData,
  exchangesLoading,
  errors,
  slice = 'dca',
}) => {
  const { formData, updateFormData, isFieldLocked, selectedPreset, mode } =
    useBotFormState();

  const { openPanel: openAllStrategies } = useAllStrategiesPanel();
  const moreStrategiesBotType =
    slice === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;

  // useBotFormSelector('useTp')/'strategy' are bot-type-aware in
  // BotFormProvider (they read from formData[botType]), so they work
  // unchanged for combo — see BotFormProvider's updateFormData at
  // ~L1014 for the routing.
  const useTp = useBotFormSelector('useTp');
  const strategy = useBotFormSelector('strategy');
  const dcaState = formData[slice] as QuickSetupDcaLike;

  const activePreset = useMemo(
    () => getQuickSetupPreset(selectedPreset),
    [selectedPreset]
  );

  // Normalize pair list — formData.pair is `string | string[]`, but
  // for calibration we always want an array view.
  const pairList = useMemo<string[]>(() => {
    const p = formData.pair;
    if (Array.isArray(p)) return p.filter(Boolean);
    return p ? [p] : [];
  }, [formData.pair]);
  const firstPair = pairList[0] ?? '';
  // Combo never exposes the multi-pair calibration path — it always
  // calibrates on the first pair only. DCA keeps its multi-pair opt-in.
  const isMultiPair = slice === 'dca' && pairList.length > 1;

  const quoteAsset = useMemo(() => {
    if (!firstPair) return '';
    const meta = formData.pairMetadata?.[firstPair];
    return meta?.quoteAsset?.name || splitPair(firstPair)[1];
  }, [firstPair, formData.pairMetadata]);

  const baseAsset = useMemo(() => {
    if (!firstPair) return '';
    const meta = formData.pairMetadata?.[firstPair];
    return meta?.baseAsset?.name || splitPair(firstPair)[0];
  }, [firstPair, formData.pairMetadata]);

  // The bot form auto-flips `orderSizeType` to base when strategy
  // becomes short (see handle-settings.ts). Mirror that here so the
  // investment field switches to the base asset (label, icon,
  // available balance, precision) instead of staying stuck on quote.
  const isBaseRef = dcaState.orderSizeType === OrderSizeTypeEnum.base;
  const displayAsset = isBaseRef ? baseAsset : quoteAsset;

  // Investment decimals: stablecoin-style quotes get 2 decimals; for
  // base assets the exchange's baseStep already encodes how granular
  // the coin is (BTC ~5-8, DOGE/SHIB ~0), so cheap coins naturally
  // cap at 2 while expensive ones get the precision they need.
  const displayPrecision = useMemo(() => {
    if (!isBaseRef) return 2;
    const info = formData.pairPrecisionMap?.[firstPair];
    const baseDec = computeStepDecimals(info?.baseStep);
    return Math.min(8, Math.max(2, baseDec ?? 6));
  }, [isBaseRef, firstPair, formData.pairPrecisionMap]);
  const displayStep = useMemo(
    () => Math.pow(10, -displayPrecision),
    [displayPrecision]
  );

  // Exchange-imposed minimum per-order size (e.g. "1 USDT for BTC").
  // We surface it as a warning when either baseOrderSize or orderSize
  // drops below it — typically caused by spreading too little
  // investment across too many safety orders, or by tier presets with
  // large `ordersCount` on a tiny investment.
  const orderGuard = useMemo(() => {
    const constraints = aggregatePrecisionConstraints(
      pairList,
      formData.pairPrecisionMap ?? {}
    );
    return createOrderGuard(dcaState.orderSizeType, constraints, {
      base: baseAsset || undefined,
      quote: quoteAsset || undefined,
    });
  }, [
    pairList,
    formData.pairPrecisionMap,
    dcaState.orderSizeType,
    baseAsset,
    quoteAsset,
  ]);

  const orderMinimum =
    typeof orderGuard?.min === 'number' && orderGuard.min > 0
      ? orderGuard.min
      : null;
  const baseOrderNum = Number(dcaState.baseOrderSize ?? 0);
  const orderSizeNum = Number(dcaState.orderSize ?? 0);
  const baseOrderBelowMin =
    orderMinimum !== null && baseOrderNum > 0 && baseOrderNum < orderMinimum;
  const safetyOrderBelowMin =
    orderMinimum !== null && orderSizeNum > 0 && orderSizeNum < orderMinimum;
  const orderMinUnit = orderGuard?.unit ?? displayAsset ?? '';

  // Build BotFormAlert[] for the Investment row, matching the format
  // the rest of the form uses (chip pill + tooltip via
  // BotFormAlertSummary). Keep titles short — the chip only renders
  // the title; full prescriptive detail lives in the description.
  // Gate on `selectedPreset` so we don't surface premature validation
  // before the user has committed to a tier; the defaults state is
  // still in flux.
  const investmentAlerts = useMemo<BotFormAlert[]>(() => {
    if (orderMinimum === null || !selectedPreset) return [];
    const alerts: BotFormAlert[] = [];
    const fmt = (n: number) => n.toFixed(displayPrecision);
    const minLabel = `${orderMinimum}${orderMinUnit ? ` ${orderMinUnit}` : ''}`;
    if (baseOrderBelowMin) {
      alerts.push({
        variant: 'error',
        title: 'Base order below minimum',
        message: 'Base order below minimum',
        description: `Base order is ${fmt(baseOrderNum)} but the exchange minimum is ${minLabel}. Increase investment or reduce the safety-order count.`,
        navId: 'baseOrderSize',
      });
    }
    if (safetyOrderBelowMin) {
      alerts.push({
        variant: 'error',
        title: 'Safety orders below minimum',
        message: 'Safety orders below minimum',
        description: `Each safety order is ${fmt(orderSizeNum)} but the exchange minimum is ${minLabel}. Increase investment or reduce the safety-order count.`,
        navId: 'baseOrderSize',
      });
    }
    return alerts;
  }, [
    orderMinimum,
    orderMinUnit,
    baseOrderBelowMin,
    safetyOrderBelowMin,
    baseOrderNum,
    orderSizeNum,
    selectedPreset,
    displayPrecision,
  ]);

  // Single-pair calibration: always running for the first pair so we
  // can show stats even before the user opts into multi-pair mode.
  const { data: singlePairStats, isLoading: singlePairLoading } =
    useMarketStats({
      symbol: firstPair || null,
      exchange: currentExchange?.provider ?? null,
      enabled: Boolean(firstPair && currentExchange?.provider),
    });

  // Multi-pair calibration: opt-in via the "Recalculate across pairs"
  // button. We snapshot the pair list at click time so the hook only
  // refetches when the user explicitly re-triggers — letting us
  // compare snapshot vs. live to detect "stale" (pairs changed since
  // last calibration → button becomes active again).
  //
  // For combo, this state stays permanently null — the multi-pair
  // hook is disabled and we always fall through to first-pair stats.
  const isComboSlice = slice === 'combo';
  const [submittedSymbols, setSubmittedSymbols] = useState<string[] | null>(
    null
  );
  const currentSymbolKey = useMemo(
    () => [...new Set(pairList.map((s) => s.toUpperCase()))].sort().join('|'),
    [pairList]
  );
  const submittedSymbolKey = useMemo(
    () =>
      submittedSymbols === null
        ? null
        : [...new Set(submittedSymbols.map((s) => s.toUpperCase()))]
            .sort()
            .join('|'),
    [submittedSymbols]
  );
  // Auto-reset when the user shrinks back to a single pair.
  useEffect(() => {
    if (!isMultiPair && submittedSymbols !== null) {
      setSubmittedSymbols(null);
    }
  }, [isMultiPair, submittedSymbols]);

  const {
    result: multiPairResult,
    isLoading: multiPairLoading,
    refetch: refetchMultiPair,
  } = useMultiPairMarketStats({
    symbols: submittedSymbols ?? [],
    exchange: currentExchange?.provider ?? null,
    // Combo never opts into multi-pair calibration — keep the hook idle.
    enabled:
      !isComboSlice &&
      submittedSymbols !== null &&
      submittedSymbols.length > 0,
  });

  const isStale =
    submittedSymbolKey !== null && submittedSymbolKey !== currentSymbolKey;

  const handleRecalculate = () => {
    const snapshot = [...pairList];
    if (
      submittedSymbols !== null &&
      submittedSymbolKey === currentSymbolKey &&
      multiPairResult?.stats
    ) {
      // Same pair set — explicit refresh of cached data.
      refetchMultiPair();
      return;
    }
    setSubmittedSymbols(snapshot);
  };

  // Effective stats fed to the preset picker: merged multi-pair when
  // we have a non-stale result, otherwise the first-pair stats.
  const multiPairActive =
    submittedSymbols !== null &&
    multiPairResult?.stats !== null &&
    multiPairResult?.stats !== undefined &&
    !isStale;
  const marketStats =
    multiPairActive && multiPairResult?.stats
      ? multiPairResult.stats
      : singlePairStats;
  const marketStatsLoading =
    submittedSymbols !== null ? multiPairLoading : singlePairLoading;
  const recalculateDisabled =
    multiPairLoading ||
    (submittedSymbols !== null &&
      !isStale &&
      multiPairResult?.stats !== null &&
      multiPairResult?.stats !== undefined);

  useAutoNameFromPreset({
    mode,
    firstPair,
    activePreset,
    presetLabels: PRESET_LABELS,
  });

  const { availableBalance } = useQuickBalance({
    currentExchange,
    asset: displayAsset,
  });

  // Investment = total quote-asset funds across the base order + all
  // safety orders. Matches `totalPerDeal` from deriveCapitalSummary and
  // the "Total Funds" the DCA overview shows.
  const investment = computeInvestmentFromDca(dcaState);

  const setInvestment = (raw: number) => {
    const safe = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    // Round to `displayPrecision` decimals — BalanceInput's percentage
    // buttons emit raw `availableBalance × pct / 100` which carries
    // floating-point noise. Rounding the input first keeps the
    // recomputed total stable across re-renders. Precision varies by
    // asset: 2 for quote/stable, up to 8 for high-value base assets.
    const factor = Math.pow(10, displayPrecision);
    const rounded = Math.round(safe * factor) / factor;
    const { baseOrderSize, orderSize } = distributeInvestmentToDca(
      rounded,
      dcaState,
      displayPrecision
    );
    updateFormData('baseOrderSize' as Fields, baseOrderSize);
    updateFormData('orderSize' as Fields, orderSize);
  };

  // Minimum investment so the base order + every safety order clears the
  // exchange per-order minimum. The Quick form distributes investment
  // evenly (base = orderSize = investment / divisor), so the minimum is
  // simply `orderMinimum × divisor`. Rounded up to the display precision
  // so the shown figure is actually sufficient. Drives both the helper
  // line and the slider floor.
  const minInvestment = useMemo(() => {
    if (orderMinimum === null) return null;
    const divisor = computeInvestmentDivisor(
      dcaState.ordersCount,
      dcaState.volumeScale
    );
    const factor = Math.pow(10, displayPrecision);
    const min = Math.ceil(orderMinimum * divisor * factor) / factor;
    return min > 0 ? min : null;
  }, [
    orderMinimum,
    dcaState.ordersCount,
    dcaState.volumeScale,
    displayPrecision,
  ]);

  // Slider spans [floor, availableBalance] where floor is the minimum to
  // run (capped at the balance). Dragging fully left lands on the
  // minimum, never below; the numeric input stays free so typing below
  // still surfaces the below-minimum order alerts.
  const sliderFloor =
    minInvestment !== null ? Math.min(minInvestment, availableBalance) : 0;
  const sliderRange = Math.max(0, availableBalance - sliderFloor);
  const investmentPercent =
    sliderRange > 0 ? ((investment - sliderFloor) / sliderRange) * 100 : 0;
  const sliderPercentValue = Math.max(0, Math.min(100, investmentPercent));
  const setInvestmentPercent = (percent: number) => {
    if (availableBalance <= 0) return;
    const bounded = Math.max(0, Math.min(100, percent));
    if (sliderRange <= 0) {
      setInvestment(sliderFloor);
      return;
    }
    setInvestment(sliderFloor + (sliderRange * bounded) / 100);
  };

  const summary = useMemo(() => {
    if (!activePreset) return null;
    const dca = formData[slice] as QuickSetupDcaLike;
    // Total deviation = cumulative price-step ladder. Same formula as
    // deriveCapitalSummary's plannedDeviation; we don't need the full
    // capital summary (which requires a tradingContext with live
    // prices) for the quick form, just this primitive.
    const deviation = computePlannedDeviation(
      Number(dca.ordersCount ?? 0),
      Number(dca.step ?? 0),
      Number(dca.stepScale ?? 1)
    );
    return {
      tp: useTp ? `${dca.tpPerc ?? '—'}%` : 'Off',
      safetyOrders: `${dca.ordersCount ?? '—'} (${dca.activeOrdersCount ?? '—'} active)`,
      priceStep: `${dca.step ?? '—'}%`,
      stepScale: `×${dca.stepScale ?? '—'}`,
      volumeScale: `×${dca.volumeScale ?? '—'}`,
      maxDeals: String(dca.maxNumberOfOpenDeals ?? '—'),
      totalDeviation: Number.isFinite(deviation)
        ? `${deviation.toFixed(2)}%`
        : '—',
      totalFunds:
        investment > 0
          ? `${investment.toFixed(displayPrecision)}${displayAsset ? ` ${displayAsset}` : ''}`
          : '—',
    };
  }, [
    activePreset,
    formData,
    slice,
    useTp,
    investment,
    displayAsset,
    displayPrecision,
  ]);

  return (
    <div className="space-y-md">
      <BasicSettings
        currentExchange={currentExchange}
        formData={formData}
        updateFormData={
          updateFormData as (field: Fields, value: BotFormUpdateValue) => void
        }
        errors={errors}
        {...(exchangesData !== undefined ? { exchangesData } : {})}
        {...(exchangesLoading !== undefined ? { exchangesLoading } : {})}
        mode={mode}
        isFieldLocked={isFieldLocked}
        hideName
      />

      <SettingsRow
        name="Direction"
        tooltip="Long buys low and sells high; short sells high and buys low."
        navId="strategy"
      >
        <StrategySelector
          strategy={strategy ?? StrategyEnum.long}
          onStrategyChange={(next) => updateFormData('strategy', next)}
          disabled={Boolean(isFieldLocked?.('strategy' as Fields))}
        />
      </SettingsRow>

      <SettingsRow
        name={`Investment${displayAsset ? `, ${displayAsset}` : ''}`}
        tooltip={
          isBaseRef
            ? 'Total base-asset funds the bot can deploy across the base order and all safety orders combined.'
            : 'Total quote-asset funds the bot can deploy across the base order and all safety orders combined.'
        }
        navId="baseOrderSize"
        alerts={investmentAlerts}
      >
        <div className="space-y-sm">
          <BalanceInput
            value={investment}
            onChange={setInvestment}
            availableBalance={availableBalance}
            currency={displayAsset || 'USDT'}
            balanceAmount={availableBalance}
            balanceCurrency={displayAsset || 'USDT'}
            coinIcon={
              <CoinIcon symbol={displayAsset || 'USDT'} size="w-6 h-6" />
            }
            unitLabel={displayAsset || 'USDT'}
            showPercentageButtons
            showRefreshButton={false}
            precision={displayPrecision}
            step={displayStep}
            currencyReferenceDisabled
            errorField="baseOrderSize"
            navId="baseOrderSize"
          />
          <Slider
            value={sliderPercentValue}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setInvestmentPercent(v)}
            disabled={availableBalance <= 0 || sliderRange <= 0}
            aria-label="Investment as % of available balance"
          />
          {minInvestment !== null && (
            <p className="text-xs text-muted-foreground">
              Min to run: {minInvestment.toFixed(displayPrecision)}
              {displayAsset ? ` ${displayAsset}` : ''}
            </p>
          )}
        </div>
      </SettingsRow>

      <SettingsRow
        name="Risk profile"
        description="Pick a starting point. Customize later in Manual mode."
        tooltip="Values are auto-calculated from recent price data for the selected pair (14-day ATR). They have not been validated and do not constitute trading advice — always review before launching."
        navId="risk-reward"
        trailing={
          <RecalculateAcrossPairsButton
            isMultiPair={isMultiPair}
            multiPairLoading={multiPairLoading}
            submittedSymbols={submittedSymbols}
            pairList={pairList}
            recalculateDisabled={recalculateDisabled}
            onRecalculate={handleRecalculate}
          />
        }
      >
        <div className="space-y-xs">
          <MultiPairCalibrationStatus
            firstPair={firstPair}
            pairList={pairList}
            isMultiPair={isMultiPair}
            isStale={isStale}
            submittedSymbols={submittedSymbols}
            multiPairActive={multiPairActive}
            multiPairResult={multiPairResult}
            marketStats={marketStats}
            marketStatsLoading={marketStatsLoading}
          />
          <div
            className={`transition-opacity ${marketStatsLoading ? 'opacity-60' : ''}`}
            aria-busy={marketStatsLoading}
          >
            <PresetsPicker
              marketStats={marketStats}
              slice={slice}
              coin={baseAsset || null}
              exchange={currentExchange?.provider ?? null}
            />
          </div>
        </div>
      </SettingsRow>

      {activePreset && summary && (
        <SettingsRow
          name="Strategy summary"
          trailing={
            <span className="text-xs text-muted-foreground">
              {activePreset.label}
            </span>
          }
        >
          <SettingsRowSurface
            tone="transparent"
            padding="md"
            spacing="none"
            className="divide-y divide-border/60 border-0 bg-muted px-md py-xs shadow-inner"
          >
            <SummaryRow label="Take Profit" value={summary.tp} />
            <SummaryRow label="Safety orders" value={summary.safetyOrders} />
            <SummaryRow label="Price step" value={summary.priceStep} />
            <SummaryRow label="Step scale" value={summary.stepScale} />
            <SummaryRow label="Volume scale" value={summary.volumeScale} />
            <SummaryRow label="Max open deals" value={summary.maxDeals} />
            <SummaryRow
              label="Total deviation"
              value={summary.totalDeviation}
            />
            <SummaryRow label="Total funds needed" value={summary.totalFunds} />
          </SettingsRowSurface>
        </SettingsRow>
      )}

      <Slot
        name="bots.quick-setup.more-strategies"
        botType={moreStrategiesBotType}
        onShowAll={() => openAllStrategies(moreStrategiesBotType)}
      />
    </div>
  );
};

export default QuickBotForm;
