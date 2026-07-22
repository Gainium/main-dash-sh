/* eslint-disable react-hooks/use-memo */
/**
 * One-shot reader for the `sessionStorage.botConfig` channel + URL hint
 * params used to pre-fill the new-bot form.
 *
 * Producers (curated-presets widget, BotCard "Copy to live", TradingBots,
 * NewBotWizard, BotDetailsDrawer) all stage a payload of this shape:
 *
 *   {
 *     name?, type?, exchange?, symbol?,
 *     settings?: DCABotSettings,
 *     curated?: { tier, strategy, backtest: { interval, from, to, windowDays } },
 *   }
 *
 * This hook:
 *   - reads + deletes the sessionStorage key on first mount (so a refresh
 *     doesn't reapply stale data)
 *   - reads URL hint params (?exchange=…&symbol=…&curated=1) as a fallback
 *     for the case where someone deep-linked without pre-staging
 *   - resolves the `exchange` provider string to the user's first
 *     matching connected exchange UUID via the exchanges store
 *   - filters DCABotSettings keys down to the form's `dca` slice shape
 *   - pushes any `curated.backtest` to `useBotFormPreloadStore` so the
 *     Backtest dialog can pre-arm itself on first open
 *
 * Returns `null` when nothing was staged (so the form falls back to
 * its normal "last-used config" seed).
 *
 * When a `?clone=<id>` URL param is present, this hook returns null —
 * the clone flow wins and we don't want to fight it.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { logger } from '@/lib/loggerInstance';
import {
  useCuratedPreloadHints,
  type CuratedPreloadHint,
} from '@/lib/curatedPreload';
import { useExchangesStore } from '@/stores/exchangesStore';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const SESSION_KEY = 'botConfig';

interface StagedBotConfig {
  name?: string;
  type?: string;
  exchange?: string;
  symbol?: string;
  settings?: Record<string, unknown>;
  curated?: CuratedPreloadHint;
}

export interface BotConfigPreload {
  /** Form seed to pass into `<BotFormProvider initialFormData={…}>`. */
  initialFormData: Partial<BotFormData>;
  /** Pre-resolved name (or undefined to let the form pick the default). */
  name?: string;
  /** Curated metadata (only present when staged by the curated-presets widget). */
  curated?: CuratedPreloadHint;
  /**
   * True while a staged/URL exchange provider still needs resolving but the
   * exchanges store hasn't loaded yet. Callers should hold the form seed
   * (via `isSeedPending`) until this clears so the resolved `exchangeUUID`
   * makes it into the one-shot form seed instead of being clobbered by the
   * exchange auto-picker. Clears to `false` once exchanges are ready — even
   * when the provider is not connected — so the form never hangs.
   */
  exchangePending?: boolean;
}

/**
 * Each bot-type slice in BotFormData is roughly `Omit<BotSettings, 'pair'
 * | 'name'>` — pair lives at the top of formData and name is set
 * separately. We filter out only that small blocklist and let the rest
 * pass through; the form provider's own defaults fill any missing keys.
 *
 * Combo settings are a superset of DCA settings (per the frontend's
 * Quick Setup model), grid settings have their own shape — but both
 * use the same {pair, name}-stripping convention.
 */
const SLICE_BLOCKLIST: ReadonlySet<string> = new Set(['pair', 'name']);

type AnySettings = Record<string, unknown>;

function toFormSlice<T>(settings: AnySettings | undefined): T | undefined {
  if (!settings) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (SLICE_BLOCKLIST.has(k)) continue;
    out[k] = v;
  }
  return out as T;
}

function readSession(): StagedBotConfig | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch (e) {
    logger.warn('[useBotConfigPreload] sessionStorage read failed', {
      err: (e as Error).message,
    });
    return null;
  }
  if (!raw) return null;
  // Clear it BEFORE parsing so a refresh after a bad payload doesn't loop.
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* best-effort */
  }
  try {
    return JSON.parse(raw) as StagedBotConfig;
  } catch (e) {
    logger.warn('[useBotConfigPreload] sessionStorage JSON parse failed', {
      err: (e as Error).message,
    });
    return null;
  }
}

