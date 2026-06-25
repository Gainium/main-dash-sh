import { useEffect, useMemo, useRef, useState } from 'react';

import getLatestPrices from '@/helper/price';

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
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { GridBasicSettings } from '@/features/bots/bot-types/grid/form/sections/GridBasicSettings';
import {
  BotTypesEnum,
  StrategyEnum,
  type ExchangeInUser,
  type Prices,
} from '@/types';
import type { BotFormAlert, BotFormErrors } from '@/types/bots/form';

import { formatPriceWithPrecision } from '@/utils/formatters';

import { Slot } from '@/lib/extensions';

import { useAllStrategiesPanel } from './components/allStrategiesPanelContext';
import { GridPresetsPicker } from './components/GridPresetsPicker';
import {
  QUICK_GRID_PRESETS,
  getQuickGridPreset,
} from './components/quickGridPresets';
import {
  useAutoNameFromPreset,
  useQuickBalance,
} from './components/quick-setup/shared';
import { useMarketStats } from './hooks/useMarketStats';

const PRESET_LABELS = QUICK_GRID_PRESETS.map((p) => p.label);

const SummaryRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-md py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
);

const splitPair = (pair: string): [string, string] => {
  const [base = '', quote = ''] = pair.split('/');
  return [base, quote];
};

interface QuickGridBotFormProps {
  currentExchange: ExchangeInUser | null;
  exchangesData?: ExchangeInUser[];
  exchangesLoading?: boolean;
  errors: BotFormErrors;
}

