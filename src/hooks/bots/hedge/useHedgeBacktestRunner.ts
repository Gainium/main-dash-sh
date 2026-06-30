/**
 * useHedgeBacktestRunner — drives a local hedge backtest run, persists
 * the result to both the server (stripped summary) and IndexedDB
 * (full payload), and exposes history/active-load helpers for the
 * results panel.
 *
 * Hedge backtests are local-only — the server-side `requestServerSideBacktest`
 * union has no hedge variant (see `core/src/types/index.ts:1067`), so
 * we always instantiate `HedgeBacktesting` from `@gainium/backtester`
 * in the browser and run there.
 *
 * Persistence mirrors legacy `dash/components/hedge/hooks/useHedgePage.ts:431`:
 *   1. ship a stripped `HedgeDCABacktestingResultShort` /
 *      `HedgeComboBacktestingResultShort` to the server via
 *      `saveHedgeDCABacktest` / `saveHedgeComboBacktest` (no deals,
 *      profits, portfolio, indicatorsEvents, buyAndHoldEquity)
 *   2. mirror the full JSON payload into IndexedDB via `saveHedge`,
 *      keyed by the server-returned `_id`, so the active viewer can
 *      reload all deals / charts / etc.
 *
 * The history list reads server summaries via `getHedgeBacktests`; the
 * active viewer fetches a full payload from IndexedDB via `getHedgeById`.
 */
import { GraphQLClient, GraphQlQuery, type ReturnResult } from '@/lib/api';
import { getLocalPrices } from '@/helper/price';
import HedgeBacktesting from '@/lib/backtester/hedgeWrapper';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  BotTypesEnum,
  ExchangeIntervals,
  type BacktestProgress,
  type BacktestingSettings,
  type ExchangeInUser,
  type HedgeBotSettings,
  type HedgeBacktestingResult,
  type HedgeComboBacktestingResultHistory,
  type HedgeComboBacktestingResultShort,
  type HedgeDCABacktestingResultHistory,
  type HedgeDCABacktestingResultShort,
  type StoreHedgeBacktest,
  type Symbols,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import {
  getHedgeById as getHedgeByIdLocal,
  saveHedge,
} from '@/utils/backtest/db';
import type {
  DCABacktestingInput,
  HedgeBacktestingInput,
} from '@gainium/backtester/dist/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface HedgeBacktestRunInput {
  /** Resolved configuration from the BacktestSettingsDialog. */
  timeframe: ExchangeIntervals;
  /** Epoch ms; defaults to a year ago when undefined. */
  from?: number;
  /** Epoch ms; defaults to "now" when undefined. */
  to?: number;
  slippagePercent?: number;
  userFee?: number | string;
  RFR?: string;
  MAR?: string;
  periodName?: string;
}

export interface HedgeBacktestSnapshot {
  /** Long leg form snapshot — read straight off the active form state. */
  longFormData: BotFormData;
  /** Long-leg exchange. Required (we run nothing without it). */
  longExchange: ExchangeInUser;
  /** Short leg form snapshot. */
  shortFormData: BotFormData;
  /** Short-leg exchange. */
  shortExchange: ExchangeInUser;
  /** Shared TP/SL etc. from `HedgeBotFormApi.sharedSettings`. */
  sharedSettings: HedgeBotSettings;
  /** Hedge bot type — hedgeDca runs DCA strategies, hedgeCombo combo. */
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
}

export type HedgeBacktestHistoryItem =
  | HedgeDCABacktestingResultHistory
  | HedgeComboBacktestingResultHistory;

/** Resolves `Symbols[]` for a single leg from formData + pairMetadata. */
const resolveLegSymbols = (
  formData: BotFormData,
  exchange: ExchangeInUser
): Symbols[] => {
  const pairs = Array.isArray(formData.pair)
    ? formData.pair
    : typeof formData.pair === 'string' && formData.pair.trim()
      ? [formData.pair]
      : [];

  return pairs.map((pair) => {
    const meta = formData.pairMetadata?.[pair];
    const base =
      meta?.baseAsset?.name ?? pair.slice(0, Math.floor(pair.length / 2));
    const quote =
      meta?.quoteAsset?.name ?? pair.slice(Math.floor(pair.length / 2));
    return {
      pair,
      baseAsset: {
        name: base,
        minAmount: meta?.baseAsset?.minAmount,
        maxAmount: meta?.baseAsset?.maxAmount,
        step: meta?.baseAsset?.step,
      },
      quoteAsset: {
        name: quote,
        minAmount: meta?.quoteAsset?.minAmount,
      },
      exchange: exchange.provider,
      maxOrders: 200,
      priceAssetPrecision: meta?.priceAssetPrecision ?? 8,
    } as Symbols;
  });
};

