import { test, expect } from '@playwright/test';

import {
  dcaLadderLevels,
  ladderAhead,
  levelQuoteBudget,
  levelSizeAtMarket,
  resolveNextLevels,
  type LadderLevel,
} from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';
import { DCAOrderTypeEnum } from '@/types';

/**
 * Spec 017 §5 (main-app-sh `specs/017.execute-next-dca-order-controls.md`).
 *
 * The "Execute next DCA" confirmation must always be able to say how big the
 * order is, what it costs, and where the average lands. Its first version read
 * that from a RESTING exchange order, which meant it showed none of the three
 * on the two configurations that never rest safety orders at all:
 *
 *  - `dcaByMarket` — `placeOrders` skips every `dealRegular` send;
 *  - `dcaCondition: 'indicators'` — `createCurrentDealOrders` strips
 *    `dealRegular` entries entirely; the levels fire on a signal.
 *
 * So the dialog now merges real resting orders with the client-side projection
 * and picks the nearest rung out of both. These lock the merge, because every
 * way of getting it wrong misreports the size of a real order the user is
 * about to send.
 */

const level = (
  price: number,
  qty: number,
  projected = false
): LadderLevel => ({ price, qty, projected });

test('a long ladder reads downwards — the highest rung is next', () => {
  const ahead = ladderAhead(
    [level(96.22, 4.17), level(102.3, 1.97), level(99.47, 2.69)],
    true
  );

  expect(ahead.map((l) => l.price)).toEqual([102.3, 99.47, 96.22]);
});

test('a short ladder reads upwards — the lowest rung is next', () => {
  const ahead = ladderAhead(
    [level(112.4, 4.17), level(105.1, 1.97), level(108.8, 2.69)],
    false
  );

  expect(ahead.map((l) => l.price)).toEqual([105.1, 108.8, 112.4]);
});

test('a purely projected ladder still yields a next level with a size', () => {
  // The dcaByMarket / indicator case: nothing rests on the venue, so every
  // rung is projected. Before this merge the dialog had no size at all here
  // and silently dropped Amount, Estimated cost and Average price.
  const ahead = ladderAhead(
    [level(99.47, 2.69, true), level(102.3, 1.97, true)],
    true
  );

  expect(ahead.length).toBe(2);
  expect(ahead[0].price).toBe(102.3);
  expect(ahead[0].qty).toBe(1.97);
  expect(ahead[0].projected).toBe(true);
});

test('a real order and the projection that predicted it are ONE level', () => {
  // `useDealSmartOrders` already dedupes by price, but the dialog merges two
  // independently-sourced lists — double-counting here would show the user the
  // wrong rung as "next" and quote the level below it as the one after.
  const ahead = ladderAhead(
    [level(102.3, 1.97, true), level(102.3, 1.97, false), level(99.47, 2.69, true)],
    true
  );

  expect(ahead.length).toBe(2);
  expect(ahead[0].projected).toBe(false);
});

test('the real order wins on quantity, whichever order they arrive in', () => {
  // The venue's own quantity is authoritative — the projection is an estimate
  // built from settings, and rounding to the pair's step size can differ.
  const projectionFirst = ladderAhead(
    [level(102.3, 1.9, true), level(102.3, 1.97, false)],
    true
  );
  const realFirst = ladderAhead(
    [level(102.3, 1.97, false), level(102.3, 1.9, true)],
    true
  );

  expect(projectionFirst[0].qty).toBe(1.97);
  expect(realFirst[0].qty).toBe(1.97);
});

test('unusable rungs are dropped rather than quoted as a zero-size order', () => {
  const ahead = ladderAhead(
    [
      level(0, 1.97),
      level(102.3, 0),
      level(Number.NaN, 1.97),
      level(99.47, Number.POSITIVE_INFINITY),
      level(96.22, 4.17),
    ],
    true
  );

  expect(ahead.map((l) => l.price)).toEqual([96.22]);
});

test('an empty ladder yields nothing, not an undefined-shaped level', () => {
  expect(ladderAhead([], true)).toEqual([]);
});

/* ------------------------------------------------------------------------- *
 * Selecting the level by POSITION, the way the engine does.
 *
 * The first projection-based version returned nothing at all on the deals list,
 * and on a bot that rests nothing on the venue it could not have been trusted
 * even with full settings: levels already bought at market no longer sit at
 * their ladder prices, so a price-proximity pick would quote level 1 on a deal
 * that is on level 3. The engine picks `levelNumber === levels.complete`; so do
 * these.
 * ------------------------------------------------------------------------- */


// A 4-level long ladder as the generator emits it: start order, then each DCA
// level in order, then TP — sizes doubling so a wrong index is obvious.
const generated = [
  { type: DCAOrderTypeEnum.bo, price: 100, qty: 0.2 },
  { type: DCAOrderTypeEnum.dca, price: 98, qty: 0.2 },
  { type: DCAOrderTypeEnum.dca, price: 96, qty: 0.4 },
  { type: DCAOrderTypeEnum.dca, price: 94, qty: 0.8 },
  { type: DCAOrderTypeEnum.dca, price: 92, qty: 1.6 },
  { type: DCAOrderTypeEnum.tp, price: 105, qty: 3.2 },
];
const ladder = dcaLadderLevels(generated, DCAOrderTypeEnum.dca);

