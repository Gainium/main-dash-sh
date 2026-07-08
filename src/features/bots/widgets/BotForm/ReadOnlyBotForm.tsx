/**
 * ReadOnlyBotForm
 *
 * Renders the full bot form sections in read-only mode without any network
 * requests.  Designed for embedding inside drawers / dialogs where the user
 * just needs to *see* the bot configuration.
 *
 * It wires up the minimum context providers that the tab section components
 * expect (BotFormRegistryContext, BotFormProvider, BotFormQueryContext) using
 * the bot data that is already available on the client.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Edit } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, InfoIcon } from '@/components/ui/tooltip';
import {
  ScrollableFormTabNavigation,
  type ScrollableTabItem,
} from '@/components/ui/ScrollableFormTabNavigation';

import {
  BotFormProvider,
  useBotFormState,
  type BotFormTabId,
} from '@/contexts/bots/form/BotFormProvider';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import {
  BotFormQueryContext,
  type BotFormQueryContextValue,
} from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  getBotExperience,
  tryGetBotExperience,
} from '@/features/bots/catalog/BotExperienceCatalog';
import type { BotExperienceDescriptor } from '@/features/bots/catalog/types';
import {
  useBotFormInitialization,
  type BotSettingsMapper,
} from '@/hooks/bots/forms/useBotFormInitialization';
import { mapGridBotSettingsToFormData } from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';

import { dcaTabDescriptors } from '@/features/bots/bot-types/dca/form/tabs';
import { gridTabDescriptors } from '@/features/bots/bot-types/grid/form/tabs';

import {
  BotTypesEnum,
  type DCABot,
  type ExchangeInUser,
  type HedgeBot,
  type ComboBot,
} from '@/types';
import type { GridBot } from '@/types/gridBot';
import type { BotFormData } from '@/types/bots/form';
import type { BotFormTabComponentProps, BotFormTabDescriptor } from './types';

import { cn } from '@/lib/utils';

/** Props accepted by ReadOnlyBotForm */
export interface ReadOnlyBotFormProps {
  /** The full bot object already available on the client. */
  bot: DCABot | ComboBot | GridBot;
  /** Bot type enum */
  botType: BotTypesEnum;
  /** Optional className for the outer container */
  className?: string;
  /** Whether to show the section navigation tabs (default: true) */
  showNavigation?: boolean;
  /** When provided, an edit icon button is shown in the tab navigation */
  onEditClick?: () => void;
}

// ---------------------------------------------------------------------------
// Stub exchange object builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal ExchangeInUser from the bot's exchange fields so that the
 * Basic / Strategy section components can display the exchange without
 * fetching from the network.
 */
const buildStubExchange = (
  bot: DCABot | ComboBot | GridBot
): ExchangeInUser | null => {
  const provider = (bot as { exchange?: string }).exchange;
  const uuid = (bot as { exchangeUUID?: string }).exchangeUUID;

  if (!provider && !uuid) return null;

  return {
    provider: (provider ?? 'binance') as ExchangeInUser['provider'],
    name: provider ?? 'Exchange',
    key: '',
    secret: '',
    uuid: uuid ?? '',
  };
};

// ---------------------------------------------------------------------------
// Inner component – renders the form sections after the providers are mounted
// ---------------------------------------------------------------------------

interface ReadOnlyBotFormInnerProps {
  bot: DCABot | ComboBot | GridBot;
  botType: BotTypesEnum;
  showNavigation: boolean;
  className?: string;
  onEditClick?: () => void;
}

