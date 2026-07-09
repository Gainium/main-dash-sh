/* eslint-disable react-refresh/only-export-components */
/**
 * HedgeBotFormProvider — outer context for the hedge bot edit/new pages.
 *
 * A hedge bot is two regular DCA/Combo bots (long + short) edited together
 * with a small "shared settings" object on top. We follow Model A from the
 * port plan: this provider holds the shared-settings slice and the load
 * flow, then the page mounts TWO independent `BotFormProvider` trees (one
 * per leg) inside, each seeded with its half of the loaded data. Form
 * sections are unaware of hedge — they continue reading from the nearest
 * `BotFormProvider`, which is now leg-scoped.
 *
 * In edit mode this provider:
 *  1. Fetches the hedge bot via getHedgeDCABot / getHedgeComboBot.
 *  2. Splits `bots[]` into long + short by `settings.strategy`.
 *  3. Maps each via `mapBotSettingsToFormData` so each leg's
 *     `BotFormProvider` can be initialized with realistic settings.
 *  4. Pulls `sharedSettings` from the response into local state.
 *
 * Save flow (gather both legs + sharedSettings → call createHedge*Bot /
 * changeHedge*Bot) lands in B.2.3 — not yet here.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { useHedgeComboBotsStore } from '@/stores/live/hedgeComboBotsStore';
import { useHedgeDcaBotsStore } from '@/stores/live/hedgeDcaBotsStore';
import {
  BotTypesEnum,
  CloseConditionEnum,
  ComboTpBase,
  StrategyEnum,
  type ComboBot,
  type DCABot,
  type HedgeBot,
  type HedgeBotSettings,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

export type HedgeBotFormMode = 'create' | 'edit';

export type HedgeBotType = BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;

export type HedgeLeg = 'long' | 'short';

export const SHARED_SETTINGS_DEFAULTS: HedgeBotSettings = {
  useTp: false,
  tpPerc: '0',
  useSl: false,
  slPerc: '0',
  comboTpBase: ComboTpBase.full,
  comboTpLimit: false,
  comboSlLimit: false,
  dealCloseCondition: CloseConditionEnum.tp,
  // CloseConditionEnum has no dedicated SL value; legacy uses the same tp
  // option as the default for both close conditions until the user picks
  // techInd / manual / webhook etc.
  dealCloseConditionSL: CloseConditionEnum.tp,
};

export interface HedgeBotFormApi {
  mode: HedgeBotFormMode;
  botType: HedgeBotType;
  /** Hedge bot id (edit mode). For create mode this is undefined. */
  botId: string | undefined;
  /** The leg type each underlying BotFormProvider should be initialized
   *  with — derives from `botType`. hedgeDca → dca legs; hedgeCombo →
   *  combo legs. */
  legBotType: BotTypesEnum.dca | BotTypesEnum.combo;
  sharedSettings: HedgeBotSettings;
  setSharedSettings: (next: HedgeBotSettings) => void;
  updateSharedSetting: <K extends keyof HedgeBotSettings>(
    key: K,
    value: HedgeBotSettings[K]
  ) => void;

  /** Shared bot name for the hedge. Both legs are saved under this single
   *  name (the backend imposes no long/short naming rule; legs are already
   *  distinguished by `strategy`). Lives on the outer provider so it
   *  survives every leg remount, tab switch, and Quick↔Manual toggle. It
   *  is deliberately NOT part of `sharedSettings` — that object mirrors the
   *  backend `sharedSettings` contract, which has no `name`. */
  hedgeName: string;
  setHedgeName: (next: string) => void;

  /** The long leg's currently-selected pair, published ONLY by the long
   *  leg (Manual: HedgeLegActiveChartPublisher when leg === 'long'; Quick:
   *  QuickLegChartPublisher, which is long-only). The auto-name hook reads
   *  this so the hedge is named after the long pair regardless of which leg
   *  tab is active — `activeLegPair` flips to the short pair on the short
   *  tab and can't be used for naming. */
  longLegPair: string | null;
  setLongLegPair: (pair: string | null) => void;

  /** Active leg's currently-selected pair (e.g. "BTCUSDT"), lifted from
   *  whichever leg is mounted. The chart panel reads this to render the
   *  active leg's market. Each leg owns its own pair — they aren't kept
   *  in sync, so switching the leg tab also flips the chart. */
  activeLegPair: string | null;
  setActiveLegPair: (pair: string | null) => void;

  /** Active leg's currently-selected exchange UUID, mirrored from the
   *  mounted leg's BotFormProvider via a publisher. Used by the chart
   *  panel to resolve the exchange provider for symbol filtering. */
  activeLegExchangeUUID: string | null;
  setActiveLegExchangeUUID: (uuid: string | null) => void;

  /** Active leg's persisted bot `_id` (edit mode), pushed from the layout
   *  — which alone knows the active tab and each leg's loaded bot record.
   *  The chart panel passes this as `data.botId` so `BotChart` subscribes
   *  to the Risk:Reward position the leg's `RiskRewardSettings` writes
   *  keyed on that same id. Undefined in create mode, where both the RR
   *  writer and the chart fall back to the global key. */
  activeLegBotId: string | undefined;
  setActiveLegBotId: (id: string | undefined) => void;

  /** Ref the active leg's publisher fills with a writer that updates the
   *  leg's `formData.pair`. The chart panel calls this when the user picks
   *  a new symbol via the TradingView widget so the change lands on the
   *  active leg only — the other leg's pair is unaffected. */
  chartSymbolWriterRef: MutableRefObject<((pair: string) => void) | null>;

  /** Loaded hedge bot (edit mode), once the query returns successfully.
   *  Null while loading or in create mode. */
  hedgeBot: HedgeBot | null;
  /** Initial form data for each leg, mapped from the loaded hedge bot.
   *  In edit mode these become defined once the load completes; in create
   *  mode they stay undefined and each leg falls back to catalog defaults. */
  longInitialFormData: Partial<BotFormData> | undefined;
  shortInitialFormData: Partial<BotFormData> | undefined;
  /** True while we're fetching the hedge bot (edit mode). Layouts use this
   *  to defer mounting the leg BotFormProviders until the seed is ready,
   *  since BotFormProvider only reads its initial state once on mount. */
  isLoadingHedgeBot: boolean;
  loadError: Error | null;
  /** Refetch the hedge bot from the server. Call after a successful
   *  hedge save so the per-leg `initialBot` references update and the
   *  forms re-initialize from the latest persisted state. */
  refetchHedgeBot: () => void;
}

