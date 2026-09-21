/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts` — core's Playwright
 * config only collects `*.unit.test.{js,ts}`; this file renders the real
 * `BotFormQueryProvider` in jsdom and mocks modules, so it is Vitest-only.
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/bug842EmptyPairBotEditor.vitest.test.tsx`
 *
 * Bug #842 — the V2 bot editor invents a pair for a bot whose stored pair the
 * engine emptied, and then renders it read-only.
 *
 * Spec: specs/036.bot-editor-invents-a-pair-for-an-emptied-single-pair-bot.md
 *
 * The reporter's bot `69931b72eedf3d7447c9fa97` (bitgetCoinm, `useMulti:false`)
 * is stored with `settings.pair: []` — main-app's delisted-pair prune removed
 * its only pair when Bitget stopped listing `BTCUSD` (bug #806, backend half
 * already shipped). Opening it in the V2 editor shows a pair the bot was never
 * configured with, locked read-only.
 *
 * Two halves, both driven against the REAL code:
 *  - §4.1 the `pickDefaultPair` fallback in `BotFormQueryProvider` fires in
 *    EDIT mode and writes a manufactured pair into form data;
 *  - §4.2 `resolvePairsLockState` locks it, so the manufactured pair cannot be
 *    corrected.
 *
 * The pair fixture is the REAL prod `getAllPairs` payload for bitgetCoinm
 * (fetched 2026-09-21 as the reporter), in the alphabetical order
 * `convertToFlatPairsByExchange` produces.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useCallback, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { TradingPair } from '@/hooks/useTradingPairs';

const BOT_ID = '69931b72eedf3d7447c9fa97';
const EXCHANGE_UUID = 'a0beaede-970c-41c2-beb9-770aa5f5b009';

/**
 * Real prod bitgetCoinm listings, alphabetical by `pair` (how
 * `convertToFlatPairsByExchange` sorts them before the provider walks them).
 *
 * `withBtcUsd: false` models the window the reporter actually hit — Bitget
 * stopped listing the plain `BTCUSD` contract on 17 Sep, which is both why the
 * engine emptied the bot AND why the only BTC contract left was the dated
 * September-2026 future `BTCUSDU26`.
 */
const bitgetCoinmPairs = (withBtcUsd: boolean): TradingPair[] =>
  (
    [
      ['AAVEUSD', 'AAVE'],
      ['ADAUSD', 'ADA'],
      ['APTUSD', 'APT'],
      ['AVAXUSD', 'AVAX'],
      ['BCHUSD', 'BCH'],
      ...(withBtcUsd ? ([['BTCUSD', 'BTC']] as const) : []),
      ['BTCUSDU26', 'BTC'],
      ['DOGEUSD', 'DOGE'],
      ['ETHUSD', 'ETH'],
      ['ETHUSDU26', 'ETH'],
      ['SOLUSD', 'SOL'],
      ['XRPUSD', 'XRP'],
    ] as ReadonlyArray<readonly [string, string]>
  ).map(
    ([pair, base]) =>
      ({
        pair,
        exchange: 'bitgetCoinm',
        baseAsset: { name: base },
        quoteAsset: { name: 'USD' },
      }) as unknown as TradingPair
  );

/**
 * Every mocked hook returns a STABLE object. The real hooks all memoize, and
 * without that here `pairsByExchange` / `exchanges` get a fresh identity per
 * render, `pairMetadata` recomputes, the effect re-arms `shouldCheckPairs`, and
 * the harness spins until the heap dies — an artefact of the harness, not of
 * the code under test.
 */
const PAIRS_WITHOUT_BTCUSD = bitgetCoinmPairs(false);
const PAIRS_WITH_BTCUSD = bitgetCoinmPairs(true);

