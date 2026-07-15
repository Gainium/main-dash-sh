/**
 * HedgeQuickLeg — minimal Quick-mode editor for ONE hedge leg.
 *
 * Mounts its own BotFormProvider + BotFormQueryProvider (with
 * `isNestedLeg` so it's not treated as a standalone DCA bot) and
 * renders the same BasicSettings (exchange + pair) the
 * regular DCA Quick form uses. Investment is configured once at the
 * hedge level and folded into both legs' seeds on Manual switch /
 * preset apply. The leg's current formData is published up to the
 * hedge layout via the provided `formDataRef`.
 */
import { useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  BotFormProvider,
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useHedgeBotFormOptional } from '@/contexts/bots/form/HedgeBotFormProvider';
import { useExampleOrdersStore } from '@/contexts/bots/form/formStoreContexts';
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { BasicSettings } from '@/features/bots/bot-types/dca/form/sections/BasicSettings';
import { tryGetBotExperience } from '@/features/bots/catalog/BotExperienceCatalog';
import {
  BotFormFooter,
  type BotFormFooterProps,
} from '@/features/bots/widgets/BotForm/components/BotFormFooter';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import {
  BotFormQueryProvider,
  useBotFormQuery,
} from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  aggregatePrecisionConstraints,
  computeStepDecimals,
  createOrderGuard,
} from '@/features/bots/shared/utils/order-guard';
import {
  computeInvestmentDivisor,
  computeInvestmentFromDca,
  distributeInvestmentToDca,
} from '@/features/bots/widgets/BotForm/components/quickSetupPresets';
import {
  resolveBaseOrderContext,
  useDcaTradingContext,
} from '@/hooks/bots/dca/useDcaTradingContext';
import { resolveOrderSizeIconSymbol } from '@/utils/bots/dca/order-size-icon';
import {
  BotTypesEnum,
  OrderSizeTypeEnum,
  StrategyEnum,
  type DCAGrid,
} from '@/types';
import type { BotFormAlert, BotFormData } from '@/types/bots/form';
import { dispatchHedgeLegAlerts } from './hedgeLegAlerts';

const LegPublisher: React.FC<{
  targetRef: MutableRefObject<BotFormData | null>;
}> = ({ targetRef }) => {
  const { formData } = useBotFormState();
  useEffect(() => {
    targetRef.current = formData;
  }, [formData, targetRef]);
  return null;
};

/**
 * Mirrors this leg's computed example orders up to the hedge layout so the
 * shared chart can draw BOTH legs' base/safety/TP lines at once (legacy
 * `chartView === 'both'` parity). Requires the leg to isolate its stores
 * (`isolateStores`) so the two co-mounted Quick legs don't clobber a shared
 * global — each writes its own store, and this publisher forwards each leg's
 * orders separately to the layout, which merges them into one chart store.
 */
const LegChartOrdersPublisher: React.FC<{
  leg: 'long' | 'short';
  onOrders: (leg: 'long' | 'short', orders: DCAGrid[]) => void;
}> = ({ leg, onOrders }) => {
  const store = useExampleOrdersStore();
  const { formData } = useBotFormState();

  // The Quick leg only mounts BasicSettings, so — unlike the full form
  // (BotForm/index.tsx) — nothing feeds the store's `symbol` context. The DCA
  // safety-order ladder is gated on `symbol` being present (createDCAOrders:
  // `if (settings.useDca && symbol)`), so without this the isolated store
  // computes only the base order + TP, never the averaging orders. Mirror the
  // full form's symbol effect here so both legs draw their full ladder.
  const firstPair = Array.isArray(formData.pair)
    ? formData.pair[0]
    : formData.pair;
  useEffect(() => {
    if (!firstPair) return;
    const realPair =
      formData.pairMetadata?.[firstPair] ??
      Object.values(formData.pairMetadata ?? {}).find(
        (p) => p.pair === firstPair
      );
    if (realPair) {
      store.setContext({ symbol: { ...realPair, maxOrders: 200 } });
    }
  }, [store, firstPair, formData.pairMetadata]);

  useEffect(() => {
    const unsubscribe = store.subscribe((orders) => {
      onOrders(leg, orders);
    });
    return () => {
      unsubscribe();
      // Clear this leg's contribution when it unmounts (e.g. leaving Quick
      // mode) so the chart doesn't keep drawing a stale leg.
      onOrders(leg, []);
    };
  }, [store, leg, onOrders]);
  return null;
};

