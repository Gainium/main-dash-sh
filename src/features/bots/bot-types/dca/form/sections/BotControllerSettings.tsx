import { useBillableIndicatorCount } from '@/hooks/bots/useBillableIndicatorCount';
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
import SettingsAlert from '@/components/ui/SettingsAlert';
import { useSinglePositionFormState } from '@/features/bots/bot-types/dca/form/hooks/useSinglePositionFormState';
import { SINGLE_POSITION_CLOSE_AFTER_OPENED_MESSAGE } from '@/lib/singlePosition/singlePosition';
import {
  useBotFormSelector,
  useTrackedBotFormData,
  useTrackedBotFormState,
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
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
    buildIndicatorConfig,
    sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { HelpCircle } from 'lucide-react';
import React from 'react';
import { IndicatorGroupsManager } from '@/features/bots/shared/components/IndicatorGroupsManager';

interface BotControllerSettingsProps {
  formData?: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
}

/* const MAX_INDICATOR_GROUPS = 5;
const MAX_INDICATORS_PER_GROUP = 10; */

const createGroupId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `group-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createIndicatorId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `indicator-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// parsePairAssets removed; used only by webhook metadata previously

export const BotControllerSettings: React.FC<BotControllerSettingsProps> = ({
  formData: givenFormData,
  updateFormData,
}) => {
  const formData = useTrackedBotFormData(givenFormData);
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

  // Replace one kind's groups, keeping every other action's groups (deal
  // start, take profit, stop loss, the other controller kind) as they are.
  const setGroups = React.useCallback(
    (kind: 'start' | 'stop', next: IndicatorGroup[]) => {
      const action =
        kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot;
      updateFormData('indicatorGroups', [
        ...indicatorGroups.filter((g) => g.action !== action),
        ...next,
      ]);
    },
    [indicatorGroups, updateFormData]
  );

  const handleUpdateGroup = (
    kind: 'start' | 'stop',
    groupId: string,
    updates: Partial<IndicatorGroup>
  ) => {
    const nextGroups = getGroups(kind).map((group) =>
      group.id === groupId ? { ...group, ...updates } : group
    );
    setGroups(kind, nextGroups);
  };

  const handleRemoveGroup = (kind: 'start' | 'stop', groupId: string) => {
    const nextGroups = getGroups(kind).filter((group) => group.id !== groupId);
    setGroups(kind, nextGroups);
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

  // botId and bot used by webhook helper only; handled in BotWebhookSettings
  const { errors, alerts } = useTrackedBotFormState();

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


  const totalIndicatorsAcrossBot = useBillableIndicatorCount();

  const indicatorLimitReached = totalIndicatorsAcrossBot >= indicatorsLimit;
  const remainingIndicators = Math.max(
    indicatorsLimit - totalIndicatorsAcrossBot,
    0
  );

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
    (kind: 'start' | 'stop', join?: IndicatorsLogicEnum) => {
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
          ...(join ? { join } : {}),
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

        setGroups(kind, [...getGroups(kind), newGroup]);
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

  // webhook section removed; BotWebhookSettings handles webhook UI
  // Webhook handled in its own section

  const renderControllerGroups = (kind: 'start' | 'stop') => {
    const action =
      kind === 'start' ? IndicatorAction.startBot : IndicatorAction.stopBot;
    const logicField = kind === 'start' ? 'startBotLogic' : 'stopBotLogic';
    return (
      <IndicatorGroupsManager
        indicators={indicators}
        indicatorGroups={indicatorGroups}
        globalLogic={
          (kind === 'start' ? startBotLogic : stopBotLogic) ||
          IndicatorsLogicEnum.and
        }
        totalIndicatorsAcrossBot={totalIndicatorsAcrossBot}
        indicatorAction={action}
        exchange={currentExchange?.provider}
        formulaLabel={
          kind === 'start' ? 'Start the bot when' : 'Stop the bot when'
        }
        emptyStateMessage={
          kind === 'start'
            ? 'Add a group to start the bot on technical indicators.'
            : 'Add a group to stop the bot on technical indicators.'
        }
        emptyIndicatorsAlertTitle="No indicators yet"
        emptyIndicatorsAlertDescription="Add a group with at least one indicator."
        onAddGroup={(join) => handleAddIndicatorNewGroup(kind, join)}
        onRemoveGroup={(groupId) => handleRemoveGroup(kind, groupId)}
        onChangeGroupLogic={(groupId, logic) =>
          handleUpdateGroup(kind, groupId, { logic })
        }
        onAddIndicatorToGroup={(groupId) => handleAddIndicator(kind, groupId)}
        onRemoveIndicatorFromGroup={(_groupId, indicatorId) =>
          handleRemoveIndicator(indicatorId)
        }
        onSelectIndicatorType={(_groupId, indicator) =>
          handleSelectIndicatorType(kind, indicator)
        }
        onChangeIndicatorParams={(_groupId, indicatorId, params) =>
          handleChangeIndicatorParams(indicatorId, params)
        }
        onChangeGlobalLogic={(value) => updateFormData(logicField, value)}
        onChangeGroupJoins={(joins) =>
          setGroups(
            kind,
            getGroups(kind).map((group) =>
              joins[group.id] ? { ...group, join: joins[group.id] } : group
            )
          )
        }
      />
    );
  };

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
  const stopBotPriceCondition = useBotFormSelector('stopBotPriceCondition');
  const useCloseAfterXopen = useBotFormSelector('useCloseAfterXopen');
  const { active: singlePositionActive } = useSinglePositionFormState();
  const closeAfterXopen = useBotFormSelector('closeAfterXopen');
  const useCloseAfterX = useBotFormSelector('useCloseAfterX');
  const closeAfterX = useBotFormSelector('closeAfterX');
  const useCloseAfterXwin = useBotFormSelector('useCloseAfterXwin');
  const closeAfterXwin = useBotFormSelector('closeAfterXwin');
  const useCloseAfterXloss = useBotFormSelector('useCloseAfterXloss');
  const closeAfterXloss = useBotFormSelector('closeAfterXloss');
  const useCloseAfterXconsecutiveWin = useBotFormSelector(
    'useCloseAfterXconsecutiveWin'
  );
  const closeAfterXconsecutiveWin = useBotFormSelector(
    'closeAfterXconsecutiveWin'
  );
  const useCloseAfterXconsecutiveLoss = useBotFormSelector(
    'useCloseAfterXconsecutiveLoss'
  );
  const closeAfterXconsecutiveLoss = useBotFormSelector(
    'closeAfterXconsecutiveLoss'
  );
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
          <div className="space-y-xs">
            {controllerErrors.map((message, index) => (
              <SettingsAlert
                key={`${message}-${index}`}
                variant="error"
                title={message}
              />
            ))}
          </div>
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
            tooltip="When the bot itself switches on. Once on, deals open according to Deal Start."
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
              {renderControllerGroups('start')}
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
              <SettingsAlert
                variant={indicatorLimitReached ? 'warning' : 'info'}
                title={
                  indicatorLimitReached
                    ? `Indicator limit reached (${indicatorsLimit})`
                    : `${remainingIndicators} indicator${remainingIndicators === 1 ? '' : 's'} left`
                }
                description={`Up to ${indicatorsLimit} indicators across the bot controller, deal start, stop loss and take profit.`}
              />
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
              {renderControllerGroups('stop')}
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
                // Single position: a position never re-opens per signal, so
                // the count would only grow with closes. It can still be
                // switched OFF.
                disabled={singlePositionActive && !useCloseAfterXopen}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXopen', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {singlePositionActive && (
              <SettingsAlert
                variant={useCloseAfterXopen ? 'error' : 'info'}
                title={SINGLE_POSITION_CLOSE_AFTER_OPENED_MESSAGE}
              />
            )}
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
            name="Stop after X consecutive winning deals"
            tooltip="Stop the bot after a run of wins with no loss in between. The run resets on the first losing deal, so this is not the same as the total win count above."
            colSpan="full"
            navId="stop-after-consecutive-win"
            alerts={alerts?.closeAfterXconsecutiveWin ?? []}
            trailing={
              <Switch
                id="stop-after-consecutive-wins"
                checked={!!useCloseAfterXconsecutiveWin}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXconsecutiveWin', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXconsecutiveWin && (
              <>
                <NumberInput
                  value={closeAfterXconsecutiveWin}
                  onChange={(value) =>
                    updateFormData('closeAfterXconsecutiveWin', value)
                  }
                  placeholder="3"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals in a row', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X consecutive losing deals"
            tooltip="Stop the bot after a run of losses with no win in between. The run resets on the first winning deal, so this is not the same as the total loss count above. A deal that closes at exactly breakeven counts as a loss."
            colSpan="full"
            navId="stop-after-consecutive-loss"
            alerts={alerts?.closeAfterXconsecutiveLoss ?? []}
            trailing={
              <Switch
                id="stop-after-consecutive-losses"
                checked={!!useCloseAfterXconsecutiveLoss}
                onCheckedChange={(checked) =>
                  updateFormData('useCloseAfterXconsecutiveLoss', checked)
                }
              />
            }
            headerAlign="center"
            contentClassName="space-y-sm"
          >
            {useCloseAfterXconsecutiveLoss && (
              <>
                <NumberInput
                  value={closeAfterXconsecutiveLoss}
                  onChange={(value) =>
                    updateFormData('closeAfterXconsecutiveLoss', value)
                  }
                  placeholder="3"
                  min={1}
                  showControls={false}
                  endAdornment={unitAdornment('deals in a row', {
                    size: 'sm',
                    className: 'whitespace-nowrap',
                  })}
                />
              </>
            )}
          </SettingsRow>

          <SettingsRow
            name="Stop after X accumulated bot profit or loss"
            tooltip="Stop the bot once its total profit crosses a threshold. Use Greater than with a positive value for a profit target, or Less than with a negative value for a loss cap — e.g. Less than -100 stops the bot at $100 of accumulated loss."
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
