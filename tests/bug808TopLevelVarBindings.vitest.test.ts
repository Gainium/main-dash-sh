/**
 * Runner note: this file mocks a module, so it is a Vitest file, not one of
 * core's Playwright `.unit.test.ts` pure-function tests. Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug808TopLevelVarBindings.vitest.test.ts
 *
 * Spec 024 — "Global-variable bindings on TOP-LEVEL bot settings are never
 * resolved client-side" (`specs/024.top-level-variable-bindings-never-resolved.md`).
 *
 * Fixture is the reporter's own bot `6746b2c55f847e9f447bde8c` (DCA, SHORT,
 * MTL/USDT on Binance spot, `useDca: false` so the ladder is the base order and
 * its take-profit). Its `baseOrderSize` literal is `"10.2"` while
 * `vars.paths[0]` binds that bare key to `TSQR.BO_13.3` = `13.3`, and its five
 * most recent filled entries settle which one is real: 0.295 × 44.7 = 13.19,
 * 0.31 × 42.3 = 13.11, … never ≈ 10.2 (spec §2.2).
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
  OrderTypeEnum,
  ScaleDcaTypeEnum,
  StrategyEnum,
  type BotVars,
  type DCADeals,
  type DCAGrid,
  type Symbols,
} from '@/types';

/**
 * `getGlobalVariablesByIds(["6892d1f7481591a7ffa981fa"])` and the bot's pair,
 * hoisted because the `vi.mock` factories below run before this module's own
 * top-level statements.
 */
const { VARIABLES, PAIR } = vi.hoisted(() => ({
  /** Binance spot MTL/USDT. */
  PAIR: {
    pair: 'MTLUSDT',
    exchange: 'binance',
    baseAsset: { minAmount: 0.1, maxAmount: 1e9, step: 0.1, name: 'MTL' },
    quoteAsset: { minAmount: 0.0001, name: 'USDT' },
    maxOrders: 200,
    priceAssetPrecision: 4,
  } as unknown as Symbols,
  VARIABLES: {
    '6892d1f7481591a7ffa981fa': {
      id: '6892d1f7481591a7ffa981fa',
      name: 'TSQR.BO_13.3',
      type: 'float',
      value: '13.3',
    },
    // A second variable, used only by the deal-snapshot ordering test: it
    // stands for "the user edited the bound variable after the deal opened".
    'aaaaaaaaaaaaaaaaaaaaaaaa': {
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'TSQR.BO_20',
      type: 'float',
      value: '20',
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

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTradingPairsFromContext: () => ({ pairsByExchange: { binance: [PAIR] } }),
}));
vi.mock('@/hooks/useUsdRate', () => ({ useUsdRate: () => ({ rate: 1 }) }));
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ getCachedFee: () => ({ maker: 0.001, taker: 0.001 }) }),
}));
vi.mock('@/stores/live/balanceStore', () => ({
  useBalanceStore: (selector: (s: { balances: unknown[] }) => unknown) =>
    selector({ balances: [] }),
}));

import {
  createDCAOrders,
  defaultContext,
  resolveSettingsVars,
  type ExampleOrdersStoreContext,
} from '@/utils/bots/dca/example-orders-core';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';

/** `getDCABot(6746b2c55f847e9f447bde8c).settings`, verbatim. */
const SETTINGS = {
  strategy: StrategyEnum.short,
  futures: false,
  coinm: false,
  leverage: 1,
  baseOrderSize: '10.2',
  orderSize: '10',
  orderSizeType: OrderSizeTypeEnum.quote,
  tpPerc: '10.02',
  slPerc: '-10',
  useTp: true,
  useSl: false,
  useDca: false,
  step: '9',
  stepScale: '1.1',
  volumeScale: '1',
  minimumDeviation: null,
  ordersCount: 32,
  activeOrdersCount: 1,
  useSmartOrders: false,
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
} as unknown as NonNullable<ExampleOrdersStoreContext['settings']>;

/** `getDCABot(...).vars`, verbatim — a BARE top-level key. */
const BOT_VARS: BotVars = {
  list: ['6892d1f7481591a7ffa981fa'],
  paths: [{ path: 'baseOrderSize', variable: '6892d1f7481591a7ffa981fa' }],
};

const PRICE = 0.295; // the entry price of filled order 6aaa0eb22942ae4fb380ba8a

const context = (
  settings: NonNullable<ExampleOrdersStoreContext['settings']>,
  botVars: BotVars | null
): ExampleOrdersStoreContext => ({
  ...defaultContext,
  botType: BotTypesEnum.dca,
  settings,
  symbol: PAIR,
  errors: {},
  botVars,
  inputLatestPrice: PRICE,
  usdPrice: 1,
  balances: [],
  userFee: 0.001,
  startOrderType: OrderTypeEnum.market,
});

/** The quote the projected base order (`Start order`) is sized at. */
const baseOrderQuote = (orders: { type?: DCAOrderTypeEnum; qty: number; price: number }[]) => {
  const bo = orders.find((o) => o.type === DCAOrderTypeEnum.bo);
  if (!bo) {
    throw new Error('the ladder must contain a Start order');
  }
  return bo.qty * PRICE;
};