/**
 * Mounts inside a leg's BotFormProvider and mirrors that leg's live alerts
 * up to the hedge header via the `hedge-leg-alerts` event bus. Clears the
 * leg's alerts on unmount so a tab switch doesn't leave stale entries in the
 * header.
 */
export const HedgeLegAlertPublisher: React.FC<{ leg: 'long' | 'short' }> = ({
  leg,
}) => {
  const { alerts } = useBotFormState();
  useEffect(() => {
    dispatchHedgeLegAlerts({ leg, alerts });
  }, [leg, alerts]);
  useEffect(() => {
    return () => {
      dispatchHedgeLegAlerts({ leg, alerts: {} });
    };
  }, [leg]);
  return null;
};

const LegStrategyPinner: React.FC<{ strategy: StrategyEnum }> = ({
  strategy,
}) => {
  const { updateFormData } = useBotFormState();
  const current = useBotFormSelector('strategy');
  useEffect(() => {
    if (current !== strategy) {
      updateFormData('strategy' as Fields, strategy);
    }
  }, [current, strategy, updateFormData]);
  return null;
};

/**
 * Registers a live "apply preset DCA" function for this leg into the ref the
 * hedge layout holds. The risk-profile buttons live OUTSIDE the leg providers,
 * so they can't call this leg's `setFormData` directly. Applying the preset
 * live (rather than reseeding + remounting) mirrors the regular Quick form's
 * `PresetsPicker.applyPreset` — it avoids the full remount that would reset the
 * scroll position and flash the form. The leg's total investment is preserved
 * (redistributed over the preset's new orders ladder), and its pinned
 * strategy / order-size denomination survive.
 */
const LegPresetApplier: React.FC<{
  targetRef: MutableRefObject<((nextDca: BotFormData['dca']) => void) | null>;
}> = ({ targetRef }) => {
  const { setFormData } = useBotFormState();
  useEffect(() => {
    targetRef.current = (nextDca: BotFormData['dca']) => {
      setFormData((prev) => {
        const prevDca = prev.dca;
        const currentInvestment = computeInvestmentFromDca(prevDca);
        const precision =
          prevDca.orderSizeType === OrderSizeTypeEnum.base ? 8 : 2;
        const merged = {
          ...nextDca,
          strategy: prevDca.strategy,
          orderSizeType: prevDca.orderSizeType,
        } as BotFormData['dca'];
        const { baseOrderSize, orderSize } = distributeInvestmentToDca(
          currentInvestment,
          merged,
          precision
        );
        return {
          ...prev,
          dca: { ...merged, baseOrderSize, orderSize },
        };
      });
    };
    return () => {
      targetRef.current = null;
    };
  }, [setFormData, targetRef]);
  return null;
};

/**
 * Publishes this leg's pair + exchange up to the hedge context so the
 * chart panel renders the right market in Quick mode (Manual mode has
 * its own publisher in HedgeBotEditLayout). Also registers a chart
 * symbol writer so picks from the TradingView widget land on this
 * leg's formData. Only the long leg mounts this in Quick mode — both
 * legs are visible at once, so we pick one to drive the chart.
 */
const QuickLegChartPublisher: React.FC = () => {
  const hedge = useHedgeBotFormOptional();
  const { formData, updateFormData } = useBotFormState();

  const firstPair = Array.isArray(formData.pair)
    ? (formData.pair[0] ?? null)
    : (formData.pair ?? null);
  const pairCount = Array.isArray(formData.pair)
    ? formData.pair.length
    : formData.pair
      ? 1
      : 0;

  useEffect(() => {
    hedge?.setActiveLegPair(firstPair || null);
    // QuickLegChartPublisher is long-only, so the long-leg pair + count the
    // auto-name hook reads (for the `+N` multi-pair suffix) is published here.
    hedge?.setLongLegPair(firstPair || null);
    hedge?.setLongLegPairCount(pairCount || 1);
  }, [firstPair, pairCount, hedge]);

  useEffect(() => {
    hedge?.setActiveLegExchangeUUID(formData.exchangeUUID ?? null);
  }, [formData.exchangeUUID, hedge]);

  useEffect(() => {
    if (!hedge) return;
    // eslint-disable-next-line react-hooks/immutability
    hedge.chartSymbolWriterRef.current = (newPair: string) => {
      updateFormData('pair' as never, [newPair] as never);
    };
    return () => {
      hedge.chartSymbolWriterRef.current = null;
    };
  }, [hedge, updateFormData]);

  return null;
};

