/**
 * Runner note: this file mocks modules and renders a hook, so it is a Vitest
 * file, not one of core's Playwright `.unit.test.ts` pure-function tests.
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug827ProjectionGlobalVars.vitest.test.ts
 *
 * Spec 031 — "The bot drawer's DCA Analysis projects from the literal, not the
 * bound variable" (`specs/031.dca-analysis-projection-drops-the-bots-variable-bindings.md`).
 *
 * Fixture is the reporter's own bot `6a729de045c654b39d7068e5` (DCA, SHORT,
 * AAPLB/USDT on Binance spot, quote-sized). Its `baseOrderSize` and `orderSize`
 * literals are both `"25"` while `vars.paths` binds both bare keys to the
 * global variable `TSQR2` = `6.1`, which is what the engine actually spends
 * (spec §2.1).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  DCAOrderTypeEnum,
  OrderSizeTypeEnum,
  ScaleDcaTypeEnum,
  StrategyEnum,
  type BotVars,
  type DCAGrid,
} from '@/types';

/**
 * `getGlobalVariablesByIds(["69b2433d8ccbe25b8d34d688"])`, hoisted because the
 * `vi.mock` factories below run before this module's own top-level statements.
 */
const { VARIABLES } = vi.hoisted(() => ({
  VARIABLES: {
    '69b2433d8ccbe25b8d34d688': {
      id: '69b2433d8ccbe25b8d34d688',
      name: 'TSQR2',
      type: 'float',
      value: '6.1',
    },
    // A second variable, for the rebind test: it stands for "the user pointed
    // the field at a different variable while the drawer was open".
    bbbbbbbbbbbbbbbbbbbbbbbb: {
      id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      name: 'TSQR.BO_40',
      type: 'float',
      value: '40',
    },
  } as Record<string, { id: string; name: string; type: string; value: string }>,
}));

vi.mock('@/stores/globalVariablesStore', () => ({
  globalVariablesStore: {
    getVariablesByIds: async (id: string | string[] | null) => {
      if (!id || [id].flat().length === 0) return undefined;
      return [id].flat().map((v) => VARIABLES[v]).filter(Boolean);
    },
    getAllVariables: () => Object.values(VARIABLES),
  },
}));

// The pairs cache is cold in this harness, so `buildBotProjectionContext`
// falls back to its generic high-precision symbol — which is what makes the
// quote assertions below exact rather than rounded to a venue step.
vi.mock('@/stores/tradingPairsDataStore', () => {
  const state = {
    pairsByProvider: {} as Record<string, Record<string, unknown>>,
    timestamp: 1,
    _hasHydrated: true,
    getPairsByExchange: () => [],
  };
  const useTradingPairsDataStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state;
  useTradingPairsDataStore.getState = () => state;
  return { useTradingPairsDataStore };
});

vi.mock('@/helper/price', () => ({
  getLocalPrices: () => [
    { symbol: 'AAPLBUSDT', exchange: 'binance', price: PRICE },
  ],
}));

import {
  buildBotProjectionContext,
  useBotDcaProjection,
} from '@/hooks/bots/dca/useBotDcaProjection';

/** Binance quotes AAPLB around here; the assertions are price-independent. */
const PRICE = 254;

/** `getDCABot(6a729de045c654b39d7068e5).settings`, verbatim. */
const SETTINGS = {
  strategy: StrategyEnum.short,
  futures: false,
  coinm: false,
  leverage: 1,
  baseOrderSize: '25',
  orderSize: '25',
  orderSizeType: OrderSizeTypeEnum.quote,
  tpPerc: '6',
  slPerc: '-10',
  useTp: true,
  useSl: false,
  useDca: true,
  useSmartOrders: true,
  step: '1.6',
  stepScale: '1.3',
  volumeScale: '1.3',
  minimumDeviation: null,
  ordersCount: 5,
  activeOrdersCount: 2,
  dcaCondition: DCAConditionEnum.percentage,
  scaleDcaType: ScaleDcaTypeEnum.percentage,
  dealCloseCondition: CloseConditionEnum.tp,
  dealCloseConditionSL: CloseConditionEnum.tp,
  useMultiTp: false,
  useMultiSl: false,
  profitCurrency: 'quote',
  trailingTp: false,
  minTp: '1',
  indicators: [],
  dcaCustom: [],
  multiTp: [],
  multiSl: [],
} as unknown as Record<string, unknown>;

