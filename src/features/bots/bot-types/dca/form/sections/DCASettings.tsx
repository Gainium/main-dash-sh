import { DynamicArIndicatorConfig } from '@/components/indicators/DynamicArIndicatorConfig';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { StatsBoxes } from '@/components/ui/StatsBoxes';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow, {
    SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import {
    DealOverviewGraphTab,
    DealOverviewTableTab,
    formatTotalFunds,
    useDealOverviewData,
} from '@/components/widgets/trading/DealOverview';
import {
    useBotFormSelector,
    useBotFormState,
    useOptionalBotFormState,
    type BotFormMode,
    type BotFormUpdateValue,
    type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { InputButtonsSlider } from '@/features/bots/shared/components/InputButtonsSlider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
    useBotDcaProjection,
    type BotDcaProjection,
} from '@/hooks/bots/dca/useBotDcaProjection';
import {
    resolveBaseOrderContext,
    useDcaTradingContext,
    type DcaTradingContext,
} from '@/hooks/bots/dca/useDcaTradingContext';
import {
    useBotVarBinding,
    type DCACustomVarBindingPath,
    type IndicatorsVarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import {
    useIndicatorSelector,
    type OpenIndicatorSelectorOptions,
} from '@/hooks/useIndicatorSelector';
import type { DcaBot } from '@/types/dcaBot';
/* import { indicatorStore } from '@/stores/indicatorStore'; */
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { logger } from '@/lib/loggerInstance';
import {
    BotTypesEnum,
    DCAConditionEnum,
    DCAVolumeType,
    ExchangeIntervals,
    IndicatorAction,
    IndicatorEnum,
    IndicatorSection,
    IndicatorsLogicEnum,
    OrderSizeTypeEnum,
    ScaleDcaTypeEnum,
    StrategyEnum,
    timeIntervalMap,
    type DCACustom,
    type ExchangeInUser,
    type SettingsIndicators,
} from '@/types';
import { CloseConditionEnum } from '@/types/bots/dealConditions';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';
import type { IndicatorConfig } from '@/types/indicators';
import {
    getIndicatorDefaultParams,
    getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
    describeStepCeiling,
    MAX_DCA_ORDER_STEP_PERCENT,
    resolveStepSliderMax,
} from '@/utils/bots/dca/ranges';
import {
    buildSmartOrdersHelperMessage,
    deriveSmartOrdersRange,
} from '@/utils/bots/dca/smart-orders';
import { sanitizeIndicatorParams } from '@/utils/indicators/indicatorConfigUtils';
import { withFieldDefaults } from '@/utils/indicators/indicatorFieldGating';
import {
    AlertTriangle,
    Crosshair,
    DollarSign,
    Trash2,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import SettingsAlert from '../../../../../../components/ui/SettingsAlert';
import {
    formatNumericInput,
    formatRange,
    useTerminalControls,
} from '../hooks/useTerminalControls';
import type { TerminalControlsToolkit } from '../hooks/useTerminalControls.types';
import { DcaOrderSizingControl } from './DcaOrderSizingControl';

const MINIMUM_DEVIATION_MIN = 0;

// Cloning a start-DCA indicator needs several distinct ids in one call, so the
// `dca-indicator-${Date.now()}` scheme would collide. Same shape as the helper
// in BotControllerSettings.tsx / DynamicArIndicatorPanel.tsx.
const createDcaIndicatorId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `dca-indicator-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// The guard is a FLOOR on ATR/ADR spacing, so it can never sensibly exceed the
// widest step the ladder itself allows — it rides the same dynamic ceiling
// rather than the flat 10% it used to carry.
const clampMinimumDeviation = (value: number, max: number) =>
  Math.min(max, Math.max(MINIMUM_DEVIATION_MIN, value));

const formatMinimumDeviation = (value: number, max: number) =>
  formatNumericInput(clampMinimumDeviation(value, max), 2);

const normalizeCloseCondition = (
  value?: BotFormData['dca']['dealCloseCondition'] | string | null
): CloseConditionEnum => {
  if (!value) {
    return CloseConditionEnum.tp;
  }

  if (typeof value === 'string' && value === 'percentage') {
    return CloseConditionEnum.tp;
  }

  if (Object.values(CloseConditionEnum).includes(value as CloseConditionEnum)) {
    return value as CloseConditionEnum;
  }

  return CloseConditionEnum.tp;
};

const canDisplayRequiredChange = ({
  dealCloseCondition,
  useTp,
  useMultiTp,
  orderSizeType,
}: {
  dealCloseCondition: CloseConditionEnum | undefined;
  useTp: boolean;
  useMultiTp: boolean | undefined;
  orderSizeType: OrderSizeTypeEnum;
}) => {
  const closeCondition = normalizeCloseCondition(dealCloseCondition);
  return Boolean(
    useTp &&
    closeCondition === CloseConditionEnum.tp &&
    !useMultiTp &&
    !['percFree', 'percTotal'].includes(orderSizeType)
  );
};

interface SmartOrdersControlProps {
  idPrefix: string;
  //formData: BotFormData;
  updateFormData: DCASettingsProps['updateFormData'];
  errors: Record<string, string>;
  tradingContext?: DcaTradingContext;
}

const SmartOrdersControl: React.FC<SmartOrdersControlProps> = ({
  idPrefix,
  //formData,
  updateFormData,
  //errors,
  tradingContext,
}) => {
  const useSmartOrders = useBotFormSelector('useSmartOrders');
  const useMulti = useBotFormSelector('useMulti');
  const ordersCount = useBotFormSelector('ordersCount');
  const dcaCondition = useBotFormSelector('dcaCondition');
  const dcaCustom = useBotFormSelector('dcaCustom');
  const maxDealsPerPair = useBotFormSelector('maxDealsPerPair');
  const maxNumberOfOpenDeals = useBotFormSelector('maxNumberOfOpenDeals');
  const activeOrdersCount = useBotFormSelector('activeOrdersCount');
  const smartOrdersEnabled = Boolean(useSmartOrders);

  const toggleId = `${idPrefix}-smart-orders-toggle`;
  const countId = `${idPrefix}-smart-orders-count`;

  const { isBound: isSmartOrdersVarBound } =
    useBotVarBinding('activeOrdersCount');

  const derivedSmartOrdersRange = useMemo(
    () =>
      deriveSmartOrdersRange({
        ordersCount: ordersCount,
        dcaCondition: dcaCondition || DCAConditionEnum.percentage,
        dcaCustom: dcaCustom || [],
        useMulti: !!useMulti,
        maxDealsPerPair: maxDealsPerPair || '1',
        maxNumberOfOpenDeals: maxNumberOfOpenDeals || '1',
      }),
    [
      dcaCustom,
      dcaCondition,
      maxDealsPerPair,
      maxNumberOfOpenDeals,
      ordersCount,
      useMulti,
    ]
  );

  const backendSmartOrdersRange = useMemo(
    () => tradingContext?.ranges.smartOrders ?? null,
    [tradingContext]
  );

  const combinedSmartOrdersRange = useMemo(() => {
    const backendMin = backendSmartOrdersRange?.min;
    const backendMax = backendSmartOrdersRange?.max;

    let min = derivedSmartOrdersRange.min;
    if (typeof backendMin === 'number' && Number.isFinite(backendMin)) {
      min = Math.max(min, backendMin);
    }

    let max = derivedSmartOrdersRange.max;
    if (typeof backendMax === 'number' && Number.isFinite(backendMax)) {
      max = Math.min(max, backendMax);
    }

    if (!Number.isFinite(max)) {
      max = derivedSmartOrdersRange.max;
    }

    if (max < min) {
      max = min;
    }

    return {
      ...derivedSmartOrdersRange,
      min,
      max,
    };
  }, [backendSmartOrdersRange, derivedSmartOrdersRange]);

  const clampSmartOrders = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) {
        return combinedSmartOrdersRange.min;
      }
      return Math.min(
        combinedSmartOrdersRange.max,
        Math.max(combinedSmartOrdersRange.min, value)
      );
    },
    [combinedSmartOrdersRange.max, combinedSmartOrdersRange.min]
  );

  const smartOrdersCount = useMemo(() => {
    if (!Number.isFinite(activeOrdersCount)) {
      return combinedSmartOrdersRange.min;
    }
    return clampSmartOrders(Number(activeOrdersCount));
  }, [clampSmartOrders, combinedSmartOrdersRange.min, activeOrdersCount]);

  const helperMessage = useMemo(() => {
    const segments: string[] = [];

    if (backendSmartOrdersRange) {
      segments.push(formatRange(backendSmartOrdersRange));
    }

    const derivedMessage = buildSmartOrdersHelperMessage(
      combinedSmartOrdersRange
    );

    if (!segments.includes(derivedMessage)) {
      segments.push(derivedMessage);
    }

    return segments.join(' • ');
  }, [backendSmartOrdersRange, combinedSmartOrdersRange]);

  const handleToggle = useCallback(
    (checked: boolean) => {
      updateFormData('useSmartOrders', checked);
      if (checked && !activeOrdersCount) {
        updateFormData('activeOrdersCount', combinedSmartOrdersRange.min);
      }
    },
    [combinedSmartOrdersRange.min, activeOrdersCount, updateFormData]
  );

  const handleCountChange = useCallback(
    (value: string | number) => {
      if (isSmartOrdersVarBound) {
        return;
      }
      const parsedValue =
        typeof value === 'string' ? Number.parseInt(value, 10) : value;
      const sanitized = clampSmartOrders(Number(parsedValue));
      updateFormData('activeOrdersCount', sanitized);
    },
    [clampSmartOrders, isSmartOrdersVarBound, updateFormData]
  );

  const applySmartOrdersVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = clampSmartOrders(
        parseInt(String(variable.value ?? ''), 10)
      );
      updateFormData('activeOrdersCount', numericValue);
    },
    [clampSmartOrders, updateFormData]
  );

  useEffect(() => {
    if (!smartOrdersEnabled || isSmartOrdersVarBound) {
      return;
    }

    if (!Number.isFinite(activeOrdersCount)) {
      return;
    }

    const clamped = clampSmartOrders(Number(activeOrdersCount));
    if (clamped !== +activeOrdersCount) {
      updateFormData('activeOrdersCount', clamped);
    }
  }, [
    clampSmartOrders,
    activeOrdersCount,
    isSmartOrdersVarBound,
    smartOrdersEnabled,
    updateFormData,
  ]);

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between gap-md">
        <div className="flex-1">
          <div className="flex items-center gap-xs">
            <p className="text-sm font-medium">Smart orders</p>
            <Tooltip
              tooltip="This is the number of orders that will be sent to the exchange as active limit orders. The bot locks funds only for active orders; ensure you have enough balance for all planned orders."
              tooltipURL="/help/smart-orders"
            >
              <InfoIcon />
            </Tooltip>
          </div>
        </div>
        <Switch
          id={toggleId}
          checked={smartOrdersEnabled}
          onCheckedChange={handleToggle}
          aria-label="Toggle smart orders"
        />
      </div>
      {smartOrdersEnabled && (
        <SettingsRowSurface tone="faint" spacing="sm" className="space-y-xs">
          <Label htmlFor={countId}>Smart orders count</Label>
          <div className="max-w-xs">
            <FieldVariableBinding
              path="activeOrdersCount"
              varType="int"
              tooltip="Bind smart orders count"
              variant="inline"
              onVariableSelected={applySmartOrdersVariable}
              onVariableResolved={applySmartOrdersVariable}
            >
              <NumberInput
                id={countId}
                value={smartOrdersCount}
                onChange={handleCountChange}
                min={combinedSmartOrdersRange.min}
                max={combinedSmartOrdersRange.max}
                step={1}
                showControls={false}
                className="w-full"
                disabled={isSmartOrdersVarBound}
              />
            </FieldVariableBinding>
          </div>
          <p className="text-xs text-muted-foreground">{helperMessage}</p>
        </SettingsRowSurface>
      )}
    </div>
  );
};

interface DCASettingsProps {
  currentExchange: ExchangeInUser | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: Partial<Record<Fields, string>>;
  onUpdateBalances?: () => unknown;
}

interface DCASectionProps {
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: Partial<Record<Fields, string>>;
  tradingContext: DcaTradingContext;
  terminalControls: TerminalControlsToolkit;
  updateFieldError: (field: keyof BotFormErrors, error?: string) => void;
  mode: BotFormMode;
  /** Read-only projection of the saved bot, used to render the DCA overview
   *  when there's no live form store to read (settings-readonly mode). */
  projection: BotDcaProjection;
}

// Picks the deal-overview source for the DCA overview stats / table / graph.
// In create/edit the live `exampleOrdersStore` (driven by the mounted form) is
// the source of truth. The read-only settings view has no form pipeline feeding
// that store, so it projects the saved bot directly (`projection`) and renders
// the stats / table / graph from those orders instead — matching the form's
// numbers without depending on the shared, form-owned store.
const useDcaOverviewSource = (
  mode: BotFormMode,
  projection: BotDcaProjection
) => {
  const { summary: storeSummary } = useDealOverviewData();
  const isReadonly = mode === 'settings-readonly';
  return {
    isReadonly,
    summary: isReadonly ? projection.summary : storeSummary,
    // Passed to the table/graph as an override only in read-only mode; the live
    // form leaves it undefined so those components read the store.
    ordersOverride: isReadonly ? projection.orders : undefined,
  };
};

// Scaled DCA Component (percentage-based)
const ScaledDCA: React.FC<DCASectionProps> = ({
  formData,
  mode,
  updateFormData,
  errors,
  tradingContext,
  terminalControls,
  projection,
  //updateFieldError,
}) => {
  const isComboBot = useMemo(() => formData.type === 'combo', [formData.type]);
  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );
  const isDealMassEdit = useMemo(() => mode === 'deal-mass-edit', [mode]);
  const { alerts } = useBotFormState();
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const useTp = useBotFormSelector('useTp');
  const useMultiTp = useBotFormSelector('useMultiTp');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const scaleDcaType = useBotFormSelector('scaleDcaType');
  const step = useBotFormSelector('step');
  const stepScale = useBotFormSelector('stepScale');
  const volumeScale = useBotFormSelector('volumeScale');
  const ordersCount = useBotFormSelector('ordersCount');
  const minimumDeviation = useBotFormSelector('minimumDeviation');
  const gridLevel = useBotFormSelector('gridLevel');
  const comboActiveMinigrids = useBotFormSelector('comboActiveMinigrids');
  const comboSmartGridsCount = useBotFormSelector('comboSmartGridsCount');
  const dcaVolumeBaseOn = useBotFormSelector('dcaVolumeBaseOn');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const strategy = useBotFormSelector('strategy');
  const useActiveMinigrids = useBotFormSelector('useActiveMinigrids');
  const comboUseSmartGrids = useBotFormSelector('comboUseSmartGrids');
  const showVolumeControls = canDisplayRequiredChange({
    dealCloseCondition,
    useTp,
    useMultiTp,
    orderSizeType,
  });
  const useDca = useBotFormSelector('useDca');
  const indicators = useBotFormSelector('indicators');
  const { currentExchange } = useBotFormQuery();
  const showMinimumDeviationGuard = useMemo(
    () => scaleDcaType === 'atr' || scaleDcaType === 'adr',
    [scaleDcaType]
  );
  // Dynamic ATR/ADR scaling: legacy renders ONE startDca indicator (the
  // `dynamicAr` mode in DcaModeSettings.tsx:940-970) when scaling on atr/adr
  // and DCA is enabled. The indicator is seeded by handleSettingsUpdate when
  // `scaleDcaType` switches to atr/adr.
  const isScalingOnAtrAdr = scaleDcaType === 'atr' || scaleDcaType === 'adr';
  const dynamicArIndicator = useMemo(
    () =>
      isScalingOnAtrAdr
        ? (indicators || []).find(
            (i) => i.indicatorAction === IndicatorAction.startDca
          )
        : undefined,
    [isScalingOnAtrAdr, indicators]
  );
  const updateDynamicArIndicator = useCallback(
    (field: keyof IndicatorConfig, value: string | number | boolean) => {
      if (!dynamicArIndicator) return;
      updateFormData(
        'indicators',
        (indicators || []).map((ind) =>
          ind.uuid === dynamicArIndicator.uuid
            ? { ...ind, [field]: value }
            : ind
        )
      );
    },
    [dynamicArIndicator, indicators, updateFormData]
  );
  const updateDynamicArIndicatorParams = useCallback(
    (newParams: IndicatorParamsState) => {
      if (!dynamicArIndicator) return;
      const sanitized = sanitizeIndicatorParams(newParams);
      updateFormData(
        'indicators',
        (indicators || []).map((ind) =>
          ind.uuid === dynamicArIndicator.uuid ? { ...ind, ...sanitized } : ind
        )
      );
    },
    [dynamicArIndicator, indicators, updateFormData]
  );
  const { isBound: isMinimumDeviationVarBound } =
    useBotVarBinding('minimumDeviation');
  const ordersRange = tradingContext.ranges.ordersCount;
  const ordersRangeMin = ordersRange.min;
  const ordersRangeMax = ordersRange.max;
  const stepRange = tradingContext.ranges.step;
  const stepRangeMin = stepRange.min;
  const stepRangeMax = stepRange.max;
  const stepSliderMax = useMemo(
    () => resolveStepSliderMax(stepRange, step),
    [stepRange, step]
  );
  const stepScaleRange = tradingContext.ranges.stepScale;
  const stepScaleRangeMin = stepScaleRange.min;
  const stepScaleRangeMax = stepScaleRange.max;
  const stepScaleSliderMax =
    typeof stepScaleRangeMax === 'number' && Number.isFinite(stepScaleRangeMax)
      ? stepScaleRangeMax
      : stepScaleRangeMin + 10;
  const volumeScaleRange = tradingContext.ranges.volumeScale;
  const volumeScaleRangeMin = volumeScaleRange.min;
  const volumeScaleRangeMax = volumeScaleRange.max;
  const volumeScaleSliderMax =
    typeof volumeScaleRangeMax === 'number' &&
    Number.isFinite(volumeScaleRangeMax)
      ? volumeScaleRangeMax
      : volumeScaleRangeMin + 10;

  const {
    summary: { refresh: balanceRefresh },
  } = terminalControls;

  const { canTriggerBalanceRefresh, handleRefreshBalances } = balanceRefresh;

  // Shared deal overview data and summary for the stats boxes
  const { summary: dealOverviewSummary, ordersOverride } = useDcaOverviewSource(
    mode,
    projection
  );
  const showTpLines = useTp === true || useMultiTp === true;

  const clampOrdersCount = useCallback(
    (value: number | string): number => {
      // Coerce strings to numbers first — Number.isFinite is strict
      // and rejects string inputs, so the previous version silently
      // collapsed every preset-supplied string (e.g. '10') to
      // ordersRangeMin on first render.
      const numeric = typeof value === 'string' ? Number(value) : value;
      let normalized = Number.isFinite(numeric)
        ? Math.floor(numeric as number)
        : ordersRangeMin;
      if (normalized < ordersRangeMin) {
        normalized = ordersRangeMin;
      }
      if (
        typeof ordersRangeMax === 'number' &&
        Number.isFinite(ordersRangeMax)
      ) {
        normalized = Math.min(normalized, ordersRangeMax);
      }
      return normalized;
    },
    [ordersRangeMin, ordersRangeMax]
  );

  const clampStep = useCallback(
    (value: number): number => {
      const fallback = stepRangeMin;
      let normalized = Number.isFinite(value) ? value : fallback;
      if (normalized < stepRangeMin) {
        normalized = stepRangeMin;
      }
      if (typeof stepRangeMax === 'number' && Number.isFinite(stepRangeMax)) {
        normalized = Math.min(normalized, stepRangeMax);
      }
      return Math.round(normalized * 100) / 100;
    },
    [stepRangeMax, stepRangeMin]
  );

  const clampStepScale = useCallback(
    (value: number): number => {
      const fallback = stepScaleRangeMin;
      let normalized = Number.isFinite(value) ? value : fallback;
      if (normalized < stepScaleRangeMin) {
        normalized = stepScaleRangeMin;
      }
      if (
        typeof stepScaleRangeMax === 'number' &&
        Number.isFinite(stepScaleRangeMax)
      ) {
        normalized = Math.min(normalized, stepScaleRangeMax);
      }
      return Math.round(normalized * 100) / 100;
    },
    [stepScaleRangeMax, stepScaleRangeMin]
  );

  const clampVolumeScale = useCallback(
    (value: number): number => {
      const fallback = volumeScaleRangeMin;
      let normalized = Number.isFinite(value) ? value : fallback;
      if (normalized < volumeScaleRangeMin) {
        normalized = volumeScaleRangeMin;
      }
      if (
        typeof volumeScaleRangeMax === 'number' &&
        Number.isFinite(volumeScaleRangeMax)
      ) {
        normalized = Math.min(normalized, volumeScaleRangeMax);
      }
      return Math.round(normalized * 100) / 100;
    },
    [volumeScaleRangeMax, volumeScaleRangeMin]
  );

  const ordersHelperMessage = useMemo(
    () => formatRange(ordersRange),
    [ordersRange]
  );

  const stepHelperMessage = useMemo(() => {
    const base = formatRange(stepRange, { unit: '%', precision: 2 });
    const reason = describeStepCeiling(stepRange);
    return reason ? `${base}. ${reason}` : base;
  }, [stepRange]);

  const stepScaleHelperMessage = useMemo(
    () => formatRange(stepScaleRange),
    [stepScaleRange]
  );

  const volumeScaleHelperMessage = useMemo(
    () => formatRange(volumeScaleRange),
    [volumeScaleRange]
  );

  const stepError = errors['step'] ?? null;
  const stepScaleError = errors['stepScale'] ?? null;
  const volumeScaleError = errors['volumeScale'] ?? null;

  // Errors for `step` and `stepScale` are registered by the centralized
  // validator (`hotValidateDcaFormData`) and exposed through form state.
  // Avoid registering them here to keep a single source of truth.

  const stepSliderValue = useMemo(
    () => clampStep(Number.parseFloat(step)),
    [clampStep, step]
  );

  const stepScaleSliderValue = useMemo(
    () => clampStepScale(Number.parseFloat(stepScale)),
    [clampStepScale, stepScale]
  );

  const volumeScaleSliderValue = useMemo(
    () => clampVolumeScale(Number.parseFloat(volumeScale)),
    [clampVolumeScale, volumeScale]
  );

  useEffect(() => {
    const clamped = clampOrdersCount(ordersCount);
    if (clamped !== +ordersCount) {
      updateFormData('ordersCount', clamped);
    }
  }, [clampOrdersCount, ordersCount, updateFormData]);

  const { isBound: isOrdersCountVarBound } = useBotVarBinding('ordersCount');
  const applyOrdersCountVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseInt(String(variable.value ?? ''), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampOrdersCount(Number(numericValue));
      updateFormData('ordersCount', clamped);
    },
    [clampOrdersCount, updateFormData]
  );

  const handleOrdersCountChange = useCallback(
    (value: string | number) => {
      const parsedValue =
        typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number(value);
      const clamped = clampOrdersCount(parsedValue);
      updateFormData('ordersCount', clamped);
    },
    [clampOrdersCount, updateFormData]
  );

  const handleGridLevelChange = useCallback(
    (value: string | number) =>
      updateFormData(
        'gridLevel',
        typeof value === 'number' ? value.toString() : String(value ?? '1')
      ),
    [updateFormData]
  );

  const { isBound: isStepVarBound } = useBotVarBinding('step');
  const applyStepVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampStep(numericValue);
      updateFormData('step', formatNumericInput(clamped, 2));
    },
    [clampStep, updateFormData]
  );

  const { isBound: isStepScaleVarBound } = useBotVarBinding('stepScale');
  const applyStepScaleVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampStepScale(numericValue);
      updateFormData('stepScale', formatNumericInput(clamped, 2));
    },
    [clampStepScale, updateFormData]
  );

  const { isBound: isVolumeScaleVarBound } = useBotVarBinding('volumeScale');
  const applyVolumeScaleVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampVolumeScale(numericValue);
      updateFormData('volumeScale', formatNumericInput(clamped, 2));
    },
    [clampVolumeScale, updateFormData]
  );

  const { isBound: isGridLevelVarBound } = useBotVarBinding('gridLevel');
  const applyGridLevelVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseInt(String(variable.value ?? ''), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = Math.min(Math.max(numericValue, 1), 200);
      updateFormData('gridLevel', clamped.toString());
    },
    [updateFormData]
  );

  const { isBound: isComboActiveMinigridsVarBound } = useBotVarBinding(
    'comboActiveMinigrids'
  );
  const applyComboActiveMinigridsVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseInt(String(variable.value ?? ''), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const maxAllowed = Number.isFinite(Number(ordersCount))
        ? Number(ordersCount)
        : 1;
      const clamped = Math.min(Math.max(numericValue, 0), maxAllowed);
      updateFormData('comboActiveMinigrids', clamped.toString());
    },
    [ordersCount, updateFormData]
  );

  const { isBound: isComboSmartGridsVarBound } = useBotVarBinding(
    'comboSmartGridsCount'
  );
  const applyComboSmartGridsVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseInt(String(variable.value ?? ''), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = Math.min(Math.max(numericValue, 1), 200);
      updateFormData('comboSmartGridsCount', clamped.toString());
    },
    [updateFormData]
  );

  const minimumDeviationMax = useMemo(
    () =>
      typeof stepRangeMax === 'number' && Number.isFinite(stepRangeMax)
        ? stepRangeMax
        : MAX_DCA_ORDER_STEP_PERCENT,
    [stepRangeMax]
  );

  const minimumDeviationSliderMax = useMemo(
    () =>
      resolveStepSliderMax(
        { min: MINIMUM_DEVIATION_MIN, max: minimumDeviationMax },
        minimumDeviation
      ),
    [minimumDeviationMax, minimumDeviation]
  );

  const minimumDeviationNumeric = useMemo(() => {
    const parsed = Number.parseFloat(minimumDeviation ?? '');
    if (!Number.isFinite(parsed)) {
      return MINIMUM_DEVIATION_MIN;
    }
    return clampMinimumDeviation(parsed, minimumDeviationMax);
  }, [minimumDeviation, minimumDeviationMax]);

  const handleMinimumDeviationSliderChange = useCallback(
    (value: number) => {
      if (isMinimumDeviationVarBound) {
        return;
      }
      if (!Number.isFinite(value)) {
        return;
      }
      updateFormData(
        'minimumDeviation',
        formatMinimumDeviation(value, minimumDeviationMax)
      );
    },
    [isMinimumDeviationVarBound, minimumDeviationMax, updateFormData]
  );

  const handleMinimumDeviationInputChange = useCallback(
    (value: string | number) => {
      if (isMinimumDeviationVarBound) {
        return;
      }
      if (value === '' || value === null) {
        updateFormData('minimumDeviation', '');
        return;
      }
      const numericValue = Number.parseFloat(String(value));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      updateFormData(
        'minimumDeviation',
        formatMinimumDeviation(numericValue, minimumDeviationMax)
      );
    },
    [isMinimumDeviationVarBound, minimumDeviationMax, updateFormData]
  );

  const applyMinimumDeviationVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      updateFormData(
        'minimumDeviation',
        formatMinimumDeviation(numericValue, minimumDeviationMax)
      );
    },
    [minimumDeviationMax, updateFormData]
  );

  const comboSpacing = useMemo(() => {
    if (!isComboBot) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    const stepValue = Number.parseFloat(String(step ?? ''));
    const levelValue = Number.parseFloat(String(gridLevel ?? ''));

    if (
      !Number.isFinite(stepValue) ||
      !Number.isFinite(levelValue) ||
      levelValue <= 0
    ) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    const computed = Math.round((stepValue / levelValue) * 100) / 100;

    if (!Number.isFinite(computed)) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    return {
      gridStep: computed,
      display: computed.toFixed(2),
      isLow: computed < 1,
    };
  }, [gridLevel, step, isComboBot]);

  const totalOrdersCount = useMemo(() => {
    const parsed = Number.parseInt(String(ordersCount ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }, [ordersCount]);

  const comboActiveMinigridsNumeric = useMemo(() => {
    const parsed = Number.parseInt(String(comboActiveMinigrids ?? '0'), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  }, [comboActiveMinigrids]);

  const comboSmartGridsCountNumeric = useMemo(() => {
    const parsed = Number.parseInt(String(comboSmartGridsCount ?? '1'), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return parsed;
  }, [comboSmartGridsCount]);

  const isActiveMinigridsOverLimit = useMemo(() => {
    if (totalOrdersCount === null) {
      return false;
    }
    return comboActiveMinigridsNumeric > totalOrdersCount;
  }, [comboActiveMinigridsNumeric, totalOrdersCount]);

  const isSmartGridsOverLimit = useMemo(() => {
    if (totalOrdersCount === null) {
      return false;
    }
    return comboSmartGridsCountNumeric > totalOrdersCount;
  }, [comboSmartGridsCountNumeric, totalOrdersCount]);

  const activeMinigridsPresets = useMemo(() => {
    const total = totalOrdersCount ?? 3;
    const values = [0, 1, Math.min(3, total)];
    if (total > 3) {
      values.push(total);
    }
    return Array.from(new Set(values))
      .filter((value) => value >= 0)
      .sort((a, b) => a - b)
      .map((value) => ({
        value: value.toString(),
        label: value.toString(),
      }));
  }, [totalOrdersCount]);

  const smartGridPresets = useMemo(() => {
    const total = totalOrdersCount ?? 3;
    const values = [1, Math.min(3, total)];
    if (total > 3) {
      values.push(total);
    }
    return Array.from(new Set(values))
      .filter((value) => value >= 1)
      .sort((a, b) => a - b)
      .map((value) => ({
        value: value.toString(),
        label: value.toString(),
      }));
  }, [totalOrdersCount]);

  const handleActiveMinigridsChange = useCallback(
    (value: string | number) => {
      if (isComboActiveMinigridsVarBound) {
        return;
      }
      const numericValue =
        typeof value === 'number'
          ? value
          : Number.parseInt(String(value ?? '0'), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const upperBound = totalOrdersCount ?? 200;
      const clamped = Math.max(0, Math.min(numericValue, upperBound));
      updateFormData('comboActiveMinigrids', clamped.toString());
    },
    [isComboActiveMinigridsVarBound, totalOrdersCount, updateFormData]
  );

  const handleSmartGridsCountChange = useCallback(
    (value: string | number) => {
      if (isComboSmartGridsVarBound) {
        return;
      }
      const numericValue =
        typeof value === 'number'
          ? value
          : Number.parseInt(String(value ?? '1'), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const upperBound = totalOrdersCount ?? 200;
      const clamped = Math.max(1, Math.min(numericValue, upperBound));
      updateFormData('comboSmartGridsCount', clamped.toString());
    },
    [isComboSmartGridsVarBound, totalOrdersCount, updateFormData]
  );

  useEffect(() => {
    if (!showVolumeControls && dcaVolumeBaseOn === DCAVolumeType.change) {
      updateFormData('dcaVolumeBaseOn', 'scaled');
    }
  }, [showVolumeControls, dcaVolumeBaseOn, updateFormData]);

  const handleSliderChange = useCallback(
    (field: Fields, rawValue: number) => {
      if (!Number.isFinite(rawValue)) {
        return;
      }

      switch (field) {
        case 'step': {
          const clamped = clampStep(rawValue);
          updateFormData('step', formatNumericInput(clamped, 2));
          return;
        }
        case 'stepScale': {
          const clamped = clampStepScale(rawValue);
          updateFormData('stepScale', formatNumericInput(clamped, 2));
          return;
        }
        case 'volumeScale': {
          const clamped = clampVolumeScale(rawValue);
          updateFormData('volumeScale', formatNumericInput(clamped, 2));
          return;
        }
        default: {
          updateFormData(field, rawValue.toString());
        }
      }
    },
    [clampStep, clampStepScale, clampVolumeScale, updateFormData]
  );

  return (
    <>
      <MasonryLayout
        gap={16}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        <SettingsRow name="DCA orders" description={ordersHelperMessage}>
          <div className="flex w-full max-w-xs flex-col gap-sm">
            <FieldVariableBinding
              path="ordersCount"
              varType="int"
              tooltip="Bind DCA orders"
              variant="inline"
              onVariableSelected={applyOrdersCountVariable}
              onVariableResolved={applyOrdersCountVariable}
            >
              <NumberInput
                id="dca-orders"
                value={ordersCount}
                onChange={handleOrdersCountChange}
                min={ordersRangeMin}
                {...(typeof ordersRangeMax === 'number' &&
                Number.isFinite(ordersRangeMax)
                  ? { max: ordersRangeMax }
                  : {})}
                step={1}
                className={`w-full ${errors['ordersCount'] ? 'border-destructive' : ''}`}
                disabled={isOrdersCountVarBound}
              />
            </FieldVariableBinding>
          </div>
        </SettingsRow>

        <SettingsRow
          colSpan="full"
          className="space-y-0!"
          contentClassName="gap-md"
        >
          <SmartOrdersControl
            idPrefix="scaled"
            //formData={formData}
            updateFormData={updateFormData}
            errors={errors}
            tradingContext={tradingContext}
          />
        </SettingsRow>

        {futures && (
          <SettingsRow
            name="Order size reference"
            tooltip="Switch between notional value and upfront cost for DCA sizing."
          >
            <TerminalButtonStack
              value={formData.orderSizeReference ?? 'notional'}
              onValueChange={(value) =>
                updateFormData(
                  'orderSizeReference',
                  value as 'notional' | 'cost'
                )
              }
              options={[
                { value: 'notional', label: 'Notional Value' },
                { value: 'cost', label: 'Cost' },
              ]}
            />
          </SettingsRow>
        )}

        {!isDealMassEdit && (
          <SettingsRow
            colSpan="full"
            className="space-y-0!"
            contentClassName="gap-md"
            alerts={alerts?.orderSize ?? []}
            navId="orderSize"
          >
            <DcaOrderSizingControl
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
              tradingContext={tradingContext}
              idPrefix="scaled"
              onRefreshBalance={handleRefreshBalances}
              showRefreshButton={canTriggerBalanceRefresh}
              mode={mode}
            />
          </SettingsRow>
        )}

        {!isComboBot && !isDealEdit && (
          <SettingsRow
            name="Base scaling on"
            tooltip="Choose the reference metric for spacing DCA orders."
          >
            <Select
              value={scaleDcaType || ScaleDcaTypeEnum.percentage}
              onValueChange={(value) => updateFormData('scaleDcaType', value)}
            >
              <SelectTrigger id="base-scaling-on">
                <SelectValue placeholder="Select scaling type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ScaleDcaTypeEnum.percentage}>
                  Percentage
                </SelectItem>
                <SelectItem value={ScaleDcaTypeEnum.atr}>ATR</SelectItem>
                <SelectItem value={ScaleDcaTypeEnum.adr}>ADR</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        )}

        {isScalingOnAtrAdr && useDca && dynamicArIndicator ? (
          <SettingsRow
            name={`${scaleDcaType === 'adr' ? 'ADR' : 'ATR'} indicator`}
            tooltip="DCA order spacing scales off this dynamic ATR/ADR value instead of a fixed percentage."
            colSpan="full"
          >
            <SettingsRowSurface tone="inner" spacing="md">
              <DynamicArIndicatorConfig
                indicator={dynamicArIndicator}
                action={IndicatorAction.startDca}
                exchange={currentExchange?.provider}
                minIntervalMs={timeIntervalMap[ExchangeIntervals.oneH]}
                onChangeParams={updateDynamicArIndicatorParams}
                onChangeFactor={(value) =>
                  updateDynamicArIndicator('dynamicArFactor', value)
                }
              />
            </SettingsRowSurface>
          </SettingsRow>
        ) : null}

        {showMinimumDeviationGuard ? (
          <SettingsRow
            name="Minimum deviation guard"
            tooltip={`Prevents ATR/ADR-based scaling from stacking orders closer than ${MINIMUM_DEVIATION_MIN}%–${minimumDeviationMax}%.`}
          >
            <div className="flex w-full flex-col gap-sm">
              <div className="px-2">
                <Slider
                  value={minimumDeviationNumeric}
                  onChange={handleMinimumDeviationSliderChange}
                  min={MINIMUM_DEVIATION_MIN}
                  max={minimumDeviationSliderMax}
                  step={0.1}
                  className="w-full"
                  disabled={isMinimumDeviationVarBound}
                />
              </div>
              <FieldVariableBinding
                path="minimumDeviation"
                varType="number"
                tooltip="Bind minimum deviation guard"
                variant="inline"
                onVariableSelected={applyMinimumDeviationVariable}
                onVariableResolved={applyMinimumDeviationVariable}
              >
                <NumberInput
                  id="minimum-deviation"
                  value={minimumDeviation ?? ''}
                  onChange={handleMinimumDeviationInputChange}
                  min={MINIMUM_DEVIATION_MIN}
                  max={minimumDeviationMax}
                  step={0.1}
                  precision={2}
                  className="w-full"
                  disabled={isMinimumDeviationVarBound}
                  showControls={false}
                  endAdornment={unitAdornment('%')}
                />
              </FieldVariableBinding>
            </div>
          </SettingsRow>
        ) : null}

        {!isComboBot && (
          <SettingsRow
            name="Orders step"
            description={stepHelperMessage}
            navId="dca-step"
          >
            <InputButtonsSlider
              value={step}
              onChange={(value) => {
                if (typeof value === 'string') {
                  const trimmed = value.trim();
                  if (!trimmed) {
                    updateFormData('step', value);
                    return;
                  }
                  // Allow incomplete numeric input (e.g. '.', '1.', '.5')
                  const partialNumeric = /^-?\d*\.?\d*$/.test(trimmed);
                  const parsed = Number.parseFloat(trimmed);
                  if (!partialNumeric) {
                    updateFormData('step', trimmed);
                    return;
                  }
                  if (trimmed.endsWith('.')) {
                    // Preserve trailing dot so user can continue typing fraction
                    updateFormData('step', trimmed);
                    return;
                  }
                  if (!Number.isFinite(parsed)) {
                    updateFormData('step', trimmed);
                    return;
                  }
                  const clamped = clampStep(parsed);
                  updateFormData('step', formatNumericInput(clamped, 2));
                  return;
                }
                const clamped = clampStep(value);
                updateFormData('step', formatNumericInput(clamped, 2));
              }}
              min={stepRangeMin}
              max={
                typeof stepRangeMax === 'number' &&
                Number.isFinite(stepRangeMax)
                  ? stepRangeMax
                  : 999
              }
              step={0.01}
              precision={2}
              disabled={false}
              endAdornment={unitAdornment('%')}
              isInvalid={!!stepError}
              showSlider={!isStepVarBound}
              sliderValue={stepSliderValue}
              sliderMin={stepRangeMin}
              sliderMax={stepSliderMax}
              sliderStep={0.01}
              onSliderChange={(value) => handleSliderChange('step', value)}
              presetButtons={[
                { label: '0.5%', value: 0.5 },
                { label: '1%', value: 1.0 },
                { label: '2%', value: 2.0 },
                { label: '3%', value: 3.0 },
              ]}
              baseValue={0}
              varBindingPath="step"
              varType="float"
              varTooltip="Bind orders step"
              onVariableSelected={applyStepVariable}
              onVariableResolved={applyStepVariable}
              isVariableBound={isStepVarBound}
            />
          </SettingsRow>
        )}

        {isComboBot ? (
          <SettingsRow
            name="Combo grid strategy"
            tooltip="Control how the DCA order spreads across the underlying minigrid."
            colSpan="full"
          >
            <SettingsRowSurface
              tone="transparent"
              padding="none"
              spacing="sm"
              className="border-0"
            >
              <div className="space-y-sm">
                <div className="grid gap-sm sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="combo-base-grid-levels">
                      DCA grid levels
                    </Label>
                    <FieldVariableBinding
                      path="gridLevel"
                      varType="int"
                      tooltip="Bind DCA grid level"
                      variant="inline"
                      onVariableSelected={applyGridLevelVariable}
                      onVariableResolved={applyGridLevelVariable}
                    >
                      <NumberInput
                        id="combo-DCA-grid-levels"
                        value={
                          Number.parseInt(String(gridLevel ?? '1'), 10) || 1
                        }
                        onChange={handleGridLevelChange}
                        min={1}
                        max={200}
                        step={1}
                        className="w-full"
                        // Read-only when editing a deal, matching legacy
                        // main-dash: DcaModeSettings disables this input under
                        // `props.isDealEdit && combo`. The minigrid is laid out
                        // when the deal opens, so changing its level count
                        // mid-deal has no coherent meaning for the orders
                        // already placed.
                        disabled={isGridLevelVarBound || isDealEdit}
                      />
                    </FieldVariableBinding>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="combo-DCA-step">DCA grid range (%)</Label>
                    <FieldVariableBinding
                      path="step"
                      varType="float"
                      tooltip="Bind DCA grid range"
                      variant="inline"
                      onVariableSelected={applyStepVariable}
                      onVariableResolved={applyStepVariable}
                    >
                      <NumberInput
                        id="combo-DCA-step"
                        value={step ?? ''}
                        onChange={(value) => {
                          if (typeof value === 'string') {
                            const trimmed = value.trim();
                            if (!trimmed) {
                              updateFormData('step', trimmed);
                              return;
                            }
                            const parsed = Number.parseFloat(trimmed);
                            if (!Number.isFinite(parsed)) {
                              updateFormData('step', trimmed);
                              return;
                            }
                            const clamped = Math.min(
                              Math.max(parsed, 0.1),
                              500
                            );
                            updateFormData(
                              'step',
                              formatNumericInput(clamped, 2)
                            );
                            return;
                          }
                          const clamped = Math.min(Math.max(value, 0.1), 500);
                          updateFormData(
                            'step',
                            formatNumericInput(clamped, 2)
                          );
                        }}
                        min={0.1}
                        max={500}
                        step={0.1}
                        precision={2}
                        className="w-full"
                        // Read-only while editing a deal, same rule and same
                        // reason as the grid-level input above: legacy disables
                        // both under `props.isDealEdit && combo`. This block is
                        // combo-only, so `isDealEdit` alone is that condition.
                        disabled={isStepVarBound || isDealEdit}
                        endAdornment={unitAdornment('%')}
                      />
                    </FieldVariableBinding>
                  </div>
                </div>
              </div>

              {comboSpacing.isLow ? (
                <SettingsAlert
                  variant="warning"
                  title={`Low grid spacing · ${comboSpacing.display}%`}
                  description="Grid spacing below 1% increases the risk of orders being skipped during high volatility. Consider increasing either the order step or minigrid levels."
                />
              ) : (
                <SettingsAlert
                  variant="info"
                  title={`Grid spacing · ${comboSpacing.display}%`}
                />
              )}

              <div className="space-y-sm">
                <SettingsRow
                  name="Active minigrids on deal start"
                  tooltip="Automatically open minigrids beneath the base grid instead of placing a DCA order."
                  tooltipURL="/help/active-minigrids"
                  trailing={
                    <Switch
                      id="combo-active-minigrids"
                      checked={Boolean(useActiveMinigrids)}
                      onCheckedChange={(checked) =>
                        updateFormData('useActiveMinigrids', checked)
                      }
                      aria-label="Toggle active minigrids on deal start"
                    />
                  }
                  headerAlign="center"
                  className="space-y-sm!"
                  contentClassName="space-y-sm"
                >
                  {useActiveMinigrids ? (
                    <SettingsRowSurface
                      tone="faint"
                      spacing="sm"
                      className="space-y-sm"
                    >
                      <div className="space-y-1">
                        <Label
                          htmlFor="combo-active-minigrids-count"
                          className="text-sm font-medium"
                        >
                          Active minigrid count
                        </Label>
                        <TerminalButtonStack
                          value={comboActiveMinigridsNumeric.toString()}
                          onValueChange={handleActiveMinigridsChange}
                          options={activeMinigridsPresets}
                        />
                      </div>
                      <div className="max-w-xs">
                        <FieldVariableBinding
                          path="comboActiveMinigrids"
                          varType="int"
                          tooltip="Bind active minigrids"
                          variant="inline"
                          onVariableSelected={applyComboActiveMinigridsVariable}
                          onVariableResolved={applyComboActiveMinigridsVariable}
                        >
                          <NumberInput
                            id="combo-active-minigrids-count"
                            value={comboActiveMinigridsNumeric}
                            onChange={handleActiveMinigridsChange}
                            min={0}
                            max={totalOrdersCount ?? 200}
                            step={1}
                            className={`w-full ${
                              isActiveMinigridsOverLimit
                                ? 'border-destructive'
                                : ''
                            }`}
                            disabled={isComboActiveMinigridsVarBound}
                          />
                        </FieldVariableBinding>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {totalOrdersCount
                          ? `Cannot exceed total DCA orders (${totalOrdersCount}).`
                          : 'Match the number of DCA orders you intend to preload.'}
                      </p>
                      {isActiveMinigridsOverLimit ? (
                        <Alert className="border-warning/60 bg-warning/10 text-warning">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle className="text-sm font-semibold">
                            Active minigrids exceed configured orders
                          </AlertTitle>
                          <AlertDescription className="text-sm">
                            Reduce the minigrid count or increase DCA orders so
                            every active minigrid has a matching order slot.
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </SettingsRowSurface>
                  ) : null}
                </SettingsRow>

                <SettingsRow
                  name="Smart grid orders"
                  tooltip="Limit how many grid orders are placed simultaneously to manage locked funds."
                  tooltipURL="/help/smart-orders"
                  trailing={
                    <Switch
                      id="combo-smart-grids"
                      checked={Boolean(comboUseSmartGrids)}
                      onCheckedChange={(checked) =>
                        updateFormData('comboUseSmartGrids', checked)
                      }
                      aria-label="Toggle smart grid orders"
                    />
                  }
                  headerAlign="center"
                  className="space-y-sm!"
                  contentClassName="space-y-sm"
                >
                  {comboUseSmartGrids ? (
                    <SettingsRowSurface
                      tone="faint"
                      spacing="sm"
                      className="space-y-sm"
                    >
                      <div className="space-y-1">
                        <Label
                          htmlFor="combo-smart-grids-count"
                          className="text-sm font-medium"
                        >
                          Smart grid order count
                        </Label>
                        <TerminalButtonStack
                          value={comboSmartGridsCountNumeric.toString()}
                          onValueChange={handleSmartGridsCountChange}
                          options={smartGridPresets}
                        />
                      </div>
                      <div className="max-w-xs">
                        <FieldVariableBinding
                          path="comboSmartGridsCount"
                          varType="int"
                          tooltip="Bind smart grid count"
                          variant="inline"
                          onVariableSelected={applyComboSmartGridsVariable}
                          onVariableResolved={applyComboSmartGridsVariable}
                        >
                          <NumberInput
                            id="combo-smart-grids-count"
                            value={comboSmartGridsCountNumeric}
                            onChange={handleSmartGridsCountChange}
                            min={1}
                            max={totalOrdersCount ?? 200}
                            step={1}
                            className={`w-full ${
                              isSmartGridsOverLimit ? 'border-destructive' : ''
                            }`}
                            disabled={isComboSmartGridsVarBound}
                          />
                        </FieldVariableBinding>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {totalOrdersCount
                          ? `Locks funds for up to ${totalOrdersCount} active limit orders; remaining grids stage as pending.`
                          : 'Submit only the first batch of grid orders to keep capital flexible.'}
                      </p>
                      {isSmartGridsOverLimit && (
                        <SettingsAlert
                          variant="warning"
                          title="Smart grid orders cap at total DCA orders"
                          description="Decrease the smart grid count or increase DCA orders; the exchange cannot place more live orders than configured grids."
                        />
                      )}
                    </SettingsRowSurface>
                  ) : null}
                </SettingsRow>
              </div>
            </SettingsRowSurface>
          </SettingsRow>
        ) : null}

        <SettingsRow
          name="Step scale"
          description={stepScaleHelperMessage}
          navId="dca-step-scale"
        >
          <InputButtonsSlider
            value={stepScale}
            onChange={(value) => {
              if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                  updateFormData('stepScale', value);
                  return;
                }
                // Allow incomplete numeric input (e.g. '.', '1.', '.5')
                const partialNumeric = /^-?\d*\.?\d*$/.test(trimmed);
                const parsed = Number.parseFloat(trimmed);
                if (!partialNumeric) {
                  updateFormData('stepScale', trimmed);
                  return;
                }
                if (trimmed.endsWith('.')) {
                  updateFormData('stepScale', trimmed);
                  return;
                }
                if (!Number.isFinite(parsed)) {
                  updateFormData('stepScale', trimmed);
                  return;
                }
                const clamped = clampStepScale(parsed);
                updateFormData('stepScale', formatNumericInput(clamped, 2));
                return;
              }
              const clamped = clampStepScale(value);
              updateFormData('stepScale', formatNumericInput(clamped, 2));
            }}
            min={stepScaleRangeMin}
            max={
              typeof stepScaleRangeMax === 'number' &&
              Number.isFinite(stepScaleRangeMax)
                ? stepScaleRangeMax
                : 999
            }
            step={0.01}
            precision={2}
            disabled={false}
            isInvalid={!!stepScaleError}
            showSlider={!isStepScaleVarBound}
            sliderValue={stepScaleSliderValue}
            sliderMin={stepScaleRangeMin}
            sliderMax={stepScaleSliderMax}
            sliderStep={0.01}
            onSliderChange={(value) => handleSliderChange('stepScale', value)}
            presetButtons={[
              { label: '1.0', value: 1.0 },
              { label: '1.5', value: 1.5 },
              { label: '2.0', value: 2.0 },
            ]}
            baseValue={0}
            varBindingPath="stepScale"
            varType="float"
            varTooltip="Bind step scale"
            onVariableSelected={applyStepScaleVariable}
            onVariableResolved={applyStepScaleVariable}
            isVariableBound={isStepScaleVarBound}
          />
        </SettingsRow>

        <SettingsRow name="Volume scale" description={volumeScaleHelperMessage}>
          <InputButtonsSlider
            value={volumeScale}
            onChange={(value) => {
              if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                  updateFormData('volumeScale', value);
                  return;
                }
                // Allow incomplete numeric input (e.g. '.', '1.', '.5')
                const partialNumeric = /^-?\d*\.?\d*$/.test(trimmed);
                const parsed = Number.parseFloat(trimmed);
                if (!partialNumeric) {
                  updateFormData('volumeScale', trimmed);
                  return;
                }
                if (trimmed.endsWith('.')) {
                  updateFormData('volumeScale', trimmed);
                  return;
                }
                if (!Number.isFinite(parsed)) {
                  updateFormData('volumeScale', trimmed);
                  return;
                }
                const clamped = clampVolumeScale(parsed);
                updateFormData('volumeScale', formatNumericInput(clamped, 2));
                return;
              }
              const clamped = clampVolumeScale(value);
              updateFormData('volumeScale', formatNumericInput(clamped, 2));
            }}
            min={volumeScaleRangeMin}
            max={
              typeof volumeScaleRangeMax === 'number' &&
              Number.isFinite(volumeScaleRangeMax)
                ? volumeScaleRangeMax
                : 999
            }
            step={0.01}
            precision={2}
            disabled={false}
            isInvalid={!!volumeScaleError}
            showSlider={!isVolumeScaleVarBound}
            sliderValue={volumeScaleSliderValue}
            sliderMin={volumeScaleRangeMin}
            sliderMax={volumeScaleSliderMax}
            sliderStep={0.01}
            onSliderChange={(value) => handleSliderChange('volumeScale', value)}
            presetButtons={[
              { label: '1.0', value: 1.0 },
              { label: '1.5', value: 1.5 },
              { label: '2.0', value: 2.0 },
            ]}
            baseValue={0}
            varBindingPath="volumeScale"
            varType="float"
            varTooltip="Bind volume scale"
            onVariableSelected={applyVolumeScaleVariable}
            onVariableResolved={applyVolumeScaleVariable}
            isVariableBound={isVolumeScaleVarBound}
          />
        </SettingsRow>
      </MasonryLayout>

      {/* Deal overview as a SettingsRow with tabs in trailing */}
      {!isDealEdit && (
        <Tabs
          defaultValue={isComboBot ? 'table' : 'graph'}
          className="h-full flex flex-col"
        >
          <SettingsRow
            name="DCA overview"
            colSpan="full"
            trailing={
              <TabsList>
                {!isComboBot && <TabsTrigger value="graph">Graph</TabsTrigger>}
                <TabsTrigger value="table">Table</TabsTrigger>
              </TabsList>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr,260px] gap-md items-start">
              <div className="rounded-md overflow-hidden min-h-80 sm:min-h-[420px]">
                {!isComboBot && (
                  <TabsContent value="graph">
                    <DealOverviewGraphTab
                      className="h-full w-full"
                      full
                      showTpLines={showTpLines}
                      orders={ordersOverride}
                    />
                  </TabsContent>
                )}
                <TabsContent value="table" className="h-full">
                  <DealOverviewTableTab
                    className="h-full w-full"
                    widgetId="dca-settings-deal-overview-table"
                    orders={ordersOverride}
                  />
                </TabsContent>
              </div>

              <div className="md:pt-0">
                <StatsBoxes
                  boxes={[
                    {
                      title: 'Coverage',
                      value: `${dealOverviewSummary.coverage}%`,
                      icon: <TrendingDown className="w-4 h-4" />,
                    },
                    {
                      title: 'Avg Down Power',
                      value: `${parseFloat(dealOverviewSummary.avgDownPower || '0').toFixed(1)}%`,
                      icon: <TrendingUp className="w-4 h-4" />,
                    },
                    {
                      title: 'Total Funds',
                      value: formatTotalFunds(dealOverviewSummary, {
                        strategy,
                        futures,
                        coinm,
                        baseAsset: tradingContext.baseAsset,
                        quoteAsset: tradingContext.quoteAsset,
                      }),
                      icon: <DollarSign className="w-4 h-4" />,
                    },
                  ]}
                />
              </div>
            </div>
          </SettingsRow>
        </Tabs>
      )}
    </>
  );
};

// Technical Indicators DCA Component
const TechnicalIndicatorsDCA: React.FC<DCASectionProps> = ({
  formData,
  updateFormData,
  errors,
  tradingContext,
  terminalControls,
  updateFieldError,
  mode,
  projection,
}) => {
  const isComboBot = useMemo(() => formData.type === 'combo', [formData.type]);
  const indicatorGroups = useBotFormSelector('indicatorGroups');
  const { openSelector, selector } = useIndicatorSelector();
  const {
    favorites: favoriteIndicatorTypes,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();

  const handleToggleFavorite = useCallback(
    (type: IndicatorEnum, nextIsFavorite: boolean) => {
      toggleFavorite(type, nextIsFavorite);
    },
    [toggleFavorite]
  );

  const openDcaIndicatorSelector = useCallback(
    (options: OpenIndicatorSelectorOptions) => {
      openSelector({
        ...options,
        favorites: favoriteIndicatorTypes,
        onToggleFavorite: handleToggleFavorite,
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
      });
    },
    [
      favoriteIndicatorTypes,
      favoritesMutating,
      handleToggleFavorite,
      isIndicatorMutating,
      openSelector,
    ]
  );
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const useTp = useBotFormSelector('useTp');
  const useMultiTp = useBotFormSelector('useMultiTp');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const dcaVolumeBaseOn = useBotFormSelector('dcaVolumeBaseOn');
  const indicators = useBotFormSelector('indicators');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const orderSize = useBotFormSelector('orderSize');
  const dcaCustom = useBotFormSelector('dcaCustom');
  const strategy = useBotFormSelector('strategy');
  const showVolumeControls = canDisplayRequiredChange({
    dealCloseCondition,
    useTp,
    useMultiTp,
    orderSizeType,
  });
  useEffect(() => {
    if (!showVolumeControls && dcaVolumeBaseOn === DCAVolumeType.change) {
      updateFormData('dcaVolumeBaseOn', 'scaled');
    }
  }, [showVolumeControls, dcaVolumeBaseOn, updateFormData]);

  // When any custom order has a fixed price set, compute its step % relative to previous
  // orders so that both manual edits and picker selections keep step in sync.
  useEffect(() => {
    if (!Array.isArray(dcaCustom) || dcaCustom.length === 0) return;
    if (
      !tradingContext.latestPrice ||
      !Number.isFinite(tradingContext.latestPrice)
    )
      return;

    const latestPrice = tradingContext.latestPrice || 0;
    if (latestPrice <= 0) return;

    const updated = [...dcaCustom];
    let changed = false;

    const getPrevPrice = (idx: number) => {
      let prev = latestPrice;
      for (let j = 0; j < idx; j++) {
        const prevEntry = updated[j] as DCACustom | undefined;
        if (!prevEntry) continue;
        const fixedRaw = prevEntry.fixed;
        if (fixedRaw !== undefined) {
          const parsed = Number.parseFloat(String(fixedRaw));
          if (Number.isFinite(parsed) && parsed > 0) {
            prev = parsed;
            continue;
          }
        }
        if (prevEntry.step) {
          const parsedStep = Number.parseFloat(String(prevEntry.step));
          if (Number.isFinite(parsedStep)) {
            const p = parsedStep / 100;
            prev =
              strategy === StrategyEnum.long ? prev * (1 - p) : prev * (1 + p);
          }
        }
      }
      return prev;
    };

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i] as DCACustom | undefined;
      if (!item) continue;
      const fixedRaw = item.fixed;
      if (fixedRaw !== undefined && `${fixedRaw}` !== '') {
        const fixedPrice = Number.parseFloat(String(fixedRaw));
        if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) continue;
        const prev = getPrevPrice(i);
        if (!Number.isFinite(prev) || prev <= 0) continue;
        const stepCalc =
          strategy === StrategyEnum.long
            ? Math.abs(((prev - fixedPrice) / prev) * 100)
            : Math.abs(((fixedPrice - prev) / prev) * 100);
        if (!Number.isFinite(stepCalc) || stepCalc <= 0) continue;
        const parsedStep = Number.parseFloat(String(item.step ?? ''));
        if (
          !Number.isFinite(parsedStep) ||
          Math.abs(parsedStep - stepCalc) > 0.01
        ) {
          updated[i] = {
            ...item,
            step: formatNumericInput(stepCalc, 2),
          } as DCACustom;
          changed = true;
        }
      }
    }

    if (changed) {
      updateFormData('dcaCustom', updated);
    }
  }, [dcaCustom, tradingContext.latestPrice, strategy, updateFormData]);

  // Sync indicators to global store for chart widgets
  /*   useEffect(() => {
    const indicators = (indicators || []).filter(
      (indicator) => indicator?.indicatorAction === IndicatorAction.startDca
    );

    if (useDca) {
      indicatorStore.setIndicators(indicators);
    } else {
      indicatorStore.setIndicators([]);
    }

    return () => {
      indicatorStore.setIndicators([]);
    };
  }, [indicators, useDca]); */

  const addIndicator = () => {
    if ((indicators || []).length >= 20) return; // Max 20 indicators
    const findGroup = indicatorGroups.find(
      (g) => g.action === IndicatorAction.startDca
    );
    const groupToUse = findGroup ?? {
      id: `dca-group-${Date.now()}`,
      action: IndicatorAction.startDca,
      section: IndicatorSection.dca,
      logic: IndicatorsLogicEnum.and,
    };
    // Ladders of start-DCA signals are usually the same indicator repeated at
    // increasing distance, so a new row clones the last one (fresh ids) rather
    // than resetting to RSI. Only the first row falls back to defaults — legacy
    // V1 parity (useSettingsComponent.ts:1385-1406).
    const startDcaIndicators = (indicators || []).filter(
      (i) => i.indicatorAction === IndicatorAction.startDca
    );
    const previous = startDcaIndicators[startDcaIndicators.length - 1];
    const base: IndicatorConfig = previous ?? {
      ...getIndicatorDefaultParams(
        IndicatorEnum.rsi,
        IndicatorAction.startDca,
        IndicatorSection.dca
      ),
      minPercFromLast: '1',
      orderSize: orderSize || '0',
    };
    const newIndicator: IndicatorConfig = {
      ...base,
      indicatorAction: IndicatorAction.startDca,
      section: IndicatorSection.dca,
      uuid: createDcaIndicatorId(),
      ...(base.maUUID ? { maUUID: createDcaIndicatorId() } : {}),
      ...(base.xoUUID ? { xoUUID: createDcaIndicatorId() } : {}),
      groupId: groupToUse.id,
    };
    const updatedIndicators = [...(indicators || []), newIndicator];
    updateFormData('indicators', updatedIndicators);
    if (!findGroup) {
      const updatedGroups = [...indicatorGroups, groupToUse];
      updateFormData('indicatorGroups', updatedGroups);
    }
  };

  const removeIndicator = (id: string) => {
    const updatedIndicators = (indicators || []).filter(
      (ind) => ind.uuid !== id
    );
    updateFormData('indicators', updatedIndicators);
  };

  const updateIndicator = (
    id: string,
    field: keyof IndicatorConfig,
    value: string | number | boolean
  ) => {
    const updatedIndicators = (indicators || []).map((ind) =>
      ind.uuid === id ? { ...ind, [field]: value } : ind
    );
    updateFormData('indicators', updatedIndicators);
  };

  const handleIndicatorSelection = (
    indicator: IndicatorConfig,
    type: IndicatorEnum
  ) => {
    const updatedIndicators: SettingsIndicators[] = (indicators || []).map(
      (ind) => {
        if (ind.uuid !== indicator.uuid) {
          return ind;
        }
        // Swapping only `type` left the new type's own fields absent: a DCA
        // ladder row is born as RSI (see the `getIndicatorDefaultParams`
        // fallback above), so switching it to MAR kept RSI's parameters and
        // added none of MAR's — `mar1type`/`mar2type`/`mar2length` stayed
        // unset. Unlike every other section, this path never goes through
        // `buildIndicatorConfig`, so nothing seeded them.
        //
        // That is not only cosmetic: `indicatorLoader` sizes MAR's warm-up
        // with `Math.max(mar1length, mar2length)` — NaN when the second is
        // missing — and `MAR`'s constructor calls `ma2Type.toLowerCase()` on
        // the raw argument, a TypeError rather than a fallback.
        //
        // `withFieldDefaults` is the helper the inline editor and the summary
        // card already use to answer "what value does this field effectively
        // have"; running it here persists that same answer, so what is saved
        // matches what was on screen. It only FILLS gaps (`== null`), so every
        // value already set on the row — interval, order size, the DCA step —
        // survives untouched.
        return (withFieldDefaults(getIndicatorDefinition(type), {
          ...ind,
          type,
        } as IndicatorParamsState) ?? { ...ind, type }) as SettingsIndicators;
      }
    );
    updateFormData('indicators', updatedIndicators);
  };

  const handleIndicatorParamsChange = (
    indicator: IndicatorConfig,
    newParams: IndicatorParamsState
  ) => {
    const sanitized = sanitizeIndicatorParams(newParams);
    const updatedIndicators: SettingsIndicators[] = (indicators || []).map(
      (ind) =>
        ind.uuid === indicator.uuid
          ? {
              ...ind,
              ...sanitized,
            }
          : ind
    );
    updateFormData('indicators', updatedIndicators);
  };

  const {
    summary: { refresh: balanceRefresh },
  } = terminalControls;

  const { canTriggerBalanceRefresh, handleRefreshBalances } = balanceRefresh;

  // Shared deal overview data and summary for the stats boxes
  const { summary: dealOverviewSummary, ordersOverride } = useDcaOverviewSource(
    mode,
    projection
  );
  const showTpLines = useTp === true || useMultiTp === true;

  // Compute a fallback TP % for the graph when deal close is not fixed TP
  // (e.g. techInd mode). Use minTp if available, otherwise 1%.
  const fallbackTpPercent = useMemo(() => {
    if (dealCloseCondition === CloseConditionEnum.tp) return undefined;
    const minTpVal = parseFloat(formData.dca?.minTp || '0');
    if (formData.dca?.useMinTP && minTpVal > 0) return minTpVal;
    const tpPercVal = parseFloat(formData.dca?.tpPerc || '0');
    if (tpPercVal > 0) return tpPercVal;
    return 1;
  }, [
    dealCloseCondition,
    formData.dca?.minTp,
    formData.dca?.useMinTP,
    formData.dca?.tpPerc,
  ]);

  const stepRange = tradingContext.ranges.step;
  const stepRangeMin = stepRange.min;
  const stepRangeMax = stepRange.max;

  const clampIndicatorStep = useCallback(
    (value: number): number => {
      const fallback = stepRangeMin;
      let normalized = Number.isFinite(value) ? value : fallback;
      if (normalized < stepRangeMin) {
        normalized = stepRangeMin;
      }
      if (typeof stepRangeMax === 'number' && Number.isFinite(stepRangeMax)) {
        normalized = Math.min(normalized, stepRangeMax);
      }
      return Math.round(normalized * 100) / 100;
    },
    [stepRangeMax, stepRangeMin]
  );

  const stepHelperMessage = useMemo(() => {
    const base = formatRange(stepRange, { unit: '%', precision: 2 });
    const reason = describeStepCeiling(stepRange);
    return reason ? `${base}. ${reason}` : base;
  }, [stepRange]);

  const dcaIndicators = useMemo(
    () =>
      indicators.filter(
        (i) => i.indicatorAction === IndicatorAction.startDca
      ) || [],
    [indicators]
  );

  return (
    <>
      <SettingsRow colSpan="full" className="space-y-0!">
        {(dcaIndicators || []).length === 0 ? (
          <SettingsRowSurface
            tone="transparent"
            spacing="none"
            className="text-sm text-muted-foreground"
          >
            No indicators configured. Add technical indicators to trigger DCA
            orders.
          </SettingsRowSurface>
        ) : (
          <MasonryLayout
            gap={16}
            containerBreakpoints={{
              default: 1,
              640: 2,
              1024: 3,
            }}
          >
            {(dcaIndicators || []).map((indicator, index) => (
              <TechnicalIndicatorCard
                key={indicator.uuid}
                indicator={indicator}
                index={index}
                formData={formData}
                updateFormData={updateFormData}
                errors={errors}
                tradingContext={tradingContext}
                openSelector={openDcaIndicatorSelector}
                onSelectIndicator={handleIndicatorSelection}
                onUpdateIndicator={updateIndicator}
                onUpdateIndicatorParams={handleIndicatorParamsChange}
                stepRangeMin={stepRangeMin}
                stepRangeMax={stepRangeMax}
                stepHelperMessage={stepHelperMessage}
                clampStep={clampIndicatorStep}
                onRemove={removeIndicator}
                canTriggerBalanceRefresh={canTriggerBalanceRefresh}
                onRefreshBalances={handleRefreshBalances}
                updateFieldError={updateFieldError}
                mode={mode}
              />
            ))}
          </MasonryLayout>
        )}
      </SettingsRow>

      <SettingsRow
        colSpan="full"
        className="space-y-0!"
        contentClassName="justify-center"
      >
        <Button
          variant="outline"
          onClick={addIndicator}
          disabled={(indicators || []).length >= 20}
        >
          <span className="mr-2">+</span>
          Add DCA Indicator
        </Button>
      </SettingsRow>

      {/* Deal overview as a SettingsRow with tabs in trailing */}
      <Tabs
        defaultValue={isComboBot ? 'table' : 'graph'}
        className="h-full flex flex-col"
      >
        <SettingsRow
          name="DCA overview"
          colSpan="full"
          trailing={
            <TabsList>
              {!isComboBot && <TabsTrigger value="graph">Graph</TabsTrigger>}
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr,260px] gap-md items-start">
            <div className="rounded-md overflow-hidden min-h-80 sm:min-h-[420px]">
              {!isComboBot && (
                <TabsContent value="graph">
                  <DealOverviewGraphTab
                    className="h-full w-full"
                    full
                    showTpLines={showTpLines}
                    orders={ordersOverride}
                    indicatorMode
                    fallbackTpPercent={fallbackTpPercent}
                  />
                </TabsContent>
              )}
              <TabsContent value="table" className="h-full">
                <DealOverviewTableTab
                  className="h-full w-full"
                  widgetId="dca-settings-deal-overview-table"
                  orders={ordersOverride}
                />
              </TabsContent>
            </div>

            <div className="md:pt-0">
              <StatsBoxes
                boxes={[
                  {
                    title: 'Coverage',
                    value: `${dealOverviewSummary.coverage}%`,
                    icon: <TrendingDown className="w-4 h-4" />,
                  },
                  {
                    title: 'Avg Down Power',
                    value: `${parseFloat(dealOverviewSummary.avgDownPower || '0').toFixed(1)}%`,
                    icon: <TrendingUp className="w-4 h-4" />,
                  },
                  {
                    title: 'Total Funds',
                    value: formatTotalFunds(dealOverviewSummary, {
                      strategy,
                      futures,
                      coinm,
                      baseAsset: tradingContext.baseAsset,
                      quoteAsset: tradingContext.quoteAsset,
                    }),
                    icon: <DollarSign className="w-4 h-4" />,
                  },
                ]}
              />
            </div>
          </div>
        </SettingsRow>
      </Tabs>

      {selector}
    </>
  );
};

// Custom DCA Component
interface CustomDcaOrderRowProps {
  order: DCACustom;
  index: number;
  formData: BotFormData;
  updateFormData: DCASettingsProps['updateFormData'];
  errors: BotFormErrors;
  tradingContext: DcaTradingContext;
  availableBalance: number;
  currencyLabel: string;
  stepRangeMin: number;
  stepRangeMax: number | null;
  stepHelperMessage: string;
  clampStep: (value: number) => number;
  onRemove: (id: string) => void;
  onUpdateOrder: (id: string, field: keyof DCACustom, value: string) => void;
  canTriggerBalanceRefresh: boolean;
  onRefreshBalances: () => void;
  updateFieldError: (
    field: keyof BotFormErrors,
    message?: string | undefined
  ) => void;
  mode: BotFormMode;
}

const CustomDcaOrderRow = React.memo<CustomDcaOrderRowProps>(({
  order,
  index,
  formData,
  updateFormData,
  errors,
  tradingContext,
  stepRangeMin,
  stepRangeMax,
  stepHelperMessage,
  clampStep,
  onRemove,
  onUpdateOrder,
  canTriggerBalanceRefresh,
  onRefreshBalances,
  mode,
  //updateFieldError,
}) => {
  const { activePickerField, setActivePickerField, coordinates } =
    useTradingTerminalUtils();
  const isTerminal = formData.terminal;
  const currentPrice = tradingContext.latestPrice || 0;
  const strategy = useBotFormSelector('strategy');
  const dcaCustomList = useBotFormSelector('dcaCustom');

  const stepVariablePath = useMemo(
    () => `dcaCustom.${order.uuid}.step` as DCACustomVarBindingPath,
    [order.uuid]
  );
  const { isBound: isStepVarBound } = useBotVarBinding(stepVariablePath);

  const fixedPath = useMemo(
    () => `dcaCustom.${order.uuid}.fixed`,
    [order.uuid]
  );

  const sliderValue = useMemo(() => {
    const numericValue = Number.parseFloat(order.step ?? '');
    return clampStep(
      Number.isFinite(numericValue) ? numericValue : stepRangeMin
    );
  }, [clampStep, order.step, stepRangeMin]);

  // Per row: the slider only widens past the comfortable range when THIS
  // order's step needs the room, so a 40% level doesn't coarsen its siblings.
  const stepSliderMax = useMemo(
    () =>
      resolveStepSliderMax({ min: stepRangeMin, max: stepRangeMax }, order.step),
    [stepRangeMin, stepRangeMax, order.step]
  );

  const stepError = errors[`dcaCustom.${order.uuid}.step`] ?? null;

  const handleSliderChange = useCallback(
    (value: number | number[]) => {
      const numericValue = Array.isArray(value) ? value[0] : value;
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampStep(numericValue);
      onUpdateOrder(order.uuid, 'step', formatNumericInput(clamped, 2));
    },
    [clampStep, onUpdateOrder, order.uuid]
  );

  const handleNumberInputChange = useCallback(
    (value: string | number) => {
      if (isStepVarBound) {
        return;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          onUpdateOrder(order.uuid, 'step', value);
          return;
        }
        // Allow incomplete numeric input like '.' or '1.' or '.5'
        const partialNumeric = /^-?\d*\.?\d*$/.test(trimmed);
        const parsed = Number.parseFloat(trimmed);
        if (!partialNumeric) {
          onUpdateOrder(order.uuid, 'step', trimmed);
          return;
        }
        if (trimmed.endsWith('.')) {
          onUpdateOrder(order.uuid, 'step', trimmed);
          return;
        }
        if (!Number.isFinite(parsed)) {
          onUpdateOrder(order.uuid, 'step', trimmed);
          return;
        }
        const clamped = clampStep(parsed);
        onUpdateOrder(order.uuid, 'step', formatNumericInput(clamped, 2));
        return;
      }

      const clamped = clampStep(value);
      onUpdateOrder(order.uuid, 'step', formatNumericInput(clamped, 2));
    },
    [clampStep, isStepVarBound, onUpdateOrder, order.uuid]
  );

  const applyStepVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = clampStep(numericValue);
      onUpdateOrder(order.uuid, 'step', formatNumericInput(clamped, 2));
    },
    [clampStep, onUpdateOrder, order.uuid]
  );

  // When the user picks a price on the chart for this custom DCA order, set the fixed price
  // and compute the corresponding step% relative to the previous DCA order or current price.
  const lastProcessedPickRef = useRef<string | null>(null);
  useEffect(() => {
    if (!coordinates || !fixedPath) return;
    if (coordinates.pickerField !== fixedPath) return;

    const key = `${coordinates.pickerField}:${coordinates.price}`;
    if (lastProcessedPickRef.current === key) return;
    lastProcessedPickRef.current = key;

    const pickedPrice = Number(coordinates.price);
    if (!Number.isFinite(pickedPrice) || pickedPrice <= 0) return;

    // Update the explicit fixed price for this custom order
    onUpdateOrder(order.uuid, 'fixed', String(pickedPrice));

    // Compute step % relative to previous order (or latestPrice)
    const getPrevPrice = (idx: number) => {
      let prev = tradingContext.latestPrice || 0;
      for (let j = 0; j < idx; j++) {
        const prevEntry = dcaCustomList?.[j];
        if (!prevEntry) continue;
        const fixedRaw = prevEntry.fixed;
        if (fixedRaw !== undefined && `${fixedRaw}` !== '') {
          const parsed = Number.parseFloat(String(fixedRaw));
          if (Number.isFinite(parsed) && parsed > 0) {
            prev = parsed;
            continue;
          }
        }
        if (prevEntry.step) {
          const parsedStep = Number.parseFloat(String(prevEntry.step));
          if (Number.isFinite(parsedStep)) {
            const p = parsedStep / 100;
            prev =
              strategy === StrategyEnum.long ? prev * (1 - p) : prev * (1 + p);
          }
        }
      }
      return prev;
    };

    const prev = getPrevPrice(index);
    if (Number.isFinite(prev) && prev > 0) {
      const stepCalc =
        strategy === StrategyEnum.long
          ? Math.abs(((prev - pickedPrice) / prev) * 100)
          : Math.abs(((pickedPrice - prev) / prev) * 100);
      if (Number.isFinite(stepCalc) && stepCalc > 0 && !isStepVarBound) {
        onUpdateOrder(order.uuid, 'step', formatNumericInput(stepCalc, 2));
      }
    }
  }, [
    coordinates,
    fixedPath,
    onUpdateOrder,
    order.uuid,
    dcaCustomList,
    index,
    tradingContext.latestPrice,
    strategy,
    isStepVarBound,
  ]);

  return (
    <Card className="space-y-md" position={1}>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium">DCA Order {index + 1}</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onRemove(order.uuid)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove DCA order ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
        <div className="space-y-xs">
          <Label htmlFor={`step-${order.uuid}`}>
            Step % from previous order
          </Label>
          <Slider
            value={sliderValue}
            onChange={handleSliderChange}
            min={stepRangeMin}
            max={stepSliderMax}
            step={0.01}
            disabled={isStepVarBound}
          />
          <FieldVariableBinding
            path={stepVariablePath}
            varType="float"
            tooltip="Bind step %"
            variant="inline"
            onVariableSelected={applyStepVariable}
            onVariableResolved={applyStepVariable}
          >
            <NumberInput
              id={`step-${order.uuid}`}
              value={order.step}
              onChange={handleNumberInputChange}
              min={stepRangeMin}
              {...(typeof stepRangeMax === 'number' &&
              Number.isFinite(stepRangeMax)
                ? { max: stepRangeMax }
                : {})}
              step={0.01}
              precision={2}
              disabled={isStepVarBound}
              className={`w-full${stepError ? ' border-destructive' : ''}`}
              showControls={false}
              endAdornment={unitAdornment('%')}
            />
          </FieldVariableBinding>
          <p className="text-xs text-muted-foreground">{stepHelperMessage}</p>
        </div>

        {isTerminal && (
          <div className="space-y-xs">
            <Label htmlFor={`fixed-${order.uuid}`}>Fixed Price</Label>
            <NumberInput
              id={`fixed-${order.uuid}`}
              value={order.fixed || ''}
              onChange={(value) =>
                onUpdateOrder(order.uuid, 'fixed', String(value))
              }
              min={0}
              max={currentPrice * 10}
              step={0.01}
              precision={8}
              placeholder={currentPrice > 0 ? currentPrice.toFixed(2) : '0.00'}
              disabled={false}
              showControls={false}
              endAdornment={
                <span className="inline-flex items-center gap-2">
                  {unitAdornment(
                    (() => {
                      const pairKey = Array.isArray(formData.pair)
                        ? formData.pair[0]
                        : formData.pair;
                      const pairMeta = pairKey
                        ? formData.pairMetadata?.[pairKey]
                        : undefined;
                      const base =
                        pairMeta?.baseAsset?.name ??
                        (typeof pairKey === 'string'
                          ? pairKey.split('/')[0]
                          : undefined);
                      const quote =
                        pairMeta?.quoteAsset?.name ??
                        (typeof pairKey === 'string'
                          ? pairKey.split('/')[1]
                          : undefined);
                      return strategy === StrategyEnum.short
                        ? (base ?? 'Price')
                        : (quote ?? 'Price');
                    })()
                  )}

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      // Toggle picker for this specific custom order fixed field
                      setActivePickerField?.((prev: string | false) =>
                        prev === `dcaCustom.${order.uuid}.fixed`
                          ? false
                          : `dcaCustom.${order.uuid}.fixed`
                      );
                    }}
                    className={
                      activePickerField === `dcaCustom.${order.uuid}.fixed`
                        ? 'bg-primary/10 text-primary h-6 w-6'
                        : 'h-6 w-6'
                    }
                    aria-label="Pick price from chart"
                    title="Pick price from chart"
                  >
                    <Crosshair className="h-4 w-4" />
                  </Button>
                </span>
              }
            />
          </div>
        )}

        <DcaOrderSizingControl
          formData={formData}
          updateFormData={updateFormData}
          errors={errors}
          tradingContext={tradingContext}
          idPrefix={`custom-${order.uuid}`}
          label="Order size"
          variablePath={`dcaCustom.${order.uuid}.size`}
          value={order.size}
          onValueChange={(next: string) =>
            onUpdateOrder(order.uuid, 'size', next)
          }
          onRefreshBalance={onRefreshBalances}
          showRefreshButton={canTriggerBalanceRefresh}
          mode={mode}
        />
      </div>
    </Card>
  );
});
CustomDcaOrderRow.displayName = 'CustomDcaOrderRow';

interface TechnicalIndicatorCardProps {
  indicator: IndicatorConfig;
  index: number;
  formData: BotFormData;
  updateFormData: DCASettingsProps['updateFormData'];
  errors: Record<string, string>;
  tradingContext: DcaTradingContext;
  openSelector: ReturnType<typeof useIndicatorSelector>['openSelector'];
  onSelectIndicator: (indicator: IndicatorConfig, type: IndicatorEnum) => void;
  onUpdateIndicator: (
    id: string,
    field: keyof IndicatorConfig,
    value: string | number | boolean
  ) => void;
  onUpdateIndicatorParams: (
    indicator: IndicatorConfig,
    newParams: IndicatorParamsState
  ) => void;
  stepRangeMin: number;
  stepRangeMax: number | null;
  stepHelperMessage: string;
  clampStep: (value: number) => number;
  onRemove: (id: string) => void;
  canTriggerBalanceRefresh: boolean;
  onRefreshBalances: () => void;
  updateFieldError: (
    field: keyof BotFormErrors,
    message?: string | undefined
  ) => void;
  mode: BotFormMode;
}

const TechnicalIndicatorCard: React.FC<TechnicalIndicatorCardProps> = ({
  indicator,
  index,
  formData,
  updateFormData,
  errors,
  tradingContext,
  openSelector,
  onSelectIndicator,
  onUpdateIndicator,
  onUpdateIndicatorParams,
  stepRangeMin,
  stepRangeMax,
  stepHelperMessage,
  clampStep,
  onRemove,
  canTriggerBalanceRefresh,
  onRefreshBalances,
  mode,
  //updateFieldError,
}) => {
  const orderSizeReference = formData.orderSizeReference || 'notional';
  const futures = useBotFormSelector('futures');
  const dcaVolumeBaseOn = useBotFormSelector('dcaVolumeBaseOn');
  const { currentExchange } = useBotFormQuery();
  const minPercError =
    errors[`dcaIndicators.${indicator.uuid}.minPercFromLast`] ?? null;

  const sliderValue = useMemo(() => {
    const numericValue = Number.parseFloat(
      String(indicator.minPercFromLast ?? '')
    );
    if (!Number.isFinite(numericValue)) {
      return clampStep(stepRangeMin);
    }
    return clampStep(numericValue);
  }, [clampStep, indicator.minPercFromLast, stepRangeMin]);

  // Per indicator level: widen the slider only as far as this level's own value
  // needs, so one deep level doesn't make the shallow ones undraggable.
  const stepSliderMax = useMemo(
    () =>
      resolveStepSliderMax(
        { min: stepRangeMin, max: stepRangeMax },
        indicator.minPercFromLast
      ),
    [stepRangeMin, stepRangeMax, indicator.minPercFromLast]
  );

  const minPercVariablePath = useMemo(
    () =>
      `indicators.${indicator.uuid}.minPercFromLast` as IndicatorsVarBindingPath,
    [indicator.uuid]
  );
  const { isBound: isMinPercVarBound } = useBotVarBinding(minPercVariablePath);

  const handleSliderChange = useCallback(
    (value: number | number[]) => {
      if (isMinPercVarBound) {
        return;
      }
      const numericValue = Array.isArray(value) ? value[0] : value;
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const normalized = clampStep(numericValue);
      onUpdateIndicator(
        indicator.uuid,
        'minPercFromLast',
        formatNumericInput(normalized, 2)
      );
    },
    [clampStep, indicator.uuid, isMinPercVarBound, onUpdateIndicator]
  );

  const handleNumberInputChange = useCallback(
    (value: string | number) => {
      if (isMinPercVarBound) {
        return;
      }

      if (value === '' || value === null) {
        onUpdateIndicator(indicator.uuid, 'minPercFromLast', '');
        return;
      }

      const trimmed = String(value).trim();
      // Allow incomplete numeric input like '.' or '1.' or '.5'
      const partialNumeric = /^-?\d*\.?\d*$/.test(trimmed);
      const parsed = Number.parseFloat(trimmed);
      if (!partialNumeric) {
        onUpdateIndicator(indicator.uuid, 'minPercFromLast', trimmed);
        return;
      }
      if (trimmed.endsWith('.')) {
        onUpdateIndicator(indicator.uuid, 'minPercFromLast', trimmed);
        return;
      }
      if (!Number.isFinite(parsed)) {
        onUpdateIndicator(indicator.uuid, 'minPercFromLast', trimmed);
        return;
      }
      const normalized = clampStep(parsed);
      onUpdateIndicator(
        indicator.uuid,
        'minPercFromLast',
        formatNumericInput(normalized, 2)
      );
    },
    [clampStep, indicator.uuid, isMinPercVarBound, onUpdateIndicator]
  );

  const applyMinPercVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const normalized = clampStep(numericValue);
      onUpdateIndicator(
        indicator.uuid,
        'minPercFromLast',
        formatNumericInput(normalized, 2)
      );
    },
    [clampStep, indicator.uuid, onUpdateIndicator]
  );

  let indicatorLabel: string = indicator.type;
  let indicatorDefinition: ReturnType<typeof getIndicatorDefinition> | null =
    null;
  try {
    if (typeof indicator.type === 'string') {
      indicatorDefinition = getIndicatorDefinition(
        indicator.type as IndicatorEnum
      );
      indicatorLabel = indicatorDefinition.label;
    }
  } catch (_error) {
    indicatorLabel = indicator.type;
    indicatorDefinition = null;
  }

  const indicatorParams = useMemo(
    () => (indicator ?? {}) as IndicatorConfig,
    [indicator]
  );

  const indicatorConfigurationSection = indicatorDefinition ? (
    <InlineIndicatorConfig
      definition={indicatorDefinition}
      params={indicatorParams}
      indicatorUuid={indicator.uuid}
      exchange={currentExchange?.provider}
      onChange={(newParams) => onUpdateIndicatorParams(indicator, newParams)}
      className="space-y-sm"
    />
  ) : (
    <SettingsAlert
      variant="error"
      title="Selected indicator definition is unavailable."
    />
  );

  return (
    <SettingsRowSurface tone="inner" spacing="lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            DCA {index + 1}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {indicatorLabel}
          </p>
        </div>
        <div className="flex items-center gap-xs">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              openSelector({
                allowedActions: [
                  IndicatorAction.startDeal,
                  IndicatorAction.startDca,
                  IndicatorAction.closeDeal,
                ],
                title: 'Select indicator',
                onSelect: (type) => onSelectIndicator(indicator, type),
              })
            }
          >
            Change indicator
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(indicator.uuid)}
            aria-label={`Remove DCA indicator ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-sm rounded-md border border-border/60 bg-card p-md">
        <div className="grid gap-md md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
          <div className="space-y-xs">
            <Label htmlFor={`min-perc-${indicator.uuid}`}>
              Minimum % from last filled order
            </Label>
            <Slider
              value={sliderValue}
              onChange={handleSliderChange}
              min={stepRangeMin}
              max={stepSliderMax}
              step={0.01}
              className="w-full"
              disabled={isMinPercVarBound}
            />
          </div>
          <FieldVariableBinding
            path={minPercVariablePath}
            varType="float"
            tooltip="Bind minimum %"
            variant="inline"
            className="w-full"
            contentClassName="w-full"
            onVariableSelected={applyMinPercVariable}
            onVariableResolved={applyMinPercVariable}
          >
            <NumberInput
              id={`min-perc-${indicator.uuid}`}
              value={indicator.minPercFromLast ?? ''}
              onChange={handleNumberInputChange}
              min={stepRangeMin}
              {...(typeof stepRangeMax === 'number' &&
              Number.isFinite(stepRangeMax)
                ? { max: stepRangeMax }
                : {})}
              step={0.01}
              precision={2}
              endAdornment={unitAdornment('%')}
              disabled={isMinPercVarBound}
              className={`w-full${minPercError ? ' border-destructive' : ''}`}
              showControls={false}
            />
          </FieldVariableBinding>
        </div>
        <p className="text-xs text-muted-foreground">{stepHelperMessage}</p>
      </div>

      {(dcaVolumeBaseOn ?? DCAVolumeType.scale) === DCAVolumeType.scale && (
        <div className="space-y-sm rounded-md border border-border/60 bg-card p-md">
          {futures && (
            <div className="space-y-xs">
              <Label>Order size reference</Label>
              <TerminalButtonStack
                value={orderSizeReference}
                onValueChange={(value) =>
                  updateFormData(
                    'orderSizeReference',
                    value as 'notional' | 'cost'
                  )
                }
                options={[
                  { value: 'notional', label: 'Notional Value' },
                  { value: 'cost', label: 'Cost' },
                ]}
              />
            </div>
          )}
          <DcaOrderSizingControl
            formData={formData}
            updateFormData={updateFormData}
            errors={errors}
            tradingContext={tradingContext}
            idPrefix={`technical-${indicator.uuid}`}
            label="DCA order amount"
            variablePath={`indicators.${indicator.uuid}.orderSize`}
            value={indicator.orderSize ?? ''}
            onValueChange={(next) =>
              onUpdateIndicator(indicator.uuid, 'orderSize', next)
            }
            onRefreshBalance={onRefreshBalances}
            showRefreshButton={canTriggerBalanceRefresh}
            mode={mode}
          />
        </div>
      )}

      <div className="space-y-sm rounded-md border border-border/60 bg-card p-md">
        {indicatorConfigurationSection}
      </div>

      {indicator.type === IndicatorEnum.pc ? (
        <a
          href="/help/price-change-indicator"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary transition hover:text-primary/80 hover:underline"
        >
          Learn more
        </a>
      ) : null}
    </SettingsRowSurface>
  );
};

const CustomDCA: React.FC<DCASectionProps> = ({
  formData,
  updateFormData,
  errors,
  tradingContext,
  terminalControls,
  updateFieldError,
  mode,
  projection,
}) => {
  const isComboBot = useMemo(() => formData.type === 'combo', [formData.type]);
  const { coordinates, setCoordinates } = useTradingTerminalUtils();
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const useTp = useBotFormSelector('useTp');
  const useMultiTp = useBotFormSelector('useMultiTp');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const dcaVolumeBaseOn = useBotFormSelector('dcaVolumeBaseOn');
  const dcaCustom = useBotFormSelector('dcaCustom');
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const showVolumeControls = canDisplayRequiredChange({
    dealCloseCondition,
    useTp,
    useMultiTp,
    orderSizeType,
  });
  const stepRange = tradingContext.ranges.step;
  const stepRangeMin = stepRange.min;
  const stepRangeMax = stepRange.max;

  const clampCustomStep = useCallback(
    (value: number): number => {
      const fallback = stepRangeMin;
      let normalized = Number.isFinite(value) ? value : fallback;
      if (normalized < stepRangeMin) {
        normalized = stepRangeMin;
      }
      if (typeof stepRangeMax === 'number' && Number.isFinite(stepRangeMax)) {
        normalized = Math.min(normalized, stepRangeMax);
      }
      return Math.round(normalized * 100) / 100;
    },
    [stepRangeMax, stepRangeMin]
  );

  const stepHelperMessage = useMemo(() => {
    const base = formatRange(stepRange, { unit: '%', precision: 2 });
    const reason = describeStepCeiling(stepRange);
    return reason ? `${base}. ${reason}` : base;
  }, [stepRange]);

  useEffect(() => {
    if (!showVolumeControls && dcaVolumeBaseOn === DCAVolumeType.change) {
      updateFormData('dcaVolumeBaseOn', 'scaled');
    }
  }, [showVolumeControls, dcaVolumeBaseOn, updateFormData]);

  // Track last processed coordinates to prevent duplicate processing
  const lastProcessedCoordinatesRef = useRef<string | null>(null);
  const maybeContext = useOptionalBotFormState();
  const botVars = maybeContext?.botVars ?? null;
  const updateCustomOrder = useCallback(
    (id: string, field: keyof DCACustom, value: string) => {
      const d = dcaCustom || [];
      const orderIndex = d.findIndex((o) => o.uuid === id);
      if (orderIndex === -1) {
        updateFormData('dcaCustom', dcaCustom);
        return;
      }

      const updatedOrders = [...d];

      // Update the field
      updatedOrders[orderIndex] = {
        ...updatedOrders[orderIndex],
        [field]: value,
      };

      // If fixed price changed, try to compute the percent step from previous order
      if (field === 'fixed') {
        // Check if the step is bound to a variable; if so, don't override it
        const stepPath = `dcaCustom.${id}.step` as DCACustomVarBindingPath;
        const isStepVarBound = Boolean(
          botVars?.paths?.some((p: { path: string }) => p.path === stepPath)
        );

        if (!isStepVarBound) {
          const s = strategy;
          const prevOrder = d[orderIndex - 1];
          const prevPriceRaw = prevOrder?.fixed ?? tradingContext.latestPrice;
          const prevPrice = Number(prevPriceRaw ?? NaN);
          const newFixed = Number(value);

          if (
            Number.isFinite(prevPrice) &&
            Number.isFinite(newFixed) &&
            prevPrice !== 0
          ) {
            // For long: step = (prev - curr) / prev * 100
            // For short: step = (curr - prev) / prev * 100
            const rawStep =
              s === StrategyEnum.long
                ? (prevPrice - newFixed) / prevPrice
                : (newFixed - prevPrice) / prevPrice;
            const stepPerc = Math.abs(rawStep * 100);
            const clamped = clampCustomStep(stepPerc);
            updatedOrders[orderIndex].step = formatNumericInput(clamped, 2);
          }

          // Also consider whether we should update the next order's step if it already
          // has a fixed price. That ensures sliders update for orders below the one
          // we just updated when users set a nice price on an earlier order.
          const nextOrder = d[orderIndex + 1];
          if (nextOrder && nextOrder.fixed) {
            const nextStepPath =
              `dcaCustom.${nextOrder.uuid}.step` as DCACustomVarBindingPath;
            const isNextStepVarBound = Boolean(
              botVars?.paths?.some(
                (p: { path: string }) => p.path === nextStepPath
              )
            );

            if (!isNextStepVarBound) {
              const prevPriceForNext = newFixed;
              const nextFixed = Number(nextOrder.fixed);
              if (
                Number.isFinite(prevPriceForNext) &&
                Number.isFinite(nextFixed) &&
                prevPriceForNext !== 0
              ) {
                const rawStepNext =
                  s === StrategyEnum.long
                    ? (prevPriceForNext - nextFixed) / prevPriceForNext
                    : (nextFixed - prevPriceForNext) / prevPriceForNext;
                const nextStepPerc = Math.abs(rawStepNext * 100);
                const nextClamped = clampCustomStep(nextStepPerc);
                updatedOrders[orderIndex + 1] = {
                  ...updatedOrders[orderIndex + 1],
                  step: formatNumericInput(nextClamped, 2),
                };
              }
            }
          }
        }
      } else if (field === 'step') {
        // If the step changed, compute the fixed price for this order relative to previous order
        const fixedPath = `dcaDca.${id}.fixed` as DCACustomVarBindingPath;
        const isFixedVarBound = Boolean(
          botVars?.paths?.some((p: { path: string }) => p.path === fixedPath)
        );

        if (!isFixedVarBound) {
          const s = strategy;
          const prevOrder = d[orderIndex - 1];
          const prevPriceRaw = prevOrder?.fixed ?? tradingContext.latestPrice;
          const prevPrice = Number(prevPriceRaw ?? NaN);
          const stepPerc = Number(value);
          if (Number.isFinite(prevPrice) && Number.isFinite(stepPerc)) {
            const stepRatio = stepPerc / 100;
            const newFixed =
              s === StrategyEnum.long
                ? prevPrice * (1 - stepRatio)
                : prevPrice * (1 + stepRatio);
            if (Number.isFinite(newFixed) && newFixed > 0) {
              updatedOrders[orderIndex] = {
                ...updatedOrders[orderIndex],
                fixed: formatNumericInput(newFixed, 8),
              };
            }
          }
        }
      }

      updateFormData('dcaCustom', updatedOrders);
    },
    [
      strategy,
      dcaCustom,
      tradingContext.latestPrice,
      updateFormData,
      clampCustomStep,
      botVars,
    ]
  );

  // Handle chart picker coordinates for DCA orders
  useEffect(() => {
    if (!coordinates || !coordinates.pickerField) {
      return;
    }

    // Check if this is a DCA custom fixed field using the pickerField from coordinates
    const dcaMatch = coordinates.pickerField.match(/^dcaDca\.([^.]+)\.fixed$/);
    if (!dcaMatch) {
      return;
    }

    // Create a unique key for these coordinates to prevent duplicate processing
    const coordinatesKey = `${coordinates.pickerField}-${coordinates.time}-${coordinates.price}`;
    if (lastProcessedCoordinatesRef.current === coordinatesKey) {
      return; // Already processed these coordinates
    }

    const targetUuid = dcaMatch[1];
    const pickedPrice = coordinates.price;

    logger.infoCategory('DCA-ChartPicker', 'Applying picked price', {
      targetUuid,
      pickedPrice,
      pickerField: coordinates.pickerField,
    });

    // Find the order with this UUID
    const d = dcaCustom || [];
    const orderIndex = d.findIndex((o) => o.uuid === targetUuid);
    if (orderIndex === -1) {
      logger.warnCategory('DCA-ChartPicker', 'Order not found', { targetUuid });
      if (setCoordinates) {
        setCoordinates(null);
      }
      lastProcessedCoordinatesRef.current = null;
      return;
    }

    // Mark as processed BEFORE applying changes to prevent re-processing during render
    lastProcessedCoordinatesRef.current = coordinatesKey;

    // Update the order's fixed price (this also triggers step recomputation)
    updateCustomOrder(targetUuid, 'fixed', pickedPrice.toString());

    // Clear coordinates after processing (this will trigger effect again but will be blocked by ref check)
    if (setCoordinates) {
      setCoordinates(null);
    }
  }, [
    coordinates,
    setCoordinates,
    dcaCustom,
    updateFormData,
    updateCustomOrder,
  ]);

  const { currencyLabel, availableBalance } = useMemo(
    () =>
      resolveBaseOrderContext({
        currencyReference: orderSizeType ?? 'quote',
        strategy: strategy,
        futures: !!futures,
        coinm: !!coinm,
        aggregatedBalances: tradingContext.aggregatedBalances,
        ...(tradingContext.baseAsset
          ? { baseAsset: tradingContext.baseAsset }
          : {}),
        ...(tradingContext.quoteAsset
          ? { quoteAsset: tradingContext.quoteAsset }
          : {}),
        ...(typeof tradingContext.latestPrice === 'number'
          ? { latestPrice: tradingContext.latestPrice }
          : {}),
      }),
    [
      strategy,
      orderSizeType,
      tradingContext.aggregatedBalances,
      tradingContext.baseAsset,
      tradingContext.quoteAsset,
      tradingContext.latestPrice,
      futures,
      coinm,
    ]
  );

  const {
    summary: { refresh: balanceRefresh },
  } = terminalControls;

  const { canTriggerBalanceRefresh, handleRefreshBalances } = balanceRefresh;

  // Shared deal overview data and summary for the stats boxes
  const { summary: dealOverviewSummary, ordersOverride } = useDcaOverviewSource(
    mode,
    projection
  );
  const showTpLines = useTp === true || useMultiTp === true;

  const addCustomOrder = () => {
    const newOrder: DCACustom = {
      uuid: `dca-custom-${Date.now()}`,
      step: '1',
      size: '10',
    };
    const updatedCustom = [...(dcaCustom || []), newOrder];
    updateFormData('dcaCustom', updatedCustom);
  };

  const removeCustomOrder = useCallback(
    (id: string) => {
      const updatedCustom = (dcaCustom || []).filter(
        (order) => order.uuid !== id
      );
      updateFormData('dcaCustom', updatedCustom);
    },
    [dcaCustom, updateFormData]
  );

  return (
    <>
      <SettingsRow name="DCA targets" colSpan="full" className="space-y-0!">
        {(dcaCustom || []).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No custom DCA orders configured. Add orders with specific step
            percentages and sizes.
          </div>
        ) : (
          <MasonryLayout
            gap={16}
            containerBreakpoints={{
              default: 1,
              640: 2,
              1024: 3,
            }}
          >
            {(dcaCustom || []).map((order, index) => (
              <CustomDcaOrderRow
                key={order.uuid}
                order={order}
                index={index}
                formData={formData}
                updateFormData={updateFormData}
                errors={errors}
                tradingContext={tradingContext}
                availableBalance={availableBalance}
                currencyLabel={currencyLabel}
                stepRangeMin={stepRangeMin}
                stepRangeMax={stepRangeMax}
                stepHelperMessage={stepHelperMessage}
                clampStep={clampCustomStep}
                onRemove={removeCustomOrder}
                onUpdateOrder={updateCustomOrder}
                canTriggerBalanceRefresh={canTriggerBalanceRefresh}
                onRefreshBalances={handleRefreshBalances}
                updateFieldError={updateFieldError}
                mode={mode}
              />
            ))}
          </MasonryLayout>
        )}
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={addCustomOrder}
            className="w-full"
          >
            Add DCA Order
          </Button>
        </div>
      </SettingsRow>

      <SettingsLoadMore id="dca-custom-volume-advanced" title="More Settings">
        <SettingsRow
          colSpan="full"
          className="space-y-0!"
          contentClassName="gap-md"
        >
          <SmartOrdersControl
            idPrefix="custom"
            updateFormData={updateFormData}
            errors={errors}
            tradingContext={tradingContext}
          />
        </SettingsRow>
      </SettingsLoadMore>

      {/* Deal overview as a SettingsRow with tabs in trailing */}
      <Tabs
        defaultValue={isComboBot ? 'table' : 'graph'}
        className="h-full flex flex-col"
      >
        <SettingsRow
          name="DCA overview"
          colSpan="full"
          trailing={
            <TabsList>
              {!isComboBot && <TabsTrigger value="graph">Graph</TabsTrigger>}
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr,260px] gap-md items-start">
            <div className="rounded-md overflow-hidden min-h-80 sm:min-h-[420px]">
              {!isComboBot && (
                <TabsContent value="graph">
                  <DealOverviewGraphTab
                    className="h-full w-full"
                    full
                    showTpLines={showTpLines}
                    orders={ordersOverride}
                  />
                </TabsContent>
              )}
              <TabsContent value="table" className="h-full">
                <DealOverviewTableTab
                  className="h-full w-full"
                  widgetId="dca-settings-deal-overview-table"
                  orders={ordersOverride}
                />
              </TabsContent>
            </div>

            <div className="md:pt-0">
              <StatsBoxes
                boxes={[
                  {
                    title: 'Coverage',
                    value: `${dealOverviewSummary.coverage}%`,
                    icon: <TrendingDown className="w-4 h-4" />,
                  },
                  {
                    title: 'Avg Down Power',
                    value: `${parseFloat(dealOverviewSummary.avgDownPower || '0').toFixed(1)}%`,
                    icon: <TrendingUp className="w-4 h-4" />,
                  },
                  {
                    title: 'Total Funds',
                    value: formatTotalFunds(dealOverviewSummary, {
                      strategy,
                      futures,
                      coinm,
                      baseAsset: tradingContext.baseAsset,
                      quoteAsset: tradingContext.quoteAsset,
                    }),
                    icon: <DollarSign className="w-4 h-4" />,
                  },
                ]}
              />
            </div>
          </div>
        </SettingsRow>
      </Tabs>
    </>
  );
};