/**
 * Renders BotFormFooter inside the leg's BotFormProvider tree. Reads
 * formData and currentExchange from the leg's context so the footer's
 * credits + UI work like the standalone DCA bot footer. The hedge
 * layout supplies the actual onSubmit/saveLabel/backtest handlers via
 * `footerOverride`.
 */
export const HedgeQuickFooter: React.FC<{
  footerOverride: Partial<BotFormFooterProps> & { activeDeals?: number };
  /** Force the footer's create/edit mode (the shared-settings tab mounts a
   *  throwaway create provider but still needs the edit footer in edit mode:
   *  Save + start/stop instead of Create). Falls back to the provider mode. */
  modeOverride?: BotFormMode;
}> = ({ footerOverride, modeOverride }) => {
  const { formData, errors, mode } = useBotFormState();
  const { currentExchange } = useBotFormQuery();
  const hedge = useHedgeBotFormOptional();
  return (
    <BotFormFooter
      mode={modeOverride ?? mode}
      errors={errors}
      formData={formData}
      botType={hedge?.legBotType ?? BotTypesEnum.dca}
      currentExchange={currentExchange}
      submitLabel={footerOverride.submitLabel ?? 'Save'}
      submitDisabled={!!footerOverride.submitDisabled}
      submitIsPending={!!footerOverride.submitIsPending}
      onSubmit={footerOverride.onSubmit ?? (() => {})}
      {...(footerOverride.onBacktest
        ? { onBacktest: footerOverride.onBacktest }
        : {})}
      {...(footerOverride.onRunBacktestDirect
        ? { onRunBacktestDirect: footerOverride.onRunBacktestDirect }
        : {})}
      backtestPending={!!footerOverride.backtestPending}
      {...(footerOverride.backtestProgress !== undefined
        ? { backtestProgress: footerOverride.backtestProgress }
        : {})}
      {...(footerOverride.backtestSummary !== undefined
        ? { backtestSummary: footerOverride.backtestSummary }
        : {})}
      {...(footerOverride.onViewResults
        ? { onViewResults: footerOverride.onViewResults }
        : {})}
      {...(footerOverride.onDismissResults
        ? { onDismissResults: footerOverride.onDismissResults }
        : {})}
      {...(footerOverride.onCancelBacktest
        ? { onCancelBacktest: footerOverride.onCancelBacktest }
        : {})}
      hideTemplates={footerOverride.hideTemplates ?? true}
      showCredits={!!footerOverride.showCredits}
      creditsMultiplier={footerOverride.creditsMultiplier ?? 2}
      {...(footerOverride.menuConfig !== undefined
        ? { menuConfig: footerOverride.menuConfig }
        : {})}
      {...(footerOverride.onToggleStatus
        ? { onToggleStatus: footerOverride.onToggleStatus }
        : {})}
      {...(footerOverride.botStatus !== undefined
        ? { botStatus: footerOverride.botStatus }
        : {})}
      {...(footerOverride.toggleDisabled !== undefined
        ? { toggleDisabled: footerOverride.toggleDisabled }
        : {})}
      {...(footerOverride.togglePending !== undefined
        ? { togglePending: footerOverride.togglePending }
        : {})}
      {...(footerOverride.activeDeals !== undefined
        ? { activeDealsOverride: footerOverride.activeDeals }
        : {})}
    />
  );
};

