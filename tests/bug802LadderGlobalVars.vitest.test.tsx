/**
 * Runner note: this file renders a real hook in jsdom and mocks modules, so it
 * is a Vitest file, not one of core's Playwright `.unit.test.ts` pure-function
 * tests. Run from the parent:
 *   npx vitest run core/tests/bug802LadderGlobalVars.vitest.test.tsx
 *
 * Spec 023 — "The projected DCA ladder ignores the bot's global-variable
 * bindings" (`specs/023.projected-ladder-ignores-the-bots-global-variable-bindings.md`).
 *
 * A bot setting bound to a global variable is worth the VARIABLE's value; the
 * literal left in the bot document is stale the moment the binding is made.
 * `createDCAOrders` knows this and resolves the bindings itself — but only from
 * `context.botVars`, and `useDealSmartOrders` hardcoded `botVars: null`, so
 * every client-side projection of a bound setting silently used the stale
 * literal.
 *
 * The fixture is the reporter's own bot: five `startDca` indicators storing
 * `orderSize: "300"` while all five are bound to one variable worth 330, and
 * `minPercFromLast` literals that are stale against their own variables. His
 * bot's filled safety orders settle which one is real — 77289.62 × 0.004269 =
 * 329.96 USDT.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  DCAConditionEnum,
  DCAOrderTypeEnum,
  IndicatorAction,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  StrategyEnum,
  type BotVars,
  type DCABotSettings,
  type DCADeals,
  type DCAGrid,
  type Symbols,
} from '@/types';

/**
 * The reporter's real global variables (`getGlobalVariablesByIds`) and his
 * pair, hoisted because the `vi.mock` factories below run before this module's
 * own top-level statements.
 */
const { VARIABLES, PAIR, variableFetches } = vi.hoisted(() => ({
  VARIABLES: {
    '69aa883b97cbd9ee784af2b9': { id: '69aa883b97cbd9ee784af2b9', name: 'O-DCA-volume', value: '330' },
    '69aa885d97cbd9ee784af631': { id: '69aa885d97cbd9ee784af631', name: 'O-BO', value: '33' },
    '69aa887b97cbd9ee784af7cc': { id: '69aa887b97cbd9ee784af7cc', name: 'O-DCA-1', value: '0.64' },
    '69aa8c4197cbd9ee784b98c8': { id: '69aa8c4197cbd9ee784b98c8', name: 'O-DCA-2', value: '1.25' },
    '69aa8c4c97cbd9ee784b9b4b': { id: '69aa8c4c97cbd9ee784b9b4b', name: 'O-DCA-3', value: '2.45' },
    '69aa8c5497cbd9ee784b9be9': { id: '69aa8c5497cbd9ee784b9be9', name: 'O-DCA-4', value: '4.80' },
    '69aa8c8197cbd9ee784ba032': { id: '69aa8c8197cbd9ee784ba032', name: 'O-DCA-5', value: '9.40' },
  } as Record<string, { id: string; name: string; value: string }>,
  PAIR: {
    pair: 'BTCUSDT',
    exchange: 'bitget',
    baseAsset: { minAmount: 0.000001, maxAmount: 1e9, step: 0.000001, name: 'BTC' },
    quoteAsset: { minAmount: 0.01, name: 'USDT' },
    maxOrders: 200,
    priceAssetPrecision: 2,
  } as Symbols,
  variableFetches: [] as string[][],
}));

vi.mock('@/stores/globalVariablesStore', () => ({
  globalVariablesStore: {
    getVariablesByIds: async (id: string | string[] | null) => {
      if (!id || [id].flat().length === 0) return undefined;
      const ids = [id].flat();
      variableFetches.push(ids);
      return ids.map((v) => VARIABLES[v]).filter(Boolean);
    },
    getAllVariables: () => Object.values(VARIABLES),
  },
}));

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTradingPairsFromContext: () => ({ pairsByExchange: { bitget: [PAIR] } }),
}));
vi.mock('@/hooks/useUsdRate', () => ({ useUsdRate: () => ({ rate: 1 }) }));
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ getCachedFee: () => ({ maker: 0.001, taker: 0.001 }) }),
}));
vi.mock('@/stores/live/balanceStore', () => ({
  useBalanceStore: (selector: (s: { balances: unknown[] }) => unknown) =>
    selector({ balances: [] }),
}));

