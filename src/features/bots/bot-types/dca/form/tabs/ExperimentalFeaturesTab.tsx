import React, { useMemo } from 'react';

import { useBotFormFeatures } from '@/contexts/bots/form/BotFormProvider';
import { ExperimentalFeatures } from '@/features/bots/bot-types/dca/form/sections';
import { useBotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import type { DcaBot } from '@/types/dcaBot';
import type {
  ExperimentalToggleDefinition,
  ExperimentalToggleKey,
} from '@/utils/bots/dca/experimental-toggles';

export const ExperimentalFeaturesTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  mode,
  isFieldLocked,
  bot,
  exchangesData,
}) => {
  const featureFlags = useBotFormFeatures();
  const { botExperience } = useBotFormRegistryContext();

  const toggleConfig = useMemo(() => {
    const metadataToggles = botExperience.metadata?.['experimentalToggles'];
    if (Array.isArray(metadataToggles)) {
      return metadataToggles as ExperimentalToggleDefinition[];
    }

    return undefined;
  }, [botExperience.metadata]);

  const lockedToggles = useMemo(() => {
    const result: Partial<Record<ExperimentalToggleKey, boolean>> = {};

    if (!isFieldLocked) {
      return result;
    }

    const keys: Array<ExperimentalToggleKey> = [
      'feeOrder',
      'autoRebalancing',
      'remainderFullAmount',
      'adaptiveClose',
    ];

    keys.forEach((key) => {
      if (isFieldLocked(key)) {
        result[key] = true;
      }
    });

    return result;
  }, [isFieldLocked]);

  const dcaBot = useMemo(() => {
    if (!bot || typeof bot !== 'object') {
      return null;
    }

    if ('dealsInBot' in bot) {
      return bot as DcaBot;
    }

    return null;
  }, [bot]);

  // Clone/create mode seeds from a source bot whose deals belong to the
  // original — only apply deal-based locks when editing a live bot.
  const activeDealCount = mode === 'edit' ? (dcaBot?.dealsInBot?.active ?? 0) : 0;
  const hasActiveDeals = activeDealCount > 0;

  const exchangeProvider = useMemo(() => {
    const candidates = new Set<string>();

    if (typeof formData.exchangeUUID === 'string' && formData.exchangeUUID) {
      candidates.add(formData.exchangeUUID.toLowerCase());
    }

    if (dcaBot?.exchangeUUID) {
      candidates.add(String(dcaBot.exchangeUUID).toLowerCase());
    }

    if (dcaBot?.exchange) {
      candidates.add(String(dcaBot.exchange).toLowerCase());
    }

    if (!candidates.size) {
      return dcaBot?.exchange;
    }

    const matchedExchange = exchangesData?.find((exchange) => {
      const uuid = exchange.uuid?.toLowerCase?.();
      const provider = exchange.provider?.toLowerCase?.();
      const name = exchange.name?.toLowerCase?.();

      return (
        (uuid && candidates.has(uuid)) ||
        (provider && candidates.has(provider)) ||
        (name && candidates.has(name))
      );
    });

    return matchedExchange?.provider ?? dcaBot?.exchange;
  }, [
    dcaBot?.exchange,
    dcaBot?.exchangeUUID,
    exchangesData,
    formData.exchangeUUID,
  ]);

  const sectionDisabledReason = useMemo(() => {
    if (mode && mode !== 'edit' && mode !== 'create') {
      return 'Experimental settings are read-only in the current mode.';
    }

    return undefined;
  }, [mode]);

  return (
    <div className="space-y-lg lg:space-y-10">
      <ExperimentalFeatures
        currentExchange={currentExchange}
        formData={formData}
        updateFormData={updateFormData}
        _featureFlags={featureFlags}
        _toggles={toggleConfig}
        lockedToggles={lockedToggles}
        sectionDisabledReason={sectionDisabledReason}
        activeDealCount={activeDealCount}
        hasActiveDeals={hasActiveDeals}
        exchangeProvider={exchangeProvider}
      />
    </div>
  );
});
ExperimentalFeaturesTab.displayName = 'ExperimentalFeaturesTab';

export default ExperimentalFeaturesTab;
