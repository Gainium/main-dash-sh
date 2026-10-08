import React from 'react';

import { DCASettings } from '@/features/bots/bot-types/dca/form/sections';
import { SinglePositionDcaNote } from '@/features/bots/bot-types/dca/form/sections/SinglePositionSettings';
import { useSinglePositionFormState } from '@/features/bots/bot-types/dca/form/hooks/useSinglePositionFormState';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';

export const DCASettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  updateFormData,
  handleUpdateBalances,
}) => {
  // Single position per pair: entries replace safety orders. The section
  // stays visible with its values kept, but cannot be edited.
  const { active: singlePositionActive } = useSinglePositionFormState();
  return (
  <div className="space-y-md">
    {singlePositionActive && <SinglePositionDcaNote />}
    {/* Always the same tree, so toggling does not remount the section. */}
    <fieldset
      disabled={singlePositionActive}
      aria-disabled={singlePositionActive || undefined}
      className={
        singlePositionActive
          ? 'min-w-0 pointer-events-none select-none opacity-60'
          : 'min-w-0'
      }
    >
      <DCASettings
        currentExchange={currentExchange}
        updateFormData={updateFormData}
        {...(handleUpdateBalances
          ? { onUpdateBalances: handleUpdateBalances }
          : {})}
      />
    </fieldset>
  </div>
  );
}, tabPropsEqualIgnoringHot);
DCASettingsTab.displayName = 'DCASettingsTab';

export default DCASettingsTab;
