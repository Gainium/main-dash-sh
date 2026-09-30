import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { useStableBotTransforms } from '@/hooks/useStableBotTransforms';
import { transformGridBotToBot, type GridBot } from '@/types/gridBot';

/**
 * One malformed bot record must never take down a whole bot list page: the
 * per-bot transform memo isolates a throwing transform to its own bot.
 */
describe('useStableBotTransforms — per-bot isolation', () => {
  type Raw = { id: string; bad?: boolean };
  const transform = (raw: Raw) => {
    if (raw.bad) throw new Error('malformed');
    return { id: raw.id };
  };

  test('a throwing bot is left out, the rest still render', () => {
    const raws: Raw[] = [{ id: 'a' }, { id: 'b', bad: true }, { id: 'c' }];
    const { result } = renderHook(() =>
      useStableBotTransforms(
        raws,
        (r) => r.id,
        () => undefined,
        null,
        transform
      )
    );
    expect(result.current.map((b) => b.id)).toEqual(['a', 'c']);
  });

  test('a bot that starts throwing keeps its last good output', () => {
    let raws: Raw[] = [{ id: 'a' }, { id: 'b' }];
    const { result, rerender } = renderHook(() =>
      useStableBotTransforms(
        raws,
        (r) => r.id,
        () => undefined,
        null,
        transform
      )
    );
    const goodB = result.current[1];
    raws = [raws[0], { id: 'b', bad: true }];
    rerender();
    expect(result.current).toHaveLength(2);
    expect(result.current[1]).toBe(goodB);
  });
});

describe('transformGridBotToBot — missing symbol record', () => {
  test('renders from settings.pair instead of throwing', () => {
    const bot = {
      _id: 'g',
      exchange: 'okxLinear',
      status: 'closed',
      symbol: undefined,
      settings: { pair: 'BTC-USD_UM_XPERP', profitCurrency: 'quote' },
      profit: { total: 0, totalUsd: 0 },
      usage: { current: { base: 0, quote: 0 }, max: { base: 0, quote: 0 } },
    } as unknown as GridBot;
    const out = transformGridBotToBot(bot, [], []) as unknown as {
      symbol: { baseAsset: string; quoteAsset: string };
    };
    expect(out.symbol).toMatchObject({ baseAsset: 'BTC', quoteAsset: 'USDC' });
  });
});