/** Strips the heavy per-leg fields the server doesn't need. Mirrors
 * legacy's `_longResult` / `_shortResult` construction. */
const stripLegResultForServer = <
  T extends HedgeBacktestingResult['longResult'],
>(
  src: T
): Omit<
  T,
  'deals' | 'profits' | 'indicatorsEvents' | 'buyAndHoldEquity' | 'portfolio'
> => {
  const copy = { ...src } as Partial<T>;
  delete copy.deals;
  delete copy.profits;
  delete copy.indicatorsEvents;
  delete copy.buyAndHoldEquity;
  delete copy.portfolio;
  return copy as Omit<
    T,
    'deals' | 'profits' | 'indicatorsEvents' | 'buyAndHoldEquity' | 'portfolio'
  >;
};

export interface UseHedgeBacktestRunnerOptions {
  /** Lazy snapshot builder. Called at `run()` time so we always read the
   *  latest leg form data — ref mutations don't re-render the parent,
   *  so a captured snapshot would be stale in Quick mode where the
   *  user types directly into the leg without switching tabs. Returns
   *  null if either leg isn't configured yet. */
  getSnapshot: () => HedgeBacktestSnapshot | null;
  /** Bot variant — picks the matching history query
   *  (`getHedgeDCABacktests` vs `getHedgeComboBacktests`). Fixed per
   *  page (the layout always knows which variant it's editing). */
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
}

export interface UseHedgeBacktestRunnerApi {
  /** Which hedge variant this runner is bound to — lets the list view
   *  pick the right "save permanently" mutation. */
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
  running: boolean;
  progress: BacktestProgress | null;
  /** In-memory result from the most recent run; clears on next run. */
  result: HedgeBacktestingResult | null;
  /** Server `_id` of the most recent save, if persistence succeeded. */
  resultId: string | null;
  /** Synthetic history-item shape built from the snapshot after a
   *  successful local run. Lets the active viewer render long/short
   *  symbol + settings (for the profit-currency label) before the
   *  server history refresh has a row for the new entry. */
  lastRunMeta: HedgeBacktestHistoryItem | null;
  error: string | null;
  history: HedgeBacktestHistoryItem[];
  historyLoading: boolean;
  /** Trigger a new local run; resolves when run+save are both done. */
  run: (input: HedgeBacktestRunInput) => Promise<void>;
  /** Cancel an in-flight run. Safe to call when idle. */
  cancel: () => void;
  /** Re-fetch the server history list. */
  refreshHistory: () => Promise<void>;
  /** Flip a history row's `savePermanent` flag in place (after the
   *  server mutation persists), avoiding a full `refreshHistory` reload. */
  patchHistorySavePermanent: (id: string, savePermanent: boolean) => void;
  /** Load the full local payload for an existing entry by `_id`. */
  loadById: (id: string) => Promise<HedgeBacktestingResult | null>;
  /** Delete an entry server-side (and via DB cascade locally). */
  deleteById: (id: string) => Promise<boolean>;
}

const DEFAULT_FROM_MS = 365 * 24 * 60 * 60 * 1000;