let tradingPairsResult = {
  pairsByExchange: { bitgetCoinm: PAIRS_WITHOUT_BTCUSD },
  isLoading: false,
  error: null,
  refresh: () => Promise.resolve(),
};
const emptyExchangesResult = {
  data: { data: { exchanges: [] } },
  loading: false,
  refresh: () => Promise.resolve(),
};

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTradingPairsFromContext: () => tradingPairsResult,
  useExchangesFromContext: () => emptyExchangesResult,
}));

const userFeeResult = {
  fetchUserFee: () => Promise.resolve(null),
  userFee: null,
};
vi.mock('@/hooks/useUserFee', () => ({ useUserFee: () => userFeeResult }));

/** The saved bot, exactly as prod returns it (verified read-only, 2026-09-21). */
const storedSettings = { pair: [] as string[], useMulti: false };

const botFormDataQueryResult = {
  dcaBots: [],
  gridBots: [],
  comboBots: [],
  hedgeDcaBots: [],
  hedgeComboBots: [],
  bots: [],
  botsLoading: false,
  bot: null,
  botSettings: {
    settings: storedSettings,
    exchange: 'bitgetCoinm',
    exchangeUUID: EXCHANGE_UUID,
    baseAsset: ['BTC'],
    quoteAsset: ['USD'],
    created: '',
    updated: '',
  },
  botSettingsLoading: false,
  exchanges: [
    { uuid: EXCHANGE_UUID, provider: 'bitgetCoinm', name: 'Bitget COIN-M' },
  ],
  exchangesLoading: false,
  refetchExchanges: () => Promise.resolve(),
};

vi.mock('@/hooks/bots/forms/useBotFormDataQuery', () => ({
  useBotFormDataQuery: () => botFormDataQueryResult,
}));

/**
 * A minimal but REAL form store: `updateFormData` writes and re-renders, so the
 * provider's effects see their own writes exactly as they do in the app. A
 * harness that only records the calls would never surface the follow-on passes.
 */
type Store = Record<string, unknown>;
let store: Store = {};
let writes: Array<[string, unknown]> = [];
const subscribers = new Set<() => void>();

const setField = (field: string, value: unknown) => {
  store = { ...store, [field]: value };
  writes.push([field, value]);
  // Fail loudly instead of exhausting the heap if the harness ever loops.
  if (writes.length > 200) {
    throw new Error(
      `harness runaway: ${writes.length} form writes\n${writes
        .slice(-10)
        .map(([f, v]) => `${f}=${JSON.stringify(v)?.slice(0, 60)}`)
        .join('\n')}`
    );
  }
  subscribers.forEach((fn) => fn());
};

vi.mock('@/contexts/bots/form/BotFormProvider', () => {
  const useSubscribe = (field: string) => {
    const [, force] = useState(0);
    const ref = useRef(0);
    const cb = useCallback(() => {
      ref.current += 1;
      force(ref.current);
    }, []);
    // Register once per mount; the set is module-scoped so this is cheap.
    subscribers.add(cb);
    return store[field];
  };
  return {
    useBotFormSelector: (field: string) => useSubscribe(field),
    useBotFormTopLevelSelector: (field: string) => useSubscribe(field),
    useBotFormActions: () => ({ updateFormData: setField }),
    useOptionalBotFormState: () => null,
    useBotFormState: () => ({ botVars: null, setAlerts: () => {} }),
    useBotFormEditing: () => ({ disableEditing: () => {} }),
  };
});

vi.mock('@/lib/toast', () => ({
  toast: {
    success: () => {},
    error: () => {},
    warning: () => {},
  },
}));

vi.mock('@/lib/analytics', () => ({ track: () => {} }));

vi.mock('@/hooks/useBacktestMutations', () => ({
  useRunBacktest: () => ({ mutateAsync: () => Promise.resolve(null) }),
  prepareBacktestInput: () => ({}),
}));