describe('spec 024 — top-level global-variable bindings', () => {
  it('§1.1 resolves a bare top-level path (baseOrderSize) in the projected ladder', async () => {
    const orders = await createDCAOrders(
      { all: true, noCheck: true },
      context(SETTINGS, BOT_VARS)
    );
    // 13.3 USDT at 0.295, rounded to the 0.1 MTL step => 45 MTL => 13.275 USDT.
    // The stale literal 10.2 would give 34.5 MTL => 10.1775 USDT.
    expect(baseOrderQuote(orders)).toBeGreaterThan(13);
    expect(baseOrderQuote(orders)).toBeLessThan(13.5);
  });

  it('§1.1 leaves the settings alone when the binding is absent (identity case)', async () => {
    const orders = await createDCAOrders(
      { all: true, noCheck: true },
      context(SETTINGS, null)
    );
    expect(baseOrderQuote(orders)).toBeGreaterThan(10);
    expect(baseOrderQuote(orders)).toBeLessThan(10.3);
  });

  it('§1.1 resolveSettingsVars returns the resolved top-level value without mutating its input', async () => {
    const resolved = await resolveSettingsVars(SETTINGS, BOT_VARS);
    expect(resolved.baseOrderSize).toBe('13.3');
    expect(SETTINGS.baseOrderSize).toBe('10.2');
  });

  it('§1.1 skips a bound path the settings object does not carry', async () => {
    const resolved = await resolveSettingsVars(SETTINGS, {
      list: ['6892d1f7481591a7ffa981fa'],
      // `maxNumberOfOpenDeals` is a real bindable bot setting that is not part
      // of the ladder's settings slice — it must not be invented on the object.
      paths: [
        { path: 'maxNumberOfOpenDeals', variable: '6892d1f7481591a7ffa981fa' },
      ],
    });
    expect('maxNumberOfOpenDeals' in resolved).toBe(false);
  });

});

/**
 * Deal `6aaa0eb22942ae4fb380ba85` on the same bot, as production holds it: its
 * snapshot froze `baseOrderSize: "13.3"` when it opened.
 */
const DEAL = {
  _id: '6aaa0eb22942ae4fb380ba85',
  status: 'open',
  exchange: 'binance',
  symbol: { symbol: 'MTLUSDT', baseAsset: 'MTL', quoteAsset: 'USDT' },
  initialPrice: PRICE,
  lastPrice: PRICE,
  settings: {
    baseOrderSize: '13.3',
    orderSize: '10',
    tpPerc: '10.02',
    orderSizeType: OrderSizeTypeEnum.quote,
  },
  gridBreakpoints: [],
  tpSlTargetFilled: [],
  dynamicAr: [],
} as unknown as DCADeals;

/** The variable has since been moved to 20 — that applies to NEW deals only. */
const VARS_MOVED: BotVars = {
  list: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
  paths: [{ path: 'baseOrderSize', variable: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
};

let root: Root | null = null;
let host: HTMLElement | null = null;

async function runHook(vars: BotVars | null): Promise<DCAGrid[]> {
  let latest: DCAGrid[] = [];

  function Probe() {
    const value = useDealSmartOrders({
      bot: { settings: SETTINGS, exchangeUUID: 'uuid', vars },
      deal: DEAL,
      pendingOrders: [],
      completedOrders: [],
      enabled: true,
      computeRegardlessOfSmartOrders: true,
    });
    useEffect(() => {
      latest = value.fullLadder;
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
  return latest;
}

describe("spec 024 §1.2 — a deal's frozen snapshot wins over the variable", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it('sizes the base order at the value the deal froze, not the variable now', async () => {
    const ladder = await runHook(VARS_MOVED);
    // The deal froze 13.3; the bot's binding now reads 20. main-app spreads the
    // deal snapshot over the resolved bot settings, so 13.3 is what this deal
    // is sized at — resolving the merged object would quote 20.
    expect(baseOrderQuote(ladder)).toBeGreaterThan(13);
    expect(baseOrderQuote(ladder)).toBeLessThan(13.5);
  });

  it('still resolves a top-level binding the deal snapshot does not carry', async () => {
    // `step` is bound and absent from this deal's snapshot, so the bot's
    // resolved value is what the ladder must space its levels with.
    const ladder = await runHook({
      list: ['6892d1f7481591a7ffa981fa', 'aaaaaaaaaaaaaaaaaaaaaaaa'],
      paths: [
        { path: 'baseOrderSize', variable: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
        { path: 'tpPerc', variable: '6892d1f7481591a7ffa981fa' },
      ],
    });
    // `tpPerc` IS in the snapshot (10.02) — it must NOT become 13.3.
    const tp = ladder.find((o) => o.type === DCAOrderTypeEnum.tp);
    if (!tp) {
      throw new Error('the ladder must contain a TP order');
    }
    // SHORT bot: TP sits 10.02% BELOW the entry, not 13.3%.
    expect(tp.price / PRICE).toBeCloseTo(1 - 0.1002, 3);
  });
});
