import { IndicatorList } from '@/components/indicators/IndicatorList';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
/* Webhook helper moved to its own section */
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
    useBotFormSelector,
    useBotFormState,
    type BotFormUpdateValue,
    type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { useIndicatorSelector } from '@/hooks/useIndicatorSelector';
// webhook payloads handled in BotWebhookSettings
import {
    BotStartTypeEnum,
    IndicatorAction,
    IndicatorEnum,
    indicatorsLimit,
    IndicatorsLogicEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import {
    getIndicatorDefaultParams,
    getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
    buildIndicatorConfig,
    sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import {
    AlertCircle,
    AlertTriangle,
    Copy,
    HelpCircle,
    Trash2,
} from 'lucide-react';
import React, { useCallback } from 'react';
import { IndicatorActionsToolbar } from '../../../../shared/components/IndicatorActionsToolbar';

interface BotControllerSettingsProps {
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
}

/* const MAX_INDICATOR_GROUPS = 5;
const MAX_INDICATORS_PER_GROUP = 10; */
// KNOWN_QUOTES defined elsewhere when needed

const createGroupId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `group-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createIndicatorId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `indicator-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// parsePairAssets removed; used only by webhook metadata previously

interface ControllerIndicatorGroupProps {
  group: IndicatorGroup;
  indicators: IndicatorConfig[];
  canAddIndicator: boolean;
  addIndicatorDisabledReason?: string;
  onUpdateGroup: (groupId: string, updates: Partial<IndicatorGroup>) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddIndicator: () => void;
  onSelectIndicatorType: (indicator: IndicatorConfig) => void;
  renderIndicatorExtras: (
    indicator: IndicatorConfig,
    index: number
  ) => React.ReactNode;
  onRemoveIndicator: (indicatorId: string) => void;
  onDuplicateGroup: () => void;
  canDuplicateGroup: boolean;
  duplicateGroupDisabledReason?: string;
}

const ControllerIndicatorGroup: React.FC<ControllerIndicatorGroupProps> = ({
  group,
  indicators,
  canAddIndicator,
  addIndicatorDisabledReason,
  onUpdateGroup,
  onRemoveGroup,
  onAddIndicator,
  onSelectIndicatorType,
  renderIndicatorExtras,
  onRemoveIndicator,
  onDuplicateGroup,
  canDuplicateGroup,
  duplicateGroupDisabledReason,
}) => {
  const addIndicatorTooltip =
    !canAddIndicator && addIndicatorDisabledReason
      ? addIndicatorDisabledReason
      : undefined;

  return (
    <div className="space-y-md rounded-lg border border-border/60 bg-muted/20 p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-xs">
          {duplicateGroupDisabledReason ? (
            <Tooltip tooltip={duplicateGroupDisabledReason} delay={200}>
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onDuplicateGroup}
                  disabled={!canDuplicateGroup}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
              </div>
            </Tooltip>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDuplicateGroup}
              disabled={!canDuplicateGroup}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRemoveGroup(group.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove group
          </Button>
        </div>
      </div>

      <div className="grid gap-sm sm:grid-cols-2">
        <div className="space-y-xs">
          <Label htmlFor={`bot-controller-group-logic-${group.id}`}>
            Join logic
          </Label>
          <Select
            value={group.logic}
            onValueChange={(value) =>
              onUpdateGroup(group.id, {
                logic: value as IndicatorGroup['logic'],
              })
            }
          >
            <SelectTrigger id={`bot-controller-group-logic-${group.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">
                AND
              </SelectItem>
              <SelectItem value="or">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <IndicatorList
        indicators={indicators}
        emptyState="No indicators in this group yet. Add one to build your condition."
        onSelectType={onSelectIndicatorType}
        onRemove={onRemoveIndicator}
        renderExtras={(indicator, index) =>
          renderIndicatorExtras(indicator, index)
        }
      />

      <div className="flex justify-end">
        <IndicatorActionsToolbar
          onAddIndicator={onAddIndicator}
          addIndicatorDisabled={!canAddIndicator}
          addIndicatorTooltip={addIndicatorTooltip}
          addIndicatorVariant="outline"
        />
      </div>
      {addIndicatorDisabledReason ? (
        <p className="text-right text-xs text-muted-foreground">
          {addIndicatorDisabledReason}
        </p>
      ) : null}
    </div>
  );
};

export const BotControllerSettings: React.FC<BotControllerSettingsProps> = ({
  formData,
  updateFormData,
}) => {
  const { openSelector, selector } = useIndicatorSelector();
  const { currentExchange } = useBotFormQuery();

  React.useEffect(() => {
    return () => {};
  }, []);

  const {
    favorites: favoriteIndicators,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();

  // currentAssets used only for snapshot metadata which is now disabled

  const handleToggleFavorite = React.useCallback(
    (type: IndicatorEnum, nextIsFavorite: boolean) => {
      toggleFavorite(type, nextIsFavorite);
    },
    [toggleFavorite]
  );

  const launchControllerIndicatorSelector = React.useCallback(
    (kind: 'start' | 'stop', onSelect: (type: IndicatorEnum) => void) => {
      openSelector({
        allowedActions: [IndicatorAction.startBot, IndicatorAction.stopBot],
        favorites: favoriteIndicators,
        onToggleFavorite: handleToggleFavorite,
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
        title:
          kind === 'start'
            ? 'Select start controller indicator'
            : 'Select stop controller indicator',
        onSelect,
      });
    },
    [
      favoriteIndicators,
      favoritesMutating,
      handleToggleFavorite,
      isIndicatorMutating,
      openSelector,
    ]
  );

  const indicatorGroups = useBotFormSelector('indicatorGroups');

  const getGroups = React.useCallback(
    (kind: 'start' | 'stop'): IndicatorGroup[] =>
      indicatorGroups.filter(
        (g) =>
          g.action ===
          (kind === 'start'
            ? IndicatorAction.startBot
            : IndicatorAction.stopBot)
      ),
    [indicatorGroups]
  );

  const setGroups = React.useCallback(
    (next: IndicatorGroup[]) => {
      updateFormData('indicatorGroups', next);
    },
    [updateFormData]
  );

  const handleAddGroup = (kind: 'start' | 'stop') => {
    const groups = getGroups(kind);
    const disabledReason =
      kind === 'start'
        ? addStartGroupDisabledReason
        : addStopGroupDisabledReason;

    if (disabledReason) {
      return;
    }

    const newGroup: IndicatorGroup = {
      id: createGroupId(),
      logic: IndicatorsLogicEnum.and,
      action:
        kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot,
    };

    setGroups([...groups, newGroup]);
  };

  const handleUpdateGroup = (
    kind: 'start' | 'stop',
    groupId: string,
    updates: Partial<IndicatorGroup>
  ) => {
    const nextGroups = getGroups(kind).map((group) =>
      group.id === groupId ? { ...group, ...updates } : group
    );
    setGroups(nextGroups);
  };

  const handleRemoveGroup = (kind: 'start' | 'stop', groupId: string) => {
    const nextGroups = getGroups(kind).filter((group) => group.id !== groupId);
    setGroups(nextGroups);
  };

  const indicators = useBotFormSelector('indicators');

  const handleUpdateIndicators = React.useCallback(
    (updater: (indicators: IndicatorConfig[]) => IndicatorConfig[]) => {
      const nextIndicators = updater(indicators);
      updateFormData('indicators', nextIndicators);
    },
    [updateFormData, indicators]
  );

  const handleRemoveIndicator = React.useCallback(
    (indicatorId: string) => {
      handleUpdateIndicators((indicators) =>
        indicators.filter((candidate) => candidate.uuid !== indicatorId)
      );
    },
    [handleUpdateIndicators]
  );

  const cloneIndicatorConfig = useCallback(
    (indicator: IndicatorConfig): IndicatorConfig => {
      const clonedParams = JSON.parse(
        JSON.stringify(indicator ?? {})
      ) as IndicatorConfig;
      return {
        ...clonedParams,
        uuid: createIndicatorId(),
      };
    },
    []
  );

  const handleDuplicateGroup = (kind: 'start' | 'stop', groupId: string) => {
    const groups = getGroups(kind);
    const sourceGroup = groups.find((candidate) => candidate.id === groupId);

    if (!sourceGroup) {
      return;
    }

    /* const totalGroups =
      kind === 'start' ? startGroups.length : stopGroups.length;
    if (totalGroups >= MAX_INDICATOR_GROUPS) {
      return;
    } */

    const indicatorsToClone = indicators.filter(
      (indicator) => indicator.groupId === sourceGroup.id
    );
    if (indicatorsToClone.length > remainingIndicators) {
      return;
    }

    const newGroup: IndicatorGroup = {
      ...sourceGroup,
      id: createGroupId(),
    };

    const newIndicators = indicatorsToClone.map((indicator) =>
      cloneIndicatorConfig({ ...indicator, groupId: newGroup.id })
    );

    updateFormData('indicators', indicators.concat(newIndicators));
    updateFormData('indicatorGroups', [...groups, newGroup]);
  };

  // botId and bot used by webhook helper only; handled in BotWebhookSettings
  const { errors, alerts } = useBotFormState();

  const controllerErrors = React.useMemo(() => {
    if (!errors) {
      return [] as string[];
    }

    return Object.values(errors).filter(
      (message): message is string =>
        typeof message === 'string' &&
        /startbot|stopbot|closeafter|controller|indicator|webhook/i.test(
          message
        )
    );
  }, [errors]);

  // isLiveTrading used by snapshot metadata; handled in BotWebhookSettings if enabled

  // metadata and signature toggles moved to webhook helper section

  const startGroups = getGroups('start');
  const stopGroups = getGroups('stop');

  const totalIndicatorsAcrossBot = React.useMemo(() => {
    return indicators.length;
  }, [indicators.length]);

  const indicatorLimitReached = totalIndicatorsAcrossBot >= indicatorsLimit;
  const remainingIndicators = Math.max(
    indicatorsLimit - totalIndicatorsAcrossBot,
    0
  );

  const addStartGroupDisabledReason = React.useMemo(() => {
    if (indicatorLimitReached) {
      return `Maximum of ${indicatorsLimit} indicators reached across the bot. Remove one before adding more groups.`;
    }

    /* if (startGroups.length >= MAX_INDICATOR_GROUPS) {
      return `You can create up to ${MAX_INDICATOR_GROUPS} start indicator groups.`;
    } */

    return undefined;
  }, [indicatorLimitReached /*  startGroups.length */]);

  const addStopGroupDisabledReason = React.useMemo(() => {
    if (indicatorLimitReached) {
      return `Maximum of ${indicatorsLimit} indicators reached across the bot. Remove one before adding more groups.`;
    }

    /* if (stopGroups.length >= MAX_INDICATOR_GROUPS) {
      return `You can create up to ${MAX_INDICATOR_GROUPS} stop indicator groups.`;
    } */

    return undefined;
  }, [indicatorLimitReached /* , stopGroups.length */]);

  const getAddIndicatorDisabledReason = React.useCallback(
    (/* group: IndicatorGroup */) => {
      if (indicatorLimitReached) {
        return `Maximum of ${indicatorsLimit} indicators reached across the bot. Remove one before adding more.`;
      }

      /* if ((group.indicators || []).length >= MAX_INDICATORS_PER_GROUP) {
        return `Each group can include up to ${MAX_INDICATORS_PER_GROUP} indicators.`;
      } */

      return undefined;
    },
    [indicatorLimitReached]
  );

  const handleAddIndicator = React.useCallback(
    (kind: 'start' | 'stop', groupId: string) => {
      /* const targetGroup = getGroups(kind).find((group) => group.id === groupId);
      if (!targetGroup) {
        return;
      } */

      const disabledReason = getAddIndicatorDisabledReason(/* targetGroup */);
      if (disabledReason) {
        return;
      }

      launchControllerIndicatorSelector(kind, (type) => {
        const defaults = getIndicatorDefaultParams(
          type,
          kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot
        );
        const sanitizedParams = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );

        const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
          uuid: createIndicatorId(),
          groupId,
          indicatorAction:
            kind === 'start'
              ? IndicatorAction.startBot
              : IndicatorAction.stopBot,
          maUUID: createIndicatorId(),
          xoUUID: createIndicatorId(),
        });

        handleUpdateIndicators((indicators) => [
          ...indicators,
          { ...newIndicator, params: sanitizedParams },
        ]);
      });
    },
    [
      getAddIndicatorDisabledReason,
      /* getGroups, */
      handleUpdateIndicators,
      launchControllerIndicatorSelector,
    ]
  );

  // Legacy global "Add" button below all groups: addIndicator(action) with no
  // groupId creates a brand-new group and an indicator inside it.
  const handleAddIndicatorNewGroup = React.useCallback(
    (kind: 'start' | 'stop') => {
      const disabledReason = getAddIndicatorDisabledReason();
      if (disabledReason) {
        return;
      }

      launchControllerIndicatorSelector(kind, (type) => {
        const action =
          kind === 'start'
            ? IndicatorAction.startBot
            : IndicatorAction.stopBot;
        const newGroup: IndicatorGroup = {
          id: createGroupId(),
          logic: IndicatorsLogicEnum.and,
          action,
        };

        const defaults = getIndicatorDefaultParams(type, action);
        const sanitizedParams = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );
        const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
          uuid: createIndicatorId(),
          groupId: newGroup.id,
          indicatorAction: action,
          maUUID: createIndicatorId(),
          xoUUID: createIndicatorId(),
        });

        setGroups([...getGroups(kind), newGroup]);
        handleUpdateIndicators((indicators) => [
          ...indicators,
          { ...newIndicator, params: sanitizedParams },
        ]);
      });
    },
    [
      getAddIndicatorDisabledReason,
      getGroups,
      setGroups,
      handleUpdateIndicators,
      launchControllerIndicatorSelector,
    ]
  );

  const handleSelectIndicatorType = React.useCallback(
    (
      kind: 'start' | 'stop',
      /* groupId: string,  */ indicator: IndicatorConfig
    ) => {
      launchControllerIndicatorSelector(kind, (type) => {
        const defaults = getIndicatorDefaultParams(
          type,
          kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot
        );
        const sanitizedParams = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );

        const nextIndicator = buildIndicatorConfig(type, sanitizedParams, {
          uuid: indicator.uuid,
          indicatorAction:
            kind === 'start'
              ? IndicatorAction.startBot
              : IndicatorAction.stopBot,
          maUUID: createIndicatorId(),
          xoUUID: createIndicatorId(),
        });

        handleUpdateIndicators(
          /* kind, groupId,  */ (indicators) =>
            indicators.map((candidate) =>
              candidate.uuid === indicator.uuid
                ? { ...candidate, ...nextIndicator, ...sanitizedParams }
                : candidate
            )
        );
      });
    },
    [handleUpdateIndicators, launchControllerIndicatorSelector]
  );

  const handleChangeIndicatorParams = React.useCallback(
    (
      /* kind: 'start' | 'stop',
      groupId: string, */
      indicatorId: string,
      params: IndicatorParamsState
    ) => {
      const sanitized = sanitizeIndicatorParams(params);
      handleUpdateIndicators(
        /* kind, groupId, */ (indicators) =>
          indicators.map((candidate) =>
            candidate.uuid === indicatorId
              ? { ...candidate, ...sanitized }
              : candidate
          )
      );
    },
    [handleUpdateIndicators]
  );

  const renderControllerIndicatorExtras = React.useCallback(
    (
      kind: 'start' | 'stop',
      _groupId: string,
      indicator: IndicatorConfig
    ): React.ReactNode => {
      try {
        const definition = getIndicatorDefinition(
          indicator.type as IndicatorEnum
        );
        const defaults = getIndicatorDefaultParams(
          definition.type,
          kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot
        );
        const params: IndicatorParamsState = {
          ...defaults,
          ...((indicator ?? {}) as IndicatorConfig),
        };

        return (
          <InlineIndicatorConfig
            definition={definition}
            params={params}
            indicatorUuid={indicator.uuid}
            exchange={currentExchange?.provider}
            onChange={(next) =>
              handleChangeIndicatorParams(
                /* kind, groupId,  */ indicator.uuid,
                next
              )
            }
            className="space-y-sm"
          />
        );
      } catch (_error) {
        return (
          <div className="rounded-md border border-border/60 bg-destructive/10 p-sm text-sm text-destructive">
            Selected indicator definition is unavailable.
          </div>
        );
      }
    },
    [handleChangeIndicatorParams, currentExchange?.provider]
  );

  // webhook section removed; BotWebhookSettings handles webhook UI
  // Webhook handled in its own section

  const useMulti = useBotFormSelector('useMulti');
  const botActualStart = useBotFormSelector('botActualStart');
  const botStart = useBotFormSelector('botStart');
  const startBotPriceValue = useBotFormSelector('startBotPriceValue');
  const stopBotPriceValue = useBotFormSelector('stopBotPriceValue');

  // Legacy (onChangeInput 'useMulti') only downgrades the PRICE modes to
  // manual when multipair is enabled — indicators mode stays selectable
  // (it is gated by the disabled option), and price value strings are left
  // intact. Mirror that narrow behavior here.
  React.useEffect(() => {
    if (!useMulti) {
      return;
    }

    const updates: Array<[Fields, BotFormUpdateValue]> = [];

    if (botActualStart === 'price') {
      updates.push(['botActualStart', 'manual']);
    }

    if (botStart === 'price') {
      updates.push(['botStart', 'manual']);
    }

    if (updates.length === 0) {
      return;
    }

    updates.forEach(([key, value]) => {
      updateFormData(key, value);
    });
  }, [useMulti, botStart, botActualStart, updateFormData]);

  /* const metadataSnapshot = React.useMemo(() => {
    const summarizeGroup = (group: IndicatorGroup) => ({
      id: group.id,
      name: group.name,
      logic: group.logic,
      keepTruePeriods: group.keepTruePeriods,
      indicators: (group.indicators || []).map((indicator) => ({
        id: indicator.id,
        type: indicator.type,
        enabled: indicator.enabled,
        condition: indicator.condition,
        params: indicator.params,
      })),
    });

    return {
      mode,
      environment: isLiveTrading ? 'live' : 'paper',
      bot: {
        name: formData.name,
        strategy: formData.strategy,
        direction: formData.direction,
        exchangeUUID: formData.exchangeUUID || bot?.exchangeUUID || '',
        pairs: formData.pair,
      },
      controller: {
        startType: formData.botStartType,
        stopType: formData.botStopType,
        stopAction: formData.stopAction,
        stopStatus: formData.stopStatus,
        startPrice:
          formData.botStartType === 'price'
            ? {
                condition: formData.startBotPriceCondition,
                value: formData.startBotPriceValue,
                currency: getCurrencyDisplayName(
                  formData.startBotPriceCurrencyReference,
                  currentAssets
                ),
              }
            : null,
        stopPrice:
          formData.botStopType === 'price'
            ? {
                condition: formData.stopBotPriceCondition,
                value: formData.stopBotPriceValue,
                currency: getCurrencyDisplayName(
                  formData.stopBotPriceCurrencyReference,
                  currentAssets
                ),
              }
            : null,
        startGroups: startGroups.map(summarizeGroup),
        stopGroups: stopGroups.map(summarizeGroup),
      },
    };
  }, [
    mode,
    isLiveTrading,
    formData.name,
    formData.strategy,
    formData.direction,
    formData.exchangeUUID,
    formData.pair,
    formData.botStartType,
    formData.botStopType,
    formData.stopAction,
    formData.stopStatus,
    formData.startBotPriceCondition,
    formData.startBotPriceValue,
    formData.startBotPriceCurrencyReference,
    formData.stopBotPriceCondition,
    formData.stopBotPriceValue,
    formData.stopBotPriceCurrencyReference,
    startGroups,
    stopGroups,
    currentAssets,
    bot?.exchangeUUID,
  ]); */

  // start/stop payloads moved to BotWebhookSettings

  const priceCurrencyDisplay = React.useMemo(() => {
    return (
      formData.pairMetadata[
        Array.isArray(formData.pair) ? formData.pair[0] : formData.pair
      ]?.quoteAsset.name || ''
    );
  }, [formData.pairMetadata, formData.pair]);

  const useBotController = useBotFormSelector('useBotController');
  const startBotPriceCondition = useBotFormSelector('startBotPriceCondition');
  const startBotLogic = useBotFormSelector('startBotLogic');
  const stopType = useBotFormSelector('stopType');
  const stopStatus = useBotFormSelector('stopStatus');
  const stopBotLogic = useBotFormSelector('stopBotLogic');
  // Between-group AND/OR separator word (legacy IndicatorsGroup actionLogic).
  const startDealLogic = useBotFormSelector('startDealLogic');
  const betweenGroupLogic = (
    startDealLogic ?? IndicatorsLogicEnum.and
  ).toUpperCase();
  const stopBotPriceCondition = useBotFormSelector('stopBotPriceCondition');
  const useCloseAfterXopen = useBotFormSelector('useCloseAfterXopen');
  const closeAfterXopen = useBotFormSelector('closeAfterXopen');
  const useCloseAfterX = useBotFormSelector('useCloseAfterX');
  const closeAfterX = useBotFormSelector('closeAfterX');
  const useCloseAfterXwin = useBotFormSelector('useCloseAfterXwin');
  const closeAfterXwin = useBotFormSelector('closeAfterXwin');
  const useCloseAfterXloss = useBotFormSelector('useCloseAfterXloss');
  const closeAfterXloss = useBotFormSelector('closeAfterXloss');
  const useCloseAfterXprofit = useBotFormSelector('useCloseAfterXprofit');
  const closeAfterXprofitCond = useBotFormSelector('closeAfterXprofitCond');
  const closeAfterXprofitValue = useBotFormSelector('closeAfterXprofitValue');

  if (!useBotController) {
    return null;
  }

  return (
    <>
      <div className="space-y-md">
        {controllerErrors.length > 0 ? (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">
              Review your bot controller settings
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4 text-xs sm:text-sm">
                {controllerErrors.map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <MasonryLayout
          gap={16}
          containerBreakpoints={{
            default: 1,
            640: 2,
            1024: 3,
          }}
        >
          <SettingsRow
            name="Bot start"
            tooltip="Choose how this bot begins new deals."
          >
            <Select
              value={botActualStart ?? 'manual'}
              onValueChange={(value: 'manual' | 'indicators' | 'price') =>
                updateFormData('botActualStart', value)
              }
            >
              <SelectTrigger id="bot-start-type">
                <SelectValue placeholder="Select bot start type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual/Webhook</SelectItem>
                <SelectItem value="indicators" disabled={!!useMulti}>
                  {/* Legacy label preserves the "Tecnical" typo + "(beta)" on
                      Bot Start; Bot Stop intentionally uses the corrected
                      "Technical indicators" with no. */}
                  Tecnical Indicators
                  {useMulti ? ' (disable multipair)' : ''}
                </SelectItem>
                <SelectItem value="price" disabled={!!useMulti}>
                  Price
                  {useMulti ? ' (disable multipair)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          {botActualStart === 'price' ? (
            <SettingsRow
              name="Price trigger"
              tooltip="Start the bot when market price crosses your threshold."
              colSpan="full"
              contentClassName="grid gap-md @[600px]:grid-cols-2 @[900px]:grid-cols-3"
              navId="start-price"
              alerts={alerts?.startBotPriceValue ?? []}
            >
              <div className="space-y-xs">
                <Label htmlFor="start-price-condition">Condition</Label>
                <Select
                  value={startBotPriceCondition ?? 'gt'}
                  onValueChange={(value: 'gt' | 'lt') =>
                    updateFormData('startBotPriceCondition', value)
                  }
                >
                  <SelectTrigger id="start-price-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                    <SelectItem value="lt">Less than (&lt;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-xs">
                <Label htmlFor="start-price-value">Value</Label>
                <NumberInput
                  id="start-price-value"
                  value={startBotPriceValue}
                  onChange={(value) =>
                    updateFormData('startBotPriceValue', value)
                  }
                  placeholder="0.0"
                  showControls={false}
                  endAdornment={unitAdornment(priceCurrencyDisplay, {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </div>
            </SettingsRow>
          ) : null}

          {botActualStart === 'indicators' ? (
            <SettingsRow
              name="Start indicators"
              tooltip="Build groups of technical indicators that must trigger to start the bot."
              colSpan="full"
              contentClassName="space-y-md"
            >
              <div className="space-y-xs">
                <Label htmlFor="start-indicator-logic">Join logic</Label>
                <Select
                  value={startBotLogic || 'and'}
                  onValueChange={(value: 'and' | 'or') =>
                    updateFormData('startBotLogic', value)
                  }
                >
                  <SelectTrigger id="start-indicator-logic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">
                      AND (all conditions must be met)
                    </SelectItem>
                    <SelectItem value="or">
                      OR (any condition must be met)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-md">
                <div className="flex flex-wrap items-center justify-between gap-xs">
                  <Label className="text-base">Indicator groups</Label>
                  <IndicatorActionsToolbar
                    onAddGroup={() => handleAddGroup('start')}
                    addGroupTooltip={addStartGroupDisabledReason}
                  />
                </div>

                {startGroups.length === 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-md text-sm text-muted-foreground">
                    No indicator groups configured. Add technical indicators to
                    automatically start the bot.
                  </div>
                ) : (
                  startGroups.map((group, groupIdx) => {
                    const addIndicatorDisabledReason =
                      getAddIndicatorDisabledReason(/* group */);
                    const i = indicators.filter(
                      (indicator) => indicator.groupId === group.id
                    );
                    const duplicateIndicatorCount = i.length;
                    let duplicateGroupDisabledReason: string | undefined;

                    /* if (startGroups.length >= MAX_INDICATOR_GROUPS) {
                      duplicateGroupDisabledReason = `You can create up to ${MAX_INDICATOR_GROUPS} start indicator groups.`;
                    } else */ if (
                      duplicateIndicatorCount > remainingIndicators
                    ) {
                      duplicateGroupDisabledReason = `Duplicating this group would exceed the remaining indicator allowance (${remainingIndicators} indicator${remainingIndicators === 1 ? '' : 's'} left).`;
                    }

                    const canDuplicateGroup = !duplicateGroupDisabledReason;

                    return (
                      <React.Fragment key={group.id}>
                        <ControllerIndicatorGroup
                          indicators={i}
                          group={group}
                          canAddIndicator={!addIndicatorDisabledReason}
                          {...(addIndicatorDisabledReason
                            ? { addIndicatorDisabledReason }
                            : {})}
                          onUpdateGroup={(groupId, updates) =>
                            handleUpdateGroup('start', groupId, updates)
                          }
                          onRemoveGroup={(groupId) =>
                            handleRemoveGroup('start', groupId)
                          }
                          onAddIndicator={() =>
                            handleAddIndicator('start', group.id)
                          }
                          onSelectIndicatorType={(indicator) =>
                            handleSelectIndicatorType(
                              'start',
                              /* group.id, */
                              indicator
                            )
                          }
                          renderIndicatorExtras={(indicator) =>
                            renderControllerIndicatorExtras(
                              'start',
                              group.id,
                              indicator
                            )
                          }
                          onRemoveIndicator={(indicatorId) =>
                            handleRemoveIndicator(
                              /* 'start', group.id, */ indicatorId
                            )
                          }
                          onDuplicateGroup={() =>
                            handleDuplicateGroup('start', group.id)
                          }
                          canDuplicateGroup={canDuplicateGroup}
                          {...(duplicateGroupDisabledReason
                            ? { duplicateGroupDisabledReason }
                            : {})}
                        />
                        {groupIdx + 1 < startGroups.length ? (
                          <div className="text-center text-xs font-semibold uppercase text-muted-foreground">
                            {betweenGroupLogic}
                          </div>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
                {startGroups.length > 0 ? (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddIndicatorNewGroup('start')}
                      disabled={indicatorLimitReached}
                    >
                      Add indicator (new group)
                    </Button>
                  </div>
                ) : null}
              </div>
            </SettingsRow>
          ) : null}

          <SettingsRow
            name="Bot stop"
            tooltip="Choose how the bot stops running deals."
          >
            <Select
              value={botStart ?? 'manual'}
              onValueChange={(value: 'manual' | 'indicators' | 'price') =>
                updateFormData('botStart', value)
              }
            >
              <SelectTrigger id="bot-stop-type">
                <SelectValue placeholder="Select bot stop type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual/Webhook</SelectItem>
                <SelectItem value="indicators" disabled={!!useMulti}>
                  Technical indicators
                  {useMulti ? ' (disable multipair)' : ''}
                </SelectItem>
                <SelectItem value="price" disabled={!!useMulti}>
                  Price
                  {useMulti ? ' (disable multipair)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          {(botActualStart === 'indicators' || botStart === 'indicators') && (
            <SettingsRow
              colSpan="full"
              className="border-none bg-transparent p-0 shadow-none"
              contentClassName="space-y-0"
            >
              <Alert className="border-slate-500/40 bg-muted/40 text-muted-foreground">
                <div className="flex items-start gap-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1 text-xs sm:text-sm">
                    <AlertTitle className="text-sm font-semibold">
                      Indicator usage summary
                    </AlertTitle>
                    <AlertDescription>
                      {indicatorLimitReached
                        ? `You have reached the maximum of ${indicatorsLimit} indicators across all automation blocks. Remove one before adding more.`
                        : `You can add ${remainingIndicators} more indicator${remainingIndicators === 1 ? '' : 's'} across the bot controller, deal start, stop-loss, and risk modules.`}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            </SettingsRow>
          )}

          {botStart === 'indicators' || botStart === 'price' ? (
            <SettingsRow
              name="Stop action"
              tooltip="Decide what happens to existing deals when the bot stops."
              trailing={
                <Tooltip tooltip="Select how the bot handles existing deals when stopped">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Tooltip>
              }
            >
              <Select
                value={stopType ?? 'leave'}
                onValueChange={(value: 'leave' | 'cancel' | 'closeByMarket') =>
                  updateFormData('stopType', value)
                }
              >
                <SelectTrigger id="stop-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">
                    Stop only — leave deals open
                  </SelectItem>
                  <SelectItem value="cancel">Stop and cancel deals</SelectItem>
                  <SelectItem value="closeByMarket">
                    Stop and close deals by market
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
          ) : null}

          {(botStart === 'indicators' || botStart === 'price') &&
          (botActualStart === 'indicators' || botActualStart === 'price') ? (
            <SettingsRow
              name="Stop status"
              tooltip="Control whether the bot listens for new start events after stopping."
              trailing={
                <Tooltip tooltip="Choose between 'Closed' or 'Monitoring' statuses when stopping your bots">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Tooltip>
              }
            >
              <Select
                value={stopStatus ?? 'closed'}
                onValueChange={(value: 'closed' | 'monitoring') =>
                  updateFormData('stopStatus', value)
                }
              >
                <SelectTrigger id="stop-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closed">
                    Closed (won't listen for new start bot events)
                  </SelectItem>
                  <SelectItem value="monitoring">
                    {/* Legacy label has a trailing space before the paren. */}
                    Monitoring (will listen for new start bot events )
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
          ) : null}

          {botStart === 'indicators' ? (
            <SettingsRow
              name="Stop indicators"
              tooltip="Configure indicator groups that trigger a stop."
              colSpan="full"
              contentClassName="space-y-md"
            >
              <div className="space-y-xs">
                <Label htmlFor="stop-indicator-logic">Join logic</Label>
                <Select
                  value={stopBotLogic || 'and'}
                  onValueChange={(value: 'and' | 'or') =>
                    updateFormData('stopBotLogic', value)
                  }
                >
                  <SelectTrigger id="stop-indicator-logic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">
                      AND (all conditions must be met)
                    </SelectItem>
                    <SelectItem value="or">
                      OR (any condition must be met)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-md">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Indicator groups</Label>
                  <IndicatorActionsToolbar
                    onAddGroup={() => handleAddGroup('stop')}
                    addGroupTooltip={addStopGroupDisabledReason}
                  />
                </div>

                {stopGroups.length === 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-md text-sm text-muted-foreground">
                    No indicator groups configured. Add technical indicators to
                    automatically stop the bot.
                  </div>
                ) : (
                  stopGroups.map((group, groupIdx) => {
                    const addIndicatorDisabledReason =
                      getAddIndicatorDisabledReason(/* group */);
                    const i = indicators.filter(
                      (indicator) => indicator.groupId === group.id
                    );
                    const duplicateIndicatorCount = i.length;
                    let duplicateGroupDisabledReason: string | undefined;

                    /* if (stopGroups.length >= MAX_INDICATOR_GROUPS) {
                      duplicateGroupDisabledReason = `You can create up to ${MAX_INDICATOR_GROUPS} stop indicator groups.`;
                    } else */ if (
                      duplicateIndicatorCount > remainingIndicators
                    ) {
                      duplicateGroupDisabledReason = `Duplicating this group would exceed the remaining indicator allowance (${remainingIndicators} indicator${remainingIndicators === 1 ? '' : 's'} left).`;
                    }

                    const canDuplicateGroup = !duplicateGroupDisabledReason;

                    return (
                      <React.Fragment key={group.id}>
                        <ControllerIndicatorGroup
                          group={group}
                          indicators={i}
                          canAddIndicator={!addIndicatorDisabledReason}
                          {...(addIndicatorDisabledReason
                            ? { addIndicatorDisabledReason }
                            : {})}
                          onUpdateGroup={(groupId, updates) =>
                            handleUpdateGroup('stop', groupId, updates)
                          }
                          onRemoveGroup={(groupId) =>
                            handleRemoveGroup('stop', groupId)
                          }
                          onAddIndicator={() =>
                            handleAddIndicator('stop', group.id)
                          }
                          onSelectIndicatorType={(indicator) =>
                            handleSelectIndicatorType(
                              'stop',
                              /* group.id, */ indicator
                            )
                          }
                          renderIndicatorExtras={(indicator) =>
                            renderControllerIndicatorExtras(
                              'stop',
                              group.id,
                              indicator
                            )
                          }
                          onRemoveIndicator={(indicatorId) =>
                            handleRemoveIndicator(
                              /* 'stop', group.id, */ indicatorId
                            )
                          }
                          onDuplicateGroup={() =>
                            handleDuplicateGroup('stop', group.id)
                          }
                          canDuplicateGroup={canDuplicateGroup}
                          {...(duplicateGroupDisabledReason
                            ? { duplicateGroupDisabledReason }
                            : {})}
                        />
                        {groupIdx + 1 < stopGroups.length ? (
                          <div className="text-center text-xs font-semibold uppercase text-muted-foreground">
                            {betweenGroupLogic}
                          </div>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
                {stopGroups.length > 0 ? (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddIndicatorNewGroup('stop')}
                      disabled={indicatorLimitReached}
                    >
                      Add indicator (new group)
                    </Button>
                  </div>
                ) : null}
              </div>
            </SettingsRow>
          ) : null}

          {botStart === BotStartTypeEnum.price ? (
            <SettingsRow
              name="Price stop"
              tooltip="Stop the bot when price crosses your threshold."
              colSpan="full"
              contentClassName="grid gap-md @[600px]:grid-cols-2 @[900px]:grid-cols-3"
              navId="stop-price"
              alerts={alerts?.stopBotPriceValue ?? []}
            >
              <div className="space-y-xs">
                <Label htmlFor="stop-price-condition">Condition</Label>
                <Select
                  value={stopBotPriceCondition ?? 'gt'}
                  onValueChange={(value: 'gt' | 'lt') =>
                    updateFormData('stopBotPriceCondition', value)
                  }
                >
                  <SelectTrigger id="stop-price-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                    <SelectItem value="lt">Less than (&lt;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-xs">
                <Label htmlFor="stop-price-value">Value</Label>
                <NumberInput
                  id="stop-price-value"
                  value={stopBotPriceValue}
                  onChange={(value) =>
                    updateFormData('stopBotPriceValue', value)
                  }
                  placeholder="0.0"
                  showControls={false}
                  endAdornment={unitAdornment(priceCurrencyDisplay, {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </div>
            </SettingsRow>
          ) : null}

          <SettingsRow
            name="Stop after X deals opened"
            tooltip="Stop the bot after it opens a fixed number of deals."
            colSpan="full"
            navId="stop-after-open"
            alerts={alerts?.closeAfterXopen ?? []}
            trailing={
              <Switch
                id="stop-after-open"
                checked={!!useCloseAfterXopen}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXopen', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXopen && (
              <>
                <NumberInput
                  value={closeAfterXopen}
                  onChange={(value) => updateFormData('closeAfterXopen', value)}
                  placeholder="20"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X deals closed"
            tooltip="Stop the bot once it has closed a set number of deals."
            colSpan="full"
            navId="stop-after-closed"
            alerts={alerts?.closeAfterX ?? []}
            trailing={
              <Switch
                id="stop-after-closed"
                checked={!!useCloseAfterX}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterX', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterX && (
              <>
                <NumberInput
                  value={closeAfterX}
                  onChange={(value) => updateFormData('closeAfterX', value)}
                  placeholder="20"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X winning deals"
            tooltip="Stop the bot after a run of successful deals."
            colSpan="full"
            navId="stop-after-win"
            alerts={alerts?.closeAfterXwin ?? []}
            trailing={
              <Switch
                id="stop-after-wins"
                checked={!!useCloseAfterXwin}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXwin', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXwin && (
              <>
                <NumberInput
                  value={closeAfterXwin}
                  onChange={(value) => updateFormData('closeAfterXwin', value)}
                  placeholder="20"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X losing deals"
            tooltip="Stop the bot after accumulating a number of losses."
            colSpan="full"
            navId="stop-after-loss"
            alerts={alerts?.closeAfterXloss ?? []}
            trailing={
              <Switch
                id="stop-after-losses"
                checked={!!useCloseAfterXloss}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXloss', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXloss && (
              <>
                <NumberInput
                  value={closeAfterXloss}
                  onChange={(value) => updateFormData('closeAfterXloss', value)}
                  placeholder="20"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X accumulated bot profit"
            tooltip="Stop the bot once total bot profit hits a limit."
            colSpan="full"
            navId="stop-after-profit"
            alerts={alerts?.closeAfterXprofitValue ?? []}
            trailing={
              <Switch
                id="stop-after-profit"
                checked={!!useCloseAfterXprofit}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXprofit', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXprofit && (
              <div className="grid gap-md @[600px]:grid-cols-2">
                <div className="space-y-xs">
                  <Label htmlFor="stop-profit-condition">Condition</Label>
                  <Select
                    value={closeAfterXprofitCond || 'gt'}
                    onValueChange={(value: 'gt' | 'lt') =>
                      updateFormData('closeAfterXprofitCond', value)
                    }
                  >
                    <SelectTrigger id="stop-profit-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                      <SelectItem value="lt">Less than (&lt;)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="stop-profit-value">Value</Label>
                  <NumberInput
                    id="stop-profit-value"
                    value={closeAfterXprofitValue}
                    onChange={(value) =>
                      updateFormData('closeAfterXprofitValue', value)
                    }
                    placeholder="20"
                    showControls={false}
                    startAdornment={unitAdornment('$', {
                      size: 'sm',
                      className: 'whitespace-nowrap',
                    })}
                  />
                </div>
              </div>
            )}
          </SettingsRow>

          {/* Webhook helper moved to its own section: BotWebhookSettings */}
        </MasonryLayout>
      </div>
      {selector}
    </>
  );
};