/** `getDCABot(...).vars`, verbatim — two BARE top-level keys. */
const BOT_VARS: BotVars = {
  list: ['69b2433d8ccbe25b8d34d688'],
  paths: [
    { path: 'baseOrderSize', variable: '69b2433d8ccbe25b8d34d688' },
    { path: 'orderSize', variable: '69b2433d8ccbe25b8d34d688' },
  ] as BotVars['paths'],
};

const bot = (vars: BotVars | null) => ({
  _id: '6a729de045c654b39d7068e5',
  type: BotTypesEnum.dca,
  pair: 'AAPLBUSDT',
  exchange: 'binance',
  settings: SETTINGS,
  vars,
});

/** The quote the projected Start order is sized at. */
const baseOrderQuote = (orders: DCAGrid[]): number => {
  const bo = orders.find((o) => o.type === DCAOrderTypeEnum.bo);
  if (!bo) {
    throw new Error('the projection must contain a Start order');
  }
  return bo.qty * bo.price;
};

let root: Root | null = null;
let host: HTMLElement | null = null;

/**
 * Renders the real `useBotDcaProjection` and returns the orders it settles on.
 * `rebindTo` re-renders the same mounted hook with different bindings, which is
 * how a rebind / variable edit reaches it in the app.
 */
async function runHook(
  vars: BotVars | null,
  rebindTo?: BotVars | null
): Promise<DCAGrid[]> {
  let latest: DCAGrid[] = [];

  function Probe({ vars: v }: { vars: BotVars | null }) {
    const value = useBotDcaProjection(
      bot(v) as unknown as Parameters<typeof useBotDcaProjection>[0]
    );
    useEffect(() => {
      latest = value.orders;
    }, [value]);
    return null;
  }

  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  await act(async () => {
    r.render(createElement(Probe, { vars }));
  });
  // The projection is async (it awaits the variable store).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  if (rebindTo !== undefined) {
    await act(async () => {
      r.render(createElement(Probe, { vars: rebindTo }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }
  return latest;
}

describe('spec 031 — DCA Analysis projects the resolved settings', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it('§4.1 sizes the Start order at the bound variable, not the stored literal', async () => {
    const orders = await runHook(BOT_VARS);
    // TSQR2 = 6.1 quote. The stale literal would quote 25.
    expect(baseOrderQuote(orders)).toBeCloseTo(6.1, 4);
  });

  it('§4.1 sizes the safety orders from the bound `orderSize` too', async () => {
    const orders = await runHook(BOT_VARS);
    const firstDca = orders.find((o) => o.type === DCAOrderTypeEnum.dca);
    if (!firstDca) {
      throw new Error('the projection must contain a safety order');
    }
    // First DCA = orderSize × volumeScale^0 = 6.1, not 25.
    expect(firstDca.qty * firstDca.price).toBeCloseTo(6.1, 4);
  });

  it('§4.2 leaves an unbound bot alone (identity case)', async () => {
    const orders = await runHook(null);
    expect(baseOrderQuote(orders)).toBeCloseTo(25, 4);
  });

  it('§4.3 hands the engine the WHOLE binding block, not just the ladder keys', async () => {
    // The four uuid-keyed sections (`indicators`, `dcaCustom`, `multiTp`,
    // `multiSl`) are resolved by the engine itself — spec 023 covers that. What
    // this surface owes them is simply to pass the bindings through unfiltered,
    // which is the difference between every shape working and none of them.
    const uuid = 'a14a1ed7-a84f-4bee-a671-5e8f53c739ee';
    const vars: BotVars = {
      list: ['69b2433d8ccbe25b8d34d688'],
      paths: [
        { path: 'baseOrderSize', variable: '69b2433d8ccbe25b8d34d688' },
        {
          path: `multiTp.${uuid}.percentage`,
          variable: '69b2433d8ccbe25b8d34d688',
        },
      ] as BotVars['paths'],
    };
    const context = buildBotProjectionContext(
      bot(vars) as unknown as Parameters<typeof buildBotProjectionContext>[0]
    );
    expect(context?.botVars).toEqual(vars);
  });

  it('§4.4 recomputes when the bindings change', async () => {
    const orders = await runHook(BOT_VARS, {
      list: ['bbbbbbbbbbbbbbbbbbbbbbbb'],
      paths: [
        { path: 'baseOrderSize', variable: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
        { path: 'orderSize', variable: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
      ] as BotVars['paths'],
    });
    expect(baseOrderQuote(orders)).toBeCloseTo(40, 4);
  });
});
