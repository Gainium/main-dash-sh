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
import { useSearchParams } from 'react-router-dom';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  botFormAlertsEqual,
  botFormErrorsEqual,
  createBotFormStore,
  EMPTY_BOT_FORM_STORE,
  mergeBotFormAlerts,
  type BotFormStore,
  type BotFormStoreState,
} from '@/contexts/bots/form/botFormStore';

import type { PrecisionGuard } from '@/features/bots/shared/utils/order-guard';
import { useBotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { GraphQLClient, GraphQlQuery, DEFAULT_READ_TIMEOUT_MS } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import {
  createIndicatorStore,
  indicatorStore as sharedIndicatorStore,
} from '@/stores/indicatorStore';
import {
  ExampleOrdersStoreContext,
  IndicatorStoreContext,
} from '@/contexts/bots/form/formStoreContexts';
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
import {
  createExampleOrdersStore,
  exampleOrdersStore as sharedExampleOrdersStore,
} from '@/utils/bots/dca/example-orders';
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

/**
 * What the React context actually carries: the STABLE zustand store reference,
 * the stable callbacks, and the rarely-changing flags. The four hot fields
 * (`formData`, `errors`, `alerts`, `isDirty`) are NOT here — they live in the
 * store and are stitched back into the public `BotFormStateContextValue` shape
 * by the consumer hooks (`useBotFormState` / `useOptionalBotFormState`). This
 * value is referentially stable across keystrokes, which is the whole point of
 * the refactor.
 */
interface BotFormInternalContextValue {
  store: BotFormStore;
  mode: BotFormMode;
  activeTab: BotFormTabId;
  setActiveTab: Dispatch<SetStateAction<BotFormTabId>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setErrors: Dispatch<SetStateAction<BotFormErrors>>;
  setAlerts: Dispatch<SetStateAction<BotFormAlerts>>;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
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
  registerComponentError: (
    field: string,
    alert: import('@/types/bots/form').BotFormAlert | null
  ) => void;
  quickSetupMode: 'quick' | 'manual';
  setQuickSetupMode: Dispatch<SetStateAction<'quick' | 'manual'>>;
  selectedPreset: string | null;
  setSelectedPreset: Dispatch<SetStateAction<string | null>>;
  activeChartPair: string | null;
  setActiveChartPair: Dispatch<SetStateAction<string | null>>;
  isNestedLeg: boolean;
}

const BotFormStateContext = createContext<
  BotFormInternalContextValue | undefined
>(undefined);

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
  /**
   * When true, this provider creates its OWN instances of the example-orders
   * and indicator side-effect stores and supplies them to descendants via
   * context, instead of sharing the module singletons. Set for hedge legs so
   * two co-mounted leg forms don't clobber each other's order-estimation /
   * indicator pipelines. Regular bots (one form) leave this off and keep the
   * shared globals — byte-identical to the historical behaviour.
   */
  isolateStores?: boolean;
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
    isolateStores,
  } = props;
  const { botExperience } = useBotFormRegistryContext();

  // Instance-scoped side-effect stores. Hedge legs isolate so co-mounted leg
  // forms don't fight over the shared globals; everyone else keeps the module
  // singletons (identical to legacy behaviour). Instances are stable for the
  // life of the provider, so descendants reading them via
  // ExampleOrdersStoreContext / IndicatorStoreContext stay bound to the same
  // store this provider writes to.
  const exampleOrdersStore = useMemo(
    () =>
      isolateStores ? createExampleOrdersStore() : sharedExampleOrdersStore,
    [isolateStores]
  );
  const indicatorStore = useMemo(
    () => (isolateStores ? createIndicatorStore() : sharedIndicatorStore),
    [isolateStores]
  );

  const [activeTab, setActiveTab] = useState<BotFormTabId>(
    defaultTab ?? 'basic'
  );
  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const [isLoading, setIsLoading] = useState<boolean>(mode === 'edit');
  // Per-keystroke-HOT state (formData / errors / alerts / componentErrors /
  // isDirty) lives in a zustand vanilla store created ONCE per provider. A
  // field edit writes the store instead of React state, so the provider does
  // not re-render and the context value keeps a stable identity. Consumers
  // subscribe to just the slice they read via `useStore(store, selector)`.
  const storeRef = useRef<BotFormStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createBotFormStore(defaultStateFn(props));
  }
  const store = storeRef.current;

  // Debounce bookkeeping for the store-subscription side effects (defined at
  // component scope so the public `setErrors`/`setAlerts` write path can cancel
  // a still-pending validation pass — see the cancel calls in those callbacks
  // and the maxWait-aware schedulers in the subscription effect below).
  //  - *TimerRef: the trailing setTimeout handle.
  //  - *PendingSinceRef: timestamp of the first write in the current burst,
  //    used to enforce a maxWait so a sustained write stream (e.g. holding a
  //    number stepper) can't starve the trailing edge forever.
  const exampleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const examplePendingSinceRef = useRef<number | null>(null);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationPendingSinceRef = useRef<number | null>(null);

  // Cancel any pending debounced validation pass. Used by the external
  // `setErrors`/`setAlerts` write path (e.g. handleSave writes authoritative
  // save-time errors right after a keystroke; the keystroke's still-pending
  // debounced validation must NOT fire ~120ms later and clobber them). The
  // internal validation path writes via `store.setState` directly, so it does
  // NOT route through here and never cancels itself.
  const cancelPendingValidation = useCallback(() => {
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }
    validationPendingSinceRef.current = null;
  }, []);

  const setFormData = useCallback(
    (value: React.SetStateAction<BotFormData>) => {
      store.setState((prev) => {
        const nextValue =
          typeof value === 'function'
            ? (value as (p: BotFormData) => BotFormData)(prev.formData)
            : value;
        if (nextValue.dca.indicators) {
          indicatorStore.setIndicators(nextValue.dca.indicators);
        }
        return { formData: nextValue };
      });
    },
    [store, indicatorStore]
  );
  const setErrors = useCallback<Dispatch<SetStateAction<BotFormErrors>>>(
    (value) => {
      // External write path: kill any in-flight debounced validation so it
      // can't overwrite these errors ~120ms later (STALE-TIMER CLOBBER).
      cancelPendingValidation();
      store.setState((prev) => ({
        errors:
          typeof value === 'function'
            ? (value as (p: BotFormErrors) => BotFormErrors)(prev.errors)
            : value,
      }));
    },
    [store, cancelPendingValidation]
  );
  const setAlerts = useCallback<Dispatch<SetStateAction<BotFormAlerts>>>(
    (value) => {
      // External write path: kill any in-flight debounced validation so it
      // can't overwrite these alerts ~120ms later (STALE-TIMER CLOBBER).
      cancelPendingValidation();
      store.setState((prev) => ({
        alerts:
          typeof value === 'function'
            ? (value as (p: BotFormAlerts) => BotFormAlerts)(prev.alerts)
            : value,
      }));
    },
    [store, cancelPendingValidation]
  );
  const setIsDirty = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      store.setState((prev) => ({
        isDirty:
          typeof value === 'function'
            ? (value as (p: boolean) => boolean)(prev.isDirty)
            : value,
      }));
    },
    [store]
  );
  const resetFormData = useCallback(() => {
    setFormData(defaultStateFn(props, true));
  }, [props, setFormData]);
  const [botVars, setBotVars] = useState<BotVars | null>(null);
  // The bot edit page opens directly in an editable state — reaching
  // `/x/edit/:id` (from the sidebar, a bot card, the drawer's Edit action,
  // etc.) always expresses intent to edit. The read-only surface is the
  // drawer (`/x/view/:id`); the footer's EDIT/CANCEL toggle still locks the
  // form on demand. Certain fields stay immutable on existing bots via their
  // own per-field locks, independent of this overall edit lock.
  const [isEditLocked, setIsEditLocked] = useState<boolean>(false);
  // A create page opened via `?load=<id>` is a CLONE: the form is seeded from
  // an existing bot's settings. Those must be shown/edited as-is, so a clone
  // opens in Manual — Quick mode would apply a risk-profile preset on top and
  // clobber the cloned strategy. `?load=` is the universal clone signal across
  // every bot type's new page.
  const [searchParams] = useSearchParams();
  const isCloneSeed = Boolean(searchParams.get('load'));
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
      !isNestedLeg &&
      !isCloneSeed
      ? 'quick'
      : 'manual'
  );
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [activeChartPair, setActiveChartPair] = useState<string | null>(null);

  useEffect(() => {
    // Keep in sync with the initial state above: edit mode opens unlocked.
    setIsEditLocked(false);
  }, [mode]);

  const enableEditing = useCallback(() => setIsEditLocked(false), []);
  const disableEditing = useCallback(() => setIsEditLocked(true), []);
  const toggleEditing = useCallback(() => {
    setIsEditLocked((prev) => !prev);
    if (store.getState().formData.originalBot) {
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
  }, [store, setFormData]);

  const isReadOnly = useMemo(
    () =>
      mode === 'settings-readonly' || (mode === 'edit' ? isEditLocked : false),
    [mode, isEditLocked]
  );

  const isComboBot = useMemo(() => botType === BotTypesEnum.combo, [botType]);

  // Subscribe ONLY to the risk-reward toggles that drive field locks. They
  // flip on discrete control changes (never on a numeric keystroke), so the
  // provider re-renders for them — but not for the hot typing path.
  const rrLocks = useStore(
    store,
    useShallow((s: BotFormStoreState) => ({
      dcaUseRiskReward: s.formData.dca.useRiskReward,
      dcaRiskUseTpRatio: s.formData.dca.riskUseTpRatio,
      comboUseRiskReward: s.formData.combo.useRiskReward,
      comboRiskUseTpRatio: s.formData.combo.riskUseTpRatio,
    }))
  );

  const lockedFields = useMemo(() => {
    const fields = new Set<Fields>();

    if (mode === 'edit') {
      fields.add('exchangeUUID');
      if (botType === BotTypesEnum.combo || botType === BotTypesEnum.dca) {
        fields.add('useMulti');
      }
    }

    if (isComboBot ? rrLocks.comboUseRiskReward : rrLocks.dcaUseRiskReward) {
      fields.add('useSl');
      fields.add('useDca');
      if (
        isComboBot ? rrLocks.comboRiskUseTpRatio : rrLocks.dcaRiskUseTpRatio
      ) {
        fields.add('useTp');
      }
    }

    return fields;
  }, [
    mode,
    botType,
    rrLocks.dcaUseRiskReward,
    rrLocks.dcaRiskUseTpRatio,
    rrLocks.comboUseRiskReward,
    rrLocks.comboRiskUseTpRatio,
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

  // The indicator-chart-context derivations (scaleAr/tpAr/slAr/…) and the
  // effect that pushed them into `indicatorStore` used to live here as
  // formData-dependent memos + a React effect. They now run inside the
  // store-subscription effect below (`pushIndicatorContext`), driven off
  // `store.getState()` so a keystroke never re-renders the provider to feed
  // the chart.
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
  }, [botType, isSkipExampleOrders, exampleOrdersStore]);

  // Example-orders settings feed. Was a formData-dependent React effect;
  // now a stable callback invoked (debounced) from the store subscription
  // below. The giant settings object is unchanged — a local `formData` alias
  // over `store.getState()` keeps every field reference identical.
  const pushExampleOrderSettings = useCallback(() => {
    if (isSkipExampleOrders) {
      return;
    }
    const formData = store.getState().formData;
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
  }, [store, exampleOrdersStore, isComboBot, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      botVars,
    });
  }, [botVars, isSkipExampleOrders, exampleOrdersStore]);

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

      // NOTE: no synchronous per-field error prune here. Deleting errors[field]
      // on edit while re-validation is debounced (~120ms) opened a window where
      // the form looked error-free (BotFormFooter gates submit on
      // Object.keys(errors).length) even though it wasn't. The debounced
      // wholesale validation now owns the errors object end-to-end: a stale
      // error lingering ≤120ms longer is harmless; a false "no errors" window
      // is not.
    },
    [botType, setFormData, setIsDirty, exampleOrdersStore]
  );

  // Hot validation. Was a formData-dependent React effect that unconditionally
  // called setAlerts each keystroke; now a stable callback driven (debounced)
  // from the store subscription, writing alerts/errors back to the store only
  // when they actually change. The validation body is unchanged — a local
  // `formData` alias over `store.getState()` keeps every reference identical.
  const runValidation = useCallback(() => {
    const formData = store.getState().formData;
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

    // Write alerts/errors back to the store, but ONLY when they actually
    // changed. This replaces both the old unconditional setAlerts and the
    // JSON.stringify errors guard, and keeps the store subscription from
    // looping (a no-op validation makes no write, so it fires no callback).
    const current = store.getState();
    // Cheap structural compares instead of 4× JSON.stringify per pass: errors
    // by key-count + per-key string equality, alerts by the same
    // variant/message/navId fingerprint scheme mergeBotFormAlerts uses.
    const alertsChanged = !botFormAlertsEqual(current.alerts, newAlerts);
    const errorsChanged = !botFormErrorsEqual(current.errors, newErrors);
    if (alertsChanged || errorsChanged) {
      store.setState({
        ...(alertsChanged ? { alerts: newAlerts } : {}),
        ...(errorsChanged ? { errors: newErrors } : {}),
      });
    }
  }, [store, mode, isComboBot]);

  // Recompute the chart-indicator context off the store and push it into
  // indicatorStore only when it changes. Replaces the old cluster of formData
  // memos + the effect that fed indicatorStore.setChartIndicatorsContext.
  // Signature of the last context actually pushed to indicatorStore, and the
  // (dca, combo) input references it was derived from. Both are reset to null at
  // the top of the subscription mount effect so a store recreation (isolateStores
  // flip → fresh indicatorStore) always re-seeds instead of short-circuiting on
  // a stale signature. See the effect below.
  const lastIndicatorSigRef = useRef<string | null>(null);
  const indicatorInputsRef = useRef<{
    dca: BotFormData['dca'];
    combo: BotFormData['combo'];
  } | null>(null);
  const pushIndicatorContext = useCallback(() => {
    const formData = store.getState().formData;
    const dca = formData.dca;
    const combo = formData.combo;
    // Early-bail before building the derived context. The output is a pure
    // function of (dca, combo, isComboBot); isComboBot is stable for the
    // provider's life. So if both slice references are unchanged, nothing this
    // reads changed — return immediately. This makes the hottest path (a
    // top-level keystroke like the bot name, which never re-clones dca/combo)
    // do near-zero work instead of rebuilding the nested filter + JSON sig.
    const prevInputs = indicatorInputsRef.current;
    if (prevInputs && prevInputs.dca === dca && prevInputs.combo === combo) {
      return;
    }
    indicatorInputsRef.current = { dca, combo };
    const scaleAr =
      (dca.dcaCondition === DCAConditionEnum.percentage || !dca.dcaCondition) &&
      [ScaleDcaTypeEnum.adr, ScaleDcaTypeEnum.atr].includes(
        dca.scaleDcaType ?? ScaleDcaTypeEnum.percentage
      ) &&
      dca.useDca;
    const tpAr =
      dca.dealCloseCondition === CloseConditionEnum.dynamicAr && dca.useTp;
    const slAr =
      dca.dealCloseConditionSL === CloseConditionEnum.dynamicAr && dca.useSl;
    const indicatorGroupsToUse = (
      (isComboBot ? combo.indicatorGroups : dca.indicatorGroups) ?? []
    )
      .filter((ig) => {
        const indicators = (
          (isComboBot ? combo.indicators : dca.indicators) ?? []
        ).filter((i) => i.groupId === ig.id);
        return indicators.length > 0;
      })
      .map((ig) => ig.id);
    const useCloseIndicators =
      (dca.dealCloseCondition === CloseConditionEnum.techInd &&
        (!dca.useRiskReward ||
          (dca.useRiskReward && !dca.riskUseTpRatio))) ||
      (dca.dealCloseConditionSL === CloseConditionEnum.techInd &&
        !dca.useRiskReward) ||
      tpAr ||
      slAr;
    const useStartDealIndicators =
      (isComboBot ? combo.startCondition : dca.startCondition) ===
      StartConditionEnum.ti;
    const useStartDCAIndicators =
      (dca.dcaCondition === DCAConditionEnum.indicators && dca.useDca) ||
      scaleAr;
    const useStartBotIndicators =
      dca.botActualStart === BotStartTypeEnum.indicators && dca.useBotController;
    const useStopBotIndicators =
      (isComboBot ? combo.botStart : dca.botStart) ===
        BotStartTypeEnum.indicators &&
      (isComboBot ? combo.useBotController : dca.useBotController);
    const useRiskRewardIndicators = dca.useRiskReward;
    const strategy = isComboBot ? combo.strategy : dca.strategy;

    const nextContext = {
      scaleAr,
      tpAr,
      slAr,
      strategy,
      indicatorGroupsToUse,
      useCloseIndicators,
      useStartDealIndicators,
      useStartDCAIndicators,
      useStopBotIndicators,
      useStartBotIndicators,
      useRiskRewardIndicators,
    };
    const sig = JSON.stringify(nextContext);
    if (sig !== lastIndicatorSigRef.current) {
      lastIndicatorSigRef.current = sig;
      indicatorStore.setChartIndicatorsContext(nextContext);
    }
  }, [store, indicatorStore, isComboBot]);

  // Single mount-time subscription that drives every formData-derived side
  // effect OUTSIDE React render, so a keystroke never re-renders the provider.
  //  - indicator chart context: recomputed immediately (guarded, idempotent).
  //  - example-orders settings feed: trailing 200ms debounce, maxWait 300ms.
  //  - hot validation: trailing 120ms debounce, maxWait 250ms; writes
  //    alerts/errors back to the store with an equality guard.
  //  - errors / userFee → example-orders: pushed when those slices change.
  // The maxWait ceiling stops a sustained write stream (holding a number
  // stepper writes faster than the trailing delay) from starving the trailing
  // edge for the whole hold. The timer/pendingSince refs live at component
  // scope (declared near the store) so the external setErrors/setAlerts path
  // can cancel a pending validation pass.
  useEffect(() => {
    // Fresh subscription: reset the indicator-context guards so a store
    // recreation (isolateStores flip → new indicatorStore) always re-seeds
    // rather than short-circuiting on a signature / input tuple left over from
    // the previous store instance.
    lastIndicatorSigRef.current = null;
    indicatorInputsRef.current = null;

    let prevFormData = store.getState().formData;
    let prevErrors = store.getState().errors;
    let prevUserFeeMaker = store.getState().formData.userFee?.makerCommission;

    const scheduleExample = () => {
      const now = Date.now();
      if (examplePendingSinceRef.current === null) {
        examplePendingSinceRef.current = now;
      }
      if (exampleTimerRef.current) {
        clearTimeout(exampleTimerRef.current);
      }
      // trailing 200ms, but never wait longer than 300ms since the burst began.
      const remainingMax = 300 - (now - examplePendingSinceRef.current);
      const delay = Math.max(0, Math.min(200, remainingMax));
      exampleTimerRef.current = setTimeout(() => {
        exampleTimerRef.current = null;
        examplePendingSinceRef.current = null;
        pushExampleOrderSettings();
      }, delay);
    };
    const scheduleValidation = () => {
      const now = Date.now();
      if (validationPendingSinceRef.current === null) {
        validationPendingSinceRef.current = now;
      }
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
      }
      // trailing 120ms, but never wait longer than 250ms since the burst began.
      const remainingMax = 250 - (now - validationPendingSinceRef.current);
      const delay = Math.max(0, Math.min(120, remainingMax));
      validationTimerRef.current = setTimeout(() => {
        validationTimerRef.current = null;
        validationPendingSinceRef.current = null;
        runValidation();
      }, delay);
    };

    const onChange = () => {
      const state = store.getState();
      if (state.formData !== prevFormData) {
        prevFormData = state.formData;
        // Chart indicator context — immediate (matches the old effect timing).
        pushIndicatorContext();
        // userFee → example-orders — immediate on change.
        const maker = state.formData.userFee?.makerCommission;
        if (maker !== prevUserFeeMaker) {
          prevUserFeeMaker = maker;
          if (!isSkipExampleOrders) {
            exampleOrdersStore.setContext({ userFee: maker });
          }
        }
        // Example-orders settings — debounced.
        if (!isSkipExampleOrders) {
          scheduleExample();
        }
        // Validation — debounced.
        scheduleValidation();
      }
      if (state.errors !== prevErrors) {
        prevErrors = state.errors;
        if (!isSkipExampleOrders) {
          exampleOrdersStore.setContext({ errors: state.errors });
        }
      }
    };

    const unsubscribe = store.subscribe(onChange);

    // Seed on mount, mirroring the effects that fired on first render.
    pushIndicatorContext();
    if (!isSkipExampleOrders) {
      pushExampleOrderSettings();
      exampleOrdersStore.setContext({ errors: store.getState().errors });
      exampleOrdersStore.setContext({
        userFee: store.getState().formData.userFee?.makerCommission,
      });
    }
    runValidation();

    return () => {
      if (exampleTimerRef.current) {
        clearTimeout(exampleTimerRef.current);
        exampleTimerRef.current = null;
      }
      examplePendingSinceRef.current = null;
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
        validationTimerRef.current = null;
      }
      validationPendingSinceRef.current = null;
      unsubscribe();
    };
  }, [
    store,
    exampleOrdersStore,
    isSkipExampleOrders,
    pushIndicatorContext,
    pushExampleOrderSettings,
    runValidation,
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
        }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

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

  // Component error registration. componentErrors lives in the store (it feeds
  // the merged-alerts pipeline computed by the consumer hooks). Registration is
  // rare (a component mounting/unmounting an error), never per keystroke.
  const registerComponentError = useCallback(
    (field: string, alert: import('@/types/bots/form').BotFormAlert | null) => {
      store.setState((prevState) => {
        const prev = prevState.componentErrors;
        if (!alert) {
          const next = { ...prev } as Record<
            string,
            (typeof prev)[keyof typeof prev]
          >;
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[field];
          return { componentErrors: next as typeof prev };
        }
        return {
          componentErrors: {
            ...prev,
            [field]: [alert],
          } as typeof prev,
        };
      });
    },
    [store]
  );

  // The context carries only the STABLE store reference + stable callbacks +
  // rarely-changing flags. The four hot fields (formData/errors/alerts/isDirty)
  // are NOT here — consumers read them from the store. As a result this value's
  // identity does not change on a keystroke, so nothing subscribed to it (via
  // useBotFormSelector's context read) re-renders while typing.
  const value = useMemo<BotFormInternalContextValue>(
    () => ({
      store,
      mode,
      activeTab,
      setActiveTab,
      isLoading,
      setIsLoading,
      setErrors,
      setAlerts,
      setIsDirty,
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
      store,
      mode,
      activeTab,
      setActiveTab,
      isLoading,
      setIsLoading,
      setErrors,
      setAlerts,
      setIsDirty,
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
      setBotVars,
      setFormData,
      resetFormData,
      registerComponentError,
      quickSetupMode,
      setQuickSetupMode,
      selectedPreset,
      setSelectedPreset,
      activeChartPair,
      setActiveChartPair,
      isNestedLeg,
    ]
  );

  return (
    <ExampleOrdersStoreContext.Provider value={exampleOrdersStore}>
      <IndicatorStoreContext.Provider value={indicatorStore}>
        <BotFormStateContext.Provider value={value}>
          {children}
        </BotFormStateContext.Provider>
      </IndicatorStoreContext.Provider>
    </ExampleOrdersStoreContext.Provider>
  );
};

