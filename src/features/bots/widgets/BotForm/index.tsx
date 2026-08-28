import { motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  ChevronDown,
  Copy,
  LineChart,
  Loader2,
  Lock,
  /*  Merge, */
  MinusCircle,
  RotateCcw,
  Share2,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { mapWidgetMenuItemsToPanelMenu } from '@/components/bots/panels/menuUtils';
import { Celebration } from '@/components/onboarding/Celebration';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
// Dialog and input/label components are not used here; render logic moved to footer menu
import { Button } from '@/components/ui/button';
import {
  ScrollableFormTabNavigation,
  type ScrollableTabItem,
} from '@/components/ui/ScrollableFormTabNavigation';
import { SectionHeader } from '@/features/bots/shared/components/SectionHeader';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import WidgetWrapper, {
  type WidgetMenuActionItem,
} from '@/components/widgets/WidgetWrapper';
import {
  createDefaultFormState,
  useBotFormEditing,
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
  type BotFormTabId,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useLiveUpdate } from '@/contexts/LiveUpdateContext';
import { ShareBotDialog } from '@/features/bots/bot-types/dca/form/dialogs/ShareBotDialog';
/* import { SmartOrderMergeDialog } from '@/features/bots/bot-types/dca/form/dialogs/SmartOrderMergeDialog'; */
import { dcaTabDescriptors } from '@/features/bots/bot-types/dca/form/tabs';
import { gridTabDescriptors } from '@/features/bots/bot-types/grid/form/tabs';
/* import { validateHedgeFormData } from '@/features/bots/bot-types/hedge/form/validation'; */
/* import {
  HEDGE_BOT_TYPE_ID,
  HEDGE_COMBO_BOT_TYPE_ID,
  HEDGE_DCA_BOT_TYPE_ID,
} from '@/features/bots/modules/hedgeModule'; */
import SettingsAlert from '@/components/ui/SettingsAlert';
import { BotPlacementProgress } from '@/features/bots/widgets/BotForm/BotPlacementProgress';
import { useGridBotsStore } from '@/stores/live/gridBotsStore';
import { GRID_BOT_TYPE_ID } from '@/features/bots/registry/entries/grid';
import {
  AddFundsDialog,
  ReduceFundsDialog,
} from '@/features/bots/shared/runtime/dialogs';
import {
  useBotFormMutations,
  type RefreshBalancesResult,
} from '@/hooks/bots/base/useBotFormMutations';
import { useFormHandlers } from '@/hooks/bots/dca/useFormHandlers';
import {
  useBotFormInitialization,
  type BotSettingsMapper,
} from '@/hooks/bots/forms/useBotFormInitialization';
import {
  useExchangeMinimumBump,
  type ExchangeMinimumBumpEvent,
} from '@/hooks/bots/forms/useExchangeMinimumBump';
import { useBacktestPersistence } from '@/hooks/useBacktestPersistence';
import { extractPairAssets, normalizePairKey } from '@/utils/pairs';
import { useBotArchive } from '@/hooks/useBotMutations';
import { useBotTemplateShortcuts } from '@/hooks/useBotTemplatesSync';
import { getLocalPrices } from '@/helper/price';
import GridBacktestingEngine from '@/lib/backtester/gridWrapper';
import DCABacktesting from '@/lib/backtester/wrapper';
import logger from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  mapFormDataToPayload,
  type MapFormDataToPayloadOptions,
  type MapFormDataToPayloadResult,
  type MapGridFormDataToPayloadResult,
  type UpdateDCABotPayload,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  mapGridBotSettingsToFormData,
  type MapGridBotSettingsOptions,
} from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import { mapGridFormDataToPayload } from '@/mappers/bots/grid/map-grid-form-data-to-payload';
import { useBacktestPeriodStore } from '@/stores/backtestPeriodStore';
import {
  useBotTemplatesStore,
  type BotTemplate,
} from '@/stores/botTemplatesStore';
import {
  BotStartTypeEnum,
  BotTypesEnum,
  CloseConditionEnum,
  DCAOrderTypeEnum,
  ExchangeEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorSection,
  IndicatorsLogicEnum,
  InitialPriceFromEnum,
  StartConditionEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  type BacktestingSettings,
  type BacktestProgress,
  type BotChartData,
  type BotVars,
  type DCABacktestingInput,
  type DCABacktestingResult,
  type DCABot,
  type DCABotSettings,
  type ExchangeInUser,
  type GRIDBacktestingInput,
  type GRIDBacktestingResultHistory,
  type GridBacktestingResult,
  type Settings,
  type SettingsIndicatorGroup,
  type SettingsIndicators,
  type Symbols,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { ComboBot } from '@/types/comboBot';
import type { GridBot } from '@/types/gridBot';
import { useExampleOrdersStore } from '@/contexts/bots/form/formStoreContexts';
import type { ExampleOrdersStoreContext } from '@/utils/bots/dca/example-orders-core';
import { validateDcaFormData } from '@/utils/bots/dca/validation';
import { validateGridFormData } from '@/utils/bots/grid/validation';
import { buildBotCloneRoute, buildBotEditRoute } from '@/utils/bots/navigation';
import { isFuturesExchange } from '@/utils/exchangeUtils';
import { COMBO_BOT_TYPE_ID } from '../../registry';
import BacktestSettingsDialog, {
  type BacktestConfig,
} from './components/BacktestSettingsDialog';
import {
  BacktestResultsFullModal,
  buildBacktestViewModel,
  type BacktestViewModelMeta,
} from '@/components/widgets/bots/backtest/redesign';
import { BotFormAlertButton } from './components/BotFormAlertButton';
import { DraftRestoredNotice } from './components/DraftRestoredNotice';
import {
  BotFormFooter,
  type ToggleStatusPayload,
} from './components/BotFormFooter';
import { BotSettingsImportExportDialog } from './components/BotSettingsImportExportDialog';
import { QuickBotForm } from './QuickBotForm';
import { QuickGridBotForm } from './QuickGridBotForm';
import { QuickModeToggle } from './components/QuickModeToggle';
import {
  AllStrategiesPanelContext,
  type AllStrategiesPanelContextValue,
  type AllStrategiesPanelState,
} from './components/allStrategiesPanelContext';
import { Slot } from '@/lib/extensions';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useBotFormRegistryContext } from './context';
import type { BotSettingsMapperContext } from './hooks/useBotFormInitialization';
/* import { useBotSmartOrders } from './hooks/useBotSmartOrders';
import { useMergeSmartOrders } from './hooks/useMergeSmartOrders'; */
import { useBotFormQuery } from './providers/BotFormQueryProvider';
import type {
  BotFormProps,
  BotFormTabComponentProps,
  BotFormTabDescriptor,
  GetBalanceFn,
} from './types';

export const NEW_SHELL_DEBUG_FLAG = 'VITE_BOT_FORM_DEBUG';

const createWidgetMetadata = (widgetId: string) => ({
  id: widgetId,
  type: 'bot-form' as const,
  category: 'Management',
  defaultSize: { w: 4, h: 8 },
  minSize: { w: 4, h: 6 },
  maxSize: { w: 6, h: 12 },
  hasOptions: true,
});