/**
 * Mounts the BotFormProvider stack so a non-leg surface (the hedge tab with
 * the shared TP/SL settings) can render the same BACKTEST + Create/Save
 * footer the leg tabs have. The provider is a throwaway DCA context seeded
 * with the long leg so the footer's credits + exchange read sensibly; the
 * actual Save/Backtest/Start behaviour comes from `footerOverride` (the
 * hedge handlers). `children` is the tab body, rendered above the footer.
 */
export const HedgeFooterShell: React.FC<{
  widgetId: string;
  mode: BotFormMode;
  footerOverride: Partial<BotFormFooterProps> & { activeDeals?: number };
  initialFormData?: Partial<BotFormData> | undefined;
  children: ReactNode;
}> = ({ widgetId, mode, footerOverride, initialFormData, children }) => {
  const experience = tryGetBotExperience(BotTypesEnum.dca);
  if (!experience) return null;

  return (
    <BotFormRegistryContext.Provider
      value={{ botExperience: experience, widgetId }}
    >
      <BotFormProvider
        mode="create"
        botType={BotTypesEnum.dca}
        isNestedLeg
        {...(initialFormData ? { initialFormData } : {})}
      >
        <BotFormQueryProvider mode="create">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-md">
              {children}
            </div>
            <div className="shrink-0 pt-2">
              <HedgeQuickFooter
                footerOverride={footerOverride}
                modeOverride={mode}
              />
            </div>
          </div>
        </BotFormQueryProvider>
      </BotFormProvider>
    </BotFormRegistryContext.Provider>
  );
};

/**
 * Per-leg Investment control for the Quick view. Mounts inside a leg's
 * BotFormProvider so it can read that leg's pair/balance and write its
 * order size directly into the leg's formData.
 *
 * A long leg buys base with quote, so its investment is a QUOTE amount
 * (e.g. USDT); a short leg sells base, so its investment is a BASE amount
 * (e.g. BTC). We pin the leg's `orderSizeType` to match and cap the slider
 * at the leg's available balance in that unit — so one shared number can't
 * land as "89 BTC" on a wallet that only holds USDT.
 */