/**
 * Stitch the stable internal context (store ref + callbacks + rare flags) back
 * together with the hot store state into the PUBLIC `BotFormStateContextValue`
 * shape. Subscribes to the WHOLE store, so consumers of `useBotFormState` /
 * `useOptionalBotFormState` re-render on any hot change — identical broad
 * re-render behavior to the pre-refactor context. (Narrow subscriptions are
 * `useBotFormSelector`'s job.)
 */
const useMergedBotFormState = (
  context: BotFormInternalContextValue | undefined
): BotFormStateContextValue | undefined => {
  // Always subscribe to a store (fallback keeps hook order stable when the
  // hook is used outside a provider via useOptionalBotFormState).
  const store = context?.store ?? EMPTY_BOT_FORM_STORE;
  const state = useStore(store);

  // Merge in its OWN memo keyed on just [alerts, componentErrors] — both are
  // reference-stable across formData-only writes (a keystroke never touches
  // them), so the merged alerts keep their identity while typing instead of
  // being rebuilt every keystroke (as they were when this was folded into a
  // memo keyed on the whole store snapshot).
  const mergedAlerts = useMemo(
    () => mergeBotFormAlerts(state.alerts, state.componentErrors),
    [state.alerts, state.componentErrors]
  );

  return useMemo(() => {
    if (!context) {
      return undefined;
    }
    const { store: _store, ...rest } = context;
    return {
      ...rest,
      formData: state.formData,
      errors: state.errors,
      alerts: mergedAlerts,
      isDirty: state.isDirty,
    };
  }, [context, state.formData, state.errors, mergedAlerts, state.isDirty]);
};

