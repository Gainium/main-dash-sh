/**
 * Runner note: Vitest, run from the parent:
 * `npx vitest run core/tests/tradeCardsLiveUnrealizedPnl.vitest.test.ts`
 *
 * Spec: `specs/112.trade-cards-show-stored-unrealized-pnl.md`.
 *
 * The Trading page's trade cards showed the server's stored unrealized P&L,
 * which can be far older than the Current Price printed on the same card.
 * `useDcaDeals` only carries the stored value; live values come from
 * `useLiveDealPnl`, which the page never used.
 *
 * The page cannot be mounted in jsdom without a harness larger than the fix,
 * so its wiring is held to a source-level contract; the behavioural half is
 * proven on the shared function `useLiveDealPnl` computes with.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computeDealUnrealizedPnlFromPrices } from '@/lib/utils/dealUnrealizedPnl';

const pageSource = readFileSync(
  resolve(process.cwd(), 'core/src/pages/Trading.tsx'),
  'utf8'
);

/** The source of the `forEach` block that transforms one deal list. */
const transformBlock = (list: string): string => {
  const start = pageSource.indexOf(`${list}.forEach(`);
  expect(start, `${list} transform must exist in Trading.tsx`).toBeGreaterThan(
    -1
  );
  return pageSource.slice(start, pageSource.indexOf('trades.push(', start));
};

describe('trade cards price unrealized P&L live (spec 112)', () => {
  // An open LONG spot deal as the deal list returns it, with a stored value
  // taken at a higher price than the one now on screen.
  const deal = {
    _id: 'deal-1',
    status: 'open',
    strategy: 'LONG',
    exchange: 'binance',
    exchangeUUID: 'acct-1',
    symbol: { symbol: 'XRPUSDT', quoteAsset: 'USDT' },
    avgPrice: 1.36,
    currentBalances: { base: 500, quote: 15000 },
    initialBalances: { base: 0, quote: 15680 },
    usage: { current: { base: 0, quote: 700 } },
    settings: { futures: false, coinm: false },
    stats: { unrealizedProfitNet: 7.5 },
  };
  const prices = [
    { symbol: 'XRPUSDT', price: 1.37, exchange: 'binance' },
    { symbol: 'USDTUSD', price: 1, exchange: 'all' },
  ];
  const fees = [{ exchange: 'acct-1', symbol: 'XRPUSDT', fee: 0.001 }];

  it('§1.1 values the deal at the price shown, not the stored figure', () => {
    const live = computeDealUnrealizedPnlFromPrices(deal, prices, fees);
    // 500 × 1.37 + 15000 − 15680 − 2 × 0.001 × 700
    expect(live?.unrealizedUsd).toBeCloseTo(3.6, 6);
    expect(live?.percent).toBeCloseTo((3.6 / 700) * 100, 6);
  });

  it('§1.1 feeds the open DCA and terminal deals to useLiveDealPnl', () => {
    expect(pageSource).toMatch(
      /useLiveDealPnl\(\s*openDcaLikeDeals\s*\)/
    );
    expect(pageSource).toMatch(
      /\[\.\.\.dcaDealsOnly, \.\.\.\(terminalDeals \|\| \[\]\)\]\.filter\(\(deal\) =>\s*isActiveDealStatus\(deal\.status\)/
    );
  });

  it.each(['dcaDealsOnly', 'terminalDeals'])(
    '§1.1/§1.2 the %s cards prefer the live value, then the stored one',
    (list) => {
      const block = transformBlock(list);
      expect(block).toMatch(
        /liveDealPnl\.get\(deal\._id\)\?\.unrealizedUsd \?\?\s*\(deal as \{ unrealizedUsd\?: number \}\)\.unrealizedUsd/
      );
    }
  );
});
