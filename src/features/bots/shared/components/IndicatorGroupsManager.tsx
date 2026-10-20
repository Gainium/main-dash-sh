import { IndicatorGroupCard } from '@/components/indicators/IndicatorGroupCard';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { LogicPill } from '@/components/indicators/LogicPill';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  IndicatorAction,
  IndicatorSection,
  indicatorsLimit,
  IndicatorsLogicEnum,
  type ExchangeEnum,
  type IndicatorEnum,
} from '@/types';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import {
  getIndicatorDefaultParams,
  getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { extractFavoritePresetParams } from '@/utils/indicators/favoritePresets';
import { Plus } from 'lucide-react';
import React, { useMemo } from 'react';

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
  /** Caption above the one-line condition, e.g. "Start a deal when". */
  formulaLabel?: string;
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
  /** `join`: how the new group attaches to the last one (per-group joins). */
  onAddGroup: (join?: IndicatorsLogicEnum) => void;
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
  /**
   * Set groups' `join` (group id -> AND/OR with the previous group). When
   * omitted, the pills between groups all edit the bot-level logic.
   */
  onChangeGroupJoins?: (joins: Record<string, IndicatorsLogicEnum>) => void;
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
  globalLogicLabel: _globalLogicLabel = 'Match groups',
  formulaLabel = 'Condition',
  globalLogicOptions: _globalLogicOptions,
  emptyStateMessage = 'No indicator groups configured yet. Add a group to start building your conditions.',
  emptyIndicatorsAlertTitle = 'Empty group never triggers',
  emptyIndicatorsAlertDescription = 'Add at least one indicator to each group.',
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
  onChangeGroupJoins,
}) => {
  const indicatorLimitReached = totalIndicatorsAcrossBot >= indicatorsLimit;

  // Starring a card keeps its settings with the favorite; picking that
  // favorite in the selector later starts from them.
  const { favorites, toggleFavorite } = useFavoriteIndicators();
  const isFavorite = React.useCallback(
    (type: IndicatorEnum) => favorites.includes(type),
    [favorites]
  );
  const handleToggleFavorite = React.useCallback(
    (indicator: IndicatorConfig) => {
      const next = !favorites.includes(indicator.type);
      toggleFavorite(
        indicator.type,
        next,
        next ? extractFavoritePresetParams(indicator) : undefined
      );
    },
    [favorites, toggleFavorite]
  );

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

  // The AND/OR between a group and the one before it: its own `join`, or the
  // bot-level logic for bots saved before per-group joins.
  const effectiveJoin = React.useCallback(
    (group: IndicatorGroup) => group.join ?? globalLogic,
    [globalLogic]
  );

  // The whole condition in one readable line. AND binds tighter than OR, and
  // the line brackets AND-runs so it reads unambiguously:
  // "((RSI or MACD) and BB) or SuperTrend".
  const formula = useMemo(() => {
    if (totalIndicators < 2) return '';
    const items = filteredGroups
      .map((group) => {
        const names = filteredIndicators
          .filter((i) => i.groupId === group.id)
          .map((i) => {
            try {
              const d = getIndicatorDefinition(i.type);
              return d.shortLabel || d.label;
            } catch {
              return String(i.type);
            }
          });
        if (!names.length) return null;
        const joined = names.join(group.logic === 'or' ? ' or ' : ' and ');
        return {
          group,
          text:
            names.length > 1 && filteredGroups.length > 1
              ? `(${joined})`
              : joined,
        };
      })
      .filter((item): item is { group: IndicatorGroup; text: string } =>
        Boolean(item)
      );
    const terms: string[][] = [];
    items.forEach((item, index) => {
      if (index === 0 || effectiveJoin(item.group) === IndicatorsLogicEnum.or) {
        terms.push([item.text]);
      } else {
        terms[terms.length - 1]?.push(item.text);
      }
    });
    return terms
      .map((term) =>
        term.length > 1 && terms.length > 1
          ? `(${term.join(' and ')})`
          : term.join(' and ')
      )
      .join(' or ');
  }, [filteredGroups, filteredIndicators, totalIndicators, effectiveJoin]);

  // Pin every gap to its current effective join, so changing one gap (or the
  // bot-level fallback) leaves the others as they are.
  const pinnedJoins = React.useCallback(
    (overrides: Record<string, IndicatorsLogicEnum> = {}) =>
      Object.fromEntries(
        filteredGroups
          .slice(1)
          .map((group) => [group.id, overrides[group.id] ?? effectiveJoin(group)])
      ) as Record<string, IndicatorsLogicEnum>,
    [filteredGroups, effectiveJoin]
  );

  const toggleJoin = React.useCallback(
    (group: IndicatorGroup) => {
      const next =
        effectiveJoin(group) === IndicatorsLogicEnum.or
          ? IndicatorsLogicEnum.and
          : IndicatorsLogicEnum.or;
      if (onChangeGroupJoins) {
        onChangeGroupJoins(pinnedJoins({ [group.id]: next }));
      } else {
        onChangeGlobalLogic(next);
      }
    },
    [effectiveJoin, onChangeGroupJoins, onChangeGlobalLogic, pinnedJoins]
  );

  // A new group is an alternative (all-AND groups add nothing over one
  // group), so it joins with OR. With per-group joins the new group carries
  // that itself; otherwise going from one group to two flips the bot logic.
  const handleAddGroup = React.useCallback(() => {
    if (onChangeGroupJoins && filteredGroups.length >= 1) {
      onAddGroup(IndicatorsLogicEnum.or);
      return;
    }
    if (filteredGroups.length === 1 && globalLogic !== IndicatorsLogicEnum.or) {
      onChangeGlobalLogic(IndicatorsLogicEnum.or);
    }
    onAddGroup();
  }, [
    filteredGroups.length,
    onChangeGroupJoins,
    globalLogic,
    onChangeGlobalLogic,
    onAddGroup,
  ]);

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
    <div className="min-w-0 space-y-md">
      {(errorMessage ||
        indicatorLimitReached ||
        shouldShowEmptyIndicatorAlert) && (
        <div className="space-y-sm">
          {errorMessage ? (
            <SettingsAlert variant="error" title={errorMessage} />
          ) : null}

          {indicatorLimitReached ? (
            <SettingsAlert
              variant="error"
              title={`Indicator limit reached (${indicatorsLimit})`}
              description="Remove an indicator from any section before adding more."
            />
          ) : null}

          {shouldShowEmptyIndicatorAlert ? (
            <SettingsAlert
              variant="warning"
              title={emptyIndicatorsAlertTitle}
              description={emptyIndicatorsAlertDescription}
            />
          ) : null}
        </div>
      )}

      {secondColumnContent ? (
        <div className="space-y-4">{secondColumnContent}</div>
      ) : null}

      {!singleIndicator && formula ? (
        <div className="space-y-xs">
          <div className="text-xs text-muted-foreground">{formulaLabel}</div>
          <div className="break-words rounded-md bg-muted px-md py-sm font-mono text-sm">
            {formula}
          </div>
        </div>
      ) : null}

      {filteredGroups.length === 0 ? (
        <div className="rounded-lg bg-muted p-md text-sm text-muted-foreground">
          {emptyStateMessage}
        </div>
      ) : (
        // Several groups are framed as brackets with the AND/OR that joins
        // them drawn between the frames.
        <div className="flex min-w-0 flex-col">
          {filteredGroups.map((group, groupIndex) => {
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
              <React.Fragment key={group.id}>
                {groupIndex > 0 ? (
                  <LogicPill
                    className="py-sm"
                    logic={effectiveJoin(group)}
                    onToggle={() => toggleJoin(group)}
                  />
                ) : null}
                <IndicatorGroupCard
                  group={group}
                  framed={filteredGroups.length > 1}
                  title={`Group ${groupIndex + 1}`}
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
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
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
              </React.Fragment>
            );
          })}
        </div>
      )}

      {!singleIndicator && (
        <Tooltip tooltip={addGroupDisabledReason ?? 'Add an alternative condition, joined with OR'}>
          <span className="inline-block">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddGroup}
              disabled={!!addGroupDisabledReason}
            >
              <Plus className="mr-1 h-4 w-4" />
              Group
            </Button>
          </span>
        </Tooltip>
      )}
    </div>
  );
};
