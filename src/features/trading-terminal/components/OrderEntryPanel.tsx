import { memo, useMemo } from 'react';

import CreateDeal from '@/components/widgets/trading/CreateDeal';
import { useRenderLoopTripwire } from '@/hooks/useRenderLoopTripwire';

import { BotFormProvider, type BotFormMode } from '@/features/bots';
import { getBotExperience } from '@/features/bots/catalog/BotExperienceCatalog';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm';
import { BotFormQueryProvider } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { BotTypesEnum, type BotChartData } from '@/types';

interface OrderEntryPanelProps {
  onFormDataChange?: (data: BotChartData) => void;
}

const OrderEntryWidget: React.FC<OrderEntryPanelProps> = memo(
  ({ onFormDataChange }) => {
    const providerMode: BotFormMode = useMemo(() => 'create', []);

    const resolvedExperience = useMemo(
      () => getBotExperience(BotTypesEnum.dca),
      []
    );

    const moduleInitialState = useMemo(
      () => resolvedExperience.form?.getInitialState?.(providerMode),
      [resolvedExperience, providerMode]
    );

    const contextValue = useMemo(
      () => ({
        botExperience: resolvedExperience,
        widgetId: 'trading-terminal-order-entry',
      }),
      [resolvedExperience]
    );

    const debugEnabled = useMemo(
      () => import.meta.env['VITE_BOT_FORM_DEBUG'] === 'true',
      []
    );

    return (
      <BotFormRegistryContext.Provider value={contextValue}>
        <BotFormProvider
          mode={providerMode}
          defaultTab={'basic'}
          initialFormData={moduleInitialState}
          botType={BotTypesEnum.dca}
          terminal={true}
        >
          <BotFormQueryProvider mode={providerMode} debug={debugEnabled}>
            <div className="h-full overflow-hidden">
              <CreateDeal
                widgetId={contextValue.widgetId}
                onFormDataChange={onFormDataChange}
              />
            </div>
          </BotFormQueryProvider>
        </BotFormProvider>
      </BotFormRegistryContext.Provider>
    );
  }
);

export const OrderEntryPanel = memo(function OrderEntryPanelComponent(
  props: OrderEntryPanelProps
) {
  // Render-loop tripwire (additive, non-fatal). This frame wraps BotFormShell in
  // the #575 componentStack. It takes a single prop, so a trip HERE says the
  // churn is arriving from the terminal above rather than from inside the form —
  // which is the discrimination the crash report could not make.
  // Kill via localStorage['gainium:tripwire']='off'.
  useRenderLoopTripwire('OrderEntryPanel', props as Record<string, unknown>);

  return <OrderEntryWidget {...props} />;
});