test('the ladder keeps only DCA levels, in level order', () => {
  expect(ladder.map((l) => l.price)).toEqual([98, 96, 94, 92]);
});

test('nothing resting: the next level is chosen by position, not by price', () => {
  // A by-market / indicator deal on its 3rd DCA level: base + 2 levels filled,
  // so levels.complete = 3 and nothing rests on the venue.
  const { current, after } = resolveNextLevels({
    resting: [],
    ladder,
    levelsComplete: 3,
    isLong: true,
  });

  expect(current?.price).toBe(94);
  expect(current?.qty).toBe(0.8);
  expect(after?.price).toBe(92);
});

test('a fresh deal quotes level 1, and the level after it', () => {
  const { current, after } = resolveNextLevels({
    resting: [],
    ladder,
    levelsComplete: 1,
    isLong: true,
  });

  expect(current?.price).toBe(98);
  expect(after?.price).toBe(96);
});

test('on the last level there is no level after it', () => {
  const { current, after } = resolveNextLevels({
    resting: [],
    ladder,
    levelsComplete: 4,
    isLong: true,
  });

  expect(current?.price).toBe(92);
  expect(after).toBeUndefined();
});

test('a resting order supplies price and size — the venue is authoritative', () => {
  // Smart orders on: only the next level rests, with the venue's own rounding.
  const { current, after } = resolveNextLevels({
    resting: [{ price: 94, qty: 0.79, projected: false }],
    ladder,
    levelsComplete: 3,
    isLong: true,
  });

  expect(current?.qty).toBe(0.79);
  expect(current?.projected).toBe(false);
  // Nothing else rests, so the level after it comes from the ladder by position.
  expect(after?.price).toBe(92);
});

test('a pending add-funds limit order is not taken for the next DCA level', () => {
  // It is a dealRegular order resting CLOSER to price than the real level, so
  // without the exclusion it would be quoted as "next DCA" at the wrong size.
  const { current } = resolveNextLevels({
    resting: [
      { price: 97, qty: 0.05, projected: false },
      { price: 94, qty: 0.8, projected: false },
    ],
    ladder,
    levelsComplete: 3,
    isLong: true,
    excludePrices: [97],
  });

  expect(current?.price).toBe(94);
});

test('no settings and nothing resting yields no level rather than a wrong one', () => {
  const { current, after } = resolveNextLevels({
    resting: [],
    ladder: [],
    levelsComplete: 2,
    isLong: true,
  });

  expect(current).toBeUndefined();
  expect(after).toBeUndefined();
});

/**
 * Spec `021` (`main-dash-redesign` `specs/021.…`) — a level executed NOW is not
 * sized the way the ladder drew it.
 *
 * The client ladder sizes every quote-denominated level against its OWN price,
 * chained off `deal.initialPrice`. The engine, asked to fill that level early,
 * regenerates the ladder with the market price as the sizing argument
 * (`createInitialDealOrders`' 5th parameter), so the quantity floats and the
 * quote spend stays the level's budget. Quoting the ladder quantity at the
 * market price counts the price move twice.
 */

const QUOTE_LEVEL = level(61799, 300 / 61799, true);

test("a level's budget is its price times its quantity", () => {
  // For a quote-sized level this IS the configured order size — that is what
  // makes it the figure both sides agree on.
  expect(levelQuoteBudget(QUOTE_LEVEL)).toBeCloseTo(300, 6);
  expect(levelQuoteBudget(undefined)).toBeUndefined();
  expect(levelQuoteBudget(level(0, 5))).toBeUndefined();
});

test('a quote level executed now spends its budget, not its budget scaled by the move', () => {
  const market = 80617;

  const qty = levelSizeAtMarket(QUOTE_LEVEL, market, true);

  // What the engine sends, and therefore what the dialog must quote.
  expect(qty).toBeCloseTo(300 / market, 12);
  expect((qty ?? 0) * market).toBeCloseTo(300, 6);
  // The ladder quantity priced at market is the defect: 30% over budget here.
  expect(QUOTE_LEVEL.qty * market).toBeGreaterThan(390);
});

test('the rescaled quantity is the budget divided by the fill price', () => {
  // The deal's own filled safety orders: three different prices, one budget.
  for (const price of [60154.96, 62514.55, 64555.66]) {
    const qty = levelSizeAtMarket(QUOTE_LEVEL, price, true);
    expect((qty ?? 0) * price).toBeCloseTo(300, 6);
  }
});

test('a level that does not re-size with price keeps its configured quantity', () => {
  // `base` is a fixed quantity; `usd` and the two percent types divide by a
  // price the engine reads identically on both sides. None may be rescaled.
  const baseLevel = level(61799, 0.004, true);

  expect(levelSizeAtMarket(baseLevel, 80617, false)).toBe(0.004);
});

test('no market price falls back to the configured quantity', () => {
  // The dialog's price feed is best-effort; without it the rows must still
  // render what the ladder knows rather than blanking.
  expect(levelSizeAtMarket(QUOTE_LEVEL, undefined, true)).toBe(QUOTE_LEVEL.qty);
  expect(levelSizeAtMarket(QUOTE_LEVEL, 0, true)).toBe(QUOTE_LEVEL.qty);
  expect(levelSizeAtMarket(undefined, 80617, true)).toBeUndefined();
});