export function useHedgeBacktestRunner({
  getSnapshot,
  hedgeBotType,
}: UseHedgeBacktestRunnerOptions): UseHedgeBacktestRunnerApi {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [result, setResult] = useState<HedgeBacktestingResult | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [lastRunMeta, setLastRunMeta] =
    useState<HedgeBacktestHistoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HedgeBacktestHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const instanceRef = useRef<HedgeBacktesting | null>(null);
  const cancelledRef = useRef(false);

  // ------------------------------- history -----------------------------
  const buildGraphqlClient = useCallback((): GraphQLClient | null => {
    const { tokens } = useAuthStore.getState();
    const { isLiveTrading } = useUIStore.getState();
    if (!tokens?.accessToken) return null;
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    return new GraphQLClient(endpoint, tokens.accessToken, !isLiveTrading);
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const client = buildGraphqlClient();
      if (!client) {
        setHistory([]);
        return;
      }
      // Cloud exposes separate history endpoints per hedge variant —
      // `getHedgeDCABacktests` vs `getHedgeComboBacktests`. Pick the
      // one matching this page's bot type.
      const isCombo = hedgeBotType === BotTypesEnum.hedgeCombo;
      const builder = isCombo
        ? GraphQlQuery.getHedgeComboBacktests()
        : GraphQlQuery.getHedgeDCABacktests();
      const responseKey = isCombo
        ? 'getHedgeComboBacktests'
        : 'getHedgeDCABacktests';
      const res = await client.request<
        Record<string, ReturnResult<HedgeBacktestHistoryItem[]>>
      >(builder.query, builder.variables);
      const result = res[responseKey];
      if (result?.status === 'OK') {
        setHistory(result.data ?? []);
      } else {
        logger.warn('[useHedgeBacktestRunner] history fetch failed', {
          reason: result?.reason,
        });
      }
    } catch (err) {
      logger.error('[useHedgeBacktestRunner] history error', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [buildGraphqlClient, hedgeBotType]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const loadById = useCallback(
    async (id: string): Promise<HedgeBacktestingResult | null> => {
      try {
        const entry = await getHedgeByIdLocal(id, true);
        if (!entry?.data) return null;
        const parsed = JSON.parse(entry.data) as HedgeBacktestingResult & {
          config?: BacktestingSettings;
        };
        setResult(parsed);
        setResultId(id);
        return parsed;
      } catch (err) {
        logger.error('[useHedgeBacktestRunner] loadById failed', err);
        return null;
      }
    },
    []
  );

  const deleteById = useCallback(
    async (id: string): Promise<boolean> => {
      const client = buildGraphqlClient();
      if (!client) {
        toast.error('Authentication required to delete.');
        return false;
      }
      try {
        const { query, variables } = GraphQlQuery.deleteBacktests({
          ids: [id],
        });
        const res = await client.request<{
          deleteBacktests: ReturnResult<unknown>;
        }>(query, variables);
        if (res.deleteBacktests.status !== 'OK') {
          toast.error(
            `Failed to delete: ${res.deleteBacktests.reason ?? 'Unknown error'}`
          );
          return false;
        }
        // Local DB entry can stay; it's an orphan but harmless. Next
        // `getHedgeAll` consumer can filter against the refreshed
        // server list if needed.
        await refreshHistory();
        return true;
      } catch (err) {
        logger.error('[useHedgeBacktestRunner] delete failed', err);
        return false;
      }
    },
    [buildGraphqlClient, refreshHistory]
  );

  // ---------------------------------- run -----------------------------
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    instanceRef.current?.stopBacktest();
    instanceRef.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

  const patchHistorySavePermanent = useCallback(
    (id: string, savePermanent: boolean) => {
      setHistory((prev) =>
        prev.map((h) => (h._id === id ? { ...h, savePermanent } : h))
      );
    },
    []
  );

  const run = useCallback(
    async (input: HedgeBacktestRunInput): Promise<void> => {
      const snapshot = getSnapshot();
      if (!snapshot) {
        toast.error('Pick a pair on both legs before backtesting.');
        return;
      }
      const { user } = useAuthStore.getState();
      if (!user?.id) {
        toast.error('Sign in to run a backtest.');
        return;
      }

      const {
        longFormData,
        shortFormData,
        longExchange,
        shortExchange,
        sharedSettings,
        hedgeBotType,
      } = snapshot;
      const combo = hedgeBotType === BotTypesEnum.hedgeCombo;

      const longSymbols = resolveLegSymbols(longFormData, longExchange);
      const shortSymbols = resolveLegSymbols(shortFormData, shortExchange);
      if (longSymbols.length === 0 || shortSymbols.length === 0) {
        toast.error('Pick a pair on both legs before backtesting.');
        return;
      }

      const from =
        input.from && Number.isFinite(input.from)
          ? input.from
          : Date.now() - DEFAULT_FROM_MS;
      const to = input.to && Number.isFinite(input.to) ? input.to : Date.now();
      const interval = input.timeframe ?? ExchangeIntervals.oneH;
      const slippage = input.slippagePercent ?? 0;
      const fee = Number(input.userFee ?? 0);

      const config: BacktestingSettings = {
        userFee: `${fee}`,
        slippage: `${slippage}`,
        RFR: input.RFR ?? '2',
        MAR: input.MAR ?? '7',
        firstDataTime: from,
        lastDataTime: to,
      };

      const buildLegSettings = (data: BotFormData) => ({
        ...data.dca,
        name: data.name,
        pair: Array.isArray(data.pair) ? data.pair : [data.pair].flat(),
      });

      // The backtester package ships its own ExchangeEnum / Symbols /
      // DCABotSettings that diverge slightly from core's mirrors (extra
      // `ManualBacktesting` value, looser fields). The runtime values
      // pass through unchanged, so cast at the construction boundary
      // — same pattern as the DCA local-backtest path in
      // `BotForm/index.tsx`.
      const longBacktesterSettings = {
        exchange: longExchange.provider,
        symbols: longSymbols,
        settings: buildLegSettings(longFormData),
        userFee: fee,
        // The backtester needs latest prices to compute `unrealizedPnL`
        // on positions still open at the end of the test (it looks up
        // `this.prices.find(p => p.symbol === pair)` and skips the
        // open-PnL block when missing — see backtester/src/dca/
        // strategy/main.ts:6088). Empty array → "Open P&L" reads 0.
        prices: getLocalPrices(),
        balances: [],
        interval,
        from,
        to,
        slippage,
        combo,
        multi: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      } as unknown as DCABacktestingInput;

      const shortBacktesterSettings = {
        exchange: shortExchange.provider,
        symbols: shortSymbols,
        settings: buildLegSettings(shortFormData),
        userFee: fee,
        // The backtester needs latest prices to compute `unrealizedPnL`
        // on positions still open at the end of the test (it looks up
        // `this.prices.find(p => p.symbol === pair)` and skips the
        // open-PnL block when missing — see backtester/src/dca/
        // strategy/main.ts:6088). Empty array → "Open P&L" reads 0.
        prices: getLocalPrices(),
        balances: [],
        interval,
        from,
        to,
        slippage,
        combo,
        multi: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      } as unknown as DCABacktestingInput;

      const settingsInput: HedgeBacktestingInput = {
        longSettings: longBacktesterSettings,
        shortSettings: shortBacktesterSettings,
        sharedSettings,
      };

      cancelledRef.current = false;
      setError(null);
      setResult(null);
      setResultId(null);
      setLastRunMeta(null);
      setRunning(true);
      setProgress({ step: 0, progress: 0, text: 'Preparing…' });

      try {
        const instance = new HedgeBacktesting(
          settingsInput,
          (progressValue, text, step) =>
            setProgress({
              step: step ?? 0,
              progress: progressValue,
              text: text ?? '',
            }),
          (msg) => {
            toast.error(`Backtest error: ${msg}`);
            instance.stopBacktest();
          }
        );
        instanceRef.current = instance;

        // The package's `HedgeBacktestingResult` has slightly looser
        // `Profit` typings than core's local mirror — they're
        // structurally compatible for everything consumers read, so
        // cast once at the boundary instead of threading two near-
        // identical types through the rest of the file.
        const testResult = (await instance.test(undefined, (p, text) =>
          setProgress({ step: 1, progress: p, text: text ?? '' })
        )) as unknown as HedgeBacktestingResult | undefined;
        if (cancelledRef.current || !testResult) {
          return;
        }

        setResult(testResult);

        // ─── Build the server payload (stripped) ───
        const longSymbol = longSymbols[0];
        const shortSymbol = shortSymbols[0];
        const buildSideConfig = (
          legData: BotFormData,
          exchange: ExchangeInUser,
          symbol: Symbols,
          duration: HedgeBacktestingResult['longResult']['duration']
        ) => {
          // Use the same create-bot payload mapper the real save flow
          // uses — server's `saveHedge*Backtest` expects `settings` to
          // match `createDCABotInput` / `createComboBotInput`. Sending
          // the raw `formData.dca` (our previous approach) drops
          // required fields and trips schema validation, so the save
          // silently fails. Mode 'create' so the mapper produces the
          // create-style payload.
          const mapping = mapFormDataToPayload(
            legData,
            { mode: 'create' },
            null,
            exchange
          );
          const createPayload = mapping.createPayload ?? null;
          if (!createPayload) {
            const reason = mapping.errors?.join('; ') ?? 'unknown';
            throw new Error(`Failed to map leg settings: ${reason}`);
          }
          // Both hedge variants validate each leg's `settings` as
          // `createComboBotInput` server-side (see HedgeBotEditLayout's
          // create path). The DCA mapper only drops `importFrom` when
          // `formData.type === combo`; hedge legs always carry `type:
          // 'dca'` so the field survives and the mutation 400s. Strip
          // it here regardless of variant for parity with the live save.
          const settings = { ...createPayload } as Record<string, unknown>;
          delete settings['importFrom'];
          return {
            symbol: symbol.pair,
            baseAsset: symbol.baseAsset.name,
            quoteAsset: symbol.quoteAsset.name,
            exchange: exchange.provider,
            exchangeUUID: exchange.uuid,
            settings,
            duration: {
              ...duration,
              ...(input.periodName ? { periodName: input.periodName } : {}),
            },
          };
        };

        const baseSavePayload = {
          hedgeResult: testResult.hedgeResult,
          longResult: stripLegResultForServer(testResult.longResult),
          shortResult: stripLegResultForServer(testResult.shortResult),
          userId: String(user.id),
          time: Date.now(),
          savePermanent: false,
          config,
        };

        const savePayload = combo
          ? ({
              ...baseSavePayload,
              long: buildSideConfig(
                longFormData,
                longExchange,
                longSymbol,
                testResult.longResult.duration
              ),
              short: buildSideConfig(
                shortFormData,
                shortExchange,
                shortSymbol,
                testResult.shortResult.duration
              ),
            } as HedgeComboBacktestingResultShort)
          : ({
              ...baseSavePayload,
              long: buildSideConfig(
                longFormData,
                longExchange,
                longSymbol,
                testResult.longResult.duration
              ),
              short: buildSideConfig(
                shortFormData,
                shortExchange,
                shortSymbol,
                testResult.shortResult.duration
              ),
            } as HedgeDCABacktestingResultShort);

        // ─── Save to server ───
        let serverId: string | null = null;
        const client = buildGraphqlClient();
        if (client) {
          try {
            const builder = combo
              ? GraphQlQuery.saveHedgeComboBacktest(
                  savePayload as HedgeComboBacktestingResultShort
                )
              : GraphQlQuery.saveHedgeDCABacktest(
                  savePayload as HedgeDCABacktestingResultShort
                );
            const res = await client.request<
              | { saveHedgeComboBacktest: ReturnResult<string> }
              | { saveHedgeDCABacktest: ReturnResult<string> }
            >(builder.query, builder.variables);
            const mutationResult = combo
              ? (res as { saveHedgeComboBacktest: ReturnResult<string> })
                  .saveHedgeComboBacktest
              : (res as { saveHedgeDCABacktest: ReturnResult<string> })
                  .saveHedgeDCABacktest;
            if (mutationResult.status === 'OK') {
              serverId = mutationResult.data ?? null;
            } else {
              toast.error(
                `Save failed: ${mutationResult.reason ?? 'Unknown error'}`
              );
            }
          } catch (err) {
            logger.error('[useHedgeBacktestRunner] server save error', err);
            toast.error(
              `Save to server failed: ${err instanceof Error ? err.message : 'network error'}`
            );
          }
        }

        // ─── Save full payload locally ───
        const localId =
          serverId ??
          `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const serialized = JSON.stringify({ ...testResult, config });
        const entry: StoreHedgeBacktest = {
          data: serialized,
          size: new Blob([serialized]).size,
          id: localId,
          long: {
            exchange: longExchange.provider,
            baseAsset: longSymbol.baseAsset.name,
            quoteAsset: longSymbol.quoteAsset.name,
            symbol: longSymbol.pair,
          },
          short: {
            exchange: shortExchange.provider,
            baseAsset: shortSymbol.baseAsset.name,
            quoteAsset: shortSymbol.quoteAsset.name,
            symbol: shortSymbol.pair,
          },
          type: combo ? 'Combo' : 'DCA',
        };
        await saveHedge(entry);
        setResultId(localId);

        // Synthesize a history-item shape from the save payload so the
        // active viewer (which keys profit-currency labels off
        // `meta.long.settings.futures` etc.) has the leg metadata
        // before `refreshHistory` lands a server-confirmed row.
        setLastRunMeta({
          ...(savePayload as HedgeDCABacktestingResultShort),
          _id: localId,
        } as HedgeBacktestHistoryItem);

        toast.success('Hedge backtest finished.');
        await refreshHistory();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[useHedgeBacktestRunner] run failed', { message });
        setError(message);
        toast.error(`Backtest failed: ${message}`);
      } finally {
        instanceRef.current = null;
        setRunning(false);
        setProgress(null);
      }
    },
    [getSnapshot, buildGraphqlClient, refreshHistory]
  );

  return useMemo<UseHedgeBacktestRunnerApi>(
    () => ({
      hedgeBotType,
      running,
      progress,
      result,
      resultId,
      lastRunMeta,
      error,
      history,
      historyLoading,
      run,
      cancel,
      refreshHistory,
      patchHistorySavePermanent,
      loadById,
      deleteById,
    }),
    [
      hedgeBotType,
      running,
      progress,
      result,
      resultId,
      lastRunMeta,
      error,
      history,
      historyLoading,
      run,
      cancel,
      refreshHistory,
      patchHistorySavePermanent,
      loadById,
      deleteById,
    ]
  );
}