const HedgeBotFormContext = createContext<HedgeBotFormApi | undefined>(
  undefined
);

interface HedgeBotFormProviderProps {
  mode: HedgeBotFormMode;
  botType: HedgeBotType;
  botId?: string;
  initialSharedSettings?: Partial<HedgeBotSettings>;
  children: ReactNode;
}

const findLegBot = <T extends DCABot | ComboBot>(
  bots: T[] | undefined,
  strategy: StrategyEnum
): T | undefined =>
  bots?.find((b) => b.settings?.strategy === strategy);

export const HedgeBotFormProvider: React.FC<HedgeBotFormProviderProps> = ({
  mode,
  botType,
  botId,
  initialSharedSettings,
  children,
}) => {
  const [sharedSettings, setSharedSettings] = useState<HedgeBotSettings>(
    () => ({
      ...SHARED_SETTINGS_DEFAULTS,
      ...initialSharedSettings,
    })
  );
  const [hedgeName, setHedgeName] = useState<string>('');
  const [longLegPair, setLongLegPair] = useState<string | null>(null);
  const [activeLegPair, setActiveLegPair] = useState<string | null>(null);
  const [activeLegExchangeUUID, setActiveLegExchangeUUID] = useState<
    string | null
  >(null);
  const [activeLegBotId, setActiveLegBotId] = useState<string | undefined>(
    undefined
  );
  const chartSymbolWriterRef = useRef<((pair: string) => void) | null>(null);
  // Tracks the load we've already seeded `hedgeName` from, so a post-save
  // refetch (same hedge id, new leg data) doesn't clobber the user's
  // confirmed name. Keyed on the loaded hedge id (or botId for clone).
  const seededNameForRef = useRef<string | null>(null);

  const legBotType: BotTypesEnum.dca | BotTypesEnum.combo =
    botType === BotTypesEnum.hedgeCombo
      ? BotTypesEnum.combo
      : BotTypesEnum.dca;

  // Edit-mode load: fetch the hedge bot once. botId is required.
  // Create mode also fetches when a botId is present — that's the
  // "create from template" / clone flow (`/hedge/bot/new?load=<id>`):
  // we load the source hedge bot, seed both legs from its settings, and
  // rename the legs with a "(copy)" suffix below. Save then goes through
  // the create mutation as a brand-new hedge bot.
  const shouldFetchHedgeBot = Boolean(botId);
  const isCloneFromTemplate = mode === 'create' && Boolean(botId);

  const queryKey =
    botType === BotTypesEnum.hedgeCombo
      ? ('getHedgeComboBot' as const)
      : ('getHedgeDCABot' as const);

  const queryFactory =
    botType === BotTypesEnum.hedgeCombo
      ? botQueries.getHedgeComboBot
      : botQueries.getHedgeDCABot;

  const fetchInput = useMemo(
    () => (botId ? { id: botId } : { id: '' }),
    [botId]
  );

  const queryResult = useGraphQL<HedgeBot>(
    queryKey,
    queryFactory(fetchInput),
    { enabled: shouldFetchHedgeBot }
  );

  // Once the query lands, push the bot into the live store so that
  // (a) the bot list page sees it and (b) WebSocket-driven updates land
  // in the same place. Without this, a freshly created hedge bot only
  // shows up after the list page does its own fetch.
  //
  // Skip the push when this is a clone-from-template flow: the source
  // bot already lives in the store (the user clicked Clone from the list),
  // and we don't want any of the about-to-be-renamed "(copy)" state we
  // map from the fetched bot to leak back into the original's store entry.
  useEffect(() => {
    if (isCloneFromTemplate) return;
    if (
      shouldFetchHedgeBot &&
      queryResult.data?.status === 'OK' &&
      queryResult.data.data
    ) {
      const bot = queryResult.data.data as HedgeBot;
      const store =
        botType === BotTypesEnum.hedgeCombo
          ? useHedgeComboBotsStore.getState()
          : useHedgeDcaBotsStore.getState();
      store.updateBot(bot);
    }
  }, [shouldFetchHedgeBot, queryResult.data, botType, isCloneFromTemplate]);

  // Read the hedge bot from the live store when available — that way
  // WebSocket updates (status, profit, balances, …) flow into the form
  // without needing a manual refetch. Falls back to the query result
  // until the store has it.
  const hedgeBotFromStore = useHedgeDcaBotsStore((state) =>
    botType === BotTypesEnum.hedgeDca && botId ? state.bots[botId] : undefined
  );
  const hedgeComboFromStore = useHedgeComboBotsStore((state) =>
    botType === BotTypesEnum.hedgeCombo && botId
      ? state.bots[botId]
      : undefined
  );
  const fromQuery: HedgeBot | null =
    queryResult.data?.status === 'OK' && queryResult.data.data
      ? queryResult.data.data
      : null;
  const fromStore = hedgeBotFromStore ?? hedgeComboFromStore ?? null;
  const hedgeBot: HedgeBot | null = fromStore ?? fromQuery;
  const isLoadingHedgeBot = shouldFetchHedgeBot && queryResult.isLoading;
  const loadError = queryResult.error ?? null;

  // Pull sharedSettings out of the loaded hedge bot once.
  useEffect(() => {
    if (hedgeBot?.sharedSettings) {
      setSharedSettings({
        ...SHARED_SETTINGS_DEFAULTS,
        ...hedgeBot.sharedSettings,
      });
    }
  }, [hedgeBot?.sharedSettings]);

  // Seeding from the loaded bot is now the per-leg formData's job — each
  // leg's name / pair / exchange come straight off its own BotFormData and
  // are never copied between legs. The chart's pair / exchange come from
  // whichever leg is mounted via the active-leg publisher in the layout.

  // Map each leg's loaded bot into BotFormData. Memoize on identity so the
  // resulting initialFormData object is stable for BotFormProvider mount.
  // In clone-from-template mode (`mode === 'create'` with a `botId`),
  // append " (copy)" to each leg's name so the user gets the legacy
  // duplicate-from-list UX.
  const longInitialFormData = useMemo<Partial<BotFormData> | undefined>(() => {
    const longBot = findLegBot(hedgeBot?.bots, StrategyEnum.long);
    if (!longBot) return undefined;
    try {
      const { formData } = mapBotSettingsToFormData(legBotType, longBot, {
        bot: longBot as DCABot,
      });
      if (isCloneFromTemplate && formData) {
        const base = formData.name?.trim();
        return { ...formData, name: base ? `${base} (copy)` : 'Hedge bot (copy)' };
      }
      return formData;
    } catch (err) {
      logger.error('[HedgeBotFormProvider] Failed to map long leg', err);
      return undefined;
    }
  }, [hedgeBot?.bots, legBotType, isCloneFromTemplate]);

  const shortInitialFormData = useMemo<Partial<BotFormData> | undefined>(() => {
    const shortBot = findLegBot(hedgeBot?.bots, StrategyEnum.short);
    if (!shortBot) return undefined;
    try {
      const { formData } = mapBotSettingsToFormData(legBotType, shortBot, {
        bot: shortBot as DCABot,
      });
      if (isCloneFromTemplate && formData) {
        const base = formData.name?.trim();
        return { ...formData, name: base ? `${base} (copy)` : 'Hedge bot (copy)' };
      }
      return formData;
    } catch (err) {
      logger.error('[HedgeBotFormProvider] Failed to map short leg', err);
      return undefined;
    }
  }, [hedgeBot?.bots, legBotType, isCloneFromTemplate]);

  // Seed the shared hedge name from the loaded legs (edit / clone). Both
  // longInitialFormData and shortInitialFormData carry the persisted `name`
  // (and the " (copy)" suffix in clone mode). Seed once per distinct load so
  // a post-save refetch — which keeps the same hedge id but re-maps the legs
  // — doesn't overwrite the name the user just confirmed. `useAutoHedgeName`
  // then protects further edits.
  useEffect(() => {
    const loadKey = hedgeBot?._id ?? (botId || null);
    if (!loadKey) return;
    if (seededNameForRef.current === loadKey) return;
    const seed = longInitialFormData?.name ?? shortInitialFormData?.name;
    // Legs not mapped yet — wait for the load to resolve.
    if (seed === undefined) return;
    seededNameForRef.current = loadKey;
    setHedgeName(seed ?? '');
  }, [
    hedgeBot?._id,
    botId,
    longInitialFormData?.name,
    shortInitialFormData?.name,
  ]);

  const refetchHedgeBot = useMemo(
    () => () => {
      void queryResult.refetch();
    },
    [queryResult]
  );

  const value = useMemo<HedgeBotFormApi>(
    () => ({
      mode,
      botType,
      botId,
      legBotType,
      sharedSettings,
      setSharedSettings,
      updateSharedSetting: (key, value) =>
        setSharedSettings((prev) => ({ ...prev, [key]: value })),
      hedgeName,
      setHedgeName,
      longLegPair,
      setLongLegPair,
      activeLegPair,
      setActiveLegPair,
      activeLegExchangeUUID,
      setActiveLegExchangeUUID,
      activeLegBotId,
      setActiveLegBotId,
      chartSymbolWriterRef,
      hedgeBot,
      longInitialFormData,
      shortInitialFormData,
      isLoadingHedgeBot,
      loadError,
      refetchHedgeBot,
    }),
    [
      mode,
      botType,
      botId,
      legBotType,
      sharedSettings,
      hedgeName,
      longLegPair,
      activeLegPair,
      activeLegExchangeUUID,
      activeLegBotId,
      hedgeBot,
      longInitialFormData,
      shortInitialFormData,
      isLoadingHedgeBot,
      loadError,
      refetchHedgeBot,
    ]
  );

  return (
    <HedgeBotFormContext.Provider value={value}>
      {children}
    </HedgeBotFormContext.Provider>
  );
};

export function useHedgeBotForm(): HedgeBotFormApi {
  const ctx = useContext(HedgeBotFormContext);
  if (!ctx) {
    throw new Error(
      'useHedgeBotForm must be used inside a HedgeBotFormProvider'
    );
  }
  return ctx;
}

/** Optional hook for components that may render outside a hedge context
 *  (e.g. shared sections that work for both regular and hedge bots). */
export function useHedgeBotFormOptional(): HedgeBotFormApi | undefined {
  return useContext(HedgeBotFormContext);
}
