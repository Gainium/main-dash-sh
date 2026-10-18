import { test, expect } from '@playwright/test';

import {
  buildHedgeConfig,
  comboLegSettings,
  withoutComboLegFields,
  defaultHedgeLegAction,
  hedgeLegActionOptions,
  hedgeLegPreviewInput,
  hedgeStartLegs,
  isSpotHedge,
  resolvePairPrice,
  sumHedgeLegOrders,
} from '@/lib/baseFunding/hedgeFunding';
import { chooseStatusDialog } from '@/features/bots/actions/botActions';
import { toBotRef } from '@/features/bots/actions/botRef';
import {
  ActionsEnum,
  BotOrderSideEnum,
  DCAOrderTypeEnum,
  StrategyEnum,
  type DCAGrid,
} from '@/types';

const order = (
  type: DCAOrderTypeEnum,
  qty: number,
  price: number,
  extra: Partial<DCAGrid> = {}
): DCAGrid => ({
  type,
  qty,
  price,
  side: BotOrderSideEnum.buy,
  id: `${type}-${qty}-${price}`,
  pair: 'BTCUSDT',
  ...extra,
});

const leg = (strategy: StrategyEnum, exchange: string, extra = {}) => ({
  _id: `leg-${strategy}`,
  exchange,
  exchangeUUID: 'acc-1',
  settings: { strategy, useDca: true, ...extra },
  symbol: [
    { key: 'BTCUSDT', value: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' } },
  ],
});

test.describe('hedge start funding inputs', () => {
  test('sums the base order and every DCA level, hidden ones included', () => {
    const totals = sumHedgeLegOrders([
      order(DCAOrderTypeEnum.bo, 1, 100),
      order(DCAOrderTypeEnum.dca, 2, 90),
      // A level an active combo minigrid executes: hidden, still committed.
      order(DCAOrderTypeEnum.dca, 3, 80, { hide: true }),
      order(DCAOrderTypeEnum.tp, 6, 110),
      order(DCAOrderTypeEnum.grid, 0.5, 85),
    ]);
    expect(totals).toEqual({
      baseOrderQty: 1,
      baseOrderQuote: 100,
      safetyQty: 5,
      safetyQuote: 2 * 90 + 3 * 80,
      safetyLevels: 2,
    });
  });

  test('builds the contract leg input', () => {
    expect(
      hedgeLegPreviewInput(
        { side: StrategyEnum.short, useDca: true },
        ActionsEnum.buyDiff,
        { baseOrderQty: 1, baseOrderQuote: 100, safetyQty: 5, safetyQuote: 420, safetyLevels: 2 }
      )
    ).toEqual({
      side: StrategyEnum.short,
      action: ActionsEnum.buyDiff,
      baseOrderQty: 1,
      safetyQty: 5,
      safetyQuote: 420,
      useDca: true,
    });
  });

  test('combo legs carry gridLevel, level count and fee order; DCA legs never do', () => {
    const totals = { baseOrderQty: 1, baseOrderQuote: 100, safetyQty: 5, safetyQuote: 420, safetyLevels: 3 };
    const dca = hedgeLegPreviewInput({ side: StrategyEnum.short, useDca: true }, ActionsEnum.buyDiff, totals);
    expect(Object.keys(dca).sort()).toEqual(
      ['action', 'baseOrderQty', 'safetyQty', 'safetyQuote', 'side', 'useDca']
    );
    const combo = hedgeLegPreviewInput(
      { side: StrategyEnum.short, useDca: true },
      ActionsEnum.buyDiff,
      totals,
      comboLegSettings({ gridLevel: '4', feeOrder: true })
    );
    expect(combo).toEqual({ ...dca, comboGridLevel: 4, safetyLevels: 3, feeOrder: true });
    expect(withoutComboLegFields(combo)).toEqual(dca);
  });

  test('combo leg settings read like the engine: gridLevel defaults to 1, no fee order on futures', () => {
    expect(comboLegSettings({})).toEqual({ gridLevel: 1, feeOrder: false });
    expect(comboLegSettings({ gridLevel: 3, feeOrder: true, futures: true })).toEqual({
      gridLevel: 3,
      feeOrder: false,
    });
    expect(comboLegSettings({ gridLevel: 'x', feeOrder: false })).toEqual({ gridLevel: 1, feeOrder: false });
  });

  test('keeps the last price per pair when a price answer omits it', () => {
    const memory = new Map<string, number>();
    const btc = { exchange: 'binance', pair: 'BTCUSDT' };
    expect(resolvePairPrice([], btc, memory)).toEqual({ price: 0, remembered: false });
    expect(
      resolvePairPrice([{ symbol: 'BTC/USDT', exchange: 'binance', price: 100 }], btc, memory)
    ).toEqual({ price: 100, remembered: false });
    // A partial answer without the pair: the last price, marked remembered.
    expect(
      resolvePairPrice([{ symbol: 'ETHUSDT', exchange: 'binance', price: 5 }], btc, memory)
    ).toEqual({ price: 100, remembered: true });
    // Another exchange's price is not this leg's.
    expect(
      resolvePairPrice([{ symbol: 'BTCUSDT', exchange: 'kucoin', price: 90 }], btc, memory)
    ).toEqual({ price: 100, remembered: true });
    expect(
      resolvePairPrice([{ symbol: 'BTCUSDT', exchange: 'binance', price: 101 }], btc, memory)
    ).toEqual({ price: 101, remembered: false });
  });

  test('offers each leg its legacy actions', () => {
    expect(hedgeLegActionOptions(StrategyEnum.long, true)).toEqual([
      ActionsEnum.useBalance,
      ActionsEnum.sellDiff,
      ActionsEnum.sellForAll,
      ActionsEnum.useOppositeBalance,
    ]);
    expect(hedgeLegActionOptions(StrategyEnum.short, true)).toEqual([
      ActionsEnum.useBalance,
      ActionsEnum.buyDiff,
      ActionsEnum.buyForAll,
      ActionsEnum.useOppositeBalance,
    ]);
    // Without DCA the funding actions are not offered.
    expect(hedgeLegActionOptions(StrategyEnum.short, false)).toEqual([
      ActionsEnum.useBalance,
      ActionsEnum.useOppositeBalance,
    ]);
  });

  test('defaults like the legacy dialog', () => {
    const totals = { baseOrderQty: 1, baseOrderQuote: 100, safetyQty: 4, safetyQuote: 360, safetyLevels: 4 };
    // Held balance covers the deal → use it.
    expect(
      defaultHedgeLegAction(StrategyEnum.short, true, totals, { base: 5, quote: 0 })
    ).toBe(ActionsEnum.useBalance);
    expect(
      defaultHedgeLegAction(StrategyEnum.long, true, totals, { base: 0, quote: 460 })
    ).toBe(ActionsEnum.useBalance);
    // Short of it with DCA on → the difference action.
    expect(
      defaultHedgeLegAction(StrategyEnum.short, true, totals, { base: 1, quote: 1000 })
    ).toBe(ActionsEnum.buyDiff);
    expect(
      defaultHedgeLegAction(StrategyEnum.long, true, totals, { base: 10, quote: 0 })
    ).toBe(ActionsEnum.sellDiff);
    // No DCA: the opposite balance when it covers the deal.
    expect(
      defaultHedgeLegAction(StrategyEnum.short, false, totals, { base: 0, quote: 460 })
    ).toBe(ActionsEnum.useOppositeBalance);
    expect(
      defaultHedgeLegAction(StrategyEnum.short, false, totals, { base: 0, quote: 0 })
    ).toBe(ActionsEnum.useBalance);
  });

  test('hedgeConfig carries the chosen spot actions; futures legs use their balance', () => {
    const spot = hedgeStartLegs({
      bots: [leg(StrategyEnum.short, 'binance'), leg(StrategyEnum.long, 'binance')],
    });
    expect(spot.map((l) => l.side)).toEqual([StrategyEnum.long, StrategyEnum.short]);
    expect(
      buildHedgeConfig(spot, {
        [StrategyEnum.long]: ActionsEnum.sellDiff,
        [StrategyEnum.short]: ActionsEnum.buyForAll,
      })
    ).toEqual({
      [StrategyEnum.long]: ActionsEnum.sellDiff,
      [StrategyEnum.short]: ActionsEnum.buyForAll,
    });
    const futures = hedgeStartLegs({
      bots: [leg(StrategyEnum.long, 'binanceUsdm'), leg(StrategyEnum.short, 'binanceUsdm')],
    });
    expect(buildHedgeConfig(futures, { [StrategyEnum.long]: ActionsEnum.sellDiff })).toEqual({
      [StrategyEnum.long]: ActionsEnum.useBalance,
      [StrategyEnum.short]: ActionsEnum.useBalance,
    });
  });

  test('spot detection: exchange market, settings.futures wins, unknown legs stay plain', () => {
    expect(isSpotHedge({ bots: [leg(StrategyEnum.long, 'binance'), leg(StrategyEnum.short, 'binance')] })).toBe(true);
    expect(isSpotHedge({ bots: [leg(StrategyEnum.long, 'binanceUsdm'), leg(StrategyEnum.short, 'binanceUsdm')] })).toBe(false);
    expect(
      isSpotHedge({ bots: [leg(StrategyEnum.long, 'binance', { futures: true })] })
    ).toBe(false);
    expect(isSpotHedge({ _id: 'h', status: 'closed' })).toBe(false);
    expect(isSpotHedge({ bots: [{ settings: { strategy: StrategyEnum.long } }] })).toBe(false);
  });

  test('a stopped spot hedge starts through the hedge start dialog in both flows', () => {
    const spotRef = toBotRef(
      { _id: 'h1', status: 'closed', bots: [leg(StrategyEnum.long, 'binance'), leg(StrategyEnum.short, 'binance')] },
      'hedgeDca'
    );
    expect(spotRef.hedge).toEqual({ spot: true });
    expect(chooseStatusDialog(spotRef, 'confirm')).toBe('hedgeStart');
    expect(chooseStatusDialog(spotRef, 'form')).toBe('hedgeStart');

    const futuresRef = toBotRef(
      { _id: 'h2', status: 'closed', bots: [leg(StrategyEnum.long, 'binanceUsdm'), leg(StrategyEnum.short, 'binanceUsdm')] },
      'hedgeCombo'
    );
    expect(chooseStatusDialog(futuresRef, 'confirm')).toBe('confirm');
    expect(chooseStatusDialog(futuresRef, 'form')).toBe('none');

    // Stopping a running spot hedge keeps the stop flow.
    const running = { ...spotRef, active: true, status: 'open' };
    expect(chooseStatusDialog(running, 'confirm')).toBe('confirm');
  });
});