/**
 * TRANSITIONAL BROAD subscription. Returns the full legacy
 * `BotFormStateContextValue` and re-renders the caller on EVERY hot store write
 * (every keystroke), because it subscribes to the whole store via `useStore`.
 * It exists to keep pre-refactor consumers working unchanged. New code that
 * reads one field should use `useBotFormSelector` (narrow, per-slice
 * subscription) instead of this.
 */
export const useBotFormState = (): BotFormStateContextValue => {
  const context = useContext(BotFormStateContext);
  const merged = useMergedBotFormState(context);

  if (!merged) {
    throw new Error('useBotFormState must be used within a BotFormProvider');
  }

  return merged;
};

/**
 * TRANSITIONAL BROAD subscription — the provider-optional variant of
 * `useBotFormState` (returns `undefined` outside a `BotFormProvider`). Same
 * caveat: it re-renders on every hot store write. Prefer `useBotFormSelector`
 * for new code that only needs a single field.
 */
export const useOptionalBotFormState = ():
  | BotFormStateContextValue
  | undefined => {
  const context = useContext(BotFormStateContext);
  return useMergedBotFormState(context);
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
 * Select a single property from the current bot type's settings. Backed by
 * `useStore(store, selector)`, so a consumer re-renders ONLY when the selected
 * slice changes (Object.is) — NOT on unrelated field edits. For unchanged
 * fields the store preserves the reference (dca/combo/grid are spread-cloned
 * per edit but their untouched leaf values keep identity), so Object.is is the
 * correct, stable equality here.
 *
 * Public signature and semantics are unchanged from the previous context-based
 * implementation.
 *
 * The `defaultValue` is PINNED on first use (a `useRef` captures the first value
 * passed) and reused on every subsequent render where the selected field is
 * undefined. Callers routinely pass a fresh literal each render (e.g.
 * `useBotFormSelector('indicators', [])`); returning that fresh literal would
 * hand consumers a new reference on every render and defeat memoization. Pinning
 * restores the stable-reference semantics the old `useMemo`-cached default had.
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
  const context = useContext(BotFormStateContext);
  // Keep hook order stable even outside a provider; throw AFTER the hook call.
  const store = context?.store ?? EMPTY_BOT_FORM_STORE;

  // Pin the default to its first-seen value so an undefined field always yields
  // a reference-stable fallback, regardless of the caller passing a fresh
  // literal each render.
  const pinnedDefaultRef = useRef<V | undefined>(undefined);
  const pinnedDefaultSetRef = useRef(false);
  if (!pinnedDefaultSetRef.current) {
    pinnedDefaultSetRef.current = true;
    pinnedDefaultRef.current = defaultValue;
  }

  const selected = useStore(store, (s): V => {
    const fallback = pinnedDefaultRef.current;
    const formData = s.formData;
    switch (formData.type) {
      case BotTypesEnum.dca:
        return (formData.dca[key as keyof BotFormData['dca']] ??
          fallback) as V;
      case BotTypesEnum.combo:
        return (formData.combo[key as keyof BotFormData['combo']] ??
          fallback) as V;
      case BotTypesEnum.grid:
        return (formData.grid[key as keyof BotFormData['grid']] ??
          fallback) as V;
      default:
        return (formData.dca[key as keyof BotFormData['dca']] ??
          fallback) as V;
    }
  });

  if (!context) {
    throw new Error('useBotFormState must be used within a BotFormProvider');
  }

  return selected;
};

