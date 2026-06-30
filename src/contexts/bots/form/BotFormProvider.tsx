/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type { PrecisionGuard } from '@/features/bots/shared/utils/order-guard';
import { useBotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { GraphQLClient, GraphQlQuery } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { indicatorStore } from '@/stores/indicatorStore';
import { useUIStore } from '@/stores/uiStore';
import {
  BotStartTypeEnum,
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  DCATypeEnum,
  ExchangeEnum,
  IndicatorEnum,
  OrderTypeEnum,
  RRSlTypeEnum,
  ScaleDcaTypeEnum,
  StartConditionEnum,
  type BotVars,
} from '@/types';
import type {
  BotFormAlerts,
  BotFormData,
  BotFormErrors,
  PairPrecisionInfo,
} from '@/types/bots/form';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import {
  handleSettingsUpdate,
  type HandleSettingsUpdateResult,
} from '@/utils/bots/dca/handle-settings';
import { hotValidateDcaFormData } from '@/utils/bots/dca/validation';
import { validateGridFormData } from '@/utils/bots/grid/validation';
import { parseIndicatorFavoriteCodes } from '@/utils/indicators';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from './formDefaults';

export type BotFormMode =
  | 'create'
  | 'edit'
  | 'deal-edit'
  | 'deal-mass-edit'
  | 'settings-readonly';

export type BotFormTabId =
  | 'basic'
  | 'strategy'
  | 'deal-start'
  | 'dca'
  | 'take-profit'
  | 'stop-loss'
  | 'risk-reward'
  | 'bot-controller'
  | 'webhook'
  | 'advanced'
  | 'experimental'
  | 'shared-controls'
  | 'long-leg'
  | 'short-leg'
  | 'automation'
  | 'grid-settings'
  | 'grid-budget'
  | 'grid-range';

export type BotFormUpdateValue =
  | string
  | Record<ExchangeEnum, TradingPair>
  | Record<ExchangeEnum, PairPrecisionInfo>
  | BotFormData['userFee']
  | BotFormData['pair']
  | BotFormData['favoriteIndicators']
  | BotFormData['name']
  | BotFormData['dca'][keyof BotFormData['dca']]
  | BotFormData['combo'][keyof BotFormData['combo']]
  | BotFormData['grid'][keyof BotFormData['grid']]
  | PrecisionGuard;

export interface BotFormFeatureFlags {
  [feature: string]: boolean | undefined;
}

export type Fields =
  | keyof Omit<BotFormData, 'dca' | 'grid' | 'combo' | 'type'>
  | keyof BotFormData['dca']
  | keyof BotFormData['combo']
  | keyof BotFormData['grid'];

export interface BotFormStateContextValue {
  mode: BotFormMode;
  activeTab: BotFormTabId;
  setActiveTab: Dispatch<SetStateAction<BotFormTabId>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  errors: BotFormErrors;
  setErrors: Dispatch<SetStateAction<BotFormErrors>>;
  alerts: import('@/types/bots/form').BotFormAlerts;
  setAlerts: Dispatch<
    SetStateAction<import('@/types/bots/form').BotFormAlerts>
  >;
  isDirty: boolean;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  formData: BotFormData;
  setFormData: Dispatch<SetStateAction<BotFormData>>;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  lockedFields: Set<Fields>;
  isFieldLocked: (field: Fields) => boolean;
  isEditLocked: boolean;
  isReadOnly: boolean;
  enableEditing: () => void;
  disableEditing: () => void;
  toggleEditing: () => void;
  features: BotFormFeatureFlags;
  botVars: BotVars | null;
  setBotVars: Dispatch<SetStateAction<BotVars | null>>;
  resetFormData: () => void;
  // Component error registration
  registerComponentError: (
    field: string,
    alert: import('@/types/bots/form').BotFormAlert | null
  ) => void;
  // Quick setup mode: 'quick' shows preset buttons and hides advanced
  // sections; 'manual' is the full sectioned form. Available only for
  // DCA bots in create mode.
  quickSetupMode: 'quick' | 'manual';
  setQuickSetupMode: Dispatch<SetStateAction<'quick' | 'manual'>>;
  selectedPreset: string | null;
  setSelectedPreset: Dispatch<SetStateAction<string | null>>;
  /** Pair whose chart the form should display, in the same normalized
   *  form as the elements of `formData.pair`. Set by clicking a pair
   *  chip; `null` falls back to the first pair. Shared via context so it
   *  drives the chart from any view that renders the form (full page or
   *  sidebar). */
  activeChartPair: string | null;
  setActiveChartPair: Dispatch<SetStateAction<string | null>>;
  /** True when this provider is one leg of a hedge bot. Lets consumers
   *  (e.g. the form shell) skip standalone-DCA-only chrome like the
   *  Quick/Manual mode toggle. */
  isNestedLeg: boolean;
}

const BotFormStateContext = createContext<BotFormStateContextValue | undefined>(
  undefined
);

interface BotFormProviderProps {
  mode: BotFormMode;
  defaultTab?: BotFormTabId | undefined;
  initialFormData?: Partial<BotFormData> | undefined;
  children: ReactNode;
  botType: BotTypesEnum;
  terminal?: boolean;
  /**
   * True when this provider is one leg of a hedge bot (two leg-scoped
   * BotFormProviders are mounted side-by-side). Nested legs aren't
   * standalone DCA bots, so they skip the Quick/Manual mode toggle and
   * default to Manual.
   */
  isNestedLeg?: boolean;
}

const createDefaultFormState = (
  mode: BotFormMode,
  terminal: boolean
): BotFormData =>
  ({
    ...SHARED_FORM_DEFAULTS,
    dca:
      mode === 'create' ||
      mode === 'deal-edit' ||
      mode === 'deal-mass-edit' ||
      mode === 'settings-readonly'
        ? {
            ...DCA_FORM_DEFAULTS,
            type: terminal ? DCATypeEnum.terminal : DCATypeEnum.regular,
            startOrderType: terminal
              ? OrderTypeEnum.market
              : DCA_FORM_DEFAULTS['startOrderType'],
            rrSlType: terminal
              ? RRSlTypeEnum.fixed
              : DCA_FORM_DEFAULTS['rrSlType'],
          }
        : {},
    combo:
      mode === 'create' ||
      mode === 'deal-edit' ||
      mode === 'deal-mass-edit' ||
      mode === 'settings-readonly'
        ? { ...COMBO_FORM_DEFAULTS }
        : {},
    grid: mode === 'create' ? { ...GRID_FORM_DEFAULTS } : {},
    terminal,
  }) as BotFormData;

// Export for use in other components
export { createDefaultFormState };

const defaultStateFn = (props: BotFormProviderProps, reset = false) => {
  const { mode, initialFormData, botType, terminal } = props;
  const defaultState = createDefaultFormState(mode, !!terminal);

  // Bot forms always start from defaults. Explicit seeds (curated
  // presets, "Copy to live", backtest load, clone) come in via
  // `initialFormData` and layer over the defaults.
  const result: BotFormData = {
    ...defaultState,
    ...(reset ? {} : (initialFormData ?? {})),
    type: botType,
  };
  return result;
};

export const BotFormProvider: React.FC<BotFormProviderProps> = (props) => {
  const {
    mode,
    defaultTab,
    children,
    botType,
    terminal,
    isNestedLeg,
  } = props;
  const { botExperience } = useBotFormRegistryContext();

  const [activeTab, setActiveTab] = useState<BotFormTabId>(
    defaultTab ?? 'basic'
  );
  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const [isLoading, setIsLoading] = useState<boolean>(mode === 'edit');
  const [errors, setErrors] = useState<BotFormErrors>({});
  const [alerts, setAlerts] = useState<
    import('@/types/bots/form').BotFormAlerts
  >({});
  const [componentErrors, setComponentErrors] = useState<
    import('@/types/bots/form').BotFormAlerts
  >({});
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [formData, _setFormData] = useState<BotFormData>(() =>
    defaultStateFn(props)
  );
  const setFormData = useCallback(
    (value: React.SetStateAction<BotFormData>) => {
      _setFormData((prev) => {
        const nextValue = typeof value === 'function' ? value(prev) : value;
        if (nextValue.dca.indicators) {
          indicatorStore.setIndicators(nextValue.dca.indicators);
        }
        return nextValue;
      });
    },
    []
  );
  const resetFormData = useCallback(() => {
    setFormData(defaultStateFn(props, true));
  }, [props, setFormData]);
  const [botVars, setBotVars] = useState<BotVars | null>(null);
  const [isEditLocked, setIsEditLocked] = useState<boolean>(mode === 'edit');
  const [quickSetupMode, setQuickSetupMode] = useState<'quick' | 'manual'>(
    // Hedge legs mount BotFormWidget with `isNestedLeg` — they're not
    // standalone DCA bots, so they shouldn't get the Quick/Manual mode
    // toggle. Default to Manual for them and let the outer hedge layout
    // drive any preset UI separately.
    //
    // Combo bots share the DCA preset machinery (combo settings extend
    // DCA settings) so they default into Quick as well. Grid bots get
    // their own preset module (range/level math is different) but the
    // chrome and mode-toggle behavior matches.
    mode === 'create' &&
      (botType === BotTypesEnum.dca ||
        botType === BotTypesEnum.combo ||
        botType === BotTypesEnum.grid) &&
      !terminal &&
      !isNestedLeg
      ? 'quick'
      : 'manual'
  );
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [activeChartPair, setActiveChartPair] = useState<string | null>(null);

  useEffect(() => {
    setIsEditLocked(mode === 'edit');
  }, [mode]);

  const enableEditing = useCallback(() => setIsEditLocked(false), []);
  const disableEditing = useCallback(() => setIsEditLocked(true), []);
  const toggleEditing = useCallback(() => {
    setIsEditLocked((prev) => !prev);
    if (formData.originalBot) {
      setFormData((prev) => {
        const b = prev.originalBot;
        if (b?.type === BotTypesEnum.dca) {
          prev.dca = b.settings;
        } else if (b?.type === BotTypesEnum.combo) {
          prev.combo = b.settings;
        } else if (b?.type === BotTypesEnum.grid) {
          prev.grid = b.settings;
        }
        return { ...prev };
      });
    }
  }, [formData.originalBot, setFormData]);

  const isReadOnly = useMemo(
    () =>
      mode === 'settings-readonly' || (mode === 'edit' ? isEditLocked : false),
    [mode, isEditLocked]
  );

  const isComboBot = useMemo(() => botType === BotTypesEnum.combo, [botType]);

  const lockedFields = useMemo(() => {
    const fields = new Set<Fields>();

    if (mode === 'edit') {
      fields.add('exchangeUUID');
      if (botType === BotTypesEnum.combo || botType === BotTypesEnum.dca) {
        fields.add('useMulti');
      }
    }

    if (
      isComboBot ? formData.combo.useRiskReward : formData.dca.useRiskReward
    ) {
      fields.add('useSl');
      fields.add('useDca');
      if (
        isComboBot ? formData.combo.riskUseTpRatio : formData.dca.riskUseTpRatio
      ) {
        fields.add('useTp');
      }
    }

    return fields;
  }, [
    mode,
    botType,
    formData.dca.useRiskReward,
    formData.dca.riskUseTpRatio,
    formData.combo.useRiskReward,
    formData.combo.riskUseTpRatio,
    isComboBot,
  ]);

  const isFieldLocked = useCallback(
    (field: Fields) => {
      if (isReadOnly) {
        return true;
      }
      return lockedFields.has(field);
    },
    [isReadOnly, lockedFields]
  );

  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const derivedFields = useRef<Set<Fields>>(
    new Set([
      'pairMetadata',
      'pairPrecisionMap',
      'userFee',
      'favoriteIndicators',
    ])
  );

  const favoriteIndicatorsVersionRef = useRef(0);
  const favoriteIndicatorsRequestState = useRef<{
    lastToken: string | null;
    inflight: boolean;
  }>({
    lastToken: null,
    inflight: false,
  });

  const scaleAr = useMemo(
    () =>
      (formData.dca.dcaCondition === DCAConditionEnum.percentage ||
        !formData.dca.dcaCondition) &&
      [ScaleDcaTypeEnum.adr, ScaleDcaTypeEnum.atr].includes(
        formData.dca.scaleDcaType ?? ScaleDcaTypeEnum.percentage
      ) &&
      formData.dca.useDca,
    [formData.dca.dcaCondition, formData.dca.scaleDcaType, formData.dca.useDca]
  );

  const tpAr = useMemo(
    () =>
      formData.dca.dealCloseCondition === CloseConditionEnum.dynamicAr &&
      formData.dca.useTp,
    [formData.dca.useTp, formData.dca.dealCloseCondition]
  );

  const slAr = useMemo(
    () =>
      formData.dca.dealCloseConditionSL === CloseConditionEnum.dynamicAr &&
      formData.dca.useSl,
    [formData.dca.useSl, formData.dca.dealCloseConditionSL]
  );

  const indicatorGroupsToUse = useMemo(
    () =>
      (
        (isComboBot
          ? formData.combo.indicatorGroups
          : formData.dca.indicatorGroups) ?? []
      )
        .filter((ig) => {
          const indicators = (
            (isComboBot
              ? formData.combo.indicators
              : formData.dca.indicators) ?? []
          ).filter((i) => i.groupId === ig.id);
          return indicators.length > 0;
        })
        .map((ig) => ig.id),
    [
      formData.dca.indicatorGroups,
      formData.dca.indicators,
      isComboBot,
      formData.combo.indicatorGroups,
      formData.combo.indicators,
    ]
  );

  const useCloseIndicators = useMemo(
    () =>
      (formData.dca.dealCloseCondition === CloseConditionEnum.techInd &&
        (!formData.dca.useRiskReward ||
          (formData.dca.useRiskReward && !formData.dca.riskUseTpRatio))) ||
      (formData.dca.dealCloseConditionSL === CloseConditionEnum.techInd &&
        !formData.dca.useRiskReward) ||
      tpAr ||
      slAr,
    [
      formData.dca.dealCloseCondition,
      formData.dca.dealCloseConditionSL,
      formData.dca.useRiskReward,
      formData.dca.riskUseTpRatio,
      tpAr,
      slAr,
    ]
  );

  const useStartDealIndicators = useMemo(
    () =>
      (isComboBot
        ? formData.combo.startCondition
        : formData.dca.startCondition) === StartConditionEnum.ti,
    [formData.dca.startCondition, isComboBot, formData.combo.startCondition]
  );

  const useStartDCAIndicators = useMemo(
    () =>
      (formData.dca.dcaCondition === DCAConditionEnum.indicators &&
        formData.dca.useDca) ||
      scaleAr,
    [formData.dca.dcaCondition, formData.dca.useDca, scaleAr]
  );

  const useStartBotIndicators = useMemo(
    () =>
      formData.dca.botActualStart === BotStartTypeEnum.indicators &&
      formData.dca.useBotController,
    [formData.dca.botActualStart, formData.dca.useBotController]
  );

  const useStopBotIndicators = useMemo(
    () =>
      (isComboBot ? formData.combo.botStart : formData.dca.botStart) ===
        BotStartTypeEnum.indicators &&
      (isComboBot
        ? formData.combo.useBotController
        : formData.dca.useBotController),
    [
      formData.dca.botStart,
      formData.dca.useBotController,
      isComboBot,
      formData.combo.botStart,
      formData.combo.useBotController,
    ]
  );

  const useRiskRewardIndicators = useMemo(
    () => formData.dca.useRiskReward,
    [formData.dca.useRiskReward]
  );

  useEffect(() => {
    indicatorStore.setChartIndicatorsContext({
      scaleAr,
      tpAr,
      slAr,
      strategy: isComboBot ? formData.combo.strategy : formData.dca.strategy,
      indicatorGroupsToUse,
      useCloseIndicators,
      useStartDealIndicators,
      useStartDCAIndicators,
      useStopBotIndicators,
      useStartBotIndicators,
      useRiskRewardIndicators,
    });
  }, [
    scaleAr,
    tpAr,
    slAr,
    formData.dca.strategy,
    indicatorGroupsToUse,
    useCloseIndicators,
    useStartDealIndicators,
    useStartDCAIndicators,
    useStopBotIndicators,
    useStartBotIndicators,
    useRiskRewardIndicators,
    isComboBot,
    formData.combo.strategy,
  ]);
  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );
  const isSettingsReadonly = useMemo(
    () => mode === 'settings-readonly',
    [mode]
  );
  const isSkipExampleOrders = useMemo(
    () => isDealEdit || isSettingsReadonly,
    [isDealEdit, isSettingsReadonly]
  );
  useEffect(() => {
    if (isSkipExampleOrders) return;
    exampleOrdersStore.setContext({ botType });
  }, [botType, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      settings: {
        indicators: isComboBot
          ? formData.combo.indicators
          : formData.dca.indicators,
        dcaCustom: isComboBot
          ? formData.combo.dcaCustom
          : formData.dca.dcaCustom,
        multiTp: isComboBot ? formData.combo.multiTp : formData.dca.multiTp,
        multiSl: isComboBot ? formData.combo.multiSl : formData.dca.multiSl,
        baseOrderSize: isComboBot
          ? formData.combo.baseOrderSize
          : formData.dca.baseOrderSize,
        orderSize: isComboBot
          ? formData.combo.orderSize
          : formData.dca.orderSize,
        tpPerc: isComboBot ? formData.combo.tpPerc : formData.dca.tpPerc,
        slPerc: isComboBot ? formData.combo.slPerc : formData.dca.slPerc,
        step: isComboBot ? formData.combo.step : formData.dca.step,
        stepScale: isComboBot
          ? formData.combo.stepScale
          : formData.dca.stepScale,
        minimumDeviation: isComboBot
          ? formData.combo.minimumDeviation
          : formData.dca.minimumDeviation,
        volumeScale: isComboBot
          ? formData.combo.volumeScale
          : formData.dca.volumeScale,
        activeOrdersCount: isComboBot
          ? formData.combo.activeOrdersCount
          : formData.dca.activeOrdersCount,
        useTp: isComboBot ? formData.combo.useTp : formData.dca.useTp,
        dealCloseCondition: isComboBot
          ? formData.combo.dealCloseCondition
          : formData.dca.dealCloseCondition,
        useSl: isComboBot ? formData.combo.useSl : formData.dca.useSl,
        dealCloseConditionSL: isComboBot
          ? formData.combo.dealCloseConditionSL
          : formData.dca.dealCloseConditionSL,
        orderSizeType: isComboBot
          ? formData.combo.orderSizeType
          : formData.dca.orderSizeType,
        coinm: isComboBot ? formData.combo.coinm : formData.dca.coinm,
        useDca: isComboBot ? formData.combo.useDca : formData.dca.useDca,
        dcaCondition: isComboBot
          ? formData.combo.dcaCondition
          : formData.dca.dcaCondition,
        scaleDcaType: isComboBot
          ? formData.combo.scaleDcaType
          : formData.dca.scaleDcaType,
        dcaVolumeBaseOn: isComboBot
          ? formData.combo.dcaVolumeBaseOn
          : formData.dca.dcaVolumeBaseOn,
        dcaVolumeRequiredChange: isComboBot
          ? formData.combo.dcaVolumeRequiredChange
          : formData.dca.dcaVolumeRequiredChange,
        dcaVolumeMaxValue: isComboBot
          ? formData.combo.dcaVolumeMaxValue
          : formData.dca.dcaVolumeMaxValue,
        ordersCount: isComboBot
          ? formData.combo.ordersCount
          : formData.dca.ordersCount,
        futures: isComboBot ? formData.combo.futures : formData.dca.futures,
        strategy: isComboBot ? formData.combo.strategy : formData.dca.strategy,
        useMultiTp: isComboBot
          ? formData.combo.useMultiTp
          : formData.dca.useMultiTp,
        profitCurrency: isComboBot
          ? formData.combo.profitCurrency
          : formData.dca.profitCurrency,
        trailingTp: isComboBot
          ? formData.combo.trailingTp
          : formData.dca.trailingTp,
        fixedTpPrice: isComboBot
          ? formData.combo.fixedTpPrice
          : formData.dca.fixedTpPrice,
        fixedSlPrice: isComboBot
          ? formData.combo.fixedSlPrice
          : formData.dca.fixedSlPrice,
        useFixedTPPrices: isComboBot
          ? formData.combo.useFixedTPPrices
          : formData.dca.useFixedTPPrices,
        useFixedSLPrices: isComboBot
          ? formData.combo.useFixedSLPrices
          : formData.dca.useFixedSLPrices,
        marginType: isComboBot
          ? formData.combo.marginType
          : formData.dca.marginType,
        leverage: isComboBot ? formData.combo.leverage : formData.dca.leverage,
        terminalDealType: isComboBot
          ? formData.combo.terminalDealType
          : formData.dca.terminalDealType,
        useSmartOrders: isComboBot
          ? formData.combo.useSmartOrders
          : formData.dca.useSmartOrders,
        dcaVolumeRequiredChangeRef: isComboBot
          ? formData.combo.dcaVolumeRequiredChangeRef
          : formData.dca.dcaVolumeRequiredChangeRef,
        moveSL: isComboBot ? formData.combo.moveSL : formData.dca.moveSL,
        baseSlOn: isComboBot ? formData.combo.baseSlOn : formData.dca.baseSlOn,
        trailingSl: isComboBot
          ? formData.combo.trailingSl
          : formData.dca.trailingSl,
        useMultiSl: isComboBot
          ? formData.combo.useMultiSl
          : formData.dca.useMultiSl,
        baseStep: isComboBot ? formData.combo.baseStep : formData.dca.baseStep,
        comboUseSmartGrids: isComboBot
          ? formData.combo.comboUseSmartGrids
          : formData.dca.comboUseSmartGrids,
        comboSmartGridsCount: isComboBot
          ? formData.combo.comboSmartGridsCount
          : formData.dca.comboSmartGridsCount,
        comboActiveMinigrids: isComboBot
          ? formData.combo.comboActiveMinigrids
          : formData.dca.comboActiveMinigrids,
        useActiveMinigrids: isComboBot
          ? formData.combo.useActiveMinigrids
          : formData.dca.useActiveMinigrids,
        feeOrder: isComboBot ? formData.combo.feeOrder : formData.dca.feeOrder,
        gridLevel: isComboBot
          ? formData.combo.gridLevel
          : formData.dca.gridLevel,
        baseGridLevels: isComboBot
          ? formData.combo.baseGridLevels
          : formData.dca.baseGridLevels,
      },
      baseOrderPrice: isComboBot
        ? formData.combo.baseOrderPrice
        : formData.dca.baseOrderPrice,
      startOrderType: isComboBot
        ? formData.combo.startOrderType
        : formData.dca.startOrderType,
      useLimitPrice: isComboBot
        ? formData.combo.useLimitPrice
        : formData.dca.useLimitPrice,
      gridSettings: {
        topPrice: formData.grid.topPrice,
        lowPrice: formData.grid.lowPrice,
        budget: formData.grid.budget,
        levels: formData.grid.levels,
        useStartPrice: formData.grid.useStartPrice,
        updatedBudget: formData.grid.updatedBudget,
        sellDisplacement: formData.grid.sellDisplacement,
        gridType: formData.grid.gridType,
        futures: formData.grid.futures,
        profitCurrency: formData.grid.profitCurrency,
        orderFixedIn: formData.grid.orderFixedIn,
        coinm: formData.grid.coinm,
        futuresStrategy: formData.grid.futuresStrategy,
        ordersInAdvance: formData.grid.ordersInAdvance,
        useOrderInAdvance: formData.grid.useOrderInAdvance,
        feeOrder: formData.grid.feeOrder,
      },
    });
  }, [
    formData.dca.indicators,
    formData.dca.dcaCustom,
    formData.dca.multiTp,
    formData.dca.multiSl,
    formData.dca.baseOrderSize,
    formData.dca.orderSize,
    formData.dca.tpPerc,
    formData.dca.slPerc,
    formData.dca.step,
    formData.dca.stepScale,
    formData.dca.minimumDeviation,
    formData.dca.volumeScale,
    formData.dca.activeOrdersCount,
    formData.dca.useTp,
    formData.dca.dealCloseCondition,
    formData.dca.useSl,
    formData.dca.dealCloseConditionSL,
    formData.dca.orderSizeType,
    formData.dca.coinm,
    formData.dca.useDca,
    formData.dca.dcaCondition,
    formData.dca.scaleDcaType,
    formData.dca.dcaVolumeBaseOn,
    formData.dca.dcaVolumeRequiredChange,
    formData.dca.dcaVolumeMaxValue,
    formData.dca.ordersCount,
    formData.dca.futures,
    formData.dca.strategy,
    formData.dca.useMultiTp,
    formData.dca.profitCurrency,
    formData.dca.trailingTp,
    formData.dca.fixedTpPrice,
    formData.dca.fixedSlPrice,
    formData.dca.useFixedTPPrices,
    formData.dca.useFixedSLPrices,
    formData.dca.marginType,
    formData.dca.leverage,
    formData.dca.terminalDealType,
    formData.dca.useSmartOrders,
    formData.dca.dcaVolumeRequiredChangeRef,
    formData.dca.moveSL,
    formData.dca.baseSlOn,
    formData.dca.trailingSl,
    formData.dca.useMultiSl,
    botType,
    isComboBot,
    formData.combo.indicators,
    formData.combo.dcaCustom,
    formData.combo.multiTp,
    formData.combo.multiSl,
    formData.combo.baseOrderSize,
    formData.combo.orderSize,
    formData.combo.tpPerc,
    formData.combo.slPerc,
    formData.combo.step,
    formData.combo.stepScale,
    formData.combo.minimumDeviation,
    formData.combo.volumeScale,
    formData.combo.activeOrdersCount,
    formData.combo.useTp,
    formData.combo.dealCloseCondition,
    formData.combo.useSl,
    formData.combo.dealCloseConditionSL,
    formData.combo.orderSizeType,
    formData.combo.coinm,
    formData.combo.useDca,
    formData.combo.dcaCondition,
    formData.combo.scaleDcaType,
    formData.combo.dcaVolumeBaseOn,
    formData.combo.dcaVolumeRequiredChange,
    formData.combo.dcaVolumeMaxValue,
    formData.combo.ordersCount,
    formData.combo.futures,
    formData.combo.strategy,
    formData.combo.useMultiTp,
    formData.combo.profitCurrency,
    formData.combo.trailingTp,
    formData.combo.fixedTpPrice,
    formData.combo.fixedSlPrice,
    formData.combo.useFixedTPPrices,
    formData.combo.useFixedSLPrices,
    formData.combo.marginType,
    formData.combo.leverage,
    formData.combo.terminalDealType,
    formData.combo.useSmartOrders,
    formData.combo.dcaVolumeRequiredChangeRef,
    formData.combo.moveSL,
    formData.combo.baseSlOn,
    formData.combo.trailingSl,
    formData.combo.useMultiSl,
    formData.combo.baseStep,
    formData.combo.comboUseSmartGrids,
    formData.combo.comboSmartGridsCount,
    formData.combo.comboActiveMinigrids,
    formData.combo.useActiveMinigrids,
    formData.combo.feeOrder,
    formData.combo.gridLevel,
    formData.combo.baseGridLevels,
    formData.combo.baseOrderPrice,
    formData.combo.startOrderType,
    formData.combo.useLimitPrice,
    formData.dca.baseStep,
    formData.dca.comboUseSmartGrids,
    formData.dca.comboSmartGridsCount,
    formData.dca.comboActiveMinigrids,
    formData.dca.useActiveMinigrids,
    formData.dca.feeOrder,
    formData.dca.baseOrderPrice,
    formData.dca.startOrderType,
    formData.dca.useLimitPrice,
    formData.dca.gridLevel,
    formData.dca.baseGridLevels,
    formData.grid.topPrice,
    formData.grid.lowPrice,
    formData.grid.budget,
    formData.grid.levels,
    formData.grid.useStartPrice,
    formData.grid.updatedBudget,
    formData.grid.sellDisplacement,
    formData.grid.gridType,
    formData.grid.futures,
    formData.grid.profitCurrency,
    formData.grid.orderFixedIn,
    formData.grid.coinm,
    formData.grid.futuresStrategy,
    formData.grid.ordersInAdvance,
    formData.grid.useOrderInAdvance,
    formData.grid.feeOrder,
    isSkipExampleOrders,
  ]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      errors,
    });
  }, [errors, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      botVars,
    });
  }, [botVars, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      userFee: formData.userFee?.makerCommission,
    });
  }, [isSkipExampleOrders, formData.userFee?.makerCommission]);

  const updateFormData = useCallback(
    (field: Fields, value: BotFormUpdateValue) => {
      let settingsUpdateResult: HandleSettingsUpdateResult = { dca: {} };
      setFormData((prev) => {
        if (field in prev) {
          return {
            ...prev,
            [field]: value,
          };
        }

        if (field in prev.dca && botType === BotTypesEnum.dca) {
          settingsUpdateResult = handleSettingsUpdate(
            prev,
            field,
            value,
            exampleOrdersStore.getInputLatestPrice()
          );
          return {
            ...prev,
            ...settingsUpdateResult,
            dca: {
              ...prev.dca,
              // Apply the raw value first, then let handleSettingsUpdate's
              // explicit field results win — this lets it coerce the active
              // field (e.g. integer-normalizing closeAfterX/closeAfterXopen),
              // matching legacy onChangeInput where newSettings[field] is the
              // computed value, not the raw input.
              [field]: value,
              ...settingsUpdateResult.dca,
            },
          };
        }
        if (field in prev.combo && botType === BotTypesEnum.combo) {
          return {
            ...prev,
            combo: {
              ...prev.combo,
              [field]: value,
            },
          };
        }
        if (field in prev.grid && botType === BotTypesEnum.grid) {
          return {
            ...prev,
            grid: {
              ...prev.grid,
              [field]: value,
            },
          };
        }

        return prev;
      });

      if (field === 'favoriteIndicators') {
        favoriteIndicatorsVersionRef.current += 1;
      }

      /* if (field === 'indicators' || 'indicators' in settingsUpdateResult.dca) {
        indicatorStore.setIndicators(
          field === 'indicators'
            ? ((value ?? []) as SettingsIndicators[])
            : (settingsUpdateResult.dca.indicators ?? [])
        );
      } */

      if (!derivedFields.current.has(field)) {
        setIsDirty(true);
      }

      setErrors((prevErrors) => {
        if (!(field in prevErrors)) {
          return prevErrors;
        }

        const { [field]: _removed, ...rest } = prevErrors;
        return rest;
      });
    },
    [botType, setFormData]
  );
  useEffect(() => {
    let newErrors: BotFormErrors = {};
    let newAlerts: BotFormAlerts = {};
    if (formData.type === BotTypesEnum.grid) {
      const { errors: _newErrors, alerts: _newAlerts } = validateGridFormData({
        name: formData.name,
        exchangeUUID: formData.exchangeUUID,
        pair: formData.pair,
        grid: {
          budget: formData.grid.budget,
          topPrice: formData.grid.topPrice,
          lowPrice: formData.grid.lowPrice,
          levels: formData.grid.levels,
          tpSl: formData.grid.tpSl,
          tpSlCondition: formData.grid.tpSlCondition,
          tpPerc: formData.grid.tpPerc,
          tpTopPrice: formData.grid.tpTopPrice,
          sl: formData.grid.sl,
          slCondition: formData.grid.slCondition,
          slLowPrice: formData.grid.slLowPrice,
          slPerc: formData.grid.slPerc,
          useStartPrice: formData.grid.useStartPrice,
          startPrice: formData.grid.startPrice,
          useOrderInAdvance: formData.grid.useOrderInAdvance,
          ordersInAdvance: formData.grid.ordersInAdvance,
          futures: formData.grid.futures,
          leverage: formData.grid.leverage,
          marginType: formData.grid.marginType,
        },
      });
      newErrors = _newErrors;
      newAlerts = _newAlerts ?? {};
    }
    if (
      formData.type === BotTypesEnum.dca ||
      formData.type === BotTypesEnum.combo
    ) {
      const { errors: _newErrors, alerts: _newAlerts } = hotValidateDcaFormData(
        {
          mode,
          dcaOrderGuard: formData.dcaOrderGuard,
          dca: {
            baseOrderSize: isComboBot
              ? formData.combo.baseOrderSize
              : formData.dca.baseOrderSize,
            orderSize: isComboBot
              ? formData.combo.orderSize
              : formData.dca.orderSize,
            tpPerc: isComboBot ? formData.combo.tpPerc : formData.dca.tpPerc,
            slPerc: isComboBot ? formData.combo.slPerc : formData.dca.slPerc,
            step: isComboBot ? formData.combo.step : formData.dca.step,
            volumeScale: isComboBot
              ? formData.combo.volumeScale
              : formData.dca.volumeScale,
            stepScale: isComboBot
              ? formData.combo.stepScale
              : formData.dca.stepScale,
            minOpenDeal: isComboBot
              ? formData.combo.minOpenDeal
              : formData.dca.minOpenDeal,
            maxOpenDeal: isComboBot
              ? formData.combo.maxOpenDeal
              : formData.dca.maxOpenDeal,
            riskMinPositionSize: isComboBot
              ? formData.combo.riskMinPositionSize
              : formData.dca.riskMinPositionSize,
            riskMaxPositionSize: isComboBot
              ? formData.combo.riskMaxPositionSize
              : formData.dca.riskMaxPositionSize,
            riskMinSl: isComboBot
              ? formData.combo.riskMinSl
              : formData.dca.riskMinSl,
            riskSlType: isComboBot
              ? formData.combo.riskSlType
              : formData.dca.riskSlType,
            riskSlAmountValue: isComboBot
              ? formData.combo.riskSlAmountValue
              : formData.dca.riskSlAmountValue,
            riskMaxSl: isComboBot
              ? formData.combo.riskMaxSl
              : formData.dca.riskMaxSl,
            riskTpRatio: isComboBot
              ? formData.combo.riskTpRatio
              : formData.dca.riskTpRatio,
            orderSizeType: isComboBot
              ? formData.combo.orderSizeType
              : formData.dca.orderSizeType,
            baseOrderPrice: isComboBot
              ? formData.combo.baseOrderPrice
              : formData.dca.baseOrderPrice,
            startOrderType: isComboBot
              ? formData.combo.startOrderType
              : formData.dca.startOrderType,
            useLimitPrice: isComboBot
              ? formData.combo.useLimitPrice
              : formData.dca.useLimitPrice,
            cooldownAfterDealStart: isComboBot
              ? formData.combo.cooldownAfterDealStart
              : formData.dca.cooldownAfterDealStart,
            cooldownAfterDealStartInterval: isComboBot
              ? formData.combo.cooldownAfterDealStartInterval
              : formData.dca.cooldownAfterDealStartInterval,
            cooldownAfterDealStop: isComboBot
              ? formData.combo.cooldownAfterDealStop
              : formData.dca.cooldownAfterDealStop,
            cooldownAfterDealStopInterval: isComboBot
              ? formData.combo.cooldownAfterDealStopInterval
              : formData.dca.cooldownAfterDealStopInterval,
            useRiskReward: isComboBot
              ? formData.combo.useRiskReward
              : formData.dca.useRiskReward,
            riskUseTpRatio: isComboBot
              ? formData.combo.riskUseTpRatio
              : formData.dca.riskUseTpRatio,
            maxNumberOfOpenDeals: isComboBot
              ? formData.combo.maxNumberOfOpenDeals
              : formData.dca.maxNumberOfOpenDeals,
            maxDealsPerPair: isComboBot
              ? formData.combo.maxDealsPerPair
              : formData.dca.maxDealsPerPair,
            useTp: isComboBot ? formData.combo.useTp : formData.dca.useTp,
            useMaxDealsPerHigherTimeframe: isComboBot
              ? formData.combo.useMaxDealsPerHigherTimeframe
              : formData.dca.useMaxDealsPerHigherTimeframe,
            maxDealsPerHigherTimeframe: isComboBot
              ? formData.combo.maxDealsPerHigherTimeframe
              : formData.dca.maxDealsPerHigherTimeframe,
            useSl: isComboBot ? formData.combo.useSl : formData.dca.useSl,
            startCondition: isComboBot
              ? formData.combo.startCondition
              : formData.dca.startCondition,
            hodlDay: isComboBot ? formData.combo.hodlDay : formData.dca.hodlDay,
            hodlNextBuy: isComboBot
              ? formData.combo.hodlNextBuy
              : formData.dca.hodlNextBuy,
            activeOrdersCount: isComboBot
              ? formData.combo.activeOrdersCount
              : formData.dca.activeOrdersCount,
            useSmartOrders: isComboBot
              ? formData.combo.useSmartOrders
              : formData.dca.useSmartOrders,
            useDca: isComboBot ? formData.combo.useDca : formData.dca.useDca,
            useDynamicPriceFilter: isComboBot
              ? formData.combo.useDynamicPriceFilter
              : formData.dca.useDynamicPriceFilter,
            dynamicPriceFilterDirection: isComboBot
              ? formData.combo.dynamicPriceFilterDirection
              : formData.dca.dynamicPriceFilterDirection,
            dynamicPriceFilterOverValue: isComboBot
              ? formData.combo.dynamicPriceFilterOverValue
              : formData.dca.dynamicPriceFilterOverValue,
            dynamicPriceFilterUnderValue: isComboBot
              ? formData.combo.dynamicPriceFilterUnderValue
              : formData.dca.dynamicPriceFilterUnderValue,
            futures: isComboBot ? formData.combo.futures : formData.dca.futures,
            marginType: isComboBot
              ? formData.combo.marginType
              : formData.dca.marginType,
            terminalDealType: isComboBot
              ? formData.combo.terminalDealType
              : formData.dca.terminalDealType,
            dcaCondition: isComboBot
              ? formData.combo.dcaCondition
              : formData.dca.dcaCondition,
            ordersCount: isComboBot
              ? formData.combo.ordersCount
              : formData.dca.ordersCount,
            useMulti: isComboBot
              ? formData.combo.useMulti
              : formData.dca.useMulti,
            dcaCustom: isComboBot
              ? formData.combo.dcaCustom
              : formData.dca.dcaCustom,
            dcaVolumeBaseOn: isComboBot
              ? formData.combo.dcaVolumeBaseOn
              : formData.dca.dcaVolumeBaseOn,
            indicators: isComboBot
              ? formData.combo.indicators
              : formData.dca.indicators,
            botStart: isComboBot
              ? formData.combo.botStart
              : formData.dca.botStart,
            useBotController: isComboBot
              ? formData.combo.useBotController
              : formData.dca.useBotController,
            botActualStart: isComboBot
              ? formData.combo.botActualStart
              : formData.dca.botActualStart,
            dealCloseCondition: isComboBot
              ? formData.combo.dealCloseCondition
              : formData.dca.dealCloseCondition,
            dealCloseConditionSL: isComboBot
              ? formData.combo.dealCloseConditionSL
              : formData.dca.dealCloseConditionSL,
            type: isComboBot ? formData.combo.type : formData.dca.type,
            trailingTp: isComboBot
              ? formData.combo.trailingTp
              : formData.dca.trailingTp,
            trailingTpPerc: isComboBot
              ? formData.combo.trailingTpPerc
              : formData.dca.trailingTpPerc,
            useMinTP: isComboBot
              ? formData.combo.useMinTP
              : formData.dca.useMinTP,
            minTp: isComboBot ? formData.combo.minTp : formData.dca.minTp,
            useCloseAfterX: isComboBot
              ? formData.combo.useCloseAfterX
              : formData.dca.useCloseAfterX,
            closeAfterX: isComboBot
              ? formData.combo.closeAfterX
              : formData.dca.closeAfterX,
            useCloseAfterXloss: isComboBot
              ? formData.combo.useCloseAfterXloss
              : formData.dca.useCloseAfterXloss,
            closeAfterXloss: isComboBot
              ? formData.combo.closeAfterXloss
              : formData.dca.closeAfterXloss,
            useCloseAfterXwin: isComboBot
              ? formData.combo.useCloseAfterXwin
              : formData.dca.useCloseAfterXwin,
            closeAfterXwin: isComboBot
              ? formData.combo.closeAfterXwin
              : formData.dca.closeAfterXwin,
            useCloseAfterXprofit: isComboBot
              ? formData.combo.useCloseAfterXprofit
              : formData.dca.useCloseAfterXprofit,
            closeAfterXprofitValue: isComboBot
              ? formData.combo.closeAfterXprofitValue
              : formData.dca.closeAfterXprofitValue,
            stopBotPriceValue: isComboBot
              ? formData.combo.stopBotPriceValue
              : formData.dca.stopBotPriceValue,
            startBotPriceValue: isComboBot
              ? formData.combo.startBotPriceValue
              : formData.dca.startBotPriceValue,
            useCloseAfterXopen: isComboBot
              ? formData.combo.useCloseAfterXopen
              : formData.dca.useCloseAfterXopen,
            closeAfterXopen: isComboBot
              ? formData.combo.closeAfterXopen
              : formData.dca.closeAfterXopen,
            volumeTop: isComboBot
              ? formData.combo.volumeTop
              : formData.dca.volumeTop,
            volumeValue: isComboBot
              ? formData.combo.volumeValue
              : formData.dca.volumeValue,
            useVolumeFilter: isComboBot
              ? formData.combo.useVolumeFilter
              : formData.dca.useVolumeFilter,
            relativeVolumeTop: isComboBot
              ? formData.combo.relativeVolumeTop
              : formData.dca.relativeVolumeTop,
            useRelativeVolumeFilter: isComboBot
              ? formData.combo.useRelativeVolumeFilter
              : formData.dca.useRelativeVolumeFilter,
            relativeVolumeValue: isComboBot
              ? formData.combo.relativeVolumeValue
              : formData.dca.relativeVolumeValue,
            leverage: isComboBot
              ? formData.combo.leverage
              : formData.dca.leverage,
          },
          userFee: formData.userFee,
          pair: formData.pair,
        }
      );
      newErrors = _newErrors;
      newAlerts = _newAlerts ?? {};
    }

    // Apply alerts produced by hot validation
    setAlerts(newAlerts);

    setErrors((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(newErrors)) {
        return prev;
      }

      return newErrors;
    });
  }, [
    formData.type,
    formData.dca.baseOrderSize,
    formData.dca.orderSize,
    formData.dca.tpPerc,
    formData.dca.slPerc,
    formData.dca.step,
    formData.dca.volumeScale,
    formData.dca.stepScale,
    formData.dca.minOpenDeal,
    formData.dca.maxOpenDeal,
    formData.dca.riskMinPositionSize,
    formData.dca.riskMaxPositionSize,
    formData.dca.riskMinSl,
    formData.dca.riskSlType,
    formData.dca.riskSlAmountValue,
    formData.dca.riskMaxSl,
    formData.dca.riskTpRatio,
    formData.dca.orderSizeType,
    formData.dca.baseOrderPrice,
    formData.dca.startOrderType,
    formData.dca.cooldownAfterDealStart,
    formData.dca.cooldownAfterDealStartInterval,
    formData.dca.cooldownAfterDealStop,
    formData.dca.cooldownAfterDealStopInterval,
    formData.dca.useRiskReward,
    formData.dca.riskUseTpRatio,
    formData.dca.maxNumberOfOpenDeals,
    formData.dca.maxDealsPerPair,
    formData.dcaOrderGuard,
    formData.dca.useTp,
    formData.dca.useMaxDealsPerHigherTimeframe,
    formData.dca.maxDealsPerHigherTimeframe,
    formData.dca.useSl,
    formData.dca.startCondition,
    formData.dca.hodlDay,
    formData.dca.hodlNextBuy,
    formData.dca.activeOrdersCount,
    formData.dca.useSmartOrders,
    formData.dca.useDca,
    formData.dca.useDynamicPriceFilter,
    formData.dca.dynamicPriceFilterDirection,
    formData.dca.dynamicPriceFilterOverValue,
    formData.dca.dynamicPriceFilterUnderValue,
    formData.dca.futures,
    formData.dca.marginType,
    formData.dca.terminalDealType,
    formData.dca.dcaCondition,
    formData.dca.ordersCount,
    formData.dca.useMulti,
    formData.dca.dcaCustom,
    formData.dca.dcaVolumeBaseOn,
    formData.dca.indicators,
    formData.dca.botStart,
    formData.dca.useBotController,
    formData.dca.botActualStart,
    formData.dca.dealCloseCondition,
    formData.dca.dealCloseConditionSL,
    formData.dca.type,
    formData.dca.trailingTp,
    formData.dca.trailingTpPerc,
    formData.dca.useMinTP,
    formData.dca.minTp,
    formData.dca.useCloseAfterX,
    formData.dca.closeAfterX,
    formData.dca.useCloseAfterXloss,
    formData.dca.closeAfterXloss,
    formData.dca.useCloseAfterXwin,
    formData.dca.closeAfterXwin,
    formData.dca.useCloseAfterXprofit,
    formData.dca.closeAfterXprofitValue,
    formData.dca.stopBotPriceValue,
    formData.dca.startBotPriceValue,
    formData.dca.useCloseAfterXopen,
    formData.dca.closeAfterXopen,
    formData.dca.volumeTop,
    formData.dca.volumeValue,
    formData.dca.useVolumeFilter,
    formData.dca.relativeVolumeTop,
    formData.dca.useRelativeVolumeFilter,
    formData.dca.relativeVolumeValue,
    formData.dca.leverage,
    formData.userFee,
    formData.pair,
    isComboBot,
    formData.combo.baseOrderSize,
    formData.combo.orderSize,
    formData.combo.tpPerc,
    formData.combo.slPerc,
    formData.combo.step,
    formData.combo.volumeScale,
    formData.combo.stepScale,
    formData.combo.minOpenDeal,
    formData.combo.maxOpenDeal,
    formData.combo.riskMinPositionSize,
    formData.combo.riskMaxPositionSize,
    formData.combo.riskMinSl,
    formData.combo.riskSlType,
    formData.combo.riskSlAmountValue,
    formData.combo.riskMaxSl,
    formData.combo.riskTpRatio,
    formData.combo.orderSizeType,
    formData.combo.baseOrderPrice,
    formData.combo.startOrderType,
    formData.combo.cooldownAfterDealStart,
    formData.combo.cooldownAfterDealStartInterval,
    formData.combo.cooldownAfterDealStop,
    formData.combo.cooldownAfterDealStopInterval,
    formData.combo.useRiskReward,
    formData.combo.riskUseTpRatio,
    formData.combo.maxNumberOfOpenDeals,
    formData.combo.maxDealsPerPair,
    formData.combo.useTp,
    formData.combo.useMaxDealsPerHigherTimeframe,
    formData.combo.maxDealsPerHigherTimeframe,
    formData.combo.useSl,
    formData.combo.startCondition,
    formData.combo.hodlDay,
    formData.combo.hodlNextBuy,
    formData.combo.activeOrdersCount,
    formData.combo.useSmartOrders,
    formData.combo.useDca,
    formData.combo.useDynamicPriceFilter,
    formData.combo.dynamicPriceFilterDirection,
    formData.combo.dynamicPriceFilterOverValue,
    formData.combo.dynamicPriceFilterUnderValue,
    formData.combo.futures,
    formData.combo.marginType,
    formData.combo.terminalDealType,
    formData.combo.dcaCondition,
    formData.combo.ordersCount,
    formData.combo.useMulti,
    formData.combo.dcaCustom,
    formData.combo.dcaVolumeBaseOn,
    formData.combo.indicators,
    formData.combo.botStart,
    formData.combo.useBotController,
    formData.combo.botActualStart,
    formData.combo.dealCloseCondition,
    formData.combo.dealCloseConditionSL,
    formData.combo.type,
    formData.combo.trailingTp,
    formData.combo.trailingTpPerc,
    formData.combo.useMinTP,
    formData.combo.minTp,
    formData.combo.useCloseAfterX,
    formData.combo.closeAfterX,
    formData.combo.useCloseAfterXloss,
    formData.combo.closeAfterXloss,
    formData.combo.useCloseAfterXwin,
    formData.combo.closeAfterXwin,
    formData.combo.useCloseAfterXprofit,
    formData.combo.closeAfterXprofitValue,
    formData.combo.stopBotPriceValue,
    formData.combo.startBotPriceValue,
    formData.combo.useCloseAfterXopen,
    formData.combo.closeAfterXopen,
    formData.combo.volumeTop,
    formData.combo.volumeValue,
    formData.combo.useVolumeFilter,
    formData.combo.relativeVolumeTop,
    formData.combo.useRelativeVolumeFilter,
    formData.combo.relativeVolumeValue,
    formData.combo.leverage,
    formData.dca.useLimitPrice,
    formData.combo.useLimitPrice,
    formData.name,
    formData.exchangeUUID,
    formData.grid.budget,
    formData.grid.topPrice,
    formData.grid.lowPrice,
    formData.grid.levels,
    formData.grid.tpSl,
    formData.grid.tpSlCondition,
    formData.grid.tpPerc,
    formData.grid.tpTopPrice,
    formData.grid.sl,
    formData.grid.slCondition,
    formData.grid.slLowPrice,
    formData.grid.slPerc,
    formData.grid.useStartPrice,
    formData.grid.startPrice,
    formData.grid.useOrderInAdvance,
    formData.grid.ordersInAdvance,
    formData.grid.futures,
    formData.grid.leverage,
    formData.grid.marginType,
    mode,
  ]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    const accessToken = tokens?.accessToken ?? null;

    if (!accessToken) {
      favoriteIndicatorsRequestState.current = {
        lastToken: null,
        inflight: false,
      };
      return;
    }

    if (favoriteIndicatorsRequestState.current.inflight) {
      return;
    }

    if (favoriteIndicatorsRequestState.current.lastToken === accessToken) {
      return;
    }

    const favoritesQueryFactory = GraphQlQuery.getUserFavoriteIndicators;
    if (typeof favoritesQueryFactory !== 'function') {
      return;
    }

    favoriteIndicatorsRequestState.current.inflight = true;
    const hydrationVersion = favoriteIndicatorsVersionRef.current;
    let isActive = true;

    const hydrateFavoriteIndicators = async () => {
      try {
        const endpoint =
          import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
        const client = new GraphQLClient(endpoint, accessToken, !isLiveTrading);

        const { query } = favoritesQueryFactory();

        const response = await client.request<{
          getUserFavoriteIndicators: {
            status: string;
            reason?: string | null;
            data?: { indicators?: IndicatorEnum[] | null } | null;
          };
        }>(query);

        favoriteIndicatorsRequestState.current.inflight = false;
        favoriteIndicatorsRequestState.current.lastToken = accessToken;

        if (!isActive) {
          return;
        }

        if (favoriteIndicatorsVersionRef.current !== hydrationVersion) {
          return;
        }

        const payload = response?.getUserFavoriteIndicators ?? null;

        if (payload?.status === 'OK') {
          const rawIndicators = payload.data?.indicators ?? [];
          const { favorites, unknownCodes } =
            parseIndicatorFavoriteCodes(rawIndicators);

          setFormData((prev) => {
            const prevFavorites = Array.isArray(prev.favoriteIndicators)
              ? (prev.favoriteIndicators.filter(Boolean) as IndicatorEnum[])
              : [];

            const nextFavorites: IndicatorEnum[] = [];
            const seen = new Set<IndicatorEnum>();

            for (const indicator of favorites) {
              if (!seen.has(indicator)) {
                seen.add(indicator);
                nextFavorites.push(indicator);
              }
            }

            for (const indicator of prevFavorites) {
              if (!seen.has(indicator)) {
                seen.add(indicator);
                nextFavorites.push(indicator);
              }
            }

            if (
              prevFavorites.length === nextFavorites.length &&
              prevFavorites.every(
                (indicator, index) => nextFavorites[index] === indicator
              )
            ) {
              return prev;
            }

            return {
              ...prev,
              favoriteIndicators: nextFavorites as unknown as IndicatorEnum[],
            };
          });

          if (unknownCodes.length > 0) {
            console.warn(
              '[BotFormProvider] Unknown favorite indicator codes received:',
              unknownCodes
            );
          }
        } else {
          const reason = payload?.reason?.trim();
          toast.error(
            reason
              ? `Loading favorite indicators: ${reason}`
              : 'Failed to load favorite indicators.'
          );
        }
      } catch (error) {
        favoriteIndicatorsRequestState.current.inflight = false;
        favoriteIndicatorsRequestState.current.lastToken = accessToken;

        if (!isActive) {
          return;
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Unexpected error while loading favorite indicators.';
        toast.error(message);
      }
    };

    hydrateFavoriteIndicators();

    return () => {
      isActive = false;
      favoriteIndicatorsRequestState.current.inflight = false;
    };
  }, [isLiveTrading, setFormData, tokens?.accessToken, isSkipExampleOrders]);

  const features = useMemo<BotFormFeatureFlags>(() => {
    const registryFeatures = (botExperience.featureFlags ??
      {}) as BotFormFeatureFlags;
    const metadataFeatures = (botExperience.metadata?.['features'] ??
      {}) as BotFormFeatureFlags;

    return {
      ...registryFeatures,
      ...metadataFeatures,
    };
  }, [botExperience.featureFlags, botExperience.metadata]);

  // Component error registration
  const registerComponentError = useCallback(
    (field: string, alert: import('@/types/bots/form').BotFormAlert | null) => {
      setComponentErrors((prev) => {
        if (!alert) {
          // Remove error
          const next = { ...prev } as Record<
            string,
            (typeof prev)[keyof typeof prev]
          >;
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[field];
          return next as typeof prev;
        }

        // Add/update error
        return {
          ...prev,
          [field]: [alert],
        } as typeof prev;
      });
    },
    []
  );

  // Merge validation alerts with component errors
  const mergedAlerts = useMemo(() => {
    const result: import('@/types/bots/form').BotFormAlerts = {};

    // Add validation alerts
    for (const [key, value] of Object.entries(alerts)) {
      (result as any)[key] = value;
    }

    // Add component errors - merge with existing alerts if present
    for (const [key, value] of Object.entries(componentErrors)) {
      const existing = (result as any)[key] as typeof value | undefined;
      if (existing && Array.isArray(existing)) {
        // Merge arrays, avoiding duplicates by message + variant + navId
        const merged = [...existing, ...(value ?? [])];
        const deduped: typeof merged = [];
        const seen = new Set<string>();
        for (const alert of merged) {
          const fingerprint = `${alert?.variant ?? ''}::${alert?.message ?? ''}::${alert?.navId ?? ''}`;
          if (!seen.has(fingerprint)) {
            seen.add(fingerprint);
            deduped.push(alert);
          }
        }
        (result as any)[key] = deduped;
      } else {
        (result as any)[key] = value;
      }
    }

    return result;
  }, [alerts, componentErrors]);

  const value = useMemo<BotFormStateContextValue>(
    () => ({
      mode,
      activeTab,
      setActiveTab,
      isLoading,
      setIsLoading,
      errors,
      setErrors,
      alerts: mergedAlerts,
      setAlerts,
      isDirty,
      setIsDirty,
      formData,
      setFormData,
      updateFormData,
      lockedFields,
      isFieldLocked,
      isEditLocked,
      isReadOnly,
      enableEditing,
      disableEditing,
      toggleEditing,
      features,
      botVars,
      setBotVars,
      resetFormData,
      registerComponentError,
      quickSetupMode,
      setQuickSetupMode,
      selectedPreset,
      setSelectedPreset,
      activeChartPair,
      setActiveChartPair,
      isNestedLeg: !!isNestedLeg,
    }),
    [
      mode,
      activeTab,
      isLoading,
      errors,
      mergedAlerts,
      isDirty,
      formData,
      lockedFields,
      isFieldLocked,
      isEditLocked,
      isReadOnly,
      enableEditing,
      disableEditing,
      toggleEditing,
      features,
      updateFormData,
      botVars,
      setFormData,
      resetFormData,
      registerComponentError,
      quickSetupMode,
      selectedPreset,
      activeChartPair,
      isNestedLeg,
    ]
  );

  return (
    <BotFormStateContext.Provider value={value}>
      {children}
    </BotFormStateContext.Provider>
  );
};

