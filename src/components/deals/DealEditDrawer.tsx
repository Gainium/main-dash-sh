import {
  ScrollableFormTabNavigation,
  type ScrollableTabItem,
} from '@/components/ui/ScrollableFormTabNavigation';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerFooter,
  DetailDrawerHeader,
  DetailDrawerTrigger,
} from '@/components/ui/detail-drawer';
import {
  TradingTerminalUtilsContext,
  TradingTerminalUtilsProvider,
  useTradingTerminalUtils,
} from '@/context/TradingTerminalUtilsContext';
import { useExampleOrdersStore } from '@/contexts/bots/form/formStoreContexts';
import type { ExampleOrdersStoreContext } from '@/utils/bots/dca/example-orders-core';
import { useLiveUpdate } from '@/contexts/LiveUpdateContext';
import {
  BotFormProvider,
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
  type BotFormTabId,
} from '@/features/bots';
import {
  DCASettings,
  TakeProfitSettings,
} from '@/features/bots/bot-types/dca/form/sections';
import {
  getBotExperience,
  tryGetBotExperience,
} from '@/features/bots/catalog/BotExperienceCatalog';
import type { BotExperienceDescriptor } from '@/features/bots/catalog/types';
import { StopLossSettings } from '@/features/bots/shared/sections';
import { SectionHeader } from '@/features/bots/shared/components/SectionHeader';
import type { TabDescriptorInput } from '@/features/bots/shared/tabs/createTabDescriptors';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm';
import BotFormAlertButton from '@/features/bots/widgets/BotForm/components/BotFormAlertButton';
import { BUTTON_PRIORITIES } from '@/features/bots/widgets/BotForm/components/BotFormFooter';
import {
  BotFormQueryProvider,
  useBotFormQuery,
} from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import type {
  BotFormTabComponentProps,
  GetBalanceFn,
} from '@/features/bots/widgets/BotForm/types';
import {
  useBotFormMutations,
  type UseBotFormMutationsOptions,
} from '@/hooks/bots/base/useBotFormMutations';
import { useEditDeal, useResetDeal } from '@/hooks/useDealActions';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { isActiveDeal } from '@/lib/utils/unrealizedPnL';
import {
  BotTypesEnum,
  DCAOrderTypeEnum,
  ExchangeEnum,
  type ComboBotSettings,
  type DCABotSettings,
  type DCADeals,
  type DCADealsSettings,
} from '@/types';
import type { BotFormData } from '@/types/bots';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Delete,
  Loader2,
  Save,
  SlidersHorizontal,
  TrendingUp,
  Undo,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ResponsiveButtonRow, {
  type ResponsiveButtonConfig,
} from '../ui/ResponsiveButtonRow';
import { Button } from '../ui/button';
import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import type { TradingPair } from '@/hooks/useTradingPairs';
import { NumberInput } from '@/components/ui/number-input';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';

interface DealEditDrawerProps {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  trade: DCADeals[] | null;
  /**
   * Bot type of the deal(s) being edited, supplied by the caller.
   *
   * Deals reach this drawer raw from `useDcaDeals` / `useBotSpecificDeals`,
   * and the raw deal carries no comboness: `DCADeals.combo` is declared but
   * no query selects it and nothing writes it, and the embedded `dcaBot`
   * projection has only `settings`/`symbol`/`exchange` — no `type`. So the
   * drawer cannot derive this itself; the caller (which knows the bot) has
   * to tell it, exactly as legacy main-dash passes `combo` into
   * `DcaDealEditDrawer`.
   *
   * Getting this wrong is not cosmetic: it selects the form slice
   * (`formData.combo` vs `formData.dca`) AND the save mutation, and the two
   * mutations read different Mongo collections (`comboDeal` vs `dcaDeal`),
   * so a combo deal saved through the DCA mutation fails outright with
   * "Deal not found".
   */
  botType?: BotTypesEnum;
  /** When true, renders form content directly without a DetailDrawer wrapper (for embedding inline in another drawer) */
  inline?: boolean;
  /**
   * Set when this form is mounted next to a chart that should track it (the
   * bot drawer's Edit Deal view). Turns on the example-orders feed so the
   * TP/SL lines follow what the user types, wires the chart-line drag handler
   * back into the form, and lets the bullseye pickers resolve against the
   * host's chart. Off everywhere else — most mounts have no chart, and the
   * feed would clobber whatever the host page had plotted.
   */
  chartSync?: boolean;
}

/**
 * Collapse any bot type onto the two slices this form actually has.
 * Hedge legs follow their underlying engine — mirrors `transformDeal` in
 * `types/dcaDeal.ts`, which treats `combo` and `hedgeCombo` alike. Grid and
 * terminal deals are DCA-shaped, matching the previous default.
 */
const toDealFormBotType = (botType?: BotTypesEnum): BotTypesEnum =>
  botType === BotTypesEnum.combo || botType === BotTypesEnum.hedgeCombo
    ? BotTypesEnum.combo
    : BotTypesEnum.dca;

