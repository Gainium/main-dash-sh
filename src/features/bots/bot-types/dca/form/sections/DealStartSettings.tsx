import { Button } from '@/components/ui/button';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Input } from '@/components/ui/input';
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
import SettingsAlert from '@/components/ui/SettingsAlert';
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormActions,
  useBotFormAlerts,
  useBotFormErrors,
  useBotFormSelector,
  useBotFormTopLevelSelector,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { IndicatorGroupsManager } from '@/features/bots/shared/components/IndicatorGroupsManager';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import useBotVarBinding from '@/hooks/bots/global-variables/useBotVarBinding';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { useIndicatorSelector } from '@/hooks/useIndicatorSelector';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  CooldownOptionsEnum,
  CooldownUnits,
  IndicatorAction,
  IndicatorEnum,
  indicatorsLimit,
  IndicatorsLogicEnum,
  PairPrioritizationEnum,
  StartConditionEnum,
  startConditions,
  startConditionsMap,
  VolumeValueEnum,
  type DCABotSettings,
} from '@/types';
import type { GlobalVariable } from '@/types/globalVariables';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import { getIndicatorDefaultParams } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {} from '@/types/indicators/indicatorTypes';
import {
  collectStartIndicatorIntervals,
  generateStartGroupId,
  shouldDisplayHigherTimeframeLimiter,
} from '@/utils/bots/dca/deal-start-behaviours';
import {
  buildIndicatorConfig,
  sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { getValidTimezone } from '@/utils/timeUtils';
import { Info } from 'lucide-react';
import React, { useMemo } from 'react';

type NormalizedSymbol = {
  base: string;
  quote: string;
};

const COMMON_QUOTES = [
  'USDT',
  'USDC',
  'BTC',
  'ETH',
  'BNB',
  'BUSD',
  'USD',
  'EUR',
] as const;

const VOLUME_PRESET_OPTIONS: Array<{ value: VolumeValueEnum; label: string }> =
  [
    { value: VolumeValueEnum.top25, label: 'Top 25' },
    { value: VolumeValueEnum.top100, label: 'Top 100' },
    { value: VolumeValueEnum.top200, label: 'Top 200' },
    { value: VolumeValueEnum.custom, label: 'Custom list size' },
  ];

const DEFAULT_VOLUME_PRESET = VolumeValueEnum.top100;
const DEFAULT_CUSTOM_TOP_SIZE = 500;
const DEFAULT_RELATIVE_VOLUME_THRESHOLD = 0.01;
// const UNLIMITED_DEALS_VALUE = -1;

const COOLDOWN_UNITS = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
] as const;

const COOLDOWN_SCOPE_OPTIONS = [
  { value: 'bot', label: 'Per bot' },
  { value: 'symbol', label: 'Per symbol' },
] as const;

const PAIR_PRIORITIZATION_OPTIONS: Array<{
  value: PairPrioritizationEnum;
  label: string;
  description: string;
}> = [
  {
    value: PairPrioritizationEnum.alphabetical,
    label: 'Alphabetical',
    description: '',
  },
  {
    value: PairPrioritizationEnum.random,
    label: 'Random',
    description: '',
  },
];

function normalizeSymbol(pair?: string | null): NormalizedSymbol | null {
  if (!pair) return null;
  const trimmed = pair.trim();
  if (!trimmed) return null;

  const separators = ['/', '_', '-'];
  for (const separator of separators) {
    if (trimmed.includes(separator)) {
      const [base, quote] = trimmed.split(separator);
      if (base && quote) {
        return {
          base: base.toUpperCase(),
          quote: quote.toUpperCase(),
        };
      }
    }
  }

  const upper = trimmed.toUpperCase();
  for (const quote of COMMON_QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return {
        base: upper.slice(0, upper.length - quote.length),
        quote,
      };
    }
  }

  if (upper.length >= 6) {
    return {
      base: upper.slice(0, upper.length - 3),
      quote: upper.slice(-3),
    };
  }

  return null;
}

const toLocalDateTimeInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const DealStartSettings: React.FC = () => {
  const { currentExchange } = useBotFormQuery();
  const { updateFormData } = useBotFormActions();
  const errors = useBotFormErrors();
  const formTerminal = useBotFormTopLevelSelector('terminal');
  const formPair = useBotFormTopLevelSelector('pair');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const timerTimes = React.useMemo(
    () =>
      Array.from(
        { length: 24 },
        (_, index) => `${String(index).padStart(2, '0')}:00`
      ),
    []
  );

  const { openSelector, selector } = useIndicatorSelector();

  const { user: userSettings } = useUserSettings();
  const { isBound: isMaxOpenDealsVarBound } = useBotVarBinding(
    'maxNumberOfOpenDeals'
  );
  const { isBound: isMaxDealsPerPairVarBound } =
    useBotVarBinding('maxDealsPerPair');
  const { isBound: isMaxDealsPerHigherTimeframeVarBound } = useBotVarBinding(
    'maxDealsPerHigherTimeframe'
  );
  const { isBound: isHodlDayVarBound } = useBotVarBinding('hodlDay');
  const { isBound: isMinOpenDealVarBound } = useBotVarBinding('minOpenDeal');
  const { isBound: isMaxOpenDealVarBound } = useBotVarBinding('maxOpenDeal');
  const { isBound: isDynamicOverVarBound } = useBotVarBinding(
    'dynamicPriceFilterOverValue'
  );
  const { isBound: isDynamicUnderVarBound } = useBotVarBinding(
    'dynamicPriceFilterUnderValue'
  );
  const { isBound: isCooldownStartIntervalVarBound } = useBotVarBinding(
    'cooldownAfterDealStartInterval'
  );
  const { isBound: isCooldownCloseIntervalVarBound } = useBotVarBinding(
    'cooldownAfterDealStopInterval'
  );
  const { isBound: isVolumeFilterTopVarBound } = useBotVarBinding('volumeTop');
  const { isBound: isRelativeVolumeTopVarBound } =
    useBotVarBinding('relativeVolumeTop');

  type IntegerBindableField = Extract<
    keyof DCABotSettings,
    | 'maxNumberOfOpenDeals'
    | 'maxDealsPerPair'
    | 'maxDealsPerHigherTimeframe'
    | 'hodlDay'
    | 'cooldownAfterDealStartInterval'
    | 'cooldownAfterDealStopInterval'
    | 'volumeTop'
  >;

  type DecimalBindableField = Extract<
    keyof DCABotSettings,
    | 'minOpenDeal'
    | 'maxOpenDeal'
    | 'dynamicPriceFilterOverValue'
    | 'dynamicPriceFilterUnderValue'
    | 'volumeValue'
    | 'relativeVolumeTop'
  >;

  const applyIntegerVariable = React.useCallback(
    (field: IntegerBindableField, variable: GlobalVariable | null) => {
      if (
        !variable ||
        variable.value === undefined ||
        variable.value === null
      ) {
        return;
      }

      const nextValue = String(variable.value).trim();
      if (!nextValue) {
        return;
      }

      const parsed = Number.parseInt(nextValue, 10);

      if (Number.isFinite(parsed)) {
        if (
          field === 'maxNumberOfOpenDeals' ||
          field === 'maxDealsPerPair' ||
          field === 'maxDealsPerHigherTimeframe' ||
          field === 'volumeTop'
        ) {
          updateFormData(field, parsed);
        } else {
          updateFormData(field, parsed.toString());
        }
        return;
      }

      updateFormData(field, nextValue);
    },
    [updateFormData]
  );

  const applyDecimalVariable = React.useCallback(
    (field: DecimalBindableField, variable: GlobalVariable | null) => {
      if (
        !variable ||
        variable.value === undefined ||
        variable.value === null
      ) {
        return;
      }

      const nextValue = String(variable.value).trim();
      if (!nextValue) {
        return;
      }

      const parsed = Number.parseFloat(nextValue);

      if (Number.isFinite(parsed)) {
        updateFormData(field, parsed.toString());
        return;
      }

      updateFormData(field, nextValue);
    },
    [updateFormData]
  );
  // Stored timezone is free-text and may be an invalid IANA id (e.g. the
  // localized "Europa/Roma"), which throws when fed to Intl/date pickers.
  // Sanitize to a valid zone (falls back to the browser's own).
  const timezone = React.useMemo(
    () => getValidTimezone(userSettings?.timezone),
    [userSettings?.timezone]
  );

  const normalizedSymbols = React.useMemo<NormalizedSymbol[]>(() => {
    const pairs = [formPair || []]
      .flat()
      .map((pair) => normalizeSymbol(pair))
      .filter((symbol): symbol is NormalizedSymbol => Boolean(symbol));

    if (pairs.length > 0) {
      return pairs;
    }

    const metadataPairs = Object.keys(formPairMetadata || {})
      .map((key) => normalizeSymbol(key))
      .filter((symbol): symbol is NormalizedSymbol => Boolean(symbol));

    return metadataPairs;
  }, [formPair, formPairMetadata]);

  const primarySymbol = normalizedSymbols[0] ?? { base: 'BTC', quote: 'USDT' };
  const useMulti = useBotFormSelector('useMulti');
  const maxDealsPerPair = useBotFormSelector('maxDealsPerPair');
  const cooldownAfterDealStartInterval = useBotFormSelector(
    'cooldownAfterDealStartInterval'
  );
  const cooldownAfterDealStartUnits = useBotFormSelector(
    'cooldownAfterDealStartUnits'
  );
  const cooldownAfterDealStartOption = useBotFormSelector(
    'cooldownAfterDealStartOption'
  );
  const useCooldown = useBotFormSelector('useCooldown');
  const cooldownAfterDealStart = useBotFormSelector('cooldownAfterDealStart');
  const cooldownAfterDealStop = useBotFormSelector('cooldownAfterDealStop');
  const useStaticPriceFilter = useBotFormSelector('useStaticPriceFilter');
  const startCondition = useBotFormSelector('startCondition');
  const useBotController = useBotFormSelector('useBotController');
  const botActualStart = useBotFormSelector('botActualStart');
  const indicatorGroups = useBotFormSelector('indicatorGroups');
  const indicators = useBotFormSelector('indicators');
  const hodlNextBuy = useBotFormSelector('hodlNextBuy');
  const useMaxDealsPerHigherTimeframe = useBotFormSelector(
    'useMaxDealsPerHigherTimeframe'
  );
  const hodlDay = useBotFormSelector('hodlDay');
  const hodlAt = useBotFormSelector('hodlAt');
  const hodlHourly = useBotFormSelector('hodlHourly');
  const startDealLogic = useBotFormSelector('startDealLogic');
  const maxNumberOfOpenDeals = useBotFormSelector('maxNumberOfOpenDeals');
  const pairPrioritization = useBotFormSelector('pairPrioritization');
  const maxDealsPerHigherTimeframe = useBotFormSelector(
    'maxDealsPerHigherTimeframe'
  );
  const maxOpenDeal = useBotFormSelector('maxOpenDeal');
  const minOpenDeal = useBotFormSelector('minOpenDeal');
  const useDynamicPriceFilter = useBotFormSelector('useDynamicPriceFilter');
  const dynamicPriceFilterDirection = useBotFormSelector(
    'dynamicPriceFilterDirection'
  );
  const dynamicPriceFilterPriceType = useBotFormSelector(
    'dynamicPriceFilterPriceType'
  );
  const useNoOverlapDeals = useBotFormSelector('useNoOverlapDeals');
  const useVolumeFilterAll = useBotFormSelector('useVolumeFilterAll');
  const useVolumeFilter = useBotFormSelector('useVolumeFilter');
  const volumeValue = useBotFormSelector('volumeValue');
  const volumeTop = useBotFormSelector('volumeTop');
  const useRelativeVolumeFilter = useBotFormSelector('useRelativeVolumeFilter');
  const relativeVolumeValue = useBotFormSelector('relativeVolumeValue');
  const relativeVolumeTop = useBotFormSelector('relativeVolumeTop');
  const dynamicPriceFilterOverValue = useBotFormSelector(
    'dynamicPriceFilterOverValue'
  );
  const dynamicPriceFilterUnderValue = useBotFormSelector(
    'dynamicPriceFilterUnderValue'
  );
  const dynamicPriceFilterDeviation = useBotFormSelector(
    'dynamicPriceFilterDeviation'
  );
  const cooldownAfterDealStopInterval = useBotFormSelector(
    'cooldownAfterDealStopInterval'
  );
  const cooldownAfterDealStopOption = useBotFormSelector(
    'cooldownAfterDealStopOption'
  );
  const cooldownAfterDealStopUnits = useBotFormSelector(
    'cooldownAfterDealStopUnits'
  );
  const isMultiBot = useMemo(() => Boolean(useMulti), [useMulti]);

  // const isUnlimitedValue = React.useCallback((value: unknown) => {
  //   if (typeof value === 'number') {
  //     return value === UNLIMITED_DEALS_VALUE;
  //   }

  //   if (typeof value === 'string') {
  //     return value.trim() === String(UNLIMITED_DEALS_VALUE);
  //   }

  //   return false;
  // }, []);

  const maxDealsPerPairValue = React.useMemo(() => {
    const value = maxDealsPerPair as unknown;
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '';
  }, [maxDealsPerPair]);

  // const maxDealsPerPairIsUnlimited = React.useMemo(
  //   () => isUnlimitedValue(maxDealsPerPairValue),
  //   [isUnlimitedValue, maxDealsPerPairValue]
  // );

  const handleNumericStringChange = React.useCallback(
    (field: Fields, value: number | string) => {
      const normalized = value === '' ? '' : String(value);
      updateFormData(field, normalized);
    },
    [updateFormData]
  );

  const startCooldownIntervalRaw = cooldownAfterDealStartInterval;

  const hasMirrorableStartCooldownInterval = React.useMemo(() => {
    if (typeof startCooldownIntervalRaw === 'number') {
      return Number.isFinite(startCooldownIntervalRaw);
    }

    /*  if (typeof startCooldownIntervalRaw === 'string') {
      const trimmed = startCooldownIntervalRaw.trim();
      if (!trimmed.length) {
        return false;
      }

      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed);
    } */

    return false;
  }, [startCooldownIntervalRaw]);

  const mirrorCooldownHelperVisible = React.useMemo(
    () =>
      Boolean(
        useCooldown &&
        cooldownAfterDealStart &&
        cooldownAfterDealStop &&
        !isCooldownCloseIntervalVarBound &&
        hasMirrorableStartCooldownInterval
      ),
    [
      useCooldown,
      cooldownAfterDealStart,
      cooldownAfterDealStop,
      isCooldownCloseIntervalVarBound,
      hasMirrorableStartCooldownInterval,
    ]
  );

  const handleMirrorCooldownValues = React.useCallback(() => {
    const rawInterval = cooldownAfterDealStartInterval;
    const normalizedInterval =
      typeof rawInterval === 'number'
        ? rawInterval
        : Number.parseInt(String(rawInterval ?? ''), 10);

    if (!Number.isFinite(normalizedInterval)) {
      return;
    }

    handleNumericStringChange(
      'cooldownAfterDealStopInterval',
      normalizedInterval
    );

    const startUnits = cooldownAfterDealStartUnits;
    if (startUnits) {
      updateFormData('cooldownAfterDealStopUnits', startUnits);
    }

    if (isMultiBot) {
      const startScope = cooldownAfterDealStartOption;
      if (startScope) {
        updateFormData('cooldownAfterDealStopOption', startScope);
      }
    }
  }, [
    cooldownAfterDealStartInterval,
    cooldownAfterDealStartUnits,
    cooldownAfterDealStartOption,
    handleNumericStringChange,
    isMultiBot,
    updateFormData,
  ]);

  React.useEffect(() => {
    if (isMultiBot && useStaticPriceFilter) {
      updateFormData('useStaticPriceFilter', false);
    }
  }, [isMultiBot, useStaticPriceFilter, updateFormData]);

  React.useEffect(() => {
    if (!useCooldown) {
      if (cooldownAfterDealStart) {
        updateFormData('cooldownAfterDealStart', false);
      }
      if (cooldownAfterDealStop) {
        updateFormData('cooldownAfterDealStop', false);
      }
    }
  }, [
    useCooldown,
    cooldownAfterDealStart,
    cooldownAfterDealStop,
    updateFormData,
  ]);

  React.useEffect(() => {
    if (startCondition !== StartConditionEnum.tradingviewSignals) {
      return;
    }

    if (!useBotController) {
      updateFormData('useBotController', true);
    }

    if (botActualStart !== 'manual') {
      updateFormData('botActualStart', 'manual');
    }
  }, [startCondition, useBotController, botActualStart, updateFormData]);

  const timerMinimumDateTime = React.useMemo(
    () => toLocalDateTimeInputValue(new Date(Date.now() + 60_000)),
    []
  );

  const startIndicatorGroups = React.useMemo(
    () =>
      indicatorGroups.filter((f) => f.action === IndicatorAction.startDeal) ||
      [],
    [indicatorGroups]
  );

  const uniqueStartIndicatorIntervals = React.useMemo(
    () => collectStartIndicatorIntervals(startCondition, indicators),
    [indicators, startCondition]
  );

  const shouldShowHigherTimeframeLimiter = React.useMemo(
    () =>
      shouldDisplayHigherTimeframeLimiter(
        startCondition,
        uniqueStartIndicatorIntervals
      ),
    [startCondition, uniqueStartIndicatorIntervals]
  );
  React.useEffect(() => {
    if (!shouldShowHigherTimeframeLimiter && useMaxDealsPerHigherTimeframe) {
      updateFormData('useMaxDealsPerHigherTimeframe', false);
    }
  }, [
    useMaxDealsPerHigherTimeframe,
    shouldShowHigherTimeframeLimiter,
    updateFormData,
  ]);

  // Validation for higher-timeframe limiter and timer next-buy is handled by
  // the centralized validation (`hotValidateDcaFormData` / `validateDcaFormData`).
  // Remove component-local error mutations to keep a single source of truth.

  const totalIndicators = React.useMemo(() => {
    return indicators.length;
  }, [indicators.length]);

  const startIndicatorErrorMessage = errors['indicators'];

  const alerts = useBotFormAlerts();

  // Automatically add first indicator group when enabling technical indicators
  React.useEffect(() => {
    if (startCondition === StartConditionEnum.ti) {
      if (startIndicatorGroups.length === 0) {
        const newGroup: IndicatorGroup = {
          id: generateStartGroupId(),
          logic: IndicatorsLogicEnum.and,
          action: IndicatorAction.startDeal,
        };
        updateFormData('indicatorGroups', [...indicatorGroups, newGroup]);
      }
    }
  }, [
    startCondition,
    startIndicatorGroups.length,
    updateFormData,
    indicatorGroups,
  ]);

  const syncStartIndicatorsGroups = React.useCallback(
    (nextGroups: IndicatorGroup[]) => {
      updateFormData('indicatorGroups', [
        ...indicatorGroups.filter(
          (group) => group.action !== IndicatorAction.startDeal
        ),
        ...nextGroups,
      ]);
    },
    [indicatorGroups, updateFormData]
  );

  const handleAddStartGroup = React.useCallback(() => {
    if (
      /* startIndicatorGroups.length >= MAX_START_INDICATOR_GROUPS || */
      totalIndicators >= indicatorsLimit
    ) {
      return;
    }

    const newGroup: IndicatorGroup = {
      id: generateStartGroupId(),
      logic: IndicatorsLogicEnum.and,
      action: IndicatorAction.startDeal,
    };

    updateFormData('indicatorGroups', [...indicatorGroups, newGroup]);
  }, [updateFormData, indicatorGroups, totalIndicators]);

  const handleRemoveStartGroup = React.useCallback(
    (groupId: string) => {
      syncStartIndicatorsGroups(
        indicatorGroups.filter((group) => group.id !== groupId)
      );
    },
    [syncStartIndicatorsGroups, indicatorGroups]
  );

  const handleUpdateStartGroup = React.useCallback(
    (groupId: string, updates: Partial<IndicatorGroup>) => {
      const nextGroups = startIndicatorGroups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextGroup = {
          ...group,
          ...updates,
        };

        return nextGroup;
      });

      syncStartIndicatorsGroups(nextGroups);
    },
    [startIndicatorGroups, syncStartIndicatorsGroups]
  );

  const { favorites: favoriteIndicators, toggleFavorite } =
    useFavoriteIndicators();

  const handleToggleFavorite = React.useCallback(
    (type: IndicatorEnum, next: boolean) => {
      toggleFavorite(type, next);
    },
    [toggleFavorite]
  );

  const handleAddIndicatorToGroup = React.useCallback(
    (groupId: string) => {
      const targetGroup = startIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      /* if (
        (targetGroup.indicators || []).length >= MAX_START_INDICATORS_PER_GROUP
      ) {
        return;
      } */

      if (totalIndicators >= indicatorsLimit) {
        return;
      }

      // Add a default RSI indicator immediately instead of forcing the user
      // through the selector first. They can swap the type afterwards via the
      // card's "change indicator" control (handleSelectIndicatorTypeInGroup).
      const type = IndicatorEnum.rsi;
      const defaultParams = getIndicatorDefaultParams(
        type,
        IndicatorAction.startDeal
      );
      const newIndicator = buildIndicatorConfig(type, defaultParams, {
        keepConditionBars: '0',
      });

      updateFormData('indicators', [
        ...indicators,
        { ...newIndicator, groupId: groupId },
      ]);
    },
    [startIndicatorGroups, totalIndicators, updateFormData, indicators]
  );

  const handleChangeIndicatorParamsInGroup = React.useCallback(
    (groupId: string, indicatorId: string, params: IndicatorParamsState) => {
      const sanitizedParams = sanitizeIndicatorParams(params);
      updateFormData(
        'indicators',
        indicators.map((indicator) => {
          if (
            indicator.uuid === indicatorId &&
            (indicator.groupId === groupId ||
              (!indicator.groupId && groupId === undefined))
          ) {
            return {
              ...indicator,
              ...sanitizedParams,
            };
          }
          return indicator;
        })
      );
    },
    [indicators, updateFormData]
  );

  const handleSelectIndicatorTypeInGroup = React.useCallback(
    (groupId: string, indicator: IndicatorConfig) => {
      const targetGroup = startIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      openSelector({
        allowedActions: [IndicatorAction.startDeal],
        favorites: favoriteIndicators,
        onToggleFavorite: handleToggleFavorite,
        title: 'Select start indicator',
        onSelect: (type) => {
          const defaultParams = getIndicatorDefaultParams(
            type,
            IndicatorAction.startDeal
          );
          const nextIndicator = buildIndicatorConfig(type, defaultParams, {
            uuid: indicator.uuid,
            keepConditionBars: indicator.keepConditionBars ?? '0',
          });

          updateFormData(
            'indicators',
            indicators.map((candidate) =>
              candidate.uuid === indicator.uuid
                ? {
                    ...candidate,
                    ...nextIndicator,
                    groupId: candidate.groupId ?? groupId,
                  }
                : candidate
            )
          );
        },
      });
    },
    [
      favoriteIndicators,
      handleToggleFavorite,
      openSelector,
      startIndicatorGroups,
      updateFormData,
      indicators,
    ]
  );

  const handleRemoveIndicatorFromGroup = React.useCallback(
    (groupId: string, indicatorId: string) => {
      const indicator = indicators.find((ind) => ind.uuid === indicatorId);
      if (!indicator) {
        return;
      }

      // Count how many indicators are in this group
      const indicatorsInGroup = indicators.filter(
        (ind) => ind.groupId === groupId
      ).length;

      // Remove the indicator
      updateFormData(
        'indicators',
        indicators.filter((ind) => ind.uuid !== indicatorId)
      );

      // Only remove the group if this was the last indicator in it
      if (indicatorsInGroup === 1) {
        updateFormData(
          'indicatorGroups',
          indicatorGroups.filter((group) => group.id !== groupId)
        );
      }
    },
    [updateFormData, indicators, indicatorGroups]
  );

  const handleChangeGroupLogic = React.useCallback(
    (groupId: string, logic: IndicatorGroup['logic']) => {
      handleUpdateStartGroup(groupId, { logic });
    },
    [handleUpdateStartGroup]
  );

  const currencyRef = primarySymbol.quote;
  const currencyDisplay = currencyRef ? ` (${currencyRef})` : '';

  const timerPreview = React.useMemo(() => {
    if (!hodlDay || !hodlAt) {
      return {
        message: 'Configure interval and time to see preview',
      };
    }

    const interval = Number(hodlDay);
    if (!Number.isFinite(interval) || interval <= 0) {
      return {
        message: 'Invalid time configuration',
      };
    }

    const isHourly = Boolean(hodlHourly);
    const quantityPart = interval === 1 ? '' : `${interval} `;
    const unit = isHourly
      ? interval === 1
        ? 'hour'
        : 'hours'
      : interval === 1
        ? 'day'
        : 'days';

    const intro =
      `Bot will open a new deal every ${quantityPart}${unit}`.trimEnd();
    const introWithTime = isHourly
      ? `${intro}.`
      : `${intro} at ${hodlAt} (${timezone} timezone).`;

    let resolvedNext: Date | null = null;
    if (hodlNextBuy) {
      const parsed = new Date(hodlNextBuy);
      if (!Number.isNaN(parsed.getTime())) {
        if (isHourly) {
          resolvedNext = parsed;
        } else {
          const combined = new Date(`${parsed.toDateString()} ${hodlAt}`);
          if (!Number.isNaN(combined.getTime())) {
            resolvedNext = combined;
          }
        }
      }
    }

    const nextRunText = resolvedNext
      ? `Next deal will start on ${resolvedNext.toLocaleString()}${
          isHourly ? ` (${timezone} timezone)` : ''
        }.`
      : 'Next deal timing will be determined after saving the bot.';

    return {
      message: `${introWithTime} ${nextRunText}`,
    };
  }, [hodlAt, hodlDay, hodlHourly, hodlNextBuy, timezone]);

  const isTerminal = useMemo(() => !!formTerminal, [formTerminal]);

  const shouldAutoExpand = Boolean(
    (!isTerminal && useStaticPriceFilter) ||
    useDynamicPriceFilter ||
    useCooldown ||
    (useMulti && useVolumeFilterAll) ||
    ((!useMulti || useVolumeFilterAll) && useVolumeFilter) ||
    useRelativeVolumeFilter
  );

  return (
    <>
      {!isTerminal && (
        <>
          <Tabs
            value={startCondition || StartConditionEnum.asap}
            onValueChange={(value) => updateFormData('startCondition', value)}
            className="h-full flex flex-col"
          >
            <SettingsRow
              name="Deal start condition"
              tooltip="Choose when the bot should start new deals. ASAP means start immediately when conditions are met, Manual requires manual activation, Timer means start at regular intervals, Webhook responds to external signals, and Technical indicators means start based on technical analysis."
              colSpan="full"
            >
              <TabsList className="w-full">
                {startConditions.map((condition) => (
                  <TabsTrigger key={condition} value={condition}>
                    {startConditionsMap[condition]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </SettingsRow>
            {/* Tab contents for each start condition. Put a Masonry inside each content so layout is scoped to the tab */}
            <TabsContent value={StartConditionEnum.timer}>
              <MasonryLayout
                gap={16}
                containerBreakpoints={{
                  default: 1,
                  640: 2,
                  1024: 3,
                }}
              >
                <SettingsRow
                  name="Timer schedule"
                  tooltip="Run the bot on a recurring schedule."
                  colSpan="full"
                  navId="hodlNextBuy"
                >
                  <div className="space-y-lg rounded-lg bg-muted p-md">
                    <div className="space-y-xs">
                      <Label>Open deal every</Label>
                      <div className="grid gap-sm sm:grid-cols-[minmax(0,200px)_minmax(0,160px)] sm:items-start">
                        <FieldVariableBinding
                          path="hodlDay"
                          varType="int"
                          tooltip="Bind interval"
                          variant="inline"
                          onVariableSelected={(variable) =>
                            applyIntegerVariable('hodlDay', variable)
                          }
                          onVariableResolved={(variable) =>
                            applyIntegerVariable('hodlDay', variable)
                          }
                        >
                          <NumberInput
                            value={hodlDay || ''}
                            onChange={(value) =>
                              handleNumericStringChange('hodlDay', value)
                            }
                            min={1}
                            step={1}
                            placeholder="Interval"
                            disabled={isHodlDayVarBound}
                            showControls={false}
                          />
                        </FieldVariableBinding>
                        <Select
                          value={hodlHourly ? 'hours' : 'days'}
                          onValueChange={(value) =>
                            updateFormData('hodlHourly', value === 'hours')
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">
                              {Number(hodlDay || '0') === 1 ? 'Hour' : 'Hours'}
                            </SelectItem>
                            <SelectItem value="days">
                              {Number(hodlDay || '0') === 1 ? 'Day' : 'Days'}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Bind interval
                      </p>
                    </div>

                    <div className="space-y-xs">
                      <Label>Open deal at</Label>
                      <Select
                        value={hodlAt || timerTimes[0]}
                        onValueChange={(value) =>
                          updateFormData('hodlAt', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {timerTimes.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-xs">
                      <Label>Next deal</Label>
                      <Input
                        type="datetime-local"
                        value={
                          Number.isFinite(hodlNextBuy) && hodlNextBuy > 0
                            ? toLocalDateTimeInputValue(new Date(hodlNextBuy))
                            : ''
                        }
                        min={timerMinimumDateTime}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const parsed = raw ? new Date(raw).getTime() : NaN;
                          updateFormData(
                            'hodlNextBuy',
                            Number.isFinite(parsed) ? parsed : NaN
                          );
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Set the next execution window in your local timezone.
                        Leave empty to let the system compute it automatically.
                      </p>
                      <div className="rounded-md bg-blue-500/10 p-sm">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Next Execution Preview
                        </p>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          {timerPreview.message}
                        </p>
                      </div>
                    </div>
                  </div>
                </SettingsRow>
              </MasonryLayout>
            </TabsContent>

            <TabsContent value={StartConditionEnum.ti}>
              <SettingsRow
                name="Technical indicators"
                tooltip="Build grouped technical indicator conditions to trigger new deals."
                colSpan="full"
                trailing={
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <div>
                      Remaining:{' '}
                      {Math.max(indicatorsLimit - totalIndicators, 0)}
                    </div>
                  </div>
                }
              >
                <IndicatorGroupsManager
                  indicators={indicators}
                  indicatorGroups={indicatorGroups}
                  globalLogic={startDealLogic || IndicatorsLogicEnum.and}
                  errorMessage={startIndicatorErrorMessage}
                  totalIndicatorsAcrossBot={totalIndicators}
                  indicatorAction={IndicatorAction.startDeal}
                  exchange={currentExchange?.provider}
                  globalLogicLabel="Group logic"
                  globalLogicOptions={[
                    {
                      value: IndicatorsLogicEnum.and,
                      label: 'AND',
                    },
                    {
                      value: IndicatorsLogicEnum.or,
                      label: 'OR',
                    },
                  ]}
                  emptyStateMessage="No indicator groups configured yet. Add a group to start building your technical start conditions."
                  emptyIndicatorsAlertTitle="No start indicators yet"
                  emptyIndicatorsAlertDescription="Add at least one indicator group to allow the bot to open deals automatically when conditions are met."
                  onAddGroup={handleAddStartGroup}
                  onRemoveGroup={handleRemoveStartGroup}
                  onChangeGroupLogic={handleChangeGroupLogic}
                  onAddIndicatorToGroup={handleAddIndicatorToGroup}
                  onRemoveIndicatorFromGroup={handleRemoveIndicatorFromGroup}
                  onSelectIndicatorType={handleSelectIndicatorTypeInGroup}
                  onChangeIndicatorParams={handleChangeIndicatorParamsInGroup}
                  onChangeGlobalLogic={(value) =>
                    updateFormData('startDealLogic', value)
                  }
                />
              </SettingsRow>
            </TabsContent>

            {/* Provide empty tab contents for other conditions to keep consistent behavior */}
            {startConditions
              .filter(
                (c) =>
                  c !== StartConditionEnum.timer && c !== StartConditionEnum.ti
              )
              .map((condition) => (
                <TabsContent key={condition} value={condition} />
              ))}
          </Tabs>
        </>
      )}

      <MasonryLayout
        gap={16}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        {!isTerminal && (
          <SettingsRow
            name="Max open deals"
            tooltip="This is the maximum number of concurrent deals the bot can open at any given time. Any signals for deal start received after the bot reaches this number will be ignored."
            navId="max-open-deals"
            alerts={alerts?.maxNumberOfOpenDeals ?? []}
          >
            <div className="space-y-xs">
              <FieldVariableBinding
                path="maxNumberOfOpenDeals"
                varType="int"
                tooltip="Bind max open deals"
                variant="inline"
                onVariableResolved={(variable) =>
                  applyIntegerVariable('maxNumberOfOpenDeals', variable)
                }
                onVariableSelected={(variable) =>
                  applyIntegerVariable('maxNumberOfOpenDeals', variable)
                }
              >
                <NumberInput
                  id="max-open-deals"
                  value={maxNumberOfOpenDeals || '1'}
                  onChange={(value) => {
                    const normalized =
                      typeof value === 'number'
                        ? value.toString()
                        : String(value ?? '');
                    updateFormData('maxNumberOfOpenDeals', normalized);
                  }}
                  min={-1}
                  step={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', { size: 'sm' })}
                  className="w-full"
                  disabled={isMaxOpenDealsVarBound}
                />
              </FieldVariableBinding>
              <p className="text-xs text-muted-foreground">
                Max opened deals 200
              </p>
            </div>
          </SettingsRow>
        )}

        {isMultiBot && (
          <SettingsRow
            name="Max open deals per pair"
            tooltip="The total number of simultaneous open deals the bot is allowed to open per token pair. Once this number is reached on a specific pair the bot won't be allowed to open new ones."
          >
            <div className="space-y-xs">
              <FieldVariableBinding
                path="maxDealsPerPair"
                varType="int"
                tooltip="Bind deals per pair"
                variant="inline"
                // inlineAdornment={
                //   !isMaxDealsPerPairVarBound &&
                //   !maxDealsPerPairIsUnlimited ? (
                //     <Tooltip tooltip="Set unlimited deals" delay={150}>
                //       <Button
                //         type="button"
                //         size="sm"
                //         variant="ghost"
                //         className="h-7 px-2 text-xs"
                //         onClick={() =>
                //           updateFormData(
                //             'maxDealsPerPair',
                //             UNLIMITED_DEALS_VALUE
                //           )
                //         }
                //       >
                //         Unlimited
                //       </Button>
                //     </Tooltip>
                //   ) : undefined
                // }
                inlineAdornmentClassName="pr-1"
                onVariableResolved={(variable) =>
                  applyIntegerVariable('maxDealsPerPair', variable)
                }
                onVariableSelected={(variable) =>
                  applyIntegerVariable('maxDealsPerPair', variable)
                }
              >
                <NumberInput
                  id="max-deals-per-pair"
                  value={maxDealsPerPairValue}
                  onChange={(value) =>
                    updateFormData(
                      'maxDealsPerPair',
                      typeof value === 'number'
                        ? value.toString()
                        : String(value ?? '')
                    )
                  }
                  min={-1}
                  step={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', { size: 'sm' })}
                  className="w-full"
                  disabled={isMaxDealsPerPairVarBound}
                />
              </FieldVariableBinding>
              <p className="text-xs text-muted-foreground">
                Max deals per pair 200
              </p>
            </div>
          </SettingsRow>
        )}

        {isMultiBot && (
          <SettingsRow
            name="Pair prioritization"
            tooltip="When the bot has limited deal slots it will rely on this priority to decide which pair receives the next position."
          >
            <Select
              value={pairPrioritization || 'alphabetical'}
              onValueChange={(value) =>
                updateFormData(
                  'pairPrioritization',
                  value as PairPrioritizationEnum
                )
              }
            >
              <SelectTrigger
                id="pair-prioritization"
                className="w-full sm:w-72"
              >
                <SelectValue placeholder="Select prioritization" />
              </SelectTrigger>
              <SelectContent>
                {PAIR_PRIORITIZATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col text-left">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        )}

        {shouldShowHigherTimeframeLimiter && (
          <SettingsRow
            name="Limit deals per higher timeframe bar"
            tooltip="Activating this option will allow you to limit how many deals are opened per higher timeframe bar. For example, if you use an indicator on 1 Day and another on 1H, and set this option to 1, the bot will open no more than 1 deal for every daily candle."
            trailing={
              <Switch
                id="max-deals-higher-timeframe"
                checked={useMaxDealsPerHigherTimeframe || false}
                onCheckedChange={(checked) =>
                  updateFormData('useMaxDealsPerHigherTimeframe', checked)
                }
              />
            }
            headerAlign="center"
          >
            {(useMaxDealsPerHigherTimeframe || false) && (
              <div className="space-y-xs">
                <FieldVariableBinding
                  path="maxDealsPerHigherTimeframe"
                  varType="int"
                  tooltip="Bind per-bar limit"
                  variant="inline"
                  onVariableSelected={(variable) =>
                    applyIntegerVariable('maxDealsPerHigherTimeframe', variable)
                  }
                  onVariableResolved={(variable) =>
                    applyIntegerVariable('maxDealsPerHigherTimeframe', variable)
                  }
                >
                  <NumberInput
                    id="max-deals-higher-timeframe"
                    value={maxDealsPerHigherTimeframe || '1'}
                    onChange={(value) =>
                      updateFormData(
                        'maxDealsPerHigherTimeframe',
                        typeof value === 'number'
                          ? value.toString()
                          : String(value ?? '')
                      )
                    }
                    min={1}
                    showControls={false}
                    endAdornment={unitAdornment('deals', { size: 'sm' })}
                    className="w-full"
                    disabled={isMaxDealsPerHigherTimeframeVarBound}
                  />
                </FieldVariableBinding>
              </div>
            )}
          </SettingsRow>
        )}
      </MasonryLayout>

      <SettingsLoadMore id="deal-start-advanced" autoExpand={shouldAutoExpand}>
        {!isTerminal && (
          <SettingsRow
            name="Static price filter"
            tooltip="Allows you to set a defined price range where the bot can trade."
            tooltipURL="/help/price-filters"
            trailing={
              <Switch
                id="static-price-filter"
                checked={!isMultiBot && (useStaticPriceFilter || false)}
                onCheckedChange={(checked) => {
                  if (!isMultiBot) {
                    updateFormData('useStaticPriceFilter', checked);
                  }
                }}
                disabled={isMultiBot}
              />
            }
            headerAlign="center"
          >
            {isMultiBot ? (
              <SettingsAlert title="Static price filters are only available for single-pair bots." />
            ) : useStaticPriceFilter ? (
              <div className="grid gap-md sm:grid-cols-2">
                <div className="space-y-xs">
                  <Label htmlFor="min-open-deal">
                    Minimum price to open deal{currencyDisplay}
                  </Label>
                  <FieldVariableBinding
                    path="minOpenDeal"
                    varType="float"
                    tooltip="Bind minimum price"
                    variant="inline"
                    onVariableSelected={(variable) =>
                      applyDecimalVariable('minOpenDeal', variable)
                    }
                    onVariableResolved={(variable) =>
                      applyDecimalVariable('minOpenDeal', variable)
                    }
                  >
                    <NumberInput
                      id="min-open-deal"
                      value={minOpenDeal || ''}
                      onChange={(value) =>
                        handleNumericStringChange('minOpenDeal', value)
                      }
                      placeholder="0"
                      showControls={false}
                      endAdornment={
                        currencyRef
                          ? unitAdornment(currencyRef, {
                              size: 'sm',
                              className: 'whitespace-nowrap',
                            })
                          : undefined
                      }
                      disabled={isMinOpenDealVarBound}
                    />
                  </FieldVariableBinding>
                  <p className="text-xs text-muted-foreground">
                    Bind minimum price
                  </p>
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="max-open-deal">
                    Maximum price to open deal{currencyDisplay}
                  </Label>
                  <FieldVariableBinding
                    path="maxOpenDeal"
                    varType="float"
                    tooltip="Bind maximum price"
                    variant="inline"
                    onVariableSelected={(variable) =>
                      applyDecimalVariable('maxOpenDeal', variable)
                    }
                    onVariableResolved={(variable) =>
                      applyDecimalVariable('maxOpenDeal', variable)
                    }
                  >
                    <NumberInput
                      id="max-open-deal"
                      value={maxOpenDeal || ''}
                      onChange={(value) =>
                        handleNumericStringChange('maxOpenDeal', value)
                      }
                      placeholder="0"
                      showControls={false}
                      endAdornment={
                        currencyRef
                          ? unitAdornment(currencyRef, {
                              size: 'sm',
                              className: 'whitespace-nowrap',
                            })
                          : undefined
                      }
                      disabled={isMaxOpenDealVarBound}
                    />
                  </FieldVariableBinding>
                </div>
              </div>
            ) : null}
          </SettingsRow>
        )}

        <SettingsRow
          name="Dynamic price filter"
          tooltip="Filter deals based on price movement relative to a reference point."
          tooltipURL="/help/price-filters"
          trailing={
            <Switch
              id="dynamic-price-filter"
              checked={useDynamicPriceFilter || false}
              onCheckedChange={(checked) =>
                updateFormData('useDynamicPriceFilter', checked)
              }
            />
          }
          headerAlign="center"
          colSpan="full"
        >
          {useDynamicPriceFilter && (
            <div className="space-y-lg">
              <div className="grid gap-md sm:grid-cols-2">
                <div className="space-y-xs">
                  <Label htmlFor="dynamic-price-direction">Direction</Label>
                  <Select
                    value={dynamicPriceFilterDirection || 'under'}
                    onValueChange={(value) =>
                      updateFormData('dynamicPriceFilterDirection', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="over">Over</SelectItem>
                      <SelectItem value="under">Under</SelectItem>
                      <SelectItem value="overAndUnder">
                        Over and Under
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="dynamic-price-source">Price source</Label>
                  <Select
                    value={dynamicPriceFilterPriceType || 'entry'}
                    onValueChange={(value) =>
                      updateFormData('dynamicPriceFilterPriceType', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry price</SelectItem>
                      <SelectItem value="avg">Average price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-sm">
                <Label>Minimum deviation from last deal</Label>
                <div className="grid gap-md sm:grid-cols-2">
                  {(dynamicPriceFilterDirection === 'over' ||
                    dynamicPriceFilterDirection === 'overAndUnder') && (
                    <div className="space-y-xs">
                      <Label htmlFor="dynamic-price-over">Over value</Label>
                      <FieldVariableBinding
                        path="dynamicPriceFilterOverValue"
                        varType="float"
                        tooltip="Bind over deviation"
                        variant="inline"
                        onVariableSelected={(variable) =>
                          applyDecimalVariable(
                            'dynamicPriceFilterOverValue',
                            variable
                          )
                        }
                        onVariableResolved={(variable) =>
                          applyDecimalVariable(
                            'dynamicPriceFilterOverValue',
                            variable
                          )
                        }
                      >
                        <NumberInput
                          id="dynamic-price-over"
                          value={
                            dynamicPriceFilterOverValue ||
                            dynamicPriceFilterDeviation ||
                            '1'
                          }
                          onChange={(value) =>
                            updateFormData(
                              'dynamicPriceFilterOverValue',
                              typeof value === 'number'
                                ? value.toString()
                                : String(value ?? '')
                            )
                          }
                          placeholder="1"
                          showControls={false}
                          endAdornment={unitAdornment('%')}
                          className="w-full"
                          disabled={isDynamicOverVarBound}
                        />
                      </FieldVariableBinding>
                    </div>
                  )}

                  {(dynamicPriceFilterDirection === 'under' ||
                    dynamicPriceFilterDirection === 'overAndUnder') && (
                    <div className="space-y-xs">
                      <Label htmlFor="dynamic-price-under">Under value</Label>
                      <FieldVariableBinding
                        path="dynamicPriceFilterUnderValue"
                        varType="float"
                        tooltip="Bind under deviation"
                        variant="inline"
                        onVariableSelected={(variable) =>
                          applyDecimalVariable(
                            'dynamicPriceFilterUnderValue',
                            variable
                          )
                        }
                        onVariableResolved={(variable) =>
                          applyDecimalVariable(
                            'dynamicPriceFilterUnderValue',
                            variable
                          )
                        }
                      >
                        <NumberInput
                          id="dynamic-price-under"
                          value={
                            dynamicPriceFilterUnderValue ||
                            dynamicPriceFilterDeviation ||
                            '1'
                          }
                          onChange={(value) =>
                            updateFormData(
                              'dynamicPriceFilterUnderValue',
                              typeof value === 'number'
                                ? value.toString()
                                : String(value ?? '')
                            )
                          }
                          placeholder="1"
                          showControls={false}
                          endAdornment={unitAdornment('%')}
                          className="w-full"
                          disabled={isDynamicUnderVarBound}
                        />
                      </FieldVariableBinding>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-sm">
                <Switch
                  id="no-overlap-deals"
                  checked={useNoOverlapDeals || false}
                  onCheckedChange={(checked) =>
                    updateFormData('useNoOverlapDeals', checked)
                  }
                />
                <div className="flex items-center gap-xs">
                  <Label htmlFor="no-overlap-deals">No overlapping deals</Label>
                  <Tooltip tooltip="Prevents the bot from opening a new deal if the price range of the new deal overlaps with the price range of an existing deal.">
                    <InfoIcon />
                  </Tooltip>
                </div>
              </div>
            </div>
          )}
        </SettingsRow>

        <SettingsRow
          name="Cooldown"
          tooltip="Activate a timer after deal start or close during which new entry signals will be ignored."
          trailing={
            <Switch
              id="cooldown"
              checked={useCooldown || false}
              onCheckedChange={(checked) =>
                updateFormData('useCooldown', checked)
              }
            />
          }
          headerAlign="center"
          colSpan="full"
        >
          {useCooldown && (
            <div className="space-y-lg rounded-lg border border-border/50 bg-muted/20 p-md">
              <div className="space-y-sm">
                <div className="flex items-center gap-sm">
                  <Switch
                    id="cooldown-after-start-toggle"
                    checked={cooldownAfterDealStart || false}
                    onCheckedChange={(checked) =>
                      updateFormData('cooldownAfterDealStart', checked)
                    }
                  />
                  <div className="flex items-center gap-xs">
                    <Label htmlFor="cooldown-after-start-toggle">
                      Cooldown after deal start
                    </Label>
                    <Tooltip tooltip="Activate a timer after the deal has started during which new entry signals will be ignored.">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                </div>

                {cooldownAfterDealStart && (
                  <div className="grid gap-md sm:grid-cols-3">
                    <div className="space-y-xs">
                      <Label htmlFor="cooldown-start-interval">Interval</Label>
                      <FieldVariableBinding
                        path="cooldownAfterDealStartInterval"
                        varType="int"
                        tooltip="Bind cooldown interval"
                        variant="inline"
                        onVariableSelected={(variable) =>
                          applyIntegerVariable(
                            'cooldownAfterDealStartInterval',
                            variable
                          )
                        }
                        onVariableResolved={(variable) =>
                          applyIntegerVariable(
                            'cooldownAfterDealStartInterval',
                            variable
                          )
                        }
                      >
                        <NumberInput
                          id="cooldown-start-interval"
                          value={cooldownAfterDealStartInterval || ''}
                          onChange={(value) =>
                            handleNumericStringChange(
                              'cooldownAfterDealStartInterval',
                              value
                            )
                          }
                          placeholder="1"
                          min={0}
                          disabled={isCooldownStartIntervalVarBound}
                          showControls={false}
                        />
                      </FieldVariableBinding>
                      <p className="text-xs text-muted-foreground">
                        Bind cooldown interval
                      </p>
                    </div>
                    <div className="space-y-xs">
                      <Label htmlFor="cooldown-start-units">Units</Label>
                      <Select
                        value={cooldownAfterDealStartUnits || 'seconds'}
                        onValueChange={(value) =>
                          updateFormData(
                            'cooldownAfterDealStartUnits',
                            value as CooldownUnits
                          )
                        }
                      >
                        <SelectTrigger id="cooldown-start-units">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COOLDOWN_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isMultiBot && (
                      <div className="space-y-xs">
                        <Label htmlFor="cooldown-start-scope">
                          Count start events
                        </Label>
                        <Select
                          value={cooldownAfterDealStartOption || 'bot'}
                          onValueChange={(value) =>
                            updateFormData(
                              'cooldownAfterDealStartOption',
                              value as CooldownOptionsEnum
                            )
                          }
                        >
                          <SelectTrigger id="cooldown-start-scope">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COOLDOWN_SCOPE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-sm">
                <div className="flex items-center gap-sm">
                  <Switch
                    id="cooldown-after-close-toggle"
                    checked={cooldownAfterDealStop || false}
                    onCheckedChange={(checked) =>
                      updateFormData('cooldownAfterDealStop', checked)
                    }
                  />
                  <div className="flex items-center gap-xs">
                    <Label htmlFor="cooldown-after-close-toggle">
                      Cooldown after deal close
                    </Label>
                    <Tooltip tooltip="Activate a timer after the deal has closed during which new entry signals will be ignored.">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                </div>

                {cooldownAfterDealStop && (
                  <div className="grid gap-md sm:grid-cols-3">
                    <div className="space-y-xs">
                      <Label htmlFor="cooldown-close-interval">Interval</Label>
                      <FieldVariableBinding
                        path="cooldownAfterDealStopInterval"
                        varType="int"
                        tooltip="Bind cooldown interval"
                        variant="inline"
                        inlineAdornment={
                          mirrorCooldownHelperVisible ? (
                            <Tooltip tooltip="Copy start cooldown" delay={150}>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={handleMirrorCooldownValues}
                              >
                                Copy start
                              </Button>
                            </Tooltip>
                          ) : undefined
                        }
                        inlineAdornmentClassName="pr-1"
                        onVariableSelected={(variable) =>
                          applyIntegerVariable(
                            'cooldownAfterDealStopInterval',
                            variable
                          )
                        }
                        onVariableResolved={(variable) =>
                          applyIntegerVariable(
                            'cooldownAfterDealStopInterval',
                            variable
                          )
                        }
                      >
                        <NumberInput
                          id="cooldown-close-interval"
                          value={cooldownAfterDealStopInterval || ''}
                          onChange={(value) =>
                            handleNumericStringChange(
                              'cooldownAfterDealStopInterval',
                              value
                            )
                          }
                          placeholder="1"
                          min={0}
                          disabled={isCooldownCloseIntervalVarBound}
                          showControls={false}
                        />
                      </FieldVariableBinding>
                      <p className="text-xs text-muted-foreground">
                        Bind cooldown interval
                      </p>
                    </div>
                    <div className="space-y-xs">
                      <Label htmlFor="cooldown-close-units">Units</Label>
                      <Select
                        value={cooldownAfterDealStopUnits || 'seconds'}
                        onValueChange={(value) =>
                          updateFormData(
                            'cooldownAfterDealStopUnits',
                            value as CooldownUnits
                          )
                        }
                      >
                        <SelectTrigger id="cooldown-close-units">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COOLDOWN_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isMultiBot && (
                      <div className="space-y-xs">
                        <Label htmlFor="cooldown-close-scope">
                          Count close events
                        </Label>
                        <Select
                          value={cooldownAfterDealStopOption || 'bot'}
                          onValueChange={(value) =>
                            updateFormData(
                              'cooldownAfterDealStopOption',
                              value as CooldownOptionsEnum
                            )
                          }
                        >
                          <SelectTrigger id="cooldown-close-scope">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COOLDOWN_SCOPE_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </SettingsRow>

        <SettingsRow
          name="Volume filter"
          tooltip="Prevents trading in low-volume tokens to avoid liquidity issues."
          tooltipURL="/help/volume-filter"
          trailing={
            <Switch
              id="volume-filter"
              checked={useVolumeFilter || false}
              onCheckedChange={(checked) =>
                updateFormData('useVolumeFilter', checked)
              }
            />
          }
          headerAlign="center"
          colSpan="full"
        >
          {useVolumeFilter && (
            <div className="space-y-md rounded-lg border border-border/50 bg-muted/20 p-md">
              <div className="grid gap-md sm:grid-cols-2">
                <div className="space-y-xs">
                  <Label htmlFor="volume-filter-preset">Preset</Label>
                  <Select
                    value={volumeValue || DEFAULT_VOLUME_PRESET}
                    onValueChange={(value) =>
                      updateFormData('volumeValue', value as VolumeValueEnum)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOLUME_PRESET_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {volumeValue === VolumeValueEnum.custom && (
                  <div className="space-y-xs">
                    <Label htmlFor="volume-filter-top">Custom top size</Label>
                    <FieldVariableBinding
                      path="volumeTop"
                      varType="int"
                      tooltip="Bind custom top size"
                      variant="inline"
                      inlineAdornment={
                        !isVolumeFilterTopVarBound ? (
                          <Tooltip
                            tooltip="Reset to default top size"
                            delay={150}
                          >
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                updateFormData(
                                  'volumeTop',
                                  DEFAULT_CUSTOM_TOP_SIZE
                                )
                              }
                            >
                              Reset
                            </Button>
                          </Tooltip>
                        ) : undefined
                      }
                      inlineAdornmentClassName="pr-1"
                      onVariableSelected={(variable) =>
                        applyIntegerVariable('volumeTop', variable)
                      }
                      onVariableResolved={(variable) =>
                        applyIntegerVariable('volumeTop', variable)
                      }
                    >
                      <NumberInput
                        id="volume-filter-top"
                        value={volumeTop ?? DEFAULT_CUSTOM_TOP_SIZE}
                        min={1}
                        max={1000}
                        step={1}
                        onChange={(value) => {
                          const parsed =
                            typeof value === 'number'
                              ? value
                              : Number.parseInt(String(value ?? '0'), 10);
                          updateFormData(
                            'volumeTop',
                            Number.isFinite(parsed) ? parsed : 0
                          );
                        }}
                        placeholder="500"
                        disabled={isVolumeFilterTopVarBound}
                        showControls={false}
                      />
                    </FieldVariableBinding>
                    <p className="text-xs text-muted-foreground">
                      Bind custom top size
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SettingsRow>

        <SettingsRow
          name="Relative volume filter"
          tooltip="Compares daily volume to market cap to avoid thinly-traded assets."
          tooltipURL="/help/volume-filter"
          trailing={
            <Switch
              id="relative-volume-filter"
              checked={useRelativeVolumeFilter || false}
              onCheckedChange={(checked) =>
                updateFormData('useRelativeVolumeFilter', checked)
              }
            />
          }
          headerAlign="center"
          colSpan="full"
        >
          {useRelativeVolumeFilter && (
            <div className="space-y-md rounded-lg border border-border/50 bg-muted/20 p-md">
              <div className="grid gap-md sm:grid-cols-2">
                <div className="space-y-xs">
                  <Label htmlFor="relative-volume-preset">Preset</Label>
                  <Select
                    value={relativeVolumeValue || DEFAULT_VOLUME_PRESET}
                    onValueChange={(value) =>
                      updateFormData(
                        'relativeVolumeValue',
                        value as VolumeValueEnum
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOLUME_PRESET_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {relativeVolumeValue === VolumeValueEnum.custom && (
                  <div className="space-y-xs">
                    <Label htmlFor="relative-volume-top">
                      Custom threshold
                    </Label>
                    <FieldVariableBinding
                      path="relativeVolumeTop"
                      varType="float"
                      tooltip="Bind relative volume"
                      variant="inline"
                      inlineAdornment={
                        !isRelativeVolumeTopVarBound ? (
                          <Tooltip
                            tooltip="Reset to default threshold"
                            delay={150}
                          >
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                updateFormData(
                                  'relativeVolumeTop',
                                  DEFAULT_RELATIVE_VOLUME_THRESHOLD.toString()
                                )
                              }
                            >
                              Reset
                            </Button>
                          </Tooltip>
                        ) : undefined
                      }
                      inlineAdornmentClassName="pr-1"
                      onVariableSelected={(variable) =>
                        applyDecimalVariable('relativeVolumeTop', variable)
                      }
                      onVariableResolved={(variable) =>
                        applyDecimalVariable('relativeVolumeTop', variable)
                      }
                    >
                      <NumberInput
                        id="relative-volume-top"
                        value={
                          relativeVolumeTop ||
                          DEFAULT_RELATIVE_VOLUME_THRESHOLD.toString()
                        }
                        min={0}
                        step={0.001}
                        onChange={(value) =>
                          updateFormData(
                            'relativeVolumeTop',
                            typeof value === 'number'
                              ? String(value)
                              : String(value ?? '')
                          )
                        }
                        placeholder="0.01"
                        disabled={isRelativeVolumeTopVarBound}
                        showControls={false}
                      />
                    </FieldVariableBinding>
                    <p className="text-xs text-muted-foreground">
                      Bind relative volume threshold
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SettingsRow>
      </SettingsLoadMore>
      {selector}
    </>
  );
};