const ReadOnlyBotFormInner: React.FC<ReadOnlyBotFormInnerProps> = ({
  bot,
  botType,
  showNavigation,
  className,
  onEditClick,
}) => {
  const isGridBot = botType === BotTypesEnum.grid;
  const isComboBot = botType === BotTypesEnum.combo;

  // Grid bots must seed through the grid-specific mapper (same as the
  // editable BotForm) so percent fields like gridStep / sellDisplacement are
  // converted from their stored decimal to a percentage. The default DCA
  // mapper copies them verbatim, which showed e.g. 0.01 instead of 1%.
  const gridMapper = useMemo<BotSettingsMapper | undefined>(() => {
    if (!isGridBot) {
      return undefined;
    }
    return (_botType, settings, context) => {
      const mapperOptions: Parameters<typeof mapGridBotSettingsToFormData>[1] = {
        bot:
          (context.bot as {
            exchange?: string;
            exchangeUUID?: string;
            settings?: Record<string, unknown>;
          }) || null,
      };
      if (context.debug !== undefined) {
        mapperOptions.debug = context.debug;
      }
      return mapGridBotSettingsToFormData(settings, mapperOptions);
    };
  }, [isGridBot]);

  useBotFormInitialization({
    botType,
    mode: 'edit',
    bot,
    botSettings: (bot as { settings?: unknown }).settings,
    ...(gridMapper ? { mapper: gridMapper } : {}),
  });

  const {
    activeTab,
    setActiveTab,
    formData,
    updateFormData,
    errors,
    isFieldLocked,
    features,
    isLoading,
  } = useBotFormState();

  // ---------------------------------------------------------------------------
  // Tab descriptors  (webhook hidden – requires bot id + network)
  // ---------------------------------------------------------------------------
  const HIDDEN_SECTIONS = useMemo(() => new Set(['webhook']), []);

  const tabDescriptors = useMemo<BotFormTabDescriptor[]>(() => {
    const descriptors = isGridBot ? gridTabDescriptors : dcaTabDescriptors;
    return descriptors.filter(
      (d) => (isGridBot ? true : d.isDca) && !HIDDEN_SECTIONS.has(d.id)
    );
  }, [isGridBot, HIDDEN_SECTIONS]);

  const sectionToggleMap: Record<string, string> = useMemo(
    () => ({
      dca: 'useDca',
      'take-profit': isGridBot ? 'tpSl' : 'useTp',
      'stop-loss': isGridBot ? 'sl' : 'useSl',
      'risk-reward': 'useRiskReward',
      'bot-controller': 'useBotController',
      experimental: 'useExperimental',
    }),
    [isGridBot]
  );

  const visibleDescriptors = useMemo(() => {
    return tabDescriptors.filter((descriptor) => {
      if (!descriptor.featureFlag) return true;
      return features[descriptor.featureFlag] !== false;
    });
  }, [tabDescriptors, features]);

  const navigationTabs = useMemo<ScrollableTabItem[]>(() => {
    return visibleDescriptors
      .filter(({ id }) => {
        const toggleField = sectionToggleMap[id];
        if (!toggleField) return true;
        return Boolean(
          (
            (isComboBot
              ? formData.combo
              : isGridBot
                ? formData.grid
                : formData.dca) as Record<string, unknown>
          )[toggleField]
        );
      })
      .map(({ id, label, icon, description }) => ({
        id,
        label,
        icon,
        ...(description ? { description } : {}),
      }));
  }, [
    visibleDescriptors,
    formData.dca,
    formData.combo,
    formData.grid,
    sectionToggleMap,
    isComboBot,
    isGridBot,
  ]);

  // ---------------------------------------------------------------------------
  // Scroll tracking – find the real scroll container from the DOM and attach a
  // scroll listener to it (DetailDrawerBody has overflow-auto and is the actual
  // scrolling element; we don't own our own scroll container here).
  // ---------------------------------------------------------------------------
  const formRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isScrollingRef = useRef(false);

  /** Walk up the DOM to find the first scrollable ancestor. */
  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef.current) return scrollContainerRef.current;
    let el: HTMLElement | null = formRef.current?.parentElement ?? null;
    while (el && el !== document.documentElement) {
      const { overflow, overflowY } = window.getComputedStyle(el);
      if (
        ['auto', 'scroll'].includes(overflowY) ||
        ['auto', 'scroll'].includes(overflow)
      ) {
        scrollContainerRef.current = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  /** Update the active nav tab based on which section is nearest the top of the scroll container. */
  const updateActiveTab = useCallback(() => {
    if (isScrollingRef.current) return;
    const scrollContainer = findScrollContainer();
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    let closest: string | null = null;
    let minDist = Infinity;

    visibleDescriptors.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Only consider sections that are at least partially visible
      if (r.bottom <= containerRect.top || r.top >= containerRect.bottom)
        return;
      const dist = Math.abs(r.top - containerRect.top);
      if (dist < minDist) {
        minDist = dist;
        closest = id;
      }
    });

    if (closest && closest !== activeTab) {
      setActiveTab(closest as BotFormTabId);
    }
  }, [findScrollContainer, visibleDescriptors, activeTab, setActiveTab]);

  // Attach the scroll listener to the real scroll container after mount
  useEffect(() => {
    // Give the DOM a moment to settle before finding the scroll container
    const frameId = requestAnimationFrame(() => {
      const sc = findScrollContainer();
      if (!sc) return;
      updateActiveTab(); // Sync on mount
      sc.addEventListener('scroll', updateActiveTab, { passive: true });
    });
    return () => {
      cancelAnimationFrame(frameId);
      const sc = scrollContainerRef.current;
      if (sc) sc.removeEventListener('scroll', updateActiveTab);
    };
  }, [findScrollContainer, updateActiveTab]);

  const handleTabChangeWithScroll = useCallback(
    (tabId: string) => {
      setActiveTab(tabId as BotFormTabId);
      const el = sectionRefs.current[tabId];
      if (el) {
        isScrollingRef.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 800);
      }
    },
    [setActiveTab]
  );

  // Collapse state per section
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const isSectionCollapsed = useCallback(
    (id: string) => Boolean(collapsedSections[id]),
    [collapsedSections]
  );
  const toggleSectionCollapsed = useCallback((id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const currentExchange = useMemo(() => buildStubExchange(bot), [bot]);
  const exchangesData = useMemo(
    () => (currentExchange ? [currentExchange] : []),
    [currentExchange]
  );

  const baseComponentProps: BotFormTabComponentProps = {
    currentExchange,
    formData,
    updateFormData:
      updateFormData as BotFormTabComponentProps['updateFormData'],
    errors,
    mode: 'edit',
    isFieldLocked,
    getBalance: () => null,
    bot,
    exchangesData,
    exchangesLoading: false,
    activeTab,
    onTabChange: handleTabChangeWithScroll,
    features,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div ref={formRef} className={cn('relative', className)}>
      {/* Sticky nav – sits flush with the DrawerBody top (parent pulls content up by py-5/6) */}
      {showNavigation && (
        <div className="sticky top-2 z-30 mx-2 mb-3 rounded-lg bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between gap-xs">
            <div className="min-w-0 flex-1">
              <ScrollableFormTabNavigation
                tabs={navigationTabs}
                activeTab={activeTab}
                onTabChange={handleTabChangeWithScroll}
                className="w-full"
              />
            </div>

            {onEditClick && (
              <div className="shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={onEditClick}
                  title="Edit bot settings"
                  aria-label="Edit bot settings"
                  className="pointer-events-auto"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <fieldset
        disabled
        className="m-0 border-0 p-0 space-y-xl px-4 sm:px-6 pt-4 pb-20"
        aria-disabled="true"
      >
        {visibleDescriptors.map((descriptor) => {
          const SectionComponent = descriptor.Component;
          const toggleField = sectionToggleMap[
            descriptor.id
          ] as keyof BotFormData['dca'];
          const hasToggle = toggleField !== undefined;
          const toggleEnabled = hasToggle
            ? isComboBot
              ? Boolean(formData.combo[toggleField])
              : isGridBot
                ? Boolean(
                    formData.grid[
                      toggleField as unknown as keyof BotFormData['grid']
                    ]
                  )
                : Boolean(formData.dca[toggleField])
            : false;

          return (
            <div
              key={descriptor.id}
              ref={(el) => {
                sectionRefs.current[descriptor.id] = el;
              }}
              id={`ro-section-${descriptor.id}`}
              className="scroll-mt-16"
              data-form-readonly="true"
              data-section-id={descriptor.id}
            >
              {/* Section header */}
              <div className="mb-4 border-t-2 border-primary/60 pt-4 pb-3 bg-primary/10 rounded-lg px-4 -mx-2">
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <div className="flex items-start gap-sm">
                      <descriptor.icon className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-xs">
                          <h2 className="text-lg font-semibold leading-tight">
                            {descriptor.label}
                          </h2>
                          {(descriptor.tooltipText || descriptor.description) && (
                            <Tooltip
                              tooltip={descriptor.tooltipText ?? descriptor.description ?? ''}
                              {...(descriptor.tooltipUrl
                                ? { tooltipURL: descriptor.tooltipUrl }
                                : {})}
                            >
                              <InfoIcon />
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-xs self-start pt-0.5">
                    {(hasToggle ? toggleEnabled : true) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-expanded={!isSectionCollapsed(descriptor.id)}
                        onClick={() => toggleSectionCollapsed(descriptor.id)}
                        className="p-0 opacity-50"
                        title={
                          isSectionCollapsed(descriptor.id)
                            ? 'Expand section'
                            : 'Collapse section'
                        }
                      >
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isSectionCollapsed(descriptor.id)
                              ? 'rotate-0'
                              : 'rotate-180'
                          )}
                        />
                      </Button>
                    )}
                    {hasToggle && (
                      <Switch
                        checked={toggleEnabled}
                        disabled
                        id={`ro-toggle-${descriptor.id}`}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Section content */}
              {!isSectionCollapsed(descriptor.id) && (
                <SectionComponent {...baseComponentProps} />
              )}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Public component – wires up all required context providers
// ---------------------------------------------------------------------------

const ReadOnlyBotForm: React.FC<ReadOnlyBotFormProps> = ({
  bot,
  botType,
  className,
  showNavigation = true,
  onEditClick,
}) => {
  const resolvedExperience: BotExperienceDescriptor =
    tryGetBotExperience(botType) ?? getBotExperience(BotTypesEnum.dca);

  const registryContextValue = useMemo(
    () => ({
      botExperience: resolvedExperience,
      widgetId: 'drawer-readonly-bot-form',
    }),
    [resolvedExperience]
  );

  // Build a static BotFormQueryContextValue so that sections like
  // BasicSettings, StrategySettings, WebhookSettings etc. don't crash when
  // calling useBotFormQuery().
  const stubExchange = useMemo(() => buildStubExchange(bot), [bot]);

  const queryContextValue = useMemo<BotFormQueryContextValue>(() => {
    const botObj = bot as DCABot | GridBot | ComboBot;
    return {
      dcaBots: botType === BotTypesEnum.dca ? [botObj as DCABot] : [],
      gridBots: botType === BotTypesEnum.grid ? [botObj as GridBot] : [],
      comboBots: botType === BotTypesEnum.combo ? [botObj as ComboBot] : [],
      hedgeDcaBots: [] as HedgeBot[],
      hedgeComboBots: [] as HedgeBot[],
      bots: [botObj],
      botsLoading: false,
      bot: botObj,
      botSettings:
        ((botObj as { settings?: unknown })
          .settings as BotFormQueryContextValue['botSettings']) ?? null,
      botSettingsLoading: false,
      exchanges: stubExchange ? [stubExchange] : [],
      exchangesLoading: false,
      refetchExchanges: async () => {
        /* no-op */
      },
      mode: 'edit',
      botId: (botObj as { _id?: string })._id,
      currentExchange: stubExchange,
      balances: null,
      pairItems: [],
      pairMetadata: { bySelectionSymbol: {}, byPair: {} },
    };
  }, [bot, botType, stubExchange]);

  return (
    <TradingTerminalUtilsProvider>
      <BotFormRegistryContext.Provider value={registryContextValue}>
        <BotFormProvider
          mode="settings-readonly"
          defaultTab="basic"
          botType={botType}
        >
          <BotFormQueryContext.Provider value={queryContextValue}>
            <ReadOnlyBotFormInner
              bot={bot}
              botType={botType}
              showNavigation={showNavigation}
              className={className}
              onEditClick={onEditClick}
            />
          </BotFormQueryContext.Provider>
        </BotFormProvider>
      </BotFormRegistryContext.Provider>
    </TradingTerminalUtilsProvider>
  );
};

ReadOnlyBotForm.displayName = 'ReadOnlyBotForm';

export default ReadOnlyBotForm;
