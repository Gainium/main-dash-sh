import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { Switch } from '@/components/ui/switch';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  type BotFormFeatureFlags,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import type { BotFormData, ExchangeBotForm } from '@/types/bots/form';
import {
  computeExperimentalSectionState,
  DEFAULT_EXPERIMENTAL_TOGGLES,
  type ExperimentalToggleDefinition,
  type ExperimentalToggleKey,
} from '@/utils/bots/dca/experimental-toggles';
import { HelpCircle } from 'lucide-react';
import React from 'react';

interface ExperimentalFeaturesProps {
  currentExchange: ExchangeBotForm | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  _featureFlags?: BotFormFeatureFlags;
  _toggles?: ExperimentalToggleDefinition[] | undefined;
  featureFlags?: BotFormFeatureFlags;
  toggles?: ExperimentalToggleDefinition[];
  lockedToggles?: Partial<
    Record<'useExperimental' | ExperimentalToggleKey, boolean>
  >;
  sectionDisabledReason?: string | undefined;
  activeDealCount?: number;
  hasActiveDeals?: boolean;
  exchangeProvider?: string | undefined;
}

export const ExperimentalFeatures: React.FC<ExperimentalFeaturesProps> = ({
  formData,
  updateFormData,
  _featureFlags,
  _toggles,
  featureFlags,
  toggles,
  lockedToggles,
  sectionDisabledReason = undefined,
  activeDealCount,
  hasActiveDeals,
  exchangeProvider,
}) => {
  const resolvedFeatureFlags = featureFlags ?? _featureFlags ?? {};
  const toggleDefinitions =
    toggles && toggles.length > 0
      ? toggles
      : _toggles && _toggles.length > 0
        ? _toggles
        : DEFAULT_EXPERIMENTAL_TOGGLES;
  const computedState = computeExperimentalSectionState({
    formData,
    toggleDefinitions,
    featureFlags: resolvedFeatureFlags,
    ...(lockedToggles ? { lockedToggles } : {}),
    ...(sectionDisabledReason !== undefined ? { sectionDisabledReason } : {}),
    ...(typeof activeDealCount === 'number' ? { activeDealCount } : {}),
    ...(typeof hasActiveDeals === 'boolean' ? { hasActiveDeals } : {}),
    ...(exchangeProvider ? { exchangeProvider } : {}),
  });
  const useExperimental = useBotFormSelector('useExperimental');
  // Hide the whole section body when the experimental master toggle is off
  if (!useExperimental) {
    return null;
  }

  return (
    <MasonryLayout
      gap={16}
      containerBreakpoints={{
        default: 1,
        640: 2,
        1024: 3,
      }}
    >
      {computedState.toggles.length === 0 ? (
        <SettingsRow colSpan="full">
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-md text-sm text-muted-foreground">
            No experimental options
          </div>
        </SettingsRow>
      ) : null}

      {computedState.toggles.map(
        ({ id, label, description, helpUrl, disabled, reasons, checked }) => {
          const hasReasons = reasons.length > 0;

          return (
            <SettingsRow
              key={id}
              name={label}
              description={description}
              {...(hasReasons ? { tooltip: reasons.join(' ') } : {})}
              {...(helpUrl ? { tooltipURL: helpUrl } : {})}
              headerAlign="center"
              className={disabled ? 'opacity-60' : ''}
              contentClassName={hasReasons ? 'space-y-xs' : ''}
              trailing={
                <Switch
                  id="disable-repositioning"
                  checked={checked}
                  onCheckedChange={(checked) => updateFormData(id, checked)}
                />
              }
            >
              {hasReasons ? (
                <div className="flex items-start gap-xs text-xs text-muted-foreground">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{reasons.join(' ')}</span>
                </div>
              ) : null}
            </SettingsRow>
          );
        }
      )}
    </MasonryLayout>
  );
};