export const DCASettings: React.FC<DCASettingsProps> = ({
  onUpdateBalances,
}) => {
  const {
    formData,
    updateFormData,
    errors,
    setErrors: setFormErrors,
    mode,
  } = useBotFormState();
  const useDca = useBotFormSelector('useDca');
  const dcaCondition = useBotFormSelector('dcaCondition');
  const dcaByMarket = useBotFormSelector('dcaByMarket');
  // Pass `bot` so the trading context falls back to the bot's saved symbol
  // when `formData.pairMetadata` is empty — happens in the readonly bot-view
  // dialog where ReadOnlyBotForm seeds an empty `pairMetadata` (no exchange
  // query runs). Without this fallback, `tradingContext.quoteAsset` is
  // undefined and every DCA order amount field's coin icon defaults to USDT
  // even on bots whose pair is e.g. BTC-USDC. Strategy Settings already does
  // this — DCA Settings needs the same treatment. The hook only reads
  // `bot.symbol[0].value.{baseAsset, quoteAsset}`, which exists on all bot
  // variants — the cast just satisfies the hook's narrower DcaBot type.
  const { bot: queryBot } = useBotFormQuery();
  const tradingContext = useDcaTradingContext(formData, {
    bot: (queryBot ?? null) as DcaBot | null,
  });

  // In the read-only settings view there's no live form store feeding the DCA
  // overview, so project the saved bot directly and render the stats / table /
  // graph from it. Disabled (null) in create/edit, where the store is the
  // source of truth.
  const projection = useBotDcaProjection(
    mode === 'settings-readonly'
      ? (queryBot as unknown as Parameters<typeof useBotDcaProjection>[0])
      : null
  );

  const terminalControls = useTerminalControls({
    formData,
    tradingContext,
    updateFormData,
    ...(typeof onUpdateBalances === 'function' ? { onUpdateBalances } : {}),
  });

  const updateFieldError = useCallback(
    (field: keyof BotFormErrors, message?: string) => {
      setFormErrors((previous) => {
        if (!message) {
          if (!(field in previous)) {
            return previous;
          }
          const { [field]: _removed, ...rest } = previous;
          return rest;
        }

        if (previous[field] === message) {
          return previous;
        }

        return {
          ...previous,
          [field]: message,
        };
      });
    },
    [setFormErrors]
  );

  const renderDCATypeContent = () => {
    const sharedProps: DCASectionProps = {
      formData,
      updateFormData,
      errors,
      tradingContext,
      terminalControls,
      updateFieldError,
      mode,
      projection,
    };
    if (
      isDealEdit &&
      dcaCondition &&
      dcaCondition !== DCAConditionEnum.percentage
    ) {
      return (
        <SettingsAlert
          variant="warning"
          title="DCA condition cannot be changed for existing deals. Showing percentage-based DCA settings."
        />
      );
    }

    switch (dcaCondition) {
      case DCAConditionEnum.indicators:
        return <TechnicalIndicatorsDCA {...sharedProps} />;
      case DCAConditionEnum.custom:
        return <CustomDCA {...sharedProps} />;
      case DCAConditionEnum.percentage:
      default:
        return <ScaledDCA {...sharedProps} />;
    }
  };

  const isComboBot = useMemo(
    () => formData.type === BotTypesEnum.combo,
    [formData.type]
  );

  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );

  if (!useDca) {
    return null;
  }

  return (
    <>
      {!isComboBot && !isDealEdit && (
        <SettingsRow
          name="DCA type"
          tooltip="Choose how the bot generates and manages DCA orders."
          tooltipURL="/help/dca-mode"
        >
          <Tabs
            value={dcaCondition || DCAConditionEnum.percentage}
            onValueChange={(value) => updateFormData('dcaCondition', value)}
            className="w-full"
          >
            <TabsList className="w-full">
              <TabsTrigger
                value={DCAConditionEnum.percentage}
                className="w-1/3"
              >
                Scaled
              </TabsTrigger>
              <TabsTrigger
                value={DCAConditionEnum.indicators}
                className="w-1/3"
              >
                Indicators
              </TabsTrigger>
              <TabsTrigger value={DCAConditionEnum.custom} className="w-1/3">
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingsRow>
      )}

      {dcaCondition !== DCAConditionEnum.indicators &&
        dcaCondition !== DCAConditionEnum.dynamicAr && (
          <SettingsRow
            name="DCA order type"
            tooltip="Place DCA orders as market orders instead of limit orders. This can help ensure DCA orders are filled quickly and funds are not locked in advance, but deviation from the desired price may occur."
          >
            <TerminalButtonStack
              value={dcaByMarket ? 'market' : 'limit'}
              onValueChange={(value) =>
                updateFormData('dcaByMarket', value === 'market')
              }
              options={[
                { value: 'limit', label: 'Limit' },
                { value: 'market', label: 'Market' },
              ]}
            />
          </SettingsRow>
        )}

      <div className="col-span-full space-y-md">{renderDCATypeContent()}</div>
    </>
  );
};