const resolveWidgetValue = (
  mode: BotFormMode,
  formData: Pick<BotFormData, 'name' | 'pair'>,
  bot: { settings?: unknown; status?: string } | null
) => {
  if (mode === 'create') {
    return {
      primary: formData.name || 'New Bot',
      secondary:
        formData.pair?.[0] ||
        (Array.isArray(formData.pair) && formData.pair.length > 0
          ? formData.pair[0]
          : 'Configure pair'),
    };
  }

  const botName = (bot?.settings as { name?: string } | undefined)?.name;
  const botPairs = (bot?.settings as { pair?: string | string[] } | undefined)
    ?.pair;
  const pairLabel = Array.isArray(botPairs)
    ? botPairs[0]
    : typeof botPairs === 'string'
      ? botPairs
      : 'No pair';

  return {
    primary: botName || 'Unnamed Bot',
    secondary: `${bot?.status || 'Unknown'} - ${pairLabel}`,
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A fresh local backtest result captured for the redesigned results modal.
 * `strategy` tells the modal which view to render (DCA / Combo / Grid). The
 * `summary` powers the footer "VIEW RESULTS" chip without re-deriving it.
 */
interface BacktestResultCapture {
  result:
    | DCABacktestingResult
    | GRIDBacktestingResultHistory;
  strategy: string;
  settings: DCABotSettings;
  meta: BacktestViewModelMeta;
  summary: { netPerc: number; winRate: number; deals: number };
}

const isGridBotEntity = (
  value: DCABot | GridBot | ComboBot | null
): value is GridBot => Boolean(value && 'levels' in value);

const isDcaBotEntity = (
  value: DCABot | GridBot | ComboBot | null
): value is DCABot => Boolean(value && 'usage' in value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const stringifyInitialPrice = (value: unknown): string | undefined => {
  if (isFiniteNumber(value)) {
    return value.toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
};

const pickInitialPriceFrom = (
  source: unknown
): InitialPriceFromEnum | undefined => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const from = (source as { initialPriceFrom?: unknown }).initialPriceFrom;

  if (typeof from === 'string' && from.trim()) {
    return from.trim() as InitialPriceFromEnum;
  }

  return undefined;
};

type ComparableField = Fields;

const TRACKED_FIELDS: Array<Fields> = [
  'name',
  'pair',
  'topPrice',
  'lowPrice',
  'budget',
  'ordersInAdvance',
  'useOrderInAdvance',
  'gridStep',
  'levels',
  'sellDisplacement',
  'gridType',
  'profitCurrency',
  'orderFixedIn',
  'tpSl',
  'tpSlLimit',
  'sl',
  'slLimit',
  'tpSlCondition',
  'slCondition',
  'tpSlAction',
  'slAction',
  'useStartPrice',
  'startPrice',
  'tpTopPrice',
  'slLowPrice',
  'leverage',
  'prioritize',
  'futures',
  'coinm',
  'marginType',
];

const NUMERIC_FIELDS = new Set<ComparableField>([
  'topPrice',
  'lowPrice',
  'budget',
  'ordersInAdvance',
  'gridStep',
  'sellDisplacement',
  'startPrice',
  'levels',
  'leverage',
  'tpTopPrice',
  'slLowPrice',
  'initialPrice',
]);

const BOOLEAN_FIELDS = new Set<ComparableField>([
  'useOrderInAdvance',
  'tpSl',
  'tpSlLimit',
  'sl',
  'slLimit',
  'useStartPrice',
  'futures',
  'coinm',
]);

const ARRAY_FIELDS = new Set<ComparableField>(['pair']);

const normalizeValue = (field: ComparableField, value: unknown): unknown => {
  if (NUMERIC_FIELDS.has(field)) {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (BOOLEAN_FIELDS.has(field)) {
    return Boolean(value);
  }

  if (ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return [...value].map(String).sort().join('|');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return value ?? undefined;
};

interface GridSnapshot {
  values: Record<string, unknown>;
  initialPrice: number | undefined;
}

const createSnapshot = (data: BotFormData): GridSnapshot => {
  const values: Record<string, unknown> = {};
  for (const field of TRACKED_FIELDS) {
    values[field] = normalizeValue(
      field,
      field in data
        ? data[field as keyof BotFormData]
        : field in data['dca']
          ? data['dca'][field as keyof BotFormData['dca']]
          : field in data['combo']
            ? data['combo'][field as keyof BotFormData['combo']]
            : field in data['grid']
              ? data['grid'][field as keyof BotFormData['grid']]
              : undefined
    );
  }

  const initialPrice = normalizeValue('initialPrice', data.initialPrice) as
    | number
    | undefined;

  return {
    values,
    initialPrice,
  };
};

const evaluateAskToReset = (
  snapshot: GridSnapshot,
  current: BotFormData
): {
  askToReset: boolean;
  changedFields: string[];
  initialPriceChanged: boolean;
} => {
  const changedFields = TRACKED_FIELDS.filter((field) => {
    const baseline = snapshot.values[field];
    const nextValue = normalizeValue(
      field,
      field in current
        ? current[field as keyof BotFormData]
        : field in current['dca']
          ? current['dca'][field as keyof BotFormData['dca']]
          : field in current['combo']
            ? current['combo'][field as keyof BotFormData['combo']]
            : field in current['grid']
              ? current['grid'][field as keyof BotFormData['grid']]
              : undefined
    );
    return baseline !== nextValue;
  });

  const currentInitialPrice = normalizeValue(
    'initialPrice',
    current.initialPrice
  ) as number | undefined;
  const initialPriceChanged = snapshot.initialPrice !== currentInitialPrice;

  let askToReset = changedFields.length > 0;

  if (changedFields.length === 1 && changedFields[0] === 'name') {
    askToReset = false;
  }

  if (initialPriceChanged && (changedFields.length === 0 || !askToReset)) {
    askToReset = false;
  }

  return {
    askToReset,
    changedFields,
    initialPriceChanged,
  };
};

const BotForm: React.FC<BotFormProps> = ({
  widgetId = 'bot-form',
  isEditable = true,
  mode: propMode,
  botId: _botId,
  defaultTab,
  onCollapse,
  onTabMove,
  menuActions,
  data,
  settings: _settings,
  onSubmitSuccess: _onSubmitSuccess,
  debug: debugProp,
  variant = 'widget',
  hideSectionNavigation = false,
  forceSubmitDisabled = false,
  hideFooter = false,
  footerOverride,
  initialBot,
  onPanelMenuChange,
  onFormDataChange,
  tabDescriptorsFilter,
  onBacktestComplete,
}) => {
  // Active example-orders store — the shared global for regular bots, or this
  // form's isolated instance when rendered inside an isolateStores
  // BotFormProvider (hedge leg).
  const exampleOrdersStore = useExampleOrdersStore();
  // Register template shortcuts and remove stale ones
  useBotTemplateShortcuts();
  const dataMode = data?.['mode'] as BotFormMode | undefined;
  const mode: BotFormMode = propMode ?? dataMode ?? 'edit';

  const debugEnabled =
    debugProp ?? import.meta.env[NEW_SHELL_DEBUG_FLAG] === 'true';

  const { botExperience } = useBotFormRegistryContext();
  const experienceAdapters = botExperience.adapters;
  const experienceFormContract = botExperience.form;

  const resolvedWidgetId = widgetId ?? 'bot-form';
  const isGridBot = useMemo(
    () => botExperience.id === GRID_BOT_TYPE_ID,
    [botExperience.id]
  );
  const isComboBot = useMemo(
    () => botExperience.id === COMBO_BOT_TYPE_ID,
    [botExperience.id]
  );

  /*  const isHedgeBot = useMemo(() => {
    switch (botExperience.id) {
      case HEDGE_BOT_TYPE_ID:
      case HEDGE_DCA_BOT_TYPE_ID:
      case HEDGE_COMBO_BOT_TYPE_ID:
        return true;
      default:
        return false;
    }
  }, [botExperience.id]); */

  const useRiskReward = useBotFormSelector('useRiskReward');

  const { balanceSelectors } = useLiveUpdate();
  const { getBalance } = balanceSelectors;
  const { persistBacktestResult, persistGridBacktestResult } =
    useBacktestPersistence();
  const getPeriod = useBacktestPeriodStore((state) => state.getPeriod);

  const {
    activeTab,
    setActiveTab,
    isLoading,
    errors,
    setErrors,
    setAlerts,
    isDirty,
    setIsDirty,
    formData,
    setFormData,
    isFieldLocked,
    features,
    updateFormData,
    quickSetupMode,
    setQuickSetupMode,
    isNestedLeg,
    activeChartPair,
    draftRestoredAt,
    dismissDraftNotice,
    discardDraft,
    clearDraft,
  } = useBotFormState();
  const { isReadOnly } = useBotFormEditing();

  const {
    bot: queryBot,
    botSettings,
    exchanges,
    exchangesLoading,
    refetchExchanges,
    currentExchange,
    pairMetadata,
    balances: queryBalances,
  } = useBotFormQuery();
  // Prefer a caller-supplied bot (e.g. hedge legs which can't be fetched
  // via the standard botId-based query) over the query result.
  const bot = initialBot ?? queryBot;

  const navigate = useNavigate();
  const archiveMutation = useBotArchive();

  const [showImportExportDialog, setShowImportExportDialog] = useState(false);
  // Template creation/edit state moved to footer templates menu component
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBacktestDialog, setShowBacktestDialog] = useState(false);
  const [backtestProgress, setBacktestProgress] =
    useState<BacktestProgress | null>(null);
  // Redesigned backtest results: the fresh in-memory result is captured the
  // moment a local run completes (the deals/portfolio/transaction arrays are
  // discarded after persistence, so this is the only place to capture them).
  // The footer's "VIEW RESULTS" chip and the full-screen modal both render
  // against it. Works for any bot type — `strategy` drives how the modal
  // renders (DCA / Combo / Grid). Reset to null at the start of every run so
  // it never shows stale data.
  const [backtestResult, setBacktestResult] =
    useState<BacktestResultCapture | null>(null);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);

  // Footer summary chip (net %, win %, deals) — derived from the captured
  // result. Grid has no deals/win-rate, so those read 0 there (acceptable).
  const backtestSummary = useMemo(
    () =>
      backtestResult
        ? {
            netPerc: backtestResult.summary.netPerc,
            winRate: backtestResult.summary.winRate,
            deals: backtestResult.summary.deals,
          }
        : null,
    [backtestResult]
  );
  const backtesterInstanceRef = useRef<DCABacktesting | null>(null);
  const gridBacktesterInstanceRef = useRef<GridBacktestingEngine | null>(null);
  const cancelLocalBacktest = useCallback(() => {
    logger.info('[backtester] Cancel local backtest requested', {
      hasInstance:
        !!backtesterInstanceRef.current || !!gridBacktesterInstanceRef.current,
    });
    try {
      if (backtesterInstanceRef.current?.stopBacktest) {
        logger.info('[backtester] Calling stopBacktest on DCA instance');
        backtesterInstanceRef.current.stopBacktest();
      } else if (backtesterInstanceRef.current?.stop) {
        logger.info('[backtester] Setting stop flag on DCA instance');
        backtesterInstanceRef.current.stop = true;
      }
      if (gridBacktesterInstanceRef.current?.stopBacktest) {
        logger.info('[backtester] Calling stopBacktest on Grid instance');
        gridBacktesterInstanceRef.current.stopBacktest();
      } else if (gridBacktesterInstanceRef.current?.stop) {
        logger.info('[backtester] Setting stop flag on Grid instance');
        gridBacktesterInstanceRef.current.stop = true;
      }
    } catch (e) {
      logger.warn('[backtester] error invoking stop', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
    setBacktestProgress(null);
    logger.info('[backtester] Cancel local backtest completed');
  }, [backtesterInstanceRef, gridBacktesterInstanceRef]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [createdBotId, setCreatedBotId] = useState<string | undefined>();

  const validationKeysRef = useRef<Set<string>>(new Set());

  const exchangeUUIDForMutations = useMemo(() => {
    if (bot?.exchangeUUID) {
      return bot.exchangeUUID;
    }

    const exchangeValue =
      typeof formData.exchangeUUID === 'string' &&
      formData.exchangeUUID.trim().length > 0
        ? formData.exchangeUUID
        : undefined;

    return exchangeValue;
  }, [bot?.exchangeUUID, formData.exchangeUUID]);

  const {
    updateMutation,
    statusToggleMutation,
    createMutationAdapter,
    getBalances,
    updateBalances,
  } = useBotFormMutations({
    mode,
    ...(exchangeUUIDForMutations
      ? { exchangeUUID: exchangeUUIDForMutations }
      : {}),
    debug: debugEnabled,
    botType: formData.type,
  });

  // The exchange whose balances the form should hydrate. In edit mode the
  // exchange is locked to the persisted bot. In create/clone mode the user's
  // live selection (`formData.exchangeUUID`) is authoritative — a bot cloned
  // from a source on another exchange must NOT keep reading the source's
  // balances, which left the base order showing $0 for the picked exchange.
  const effectiveBalanceExchangeUUID = useMemo(() => {
    const formExchangeUUID =
      typeof formData.exchangeUUID === 'string' &&
      formData.exchangeUUID.trim().length > 0
        ? formData.exchangeUUID.trim()
        : undefined;

    return mode === 'edit'
      ? (bot?.exchangeUUID ?? formExchangeUUID)
      : (formExchangeUUID ?? bot?.exchangeUUID);
  }, [mode, bot?.exchangeUUID, formData.exchangeUUID]);

  useEffect(() => {
    // Load balances for the currently-selected exchange. A clone seeds a
    // non-null `bot` while in create mode, so we must NOT early-out on
    // `bot?._id` here (that skipped balance loading entirely and left the
    // base-order balance stuck at $0). `isLoading` already defaults to false
    // in create mode, so nothing else needs clearing.
    if (effectiveBalanceExchangeUUID) {
      getBalances(effectiveBalanceExchangeUUID).catch((error: unknown) => {
        console.error('❌ [BotFormShell] Failed to load balances', error);
      });
      return;
    }

    // No specific exchange yet (fresh create before a pick) — fetch all.
    if (!bot?._id) {
      getBalances(undefined, true).catch((error: unknown) => {
        console.error('❌ [BotFormShell] Failed to load balances', error);
      });
    }
  }, [effectiveBalanceExchangeUUID, bot?._id, getBalances]);

  const handleUpdateBalances =
    useCallback(async (): Promise<RefreshBalancesResult> => {
      // Refresh the exchange the user is actually configuring — in clone mode
      // that's the picked exchange, not the source bot's (which made the
      // "Update balance" button refresh the wrong account and stay at $0).
      const targetExchangeUUID = effectiveBalanceExchangeUUID;

      if (!targetExchangeUUID) {
        if (debugEnabled) {
          console.warn(
            '⚠️ [BotFormShell] No exchange UUID available for balance update'
          );
        }
        return {
          status: 'skipped',
          reason: 'No exchange selected',
        };
      }

      const outcome = await updateBalances(targetExchangeUUID);

      if (outcome.status === 'ok') {
        const message = outcome.message?.trim().length
          ? outcome.message
          : 'Balances refreshed successfully.';
        toast.success(message);
      } else if (outcome.status === 'error') {
        const reason = outcome.reason?.trim().length
          ? outcome.reason
          : 'Failed to refresh balances.';
        toast.error(`Failed to refresh balances: ${reason}`);
      } else if (outcome.status === 'skipped' && outcome.reason) {
        toast.warning(outcome.reason);
      }
      return outcome;
    }, [effectiveBalanceExchangeUUID, debugEnabled, updateBalances]);

  const handleCreateSuccess = useCallback(
    (created: unknown) => {
      type CreatedBotLike = Partial<DCABot> & { id?: string; botId?: string };
      const createdBot = (created ?? null) as CreatedBotLike | null;

      const newBotId =
        typeof createdBot?._id === 'string'
          ? createdBot._id
          : typeof createdBot?.id === 'string'
            ? createdBot.id
            : typeof createdBot?.botId === 'string'
              ? createdBot.botId
              : undefined;

      if (!newBotId) {
        toast.warning(
          'Bot created, but the new bot ID was not returned. Please refresh the bots list to continue.'
        );
        if (debugEnabled) {
          console.warn(
            '[BotFormShell] Missing bot identifier in create response',
            createdBot
          );
        }
        return;
      }

      if (createdBot?.exchangeUUID) {
        getBalances(createdBot.exchangeUUID).catch((error: unknown) => {
          if (debugEnabled) {
            console.error(
              '[BotFormShell] Failed to refresh balances after creation',
              error
            );
          }
        });
      }

      void refetchExchanges().catch((error: unknown) => {
        if (debugEnabled) {
          console.error(
            '[BotFormShell] Failed to refetch exchanges after creation',
            error
          );
        }
      });

      // The bot is on the server now — the local draft is no longer
      // "unsaved work" and must not resurface on the next New Bot visit.
      clearDraft();

      // Show celebration instead of immediately navigating
      setCreatedBotId(newBotId);
      setShowCelebration(true);
    },
    [debugEnabled, refetchExchanges, getBalances, clearDraft]
  );

  const handleCelebrationStartBot = useCallback(() => {
    if (!createdBotId) return;
    statusToggleMutation.mutate(
      { id: createdBotId, status: 'open' },
      {
        onSuccess: () => toast.success('Bot started'),
      }
    );
    navigate(buildBotEditRoute(botExperience.id, createdBotId));
  }, [createdBotId, botExperience.id, navigate, statusToggleMutation]);

  const handleCelebrationClose = useCallback(() => {
    setShowCelebration(false);
    setCreatedBotId(undefined);
  }, []);

  const gridMapper = useMemo<BotSettingsMapper | undefined>(() => {
    if (!isGridBot) {
      return undefined;
    }

    return (
      _botType: BotTypesEnum,
      settings: unknown,
      context: { bot?: unknown; debug?: boolean }
    ) => {
      const mapperOptions: Parameters<typeof mapGridBotSettingsToFormData>[1] =
        {
          bot:
            (context.bot as {
              exchange?: string;
              exchangeUUID?: string;
              settings?: Record<string, unknown>;
            }) || null,
        };

      if (context.debug !== undefined) {
        mapperOptions.debug = context.debug;
      }

      return mapGridBotSettingsToFormData(settings, mapperOptions);
    };
  }, [isGridBot]);

  const moduleMapper = useMemo<BotSettingsMapper | undefined>(() => {
    if (!experienceAdapters?.mapBackendToForm) {
      return undefined;
    }

    return (
      _botType: BotTypesEnum,
      settings: unknown,
      context: BotSettingsMapperContext
    ) => {
      // The dca/combo `mapBackendToForm` adapters call
      // `mapBotSettingsToFormData` without forwarding the bot context, so
      // the mapper's `exchangeUUID` fallback chain (`options.bot.exchangeUUID`)
      // can't fire. For standalone bots this is fine — `settingsSource`
      // upstream is the wrapper from `useBotSettings` (it already carries
      // `exchangeUUID` at the top level). For hedge legs we don't have that
      // wrapper (legs aren't reachable via `useBotSettings`), so synthesize
      // a wrapper-shaped object using `context.bot` whenever the incoming
      // payload looks like an inner settings object only. The dca mapper
      // unwraps via `settingsWrapper.settings ?? settingsWrapper`, so
      // both shapes work.
      const ctxBot = context.bot as
        | { exchangeUUID?: string }
        | null
        | undefined;
      const settingsObj =
        settings && typeof settings === 'object'
          ? (settings as Record<string, unknown>)
          : null;
      const looksLikeWrapper = !!settingsObj && 'settings' in settingsObj;
      const payload =
        ctxBot?.exchangeUUID && settingsObj && !looksLikeWrapper
          ? { settings: settingsObj, exchangeUUID: ctxBot.exchangeUUID }
          : settings;
      const mapped = experienceAdapters.mapBackendToForm?.(payload) ?? {};
      return {
        formData: {
          ...(mapped as Partial<BotFormData>),
        } as BotFormData,
      };
    };
  }, [experienceAdapters]);

  const initializationMapper = useMemo<BotSettingsMapper | undefined>(() => {
    if (isGridBot && gridMapper) {
      return gridMapper;
    }

    return moduleMapper;
  }, [gridMapper, isGridBot, moduleMapper]);

  useBotFormInitialization({
    botType: isGridBot
      ? BotTypesEnum.grid
      : isComboBot
        ? BotTypesEnum.combo
        : BotTypesEnum.dca,
    mode,
    bot,
    botSettings,
    ...(initializationMapper ? { mapper: initializationMapper } : {}),
    debug: debugEnabled,
  });

  // Silently raise persisted amount fields up to the exchange/pair
  // minimum on first load and on exchange/pair switches. The bump
  // writes through `setFormData`, so persistence picks it up
  // automatically. See `useExchangeMinimumBump` for behavior + scope.
  // We coalesce multiple field bumps in the same pass into one toast
  // via a microtask flag so the user sees a single notice.
  const bumpToastPendingRef = useRef(false);
  useExchangeMinimumBump({
    onBump: useCallback((event: ExchangeMinimumBumpEvent) => {
      logger.info('[BotFormShell] Auto-bumped amount to exchange minimum', {
        field: event.field,
        from: event.from,
        to: event.to,
        unit: event.unit,
      });
      if (bumpToastPendingRef.current) return;
      bumpToastPendingRef.current = true;
      queueMicrotask(() => {
        bumpToastPendingRef.current = false;
        toast.info('Adjusted amounts to exchange minimum');
      });
    }, []),
  });

  const shouldTrackGridEdit = useMemo(
    () => isGridBot && mode === 'edit',
    [isGridBot, mode]
  );

  const hasAppliedInitialPriceRef = useRef(false);
  const hasAppliedLeverageRef = useRef(false);
  const initialSnapshotRef = useRef<GridSnapshot | null>(null);
  const trackedBotIdRef = useRef<string | undefined>(undefined);

  const gridBot = useMemo<GridBot | null>(() => {
    if (!shouldTrackGridEdit) {
      return null;
    }

    const candidate = bot;
    if (candidate && isGridBotEntity(candidate)) {
      return candidate;
    }

    return null;
  }, [bot, shouldTrackGridEdit]);

  useEffect(() => {
    if (!shouldTrackGridEdit) {
      trackedBotIdRef.current = undefined;
      initialSnapshotRef.current = null;
      hasAppliedInitialPriceRef.current = false;
      hasAppliedLeverageRef.current = false;
      return;
    }

    const identifier = gridBot?._id ?? gridBot?.exchangeUUID;
    if (trackedBotIdRef.current !== identifier) {
      trackedBotIdRef.current = identifier;
      initialSnapshotRef.current = null;
      hasAppliedInitialPriceRef.current = false;
      hasAppliedLeverageRef.current = false;
    }
  }, [gridBot, shouldTrackGridEdit]);

  useEffect(() => {
    if (!shouldTrackGridEdit || !gridBot) {
      return;
    }

    const nextInitialPrice = stringifyInitialPrice(gridBot.initialPrice);
    const nextInitialPriceFrom = pickInitialPriceFrom(gridBot.settings);
    const nextLeverage = gridBot.settings?.leverage;

    setFormData((previous) => {
      const previouslyAppliedInitialPrice = hasAppliedInitialPriceRef.current;
      const previouslyAppliedLeverage = hasAppliedLeverageRef.current;
      const path =
        previous.type === BotTypesEnum.dca
          ? 'dca'
          : previous.type === BotTypesEnum.combo
            ? 'combo'
            : 'grid';
      const updates: Partial<BotFormData[typeof path]> = {};
      const updatesObject: Partial<BotFormData> = {};
      let shouldFlagInitialPrice = hasAppliedInitialPriceRef.current;
      let shouldFlagLeverage = hasAppliedLeverageRef.current;

      if (!shouldFlagInitialPrice) {
        if (
          nextInitialPrice &&
          (!previous.initialPrice || previous.initialPrice === '0')
        ) {
          updatesObject.initialPrice = nextInitialPrice;
          shouldFlagInitialPrice = true;
        }

        if (nextInitialPriceFrom && !previous.initialPriceFrom) {
          updatesObject.initialPriceFrom = nextInitialPriceFrom;
          shouldFlagInitialPrice = true;
        }
      }

      if (!shouldFlagLeverage && isFiniteNumber(nextLeverage)) {
        const currentLeverage =
          typeof previous[path].leverage === 'number'
            ? previous[path].leverage
            : Number(previous[path].leverage);
        if (!Number.isFinite(currentLeverage) || currentLeverage === 1) {
          updates.leverage = nextLeverage;
          shouldFlagLeverage = true;
        }
      }

      if (Object.keys(updates).length === 0) {
        hasAppliedInitialPriceRef.current = shouldFlagInitialPrice;
        hasAppliedLeverageRef.current = shouldFlagLeverage;
        return previous;
      }

      if (debugEnabled) {
        console.log('[BotForm] Applied grid auto-updates', updates);
      }

      const appliedAutoUpdate =
        (!previouslyAppliedInitialPrice && shouldFlagInitialPrice) ||
        (!previouslyAppliedLeverage && shouldFlagLeverage);

      if (appliedAutoUpdate) {
        initialSnapshotRef.current = null;
      }

      hasAppliedInitialPriceRef.current = shouldFlagInitialPrice;
      hasAppliedLeverageRef.current = shouldFlagLeverage;

      return {
        ...previous,
        ...updatesObject,
        [path]: {
          ...previous[path],
          ...updates,
        },
      };
    });
  }, [shouldTrackGridEdit, gridBot, debugEnabled, setFormData]);

  useEffect(() => {
    if (!shouldTrackGridEdit) {
      initialSnapshotRef.current = null;
      return;
    }

    if (!initialSnapshotRef.current) {
      initialSnapshotRef.current = createSnapshot(formData);
      return;
    }

    const snapshot = initialSnapshotRef.current;
    const { askToReset } = evaluateAskToReset(snapshot, formData);

    if (formData.askToReset === askToReset) {
      return;
    }

    setFormData((previous) => {
      if (previous.askToReset === askToReset) {
        return previous;
      }

      if (debugEnabled) {
        console.log('[BotForm] Updated grid askToReset flag', {
          askToReset,
        });
      }

      return {
        ...previous,
        askToReset,
      };
    });
  }, [shouldTrackGridEdit, formData, debugEnabled, setFormData]);

  useEffect(() => {
    if (!shouldTrackGridEdit) {
      return;
    }

    if (!initialSnapshotRef.current) {
      return;
    }

    if (!isDirty) {
      initialSnapshotRef.current = createSnapshot(formData);
    }
  }, [shouldTrackGridEdit, isDirty, formData]);

  const payloadMapper = useMemo<
    | ((
        formState: BotFormData,
        options: MapFormDataToPayloadOptions,
        vars?: BotVars | undefined | null,
        exchange?: ExchangeInUser | undefined | null
      ) => MapFormDataToPayloadResult | MapGridFormDataToPayloadResult)
    | undefined
  >(() => {
    if (isGridBot) {
      return (
        formState: BotFormData,
        options: MapFormDataToPayloadOptions,
        vars?: BotVars | undefined | null,
        exchange?: ExchangeInUser | undefined | null
      ) => mapGridFormDataToPayload(formState, options, vars, exchange);
    }

    if (!experienceAdapters?.mapFormToBackend) {
      return undefined;
    }

    return (
      formState: BotFormData,
      options: MapFormDataToPayloadOptions,
      vars?: BotVars | undefined | null,
      exchange?: ExchangeInUser | undefined | null
    ) => {
      if (options.mode === 'create') {
        return mapFormDataToPayload(formState, options, vars, exchange);
      }

      try {
        const updatePayload = (experienceAdapters.mapFormToBackend?.(
          formState,
          vars,
          exchange
        ) ?? {}) as Partial<DCABotSettings>;
        const up: UpdateDCABotPayload = {
          ...updatePayload,
          ordersCount: updatePayload.ordersCount
            ? Number(updatePayload.ordersCount)
            : 0,
          activeOrdersCount: updatePayload.activeOrdersCount
            ? Number(updatePayload.activeOrdersCount)
            : 0,
        };

        return {
          success: true,
          updatePayload: up,
          errors: [],
          warnings: [],
        };
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to generate bot payload.';

        return {
          success: false,
          errors: [message],
          warnings: [],
        };
      }
    };
  }, [experienceAdapters, isGridBot]);

  const formHandlerOptions = useMemo(() => {
    const options: Parameters<typeof useFormHandlers>[7] = { mode };

    if (createMutationAdapter) {
      options.createMutation = createMutationAdapter;
    }

    if (isGridBot) {
      options.validate = validateGridFormData;
    } /* else if (isHedgeBot) {
      options.validate = validateHedgeFormData;
    }  */ else {
      options.validate = validateDcaFormData;
    }

    if (payloadMapper) {
      options.payloadMapper = payloadMapper;
    }

    if (mode === 'create') {
      options.onCreateSuccess = handleCreateSuccess;
    }

    return options;
  }, [
    mode,
    createMutationAdapter,
    handleCreateSuccess,
    isGridBot,
    /* isHedgeBot, */
    payloadMapper,
  ]);

  const isTerminal = useMemo(() => !!formData.terminal, [formData.terminal]);
  const isTerminalSimpleSelected = useMemo(
    () => formData?.dca?.terminalDealType === TerminalDealTypeEnum.simple,
    [formData?.dca?.terminalDealType]
  );
  const isTerminalImportSelected = useMemo(
    () => formData?.dca?.terminalDealType === TerminalDealTypeEnum.import,
    [formData?.dca?.terminalDealType]
  );
  // Legacy parity: the terminal order entry has no Quick/Manual mode for
  // Simple (plain buy/sell) or Import (manual position declaration). Only
  // Smart keeps the redesign's Quick mode. Force Manual when those deal
  // types are active so the proper sectioned form renders.
  useEffect(() => {
    if (
      isTerminal &&
      (isTerminalSimpleSelected || isTerminalImportSelected) &&
      quickSetupMode === 'quick'
    ) {
      setQuickSetupMode('manual');
    }
  }, [
    isTerminal,
    isTerminalSimpleSelected,
    isTerminalImportSelected,
    quickSetupMode,
    setQuickSetupMode,
  ]);

  const {
    /* updateFormData, */ handleSave,
    handleBacktest: handleFormBacktest,
    backtestPending,
  } = useFormHandlers(
    formData,
    setFormData,
    setIsDirty,
    setErrors,
    errors,
    bot,
    updateMutation,
    formHandlerOptions,
    isTerminal
  );

  // Seed for the settings dialog. The footer's "More backtest settings"
  // button hands over the period + timeframe its own bar is showing; without
  // this the dialog opened on a hardcoded 1h/Auto and ran the backtest on
  // those instead of on what the user had picked.
  const [backtestDialogInitial, setBacktestDialogInitial] = useState<
    Partial<BacktestConfig>
  >({ mode: 'local', timeframe: ExchangeIntervals.oneH });

  const onBacktestClick = useCallback(
    (_formData?: BotFormData, cfg?: Partial<BacktestConfig>) => {
      if (cfg) {
        setBacktestDialogInitial((prev) => ({ ...prev, ...cfg }));
      }
      setShowBacktestDialog(true);
    },
    [setShowBacktestDialog]
  );

  useEffect(() => {
    if (!isGridBot) {
      if (validationKeysRef.current.size === 0) {
        return;
      }

      setErrors((prevErrors) => {
        const prevEntries = Object.entries(prevErrors);
        if (prevEntries.length === 0) {
          return prevErrors;
        }

        const filteredEntries = prevEntries.filter(
          ([key]) => !validationKeysRef.current.has(key)
        );

        if (filteredEntries.length === prevEntries.length) {
          return prevErrors;
        }

        return Object.fromEntries(filteredEntries) as Record<string, string>;
      });

      validationKeysRef.current = new Set();
      return;
    }

    const validation = validateGridFormData(formData) as unknown as {
      errors: Record<string, string>;
      alerts?: import('@/types/bots/form').BotFormAlerts;
    };
    const validationErrors = validation.errors ?? {};
    const validationAlerts = validation.alerts ?? {};
    const validationKeys = Object.keys(validationErrors);
    const validationEntries = Object.entries(validationErrors);

    // Update alerts state derived from grid validation
    setAlerts(validationAlerts);

    setErrors((prevErrors) => {
      const prevEntries = Object.entries(prevErrors);
      const preservedEntries = prevEntries.filter(
        ([key]) => !validationKeysRef.current.has(key)
      );

      let changed = preservedEntries.length !== prevEntries.length;

      for (const [field, message] of validationEntries) {
        const existingIndex = preservedEntries.findIndex(
          ([key]) => key === field
        );
        if (existingIndex >= 0) {
          if (preservedEntries[existingIndex][1] !== message) {
            preservedEntries[existingIndex] = [field, message];
            changed = true;
          }
        } else {
          preservedEntries.push([field, message]);
          changed = true;
        }
      }

      if (!changed) {
        return prevErrors;
      }

      return Object.fromEntries(preservedEntries) as Record<string, string>;
    });

    validationKeysRef.current = new Set(validationKeys);
  }, [isGridBot, formData, setErrors, setAlerts]);

  const handleLoadTemplate = useCallback(
    (template: BotTemplate) => {
      setFormData((prev) => ({
        ...prev,
        ...template.formData,
        type: prev.type,
        dca: {
          ...prev.dca,
          ...(template.formData.dca || {}),
        },
        combo: {
          ...prev.combo,
          ...(template.formData.combo || {}),
        },
        grid: {
          ...prev.grid,
          ...(template.formData.grid || {}),
        },
      }));
      toast.success(`Template "${template.name}" loaded successfully`);
    },
    [setFormData]
  );

  // Listen for global template load events (triggered by global shortcuts)
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail; // { id }
        if (!detail || !detail.id) return;
        const t = useBotTemplatesStore.getState().getTemplate(detail.id);
        if (!t) return;
        // Only load the template if it belongs to current botType
        if (
          (isGridBot && t.botType === BotTypesEnum.grid) ||
          (!isGridBot && !isComboBot && t.botType === BotTypesEnum.dca) ||
          (isComboBot && t.botType === BotTypesEnum.combo)
        ) {
          handleLoadTemplate(t);
        }
      } catch (e) {
        logger.warn(
          '[BotFormPersistence] Failed to apply template from event',
          { e }
        );
      }
    };
    window.addEventListener('bot-template-load', handler as EventListener);
    return () => {
      window.removeEventListener('bot-template-load', handler as EventListener);
    };
  }, [isGridBot, isComboBot, handleLoadTemplate]);

  const handleImportFromDialog = useCallback(
    async ({ parsed }: { raw: string; parsed: unknown }) => {
      if (!isPlainRecord(parsed)) {
        throw new Error('Unsupported JSON payload for import.');
      }

      const payload = parsed;

      const hasEnvelope =
        isPlainRecord(payload['form']) ||
        isPlainRecord(payload['settings']) ||
        typeof payload['schemaVersion'] === 'string';

      const payloadType = payload['type'];
      if (
        hasEnvelope &&
        typeof payloadType === 'string' &&
        payloadType !== botExperience.id
      ) {
        // Check if the type matches any legacy IDs for this bot experience
        const legacyIds = botExperience.legacyIds || [];
        const isLegacyMatch = legacyIds.includes(payloadType as BotTypesEnum);

        if (!isLegacyMatch) {
          throw new Error(
            `Imported settings target bot type "${payloadType}" but this form is for "${botExperience.id}".`
          );
        }
      }
      let resolvedForm: Partial<typeof formData> | null = null;

      // When importing raw DCA/Combo settings (not grid, not envelope) we
      // do a direct‑set like the legacy system: spread the raw JSON straight
      // into formData.dca (or .combo).  This variable holds the raw payload
      // + target slice so the setFormData below can merge it with defaults.
      let directSettingsImport: {
        slice: 'dca' | 'combo';
        raw: Record<string, unknown>;
      } | null = null;

      const formSection = payload['form'];
      if (isPlainRecord(formSection)) {
        resolvedForm = formSection as Partial<typeof formData>;
      } else {
        const settingsSection = isPlainRecord(payload['settings'])
          ? payload['settings']
          : payload;
        if (isPlainRecord(settingsSection)) {
          if (isGridBot) {
            const gridMapperOptions: MapGridBotSettingsOptions = {
              debug: debugEnabled,
            };

            if (isGridBotEntity(bot)) {
              const botContext: NonNullable<MapGridBotSettingsOptions['bot']> =
                {};

              if (typeof bot.exchange === 'string') {
                botContext.exchange = bot.exchange;
              }

              if (typeof bot.exchangeUUID === 'string') {
                botContext.exchangeUUID = bot.exchangeUUID;
              }

              if (bot.settings && typeof bot.settings === 'object') {
                (botContext as Record<string, unknown>)['settings'] =
                  bot.settings;
              }

              gridMapperOptions.bot = botContext;
            }

            resolvedForm = mapGridBotSettingsToFormData(
              settingsSection,
              gridMapperOptions
            ).formData;
          } else {
            // ── DCA / Combo: Direct-set like legacy ──
            // The legacy import does `setSettings(JSON.parse(json))` with no
            // mapper.  We replicate that here by spreading the raw settings
            // directly into the active bot-type slice (dca / combo).
            const raw = settingsSection as Record<string, unknown>;

            // --- Old-format indicatorGroups migration (matches legacy) ---
            const hasIndicatorGroups = 'indicatorGroups' in raw;
            if (!hasIndicatorGroups) {
              const needsMigration =
                raw['dealCloseConditionSL'] === CloseConditionEnum.techInd ||
                raw['dealCloseCondition'] === CloseConditionEnum.techInd ||
                raw['botStart'] === BotStartTypeEnum.indicators ||
                raw['botActualStart'] === BotStartTypeEnum.indicators ||
                raw['startCondition'] === StartConditionEnum.ti;

              if (needsMigration) {
                const groups: SettingsIndicatorGroup[] = [];
                const indicators = (
                  Array.isArray(raw['indicators']) ? raw['indicators'] : []
                ) as SettingsIndicators[];

                raw['indicators'] = indicators.map((ind) => {
                  if (
                    [
                      IndicatorAction.closeDeal,
                      IndicatorAction.startBot,
                      IndicatorAction.startDeal,
                      IndicatorAction.stopBot,
                    ].includes(ind.indicatorAction)
                  ) {
                    let group = groups.find(
                      (g) =>
                        g.action === ind.indicatorAction &&
                        g.section === ind.section
                    );
                    if (!group) {
                      const logicKey =
                        ind.indicatorAction === IndicatorAction.closeDeal &&
                        ind.section === IndicatorSection.sl
                          ? 'stopDealSlLogic'
                          : ind.indicatorAction === IndicatorAction.closeDeal &&
                              ind.section !== IndicatorSection.sl
                            ? 'stopDealLogic'
                            : ind.indicatorAction === IndicatorAction.startBot
                              ? 'startBotLogic'
                              : ind.indicatorAction === IndicatorAction.stopBot
                                ? 'stopBotLogic'
                                : 'startDealLogic';
                      group = {
                        id: crypto.randomUUID(),
                        action: ind.indicatorAction,
                        section: ind.section,
                        logic:
                          (raw[logicKey] as IndicatorsLogicEnum) ??
                          IndicatorsLogicEnum.and,
                      };
                      groups.push(group);
                    }
                    return { ...ind, groupId: group.id };
                  }
                  return ind;
                });
                raw['indicatorGroups'] = groups;
              } else {
                raw['indicatorGroups'] = [];
                raw['indicators'] = (
                  Array.isArray(raw['indicators']) ? raw['indicators'] : []
                ).map((ind: unknown) => ({
                  ...(ind as Record<string, unknown>),
                  groupId: '',
                }));
              }
            }

            // Extract top-level form fields from raw settings
            const importedName =
              typeof raw['name'] === 'string' ? raw['name'] : undefined;
            const importedPair = Array.isArray(raw['pair'])
              ? raw['pair']
              : typeof raw['pair'] === 'string'
                ? [raw['pair']]
                : undefined;
            const importedExchangeUUID =
              typeof raw['exchangeUUID'] === 'string'
                ? raw['exchangeUUID']
                : undefined;

            const slice: 'dca' | 'combo' = isComboBot ? 'combo' : 'dca';

            resolvedForm = {
              ...(importedName !== undefined ? { name: importedName } : {}),
              ...(importedPair !== undefined ? { pair: importedPair } : {}),
              ...(importedExchangeUUID !== undefined
                ? { exchangeUUID: importedExchangeUUID }
                : {}),
            } as Partial<typeof formData>;

            directSettingsImport = { slice, raw };
          }
        }
      }

      if (!resolvedForm) {
        if (
          typeof payload['name'] === 'string' ||
          Array.isArray(payload['pair'])
        ) {
          resolvedForm = payload as Partial<typeof formData>;
        }
      }

      if (!resolvedForm && !directSettingsImport) {
        throw new Error(
          'Could not resolve form data from provided JSON payload.'
        );
      }

      setFormData((previous) => {
        let next = { ...previous, ...resolvedForm } as typeof previous;

        if (directSettingsImport) {
          // Merge raw settings INTO the previous dca/combo slice so any
          // form-only defaults that are absent from the imported JSON are
          // kept (e.g. useExperimental, pairMetadata).
          const { slice, raw } = directSettingsImport;
          next = {
            ...next,
            [slice]: {
              ...previous[slice],
              ...raw,
            },
          };
        }

        return next;
      });
      setIsDirty(true);
      setErrors({});
    },
    [
      bot,
      botExperience.id,
      botExperience.legacyIds,
      debugEnabled,
      isGridBot,
      setErrors,
      setFormData,
      setIsDirty,
      isComboBot,
    ]
  );

  const handleExportToDialog = useCallback(() => {
    let exportedSettings: Record<string, unknown> | null = null;

    // Shape the export so it matches the legacy dashboard's
    // `DCABotSettings` import contract (the legacy importer does
    // `JSON.parse(json) as DCABotSettings` and assigns the result
    // straight to the form state). Three divergences from our
    // create-mode payload would otherwise break the legacy form:
    //   • numeric `ordersCount` / `activeOrdersCount` — legacy types
    //     these as `string`; the form inputs render them blank when
    //     handed a number, and saving fails type validation.
    //   • create-only envelope fields (`exchange`, `exchangeUUID`,
    //     `uuid`, `vars`, `baseAsset`, `quoteAsset`) — not part of
    //     `DCABotSettings`; legacy carries them along in state but
    //     they pollute the parsed payload.
    //   • `useExperimental` — a redesign-only feature flag rejected
    //     by legacy's `createDCABotInput` schema (the redesign mapper
    //     already strips it for its own create mutation, but only when
    //     the create-payload branch is taken).
    const stripForLegacyImport = (
      payload: Record<string, unknown>
    ): Record<string, unknown> => {
      const {
        exchange: _exchange,
        exchangeUUID: _exchangeUUID,
        uuid: _uuid,
        vars: _vars,
        baseAsset: _baseAsset,
        quoteAsset: _quoteAsset,
        useExperimental: _useExperimental,
        ordersCount,
        activeOrdersCount,
        ...rest
      } = payload;

      const result: Record<string, unknown> = { ...rest };
      if (ordersCount !== undefined && ordersCount !== null) {
        result['ordersCount'] = String(ordersCount);
      }
      if (activeOrdersCount !== undefined && activeOrdersCount !== null) {
        result['activeOrdersCount'] = String(activeOrdersCount);
      }
      return result;
    };

    const modulePayloadAdapter = experienceAdapters?.mapFormToBackend;

    if (modulePayloadAdapter) {
      try {
        const modulePayload = modulePayloadAdapter(formData);

        if (modulePayload && Object.keys(modulePayload).length > 0) {
          exportedSettings = modulePayload;
        }
      } catch {
        exportedSettings = null;
      }
    }

    // Grid bot: try mapGridFormDataToPayload
    if (!exportedSettings && isGridBot) {
      try {
        const gridMapping = mapGridFormDataToPayload(formData, {
          mode,
          debug: debugEnabled,
        });

        const gridPayload =
          mode === 'create'
            ? (gridMapping.createPayload ?? gridMapping.updatePayload)
            : gridMapping.updatePayload;

        if (gridPayload && Object.keys(gridPayload).length > 0) {
          exportedSettings = gridPayload as Record<string, unknown>;
        }
      } catch {
        exportedSettings = null;
      }
    }

    // Grid bot fallback: use botSettings from the loaded bot entity
    if (
      !exportedSettings &&
      isGridBot &&
      botSettings &&
      typeof botSettings === 'object'
    ) {
      exportedSettings = botSettings as unknown as Record<string, unknown>;
    }

    const shouldRunDcaMapping =
      !exportedSettings &&
      (!modulePayloadAdapter || botExperience.id === 'dca');

    if (!isGridBot && shouldRunDcaMapping) {
      try {
        const mapping = mapFormDataToPayload(formData, {
          mode,
          debug: debugEnabled,
        });

        const settingsPayload =
          mode === 'create'
            ? (mapping.createPayload ?? mapping.updatePayload)
            : mapping.updatePayload;

        if (settingsPayload && Object.keys(settingsPayload).length > 0) {
          exportedSettings = settingsPayload;
        }
      } catch {
        exportedSettings = null;
      }
    }

    if (!exportedSettings) {
      logger.warn('[BotForm] Could not generate bot settings export payload');
      return null;
    }

    return JSON.stringify(stripForLegacyImport(exportedSettings), null, 2);
  }, [
    botExperience.id,
    botSettings,
    debugEnabled,
    experienceAdapters,
    formData,
    isGridBot,
    mode,
  ]);

  const moduleTabDescriptors = experienceFormContract?.tabs;
  const metadataTabDescriptors = useMemo(() => {
    const metadataTabs = botExperience.metadata?.['formTabs'];
    if (Array.isArray(metadataTabs)) {
      return metadataTabs as BotFormTabDescriptor[];
    }

    return undefined;
  }, [botExperience]);

  const fallbackTabDescriptors = useMemo<BotFormTabDescriptor[]>(() => {
    return isGridBot ? gridTabDescriptors : dcaTabDescriptors;
  }, [isGridBot]);

  const tabDescriptors = useMemo<BotFormTabDescriptor[]>(
    () =>
      (moduleTabDescriptors?.length
        ? moduleTabDescriptors
        : (metadataTabDescriptors ?? fallbackTabDescriptors)
      )
        .filter((d) => (isGridBot ? true : isTerminal ? d.isTerminal : d.isDca))
        .filter((d) => (tabDescriptorsFilter ? tabDescriptorsFilter(d) : true)),
    [
      moduleTabDescriptors,
      metadataTabDescriptors,
      fallbackTabDescriptors,
      isTerminal,
      tabDescriptorsFilter,
      isGridBot,
    ]
  );

  const visibleDescriptors = useMemo(() => {
    const filtered = tabDescriptors.filter((descriptor) => {
      if (!descriptor.featureFlag) {
        return true;
      }

      if (descriptor.featureFlag in features) {
        return features[descriptor.featureFlag] !== false;
      }

      return true;
    });
    // In quick setup mode, QuickBotForm renders its own compact UI
    // (basic identity inputs + preset picker + summary), so we skip
    // the section descriptors entirely.
    if (quickSetupMode === 'quick') {
      return [];
    }
    return filtered;
  }, [tabDescriptors, features, quickSetupMode]);

  const sectionToggleMap: Record<string, string> = useMemo(
    () => ({
      dca: 'useDca',
      'take-profit': isGridBot ? 'tpSl' : 'useTp',
      'stop-loss': isGridBot ? 'sl' : 'useSl',
      'risk-reward': 'useRiskReward',
      'bot-controller': 'useBotController',
      experimental: 'useExperimental',
    }),
    [isGridBot]
  );

  // Per-section collapse state. By default the webhook helper is collapsed.
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >(() => ({ webhook: true }));

  const isSectionCollapsed = useCallback(
    (id: string) => Boolean(collapsedSections[id]),
    [collapsedSections]
  );

  const toggleSectionCollapsed = useCallback((id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const navigationTabs = useMemo<ScrollableTabItem[]>(() => {
    // Filter out disabled tabs completely (user requested removal instead of just disabling)
    return visibleDescriptors
      .filter(({ id }) => {
        const toggleField = sectionToggleMap[id];
        // If no toggle field, always show the tab
        if (!toggleField) return true;
        // Only show the tab if the toggle is enabled
        return Boolean(
          (
            (isComboBot
              ? formData.combo
              : isGridBot
                ? formData.grid
                : formData.dca) as Record<string, unknown>
          )[toggleField]
        );
      })
      .map(({ id, label, icon, description }) => ({
        id,
        label,
        icon,
        ...(description ? { description } : {}),
      }));
  }, [
    visibleDescriptors,
    formData.dca,
    sectionToggleMap,
    isComboBot,
    formData.combo,
    isGridBot,
    formData.grid,
  ]);

  const getBalanceFn = useMemo<GetBalanceFn>(
    () => getBalance as unknown as GetBalanceFn,
    [getBalance]
  );

  useEffect(() => {
    if (visibleDescriptors.length === 0) {
      return;
    }

    if (!visibleDescriptors.some((descriptor) => descriptor.id === activeTab)) {
      setActiveTab(visibleDescriptors[0].id as BotFormTabId);
    }
  }, [visibleDescriptors, activeTab, setActiveTab]);

  useEffect(() => {
    if (!defaultTab) {
      return;
    }

    if (visibleDescriptors.some((descriptor) => descriptor.id === defaultTab)) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, visibleDescriptors, setActiveTab]);

  const widgetMetadata = useMemo(
    () => createWidgetMetadata(resolvedWidgetId),
    [resolvedWidgetId]
  );

  const widgetTitle =
    mode === 'create'
      ? 'Create Bot'
      : `Edit Bot - ${
          (bot?.settings as { name?: string } | undefined)?.name ?? 'Unnamed'
        }`;

  const widgetValue = useMemo(
    () => resolveWidgetValue(mode, formData, bot),
    [mode, formData, bot]
  );

  const submitIsPending =
    mode === 'create'
      ? (createMutationAdapter?.isPending ?? false)
      : updateMutation.isPending;

  const submitDisabled =
    submitIsPending ||
    (mode === 'edit' ? !isDirty : false) ||
    isReadOnly ||
    // Legacy parity (TerminalBotSettings.tsx:1776-1778): Simple terminal deals
    // are spot-only, so block submit when a futures exchange is selected.
    (isTerminal &&
      isTerminalSimpleSelected &&
      !!currentExchange &&
      isFuturesExchange(currentExchange.provider)) ||
    // Caller-imposed disable (used by HedgeBotEditLayout to prevent the
    // per-leg footer from saving a standalone bot — saves go through the
    // unified hedge mutation in the outer layout instead).
    forceSubmitDisabled;


  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  /* const [showSmartOrderMergeDialog, setShowSmartOrderMergeDialog] =
    useState(false);
  const [smartOrderMergeDefaults, setSmartOrderMergeDefaults] = useState<
    string[] | undefined
  >(undefined); */
  const [fundsDialogMode, setFundsDialogMode] = useState<
    'add' | 'reduce' | null
  >(null);

  const botId = bot?._id ?? null;

  // Live order-placement progress (grid). The engine streams a `progress`
  // field ({ stage, total, text, isAllowedToCancel }) into the grid socket
  // store while it places the grid ladder. While placement is in flight we
  // replace the settings body with a blocking progress panel and gate the
  // footer, matching the legacy dashboard.
  const gridPlacementProgress = useGridBotsStore((s) =>
    isGridBot && botId ? (s.getBot(botId)?.progress ?? null) : null
  );
  const isPlacingOrders =
    !!gridPlacementProgress &&
    typeof gridPlacementProgress.stage === 'number' &&
    typeof gridPlacementProgress.total === 'number' &&
    gridPlacementProgress.total > 0 &&
    gridPlacementProgress.stage !== gridPlacementProgress.total;

  const botForOperations = useMemo(() => {
    if (isDcaBotEntity(bot)) {
      return bot as DCABot;
    }

    return null;
  }, [bot]);

  const gridBotForOperations = useMemo(() => {
    if (isGridBot && bot && 'levels' in bot) {
      return bot as GridBot;
    }

    return null;
  }, [isGridBot, bot]);

  const botShareId = botForOperations?.shareId ?? null;
  const botShareEnabled = Boolean(botForOperations?.share);
  const botShareName =
    (botForOperations?.settings?.name as string | undefined) ?? null;

  /*   const mergeBotName =
    botShareName ?? (botForOperations?.settings?.name as string | undefined); */

  /*   const {
    eligibleDeals: mergeEligibleDeals,
    eligibleCount: mergeEligibleCount,
    extraMessage: mergeDialogMessage,
    isLoading: smartOrdersLoading,
    hasValidResponse: smartOrdersHaveData,
    refetch: smartOrdersRefetch,
  } = useBotSmartOrders({
    botId,
    botName: mergeBotName ?? null,
  });

  const mergeSmartOrdersMutation = useMergeSmartOrders(); */
  /* const smartOrderMergePending = mergeSmartOrdersMutation.isPending;

  const smartOrderMergeLabel = useMemo(() => {
    if (mergeEligibleCount > 1) {
      return `Merge smart orders (${mergeEligibleCount})`;
    }
    return 'Merge smart orders';
  }, [mergeEligibleCount]);

  const smartOrderMergeActionDisabled =
    !botId ||
    smartOrdersLoading ||
    !smartOrdersHaveData ||
    mergeEligibleCount < 2; */

  const primaryPair = useMemo(() => {
    if (Array.isArray(formData.pair) && formData.pair.length > 0) {
      return formData.pair[0];
    }

    const gridPairCandidate = gridBotForOperations?.settings?.pair;
    if (typeof gridPairCandidate === 'string' && gridPairCandidate.trim()) {
      return gridPairCandidate.trim();
    }

    const settingsPairCandidate = (
      botSettings as { pair?: unknown } | null | undefined
    )?.pair;

    if (
      typeof settingsPairCandidate === 'string' &&
      settingsPairCandidate.trim()
    ) {
      return settingsPairCandidate.trim();
    }

    return undefined;
  }, [formData.pair, gridBotForOperations?.settings?.pair, botSettings]);

  const [baseAsset, quoteAsset] = useMemo(() => {
    if (!primaryPair || typeof primaryPair !== 'string') {
      return [undefined, undefined] as const;
    }

    const segments = primaryPair.split('/');
    if (segments.length === 2) {
      return [segments[0], segments[1]] as const;
    }

    return [undefined, undefined] as const;
  }, [primaryPair]);

  // Legacy terminal parity (TerminalBotSettings.tsx:1782-1793): the submit
  // button reads "Import deal" for Import, otherwise
  // "Place order (Buy/Sell|Long/Short {base})".
  const submitLabel = useMemo(() => {
    if (submitIsPending) {
      return mode === 'create'
        ? isTerminal
          ? 'PLACING ORDER...'
          : 'CREATING...'
        : 'SAVING...';
    }
    if (mode !== 'create') {
      return 'SAVE SETTINGS';
    }
    if (!isTerminal) {
      return 'CREATE BOT';
    }
    if (isTerminalImportSelected) {
      return 'Import deal';
    }
    const terminalStrategy = formData.dca?.strategy;
    const terminalFutures = formData.dca?.futures;
    const sideLabel =
      terminalStrategy === StrategyEnum.long
        ? terminalFutures
          ? 'Long'
          : 'Buy'
        : terminalFutures
          ? 'Short'
          : 'Sell';
    return `Place order (${sideLabel} ${baseAsset ?? ''})`.trim();
  }, [
    mode,
    submitIsPending,
    isTerminal,
    isTerminalImportSelected,
    formData.dca?.strategy,
    formData.dca?.futures,
    baseAsset,
  ]);

  const fundsTargetName = useMemo(() => {
    if (typeof formData.name === 'string' && formData.name.trim()) {
      return formData.name.trim();
    }

    const gridNameCandidate = gridBotForOperations?.settings?.name;
    if (typeof gridNameCandidate === 'string' && gridNameCandidate.trim()) {
      return gridNameCandidate.trim();
    }

    const settingsNameCandidate = (
      botSettings as { name?: unknown } | null | undefined
    )?.name;

    if (
      typeof settingsNameCandidate === 'string' &&
      settingsNameCandidate.trim()
    ) {
      return settingsNameCandidate.trim();
    }

    return undefined;
  }, [formData.name, gridBotForOperations?.settings?.name, botSettings]);

  const fundsActionsDisabled = !botId || mode !== 'edit';

  const botTypeEnum = useMemo(() => {
    const enumValue =
      BotTypesEnum[botExperience.id as keyof typeof BotTypesEnum];
    return enumValue ?? BotTypesEnum.dca;
  }, [botExperience.id]);

  // Keep the latest drag handler in a ref so we can hand the store a stable
  // callback. If we let the callback identity change on every keystroke
  // (multiTp / multiSl / dcaCustom are fresh references each render), the
  // setContext({ onDrag }) effect would fire on every keystroke and the
  // store's scheduleNotify() would race with BotFormProvider's settings push,
  // blowing away form-driven chart updates.
  const dragHandlerRef = useRef<ExampleOrdersStoreContext['onDrag']>(undefined);
  dragHandlerRef.current = (price, type, index, meta) => {
    const strategy = formData.dca?.strategy;
    const long = strategy !== StrategyEnum.short;
    const latestPrice = meta?.latestPrice;

    // The bot form exposes TP/SL as a percentage (tpPerc / multiTp[i].target,
    // slPerc / multiSl[i].target) and has no UI for `useFixedTPPrices` /
    // `useFixedSLPrices`. Flipping those flags from a drag would silently
    // lock the form into a state the user can't undo. So convert the dragged
    // price back to a percentage instead and write to the field the form
    // actually uses.
    const toPerc = (p: number) => {
      if (!latestPrice || latestPrice <= 0) return undefined;
      const raw = ((p - latestPrice) / latestPrice) * 100 * (long ? 1 : -1);
      if (!Number.isFinite(raw)) return undefined;
      return raw;
    };

    if (type === DCAOrderTypeEnum.tp) {
      const perc = toPerc(price);
      if (perc === undefined) return;
      if (typeof index !== 'undefined' && formData.dca?.useMultiTp) {
        // multiTp `target` is the absolute % distance from entry (always
        // positive for a TP); chart formula uses (long?1:-1) * (target/100).
        const target = Math.abs(perc);
        const mtp = (formData.dca?.multiTp || []).map((tp, i) =>
          i === index ? { ...tp, target: target.toFixed(2) } : tp
        );
        updateFormData('multiTp', mtp);
      } else {
        const next = Math.abs(perc).toFixed(2);
        updateFormData('tpPerc', next);
      }
    }
    if (type === DCAOrderTypeEnum.sl) {
      // slPerc is stored as a negative percentage (validation requires
      // slPerc < -MIN_DCA_TP). Chart formula is
      //   latestPrice * (1 + (long?1:-1) * slPerc/100 + fees)
      // so for a valid SL the stored value is negative in both long and
      // short. Drag conversion: slPerc = (long?1:-1) * (price-latest)/latest.
      if (!latestPrice || latestPrice <= 0) return;
      const slPerc =
        ((price - latestPrice) / latestPrice) * 100 * (long ? 1 : -1);
      if (!Number.isFinite(slPerc)) return;
      // Guard against drags onto the wrong side of entry — that would
      // produce a positive slPerc which the form rejects.
      const signed = -Math.abs(slPerc);
      if (typeof index !== 'undefined' && formData.dca?.useMultiSl) {
        const msl = (formData.dca?.multiSl || []).map((sl, i) =>
          i === index ? { ...sl, target: signed.toFixed(2) } : sl
        );
        updateFormData('multiSl', msl);
      } else {
        updateFormData('slPerc', signed.toFixed(2));
      }
    }
    if (type === DCAOrderTypeEnum.limit) {
      updateFormData('baseOrderPrice', `${price}`);
    }
    if (type === DCAOrderTypeEnum.dca && typeof index !== 'undefined') {
      const custom = (formData.dca?.dcaCustom || []).map((o, i) => {
        if (i === index) {
          const prev = meta?.prevPrice;
          let nextStep: string | undefined;
          if (typeof prev === 'number' && Number.isFinite(prev) && prev > 0) {
            const stepCalc =
              strategy === StrategyEnum.short
                ? Math.abs(((price - prev) / prev) * 100)
                : Math.abs(((prev - price) / prev) * 100);
            if (Number.isFinite(stepCalc)) {
              nextStep = stepCalc.toFixed(2);
            }
          }
          return {
            ...o,
            fixed: `${price}`,
            ...(nextStep ? { step: nextStep } : null),
          };
        }
        return o;
      });
      updateFormData('dcaCustom', custom);
    }
    if (type === DCAOrderTypeEnum.grid && meta?.gridBound) {
      // Drag of the top/bottom grid-line directly edits the form's
      // topPrice / lowPrice. We CLAMP instead of bailing on invalid
      // drops so the form always updates — that triggers an order
      // regen which snaps the line back to the clamped value on the
      // chart. Bailing would leave the line stranded wherever the user
      // dropped it (e.g. below zero) because TradingView doesn't know
      // we rejected the value.
      if (!Number.isFinite(price)) return;
      const otherBound =
        meta.gridBound === 'top'
          ? Number(formData.grid?.lowPrice)
          : Number(formData.grid?.topPrice);
      const hasOther = Number.isFinite(otherBound) && otherBound > 0;
      // Minimum valid price = one tick of the exchange's price
      // precision (10^-pricePrecision). 0 is technically invalid for
      // every exchange — the bot needs at least one tick of headroom.
      const pair = Array.isArray(formData.pair)
        ? formData.pair[0]
        : formData.pair;
      const normalized = pair ? pair.replace(/[\s\-/]/g, '').toUpperCase() : '';
      const precision =
        formData.pairPrecisionMap?.[normalized]?.pricePrecision ??
        formData.pairPrecisionMap?.[pair ?? '']?.pricePrecision;
      const priceTick =
        typeof precision === 'number' && precision >= 0
          ? Math.pow(10, -precision)
          : 1e-8;
      let next = price;
      if (meta.gridBound === 'top') {
        // top must stay strictly above lowPrice — pad by 0.1% so the
        // grid math (geometric step requires top > low) doesn't choke.
        const floor = hasOther ? otherBound * 1.001 : priceTick;
        if (next < floor) next = floor;
      } else {
        // low must stay below topPrice — same 0.1% pad — and >= one tick.
        const ceil = hasOther ? otherBound * 0.999 : Number.POSITIVE_INFINITY;
        if (next > ceil) next = ceil;
        if (next < priceTick) next = priceTick;
      }
      updateFormData(meta.gridBound === 'top' ? 'topPrice' : 'lowPrice', next);
    }
  };

  useEffect(() => {
    exampleOrdersStore.setContext({
      onDrag: (price, type, index, meta) =>
        dragHandlerRef.current?.(price, type, index, meta),
    });
  }, [exampleOrdersStore]);

  useEffect(() => {
    // The chart follows the first pair by default, but a clicked pair chip
    // (activeChartPair) takes precedence as long as it's still a member of
    // the current selection — otherwise it falls back to the first pair.
    const primaryPair =
      activeChartPair &&
      Array.isArray(formData.pair) &&
      formData.pair.includes(activeChartPair)
        ? activeChartPair
        : Array.isArray(formData.pair) && formData.pair.length > 0
          ? formData.pair[0]
          : undefined;

    // pairMetadata is keyed by the normalized `${base}${quote}` (no dash),
    // but a TradingPair's `.pair` field can use any exchange-specific form
    // (e.g. 'BTC-USDT' on KuCoin). Try the direct key lookup first and fall
    // back to scanning values for a match by `.pair`. This matters for
    // hedge create-mode where the chart reports the dashed pair via
    // setOnChangeSymbol and a strict-key lookup would miss it.
    const realPair = primaryPair
      ? (formData.pairMetadata[primaryPair] ??
        Object.values(formData.pairMetadata).find(
          (p) => p.pair === primaryPair
        ))
      : undefined;

    if (realPair) {
      exampleOrdersStore.setContext({
        symbol: { ...realPair, maxOrders: 200 },
      });
    }

    if (!onFormDataChange) {
      return;
    }

    const payload: BotChartData = {};

    if (
      realPair?.exchange === currentExchange?.provider &&
      typeof realPair?.pair === 'string'
    ) {
      payload.symbol = realPair.pair;
    }

    if (currentExchange) {
      payload.exchangeUUID = currentExchange.uuid;
      payload.exchange = currentExchange.provider;
    }

    if (botId && mode === 'edit') {
      payload.botId = botId;
    }

    onFormDataChange(payload);
  }, [
    formData.pair,
    activeChartPair,
    botId,
    mode,
    onFormDataChange,
    formData.pairMetadata,
    currentExchange,
    exampleOrdersStore,
  ]);

  const handleStatusToggle = useCallback(
    ({
      nextStatus,
      closeType,
      buyType,
      buyCount,
      buyAmount,
      cancelPartiallyFilled,
      closeGridType,
    }: ToggleStatusPayload) => {
      if (!botId) {
        toast.error('Bot ID missing. Unable to update status.');
        return;
      }

      statusToggleMutation.mutate({
        id: botId,
        status: nextStatus,
        buyType,
        buyCount,
        buyAmount,
        cancelPartiallyFilled,
        closeGridType,
        ...(closeType ? { closeType } : {}),
      });
    },
    [botId, statusToggleMutation]
  );

  // Duplicating opens the pre-filled *create* page (the canonical clone route
  // every other surface already uses — see `useBotActions.clone`). Creating the
  // copy immediately instead would land on the edit page, where the pair and
  // exchange of a saved bot can no longer be changed — which defeats the main
  // reason to duplicate a bot. Nothing is persisted until the user hits Create.
  const handleDuplicate = useCallback(() => {
    if (!botId) {
      toast.error('Bot ID missing. Unable to duplicate.');
      return;
    }

    navigate(buildBotCloneRoute(botExperience.id, botId));
  }, [botExperience.id, botId, navigate]);

  const handleBacktest = useCallback(() => {
    if (!botId) {
      toast.error('Bot ID missing. Unable to start backtest.');
      return;
    }

    const params = new URLSearchParams({ load: botId, backtest: 'run' });
    if (botShareId) {
      params.set('share', botShareId);
    }

    navigate(`/bot/new?${params.toString()}`);
  }, [botId, botShareId, navigate]);

  const handleArchiveToggle = useCallback(
    async (archive: boolean) => {
      if (!botId) {
        toast.error('Bot ID missing. Unable to update archive state.');
        return;
      }

      try {
        await archiveMutation.mutateAsync({
          id: botId,
          archive,
          type: botTypeEnum,
        });
      } catch (error) {
        console.error('[BotForm] Failed to toggle archive state', error);
      }
    },
    // Stable `.mutateAsync`, not the whole react-query mutation object (fresh
    // every render). Depending on the object rebuilt this callback on EVERY
    // render, which churned `resolvedMenuActions.optionsMenuItems` →
    // `panelMenuConfig` → the footer's `overflowMenuItems`, re-rendering the
    // memoised ResponsiveButtonRow on every live tick (RenderLoopTripwire).
    // Same fix as 2.30.13 applied to `restartMutation.mutate`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archiveMutation.mutateAsync, botId, botTypeEnum]
  );

  /* const handleSmartOrderMergeDialogChange = useCallback(
    (open: boolean) => {
      setShowSmartOrderMergeDialog(open);
      if (!open && !smartOrderMergePending) {
        setSmartOrderMergeDefaults(undefined);
      }
    },
    [smartOrderMergePending]
  );

  const handleOpenSmartOrderMerge = useCallback(() => {
    if (!botId) {
      toast.error('Save the bot before merging smart orders.');
      return;
    }

    if (smartOrdersLoading) {
      toast.info('Smart orders are still loading. Try again in a moment.');
      return;
    }

    if (!smartOrdersHaveData) {
      toast.error('Unable to load smart orders. Please try again later.');
      return;
    }

    if (mergeEligibleCount < 2) {
      if (mergeDialogMessage) {
        toast.info(mergeDialogMessage);
      } else {
        toast.info('Select at least two open smart orders to enable merging.');
      }
      return;
    }

    setSmartOrderMergeDefaults(mergeEligibleDeals.map((deal) => deal.id));
    setShowSmartOrderMergeDialog(true);
  }, [
    botId,
    mergeDialogMessage,
    mergeEligibleCount,
    mergeEligibleDeals,
    smartOrdersHaveData,
    smartOrdersLoading,
  ]); */

  /*  const handleSmartOrderMergeConfirm = useCallback(
    async ({ dealIds }: { dealIds: string[] }) => {
      setSmartOrderMergeDefaults(dealIds);

      if (!botId) {
        toast.error('Bot ID missing. Unable to merge smart orders.');
        return;
      }

      if (dealIds.length < 2) {
        toast.error('Select at least two open smart orders to enable merging.');
        return;
      }

      try {
        const result = await mergeSmartOrdersMutation.mutateAsync({
          botId,
          dealIds,
        });

        const successMessage =
          result?.data || 'Smart orders merged successfully.';
        toast.success(successMessage);

        setShowSmartOrderMergeDialog(false);
        setSmartOrderMergeDefaults(undefined);
        void smartOrdersRefetch();
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : 'Failed to merge smart orders. Please try again.';
        toast.error(reason);
      }
    },
    [botId, mergeSmartOrdersMutation, smartOrdersRefetch]
  ); */

  const handleAddFundsClick = useCallback(() => {
    if (!botId) {
      toast.error('Save the bot before adjusting funds.');
      return;
    }

    setFundsDialogMode('add');
  }, [botId]);

  const handleReduceFundsClick = useCallback(() => {
    if (!botId) {
      toast.error('Save the bot before adjusting funds.');
      return;
    }

    setFundsDialogMode('reduce');
  }, [botId]);

  const handleFundsDialogConfirm = useCallback((_: unknown) => {
    toast.info(
      'Grid funds adjustments will be wired soon. Please continue using the classic runtime controls for now.'
    );
    setFundsDialogMode(null);
  }, []);

  const handleAddFundsDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setFundsDialogMode(null);
      return;
    }

    setFundsDialogMode('add');
  }, []);

  const handleReduceFundsDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setFundsDialogMode(null);
      return;
    }

    setFundsDialogMode('reduce');
  }, []);

  const archivePending = archiveMutation.isPending;

  const isBotArchived =
    typeof botForOperations?.status === 'string' &&
    botForOperations.status.toLowerCase() === 'archived';

  const resolvedMenuActions = useMemo(() => {
    const baseActions = menuActions ?? {};

    const mergedOptions: WidgetMenuActionItem[] = [];

    if (Array.isArray(baseActions.optionsMenuItems) && !isTerminal) {
      mergedOptions.push(...baseActions.optionsMenuItems);
    }

    const openImportExport = () => {
      baseActions.onOptions?.();
      setShowImportExportDialog(true);
    };

    if (!isTerminal) {
      mergedOptions.push(
        {
          label: 'Import / Export settings',
          icon: ArrowLeftRight,
          onSelect: openImportExport,
        },
        // Save as Template handled via bookmark button in footer
        {
          label: 'Reset to defaults',
          icon: RotateCcw,
          onSelect: () => {
            setShowResetConfirm(true);
          },
          disabled: mode === 'edit',
        }
      );

      if (mode === 'edit' && botForOperations) {
        // Operations previously rendered in the footer now live in the gear menu
        // so they remain accessible without occupying persistent screen space.
        mergedOptions.push(
          /* {
            label: smartOrderMergeLabel,
            icon: Merge,
            onSelect: () => {
              handleOpenSmartOrderMerge();
            },
            disabled: smartOrderMergeActionDisabled,
          }, */
          {
            label: 'Share bot access',
            icon: Share2,
            onSelect: () => setShowShareDialog(true),
            isChecked: botShareEnabled,
            disabled: !botId,
          },
          {
            label: 'Duplicate bot',
            icon: Copy,
            onSelect: () => {
              void handleDuplicate();
            },
            disabled: !botId,
          },
          {
            label: 'Run backtest',
            icon: LineChart,
            onSelect: () => {
              handleBacktest();
            },
            disabled: !botId,
          },
          {
            label: isBotArchived ? 'Unarchive bot' : 'Archive bot',
            icon: isBotArchived ? ArchiveRestore : Archive,
            onSelect: () => {
              void handleArchiveToggle(!isBotArchived);
            },
            disabled: archivePending || !botId,
          }
        );
      }

      if (mode === 'edit' && isGridBot && botId) {
        mergedOptions.push(
          {
            label: 'Add funds',
            icon: Wallet,
            onSelect: () => {
              handleAddFundsClick();
            },
            disabled: fundsActionsDisabled,
          },
          {
            label: 'Reduce funds',
            icon: MinusCircle,
            onSelect: () => {
              handleReduceFundsClick();
            },
            disabled: fundsActionsDisabled,
          }
        );
      }
    }

    return {
      ...baseActions,
      onOptions: openImportExport,
      optionsMenuItems: mergedOptions,
    };
  }, [
    archivePending,
    botForOperations,
    botId,
    botShareEnabled,
    handleArchiveToggle,
    handleBacktest,
    handleDuplicate,
    /*     handleOpenSmartOrderMerge,
    smartOrderMergeActionDisabled,
    smartOrderMergeLabel, */
    menuActions,
    mode,
    isBotArchived,
    isGridBot,
    handleAddFundsClick,
    handleReduceFundsClick,
    fundsActionsDisabled,
    isTerminal,
  ]);

  const panelMenuConfig = useMemo(() => {
    return mapWidgetMenuItemsToPanelMenu(resolvedMenuActions.optionsMenuItems, {
      triggerAriaLabel: 'Open form options',
      idPrefix: `${resolvedWidgetId}-form-menu`,
    });
  }, [resolvedMenuActions.optionsMenuItems, resolvedWidgetId]);

  useEffect(() => {
    if (!onPanelMenuChange) {
      return;
    }

    if (variant === 'panel') {
      onPanelMenuChange(null);
      return () => {
        onPanelMenuChange(null);
      };
    }

    onPanelMenuChange(panelMenuConfig);

    return () => {
      onPanelMenuChange(null);
    };
  }, [variant, panelMenuConfig, onPanelMenuChange]);

  const botStatus =
    typeof bot?.status === 'string' ? bot.status.toLowerCase() : undefined;
  const shouldWarnRestart = useMemo(() => {
    if (!isGridBot || mode !== 'edit') {
      return false;
    }

    return Boolean(formData.askToReset);
  }, [isGridBot, mode, formData.askToReset]);

  const requiresActiveRestartConfirmation = useMemo(() => {
    if (!shouldWarnRestart) {
      return false;
    }

    if (!botStatus) {
      return false;
    }

    const activeStatuses = new Set(['open', 'range', 'monitoring', 'active']);
    return activeStatuses.has(botStatus);
  }, [shouldWarnRestart, botStatus]);

  const handleSubmit = useCallback(() => {
    if (requiresActiveRestartConfirmation) {
      setShowRestartDialog(true);
      return;
    }

    void handleSave();
  }, [requiresActiveRestartConfirmation, handleSave]);

  const resumeSaveAfterConfirmation = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  useEffect(() => {
    if (!shouldWarnRestart && showRestartDialog) {
      setShowRestartDialog(false);
    }
  }, [shouldWarnRestart, showRestartDialog]);

  // Refs for each section to enable scrolling
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrolling = useRef(false);

  // Handle tab change by scrolling to the section
  const handleTabChangeWithScroll = useCallback(
    (tabId: string) => {
      setActiveTab(tabId as BotFormTabId);

      const sectionElement = sectionRefs.current[tabId];
      const scrollContainer = scrollContainerRef.current;

      if (sectionElement && scrollContainer) {
        isScrolling.current = true;

        // Calculate the offset to scroll to
        const containerTop = scrollContainer.getBoundingClientRect().top;
        const sectionTop = sectionElement.getBoundingClientRect().top;
        const offset =
          sectionTop - containerTop + scrollContainer.scrollTop - 16; // 16px padding

        scrollContainer.scrollTo({
          top: offset,
          behavior: 'smooth',
        });

        // Reset scrolling flag after animation
        setTimeout(() => {
          isScrolling.current = false;
        }, 800);
      }
    },
    [setActiveTab]
  );

  // Reset scroll to top when toggling between quick and manual modes.
  // Without this, the previous scrollTop is preserved and the scroll-spy
  // promotes whichever section (typically DCA) is most visible at that offset.
  const prevQuickSetupMode = useRef(quickSetupMode);
  useEffect(() => {
    if (prevQuickSetupMode.current === quickSetupMode) return;
    prevQuickSetupMode.current = quickSetupMode;
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    isScrolling.current = true;
    scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
    setTimeout(() => {
      isScrolling.current = false;
    }, 50);
  }, [quickSetupMode]);

  // Update active tab based on scroll position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (isScrolling.current) return;

      const containerRect = scrollContainer.getBoundingClientRect();

      // Find which section is currently most visible in the viewport
      let activeSection: string | null = null;
      let maxVisibleArea = 0;

      visibleDescriptors.forEach(({ id }) => {
        const sectionElement = sectionRefs.current[id];
        if (!sectionElement) return;

        const sectionRect = sectionElement.getBoundingClientRect();

        // Calculate the visible portion of this section
        const visibleTop = Math.max(sectionRect.top, containerRect.top);
        const visibleBottom = Math.min(
          sectionRect.bottom,
          containerRect.bottom
        );
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        // Use visible area as the metric (height * width for accuracy)
        const visibleArea = visibleHeight * sectionRect.width;

        // The section with the largest visible area is the active one
        if (visibleArea > maxVisibleArea) {
          maxVisibleArea = visibleArea;
          activeSection = id;
        }
      });

      // Update active tab only if we have a clear winner and it's different
      if (activeSection && activeSection !== activeTab && maxVisibleArea > 0) {
        setActiveTab(activeSection as BotFormTabId);
      }
    };

    // Initial check
    handleScroll();

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [activeTab, setActiveTab, visibleDescriptors]);

  const loadingContent = (
    <div className="flex h-full flex-col items-center justify-center space-y-md">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Loading bot configuration...
      </p>
    </div>
  );

  const onRunBacktest = useCallback(
    async (cfg: BacktestConfig) => {
      if (cfg.mode === 'server') {
        // Use the existing handler from useFormHandlers which runs the server
        // mutation — and hand it what the dialog collected. Calling it bare
        // dropped every field the user picked, so each server run silently
        // tested the last 365 days at 1h with 0% slippage.
        await handleFormBacktest({
          timeframe: cfg.timeframe,
          startDate: cfg.startDate,
          endDate: cfg.endDate,
          slippagePercent: cfg.slippagePercent,
          userFee: cfg.userFee,
        });
      } else {
        try {
          if (!currentExchange) {
            throw new Error('Exchange not selected or unavailable');
          }
          if (currentExchange.provider === ExchangeEnum.ManualBacktesting) {
            throw new Error(
              'Manual Backtesting exchange cannot run local backtests'
            );
          }
          const resolvedPeriodName =
            cfg.periodId && !['auto', 'custom'].includes(cfg.periodId)
              ? getPeriod?.(cfg.periodId)?.name
              : undefined;
          toast.info('Local backtest start (this may take a while)');
          // Clear any prior result so the footer's "VIEW RESULTS" chip never
          // shows stale data while a fresh run is in flight.
          setBacktestResult(null);
          logger.info('[backtester] Local backtest start', {
            exchange: currentExchange?.provider,
            interval: cfg.timeframe,
            from: cfg.startDate,
            to: cfg.endDate,
            isGrid: isGridBot,
          });

          // Resolve pair and symbol metadata (common to both grid and DCA)
          const resolvedPairs: string[] = Array.isArray(formData.pair)
            ? formData.pair
            : typeof formData.pair === 'string' && formData.pair.trim()
              ? [formData.pair]
              : [];

          const symbols: Symbols[] = resolvedPairs.map((p) => {
            // `pairMetadata`/`pairMetadata.byPair` are keyed via
            // `normalizePairKey`, which strips `[\s/_-]` — not just `-`.
            // A dash-only strip leaves `_UM_XPERP` intact for X-Perp pairs
            // (`AAVE-USD_UM_XPERP`), so the lookup always missed for them.
            const normalized = normalizePairKey(p);
            const meta =
              (formData.pairMetadata ?? {})[normalized] ||
              pairMetadata?.byPair?.[normalized] ||
              null;
            // Fall back to the suffix-aware parser, not a midpoint slice of
            // the (possibly still contract-suffixed) normalized string.
            const fallback = extractPairAssets(p);
            const base = meta?.baseAsset?.name ?? fallback.baseAsset;
            const quote = meta?.quoteAsset?.name ?? fallback.quoteAsset;
            return {
              pair: p,
              baseAsset: {
                name: base,
                minAmount: meta?.baseAsset?.minAmount,
                maxAmount: meta?.baseAsset?.maxAmount,
                step: meta?.baseAsset?.step,
              },
              quoteAsset: {
                name: quote,
                minAmount: meta?.quoteAsset?.minAmount,
              },
              exchange: currentExchange?.provider,
              maxOrders: 200,
              priceAssetPrecision: meta?.priceAssetPrecision ?? 8,
            };
          });
          const persistenceSymbol = symbols[0];

          if (!Array.isArray(symbols) || symbols.length === 0) {
            logger.warn(
              '[backtester] No symbols available for local backtest',
              { resolvedPairs }
            );
            throw new Error('No symbols provided for backtest');
          }

          const primaryPair =
            persistenceSymbol?.pair ??
            (Array.isArray(formData.pair)
              ? formData.pair[0]
              : typeof formData.pair === 'string' && formData.pair.trim()
                ? formData.pair
                : '');

          const firstDataTime = new Date(cfg.startDate).getTime();
          const lastDataTime = new Date(cfg.endDate).getTime();

          const resolvedBacktestConfig: BacktestingSettings = {
            userFee: `${cfg.userFee ?? formData.userFee?.takerCommission ?? 0}`,
            slippage: `${cfg.slippagePercent ?? 0}`,
            RFR: cfg.RFR ?? '2',
            MAR: cfg.MAR ?? '7',
          };
          if (Number.isFinite(firstDataTime)) {
            resolvedBacktestConfig.firstDataTime = firstDataTime;
          }
          if (Number.isFinite(lastDataTime)) {
            resolvedBacktestConfig.lastDataTime = lastDataTime;
          }
          if (primaryPair) {
            resolvedBacktestConfig.pair = primaryPair;
          }

          const progressHandler = (
            progress: number,
            text?: string,
            step?: number
          ) => {
            logger.info('[backtester] progress', { progress, text, step });
            setBacktestProgress({
              progress,
              text: text ?? '',
              step: step ?? 0,
            });
          };
          const errorHandler = (msg: string) => {
            logger.error('[backtester] runtime error', { msg });
          };

          if (isGridBot) {
            // ── Grid Bot Local Backtest ──
            const gridSettings = {
              ...formData.grid,
              pair: primaryPair,
              name: formData.name || 'New Bot',
              // Legacy forces this flag true at backtest time (gridbot
              // `{ ...settings, updatedBudget: true }`). The form mapper
              // defaults it to `false` for edited/cloned bots (the stored
              // payload strips `updatedBudget`), which makes the backtester
              // fee-reduce the budget (`budget / (1 + userFee*100)`) and
              // diverge from legacy order sizes / ROI. Force true for parity.
              updatedBudget: true,
            } as unknown as Settings;

            const gridBacktesterInput: GRIDBacktestingInput = {
              exchange: currentExchange.provider,
              symbols,
              settings: gridSettings,
              userFee: +(cfg.userFee ?? formData.userFee?.takerCommission ?? 0),
              prices: getLocalPrices(),
              balances: queryBalances ?? [],
              interval: cfg.timeframe,
              from: firstDataTime,
              to: lastDataTime,
              slippage: cfg.slippagePercent ?? 0,
            };

            logger.info('[backtester] Grid local run settingsInput', {
              symbols: gridBacktesterInput.symbols?.map((s) => s.pair),
              interval: gridBacktesterInput.interval,
              from: gridBacktesterInput.from,
              to: gridBacktesterInput.to,
              gridSettings: {
                topPrice: gridSettings.topPrice,
                lowPrice: gridSettings.lowPrice,
                levels: gridSettings.levels,
                budget: gridSettings.budget,
                gridStep: gridSettings.gridStep,
              },
            });

            const gb = new GridBacktestingEngine(
              //@ts-expect-error different exchange enums between local types and backtester package
              gridBacktesterInput,
              progressHandler,
              errorHandler
            );
            gridBacktesterInstanceRef.current = gb;
            logger.info('[backtester] Grid backtester instance created');

            if (typeof gb.test === 'function') {
              logger.info('[backtester] Running grid test()...');
              const result = await gb.test(undefined, progressHandler);
              logger.info('[backtester] Grid test() returned');

              logger.info('[backtester] Grid backtest results', {
                result,
                summary:
                  result && typeof result === 'object'
                    ? {
                        profitTotalPerc: result.financial?.profitTotalPerc ?? 0,
                        transactions: result.numerical?.all ?? 0,
                        sharpe: result.ratios?.sharpe ?? 0,
                      }
                    : 'No result data',
              });

              toast.success('Grid backtest finished successfully');
              if (result) {
                try {
                  if (!persistenceSymbol || !currentExchange) {
                    throw new Error('Missing symbol metadata for persistence');
                  }
                  const typedResult =
                    result as unknown as GridBacktestingResult;

                  // Capture the fresh grid result for the redesigned modal
                  // BEFORE persistence strips its transaction/values arrays.
                  // Synthesize the History identity fields the grid tabs read
                  // (symbol / exchange / base / quote) from the run metadata.
                  const gridMeta: BacktestViewModelMeta = {
                    symbol: persistenceSymbol.pair,
                    exchange: currentExchange.provider,
                    baseAsset: persistenceSymbol.baseAsset?.name ?? '',
                    quoteAsset: persistenceSymbol.quoteAsset?.name ?? '',
                  };
                  const gridHistory = {
                    ...typedResult,
                    symbol: persistenceSymbol.pair,
                    baseAsset: persistenceSymbol.baseAsset?.name ?? '',
                    quoteAsset: persistenceSymbol.quoteAsset?.name ?? '',
                    exchange: currentExchange.provider,
                    // Mirror the persisted shape: the results header reads the
                    // REQUESTED window off `config` (a saved run always has it)
                    // to flag a run the venue's candle-history ceiling cut short.
                    config: { firstDataTime, lastDataTime },
                  } as unknown as GRIDBacktestingResultHistory;
                  setBacktestResult({
                    result: gridHistory,
                    strategy: 'Grid',
                    settings: gridSettings as unknown as DCABotSettings,
                    meta: gridMeta,
                    summary: {
                      netPerc: Number(
                        typedResult.financial?.profitTotalPerc ?? 0
                      ),
                      winRate: 0,
                      deals: 0,
                    },
                  });

                  const savedId = await persistGridBacktestResult({
                    result: typedResult,
                    config: resolvedBacktestConfig,
                    settings: gridSettings,
                    symbol: persistenceSymbol,
                    exchange: currentExchange,
                    ...(resolvedPeriodName
                      ? { periodName: resolvedPeriodName }
                      : {}),
                  });
                  toast.success('Grid backtest saved to server and Local Data');
                  if (savedId) {
                    onBacktestComplete?.(savedId);
                  }
                } catch (persistError) {
                  logger.error(
                    '[backtester] Failed to persist grid backtest result',
                    {
                      error:
                        persistError instanceof Error
                          ? {
                              message: persistError.message,
                              stack: persistError.stack,
                            }
                          : String(persistError),
                    }
                  );
                  const persistMessage =
                    persistError instanceof Error
                      ? persistError.message
                      : String(persistError);
                  toast.warning(
                    `Grid backtest finished but saving failed: ${persistMessage}`
                  );
                }
              }
              setBacktestProgress(null);
            } else {
              logger.info(
                '[backtester] Grid backtester has no test()/run() API'
              );
              toast.warning(
                'Grid backtest executed (no run/test API available)'
              );
              setBacktestProgress(null);
            }
          } else {
            // ── DCA / Combo Bot Local Backtest ──
            const mapped = mapFormDataToPayload(
              formData,
              { mode: 'create', debug: true },
              undefined,
              currentExchange ?? undefined
            );

            if (!mapped.success || mapped.errors?.length) {
              logger.warn('[backtester] Form-to-payload mapping errors', {
                errors: mapped.errors,
                warnings: mapped.warnings,
              });
            }

            const settingsFromMapping = mapped.createPayload;
            if (!settingsFromMapping) {
              const details = mapped.errors?.length
                ? mapped.errors.join('; ')
                : 'unknown reason';
              throw new Error(
                `Failed to map form data to backtest settings: ${details}`
              );
            }
            settingsFromMapping.indicators =
              settingsFromMapping.indicators ?? [];
            settingsFromMapping.indicatorGroups =
              settingsFromMapping.indicatorGroups ?? [];
            settingsFromMapping.multiTp = settingsFromMapping.multiTp ?? [];
            settingsFromMapping.multiSl = settingsFromMapping.multiSl ?? [];

            if (typeof settingsFromMapping.useMulti === 'boolean') {
              resolvedBacktestConfig.multiCombined =
                settingsFromMapping.useMulti;
              resolvedBacktestConfig.multiIdependent =
                settingsFromMapping.useMulti;
            }

            // A combo bot stores its settings in `formData.combo`, not
            // `formData.dca`, and must run with `combo: true` so the
            // backtester applies combo grid logic. Mirrors legacy
            // (useDCAPage `settingsInput`), which passes the bot's own
            // settings plus the real `combo` flag. Using `formData.dca` +
            // `combo: false` for a combo bot ran it as a plain DCA bot with
            // the empty DCA slice, producing trivial ~1% ROI deals.
            const isComboBacktest = formData.type === BotTypesEnum.combo;
            const backtestSettings = (
              isComboBacktest ? formData.combo : formData.dca
            ) as unknown as DCABotSettings;
            const backtesterInput: DCABacktestingInput = {
              exchange: currentExchange?.provider,
              symbols,
              settings: {
                ...backtestSettings,
                // The raw form slice keeps every indicator NUMBER param as a
                // STRING: `InlineIndicatorConfig` stores `newValue.toString()`
                // so a `$var` expression can share the field. It is
                // `mapFormDataToPayload` that coerces them back (its
                // `fieldsAsNumber` list), so a SAVED bot holds
                // `indicatorLength: 14` while the form the user is still
                // editing holds `'14'` — and the engine is not tolerant:
                // `new RSI('14')` returns `null` for every bar, so no crossing
                // ever fires and the run reports 0 deals. That is bug #559,
                // and it explains the reporter's own workaround (save, reopen
                // in Edit, backtest works) — reloading re-reads the coerced
                // values from the API.
                // Take the indicators from the mapped payload instead: it is
                // normalised exactly the way the backend receives them, and
                // pruned of the close indicators the active close condition
                // cannot use. `mapIndicatorGroupsFields` reads the combo slice
                // for combo bots, so this is correct for both bot types.
                indicators: settingsFromMapping.indicators,
                indicatorGroups: settingsFromMapping.indicatorGroups,
                name: formData.name,
                pair: [formData.pair].flat(),
              },
              userFee: +(cfg.userFee ?? formData.userFee?.takerCommission ?? 0),
              prices: getLocalPrices(),
              balances: queryBalances ?? [],
              interval: cfg.timeframe,
              from: firstDataTime,
              to: lastDataTime,
              slippage: cfg.slippagePercent ?? 0,
              combo: isComboBacktest,
              multi: settingsFromMapping?.useMulti ?? false,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            };

            logger.info('[backtester] Local run settingsInput', {
              symbols: backtesterInput.symbols?.map((s) => s.pair),
              interval: backtesterInput.interval,
              from: backtesterInput.from,
              to: backtesterInput.to,
            });

            const b = new DCABacktesting(
              //@ts-expect-error different exchange enums
              backtesterInput,
              progressHandler,
              errorHandler
            );
            backtesterInstanceRef.current = b;
            logger.info('[backtester] Backtester instance created', {
              instance: typeof b,
              hasStop: !!b.stopBacktest || !!b.stop,
            });
            // Prefer legacy API test(), then run()
            if (typeof b.test === 'function') {
              logger.info(
                '[backtester] Using legacy test() method on instance'
              );
              logger.info('[backtester] Running test()...');
              const result = await b.test(undefined, progressHandler);
              logger.info('[backtester] test() method returned');

              // Log the detailed backtest results
              logger.info('[backtester] Backtest results', {
                result,
                summary:
                  result && typeof result === 'object'
                    ? {
                        totalDeals: Array.isArray(result.deals)
                          ? result.deals.length
                          : 0,
                        profitLoss: result.financial.netProfitTotalPerc ?? 0,
                        winRate:
                          (result.numerical.profit / result.numerical.all) *
                          100,
                        maxDrawdown: result.financial.maxDrawDownPerc ?? 0,
                        sharpeRatio: result.ratios.sharpe ?? 0,
                      }
                    : 'No result data',
              });

              toast.success('Local backtest finished successfully');
              if (result) {
                try {
                  if (!persistenceSymbol || !currentExchange) {
                    throw new Error('Missing symbol metadata for persistence');
                  }
                  const typedResult = result as unknown as DCABacktestingResult;

                  const historySettings: DCABotSettings = {
                    ...(formData.type === BotTypesEnum.combo
                      ? (formData.combo as unknown as DCABotSettings)
                      : (formData.dca as unknown as DCABotSettings)),
                    name: formData.name,
                    pair: [formData.pair].flat() as string[],
                  };
                  // Capture the fresh result BEFORE it's persisted (and its
                  // deals/portfolio/buyAndHold stripped). Drives the footer
                  // "VIEW RESULTS" chip + the full modal. The summary is
                  // derived once from a VM so the chip needs no rebuild.
                  const dcaMeta: BacktestViewModelMeta = {
                    symbol: persistenceSymbol.pair,
                    exchange: currentExchange.provider,
                    baseAsset: persistenceSymbol.baseAsset?.name ?? '',
                    quoteAsset: persistenceSymbol.quoteAsset?.name ?? '',
                    // The window the user asked for. A saved result carries it
                    // as `config.firstDataTime/lastDataTime`; this fresh one
                    // doesn't, so the results header can only tell the user the
                    // run was cut short (venue history ceiling / late listing)
                    // if we hand it over here.
                    requestedFrom: firstDataTime,
                    requestedTo: lastDataTime,
                  };
                  const dcaVm = buildBacktestViewModel(
                    typedResult,
                    historySettings,
                    dcaMeta
                  );
                  setBacktestResult({
                    result: typedResult,
                    strategy:
                      formData.type === BotTypesEnum.combo ? 'Combo' : 'DCA',
                    settings: historySettings,
                    meta: dcaMeta,
                    summary: {
                      netPerc: dcaVm.netPerc,
                      winRate: dcaVm.winRate,
                      deals: dcaVm.deals,
                    },
                  });
                  const savedId = await persistBacktestResult({
                    result: typedResult,
                    config: resolvedBacktestConfig,
                    settings: settingsFromMapping,
                    historySettings,
                    symbol: persistenceSymbol,
                    exchange: currentExchange,
                    botType: formData.type,
                    ...(resolvedPeriodName
                      ? { periodName: resolvedPeriodName }
                      : {}),
                  });
                  toast.success('Backtest saved to server and Local Data');
                  if (savedId) {
                    onBacktestComplete?.(savedId);
                  }
                } catch (persistError) {
                  logger.error(
                    '[backtester] Failed to persist backtest result',
                    {
                      error:
                        persistError instanceof Error
                          ? {
                              message: persistError.message,
                              stack: persistError.stack,
                            }
                          : String(persistError),
                    }
                  );
                  const persistMessage =
                    persistError instanceof Error
                      ? persistError.message
                      : String(persistError);
                  toast.warning(
                    `Backtest finished but saving failed: ${persistMessage}`
                  );
                }
              }
              setBacktestProgress(null);
              logger.debug('[backtester] Backtest result:', result);
            } else {
              logger.info(
                '[backtester] Backtester executed without a test()/run() API'
              );
              toast.warning(
                'Local backtest executed (no run/test API available)'
              );
              setBacktestProgress(null);
            }
          }
        } catch (err: unknown) {
          logger.error('[backtester] Local backtest error', {
            error:
              err instanceof Error
                ? { message: err.message, stack: err.stack }
                : String(err),
            formData,
            settings: cfg,
          });
          const message = err instanceof Error ? err.message : String(err);
          toast.error(`Local backtest not available: ${message}`);
          setBacktestProgress(null);
        }
      }
    },
    [
      currentExchange,
      formData,
      getPeriod,
      handleFormBacktest,
      isGridBot,
      pairMetadata.byPair,
      persistBacktestResult,
      persistGridBacktestResult,
      queryBalances,
      onBacktestComplete,
    ]
  );

  const isContentReadOnly = mode === 'edit' ? isReadOnly : false;

  // Memoized so unrelated re-renders of BotFormShell don't hand every
  // section a fresh props object. Identity still changes when formData
  // (or any other listed input) changes — that's expected; the win is
  // for renders that don't touch these values. The functions below
  // (updateFormData, isFieldLocked, getBalanceFn, handleUpdateBalances,
  // handleTabChangeWithScroll) are already stable references.
  const componentProps = useMemo<BotFormTabComponentProps>(
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
      handleUpdateBalances,
      exchangesData: exchanges,
      exchangesLoading,
      activeTab,
      onTabChange: handleTabChangeWithScroll,
      features,
    }),
    [
      currentExchange,
      formData,
      updateFormData,
      errors,
      mode,
      isFieldLocked,
      getBalanceFn,
      bot,
      handleUpdateBalances,
      exchanges,
      exchangesLoading,
      activeTab,
      handleTabChangeWithScroll,
      features,
    ]
  );

  // For terminal mode, only hide navigation if it's "simple" mode (only basic tab)
  const hasManualNavigation =
    !hideSectionNavigation &&
    quickSetupMode !== 'quick' &&
    (!isTerminal || visibleDescriptors.length > 1);
  // The sticky header is shown in both modes when the form supports
  // the Quick/Manual toggle (DCA create) — even in Quick mode it
  // shows a title + alerts + the mode toggle, anchored to the top.
  const showQuickHeader =
    !hideSectionNavigation &&
    quickSetupMode === 'quick' &&
    mode === 'create' &&
    (botExperience.id === BotTypesEnum.dca ||
      botExperience.id === BotTypesEnum.combo ||
      botExperience.id === BotTypesEnum.grid) &&
    !isNestedLeg;
  const showStickyHeader = hasManualNavigation || showQuickHeader;
  const showModeToggle =
    mode === 'create' &&
    (botExperience.id === BotTypesEnum.dca ||
      botExperience.id === BotTypesEnum.combo ||
      botExperience.id === BotTypesEnum.grid) &&
    !isNestedLeg &&
    // Legacy parity: no Quick/Manual toggle for terminal Simple or Import.
    !(isTerminal && (isTerminalSimpleSelected || isTerminalImportSelected));

  const [headerRef, headerWidth] = useContainerWidth();
  // Width thresholds below which we strip text from the header so the
  // Quick/Manual toggle keeps fitting on one line beside the title.
  const compactToggle = headerWidth > 0 && headerWidth < 280;
  const hideTitleText = headerWidth > 0 && headerWidth < 200;

  const [allStrategiesState, setAllStrategiesState] =
    useState<AllStrategiesPanelState>({ open: false, botType: null });
  const allStrategiesCtxValue = useMemo<AllStrategiesPanelContextValue>(
    () => ({
      state: allStrategiesState,
      openPanel: (botType) => setAllStrategiesState({ open: true, botType }),
      closePanel: () => setAllStrategiesState({ open: false, botType: null }),
    }),
    [allStrategiesState]
  );
  const allStrategiesOpen =
    allStrategiesState.open && allStrategiesState.botType !== null;

  const shellContent = (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-full flex-col">
          {(showStickyHeader || allStrategiesOpen) && (
            <motion.div
              className="sticky top-2 z-30 mb-3 mx-1 rounded-lg bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div ref={headerRef} className="flex items-center gap-2">
                {allStrategiesOpen ? (
                  <Slot
                    name="bots.all-strategies.header"
                    botType={allStrategiesState.botType ?? ''}
                    onBack={allStrategiesCtxValue.closePanel}
                  />
                ) : (
                  <>
                    <div className="flex flex-1 min-w-0 items-center gap-1">
                      {showQuickHeader ? (
                        <div className="flex min-w-0 items-center gap-xs px-1">
                          <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {!hideTitleText && (
                            <h2 className="truncate text-sm font-semibold">
                              Quick Setup
                            </h2>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <ScrollableFormTabNavigation
                            tabs={navigationTabs}
                            activeTab={activeTab}
                            onTabChange={handleTabChangeWithScroll}
                          />
                        </div>
                      )}
                      <BotFormAlertButton />
                    </div>
                    {showModeToggle && (
                      <div className="flex shrink-0 items-center">
                        <QuickModeToggle compact={compactToggle} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}

          <div className="flex-1 min-h-0">
            {allStrategiesOpen ? (
              <div className="h-full px-2 pb-2">
                <Slot
                  name="bots.all-strategies.body"
                  botType={allStrategiesState.botType ?? ''}
                />
              </div>
            ) : (
              <div
                ref={scrollContainerRef}
                className="custom-scrollbar h-full overflow-y-auto px-2"
              >
                {isPlacingOrders && gridPlacementProgress ? (
                  <BotPlacementProgress progress={gridPlacementProgress} />
                ) : (
                  <>
                {isContentReadOnly && (
                  <div className="mb-4 flex items-center gap-xs rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    <span>Fields are locked. Press Edit to make changes.</span>
                  </div>
                )}

                <fieldset
                  disabled={isContentReadOnly}
                  className="m-0 border-0 p-0 space-y-md pb-2"
                  aria-disabled={isContentReadOnly}
                >
                  {quickSetupMode === 'quick' &&
                    (isGridBot ? (
                      <QuickGridBotForm
                        currentExchange={currentExchange}
                        {...(exchanges !== undefined
                          ? { exchangesData: exchanges }
                          : {})}
                        {...(exchangesLoading !== undefined
                          ? { exchangesLoading }
                          : {})}
                        errors={errors}
                      />
                    ) : (
                      <QuickBotForm
                        currentExchange={currentExchange}
                        {...(exchanges !== undefined
                          ? { exchangesData: exchanges }
                          : {})}
                        {...(exchangesLoading !== undefined
                          ? { exchangesLoading }
                          : {})}
                        errors={errors}
                        slice={isComboBot ? 'combo' : 'dca'}
                      />
                    ))}
                  {visibleDescriptors.map((descriptor) => {
                    const SectionComponent = descriptor.Component;
                    const toggleField = sectionToggleMap[
                      descriptor.id
                    ] as keyof BotFormData['dca'];
                    const hasToggle = toggleField !== undefined;
                    const toggleEnabled = hasToggle
                      ? isComboBot
                        ? Boolean(formData['combo'][toggleField])
                        : isGridBot
                          ? Boolean(
                              formData['grid'][
                                toggleField as unknown as keyof BotFormData['grid']
                              ]
                            )
                          : Boolean(formData['dca'][toggleField])
                      : false;

                    return (
                      <div
                        key={descriptor.id}
                        ref={(el) => {
                          sectionRefs.current[descriptor.id] = el;
                        }}
                        id={`section-${descriptor.id}`}
                        className={cn(
                          'transition-opacity scroll-mt-4',
                          isContentReadOnly ? 'opacity-75' : ''
                        )}
                        data-form-readonly={
                          isContentReadOnly ? 'true' : 'false'
                        }
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
                          collapseDisabled={isContentReadOnly}
                          hasToggle={hasToggle}
                          toggleChecked={toggleEnabled}
                          onToggleChange={(checked) =>
                            updateFormData(toggleField, checked)
                          }
                          toggleDisabled={
                            isContentReadOnly || !!isFieldLocked(toggleField)
                          }
                          toggleId={`toggle-${descriptor.id}`}
                          className={cn(
                            isTerminalSimpleSelected &&
                              descriptor.id === 'basic'
                              ? 'mt-2'
                              : ''
                          )}
                        />
                        {!isSectionCollapsed(descriptor.id) && (
                          <SectionComponent {...componentProps} />
                        )}
                      </div>
                    );
                  })}
                </fieldset>
                  </>
                )}
              </div>
            )}
          </div>

          <motion.div
            initial={footerOverride ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            {shouldWarnRestart && !allStrategiesOpen && (
              <Alert className="mb-4">
                <RotateCcw className="h-5 w-5 text-muted-foreground" />
                <AlertTitle>Bot restart required</AlertTitle>
                <AlertDescription>
                  {requiresActiveRestartConfirmation
                    ? 'These changes will require restarting the bot. You will be asked to confirm before saving.'
                    : 'These changes will require a bot restart before they take effect. Save the changes, then restart the bot when ready.'}
                </AlertDescription>
              </Alert>
            )}
            {!hideFooter && !allStrategiesOpen && (
              <BotFormFooter
                currentExchange={currentExchange}
                botType={
                  isGridBot
                    ? BotTypesEnum.grid
                    : isComboBot
                      ? BotTypesEnum.combo
                      : BotTypesEnum.dca
                }
                formData={formData}
                mode={mode}
                errors={errors}
                submitLabel={footerOverride?.submitLabel ?? submitLabel}
                submitDisabled={
                  footerOverride?.submitDisabled ??
                  (submitDisabled || isPlacingOrders)
                }
                submitIsPending={
                  footerOverride?.submitIsPending ?? submitIsPending
                }
                onSubmit={footerOverride?.onSubmit ?? handleSubmit}
                backtestPending={
                  footerOverride?.backtestPending ?? backtestPending
                }
                onBacktest={footerOverride?.onBacktest ?? onBacktestClick}
                // Hedge passes its own runner through the override so
                // direct-run / progress / cancel hit the hedge engine
                // instead of the DCA one wired up at this layer.
                onRunBacktestDirect={
                  footerOverride?.onRunBacktestDirect ?? onRunBacktest
                }
                backtestProgress={
                  footerOverride?.backtestProgress ?? backtestProgress
                }
                onCancelBacktest={
                  footerOverride?.onCancelBacktest ?? cancelLocalBacktest
                }
                backtestSummary={
                  footerOverride?.backtestSummary ?? backtestSummary
                }
                onViewResults={
                  footerOverride?.onViewResults ??
                  (() => setResultsModalOpen(true))
                }
                onDismissResults={
                  footerOverride?.onDismissResults ??
                  (() => {
                    setBacktestResult(null);
                    setResultsModalOpen(false);
                  })
                }
                onLoadTemplate={handleLoadTemplate}
                onToggleStatus={
                  footerOverride?.onToggleStatus ??
                  (mode === 'edit' ? handleStatusToggle : undefined)
                }
                toggleDisabled={
                  footerOverride?.toggleDisabled ??
                  (statusToggleMutation.isPending ||
                    !botId ||
                    (isPlacingOrders &&
                      !gridPlacementProgress?.isAllowedToCancel))
                }
                togglePending={
                  footerOverride?.togglePending ??
                  statusToggleMutation.isPending
                }
                botStatus={footerOverride?.botStatus ?? bot?.status ?? null}
                bot={botForOperations}
                menuConfig={
                  footerOverride?.menuConfig !== undefined
                    ? footerOverride.menuConfig
                    : variant === 'panel'
                      ? panelMenuConfig
                      : null
                }
                showCredits={
                  footerOverride?.showCredits ??
                  (mode === 'create' &&
                    !(isTerminal && isTerminalSimpleSelected))
                }
                hideTemplates={footerOverride?.hideTemplates ?? false}
                creditsMultiplier={footerOverride?.creditsMultiplier ?? 1}
                {...(footerOverride?.activeDeals !== undefined
                  ? { activeDealsOverride: footerOverride.activeDeals }
                  : {})}
              />
            )}
          </motion.div>
        </div>
      </div>

      <ConfirmationDialog
        open={showRestartDialog}
        onOpenChange={setShowRestartDialog}
        title="Confirm restart"
        description="These updates require restarting the bot. Do you want to proceed?"
        confirmText="Continue"
        cancelText="Cancel"
        onConfirm={resumeSaveAfterConfirmation}
      />
      <ConfirmationDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset to defaults?"
        description="This resets all settings to their defaults and cannot be undone."
        confirmText="Reset"
        variant="destructive"
        onConfirm={() => {
          setFormData(createDefaultFormState(mode, isTerminal));
          toast.success('Settings reset to defaults');
        }}
      />
      <BotSettingsImportExportDialog
        open={showImportExportDialog}
        onOpenChange={setShowImportExportDialog}
        botTypeLabel={botExperience.label ?? 'Bot'}
        mode={mode}
        initialJson={handleExportToDialog() ?? undefined}
        onImport={handleImportFromDialog}
        onExport={() => {
          const result = handleExportToDialog();
          if (!result)
            throw new Error('Failed to generate bot settings export payload.');
          return result;
        }}
      />

      {/* Templates now rendered inside the footer as a dedicated dropdown */}
      <ShareBotDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        botId={botId}
        botName={botShareName ?? widgetValue.primary?.toString()}
        botType={botTypeEnum}
        initialShareEnabled={botShareEnabled}
        initialShareId={botShareId}
      />
      <BacktestSettingsDialog
        open={showBacktestDialog}
        initialData={backtestDialogInitial}
        onClose={() => setShowBacktestDialog(false)}
        formData={formData}
        backtestProgress={backtestProgress}
        onCancelLocal={cancelLocalBacktest}
        onRun={onRunBacktest}
      />
      {backtestResult && (
        <BacktestResultsFullModal
          open={resultsModalOpen}
          onOpenChange={setResultsModalOpen}
          result={backtestResult.result}
          strategy={backtestResult.strategy}
          settings={backtestResult.settings}
          meta={backtestResult.meta}
        />
      )}
      {/* <SmartOrderMergeDialog
        open={showSmartOrderMergeDialog}
        onOpenChange={handleSmartOrderMergeDialogChange}
        onConfirm={handleSmartOrderMergeConfirm}
        deals={mergeEligibleDeals}
        isProcessing={smartOrderMergePending}
        {...(smartOrderMergeDefaults
          ? { defaultSelectedIds: smartOrderMergeDefaults }
          : {})}
        {...(mergeBotName ? { botName: mergeBotName } : {})}
        {...(mergeDialogMessage ? { extraMessage: mergeDialogMessage } : {})}
      /> */}
      <AddFundsDialog
        open={fundsDialogMode === 'add'}
        onOpenChange={handleAddFundsDialogChange}
        onConfirm={handleFundsDialogConfirm}
        isProcessing={false}
        {...(fundsTargetName ? { targetName: fundsTargetName } : {})}
        {...(baseAsset ? { baseAsset } : {})}
        {...(quoteAsset ? { quoteAsset } : {})}
      />
      <ReduceFundsDialog
        open={fundsDialogMode === 'reduce'}
        onOpenChange={handleReduceFundsDialogChange}
        onConfirm={handleFundsDialogConfirm}
        isProcessing={false}
        {...(fundsTargetName ? { targetName: fundsTargetName } : {})}
        {...(baseAsset ? { baseAsset } : {})}
        {...(quoteAsset ? { quoteAsset } : {})}
      />
      {!isTerminal && (
        <Celebration
          open={showCelebration}
          onClose={handleCelebrationClose}
          title="🎉 Bot Created Successfully!"
          description="Your new bot is ready to go. You can start it now or make additional adjustments first."
          primaryAction={{
            label: 'Start bot',
            onClick: handleCelebrationStartBot,
          }}
          secondaryAction={{
            label: 'Close',
            variant: 'outline',
          }}
        />
      )}
    </>
  );

  // Mobile variant: full-screen layout with tight margins and sticky header/footer
  // When hideSectionNavigation is true, we're embedded in a parent layout that provides
  // its own container, so we use relative positioning instead of fixed
  const mobileContent = (
    <div
      className={cn(
        'flex flex-col bg-background',
        hideSectionNavigation ? 'h-full' : 'fixed inset-0 z-50'
      )}
    >
      {/* Sticky header with navigation - hidden when parent provides tabs */}
      {showStickyHeader && (
        <motion.div
          className="sticky top-2 z-10 mx-2 mt-2 rounded-lg bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur safe-area-inset-top supports-[backdrop-filter]:bg-background/80"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <div className="flex flex-1 min-w-0 items-center gap-1">
              {showQuickHeader ? (
                <div className="flex items-center gap-xs px-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Quick Setup</h2>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <ScrollableFormTabNavigation
                    tabs={navigationTabs}
                    activeTab={activeTab}
                    onTabChange={handleTabChangeWithScroll}
                  />
                </div>
              )}
              <BotFormAlertButton />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {showModeToggle && <QuickModeToggle />}
              <BotFormAlertButton />
            </div>
          </div>
        </motion.div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="custom-scrollbar h-full overflow-y-auto px-3 mobile-bottom-nav-padding"
        >
          {isContentReadOnly && (
            <div className="my-3 flex items-center gap-xs rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Fields are locked. Press Edit to make changes.</span>
            </div>
          )}

          <fieldset
            disabled={isContentReadOnly}
            className="m-0 border-0 p-0 space-y-lg py-3"
            aria-disabled={isContentReadOnly}
          >
            {quickSetupMode === 'quick' &&
              (isGridBot ? (
                <QuickGridBotForm
                  currentExchange={currentExchange}
                  {...(exchanges !== undefined
                    ? { exchangesData: exchanges }
                    : {})}
                  {...(exchangesLoading !== undefined
                    ? { exchangesLoading }
                    : {})}
                  errors={errors}
                />
              ) : (
                <QuickBotForm
                  currentExchange={currentExchange}
                  {...(exchanges !== undefined
                    ? { exchangesData: exchanges }
                    : {})}
                  {...(exchangesLoading !== undefined
                    ? { exchangesLoading }
                    : {})}
                  errors={errors}
                  slice={isComboBot ? 'combo' : 'dca'}
                />
              ))}
            {visibleDescriptors.map((descriptor) => {
              const SectionComponent = descriptor.Component;

              const toggleField = sectionToggleMap[
                descriptor.id
              ] as keyof BotFormData['dca'];
              const hasToggle = toggleField !== undefined;
              const toggleEnabled = hasToggle
                ? isComboBot
                  ? Boolean(formData['combo'][toggleField])
                  : isGridBot
                    ? Boolean(
                        formData['grid'][
                          toggleField as unknown as keyof BotFormData['grid']
                        ]
                      )
                    : Boolean(formData['dca'][toggleField])
                : false;
              return (
                <div
                  key={descriptor.id}
                  ref={(el) => {
                    sectionRefs.current[descriptor.id] = el;
                  }}
                  id={`section-${descriptor.id}`}
                  className={cn(
                    'transition-opacity scroll-mt-16',
                    isContentReadOnly ? 'opacity-75' : ''
                  )}
                  data-form-readonly={isContentReadOnly ? 'true' : 'false'}
                  data-section-id={descriptor.id}
                >
                  <div className="mb-3 border-t-2 border-primary/60 pt-3 pb-2 bg-primary/10 rounded-lg px-3 -mx-2">
                    <div className="flex items-start justify-between gap-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-xs">
                          <descriptor.icon className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-xs flex-wrap">
                              <h2 className="text-base font-semibold leading-tight">
                                {descriptor.label}
                              </h2>
                              {(descriptor.tooltipText ||
                                descriptor.description) && (
                                <Tooltip
                                  tooltip={
                                    descriptor.tooltipText ??
                                    descriptor.description ??
                                    ''
                                  }
                                  {...(descriptor.tooltipUrl
                                    ? {
                                        tooltipURL: descriptor.tooltipUrl,
                                      }
                                    : {})}
                                >
                                  <InfoIcon />
                                </Tooltip>
                              )}
                            </div>
                            {(descriptor.id === 'stop-loss' ||
                              descriptor.id === 'take-profit' ||
                              descriptor.id === 'dca') &&
                              useRiskReward && (
                                <SettingsAlert title="Disabled by Risk:Reward module" />
                              )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-xs self-start pt-0.5 shrink-0">
                        {(hasToggle ? toggleEnabled : true) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            aria-expanded={!isSectionCollapsed(descriptor.id)}
                            aria-controls={`section-${descriptor.id}`}
                            onClick={() =>
                              toggleSectionCollapsed(descriptor.id)
                            }
                            disabled={isContentReadOnly}
                            className={cn(
                              'p-0',
                              isContentReadOnly ? 'opacity-50' : 'opacity-100'
                            )}
                            title={
                              isSectionCollapsed(descriptor.id)
                                ? 'Expand section'
                                : 'Collapse section'
                            }
                          >
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform',
                                isSectionCollapsed(descriptor.id)
                                  ? 'rotate-0'
                                  : 'rotate-180'
                              )}
                            />
                          </Button>
                        )}
                        {hasToggle && (
                          <div className="flex items-center gap-xs">
                            <Switch
                              checked={toggleEnabled}
                              onCheckedChange={(checked: boolean) =>
                                updateFormData(toggleField, checked)
                              }
                              disabled={isContentReadOnly}
                              id={`toggle-${descriptor.id}`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isSectionCollapsed(descriptor.id) && (
                    <SectionComponent {...componentProps} />
                  )}
                </div>
              );
            })}
          </fieldset>
        </div>
      </div>

      {/* Sticky footer */}
      {!hideFooter && (
        <motion.div
          className="sticky bottom-0 z-10 bg-background border-t border-border px-2 pb-2 safe-area-inset-bottom"
          initial={footerOverride ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {shouldWarnRestart && (
            <Alert className="mb-2 mx-1">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <AlertTitle className="text-sm">Bot restart required</AlertTitle>
              <AlertDescription className="text-xs">
                {requiresActiveRestartConfirmation
                  ? 'Changes will require restarting the bot.'
                  : 'Changes require a bot restart to take effect.'}
              </AlertDescription>
            </Alert>
          )}
          <BotFormFooter
            currentExchange={currentExchange}
            botType={
              isGridBot
                ? BotTypesEnum.grid
                : isComboBot
                  ? BotTypesEnum.combo
                  : BotTypesEnum.dca
            }
            formData={formData}
            mode={mode}
            errors={errors}
            submitLabel={footerOverride?.submitLabel ?? submitLabel}
            submitDisabled={footerOverride?.submitDisabled ?? submitDisabled}
            submitIsPending={footerOverride?.submitIsPending ?? submitIsPending}
            onSubmit={footerOverride?.onSubmit ?? handleSubmit}
            backtestPending={footerOverride?.backtestPending ?? backtestPending}
            onBacktest={footerOverride?.onBacktest ?? onBacktestClick}
            onRunBacktestDirect={
              footerOverride?.onRunBacktestDirect ?? onRunBacktest
            }
            backtestProgress={
              footerOverride?.backtestProgress ?? backtestProgress
            }
            onCancelBacktest={
              footerOverride?.onCancelBacktest ?? cancelLocalBacktest
            }
            backtestSummary={
              footerOverride?.backtestSummary ?? backtestSummary
            }
            onViewResults={
              footerOverride?.onViewResults ?? (() => setResultsModalOpen(true))
            }
            onDismissResults={
              footerOverride?.onDismissResults ??
              (() => {
                setBacktestResult(null);
                setResultsModalOpen(false);
              })
            }
            onLoadTemplate={handleLoadTemplate}
            onToggleStatus={
              footerOverride?.onToggleStatus ??
              (mode === 'edit' ? handleStatusToggle : undefined)
            }
            toggleDisabled={
              footerOverride?.toggleDisabled ??
              (statusToggleMutation.isPending || !botId)
            }
            togglePending={
              footerOverride?.togglePending ?? statusToggleMutation.isPending
            }
            botStatus={footerOverride?.botStatus ?? bot?.status ?? null}
            bot={botForOperations}
            menuConfig={
              footerOverride?.menuConfig !== undefined
                ? footerOverride.menuConfig
                : panelMenuConfig
            }
            showCredits={
              footerOverride?.showCredits ??
              (mode === 'create' && !(isTerminal && isTerminalSimpleSelected))
            }
            hideTemplates={footerOverride?.hideTemplates ?? false}
            creditsMultiplier={footerOverride?.creditsMultiplier ?? 1}
            {...(footerOverride?.activeDeals !== undefined
              ? { activeDealsOverride: footerOverride.activeDeals }
              : {})}
            compactThreshold={280}
          />
        </motion.div>
      )}

      {/* Dialogs - same as shellContent */}
      <ConfirmationDialog
        open={showRestartDialog}
        onOpenChange={setShowRestartDialog}
        title="Confirm restart"
        description="These updates require restarting the bot. Do you want to proceed?"
        confirmText="Continue"
        cancelText="Cancel"
        onConfirm={resumeSaveAfterConfirmation}
      />
      <ConfirmationDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset to defaults?"
        description="This resets all settings to their defaults and cannot be undone."
        confirmText="Reset"
        variant="destructive"
        onConfirm={() => {
          setFormData(createDefaultFormState(mode, isTerminal));
          toast.success('Settings reset to defaults');
        }}
      />
      <BotSettingsImportExportDialog
        open={showImportExportDialog}
        onOpenChange={setShowImportExportDialog}
        botTypeLabel={botExperience.label ?? 'Bot'}
        mode={mode}
        initialJson={handleExportToDialog() ?? undefined}
        onImport={handleImportFromDialog}
        onExport={() => {
          const result = handleExportToDialog();
          if (!result)
            throw new Error('Failed to generate bot settings export payload.');
          return result;
        }}
      />
      <ShareBotDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        botId={botId}
        botName={botShareName ?? widgetValue.primary?.toString()}
        botType={botTypeEnum}
        initialShareEnabled={botShareEnabled}
        initialShareId={botShareId}
      />
      <BacktestSettingsDialog
        open={showBacktestDialog}
        initialData={backtestDialogInitial}
        onClose={() => setShowBacktestDialog(false)}
        formData={formData}
        backtestProgress={backtestProgress}
        onCancelLocal={cancelLocalBacktest}
        onRun={onRunBacktest}
      />
      {backtestResult && (
        <BacktestResultsFullModal
          open={resultsModalOpen}
          onOpenChange={setResultsModalOpen}
          result={backtestResult.result}
          strategy={backtestResult.strategy}
          settings={backtestResult.settings}
          meta={backtestResult.meta}
        />
      )}
      {/* <SmartOrderMergeDialog
        open={showSmartOrderMergeDialog}
        onOpenChange={handleSmartOrderMergeDialogChange}
        onConfirm={handleSmartOrderMergeConfirm}
        deals={mergeEligibleDeals}
        isProcessing={smartOrderMergePending}
        {...(smartOrderMergeDefaults
          ? { defaultSelectedIds: smartOrderMergeDefaults }
          : {})}
        {...(mergeBotName ? { botName: mergeBotName } : {})}
        {...(mergeDialogMessage ? { extraMessage: mergeDialogMessage } : {})}
      /> */}
      <AddFundsDialog
        open={fundsDialogMode === 'add'}
        onOpenChange={handleAddFundsDialogChange}
        onConfirm={handleFundsDialogConfirm}
        isProcessing={false}
        {...(fundsTargetName ? { targetName: fundsTargetName } : {})}
        {...(baseAsset ? { baseAsset } : {})}
        {...(quoteAsset ? { quoteAsset } : {})}
      />
      <ReduceFundsDialog
        open={fundsDialogMode === 'reduce'}
        onOpenChange={handleReduceFundsDialogChange}
        onConfirm={handleFundsDialogConfirm}
        isProcessing={false}
        {...(fundsTargetName ? { targetName: fundsTargetName } : {})}
        {...(baseAsset ? { baseAsset } : {})}
        {...(quoteAsset ? { quoteAsset } : {})}
      />
      <Celebration
        open={showCelebration}
        onClose={handleCelebrationClose}
        title="🎉 Bot Created Successfully!"
        description="Your new bot is ready to go. You can start it now or make additional adjustments first."
        primaryAction={{
          label: 'Start bot',
          onClick: handleCelebrationStartBot,
        }}
        secondaryAction={{
          label: 'Close',
          variant: 'outline',
        }}
      />
    </div>
  );

  if (isLoading) {
    if (variant === 'panel') {
      return <div className="flex h-full flex-col">{loadingContent}</div>;
    }

    if (variant === 'mobile') {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {loadingContent}
        </div>
      );
    }

    return (
      <WidgetWrapper
        metadata={{
          ...widgetMetadata,
          title: widgetTitle,
          value: widgetValue,
        }}
        isEditable={isEditable}
        onCollapse={onCollapse || (() => {})}
        onTabMove={onTabMove || (() => {})}
        menuActions={resolvedMenuActions}
        className="h-full"
      >
        {loadingContent}
      </WidgetWrapper>
    );
  }

  let rendered: React.ReactNode;
  if (variant === 'mobile') {
    rendered = mobileContent;
  } else if (variant === 'panel') {
    rendered = shellContent;
  } else {
    rendered = (
      <WidgetWrapper
        metadata={{
          ...widgetMetadata,
          title: widgetTitle,
          value: widgetValue,
        }}
        isEditable={isEditable}
        onCollapse={onCollapse || (() => {})}
        onTabMove={onTabMove || (() => {})}
        menuActions={resolvedMenuActions}
        className="h-full"
      >
        {shellContent}
      </WidgetWrapper>
    );
  }

  return (
    <AllStrategiesPanelContext.Provider value={allStrategiesCtxValue}>
      {/* Rendered above every variant (widget / panel / mobile) so the
          restore is announced exactly once, whatever shell the form is in. */}
      <DraftRestoredNotice
        savedAt={draftRestoredAt}
        onKeep={dismissDraftNotice}
        onDiscard={discardDraft}
      />
      {rendered}
    </AllStrategiesPanelContext.Provider>
  );
};

BotForm.displayName = 'BotFormShell';

export default BotForm;
export { BotForm as BotFormShell };
export type { BotFormProps };
