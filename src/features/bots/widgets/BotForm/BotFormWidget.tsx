import {
  useEffect,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router-dom';

import {
  BotFormShell,
  type BotFormProps,
} from '@/features/bots/widgets/BotForm';
import {
  BotFormProvider,
  useBotFormState,
  type BotFormMode,
  type BotFormTabId,
} from '@/contexts/bots/form/BotFormProvider';
import { BotFormRegistryContext } from './context';
import {
  GridPageProvider,
  useOptionalGridPageContext,
} from '@/contexts/bots/grid/GridPageProvider';
import { BotFormQueryProvider } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  getBotExperience,
  tryGetBotExperience,
} from '@/features/bots/catalog/BotExperienceCatalog';
import type { BotExperienceDescriptor } from '@/features/bots/catalog/types';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export interface BotFormWidgetProps extends BotFormProps {
  botType: BotTypesEnum;
  /** Optional initial form data, takes precedence over the bot experience
   *  catalog's default. Used by the hedge edit page to seed each leg's
   *  BotFormProvider with its half of the loaded hedge bot. */
  initialFormData?: Partial<BotFormData>;
  /** Optional ref the widget keeps in sync with the leg's current
   *  `formData`. Used by the hedge edit page so a top-level save button
   *  outside the BotFormProvider tree can read both legs' state on demand
   *  without forcing re-renders on every keystroke. */
  formDataRef?: MutableRefObject<BotFormData | null>;
  /** Optional content rendered as a child of the inner BotFormProvider
   *  (next to the form itself, no DOM contribution expected). Used by the
   *  hedge edit page to inject a "sync" component that mirrors shared TP/SL
   *  settings into each leg's formData without touching BotFormProvider's
   *  public API. */
  innerSlot?: ReactNode;
  /** Forwarded to BotFormProvider — marks this widget as one leg of a
   *  hedge bot so it skips standalone-DCA chrome (the Quick/Manual mode
   *  toggle) and keeps each leg's state independent. */
  isNestedLeg?: boolean;
  /** Forwarded to BotFormProvider — the seed is a full settings load
   *  (backtest "Load in settings"), so the form opens in Manual. */
  openInManual?: boolean;
}

/**
 * Tiny inner component that lives inside a BotFormProvider and writes the
 * latest formData into a ref the parent owns. Pulled out as a named
 * component so React can manage its own subscription cleanly.
 */
const FormDataRefPublisher: React.FC<{
  targetRef: MutableRefObject<BotFormData | null>;
}> = ({ targetRef }) => {
  const { formData } = useBotFormState();
  useEffect(() => {
    targetRef.current = formData;
  }, [formData, targetRef]);
  return null;
};

const BotFormWidget: React.FC<BotFormWidgetProps> = ({
  botType,
  widgetId = 'bot-form',
  debug,
  data,
  mode,
  botId,
  defaultTab,
  variant = 'widget',
  initialFormData,
  formDataRef,
  innerSlot,
  isNestedLeg,
  openInManual,
  ...restProps
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const resolvedExperience: BotExperienceDescriptor =
    tryGetBotExperience(botType) ?? getBotExperience(BotTypesEnum.dca);
  const providerMode: BotFormMode =
    mode ?? (data?.['mode'] as BotFormMode | undefined) ?? 'edit';
  const isGridBot = resolvedExperience.id === BotTypesEnum.grid;
  const dataBotId =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)['botId']
      : undefined;
  const resolvedBotId =
    providerMode === 'edit'
      ? (botId ??
        (typeof dataBotId === 'string' ? dataBotId : undefined) ??
        paramBotId)
      : botId;
  const debugEnabled =
    debug ?? import.meta.env['VITE_BOT_FORM_DEBUG'] === 'true';

  const contextValue = useMemo(
    () => ({ botExperience: resolvedExperience, widgetId }),
    [resolvedExperience, widgetId]
  );

  const formProps: BotFormProps = {
    ...restProps,
    widgetId,
    debug: debugEnabled,
    mode: providerMode,
    variant,
  };

  if (typeof defaultTab !== 'undefined') {
    formProps.defaultTab = defaultTab;
  }

  if (data) {
    formProps.data = data;
  }

  if (resolvedBotId) {
    formProps.botId = resolvedBotId;
  }

  const formContent = <BotFormShell {...formProps} />;

  const gridProviderOptions = useMemo(
    () =>
      isGridBot && resolvedBotId ? { botId: String(resolvedBotId) } : undefined,
    [isGridBot, resolvedBotId]
  );

  const gridProviderProps = gridProviderOptions
    ? { options: gridProviderOptions }
    : undefined;

  // A grid form needs a GridPageProvider for its grid-data context, but the
  // grid *edit* page already wraps the whole layout (chart + form + insights)
  // in one. Mounting a second provider here gave the edit page two
  // `useGridPage` instances firing duplicate queries and racing on the shared
  // live stores — an infinite render loop. Only add our own provider when
  // there isn't one above us (e.g. the standalone grid *new* page).
  const hasGridProvider = !!useOptionalGridPageContext();
  const wrappedContent =
    isGridBot && !hasGridProvider ? (
      <GridPageProvider {...(gridProviderProps ?? {})}>
        {formContent}
      </GridPageProvider>
    ) : (
      formContent
    );

  const moduleInitialState =
    resolvedExperience.form?.getInitialState?.(providerMode);

  // Caller-supplied seed wins over the catalog default (used by the hedge
  // edit page to inject each leg's mapped formData).
  const resolvedInitialFormData = initialFormData ?? moduleInitialState;

  return (
    <BotFormRegistryContext.Provider value={contextValue}>
      <BotFormProvider
        mode={providerMode}
        defaultTab={defaultTab as BotFormTabId | undefined}
        initialFormData={resolvedInitialFormData}
        botType={botType}
        isNestedLeg={isNestedLeg}
        openInManual={openInManual}
      >
        {formDataRef && <FormDataRefPublisher targetRef={formDataRef} />}
        {innerSlot}
        <BotFormQueryProvider
          mode={providerMode}
          botId={resolvedBotId}
          debug={debugEnabled}
        >
          {wrappedContent}
        </BotFormQueryProvider>
      </BotFormProvider>
    </BotFormRegistryContext.Provider>
  );
};

BotFormWidget.displayName = 'BotFormWidget';

export default BotFormWidget;
