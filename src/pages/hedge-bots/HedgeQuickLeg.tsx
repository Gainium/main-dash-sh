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
  resolveBaseOrderContext,
  useDcaTradingContext,
} from '@/hooks/bots/dca/useDcaTradingContext';
import { resolveOrderSizeIconSymbol } from '@/utils/bots/dca/order-size-icon';
import { BotTypesEnum, OrderSizeTypeEnum, StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const LegPublisher: React.FC<{
  targetRef: MutableRefObject<BotFormData | null>;
}> = ({ targetRef }) => {
  const { formData } = useBotFormState();
  useEffect(() => {
    targetRef.current = formData;
  }, [formData, targetRef]);
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

  useEffect(() => {
    hedge?.setActiveLegPair(firstPair || null);
  }, [firstPair, hedge]);

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
  return (
    <BotFormFooter
      mode={modeOverride ?? mode}
      errors={errors}
      formData={formData}
      botType={BotTypesEnum.dca}
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
  const baseOrderSize = useBotFormSelector('baseOrderSize');

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
    if (formData.dca.orderSizeType !== unit) {
      updateFormData('orderSizeType' as Fields, unit);
    }
  }, [formData.dca.orderSizeType, unit, updateFormData]);

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

  const numericValue = Number(baseOrderSize) || 0;
  // Cap the slider at the leg's available balance when we know it; before a
  // pair (and therefore balance) resolves, fall back to a usable range.
  const sliderMax =
    availableBalance > 0 ? availableBalance : Math.max(100, numericValue);

  const setInvestment = (next: string) => {
    updateFormData('baseOrderSize' as Fields, next);
    updateFormData('orderSize' as Fields, next);
  };

  return (
    <SettingsRow
      name="Investment"
      tooltip={`Amount this leg deploys, in ${currencyLabel}.`}
      navId={`hedge-investment-${strategy}`}
    >
      <div className="space-y-xs">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={baseOrderSize ?? ''}
          onChange={(e) => setInvestment(e.target.value)}
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
          value={Math.min(Math.max(0, numericValue), sliderMax)}
          min={0}
          max={sliderMax}
          step={sliderMax > 0 ? sliderMax / 100 : 1}
          onChange={(v) => setInvestment(String(v))}
          aria-label="Investment amount"
        />
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
  const { formData, updateFormData, isFieldLocked, mode, errors } =
    useBotFormState();
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
        formData={formData}
        updateFormData={
          updateFormData as (field: Fields, value: BotFormUpdateValue) => void
        }
        errors={errors}
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
  children,
  footerSlot,
}) => {
  const experience = tryGetBotExperience(BotTypesEnum.dca);
  if (!experience) return null;

  const strategy = legId === 'long' ? StrategyEnum.long : StrategyEnum.short;

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
        <LegPublisher targetRef={formDataRef} />
        <LegStrategyPinner strategy={strategy} />
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