export const useBotFormState = (): BotFormStateContextValue => {
  const context = useContext(BotFormStateContext);

  if (!context) {
    throw new Error('useBotFormState must be used within a BotFormProvider');
  }

  return context;
};

export const useOptionalBotFormState = () => {
  return useContext(BotFormStateContext);
};

export const useBotFormFeatures = (): BotFormFeatureFlags => {
  const { features } = useBotFormState();
  return features;
};

export const useBotFormFieldLock = () => {
  const { isFieldLocked } = useBotFormState();
  return isFieldLocked;
};

export const useBotFormEditing = () => {
  const {
    isEditLocked,
    isReadOnly,
    enableEditing,
    disableEditing,
    toggleEditing,
  } = useBotFormState();

  return {
    isEditLocked,
    isReadOnly,
    enableEditing,
    disableEditing,
    toggleEditing,
  };
};

/**
 * Hook to select a specific property from the current bot type's settings.
 * Only re-renders when the selected property changes, not on unrelated formData updates.
 *
 * @example
 * const futures = useBotFormSelector('futures');
 * const strategy = useBotFormSelector('strategy');
 *
 * @param key - The property key to select from the current bot settings
 * @returns The value of the property from the active bot type (dca/combo/grid)
 */
export const useBotFormSelector = <
  K extends Fields,
  V = K extends keyof BotFormData['dca']
    ? BotFormData['dca'][K]
    : K extends keyof BotFormData['combo']
      ? BotFormData['combo'][K]
      : K extends keyof BotFormData['grid']
        ? BotFormData['grid'][K]
        : unknown,
>(
  key: K,
  defaultValue?: V
): V => {
  const { formData } = useBotFormState();

  return useMemo(() => {
    switch (formData.type) {
      case BotTypesEnum.dca:
        return (formData.dca[key as keyof BotFormData['dca']] ??
          defaultValue) as any;
      case BotTypesEnum.combo:
        return (formData.combo[key as keyof BotFormData['combo']] ??
          defaultValue) as any;
      case BotTypesEnum.grid:
        return (formData.grid[key as keyof BotFormData['grid']] ??
          defaultValue) as any;
      default:
        return (formData.dca[key as keyof BotFormData['dca']] ??
          defaultValue) as any;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.type,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    formData.dca[key as keyof BotFormData['dca']],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    formData.combo[key as keyof BotFormData['combo']],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    formData.grid[key as keyof BotFormData['grid']],
    key,
  ]);
};