export const HedgeQuickInvestment: React.FC = () => {
  const { formData, updateFormData } = useBotFormState();
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');

  // A Hedge DCA leg stores its order sizing under `formData.dca`; a Hedge
  // Combo leg stores it under `formData.combo` (COMBO_FORM_DEFAULTS spreads the
  // same DCA fields). Read from whichever the leg actually uses so the figure
  // isn't stale/frozen — updateFormData already routes writes to the right
  // sub-object by botType.
  const dcaState =
    formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;

  // Match resolveBaseOrderContext's denomination rules so the icon, unit
  // label, stored orderSizeType, and balance check all agree:
  //  - COIN-M futures settle in base (e.g. BTC)
  //  - USDⓈ-M futures settle in quote (e.g. USDT) regardless of direction
  //  - spot: a long buys with quote, a short sells base
  const unit = coinm
    ? OrderSizeTypeEnum.base
    : futures
      ? OrderSizeTypeEnum.quote
      : strategy === StrategyEnum.short
        ? OrderSizeTypeEnum.base
        : OrderSizeTypeEnum.quote;

  // Keep the leg denominated in its natural side even if the user never
  // touches the field (so the saved bot + balance check use the right wallet).
  useEffect(() => {
    if (dcaState.orderSizeType !== unit) {
      updateFormData('orderSizeType' as Fields, unit);
    }
  }, [dcaState.orderSizeType, unit, updateFormData]);

  const tradingContext = useDcaTradingContext(formData);
  const { availableBalance, currencyLabel } = useMemo(() => {
    const params: Parameters<typeof resolveBaseOrderContext>[0] = {
      currencyReference: unit,
      strategy,
      aggregatedBalances: tradingContext.aggregatedBalances,
      futures: Boolean(futures),
      coinm: Boolean(coinm),
    };
    if (tradingContext.baseAsset) params.baseAsset = tradingContext.baseAsset;
    if (tradingContext.quoteAsset) params.quoteAsset = tradingContext.quoteAsset;
    if (typeof tradingContext.latestPrice === 'number') {
      params.latestPrice = tradingContext.latestPrice;
    }
    return resolveBaseOrderContext(params);
  }, [
    unit,
    strategy,
    futures,
    coinm,
    tradingContext.aggregatedBalances,
    tradingContext.baseAsset,
    tradingContext.quoteAsset,
    tradingContext.latestPrice,
  ]);

  // Same coin icon the base-order-size field shows, following the leg's unit.
  const coinIconSymbol = resolveOrderSizeIconSymbol(
    unit,
    tradingContext.baseAsset,
    tradingContext.quoteAsset
  );

  // Investment is the TOTAL funds the leg deploys across the base order + all
  // safety orders (base + Σ orderSize·volumeScale^i) — NOT a single order
  // size. Reuse the same total/distribute math the standalone Quick form and
  // its presets use so the figure reconciles. Typing a total redistributes it
  // back into baseOrderSize/orderSize for the current orders ladder.
  const firstPair = Array.isArray(formData.pair)
    ? formData.pair[0]
    : formData.pair;
  const precision = useMemo(() => {
    if (unit !== OrderSizeTypeEnum.base) return 2;
    const info = firstPair ? formData.pairPrecisionMap?.[firstPair] : undefined;
    const baseDec = computeStepDecimals(info?.baseStep);
    return Math.min(8, Math.max(2, baseDec ?? 6));
  }, [unit, firstPair, formData.pairPrecisionMap]);

  const investment = computeInvestmentFromDca(dcaState);
  // Distributing a total into per-order sizes rounds each order to `precision`,
  // so recomputing the total reintroduces float residue (e.g. 600.07828125).
  // Round the displayed figure to the same precision the field accepts.
  const displayInvestment = useMemo(() => {
    const factor = Math.pow(10, precision);
    return Math.round(investment * factor) / factor;
  }, [investment, precision]);

  // Exchange per-order minimum for this leg's pair(s), in the leg's unit.
  // Reuses the same order-guard the standalone Quick form uses so the
  // "below minimum" alerts + "Min to run" figure reconcile with it.
  const pairList = Array.isArray(formData.pair)
    ? formData.pair.filter((p): p is string => !!p)
    : formData.pair
      ? [formData.pair]
      : [];
  const pairListKey = pairList.join(',');
  const orderGuard = useMemo(
    () =>
      createOrderGuard(
        unit,
        aggregatePrecisionConstraints(pairList, formData.pairPrecisionMap ?? {}),
        {
          base: tradingContext.baseAsset || undefined,
          quote: tradingContext.quoteAsset || undefined,
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      unit,
      pairListKey,
      formData.pairPrecisionMap,
      tradingContext.baseAsset,
      tradingContext.quoteAsset,
    ]
  );
  const orderMinimum =
    typeof orderGuard?.min === 'number' && orderGuard.min > 0
      ? orderGuard.min
      : null;
  const orderMinUnit = orderGuard?.unit ?? currencyLabel ?? '';

  const baseOrderNum = Number(dcaState.baseOrderSize ?? 0);
  const orderSizeNum = Number(dcaState.orderSize ?? 0);
  const baseOrderBelowMin =
    orderMinimum !== null && baseOrderNum > 0 && baseOrderNum < orderMinimum;
  const safetyOrderBelowMin =
    orderMinimum !== null && orderSizeNum > 0 && orderSizeNum < orderMinimum;

  // Below-minimum alerts, matching the standalone Quick form's format so the
  // Investment row surfaces a chip + tooltip via BotFormAlertSummary.
  const investmentAlerts = useMemo<BotFormAlert[]>(() => {
    if (orderMinimum === null) return [];
    const alerts: BotFormAlert[] = [];
    const fmt = (n: number) => n.toFixed(precision);
    const minLabel = `${orderMinimum}${orderMinUnit ? ` ${orderMinUnit}` : ''}`;
    const navId = `hedge-investment-${strategy}`;
    if (baseOrderBelowMin) {
      alerts.push({
        variant: 'error',
        title: 'Base order below minimum',
        message: 'Base order below minimum',
        description: `Base order is ${fmt(baseOrderNum)} but the exchange minimum is ${minLabel}. Increase this leg's investment or reduce its safety-order count.`,
        navId,
      });
    }
    if (safetyOrderBelowMin) {
      alerts.push({
        variant: 'error',
        title: 'Safety orders below minimum',
        message: 'Safety orders below minimum',
        description: `Each safety order is ${fmt(orderSizeNum)} but the exchange minimum is ${minLabel}. Increase this leg's investment or reduce its safety-order count.`,
        navId,
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
    precision,
    strategy,
  ]);

  // Minimum investment so the base order + every safety order clears the
  // exchange per-order minimum (base = orderSize = investment / divisor, so
  // the floor is `orderMinimum × divisor`, rounded up to display precision).
  const minInvestment = useMemo(() => {
    if (orderMinimum === null) return null;
    const divisor = computeInvestmentDivisor(
      dcaState.ordersCount,
      dcaState.volumeScale
    );
    const factor = Math.pow(10, precision);
    const min = Math.ceil(orderMinimum * divisor * factor) / factor;
    return min > 0 ? min : null;
  }, [
    orderMinimum,
    dcaState.ordersCount,
    dcaState.volumeScale,
    precision,
  ]);

  const setInvestment = (raw: number) => {
    const safe = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const factor = Math.pow(10, precision);
    const rounded = Math.round(safe * factor) / factor;
    const { baseOrderSize, orderSize } = distributeInvestmentToDca(
      rounded,
      dcaState,
      precision
    );
    updateFormData('baseOrderSize' as Fields, baseOrderSize);
    updateFormData('orderSize' as Fields, orderSize);
  };

  // Cap the slider at the leg's available balance when we know it; before a
  // pair (and therefore balance) resolves, fall back to a usable range.
  const sliderMax =
    availableBalance > 0
      ? availableBalance
      : Math.max(100, displayInvestment);

  return (
    <SettingsRow
      name="Investment"
      tooltip={`Total funds this leg deploys across all orders, in ${currencyLabel}.`}
      navId={`hedge-investment-${strategy}`}
      alerts={investmentAlerts}
    >
      <div className="space-y-xs">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={Math.pow(10, -precision)}
          value={displayInvestment}
          onChange={(e) => setInvestment(Number(e.target.value))}
          placeholder="0.00"
          className="pl-[4.5rem]"
          startAdornment={
            <span className="flex items-center gap-1.5">
              <CoinIcon symbol={coinIconSymbol} size="w-6 h-6" />
              <span className="text-xs font-semibold text-muted-foreground">
                {currencyLabel}
              </span>
            </span>
          }
        />
        <Slider
          value={Math.min(Math.max(0, displayInvestment), sliderMax)}
          min={0}
          max={sliderMax}
          step={sliderMax > 0 ? sliderMax / 100 : 1}
          onChange={(v) => setInvestment(v)}
          aria-label="Investment amount"
        />
        {minInvestment !== null && (
          <p className="text-xs text-muted-foreground">
            Min to run: {minInvestment.toFixed(precision)}
            {orderMinUnit ? ` ${orderMinUnit}` : ''}
          </p>
        )}
        {availableBalance > 0 && (
          <p className="text-xs text-muted-foreground">
            Available:{' '}
            {availableBalance.toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })}{' '}
            {currencyLabel}
          </p>
        )}
      </div>
    </SettingsRow>
  );
};

const LegFields: React.FC<{ legId: 'long' | 'short' }> = ({ legId }) => {
  const { updateFormData, isFieldLocked, mode } = useBotFormState();
  const { currentExchange } = useBotFormQuery();
  // BotFormQueryProvider only resolves `currentExchange` from formData;
  // the dropdown's full options list comes from ExchangeDataContext.
  const { data: exchangesResp, loading: exchangesLoading } =
    useExchangesFromContext();
  const exchangesData = exchangesResp?.data?.exchanges ?? [];

  return (
    <div className="space-y-xs">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {legId === 'long' ? 'LONG leg' : 'SHORT leg'}
      </h3>
      <BasicSettings
        currentExchange={currentExchange}
        updateFormData={
          updateFormData as (field: Fields, value: BotFormUpdateValue) => void
        }
        mode={mode}
        isFieldLocked={isFieldLocked}
        exchangesData={exchangesData}
        exchangesLoading={exchangesLoading}
        hideName
      />
    </div>
  );
};

export interface HedgeQuickLegProps {
  legId: 'long' | 'short';
  widgetId: string;
  initialFormData?: Partial<BotFormData> | undefined;
  formDataRef: MutableRefObject<BotFormData | null>;
  /**
   * Ref the hedge layout uses to live-apply a risk-profile preset's DCA to
   * this leg without remounting it (avoids scroll reset / flash). Registered
   * by LegPresetApplier once the leg's provider is mounted.
   */
  presetApplyRef?: MutableRefObject<
    ((nextDca: BotFormData['dca']) => void) | null
  >;
  /**
   * When set, this leg isolates its side-effect stores (example orders /
   * indicators) so two co-mounted Quick legs don't clobber the shared globals,
   * and its computed example orders are forwarded via `onChartOrders` so the
   * hedge chart can draw both legs together.
   */
  onChartOrders?: (leg: 'long' | 'short', orders: DCAGrid[]) => void;
  /**
   * Optional children rendered AFTER the leg's exchange/pair fields
   * but inside the leg's BotFormProvider. Used so the long leg can
   * wrap the rest of the Quick view (short leg, investment, risk
   * profile, footer) — the footer then has access to the long leg's
   * formData / currentExchange for credits + Create-bot CTA.
   */
  children?: ReactNode;
  /**
   * Optional slot rendered at the very end of the leg's BotFormProvider
   * tree (after `children`). Used to mount BotFormFooter at the bottom
   * of the Quick view.
   */
  footerSlot?: ReactNode;
}

export const HedgeQuickLeg: React.FC<HedgeQuickLegProps> = ({
  legId,
  widgetId,
  initialFormData,
  formDataRef,
  presetApplyRef,
  onChartOrders,
  children,
  footerSlot,
}) => {
  // Each leg is a DCA bot in a Hedge DCA, but a COMBO bot in a Hedge Combo.
  // Mount the leg's form/example-orders pipeline with the hedge's actual leg
  // type so the chart draws the combo grid ladder (not just the DCA safety
  // orders) in Quick mode — matching Manual mode, which mounts BotFormWidget
  // with `legBotType`. Without this the merged both-legs chart renders a
  // plain DCA ladder for a combo hedge.
  const hedge = useHedgeBotFormOptional();
  const legBotType = hedge?.legBotType ?? BotTypesEnum.dca;
  const experience = tryGetBotExperience(legBotType);
  if (!experience) return null;

  const strategy = legId === 'long' ? StrategyEnum.long : StrategyEnum.short;

  return (
    <BotFormRegistryContext.Provider
      value={{ botExperience: experience, widgetId }}
    >
      <BotFormProvider
        mode="create"
        botType={legBotType}
        isNestedLeg
        // Both Quick legs mount at once; isolate their example-order /
        // indicator stores so they don't clobber each other (and so each leg's
        // orders can be forwarded separately for the both-legs chart).
        isolateStores={!!onChartOrders}
        {...(initialFormData ? { initialFormData } : {})}
      >
        <LegPublisher targetRef={formDataRef} />
        <LegStrategyPinner strategy={strategy} />
        <HedgeLegAlertPublisher leg={legId} />
        {presetApplyRef ? <LegPresetApplier targetRef={presetApplyRef} /> : null}
        {onChartOrders ? (
          <LegChartOrdersPublisher leg={legId} onOrders={onChartOrders} />
        ) : null}
        {legId === 'long' && <QuickLegChartPublisher />}
        <BotFormQueryProvider mode="create">
          {footerSlot ? (
            // When this leg owns the page footer (the long leg in the
            // hedge Quick view), lay out its tree as a flex column with
            // a scrollable middle and the footer pinned at the bottom.
            // The header above sits outside this component and uses
            // position:sticky to stay in place during scroll.
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-md">
                <LegFields legId={legId} />
                {children}
              </div>
              <div className="shrink-0 pt-2">{footerSlot}</div>
            </div>
          ) : (
            <>
              <LegFields legId={legId} />
              {children}
            </>
          )}
        </BotFormQueryProvider>
      </BotFormProvider>
    </BotFormRegistryContext.Provider>
  );
};

export default HedgeQuickLeg;
