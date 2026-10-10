import { IndicatorList } from '@/components/indicators/IndicatorList';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IndicatorActionsToolbar } from '@/features/bots/shared/components/IndicatorActionsToolbar';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
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
  renderIndicatorExtras,
  addIndicatorDisabledReason,
  emptyState,
  addButtonLabel = 'Add indicator',
  singleIndicator = false,
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
    // No frame of its own (DESIGN_SYSTEM §3): groups are told apart by
    // spacing and the manager's separators; the indicators carry the inset
    // surface. A single fixed indicator renders straight in its host's flow.
    <div className="space-y-md">
      {!singleIndicator && (
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <Label
            htmlFor={`indicator-group-logic-${group.id}`}
            className="whitespace-nowrap"
          >
            Join logic
          </Label>
          <Select
            value={group.logic}
            onValueChange={(value) =>
              onChangeLogic(value as IndicatorGroup['logic'])
            }
            disabled={disableControls}
          >
            <SelectTrigger
              id={`indicator-group-logic-${group.id}`}
              className="w-[180px]"
            >
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

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemoveGroup}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={disableControls}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      )}

      <IndicatorList
        indicators={indicators}
        {...(singleIndicator ? {} : { onRemove: onRemoveIndicator })}
        {...(onSelectIndicatorType
          ? { onSelectType: onSelectIndicatorType }
          : {})}
        {...(renderIndicatorExtras
          ? { renderExtras: renderIndicatorExtras }
          : {})}
        {...(emptyState ? { emptyState } : {})}
      />

      {!singleIndicator && (
      <div className="flex justify-end">
        <IndicatorActionsToolbar
          onAddIndicator={onAddIndicator}
          addIndicatorLabel={addButtonLabel}
          addIndicatorDisabled={addIndicatorDisabled}
          addIndicatorTooltip={addIndicatorTooltip}
          addIndicatorVariant="outline"
        />
      </div>
      )}
    </div>
  );
};

IndicatorGroupCard.displayName = 'IndicatorGroupCard';