// Static imports — `vi.mock` hoists above them, and the esbuild target rejects
// top-level `await import()`.
import { BotFormQueryProvider } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { resolvePairsLockState as resolvePairsLockStateDca } from '@/features/bots/bot-types/dca/form/utils/basicSettings';
import {
  resolveMaxAllowedPairs,
  resolvePairsLockState as resolvePairsLockStateGrid,
} from '@/utils/bots/dca/basic-settings';
import { stripUndeclaredUpdateFields } from '@/mappers/bots/dca/update-payload-denylist';
import { useFormHandlers } from '@/hooks/bots/dca/useFormHandlers';
import { BotTypesEnum } from '@/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const render = (mode: 'edit' | 'create') => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(
        BotFormQueryProvider,
        { mode, botId: mode === 'edit' ? BOT_ID : undefined },
        null
      )
    );
  });
};

beforeEach(() => {
  // The bot as the editor loads it: the mapper emits `pair: []` for a stored
  // empty pair, and the exchange comes from the saved bot.
  store = { pair: [], exchangeUUID: EXCHANGE_UUID, pairMetadata: null };
  writes = [];
  subscribers.clear();
  tradingPairsResult = {
    ...tradingPairsResult,
    pairsByExchange: { bitgetCoinm: PAIRS_WITHOUT_BTCUSD },
  };
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const pairWrites = () =>
  writes.filter(([field]) => field === 'pair').map(([, value]) => value);

describe('§4.1 BotFormQueryProvider must not manufacture a pair in edit mode', () => {
  it('writes no pair for a bot whose stored pair is empty (BTCUSD delisted — what the reporter saw)', () => {
    render('edit');

    expect(storedSettings.pair).toEqual([]);
    expect(pairWrites()).toEqual([]);
    expect(store['pair']).toEqual([]);
  });

  it('writes no pair once BTCUSD is listed again either — the invention is not about which pair wins', () => {
    // Today's prod listing. The invented pair changes (alphabetical order puts
    // BTCUSD first), the invention does not — which is why the fix gates the
    // fallback on mode rather than on the shape of the venue's pair list.
    tradingPairsResult = {
      ...tradingPairsResult,
      pairsByExchange: { bitgetCoinm: PAIRS_WITH_BTCUSD },
    };
    render('edit');

    expect(pairWrites()).toEqual([]);
  });

  it('§4.4 create mode keeps the fallback — a saved BTCUSDT is invalid on this venue', () => {
    store = {
      pair: ['BTCUSDT'],
      exchangeUUID: EXCHANGE_UUID,
      pairMetadata: null,
    };
    render('create');

    // Unchanged behaviour: create mode still lands on a usable pair.
    expect(pairWrites().flat().filter(Boolean)).toEqual(['BTCUSDU26']);
  });
});

describe('§4.2/§4.3 resolvePairsLockState — both live copies, identically', () => {
  const copies: Array<[string, typeof resolvePairsLockStateDca]> = [
    ['dca/form/utils/basicSettings', resolvePairsLockStateDca],
    ['utils/bots/dca/basic-settings', resolvePairsLockStateGrid],
  ];

  copies.forEach(([name, resolvePairsLockState]) => {
    describe(name, () => {
      it('§4.2 unlocks a single-pair bot whose stored pair is empty', () => {
        expect(
          resolvePairsLockState({
            externallyLocked: undefined,
            mode: 'edit',
            useMulti: false,
            hasStoredPair: false,
          })
        ).toEqual({ locked: false, reason: null });
      });

      it('§4.3 keeps bug #151 lock for a configured single-pair bot', () => {
        expect(
          resolvePairsLockState({
            externallyLocked: undefined,
            mode: 'edit',
            useMulti: false,
            hasStoredPair: true,
          })
        ).toEqual({ locked: true, reason: 'edit-single-pair' });
      });

      it('§4.3 keeps the lock when the caller cannot say (grid, still-loading settings)', () => {
        expect(
          resolvePairsLockState({
            externallyLocked: undefined,
            mode: 'edit',
            useMulti: false,
          })
        ).toEqual({ locked: true, reason: 'edit-single-pair' });
      });

      it('an external field lock still wins over the empty-pair unlock', () => {
        expect(
          resolvePairsLockState({
            externallyLocked: true,
            mode: 'edit',
            useMulti: false,
            hasStoredPair: false,
          })
        ).toEqual({ locked: true, reason: 'external-lock' });
      });

      it('create mode and multi-pair edits are untouched', () => {
        expect(
          resolvePairsLockState({
            externallyLocked: undefined,
            mode: 'create',
            useMulti: false,
            hasStoredPair: false,
          })
        ).toEqual({ locked: false, reason: null });
        expect(
          resolvePairsLockState({
            externallyLocked: undefined,
            mode: 'edit',
            useMulti: true,
            hasStoredPair: true,
          })
        ).toEqual({ locked: false, reason: null });
      });
    });
  });

  it('§4.6 the unlocked picker still accepts exactly one pair', () => {
    // Matches main-app 8f8aebc5, which refuses `pair.length > 1` for the
    // empty-pair repair.
    expect(resolveMaxAllowedPairs({ useMulti: false })).toBe(1);
  });
});

describe('§4.5 the update payload carries `pair` only for an emptied bot', () => {
  const basePayload = { pair: ['BTCUSD'], profitCurrency: 'base' };

  it('the denylist itself keeps or drops `pair` on the flag, for dca and combo', () => {
    (['dca', 'combo'] as const).forEach((botType) => {
      expect(
        stripUndeclaredUpdateFields(basePayload, { botType, stripPair: true })
      ).not.toHaveProperty('pair');
      expect(
        stripUndeclaredUpdateFields(basePayload, { botType, stripPair: false })
      ).toHaveProperty('pair', ['BTCUSD']);
    });
  });

  /**
   * End-to-end through the REAL `useFormHandlers.handleSave`, mounted inside the
   * REAL `BotFormQueryProvider` — this is what proves the flag is actually
   * wired, not just that the denylist honours it. The payload mapper is stubbed
   * so the test is about the strip decision and nothing else.
   */
  const sentSettings: Array<Record<string, unknown>> = [];
  let save: (() => Promise<void>) | null = null;

  const SaveProbe = ({ botType }: { botType: 'dca' | 'combo' }) => {
    const formData = {
      type: botType === 'dca' ? BotTypesEnum.dca : BotTypesEnum.combo,
      dca: { useMulti: false },
      combo: { useMulti: false },
    } as never;
    const handlers = useFormHandlers(
      formData,
      () => {},
      () => {},
      () => {},
      {},
      { _id: BOT_ID, settings: storedSettings },
      {
        mutateAsync: (params: { settings: Record<string, unknown> }) => {
          sentSettings.push(params.settings);
          return Promise.resolve(null);
        },
      },
      {
        mode: 'edit',
        payloadMapper: () =>
          ({ success: true, updatePayload: { ...basePayload } }) as never,
      },
      false
    );
    save = handlers.handleSave;
    return null;
  };

  const mountProbe = (botType: 'dca' | 'combo') => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(
          BotFormQueryProvider,
          { mode: 'edit', botId: BOT_ID },
          createElement(SaveProbe, { botType })
        )
      );
    });
  };

  beforeEach(() => {
    sentSettings.length = 0;
    save = null;
    // The emptied bot's form state: single-pair, no pair yet, user just picked
    // BTCUSD in the (now unlocked) picker.
    store = {
      pair: ['BTCUSD'],
      useMulti: false,
      exchangeUUID: EXCHANGE_UUID,
      pairMetadata: null,
    };
  });

  (['dca', 'combo'] as const).forEach((botType) => {
    it(`${botType}: the chosen pair reaches the change mutation`, async () => {
      mountProbe(botType);
      await act(async () => {
        await save!();
      });

      expect(sentSettings).toHaveLength(1);
      expect(sentSettings[0]).toHaveProperty('pair', ['BTCUSD']);
    });
  });
});
