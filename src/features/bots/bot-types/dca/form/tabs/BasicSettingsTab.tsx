import React from 'react';

import { BasicSettings } from '@/features/bots/bot-types/dca/form/sections';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

// BasicSettings reads formData/errors/alerts from the form store, so this tab no
// longer forwards them and its memo bails on keystrokes via the comparator. The
// remaining props (currentExchange, exchanges, mode, isFieldLocked, …) are all
// referentially stable across keystrokes.
export const BasicSettingsTab = React.memo<BotFormTabComponentProps>(
  ({
    currentExchange,
    updateFormData,
    exchangesData,
    exchangesLoading,
    handleUpdateBalances,
    mode,
    isFieldLocked,
  }) => (
    <div className="space-y-md sm:space-y-lg lg:space-y-xl">
      <BasicSettings
        currentExchange={currentExchange}
        updateFormData={updateFormData}
        exchangesData={exchangesData}
        {...(typeof exchangesLoading === 'boolean' ? { exchangesLoading } : {})}
        {...(handleUpdateBalances
          ? { onUpdateBalances: handleUpdateBalances }
          : {})}
        mode={mode}
        isFieldLocked={isFieldLocked}
      />
    </div>
  ),
  tabPropsEqualIgnoringHot
);
BasicSettingsTab.displayName = 'BasicSettingsTab';

export default BasicSettingsTab;
