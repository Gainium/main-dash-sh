import React from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { Switch } from '@/components/ui/switch';
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
import { StartConditionEnum } from '@/types';

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
  'Hold at most one open deal per pair. A start signal on a pair that already has an open deal adds an entry to that deal instead of opening another one, and the take profit moves with the new average. Entries replace safety orders: the DCA settings are kept but not used while this is on. Turning it off later does not split a position — it runs to its close as one deal, without safety orders, and new deals follow the restored settings. With ASAP, a dynamic price filter or a cooldown after deal start is required to space the entries; with an indicator start that stays true, a cooldown after deal start is recommended.';

/** Spec 139 §2.3 / §7.3: the toggle, the entry limit and the ASAP check. */
export const SinglePositionSettings: React.FC = () => {
  const { offered, active } = useSinglePositionFormState();
  const { updateFormData } = useBotFormActions();
  const errors = useBotFormErrors();
  const maxPositionEntries = useBotFormSelector('maxPositionEntries');
  const spacing = useSpacingSettings();
  const asapError = singlePositionAsapError(spacing);
  const isIndicatorStart = spacing.startCondition === StartConditionEnum.ti;

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
          <p className="text-xs text-muted-foreground">
            At most one open deal per pair. Start signals add entries to it
            instead of opening new deals; entries replace safety orders.
            Turning this off later does not split a position.
            {isIndicatorStart
              ? ' An indicator that stays true re-enters every candle — consider a cooldown after deal start.'
              : ''}
          </p>
          <div className="space-y-xs">
            <Label htmlFor="max-position-entries">
              Max entries per position
            </Label>
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
            <p className="text-xs text-muted-foreground">
              Counts the base order. Empty or 0 = no limit.
            </p>
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
  <SettingsAlert
    variant="info"
    title="Safety orders are off while single position per pair is on"
    description="Entries replace safety orders. These settings are kept and apply again if you turn single position off."
  />
);
