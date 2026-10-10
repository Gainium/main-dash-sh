import { IndicatorGroupCard } from '@/components/indicators/IndicatorGroupCard';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IndicatorAction,
  IndicatorSection,
  indicatorsLimit,
  IndicatorsLogicEnum,
  type ExchangeEnum,
} from '@/types';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import {
  getIndicatorDefaultParams,
  getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import { AlertTriangle, Info } from 'lucide-react';
import React, { useMemo } from 'react';
import MasonryLayout from '../../../../components/ui/MasonryLayout';

export interface IndicatorGroupsManagerProps {
  /** All indicators from the form */
  indicators: IndicatorConfig[];
  /** All indicator groups from the form */
  indicatorGroups: IndicatorGroup[];
  /** The current global logic (AND/OR) for the groups */
  globalLogic: IndicatorsLogicEnum;
  /** Error message for close indicators (if any) */
  errorMessage?: string;
  /** Total indicators across the entire bot */
  totalIndicatorsAcrossBot: number;
  /** The action type to filter by (e.g., closeDeal) */
  indicatorAction: IndicatorAction;
  /** Optional section to filter by (e.g., sl for stop-loss) */
  indicatorSection?: IndicatorSection;
  /**
   * Selected bot exchange. When provided, indicator interval selects filter
   * their options to the candle intervals the exchange supports (legacy
   * parity). Omitted = no interval filtering.
   */
  exchange?: ExchangeEnum | undefined;
  /**
   * Shortest candle interval (ms) the interval selects offer. Omitted = no
   * lower bound.
   */
  minIntervalMs?: number | undefined;
  /**
   * One group holding one fixed indicator: hides the group logic, group and
   * indicator add/remove controls. Default false.
   */
  singleIndicator?: boolean;
  /**
   * Offer global-variable binding on the indicator's numeric fields.
   * Default true.
   */
  allowVariableBinding?: boolean;
  /** Maximum number of groups allowed */
  maxGroups?: number;
  /** Maximum indicators per group */
  maxIndicatorsPerGroup?: number;
  /** Label for the global logic select */
  globalLogicLabel?: string;
  /** Options for global logic select (override default) */
  globalLogicOptions?: Array<{
    value: IndicatorsLogicEnum;
    label: string;
  }>;
  /** Empty state message when no groups */
  emptyStateMessage?: string;
  /** Empty alert message when no indicators in any group */
  emptyIndicatorsAlertTitle?: string;
  emptyIndicatorsAlertDescription?: string;
  /** Optional second column content in the grid (for custom controls) */
  secondColumnContent?: React.ReactNode;
  /** Optional content rendered in the top trailing area (right side) */
  topTrailingContent?: React.ReactNode;
  /** Callbacks */
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onChangeGroupLogic: (groupId: string, logic: IndicatorGroup['logic']) => void;
  onAddIndicatorToGroup: (groupId: string) => void;
  onRemoveIndicatorFromGroup: (groupId: string, indicatorId: string) => void;
  onSelectIndicatorType: (groupId: string, indicator: IndicatorConfig) => void;
  onChangeIndicatorParams: (
    groupId: string,
    indicatorId: string,
    params: IndicatorParamsState
  ) => void;
  onChangeGlobalLogic: (logic: IndicatorsLogicEnum) => void;
}

export const IndicatorGroupsManager: React.FC<IndicatorGroupsManagerProps> = ({
  indicators,
  indicatorGroups,
  globalLogic,
  errorMessage,
  totalIndicatorsAcrossBot,
  indicatorAction,
  indicatorSection,
  exchange,
  minIntervalMs,
  singleIndicator = false,
  allowVariableBinding = true,
  maxGroups,
  maxIndicatorsPerGroup,
  globalLogicLabel = 'Group logic',
  globalLogicOptions = [
    { value: IndicatorsLogicEnum.and, label: 'AND' },
    { value: IndicatorsLogicEnum.or, label: 'OR' },
  ],
  emptyStateMessage = 'No indicator groups configured yet. Add a group to start building your conditions.',
  emptyIndicatorsAlertTitle = 'No indicators in groups',
  emptyIndicatorsAlertDescription = 'Add at least one indicator to each group. Groups without indicators will never trigger.',
  secondColumnContent,
  //topTrailingContent,
  onAddGroup,
  onRemoveGroup,
  onChangeGroupLogic,
  onAddIndicatorToGroup,
  onRemoveIndicatorFromGroup,
  onSelectIndicatorType,
  onChangeIndicatorParams,
  onChangeGlobalLogic,
}) => {
  const indicatorLimitReached = totalIndicatorsAcrossBot >= indicatorsLimit;

  const filteredGroups = useMemo(() => {
    return indicatorGroups.filter((group) => {
      const matchesAction = group.action === indicatorAction;
      const matchesSection = indicatorSection
        ? group.section === indicatorSection
        : group.section !== IndicatorSection.sl;
      return matchesAction && matchesSection;
    });
  }, [indicatorGroups, indicatorAction, indicatorSection]);

  const filteredIndicators = useMemo(() => {
    return indicators.filter((ind) => {
      const matchesAction = ind.indicatorAction === indicatorAction;
      const matchesSection = indicatorSection
        ? ind.section === indicatorSection
        : ind.section !== IndicatorSection.sl;
      return matchesAction && matchesSection;
    });
  }, [indicators, indicatorAction, indicatorSection]);

  const totalIndicators = filteredIndicators.length;
  const shouldShowEmptyIndicatorAlert = totalIndicators === 0;

  const addGroupDisabledReason = useMemo(() => {
    if (indicatorLimitReached) {
      return `Maximum of ${indicatorsLimit} indicators reached across the bot. Remove one before adding more groups.`;
    }

    if (maxGroups !== undefined && filteredGroups.length >= maxGroups) {
      return `You can create up to ${maxGroups} indicator groups.`;
    }

    return undefined;
  }, [indicatorLimitReached, maxGroups, filteredGroups.length]);

  return (
    <div className="space-y-md">
      {(errorMessage ||
        indicatorLimitReached ||
        shouldShowEmptyIndicatorAlert) && (
        <div className="space-y-sm">
          {errorMessage ? (
            <Alert
              variant="destructive"
              className="border-destructive/40 bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">
                Close indicator issue
              </AlertTitle>
              <AlertDescription className="text-sm">
                {errorMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          {indicatorLimitReached ? (
            <Alert
              variant="destructive"
              className="border-destructive/40 bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">
                Indicator limit reached
              </AlertTitle>
              <AlertDescription className="text-sm">
                Remove an indicator from any section before adding more. The bot
                supports up to {indicatorsLimit} indicators across all
                automation blocks.
              </AlertDescription>
            </Alert>
          ) : null}

          {shouldShowEmptyIndicatorAlert ? (
            <Alert className="border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100">
              <Info className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">
                {emptyIndicatorsAlertTitle}
              </AlertTitle>
              <AlertDescription className="text-sm">
                {emptyIndicatorsAlertDescription}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}

      {!singleIndicator && (
      <MasonryLayout
        gap={16}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        <div className="flex-[1_1_300px] min-w-60 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="group-logic" className="text-sm">
                {globalLogicLabel}
              </Label>
              <Tooltip
                tooltip="Use AND/OR operators to define how indicator conditions inside groups are combined."
                tooltipURL="/help/and-or-operators"
              >
                <InfoIcon className="h-3.5 w-3.5" />
              </Tooltip>
            </div>
            <Select value={globalLogic} onValueChange={onChangeGlobalLogic}>
              <SelectTrigger id="group-logic" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {globalLogicOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {secondColumnContent ? (
          <div className=" space-y-4">{secondColumnContent}</div>
        ) : null}
      </MasonryLayout>
      )}

      {filteredGroups.length === 0 ? (
        <div className="rounded-lg bg-muted p-md text-sm text-muted-foreground">
          {emptyStateMessage}
        </div>
      ) : (
        // Groups have no frame; a hairline between them (a peer separator)
        // keeps two groups readable as two.
        <div className="divide-y divide-border/50">
          {filteredGroups.map((group) => {
            const indicatorsInGroup = filteredIndicators.filter(
              (i) => i.groupId === group.id
            );
            const canAddIndicator =
              !indicatorLimitReached &&
              (maxIndicatorsPerGroup === undefined ||
                indicatorsInGroup.length < maxIndicatorsPerGroup);
            const addIndicatorDisabledReason = (() => {
              if (indicatorLimitReached) {
                return `Maximum of ${indicatorsLimit} indicators reached across the bot. Remove one before adding more.`;
              }

              if (
                maxIndicatorsPerGroup !== undefined &&
                indicatorsInGroup.length >= maxIndicatorsPerGroup
              ) {
                return `You can create up to ${maxIndicatorsPerGroup} indicators per group.`;
              }

              return undefined;
            })();

            return (
              <div key={group.id} className="space-y-xs py-md first:pt-0 last:pb-0">
                <IndicatorGroupCard
                  group={group}
                  indicators={indicatorsInGroup}
                  disableControls={false}
                  singleIndicator={singleIndicator}
                  canAddIndicator={canAddIndicator}
                  onChangeLogic={(logic) => onChangeGroupLogic(group.id, logic)}
                  onAddIndicator={() => onAddIndicatorToGroup(group.id)}
                  onRemoveGroup={() => onRemoveGroup(group.id)}
                  onRemoveIndicator={(indicatorId) =>
                    onRemoveIndicatorFromGroup(group.id, indicatorId)
                  }
                  onSelectIndicatorType={(indicator) =>
                    onSelectIndicatorType(group.id, indicator)
                  }
                  renderIndicatorExtras={(indicator) => {
                    try {
                      const definition = getIndicatorDefinition(indicator.type);
                      const defaults = getIndicatorDefaultParams(
                        definition.type,
                        indicatorAction,
                        indicatorSection
                      );
                      const params: IndicatorParamsState = {
                        ...defaults,
                        ...((indicator ?? {}) as IndicatorParamsState),
                      };

                      return (
                        <InlineIndicatorConfig
                          definition={definition}
                          params={params}
                          {...(allowVariableBinding
                            ? { indicatorUuid: indicator.uuid }
                            : {})}
                          exchange={exchange}
                          minIntervalMs={minIntervalMs}
                          onChange={(next) =>
                            onChangeIndicatorParams(
                              group.id,
                              indicator.uuid,
                              next
                            )
                          }
                          className="space-y-sm"
                        />
                      );
                    } catch (_error) {
                      return (
                        <div className="rounded-md bg-destructive/10 p-sm text-sm text-destructive">
                          Selected indicator definition is unavailable.
                        </div>
                      );
                    }
                  }}
                  emptyState="No indicators in this group yet. Add one to build your condition."
                  {...(addIndicatorDisabledReason
                    ? { addIndicatorDisabledReason }
                    : undefined)}
                />
              </div>
            );
          })}
        </div>
      )}

      {!singleIndicator && (
      <div className="flex items-center justify-end gap-md">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddGroup}
          disabled={!!addGroupDisabledReason}
          title={addGroupDisabledReason}
        >
          Add group
        </Button>
      </div>
      )}
    </div>
  );
};
