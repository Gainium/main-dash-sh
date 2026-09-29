import { describe, expect, test } from 'vitest';

import { transformDcaBotToBot } from '@/types/dcaBot';

/**
 * A bot whose `symbol` map came back empty while `settings.pair` still lists
 * its pairs used to throw on `symbol[0].value` inside the list transform,
 * taking down the whole Trading Bots page for that user. The transform must
 * render it from `settings.pair` instead.
 *
 * Spec §1 of main-app `core/specs/119.bot-save-empties-symbol-map-while-eu-pairs-are-missing.md`.
 */

const makeBot = (pair: string[], symbol: unknown[]) =>
  ({
    _id: 'bot',
    uuid: 'bot',
    exchange: 'okxLinear',
    exchangeUUID: 'ex',
    status: 'open',
    created: Date.now(),
    symbol,
    settings: {
      name: 'xperp',
      pair,
      strategy: 'LONG',
      futures: true,
      coinm: false,
      profitCurrency: 'quote',
      useMulti: true,
    },
    usage: {
      current: { base: 0, quote: 0 },
      max: { base: 0, quote: 100 },
    },
    profit: { total: 0, totalUsd: 0 },
    workingShift: [],
    currentBalances: { base: [], quote: [] },
    deals: { all: 0, active: 0 },
    dealsInBot: { all: 0, active: 0 },
  }) as never;

describe('transformDcaBotToBot — empty symbol map', () => {
  test('renders from settings.pair instead of throwing', () => {
    const pair = ['BTC-USD_UM_XPERP', 'AAPL-USD_UM_XPERP'];
    const out = transformDcaBotToBot(makeBot(pair, []), [], []) as {
      symbol: { key: string; value: { baseAsset: string; quoteAsset: string } }[];
    };
    expect(out.symbol.map((s) => s.key)).toEqual(pair);
    expect(out.symbol[0].value).toMatchObject({
      baseAsset: 'BTC',
      quoteAsset: 'USDC',
    });
  });

  test('leaves a populated symbol map untouched', () => {
    const symbol = [
      {
        key: 'BTC-USD_UM_XPERP',
        value: { symbol: 'BTC-USD_UM_XPERP', baseAsset: 'BTC', quoteAsset: 'USDC' },
      },
    ];
    const bot = makeBot(['BTC-USD_UM_XPERP', 'AAPL-USD_UM_XPERP'], symbol);
    const out = transformDcaBotToBot(bot, [], []) as { symbol: unknown[] };
    expect(out.symbol).toBe(symbol);
  });
});