const mapFromDataToDealSettings = (
  formData: BotFormData,
  isMultiple: boolean,
  reset?: boolean,
  originalTradeSettings?: DCADealsSettings
) => {
  const newState =
    formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;
  const originalState =
    originalTradeSettings ??
    ((formData.originalBot?.type === formData.type
      ? formData.originalBot.settings
      : undefined) as DCABotSettings | ComboBotSettings | undefined);
  const keys = [
    'avgPrice',
    'ordersCount',
    'step',
    'baseOrderPrice',
    'useLimitPrice',
    'startOrderType',
    'tpPerc',
    'profitCurrency',
    'baseOrderSize',
    'orderSize',
    'useTp',
    'useDca',
    'useSmartOrders',
    'activeOrdersCount',
    'volumeScale',
    'stepScale',
    'minimumDeviation',
    'useSl',
    'slPerc',
    'trailingSl',
    'moveSL',
    'moveSLTrigger',
    'moveSLValue',
    'moveSLForAll',
    'trailingTp',
    'trailingTpPerc',
    'useMinTP',
    'minTp',
    'orderSizeType',
    'useMultiSl',
    'multiSl',
    'useMultiTp',
    'multiTp',
    'dealCloseCondition',
    'dealCloseConditionSL',
    'closeDealType',
    'futures',
    'coinm',
    'marginType',
    'leverage',
    // This array is the only thing that decides what reaches the editDeal
    // mutation, so a field the UI can change and this list omits is silently
    // unsaveable — the drawer closes as if it had saved and the deal keeps its
    // old value.
    //
    // `gridLevel` is here because DCASettings renders the combo "DCA grid
    // levels" input under `isComboBot` with no deal-edit guard. That branch
    // now fires: the drawer takes its bot type from the caller's `botType`
    // prop, so `formData.type` is `combo` for a combo deal. (It never fired
    // while the type was derived from `trade[0].combo` — a field nothing
    // selects or writes.) The backend accepts it: `gridLevel: String` is
    // declared on `comboDealSettingsInputSet`. Covered by
    // tests-e2e/specs/deal-edit-gridlevel.e2e.test.ts.
    //
    // The input itself is now READ-ONLY in this drawer, matching legacy
    // main-dash (`props.isDealEdit && combo` in DcaModeSettings.tsx), so in
    // practice `gridLevel` never differs from the original and never ships.
    // The same is true of `orderSize` and `step` above, which legacy gates on
    // the same condition. All three stay listed on purpose: if a control is
    // ever re-enabled for deal edit, dropping its key here would make it
    // silently unsaveable — exactly the failure this array exists to prevent.
    'gridLevel',
    'useFixedTPPrices',
    'useFixedSLPrices',
    'dcaCondition',
    'closeByTimer',
    'closeByTimerUnits',
    'closeByTimerValue',
    'dcaCustom',
    'comboTpBase',
    'fixedSlPrice',
    'fixedTpPrice',
    'comboUseSmartGrids',
    'comboSmartGridsCount',
    'baseSlOn',
    'dcaVolumeBaseOn',
    'dcaVolumeRequiredChangeRef',
    'dcaVolumeMaxValue',
    'dcaVolumeRequiredChange',
    // ── Declared on DCADealsSettings but DELIBERATELY absent from this list.
    // Checked 2026-08-14; don't re-derive, and don't add them "for symmetry".
    //
    // `scaleDcaType` — DCASettings renders its control inside a
    //   `{!isComboBot && !isDealEdit && …}` guard, so it is unreachable in
    //   both `deal-edit` and `deal-mass-edit`.
    //
    // `useRiskReward`, `riskUseTpRatio` — written only by RiskRewardSettings,
    //   which is mounted only by RiskRewardSettingsTab, which appears only in
    //   the full bot-form tab registries (bot-types/{dca,combo}/form/tabs).
    //   This drawer builds its own `visibleDescriptors` — a literal
    //   `useMemo(…, [])` of exactly strategy / take-profit / stop-loss / dca,
    //   with no branch on mode — so there is no Risk:Reward section in either
    //   drawer mode. (`sectionToggleMap` still maps 'risk-reward' →
    //   'useRiskReward'; that entry is dead, no descriptor has that id.)
    //   Confirmed in the running app against a real open deal: the drawer
    //   renders those four sections and no Risk:Reward anywhere.
    //
    //   Adding them would be a behaviour change, not a fix. `useRiskReward`
    //   IS set per-deal (types/dcaDeal.ts reads `deal.settings.useRiskReward`
    //   as `riskBased`), so on a risk-based deal whose bot has it off, the
    //   diff below would find new ≠ original and start shipping
    //   `useRiskReward` on every save of a control the user cannot see.
  ].filter((k) =>
    isMultiple ? k !== 'baseOrderSize' && k !== 'orderSize' : true
  ) as (keyof DCADealsSettings)[];
  const result: Partial<DCADealsSettings> = keys.reduce((acc, key) => {
    const k = key as keyof DCADealsSettings;
    if (!(k in newState)) {
      return acc;
    }
    const original =
      originalState && k in originalState
        ? originalState[k as keyof typeof originalState]
        : undefined;
    let newValue = newState[k as keyof typeof newState];
    if (
      newValue === original ||
      (`${newValue}` === 'undefined' && `${original}` === 'null') ||
      (`${original}` === 'undefined' && `${newValue}` === 'null') ||
      ((typeof newValue === 'number' && typeof original === 'string') ||
      (typeof newValue === 'string' && typeof original === 'number')
        ? `${newValue}` === `${original}`
        : false)
    ) {
      return acc;
    }
    if (typeof original === 'number' && typeof newValue === 'string') {
      newValue = parseFloat(newValue);
    }
    //@ts-expect-error accumulator typing
    acc[k] = reset ? (original ?? newValue) : (newValue ?? original);
    return acc;
  }, {} as DCADealsSettings);
  return result;
};