import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import {
  levelQuoteBudget,
  levelSizeAtMarket,
} from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';
import { formatBalance, formatNumber } from '@/utils/numberFormatter';

/** The five startDca indicators, stored with the stale `"300"` literal. */
const STARTDCA = [
  { uuid: 'f74f5e1c-9ddb-4943-a590-53465402b744', minPercFromLast: '0.64' },
  { uuid: '2e4f2129-f518-41a7-bbb7-e144e1dede1f', minPercFromLast: '0.77' },
  { uuid: '2144ab5f-3c20-4e3c-94af-a96c101f077c', minPercFromLast: '0.93' },
  { uuid: '30d91683-b4bd-4d37-ba86-d9216133b487', minPercFromLast: '1.11' },
  { uuid: '2a57fa3b-905c-4c7d-9ccc-4df97eec1569', minPercFromLast: '1.33' },
];

const MINPERC_VARIABLE = [
  '69aa887b97cbd9ee784af7cc',
  '69aa8c4197cbd9ee784b98c8',
  '69aa8c4c97cbd9ee784b9b4b',
  '69aa8c5497cbd9ee784b9be9',
  '69aa8c8197cbd9ee784ba032',
];

/** `getDCABotSettings(69a69be16f6867bb88a80f48)`, verbatim. */
const SETTINGS = {
  strategy: StrategyEnum.short,
  dcaCondition: DCAConditionEnum.indicators,
  orderSizeType: OrderSizeTypeEnum.quote,
  baseOrderSize: '33',
  orderSize: '33',
  ordersCount: 32,
  activeOrdersCount: 1,
  step: '2',
  stepScale: '1.1',
  volumeScale: '1',
  tpPerc: '2',
  slPerc: '-10',
  useDca: true,
  useTp: true,
  useSl: true,
  useMulti: false,
  useMultiTp: false,
  // Not `tp`, so the volume-change branch that would override the per-level
  // order size is off and each level takes its own indicator's `orderSize`.
  dealCloseCondition: 'techInd',
  dcaVolumeBaseOn: 'change',
  scaleDcaType: 'percentage',
  futures: false,
  coinm: false,
  useSmartOrders: true,
  startOrderType: OrderTypeEnum.market,
  indicators: STARTDCA.map((i) => ({
    uuid: i.uuid,
    indicatorAction: IndicatorAction.startDca,
    orderSize: '300',
    minPercFromLast: i.minPercFromLast,
    type: 'RSI',
    section: 'dca',
  })),
  dcaCustom: [],
  multiTp: [],
  multiSl: [],
} as unknown as DCABotSettings;

const VARS: BotVars = {
  list: [
    '69aa885d97cbd9ee784af631',
    '69aa883b97cbd9ee784af2b9',
    ...MINPERC_VARIABLE,
  ],
  paths: [
    { path: 'baseOrderSize', variable: '69aa885d97cbd9ee784af631' },
    ...STARTDCA.flatMap((ind, i) => [
      {
        path: `indicators.${ind.uuid}.orderSize`,
        variable: '69aa883b97cbd9ee784af2b9',
      },
      {
        path: `indicators.${ind.uuid}.minPercFromLast`,
        variable: MINPERC_VARIABLE[i],
      },
    ]),
  ] as BotVars['paths'],
};

/** Deal `6a451ff7d6c8879a4738723e`, as production holds it. */
const DEAL = {
  _id: '6a451ff7d6c8879a4738723e',
  status: 'open',
  exchange: 'bitget',
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  initialPrice: 59713.26,
  lastPrice: 64555.66,
  avgPrice: 62267.615368555606,
  levels: { complete: 4, all: 6 },
  settings: { orderSizeType: OrderSizeTypeEnum.quote },
  gridBreakpoints: [],
  tpSlTargetFilled: [],
  dynamicAr: [],
} as unknown as DCADeals;

/** Live market price on the day of the report. */
const MARKET = 80_900;

let root: Root | null = null;
let host: HTMLElement | null = null;

interface HookResult {
  fullLadder: DCAGrid[];
  settings: DCABotSettings | null;
}