export function useBotConfigPreload(): BotConfigPreload | null {
  const [search] = useSearchParams();
  // Subscribe to the exchanges DATA (not the stable `getExchangesByProvider`
  // selector — that function reference never changes when the store loads, so
  // a memo keyed off it would resolve the curated provider ONCE against an
  // empty store and never re-run). Keying resolution off `exchanges` + the
  // readiness flags makes provider→UUID resolution re-run the moment the
  // exchanges arrive.
  const exchanges = useExchangesStore((s) => s.exchanges);
  const hasHydrated = useExchangesStore((s) => s._hasHydrated);
  const initialLoaded = useExchangesStore((s) => s.initialLoaded);
  const exchangesError = useExchangesStore((s) => s.error);

  // Read sessionStorage at most ONCE per page mount. useMemo on a
  // stable empty-deps array is sufficient — the effect of removing the
  // key happens inline inside readSession on the first invocation.
  const staged = useMemo(readSession, []);

  // Hand the curated hint (if any) to the cloud-side adapter so it can
  // pre-arm Quick Backtest + the Risk Profile picker. Sh leaves the
  // adapter unregistered and the call is a no-op; the rest of this
  // hook (clone guard, slice writer, exchange URL hints) stays
  // generic. Must run unconditionally to keep the hook count stable.
  useCuratedPreloadHints({
    curated: staged?.curated ?? null,
    stagedType: staged?.type,
  });

  // The exchanges store has produced a definitive answer once it has
  // rehydrated AND either the network fetch completed (initialLoaded), some
  // exchanges are present (from the IDB cache or a prior page), or the fetch
  // errored. Until then, resolving a curated provider to a UUID would
  // spuriously miss and let the form auto-pick the wrong exchange.
  const exchangesReady =
    hasHydrated &&
    (initialLoaded ||
      Object.keys(exchanges).length > 0 ||
      Boolean(exchangesError));

  return useMemo<BotConfigPreload | null>(() => {
    // The clone flow owns its own state machine — don't interfere.
    if (search.get('clone')) return null;

    const fromUrl = {
      exchange: search.get('exchange') ?? undefined,
      symbol: search.get('symbol') ?? undefined,
    };
    const exchangeProvider = staged?.exchange ?? fromUrl.exchange;
    const symbol = staged?.symbol ?? fromUrl.symbol;

    // Nothing to preload: let the form do its normal thing.
    if (!staged && !exchangeProvider && !symbol) return null;

    // Resolve provider → user's exchange UUID. If the user has multiple
    // exchanges connected for the same provider, pick the first; if
    // they have none, fall back to undefined (form will prompt).
    //
    // Curated launches stage the live exchange name (e.g. `kucoin`) but
    // an onboarded paper-only user only has `paperKucoinSpot` etc. —
    // fall back to any paper variant matching the requested base name
    // (`kucoin` → `paperKucoin*`) so the form lands on the account we
    // just bootstrapped instead of silently defaulting to whichever
    // exchange happens to be first in the list.
    let exchangeUUID: string | undefined;
    if (exchangeProvider) {
      try {
        const allExchanges = Object.values(exchanges);
        const matches = allExchanges.filter(
          (ex) => ex.provider === exchangeProvider
        );
        exchangeUUID = matches[0]?.uuid;
        if (!exchangeUUID) {
          // No exact match — look for paper variants of the same base.
          // E.g. `kucoin` → match any provider starting with `paperKucoin`.
          const base = exchangeProvider.toLowerCase();
          const paperPrefix = `paper${base.charAt(0).toUpperCase()}${base.slice(1)}`;
          const paperMatch = allExchanges.find((e) =>
            String(e.provider ?? '').startsWith(paperPrefix)
          );
          exchangeUUID = paperMatch?.uuid;
        }
      } catch (e) {
        logger.warn(
          '[useBotConfigPreload] getExchangesByProvider threw, skipping exchange seed',
          { err: (e as Error).message, provider: exchangeProvider }
        );
      }
    }

    const initialFormData: Partial<BotFormData> = {};
    if (exchangeUUID) initialFormData.exchangeUUID = exchangeUUID;
    // BotFormData.pair accepts string | string[]; the form internally
    // normalizes via [pair].flat(), but several call sites use
    // Array.isArray(formData.pair) checks. Stage as a single-element
    // array to match the legacy "Copy to live" preload shape and avoid
    // edge cases in the pair validator.
    if (symbol) initialFormData.pair = [symbol];

    // Pick the right form slice from staged.type. Combo and grid both
    // come through this same channel now (the curated-presets widget,
    // wizard slot, and More-strategies overlay stage payloads with the
    // appropriate `type`). When type is missing, default to DCA to
    // preserve legacy callers' behavior ("Copy to live", clone flow).
    const stagedType = staged?.type;
    if (staged?.settings) {
      if (stagedType === BotTypesEnum.grid) {
        const slice = toFormSlice<BotFormData['grid']>(staged.settings);
        if (slice && Object.keys(slice).length > 0) {
          initialFormData.grid = slice;
        }
      } else if (stagedType === BotTypesEnum.combo) {
        const slice = toFormSlice<BotFormData['combo']>(staged.settings);
        if (slice && Object.keys(slice).length > 0) {
          initialFormData.combo = slice;
        }
      } else {
        const slice = toFormSlice<BotFormData['dca']>(staged.settings);
        if (slice && Object.keys(slice).length > 0) {
          initialFormData.dca = slice;
        }
      }
    }

    // Curated-specific side effects (Quick Backtest pre-arm + pending
    // Risk Profile tier) moved to the `@/lib/curatedPreload` adapter
    // called at the top of this hook. The `curated` blob is still
    // surfaced in the return value so non-side-effect consumers can
    // read it.

    // Hold the form seed until the exchanges store can resolve a staged/URL
    // provider. Without this the form mounts (seeding its store ONCE) before
    // exchanges load, `exchangeProvider` resolves to `undefined`, and the
    // exchange auto-picker clobbers the curated choice with the user's
    // default account. Once `exchangesReady` flips true this memo re-runs
    // (the `exchanges` dep changed), `exchangeUUID` resolves, and the gate
    // opens. A provider the user simply hasn't connected resolves to
    // `undefined` but is NOT pending (exchangesReady is already true), so the
    // form falls back to its normal auto-pick instead of hanging.
    const exchangePending =
      Boolean(exchangeProvider) && !exchangeUUID && !exchangesReady;

    return {
      initialFormData,
      name: staged?.name,
      curated: staged?.curated,
      exchangePending,
    };
  }, [search, staged, exchanges, exchangesReady]);
}