/**
 * Stable dispatch/action callbacks + rarely-changing flags from the bot form
 * context, read WITHOUT subscribing to the hot store. A component that only
 * DISPATCHES (updateFormData/setFormData/setBotVars/registerComponentError/…)
 * should read from here instead of `useBotFormState()` so it does NOT re-render
 * on every keystroke — the context identity is stable across keystrokes, so a
 * consumer re-renders only on a rare context change (tab switch, botVars edit),
 * never per keystroke. Every returned callback is itself referentially stable.
 */
export const useBotFormActions = () => {
  const context = useContext(BotFormStateContext);
  if (!context) {
    throw new Error('useBotFormActions must be used within a BotFormProvider');
  }
  const {
    updateFormData,
    setFormData,
    setBotVars,
    setErrors,
    setAlerts,
    setIsDirty,
    setIsLoading,
    setActiveTab,
    registerComponentError,
    resetFormData,
    enableEditing,
    disableEditing,
    toggleEditing,
    isFieldLocked,
    setQuickSetupMode,
    setSelectedPreset,
    setActiveChartPair,
  } = context;
  // Memoize on the (stable) callbacks so the returned object keeps identity even
  // across the rare context changes that don't touch a callback (e.g. botVars).
  return useMemo(
    () => ({
      updateFormData,
      setFormData,
      setBotVars,
      setErrors,
      setAlerts,
      setIsDirty,
      setIsLoading,
      setActiveTab,
      registerComponentError,
      resetFormData,
      enableEditing,
      disableEditing,
      toggleEditing,
      isFieldLocked,
      setQuickSetupMode,
      setSelectedPreset,
      setActiveChartPair,
    }),
    [
      updateFormData,
      setFormData,
      setBotVars,
      setErrors,
      setAlerts,
      setIsDirty,
      setIsLoading,
      setActiveTab,
      registerComponentError,
      resetFormData,
      enableEditing,
      disableEditing,
      toggleEditing,
      isFieldLocked,
      setQuickSetupMode,
      setSelectedPreset,
      setActiveChartPair,
    ]
  );
};