async function runHook(vars: BotVars | null): Promise<HookResult> {
  let latest: HookResult | null = null;
  const publish = (value: HookResult) => {
    latest = value;
  };

  function Probe() {
    const value = useDealSmartOrders({
      bot: { settings: SETTINGS, exchangeUUID: 'uuid', vars },
      deal: DEAL,
      pendingOrders: [],
      completedOrders: [],
      enabled: true,
      computeRegardlessOfSmartOrders: true,
    });
    // Published from an effect, not during render: the ladder arrives on a
    // later commit than the first one anyway.
    useEffect(() => {
      publish(value);
    }, [value]);
    return null;
  }

  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  await act(async () => {
    r.render(createElement(Probe));
  });
  // The ladder compute is async (it awaits the variable store).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return latest ?? { fullLadder: [], settings: null };
}

/** The DCA rungs of a computed ladder, in level order. */
const dcaLevels = (ladder: DCAGrid[]) =>
  ladder.filter(
    (o) => o.type === DCAOrderTypeEnum.dca && !o.hide && !o.note
  );

describe('spec 023 §1.1 — the projected ladder resolves the bot\'s variable bindings', () => {
  beforeEach(() => {
    variableFetches.length = 0;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it('sizes a quote level at the BOUND order size, not the stale literal', async () => {
    const { fullLadder } = await runHook(VARS);
    const levels = dcaLevels(fullLadder);

    expect(levels.length).toBeGreaterThan(0);
    // `levelQuoteBudget` is price*qty — for a quote level that IS the budget.
    for (const level of levels) {
      expect(levelQuoteBudget({ price: level.price, qty: level.qty })).toBeCloseTo(
        330,
        0
      );
    }
  });

  it('prices the levels at the BOUND minimum-% distances', async () => {
    const { fullLadder } = await runHook(VARS);
    const levels = dcaLevels(fullLadder);
    const bound = [0.64, 1.25, 2.45, 4.8, 9.4];

    // A short ladder steps UP from the deal's opening price, each rung the
    // level's own percentage away from the one before it.
    let previous = DEAL.initialPrice;
    levels.forEach((level, i) => {
      expect(((level.price - previous) / previous) * 100).toBeCloseTo(
        bound[i] ?? 0,
        1
      );
      previous = level.price;
    });
  });

  it('carries the resolved settings out as the settings the ladder was built from', async () => {
    const { settings } = await runHook(VARS);
    const startDca = (settings?.indicators ?? []).filter(
      (i) => i.indicatorAction === IndicatorAction.startDca
    );

    expect(startDca.map((i) => i.orderSize)).toEqual([
      '330',
      '330',
      '330',
      '330',
      '330',
    ]);
    expect(startDca.map((i) => i.minPercFromLast)).toEqual([
      '0.64',
      '1.25',
      '2.45',
      '4.80',
      '9.40',
    ]);
  });

  it('warms the variable cache from the bot\'s list in one request', async () => {
    await runHook(VARS);

    expect(variableFetches[0]).toEqual(VARS.list);
  });

  it('leaves a bot with no bindings exactly as configured', async () => {
    const { fullLadder } = await runHook(null);
    const levels = dcaLevels(fullLadder);

    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) {
      expect(levelQuoteBudget({ price: level.price, qty: level.qty })).toBeCloseTo(
        300,
        0
      );
    }
    expect(variableFetches).toEqual([]);
  });
});

describe('spec 023 §1.2 — an asset amount renders as units of that asset', () => {
  it('formatNumber returns exponential for a sub-0.01 amount, `precise` or not', () => {
    // Pinned because the brief for this fix proposed `precise` as the remedy:
    // the exponential early-return sits ABOVE the `precise` branch, so it is
    // not one. If this ever stops being true, the dialog can go back to one
    // formatter.
    expect(formatNumber(0.00407)).toBe('4.07e-3');
    expect(formatNumber(0.00407, true)).toBe('4.07e-3');
  });

  it('formatBalance renders the quantity the user can compare to an exchange', () => {
    expect(formatBalance(0.00407, 'BTC')).toBe('0.00407');
    expect(formatBalance(330.01, 'USDT')).toBe('330.01');
  });

  it('the executed size of a bound level reads as BTC, not as an exponent', async () => {
    const { fullLadder } = await runHook(VARS);
    const next = dcaLevels(fullLadder)[0];
    expect(next).toBeDefined();
    const qty =
      levelSizeAtMarket(
        { price: next?.price ?? 0, qty: next?.qty ?? 0 },
        MARKET,
        true
      ) ?? 0;

    expect(formatBalance(qty, 'BTC')).toMatch(/^0\.00[0-9]+$/);
    expect(Number(formatBalance(qty * MARKET, 'USDT'))).toBeCloseTo(330, 0);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });
});