export const DealEditDrawerInner: React.FC<DealEditDrawerProps> = React.memo(
  ({ children, onClose, trade, botType, inline = false, chartSync = false }) => {
    const {
      formData,
      isFieldLocked,
      updateFormData,
      errors,
      mode,
      activeTab,
      setActiveTab,
      features,
      setFormData,
    } = useBotFormState();
    // --- Chart sync (Edit Deal inside the bot drawer) ----------------------
    //
    // Three things have to line up for the chart to behave the way it does in
    // the Trading Terminal:
    //
    //  1. The example-orders projection has to be anchored at the DEAL's
    //     average (breakeven) price, not the market price. A deal's TP/SL are
    //     percentages off its entry, so anchoring at market would draw the
    //     lines somewhere the bot will never act.
    //  2. Dragging a line has to write back to the form.
    //  3. `feedChart` on the provider (above) lets the form push its settings
    //     at all; without it the store is never recomputed and the lines are
    //     frozen at whatever the host plotted.
    const { setCoordinates: setDealPickCoordinates } =
      useTradingTerminalUtils();
    const dealChartStore = useExampleOrdersStore();
    const dealSlice =
      formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;
    const dealReferencePrice = useMemo(() => {
      const override = Number(dealSlice?.avgPrice);
      if (Number.isFinite(override) && override > 0) return override;
      const computed = Number(trade?.[0]?.avgPrice);
      return Number.isFinite(computed) && computed > 0 ? computed : 0;
    }, [dealSlice?.avgPrice, trade]);

    useEffect(() => {
      if (!chartSync || dealReferencePrice <= 0) return;
      dealChartStore.setContext({ inputLatestPrice: dealReferencePrice });
    }, [chartSync, dealReferencePrice, dealChartStore]);

    // Keep the drag handler behind a ref so the store gets ONE stable callback.
    // multiTp / multiSl are fresh arrays every keystroke; handing the store a
    // new function each time would re-fire the setContext effect and race the
    // provider's own settings push. Same reasoning as BotForm's dragHandlerRef.
    const dealDragRef = useRef<ExampleOrdersStoreContext['onDrag']>(undefined);
    dealDragRef.current = (price, type, index) => {
      if (!chartSync || !Number.isFinite(price) || price <= 0) return;

      // A drag IS a chart pick — same event, different gesture. Both are
      // handed to the section that owns the target, through the coordinate
      // channel the bullseye already uses, so exactly one piece of code writes
      // a chart-sourced price.
      //
      // Writing the % here instead (the obvious shortcut) is wrong and was the
      // bug: TakeProfitSettings keeps `tpPerc` derived from `fixedTpPrice`
      // whenever `useFixedTPPrices` is on, so a handler that set only the %
      // got reverted by that effect on the very next render — the value
      // flashed and snapped back. `handleTargetFixedChange` writes the price,
      // the derived %, and the flag together, which is the only consistent
      // state.
      let pickerField: string | null = null;

      if (type === DCAOrderTypeEnum.tp) {
        const uuid =
          typeof index === 'number' && dealSlice?.useMultiTp
            ? dealSlice.multiTp?.[index]?.uuid
            : 'single-target';
        if (uuid) pickerField = `multiTp.${uuid}.fixed`;
      } else if (type === DCAOrderTypeEnum.sl) {
        const uuid =
          typeof index === 'number' && dealSlice?.useMultiSl
            ? dealSlice.multiSl?.[index]?.uuid
            : 'single-sl-target';
        if (uuid) pickerField = `multiSl.${uuid}.fixed`;
      }

      if (!pickerField) return;

      // `time` only has to make each drop distinct — the consuming effect
      // dedupes on `pickerField-time-price`, so dragging back to a price you
      // already used would otherwise be swallowed.
      setDealPickCoordinates({ time: Date.now(), price, pickerField });
    };

    useEffect(() => {
      if (!chartSync) return;
      dealChartStore.setContext({
        onDrag: (price, type, index, meta) =>
          dealDragRef.current?.(price, type, index, meta),
      });
    }, [chartSync, dealChartStore]);

    // Must match the outer `DealEditDrawer`'s resolution exactly — that one
    // seeds `BotFormProvider` (and therefore `formData.type`), this one picks
    // the balances/mutation context. A disagreement would seed one slice and
    // save the other.
    const resolvedBotType = useMemo(
      () =>
        botType !== undefined
          ? toDealFormBotType(botType)
          : trade?.[0]?.combo
            ? BotTypesEnum.combo
            : BotTypesEnum.dca,
      [botType, trade]
    );
    const useBotFromMutationOptions: UseBotFormMutationsOptions = useMemo(
      () => ({
        mode: trade?.length === 1 ? 'deal-edit' : 'deal-mass-edit',
        botType: resolvedBotType,
      }),
      [trade, resolvedBotType]
    );
    const { getBalances } = useBotFormMutations(useBotFromMutationOptions);
    // Tracks which deal(s) the form is currently seeded from. The effect
    // below re-runs on every render where `onClose`/`trade` identity changes
    // — and realtime socket traffic (`bot deal update`, `data update`) churns
    // the parent on every incoming notification. Without this guard, each
    // notification would re-seed the form from server state and wipe the
    // user's in-progress edits. We only re-seed when the identity of the
    // deal(s) being edited actually changes.
    const seededDealKeyRef = useRef<string | null>(null);
    useEffect(() => {
      if (!trade || trade.some((t) => !isActiveDeal(t))) {
        seededDealKeyRef.current = null;
        onClose();
      } else {
        const dealKey = trade.map((t) => t._id).join('|');
        if (seededDealKeyRef.current === dealKey) return;
        seededDealKeyRef.current = dealKey;
        const isSingle = trade.length === 1;
        const combinedSettings = isSingle
          ? {
              ...trade[0].dcaBot?.settings,
              ...trade[0].settings,
              // Breakeven price: seed from the deal's manual override if set,
              // else its live computed average, so the input always reflects
              // the current breakeven and the field exists for updateFormData.
              avgPrice: trade[0].settings?.avgPrice ?? trade[0].avgPrice,
            }
          : { ...DCA_FORM_DEFAULTS };
        setFormData((prev) => {
          const clonedPrev = JSON.parse(JSON.stringify(prev)) as BotFormData;
          clonedPrev.exchangeUUID = trade[0].exchangeUUID;
          if (prev.type === BotTypesEnum.combo) {
            clonedPrev.combo = {
              ...clonedPrev.combo,
              ...combinedSettings,
            };
          } else {
            clonedPrev.dca = {
              ...clonedPrev.dca,
              ...combinedSettings,
            };
          }
          clonedPrev.originalBot = {
            type:
              prev.type === BotTypesEnum.combo
                ? BotTypesEnum.combo
                : BotTypesEnum.dca,
            settings: {
              ...(clonedPrev.type === BotTypesEnum.combo
                ? clonedPrev.combo
                : clonedPrev.dca),
              ...(isSingle ? trade[0].dcaBot?.settings : DCA_FORM_DEFAULTS),
            },
          };
          clonedPrev.pair = trade.map((t) => t.symbol.symbol);
          clonedPrev.pairMetadata = trade.reduce(
            (acc, t) => {
              acc[t.symbol.symbol] = {
                pair: t.symbol.symbol,
                baseAsset: {
                  name: t.symbol.baseAsset,
                  minAmount: 0,
                  maxAmount: 0,
                  step: 0,
                },
                quoteAsset: {
                  name: t.symbol.quoteAsset,
                  minAmount: 0,
                },
                exchange: t.exchange || ExchangeEnum.binance,
                priceAssetPrecision: 8,
                crossAvailable: true,
              };
              return acc;
            },
            {} as Record<string, TradingPair>
          );

          return clonedPrev;
        });
        if (trade[0]?.exchangeUUID) {
          getBalances(trade[0].exchangeUUID);
        }
      }
    }, [trade, onClose, setFormData, getBalances]);
    const { bot, exchanges, exchangesLoading, currentExchange } =
      useBotFormQuery();
    const useRiskReward = useBotFormSelector('useRiskReward');
    const [collapsedSections, setCollapsedSections] = useState<
      Record<string, boolean>
    >(() => ({ webhook: true }));
    const {
      balanceSelectors: { getBalance },
    } = useLiveUpdate();
    const isSectionCollapsed = useCallback(
      (id: string) => Boolean(collapsedSections[id]),
      [collapsedSections]
    );

    const toggleSectionCollapsed = useCallback((id: string) => {
      setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);
    const isCombo = useMemo(
      () => resolvedBotType === BotTypesEnum.combo,
      [resolvedBotType]
    );

    const handleDrawerOpenChange = useCallback(
      (nextOpen: boolean) => {
        if (!nextOpen && onClose) {
          onClose();
        }
      },
      [onClose]
    );

    const handleDrawerClose = useCallback(() => {
      handleDrawerOpenChange(false);
    }, [handleDrawerOpenChange]);
    const sectionToggleMap: Record<string, string> = useMemo(
      () => ({
        dca: 'useDca',
        'take-profit': 'useTp',
        'stop-loss': 'useSl',
        'risk-reward': 'useRiskReward',
        'bot-controller': 'useBotController',
        experimental: 'useExperimental',
      }),
      []
    );
    const visibleDescriptors: TabDescriptorInput[] = useMemo(() => {
      return [
        {
          id: 'strategy',
          label: 'Strategy',
          icon: SlidersHorizontal,
          // Body is rendered inline (breakeven + profit currency need the
          // deal data), so this Component stub is never invoked.
          Component: () => null,
          description: 'Breakeven price & profit currency',
          tooltipText: 'Adjust the deal breakeven and profit currency',
          isTerminal: true,
          isDca: true,
        },
        {
          id: 'take-profit',
          label: 'Take Profit',
          icon: TrendingUp,
          Component: TakeProfitSettings,
          description: 'Take profit settings and targets',
          tooltipText: 'Configure take profit parameters',
          tooltipUrl: '/help/multiple-take-profit-targets',
          isTerminal: true,
          isDca: true,
        },
        {
          id: 'stop-loss',
          label: 'Stop Loss',
          icon: AlertTriangle,
          Component: StopLossSettings,
          description: 'Stop loss and risk management settings',
          tooltipText: 'Configure stop loss parameters',
          tooltipUrl: '/help/multiple-stop-loss-targets',
          isTerminal: true,
          isDca: true,
        },
        {
          id: 'dca',
          label: 'DCA',
          icon: TrendingUp,
          Component: DCASettings,
          description: 'Dollar Cost Averaging configuration',
          tooltipText: 'Enable DCA to average down on losing positions',
          tooltipUrl: '/help/dca-mode',
          isTerminal: true,
          isDca: true,
        },
      ];
    }, []);
    const getBalanceFn = useMemo<GetBalanceFn>(
      () => getBalance as unknown as GetBalanceFn,
      [getBalance]
    );
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const isScrolling = useRef(false);
    const handleTabChangeWithScroll = useCallback(
      (tabId: string) => {
        setActiveTab(tabId as BotFormTabId);

        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          const sectionElement = sectionRefs.current[tabId];
          const scrollContainer = scrollContainerRef.current;

          if (sectionElement && scrollContainer) {
            isScrolling.current = true;

            // Use scrollIntoView for more reliable scrolling
            sectionElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });

            // Reset scrolling flag after animation
            setTimeout(() => {
              isScrolling.current = false;
            }, 800);
          }
        });
      },
      [setActiveTab]
    );
    const componentProps: BotFormTabComponentProps = useMemo(
      () => ({
        currentExchange,
        formData,
        updateFormData:
          updateFormData as BotFormTabComponentProps['updateFormData'],
        errors,
        mode,
        isFieldLocked,
        getBalance: getBalanceFn,
        bot,
        exchangesData: exchanges,
        exchangesLoading,
        activeTab,
        onTabChange: handleTabChangeWithScroll,
        features,
      }),
      [
        formData,
        updateFormData,
        isFieldLocked,
        errors,
        mode,
        getBalanceFn,
        bot,
        exchanges,
        exchangesLoading,
        activeTab,
        handleTabChangeWithScroll,
        features,
        currentExchange,
      ]
    );

    const navigationTabs = useMemo<ScrollableTabItem[]>(() => {
      // Filter out disabled tabs completely (user requested removal instead of just disabling)
      return visibleDescriptors.map(({ id, label, icon, description }) => ({
        id,
        label,
        icon,
        ...(description ? { description } : {}),
      }));
    }, [visibleDescriptors]);

    useEffect(() => {
      if (navigationTabs.map((tab) => tab.id).indexOf(activeTab) === -1) {
        setActiveTab(navigationTabs[0]?.id as BotFormTabId);
      }
    }, [navigationTabs, activeTab, setActiveTab]);

    const shouldShowNavigation = useMemo(
      () => visibleDescriptors.length > 1,
      [visibleDescriptors.length]
    );
    const [submitIsPending, setSubmitIsPending] = useState(false);
    const editOptions = useMemo(
      () => ({
        onSuccess: () => onClose(),
        onError: (e: Error) => {
          toast.error('Failed to edit deal: ' + e.message);
          setSubmitIsPending(false);
        },
      }),
      [onClose]
    );
    const editMutation = useEditDeal(editOptions);
    const resetMutation = useResetDeal(editOptions);
    const isAnySettingChanged = useMemo(() => {
      const newState =
        formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;
      return Object.entries(newState).some(([key, value]) => {
        const originalValue =
          formData.originalBot?.type === formData.type
            ? formData.originalBot.settings[
                key as keyof BotFormData['originalBot']
              ]
            : undefined;
        return value !== originalValue;
      });
    }, [formData.type, formData.combo, formData.dca, formData.originalBot]);
    const handleSubmit = useCallback(() => {
      if (!trade) {
        return;
      }
      if (isAnySettingChanged) {
        setSubmitIsPending(true);
      }
      const isSingle = trade.length === 1;
      const settings = mapFromDataToDealSettings(formData, !isSingle);
      for (const t of trade) {
        const localSettings = isSingle
          ? settings
          : mapFromDataToDealSettings(formData, !isSingle, false, t.settings);
        editMutation.mutate({
          dealId: t._id,
          botId: t.botId,
          type: formData.type,
          terminal: false,
          settings: localSettings,
        });
      }
      // Depend on the stable `mutate` fn, not the whole react-query mutation
      // object (which is a fresh reference every render and would rebuild this
      // callback — and therefore the button-config array — on every parent
      // re-render, re-rendering ResponsiveButtonRow under live data).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trade, formData, isAnySettingChanged, editMutation.mutate]);
    const handleCancel = useCallback(() => {
      onClose();
    }, [onClose]);
    const handleResetToGlobal = useCallback(() => {
      if (!trade) {
        return;
      }
      const isSingle = trade.length === 1;
      const originalSettings = mapFromDataToDealSettings(
        formData,
        !isSingle,
        true
      );
      for (const t of trade) {
        const localSettings = isSingle
          ? originalSettings
          : mapFromDataToDealSettings(formData, !isSingle, true, t.settings);
        resetMutation.mutate({
          dealId: t._id,
          botId: t.botId,
          type: formData.type,
          terminal: false,
          originalSettings: localSettings,
        });
      }
      // Stable `.mutate` dep, not the whole mutation object (see handleSubmit).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trade, formData, resetMutation.mutate]);
    const submitLabel = useMemo(() => 'Save Changes', []);
    const cancelLabel = useMemo(() => 'Cancel', []);
    const resetLabel = useMemo(() => 'Reset to Global Settings', []);

    const buttonConfigs = useMemo((): ResponsiveButtonConfig[] => {
      const configs: ResponsiveButtonConfig[] = [];

      const showSubmit = isAnySettingChanged;

      configs.push({
        id: 'submit',
        priority: BUTTON_PRIORITIES.SUBMIT,
        fullContent: () => (
          <Button
            type="button"
            aria-busy={submitIsPending}
            onClick={handleSubmit}
            disabled={!showSubmit}
            aria-label={submitLabel}
            fullwidth
            className={cn(
              'gradient-brand hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl duration-200 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase'
            )}
          >
            {submitIsPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span className="truncate">{submitLabel}</span>
              </>
            ) : (
              <div className="flex items-center justify-center w-full gap-xs">
                <Save className="w-4 h-4 shrink-0" />
                <span className="truncate">{submitLabel}</span>
              </div>
            )}
          </Button>
        ),
        compactContent: (
          <Button
            type="button"
            aria-busy={submitIsPending}
            onClick={handleSubmit}
            disabled={!showSubmit}
            aria-label={submitLabel}
            size="icon"
            className={cn(
              'gradient-brand hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl duration-200 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase'
            )}
          >
            {submitIsPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="sr-only">{submitLabel}</span>
          </Button>
        ),
        // Submit button should never overflow - it's the primary action
        neverOverflow: true,
      });

      configs.push({
        id: 'cancel',
        priority: BUTTON_PRIORITIES.TOGGLE,
        fullContent: (
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2"
            aria-label={cancelLabel}
          >
            <Delete className="w-4 h-4 shrink-0" />
            <span className="truncate">{cancelLabel}</span>
          </Button>
        ),
        compactContent: (
          <Button
            onClick={handleCancel}
            size="icon"
            variant="outline"
            className={cn(
              'flex items-center justify-center font-semibold uppercase'
            )}
            aria-label={cancelLabel}
          >
            <Delete className="w-4 h-4" />
            <span className="sr-only">{cancelLabel}</span>
          </Button>
        ),
        menuLabel: cancelLabel,
      });

      if (trade?.some((t) => t.settings.changed)) {
        configs.push({
          id: 'reset',
          priority: BUTTON_PRIORITIES.TEMPLATES,
          fullContent: (
            <Button
              onClick={handleResetToGlobal}
              variant="outline"
              className="flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2"
              aria-label={resetLabel}
            >
              <Undo className="w-4 h-4 shrink-0" />
              <span className="truncate">{resetLabel}</span>
            </Button>
          ),
          compactContent: (
            <Button
              onClick={handleResetToGlobal}
              size="icon"
              variant="outline"
              className={cn(
                'flex items-center justify-center font-semibold uppercase'
              )}
              aria-label={cancelLabel}
            >
              <Undo className="w-4 h-4" />
              <span className="sr-only">{resetLabel}</span>
            </Button>
          ),
          menuLabel: resetLabel,
        });
      }

      return configs;
    }, [
      submitIsPending,
      handleSubmit,
      submitLabel,
      handleCancel,
      cancelLabel,
      trade,
      resetLabel,
      handleResetToGlobal,
      isAnySettingChanged,
    ]);
    const navigationContent = useMemo(
      () =>
        shouldShowNavigation ? (
          <motion.div
            className="sticky top-0 z-30 mb-3 mx-1 rounded-lg bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ScrollableFormTabNavigation
                  tabs={navigationTabs}
                  activeTab={activeTab}
                  onTabChange={handleTabChangeWithScroll}
                />
              </div>
              <div className="flex items-center gap-1 px-2 shrink-0">
                <BotFormAlertButton />
              </div>
            </div>
          </motion.div>
        ) : null,
      [
        navigationTabs,
        activeTab,
        handleTabChangeWithScroll,
        shouldShowNavigation,
      ]
    );

    // Deal-edit "Strategy" section is rendered inline (not via the generic
    // descriptor.Component path) because the breakeven Reset and the profit
    // currency labels need the deal data, not just the form state.
    const strategyContent = useMemo(() => {
      if (!trade) {
        return null;
      }
      const isSingle = trade.length === 1;
      const slice = isCombo ? formData.combo : formData.dca;
      const futures = Boolean(slice.futures);
      const baseAsset = trade[0]?.symbol.baseAsset ?? 'Base';
      const quoteAsset = trade[0]?.symbol.quoteAsset ?? 'Quote';
      const computedAvg = trade[0]?.avgPrice;
      const overrideAvg = trade[0]?.settings?.avgPrice;
      const showAvgReset =
        isSingle &&
        typeof computedAvg === 'number' &&
        computedAvg !== overrideAvg;
      return (
        <div className="space-y-md">
          {isSingle && (
            <SettingsRow
              name="Breakeven price"
              tooltip="Manually override the deal's average entry price. The bot recalculates TP/SL targets from this value."
            >
              <div className="flex items-center gap-sm">
                <NumberInput
                  value={(slice.avgPrice as number | undefined) ?? ''}
                  onChange={(value) => updateFormData('avgPrice', value)}
                  className="w-40"
                  endAdornment={unitAdornment(quoteAsset)}
                />
                {showAvgReset && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => updateFormData('avgPrice', computedAvg)}
                  >
                    Reset
                  </button>
                )}
              </div>
            </SettingsRow>
          )}
          {!futures && (
            <SettingsRow
              name="Profit Currency"
              tooltip="Choose quote currency if you expect the pair to move sideways or down and you want to make profit in quote currency. Choose the base currency if you expect the pair to move sideways or up and you want to make profit in base currency."
              tooltipURL="/help/profit-in-base-and-quote"
            >
              <TerminalButtonStack
                value={(slice.profitCurrency as string | undefined) ?? 'quote'}
                onValueChange={(value) =>
                  updateFormData('profitCurrency', value as 'base' | 'quote')
                }
                options={[
                  { value: 'base', label: baseAsset },
                  { value: 'quote', label: quoteAsset },
                ]}
                className="w-full"
                disabled={isCombo || !!isFieldLocked('profitCurrency')}
              />
            </SettingsRow>
          )}
        </div>
      );
    }, [
      trade,
      isCombo,
      formData.combo,
      formData.dca,
      updateFormData,
      isFieldLocked,
    ]);

    const bodyContent = useMemo(
      () => (
        <div className="flex-1 overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="custom-scrollbar h-full overflow-y-auto px-3 mobile-bottom-nav-padding"
          >
            <fieldset className="m-0 border-0 p-0 space-y-xl pb-2">
              {visibleDescriptors.map((descriptor) => {
                const SectionComponent = descriptor.Component;
                const toggleField = sectionToggleMap[
                  descriptor.id
                ] as keyof BotFormData['dca'];
                const hasToggle = toggleField !== undefined;
                const toggleEnabled = hasToggle
                  ? isCombo
                    ? Boolean(formData['combo'][toggleField])
                    : Boolean(formData['dca'][toggleField])
                  : false;

                return (
                  <div
                    key={descriptor.id}
                    ref={(el) => {
                      sectionRefs.current[descriptor.id] = el;
                    }}
                    id={`section-${descriptor.id}`}
                    className="transition-opacity scroll-mt-4"
                    data-section-id={descriptor.id}
                  >
                    <SectionHeader
                      icon={descriptor.icon}
                      label={descriptor.label}
                      {...(descriptor.tooltipText || descriptor.description
                        ? {
                            tooltip:
                              descriptor.tooltipText ??
                              descriptor.description ??
                              '',
                          }
                        : {})}
                      {...(descriptor.tooltipUrl
                        ? { tooltipUrl: descriptor.tooltipUrl }
                        : {})}
                      showRiskRewardAlert={
                        (descriptor.id === 'stop-loss' ||
                          descriptor.id === 'take-profit' ||
                          descriptor.id === 'dca') &&
                        !!useRiskReward
                      }
                      ariaControlsId={`section-${descriptor.id}`}
                      showCollapse={hasToggle ? toggleEnabled : true}
                      collapsed={isSectionCollapsed(descriptor.id)}
                      onToggleCollapse={() =>
                        toggleSectionCollapsed(descriptor.id)
                      }
                      hasToggle={hasToggle}
                      toggleChecked={toggleEnabled}
                      onToggleChange={(checked) =>
                        updateFormData(toggleField, checked)
                      }
                      toggleDisabled={!!isFieldLocked(toggleField)}
                      toggleId={`toggle-${descriptor.id}`}
                    />
                    {!isSectionCollapsed(descriptor.id) &&
                      (descriptor.id === 'strategy' ? (
                        strategyContent
                      ) : (
                        <SectionComponent {...componentProps} />
                      ))}
                  </div>
                );
              })}
            </fieldset>
          </div>
        </div>
      ),
      [
        visibleDescriptors,
        componentProps,
        sectionToggleMap,
        isCombo,
        formData,
        isFieldLocked,
        updateFormData,
        isSectionCollapsed,
        toggleSectionCollapsed,
        useRiskReward,
        strategyContent,
      ]
    );

    const footerContent = useMemo(
      () => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="w-full"
        >
          <div className="px-4 pt-3 pb-4 border-t border-border space-y-1 w-full">
            <ResponsiveButtonRow
              buttons={buttonConfigs}
              gap={8}
              buffer={16}
              alignment="right"
              highestPriorityFullWidth
              compactThreshold={280}
            />
          </div>
        </motion.div>
      ),
      [buttonConfigs]
    );
    if (!trade) {
      return null;
    }

    // When inline, render content directly without a DetailDrawer wrapper
    if (inline) {
      return (
        <>
          {navigationContent}
          <DetailDrawerBody className="px-4 py-5 sm:px-6 sm:py-6">
            {bodyContent}
          </DetailDrawerBody>
          <DetailDrawerFooter className="px-0 py-0">
            {footerContent}
          </DetailDrawerFooter>
        </>
      );
    }

    return (
      <DetailDrawer open onOpenChange={handleDrawerOpenChange}>
        <DetailDrawerTrigger asChild>{children}</DetailDrawerTrigger>

        <DetailDrawerContent
          className="max-w-2xl z-50"
          showCloseButton
          onClose={handleDrawerClose}
          resizable={false}
        >
          <DetailDrawerHeader className="relative pr-12 md:pr-14">
            {navigationContent}
          </DetailDrawerHeader>

          <DetailDrawerBody className="px-4 py-5 sm:px-6 sm:py-6">
            {bodyContent}
          </DetailDrawerBody>
          <DetailDrawerFooter className="px-0 py-0">
            {footerContent}
          </DetailDrawerFooter>
        </DetailDrawerContent>
      </DetailDrawer>
    );
  }
);