/**
 * Read the bot form `mode` without subscribing to the hot store. `mode` is a
 * provider prop and never changes for a given form, so this is maximally cheap.
 */
export const useBotFormMode = (): BotFormMode => {
  const context = useContext(BotFormStateContext);
  if (!context) {
    throw new Error('useBotFormMode must be used within a BotFormProvider');
  }
  return context.mode;
};

/**
 * Read whether this provider is one leg of a hedge bot, without subscribing to
 * the hot store. `isNestedLeg` is a provider prop and never changes for a given
 * form.
 */
export const useBotFormIsNestedLeg = (): boolean => {
  const context = useContext(BotFormStateContext);
  if (!context) {
    throw new Error(
      'useBotFormIsNestedLeg must be used within a BotFormProvider'
    );
  }
  return context.isNestedLeg;
};

/**
 * Read `botVars` (global-variable bindings) without subscribing to the hot
 * store. `botVars` is ordinary React state on the provider that changes only on
 * an explicit variable edit, never on a keystroke.
 */
export const useBotFormBotVars = (): BotVars | null => {
  const context = useContext(BotFormStateContext);
  if (!context) {
    throw new Error('useBotFormBotVars must be used within a BotFormProvider');
  }
  return context.botVars;
};

/**
 * Narrow subscription to the form `errors` object. `errors` is rewritten only
 * by the DEBOUNCED validation pass (~120ms), not by the synchronous keystroke,
 * so subscribing here does NOT re-render the consumer on each keystroke — unlike
 * the broad `useBotFormState()`. Prefer this in sections that render error
 * state but otherwise read fields via `useBotFormSelector`.
 */
