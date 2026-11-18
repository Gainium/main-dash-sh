import { describe, expect, test } from 'vitest';

import {
  CloseConditionEnum,
  DCAConditionEnum,
  OrderSizeTypeEnum,
} from '@/types';
import {
  describeBacktestDca,
  describeBacktestSl,
  describeBacktestTp,
} from '@/utils/backtest/settings-summary';

/**
 * Backtest Stats tab "Full settings": the TP/SL/DCA summaries describe what
 * the bot really uses. A percentage target is shown only when the deal closes
 * on it (condition `tp`); otherwise the saved tpPerc/slPerc are unused
 * defaults and the condition is shown. The DCA order size is in the order
 * currency, not the profit currency.
 */

// a base-profit long that closes by indicator, stops by webhook with Move SL,
// and places DCA orders by indicator — with stale percentage defaults saved
const indicatorBot = {
  useTp: true,
  tpPerc: '3',
  dealCloseCondition: CloseConditionEnum.techInd,
  useSl: true,
  slPerc: '-10',
  dealCloseConditionSL: CloseConditionEnum.webhook,
  moveSL: true,
  moveSLTrigger: '1.1',
  moveSLValue: '1',
  useDca: true,
  dcaCondition: DCAConditionEnum.indicators,
  ordersCount: 32,
  orderSize: '33',
  orderSizeType: OrderSizeTypeEnum.quote,
  step: '2',
};

describe('backtest settings summary', () => {
  test('non-percentage close conditions are shown instead of unused targets', () => {
    expect(describeBacktestTp(indicatorBot)).toBe('TP: Indicators');
    expect(describeBacktestSl(indicatorBot)).toBe(
      'SL: Webhook, Move SL 1.1% → 1%'
    );
    expect(describeBacktestDca(indicatorBot, 'USDT', 'BTC')).toBe(
      'DCA: Indicators'
    );
  });

  test('percentage conditions keep their targets', () => {
    const pct = {
      ...indicatorBot,
      dealCloseCondition: CloseConditionEnum.tp,
      dealCloseConditionSL: CloseConditionEnum.tp,
      dcaCondition: DCAConditionEnum.percentage,
      moveSL: false,
    };
    expect(describeBacktestTp(pct)).toBe('TP 3%');
    expect(describeBacktestSl(pct)).toBe('SL -10%');
    // orders sized in USDT on a BTC-profit bot are labelled USDT
    expect(describeBacktestDca(pct, 'USDT', 'BTC')).toBe(
      "DCA max/grid's 32 orders each 33 USDT step 2% levels"
    );
    expect(
      describeBacktestDca(
        { ...pct, orderSizeType: OrderSizeTypeEnum.base, orderSize: '0.001' },
        'USDT',
        'BTC'
      )
    ).toBe("DCA max/grid's 32 orders each 0.001 BTC step 2% levels");
  });

  test('a missing condition is the engine default (percentage)', () => {
    const legacy = {
      useTp: true,
      tpPerc: '2',
      useSl: true,
      slPerc: '-5',
      moveSL: true,
      moveSLTrigger: '3',
      moveSLValue: '0.5',
    };
    expect(describeBacktestTp(legacy)).toBe('TP 2%');
    expect(describeBacktestSl(legacy)).toBe('SL -5%, Move SL 3% → 0.5%');
  });

  test('multi TP/SL list every target', () => {
    const multi = {
      useTp: true,
      useMultiTp: true,
      multiTp: [
        { target: '2', amount: '50', uuid: 'a' },
        { target: '4', amount: '50', uuid: 'b' },
      ],
      useSl: true,
      useMultiSl: true,
      multiSl: [{ target: '-5', amount: '100', uuid: 'c' }],
    };
    expect(describeBacktestTp(multi)).toBe('TP 2%, 4%');
    expect(describeBacktestSl(multi)).toBe('SL -5%');
  });

  test('disabled TP/SL/DCA', () => {
    expect(describeBacktestTp({ useTp: false })).toBe('Not use TP');
    expect(describeBacktestSl(undefined)).toBe('Not use SL');
    expect(describeBacktestDca({ useDca: false })).toBe('DCA not used');
  });
});