export const QuickGridBotForm: React.FC<QuickGridBotFormProps> = ({
  currentExchange,
  exchangesData,
  exchangesLoading,
}) => {
  const { formData, updateFormData, isFieldLocked, selectedPreset, mode } =
    useBotFormState();

  const { openPanel: openAllStrategies } = useAllStrategiesPanel();

  const strategy = useBotFormSelector('strategy') as StrategyEnum | undefined;
  const gridState = formData.grid;
  const budget = Number(gridState.budget ?? 0);
  const levels = Number(gridState.levels ?? 0);
  const topPrice = Number(gridState.topPrice ?? 0);
  const lowPrice = Number(gridState.lowPrice ?? 0);
  const gridStep = Number(gridState.gridStep ?? 0);
  const gridType = gridState.gridType ?? 'geometric';

  const activePreset = useMemo(
    () => getQuickGridPreset(selectedPreset),
    [selectedPreset]
  );

  // Grid is single-pair by design (GridBasicSettings enforces it via
  // maxAllowedPairs=1). Normalize to an array view anyway for safety.
  const pairList = useMemo<string[]>(() => {
    const p = formData.pair;
    if (Array.isArray(p)) return p.filter(Boolean);
    return p ? [p] : [];
  }, [formData.pair]);
  const firstPair = pairList[0] ?? '';

  // Resolve quote asset via pairMetadata when available — pairs are
  // stored without a separator (e.g. "ADAUSDT"), so a naïve split('/')
  // returns the full pair as base and leaves quote empty.
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

  // Single-pair calibration. Grid never goes multi-pair, so no
  // "Recalculate across pairs" UI here.
  const { data: marketStats, isLoading: marketStatsLoading } = useMarketStats({
    symbol: firstPair || null,
    exchange: currentExchange?.provider ?? null,
    enabled: Boolean(firstPair && currentExchange?.provider),
  });

  // Live ticker price for the pair — fed to the Risk Profile picker so
  // tier switches can re-center the range around the actual current
  // price when marketStats can't drive full calibration (paper
  // exchanges, fresh listings, <15 candles of history).
  const [latestPrices, setLatestPrices] = useState<Prices>([]);
  useEffect(() => {
    const unsubscribe = getLatestPrices((prices) => {
      setLatestPrices(prices.data ?? []);
    }, false);
    return () => unsubscribe();
  }, []);
  const latestPairPrice = useMemo(() => {
    if (!firstPair || !currentExchange?.provider) return 0;
    // Symbols arrive in mixed formats: the form stores them without a
    // separator ("LABUSDT") while the ticker stream sometimes uses a
    // dash ("LAB-USDT") on coinbase / kucoin / hyperliquid. Compare on
    // a stripped, upper-cased form so both shapes match.
    const normalize = (s: string) => s.replace(/[-/]/g, '').toUpperCase();
    const targetSymbol = normalize(firstPair);
    // Provider names also drift: the form's exchange enum uses suffixed
    // variants ("paperKucoinSpot") while the price stream often keys
    // the spot prices under the bare provider ("paperKucoin"). Build a
    // list of acceptable exchange tags so the spot variant maps onto
    // the bare provider, and the paper variant onto its real
    // counterpart as a last resort.
    const provider = String(currentExchange.provider);
    const candidates: string[] = [provider];
    const stripped = provider.replace(/(Spot|Linear|Inverse|All)$/, '');
    if (stripped !== provider) candidates.push(stripped);
    // paperX → X fallback so users on a paper account still get a price
    // when the paper-tier ticker is missing (rare, but cheap to cover).
    const real = stripped
      .replace(/^paper/, '')
      .replace(/^./, (c) => c.toLowerCase());
    if (real && real !== stripped) candidates.push(real);
    for (const exch of candidates) {
      const match = latestPrices.find(
        (p) =>
          String(p.exchange) === exch && normalize(p.symbol) === targetSymbol
      );
      if (match) {
        const n = Number(match.price);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 0;
  }, [latestPrices, firstPair, currentExchange?.provider]);

  useAutoNameFromPreset({
    mode,
    firstPair,
    activePreset,
    presetLabels: PRESET_LABELS,
  });

  const { availableBalance } = useQuickBalance({
    currentExchange,
    asset: quoteAsset,
  });

  // One-shot clamp: when a curated preset stages a budget that exceeds
  // the user's actual balance, snap it down to availableBalance on
  // first load. Guarded so we only do it once per pair/asset combo —
  // afterwards the user is free to type any value (e.g. they plan to
  // deposit funds before launching).
  const didClampBudgetRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'create') return;
    if (!quoteAsset || !firstPair) return;
    if (availableBalance <= 0) return;
    const clampKey = `${firstPair}:${quoteAsset}`;
    if (didClampBudgetRef.current === clampKey) return;
    if (budget > availableBalance) {
      const rounded = Math.round(availableBalance * 100) / 100;
      updateFormData('budget' as Fields, rounded);
    }
    didClampBudgetRef.current = clampKey;
  }, [mode, firstPair, quoteAsset, availableBalance, budget, updateFormData]);

  const setBudget = (raw: number) => {
    const safe = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    // Round to 2 decimals — BalanceInput's percentage buttons emit the
    // raw `availableBalance × pct / 100`, which carries floating-point
    // noise (e.g. 20578.02 × 0.5 = 10289.012477405666). The display
    // hides it but the form state shouldn't.
    const rounded = Math.round(safe * 100) / 100;
    updateFormData('budget' as Fields, rounded);
  };

  const budgetPercent =
    availableBalance > 0 ? (budget / availableBalance) * 100 : 0;
  const sliderPercentValue = Math.max(0, Math.min(100, budgetPercent));
  const setBudgetPercent = (percent: number) => {
    if (availableBalance <= 0) return;
    const bounded = Math.max(0, Math.min(100, percent));
    setBudget((availableBalance * bounded) / 100);
  };

  // Per-level capital allocation. When the user spreads too little
  // budget across too many levels, each individual order is going to
  // fall below the exchange's minimum order size — flag it.
  const perLevel = levels > 0 ? budget / levels : 0;
  // Resolve the exchange's minimum quote-order amount from the form's
  // precisionMap (populated by GridBasicSettings). This is the same
  // signal the DCA Quick form uses, just looked up by pair instead of
  // aggregated.
  const exchangeMinOrderSize = useMemo<number | null>(() => {
    const map = formData.pairPrecisionMap ?? {};
    if (!firstPair) return null;
    const normalized = firstPair.replace(/[\s\-/]/g, '').toUpperCase();
    const entry = map[normalized] ?? map[firstPair];
    if (!entry) return null;
    const min = Number(entry.minQuoteAmount ?? 0);
    return Number.isFinite(min) && min > 0 ? min : null;
  }, [formData.pairPrecisionMap, firstPair]);

  // One-shot seed: a brand-new grid form lands with budget 0, which trips the
  // per-level-minimum check and looks broken / errors on launch. Seed a
  // sensible default the first time we have a balance + pair — large enough
  // that each level clears the exchange minimum (levels x min x 2), floored at
  // 100, capped at the user's available balance. The user can freely change it
  // afterwards (and a curated preset that stages its own budget pre-empts this,
  // since we only seed while budget is still 0).
  const didSeedBudgetRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'create') return;
    if (!quoteAsset || !firstPair) return;
    if (availableBalance <= 0) return;
    if (budget > 0) return;
    const seedKey = `${firstPair}:${quoteAsset}`;
    if (didSeedBudgetRef.current === seedKey) return;
    const perLevelMin = exchangeMinOrderSize ?? 10;
    const target = Math.max((levels || 10) * perLevelMin * 2, 100);
    const seed = Math.round(Math.min(target, availableBalance) * 100) / 100;
    if (seed > 0) {
      updateFormData('budget' as Fields, seed);
      didSeedBudgetRef.current = seedKey;
    }
  }, [
    mode,
    quoteAsset,
    firstPair,
    availableBalance,
    budget,
    levels,
    exchangeMinOrderSize,
    updateFormData,
  ]);

  const budgetAlerts = useMemo<BotFormAlert[]>(() => {
    if (
      !selectedPreset ||
      exchangeMinOrderSize === null ||
      budget <= 0 ||
      levels <= 0
    ) {
      return [];
    }
    if (perLevel >= exchangeMinOrderSize) return [];
    const minLabel = `${exchangeMinOrderSize}${quoteAsset ? ` ${quoteAsset}` : ''}`;
    return [
      {
        variant: 'error',
        title: 'Per-level allocation below minimum',
        message: 'Per-level allocation below minimum',
        description: `Each grid order would be ${perLevel.toFixed(2)} but the exchange minimum is ${minLabel}. Increase the investment or pick the Short-term preset (fewer levels).`,
        navId: 'budget',
      },
    ];
  }, [
    selectedPreset,
    exchangeMinOrderSize,
    budget,
    levels,
    perLevel,
    quoteAsset,
  ]);

  const summary = useMemo(() => {
    if (!activePreset) return null;
    const spreadPct =
      marketStats?.latestPrice && marketStats.latestPrice > 0 && topPrice > 0
        ? ((topPrice - lowPrice) / marketStats.latestPrice) * 100
        : null;
    const fmtPrice = (n: number) =>
      n > 0 ? formatPriceWithPrecision(n, '') : '—';
    return {
      range:
        topPrice > 0 && lowPrice > 0
          ? `${fmtPrice(lowPrice)} — ${fmtPrice(topPrice)}${
              spreadPct !== null ? ` (${spreadPct.toFixed(1)}%)` : ''
            }`
          : '—',
      gridType,
      levels: levels > 0 ? String(levels) : '—',
      gridStep: gridStep > 0 ? `${gridStep.toFixed(2)}%` : '—',
      budget:
        budget > 0
          ? `${budget.toFixed(2)}${quoteAsset ? ` ${quoteAsset}` : ''}`
          : '—',
      perLevel:
        perLevel > 0
          ? `${perLevel.toFixed(2)}${quoteAsset ? ` ${quoteAsset}` : ''}`
          : '—',
    };
  }, [
    activePreset,
    topPrice,
    lowPrice,
    gridType,
    levels,
    gridStep,
    budget,
    perLevel,
    quoteAsset,
    marketStats?.latestPrice,
  ]);

  return (
    <div className="space-y-md">
      <GridBasicSettings
        currentExchange={currentExchange}
        {...(exchangesData !== undefined ? { exchangesData } : {})}
        {...(exchangesLoading !== undefined ? { exchangesLoading } : {})}
        mode={mode}
        hideName
        hideInitialPrice
      />

      <SettingsRow
        name="Direction"
        tooltip="Long buys low and sells high; short sells high and buys low. Drives how the price range is positioned around the latest price."
        navId="strategy"
      >
        <StrategySelector
          strategy={strategy ?? StrategyEnum.long}
          onStrategyChange={(next) =>
            updateFormData('strategy' as Fields, next)
          }
          disabled={Boolean(isFieldLocked?.('strategy' as Fields))}
        />
      </SettingsRow>

      <SettingsRow
        name={`Investment${quoteAsset ? `, ${quoteAsset}` : ''}`}
        tooltip="Total quote-asset funds allocated to this grid. The bot spreads them across the grid levels."
        navId="budget"
        alerts={budgetAlerts}
      >
        <div className="space-y-sm">
          <BalanceInput
            value={budget}
            onChange={setBudget}
            availableBalance={availableBalance}
            currency={quoteAsset || 'USDT'}
            balanceAmount={availableBalance}
            balanceCurrency={quoteAsset || 'USDT'}
            coinIcon={<CoinIcon symbol={quoteAsset || 'USDT'} size="w-6 h-6" />}
            unitLabel={quoteAsset || 'USDT'}
            showPercentageButtons
            showRefreshButton={false}
            precision={2}
            step={0.01}
            currencyReferenceDisabled
            errorField="budget"
            navId="budget"
          />
          <Slider
            value={sliderPercentValue}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setBudgetPercent(v)}
            disabled={availableBalance <= 0}
            aria-label="Investment as % of available balance"
          />
        </div>
      </SettingsRow>

      <SettingsRow
        name="Risk profile"
        description="Pick a starting point. Customize later in Manual mode."
        tooltip="Range and grid spacing are auto-calculated from recent price data for the selected pair. They have not been validated and do not constitute trading advice — always review before launching."
        navId="risk-reward"
      >
        <div
          className={`transition-opacity ${marketStatsLoading ? 'opacity-60' : ''}`}
          aria-busy={marketStatsLoading}
        >
          <GridPresetsPicker
            marketStats={marketStats}
            strategy={strategy ?? StrategyEnum.long}
            coin={baseAsset || null}
            exchange={currentExchange?.provider ?? null}
            fallbackLatestPrice={latestPairPrice}
          />
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
            <SummaryRow label="Range" value={summary.range} />
            <SummaryRow label="Grid type" value={summary.gridType} />
            <SummaryRow label="Levels" value={summary.levels} />
            <SummaryRow label="Grid step" value={summary.gridStep} />
            <SummaryRow label="Investment" value={summary.budget} />
            <SummaryRow label="Capital per level" value={summary.perLevel} />
          </SettingsRowSurface>
        </SettingsRow>
      )}

      <Slot
        name="bots.quick-setup.more-strategies"
        botType={BotTypesEnum.grid}
        onShowAll={() => openAllStrategies(BotTypesEnum.grid)}
      />
    </div>
  );
};

export default QuickGridBotForm;
