/**
 * Runner note: renders the real dialog in jsdom and mocks modules, so it is a
 * Vitest file. Run from the parent:
 *   npx vitest run core/tests/bug802ExecuteNextDcaDialogRows.vitest.test.tsx
 *
 * Spec 023 — the two rows the reporter photographed, end to end.
 *
 * His screenshot of the "Execute next DCA" confirmation reads
 * `Amount 3.71e-3 BTC` / `Estimated cost 300 USDT` on a deal whose safety
 * orders the engine fills for 330 USDT (77289.62 × 0.004269 = 329.96). Both
 * halves of that line are wrong and they are independent: the 300 is the
 * superseded literal on a setting bound to a global variable worth 330, and the
 * `3.71e-3` is `formatNumber` rendering a sub-0.01 quantity in exponential.
 *
 * This drives the whole surface — bot store → hook → ladder → level arithmetic
 * → rendered row — so neither half can be "fixed" in isolation without the
 * other showing up here.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  DCAConditionEnum,
  IndicatorAction,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  StrategyEnum,
  type BotVars,
  type Symbols,
} from '@/types';

const BOT_ID = '69a69be16f6867bb88a80f48';
const DEAL_ID = '6a451ff7d6c8879a4738723e';
/** Live BTCUSDT when the screenshot was taken. */
const MARKET = 80_900;

const { VARIABLES, PAIR } = vi.hoisted(() => ({
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
// The deal rests nothing on the venue (indicator condition), which is exactly
// why the dialog has to project the ladder to say anything at all.
vi.mock('@/hooks/useDealOrders', () => ({
  useDealOrders: () => ({ orders: [], total: 0, isLoading: false }),
}));
vi.mock('@/helper/price', () => ({
  default: (cb: (r: { status: string; data: { symbol: string; price: number }[] }) => void) => {
    cb({ status: 'OK', data: [{ symbol: 'BTCUSDT', price: MARKET }] });
    return () => undefined;
  },
}));

import { ExecuteNextDcaDialog } from '@/features/bots/shared/runtime/dialogs/ExecuteNextDcaDialog';
import { useDcaBotsStore, useDealStore } from '@/stores/live';

const STARTDCA = [
  { uuid: 'f74f5e1c-9ddb-4943-a590-53465402b744', minPercFromLast: '0.64', v: '69aa887b97cbd9ee784af7cc' },
  { uuid: '2e4f2129-f518-41a7-bbb7-e144e1dede1f', minPercFromLast: '0.77', v: '69aa8c4197cbd9ee784b98c8' },
  { uuid: '2144ab5f-3c20-4e3c-94af-a96c101f077c', minPercFromLast: '0.93', v: '69aa8c4c97cbd9ee784b9b4b' },
  { uuid: '30d91683-b4bd-4d37-ba86-d9216133b487', minPercFromLast: '1.11', v: '69aa8c5497cbd9ee784b9be9' },
  { uuid: '2a57fa3b-905c-4c7d-9ccc-4df97eec1569', minPercFromLast: '1.33', v: '69aa8c8197cbd9ee784ba032' },
];

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
  })),
  dcaCustom: [],
  multiTp: [],
  multiSl: [],
};

const VARS: BotVars = {
  list: [
    '69aa885d97cbd9ee784af631',
    '69aa883b97cbd9ee784af2b9',
    ...STARTDCA.map((i) => i.v),
  ],
  paths: [
    { path: 'baseOrderSize', variable: '69aa885d97cbd9ee784af631' },
    ...STARTDCA.flatMap((i) => [
      { path: `indicators.${i.uuid}.orderSize`, variable: '69aa883b97cbd9ee784af2b9' },
      { path: `indicators.${i.uuid}.minPercFromLast`, variable: i.v },
    ]),
  ] as BotVars['paths'],
};

const RAW_DEAL = {
  _id: DEAL_ID,
  status: 'open',
  exchange: 'bitget',
  exchangeUUID: 'a0fba848-4950-48d9-b54a-67b63f0fc54f',
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  initialPrice: 59713.26,
  lastPrice: 64555.66,
  avgPrice: 62267.615368555606,
  levels: { complete: 4, all: 6 },
  settings: { orderSizeType: OrderSizeTypeEnum.quote },
  gridBreakpoints: [],
  tpSlTargetFilled: [],
  dynamicAr: [],
  pendingAddFunds: [],
};

/** What the deals table hands the dialog for this deal. */
const TRADE = {
  id: DEAL_ID,
  botId: BOT_ID,
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  strategy: 'short',
  levels: { complete: 4, all: 6 },
  avgPrice: 62267.615368555606,
  usage: { current: { base: 0.016429, quote: 0 } },
};

let root: Root | null = null;
let host: HTMLElement | null = null;

/** The dialog's figure rows, as `{ label: value }`. */
async function renderRows(vars: BotVars | null): Promise<Record<string, string>> {
  useDcaBotsStore.setState({
    bots: {
      [BOT_ID]: {
        _id: BOT_ID,
        settings: SETTINGS,
        exchangeUUID: 'a0fba848-4950-48d9-b54a-67b63f0fc54f',
        vars,
      },
    },
  } as never);
  useDealStore.setState({ deals: { [BOT_ID]: { [DEAL_ID]: RAW_DEAL } } } as never);

  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  await act(async () => {
    r.render(
      createElement(ExecuteNextDcaDialog, {
        open: true,
        onOpenChange: () => undefined,
        trade: TRADE as never,
        currentPrice: MARKET,
        onConfirm: () => undefined,
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const rows: Record<string, string> = {};
  // Radix portals the content onto document.body.
  document.body.querySelectorAll('div.flex.justify-between').forEach((row) => {
    const [label, value] = Array.from(row.children);
    if (label && value) {
      rows[label.textContent?.trim() ?? ''] = (value.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  });
  return rows;
}

describe('spec 023 — the Execute next DCA rows on the reporter\'s deal', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it('quotes the bound budget, in units of the asset', async () => {
    const rows = await renderRows(VARS);

    // The bound budget (330, rounded through the level's price/qty precision)
    // and that budget in BTC at ~80.9K — the reporter's expected figures, in
    // units he can compare against Bitget.
    expect(rows['Estimated cost']).toBe('330.04 USDT');
    expect(rows['Amount']).toBe('0.00407966 BTC');
    expect(rows['Amount']).not.toMatch(/e-/);
  });

  it('still states the level after this one as an unchanged budget', async () => {
    const rows = await renderRows(VARS);

    expect(rows['Level 5 after this']).toBe('329.98 USDT · unchanged');
  });

  it('falls back to the configured literal when nothing is bound', async () => {
    // Not an endorsement of 300 — it is what an UNBOUND bot configures, and it
    // pins that this fix changes nothing for bots without global variables.
    const rows = await renderRows(null);

    expect(rows['Estimated cost']).toBe('300.04 USDT');
  });
});