export const DealEditDrawer: React.FC<DealEditDrawerProps> = React.memo(
  (props) => {
    const mode: BotFormMode = useMemo(
      () => (props.trade?.length === 1 ? 'deal-edit' : 'deal-mass-edit'),
      [props.trade]
    );
    const debugEnabled = useMemo(
      () => import.meta.env['VITE_BOT_FORM_DEBUG'] === 'true',
      []
    );
    // Keep in lockstep with `resolvedBotType` in DealEditDrawerInner.
    const botType = useMemo(
      () =>
        props.botType !== undefined
          ? toDealFormBotType(props.botType)
          : props.trade?.[0]?.combo
            ? BotTypesEnum.combo
            : BotTypesEnum.dca,
      [props.botType, props.trade]
    );
    const resolvedExperience: BotExperienceDescriptor = useMemo(
      () => tryGetBotExperience(botType) ?? getBotExperience(BotTypesEnum.dca),
      [botType]
    );
    const contextValue = useMemo(
      () => ({ botExperience: resolvedExperience, widgetId: 'deal-edit' }),
      [resolvedExperience]
    );
    const defaultTab: BotFormTabId = useMemo(() => 'strategy', []);
    const hasAncestorPicker = !!React.useContext(TradingTerminalUtilsContext);
    if (!props.trade || !props.open || props.trade.length === 0) {
      return null;
    }
    // Reuse an ancestor's picker context when there is one. The bullseye only
    // works if the FORM and the CHART read the same provider, and the chart
    // lives outside this component (it's the bot drawer's left panel). Mounting
    // our own provider unconditionally would give the form a second, isolated
    // context and the picker would silently never fire. Standalone mounts (no
    // ancestor, no chart) still get their own.
    const PickerBoundary = hasAncestorPicker
      ? React.Fragment
      : TradingTerminalUtilsProvider;

    return (
      <PickerBoundary>
        <BotFormRegistryContext.Provider value={contextValue}>
          <BotFormProvider
            mode={mode}
            botType={botType}
            defaultTab={defaultTab}
            feedChart={props.chartSync ?? false}
          >
            <BotFormQueryProvider mode={mode} debug={debugEnabled}>
              <DealEditDrawerInner {...props} />
            </BotFormQueryProvider>
          </BotFormProvider>
        </BotFormRegistryContext.Provider>
      </PickerBoundary>
    );
  }
);
