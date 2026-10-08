import React from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormActions,
  useBotFormErrors,
  useBotFormSelector,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useSinglePositionFormState } from '@/features/bots/bot-types/dca/form/hooks/useSinglePositionFormState';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import {
  addStartCooldownPatch,
  enableDynamicPriceFilterPatch,
  singlePositionAsapError,
  type SinglePositionSpacingSettings,
} from '@/lib/singlePosition/singlePosition';

/** Live spacing settings the §7 check reads. */
function useSpacingSettings(): SinglePositionSpacingSettings {
  return {
    singlePosition: useBotFormSelector('singlePosition'),
    startCondition: useBotFormSelector('startCondition'),
    useDynamicPriceFilter: useBotFormSelector('useDynamicPriceFilter'),
    dynamicPriceFilterDeviation: useBotFormSelector(
      'dynamicPriceFilterDeviation'
    ),
    dynamicPriceFilterDirection: useBotFormSelector(
      'dynamicPriceFilterDirection'
    ),
    dynamicPriceFilterOverValue: useBotFormSelector(
      'dynamicPriceFilterOverValue'
    ),
    dynamicPriceFilterUnderValue: useBotFormSelector(
      'dynamicPriceFilterUnderValue'
    ),
    useCooldown: useBotFormSelector('useCooldown'),
    cooldownAfterDealStart: useBotFormSelector('cooldownAfterDealStart'),
    cooldownAfterDealStartInterval: useBotFormSelector(
      'cooldownAfterDealStartInterval'
    ),
  };
}

const HELP_TEXT =
  'One open deal per pair. A start signal on a pair with an open deal adds an entry to it and the take profit moves with the new average. Entries replace safety orders. Turning it off does not split a position. With ASAP, a dynamic price filter or a cooldown after deal start is required; with an indicator start, a cooldown is recommended.';
const MAX_ENTRIES_TOOLTIP = 'Counts the base order. Empty or 0 = no limit.';
const DCA_OFF_TOOLTIP =
  'Entries replace safety orders while single position per pair is on. These settings are kept and apply again when it is turned off.';

/** Spec 139 §2.3 / §7.3: the toggle, the entry limit and the ASAP check. */
export const SinglePositionSettings: React.FC = () => {
  const { offered, active } = useSinglePositionFormState();
  const { updateFormData } = useBotFormActions();
  const errors = useBotFormErrors();
  const maxPositionEntries = useBotFormSelector('maxPositionEntries');
  const spacing = useSpacingSettings();
  const asapError = singlePositionAsapError(spacing);

  const applyPatch = (patch: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(patch)) {
      updateFormData(field as Fields, value as BotFormUpdateValue);
    }
  };

  if (!offered) return null;

  const serverError =
    errors['singlePosition'] && errors['singlePosition'] !== asapError
      ? errors['singlePosition']
      : null;

  return (
    <SettingsRow
      name="Single position per pair"
      tooltip={HELP_TEXT}
      tooltipURL="/help/single-position-per-pair"
      colSpan="full"
      navId="singlePosition"
      trailing={
        <Switch
          id="single-position"
          checked={active}
          onCheckedChange={(checked) =>
            updateFormData('singlePosition', checked)
          }
          aria-describedby={asapError ? 'single-position-error' : undefined}
        />
      }
      headerAlign="center"
      contentClassName="space-y-sm"
    >
      {active && (
        <>
          <div className="space-y-xs">
            <div className="flex items-center gap-xs">
              <Label htmlFor="max-position-entries">
                Max entries per position
              </Label>
              <Tooltip tooltip={MAX_ENTRIES_TOOLTIP} side="right">
                <InfoIcon />
              </Tooltip>
            </div>
            <NumberInput
              id="max-position-entries"
              value={maxPositionEntries ?? ''}
              onChange={(value) =>
                updateFormData(
                  'maxPositionEntries',
                  typeof value === 'number' ? value.toString() : (value ?? '')
                )
              }
              min={0}
              step={1}
              placeholder="No limit"
              className="w-40"
              showControls={false}
              endAdornment={unitAdornment('entries', { size: 'sm' })}
            />
            {errors['maxPositionEntries'] && (
              <p className="text-xs text-destructive">
                {errors['maxPositionEntries']}
              </p>
            )}
          </div>
        </>
      )}
      {asapError && (
        <div
          id="single-position-error"
          role="alert"
          className="space-y-sm rounded-md border border-destructive/50 bg-destructive/10 p-sm"
        >
          <p className="text-sm text-destructive">{asapError}</p>
          <div className="flex flex-wrap gap-xs">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyPatch(enableDynamicPriceFilterPatch(spacing))}
            >
              Enable dynamic price filter
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyPatch(addStartCooldownPatch(spacing))}
            >
              Add cooldown
            </Button>
          </div>
        </div>
      )}
      {serverError && <SettingsAlert variant="error" title={serverError} />}
    </SettingsRow>
  );
};

/** §2.3.1: the DCA section stays visible but inert, with its values kept. */
export const SinglePositionDcaNote: React.FC = () => (
  <div className="flex items-center gap-xs text-sm text-muted-foreground">
    <span>Off — single position per pair</span>
    <Tooltip tooltip={DCA_OFF_TOOLTIP} side="right">
      <InfoIcon />
    </Tooltip>
  </div>
);
