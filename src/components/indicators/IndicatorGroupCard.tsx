import { IndicatorList } from '@/components/indicators/IndicatorList';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IndicatorActionsToolbar } from '@/features/bots/shared/components/IndicatorActionsToolbar';
import type { IndicatorEnum } from '@/types';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import type { EdgeApplyRequest } from '@/utils/indicators/edgeApply';
import type { EdgeSide } from '@/utils/indicatorEdge';
import { Trash2 } from 'lucide-react';
import React, { useCallback } from 'react';

export interface IndicatorGroupCardProps {
  group: IndicatorGroup;
  indicators: IndicatorConfig[];
  disableControls: boolean;
  canAddIndicator: boolean;
  onChangeLogic: (logic: IndicatorGroup['logic']) => void;
  onAddIndicator: () => void;
  onRemoveGroup: () => void;
  onEditIndicator?: (indicator: IndicatorConfig) => void;
  onRemoveIndicator: (indicatorId: string) => void;
  onSelectIndicatorType?: (indicator: IndicatorConfig) => void;
  onToggleFavorite?: (indicator: IndicatorConfig) => void;
  isFavorite?: (type: IndicatorEnum) => boolean;
  renderIndicatorExtras?: (
    indicator: IndicatorConfig,
    index: number
  ) => React.ReactNode;
  addIndicatorDisabledReason?: string | undefined;
  emptyState?: string;
  addButtonLabel?: string;
  /**
   * One fixed indicator: hides the join logic, remove group, remove
   * indicator and add indicator controls. Default false.
   */
  singleIndicator?: boolean;
  /** Draw the group as a bracket (when it is one of several). */
  framed?: boolean;
  /** Label in the frame's header, e.g. "Group 2". */
  title?: string;
  /** Apply on the help article's price-behaviour panel (see IndicatorList). */
  onApplyEdgeSetting?: (
    indicator: IndicatorConfig,
    request: EdgeApplyRequest
  ) => void;
  /** The side these conditions trade in the bot (see IndicatorList). */
  edgeSide?: EdgeSide | null;
}

export const IndicatorGroupCard: React.FC<IndicatorGroupCardProps> = ({
  group,
  indicators,
  disableControls,
  canAddIndicator,
  onChangeLogic,
  onAddIndicator,
  onRemoveGroup: _onRemoveGroup,
  onRemoveIndicator,
  onSelectIndicatorType,
  onToggleFavorite,
  isFavorite,
  renderIndicatorExtras,
  addIndicatorDisabledReason,
  emptyState,
  addButtonLabel = 'Indicator',
  singleIndicator = false,
  framed = false,
  title = 'Group',
  onApplyEdgeSetting,
  edgeSide = null,
}) => {
  const addIndicatorDisabled = !canAddIndicator || disableControls;
  const addIndicatorTooltip = addIndicatorDisabled
    ? (addIndicatorDisabledReason ??
      (disableControls ? 'Indicator controls are disabled.' : undefined))
    : undefined;

  const onRemoveGroup = useCallback(() => {
    for (const indicator of indicators) {
      onRemoveIndicator(indicator.uuid);
    }
    _onRemoveGroup();
  }, [_onRemoveGroup, indicators, onRemoveIndicator]);

  return (
    // One of several groups: the group is the card's inner fill (the bracket
    // around "(A or B)") and its rows sit back on the card surface. A lone group renders
    // straight in its host's flow with raised rows. No borders (§3).
    <div
      className={cn(
        'min-w-0 space-y-sm',
        framed && 'rounded-xl bg-muted p-sm'
      )}
    >
      {framed && !singleIndicator ? (
        <div className="flex items-center justify-between gap-sm pl-xs">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemoveGroup}
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={disableControls}
            aria-label="Remove group"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <IndicatorList
        indicators={indicators}
        {...(singleIndicator ? {} : { onRemove: onRemoveIndicator })}
        {...(onSelectIndicatorType
          ? { onSelectType: onSelectIndicatorType }
          : {})}
        {...(onToggleFavorite ? { onToggleFavorite } : {})}
        {...(isFavorite ? { isFavorite } : {})}
        {...(renderIndicatorExtras
          ? { renderExtras: renderIndicatorExtras }
          : {})}
        {...(emptyState ? { emptyState } : {})}
        {...(onApplyEdgeSetting ? { onApplyEdgeSetting } : {})}
        edgeSide={edgeSide}
        surface={framed ? 'inset' : 'raised'}
        connector={{
          logic: group.logic,
          ...(disableControls
            ? {}
            : {
                onToggle: () =>
                  onChangeLogic(
                    (group.logic === 'or'
                      ? 'and'
                      : 'or') as IndicatorGroup['logic']
                  ),
              }),
        }}
      />

      {!singleIndicator && (
        <IndicatorActionsToolbar
          onAddIndicator={onAddIndicator}
          addIndicatorLabel={addButtonLabel}
          addIndicatorDisabled={addIndicatorDisabled}
          addIndicatorTooltip={addIndicatorTooltip}
          addIndicatorVariant="ghost"
        />
      )}
    </div>
  );
};

IndicatorGroupCard.displayName = 'IndicatorGroupCard';