export const useBotFormErrors = (): BotFormErrors => {
  const context = useContext(BotFormStateContext);
  const store = context?.store ?? EMPTY_BOT_FORM_STORE;
  const errors = useStore(store, (s) => s.errors);
  if (!context) {
    throw new Error('useBotFormErrors must be used within a BotFormProvider');
  }
  return errors;
};

/**
 * Narrow subscription to the MERGED form alerts (hot-validation `alerts` +
 * imperatively-registered `componentErrors`). Both slices change only on the
 * debounced validation pass / a component (un)mounting an error — never on the
 * synchronous keystroke — so this does NOT re-render the consumer per keystroke
 * (unlike the broad `useBotFormState()`). Merged identity is kept stable across
 * keystrokes via its own memo.
 */
export const useBotFormAlerts = (): BotFormAlerts => {
  const context = useContext(BotFormStateContext);
  const store = context?.store ?? EMPTY_BOT_FORM_STORE;
  const alerts = useStore(store, (s) => s.alerts);
  const componentErrors = useStore(store, (s) => s.componentErrors);
  const merged = useMemo(
    () => mergeBotFormAlerts(alerts, componentErrors),
    [alerts, componentErrors]
  );
  if (!context) {
    throw new Error('useBotFormAlerts must be used within a BotFormProvider');
  }
  return merged;
};

/**
 * Narrow read of a TOP-LEVEL bot-form field — the ones stored on `formData`
 * directly (`pair`, `pairMetadata`, `exchangeUUID`, `userFee`, `terminal`,
 * `name`, `favoriteIndicators`, …) rather than inside the dca/combo/grid
 * settings sub-object. `useBotFormSelector` reaches ONLY the nested settings;
 * this is its top-level sibling. Subscribes to just that one field so the
 * consumer re-renders only when it changes (Object.is) — top-level fields are
 * stable across a numeric keystroke into a settings field.
 */
export const useBotFormTopLevelSelector = <
  K extends keyof BotFormData,
  V = BotFormData[K],
>(
  key: K
): V => {
  const context = useContext(BotFormStateContext);
  const store = context?.store ?? EMPTY_BOT_FORM_STORE;
  const selected = useStore(store, (s): V => s.formData[key] as unknown as V);
  if (!context) {
    throw new Error(
      'useBotFormTopLevelSelector must be used within a BotFormProvider'
    );
  }
  return selected;
};
