import { test, expect } from '@playwright/test';

import {
  dealWorkingMs,
  dealWorkingTimeSortValue,
} from '@/lib/utils/tradingMetrics';

/**
 * Bug #567 — a CLOSED deal's "Working Time" kept counting up forever.
 *
 * Every surface that showed a deal's working time computed `Date.now() -
 * createTime` with no regard for whether the deal had ended, so a finished
 * deal's runtime grew by another day every day. On the reporter's bot on
 * 2026-08-29 all 100 closed deals on the first page were overstated (median
 * +2D 15H); the two-minute TURBO deal below rendered "4D 4H".
 *
 * The fixtures are REAL: four closed deals read off the reporter's Coinbase DCA
 * bot (`6a8b89e98e06bef801add796`) via the dashboard GraphQL on 2026-08-29,
 * spanning the shortest and longest deals the bot has run. `ranMs` is what the
 * deal actually took — `closeTime - createTime`, straight from the API.
 *
 * V1 (`main-dash/components/dcabot/utils.ts`) is the oracle here:
 * `friendlyTime((isNotActiveDeal(d) ? d.closeTime ?? d.updateTime : now) - d.createTime)`.
 */
const CLOSED_FIXTURES = [
  {
    symbol: 'TURBO-USDC',
    status: 'closed',
    createTime: 1787624191588,
    closeTime: 1787624289050,
    updateTime: 1787624286788,
    ranMs: 97462, // ~2 minutes
  },
  {
    symbol: 'CLANKER-USDC',
    status: 'closed',
    createTime: 1787746622924,
    closeTime: 1787746774583,
    updateTime: 1787746772076,
    ranMs: 151659, // ~3 minutes
  },
  {
    symbol: 'CHZ-USDC',
    status: 'closed',
    createTime: 1787548153494,
    closeTime: 1787571301229,
    updateTime: 1787571298761,
    ranMs: 23147735, // ~6h 26m
  },
  {
    symbol: 'BTC-USDC',
    status: 'closed',
    createTime: 1787624395722,
    closeTime: 1787879937000,
    updateTime: 1787879934737,
    ranMs: 255541278, // ~2d 23h
  },
];

test('a closed deal stops at its close time, not at now', () => {
  for (const deal of CLOSED_FIXTURES) {
    expect(
      dealWorkingMs(deal),
      `${deal.symbol} should report the time it actually ran`
    ).toBe(deal.ranMs);
  }
});

test('a closed deal does not keep growing as time passes', () => {
  // The defect is that the value is a function of NOW. Read each fixture twice
  // with a real gap between the reads: a correct implementation returns the
  // same number, the old one returns a bigger one.
  const first = CLOSED_FIXTURES.map(dealWorkingMs);
  const start = Date.now();
  while (Date.now() - start < 1100) {
    /* let the wall clock move past a full second */
  }
  const second = CLOSED_FIXTURES.map(dealWorkingMs);
  expect(second).toEqual(first);
});

test('canceled deals are terminal too; closeTime wins over updateTime', () => {
  const [base] = CLOSED_FIXTURES;
  if (!base) throw new Error('fixtures are empty');
  expect(dealWorkingMs({ ...base, status: 'canceled' })).toBe(base.ranMs);
  // Status match is case-insensitive — `OpenTrade` rows can carry it capitalized.
  expect(dealWorkingMs({ ...base, status: 'Closed' })).toBe(base.ranMs);
  // No closeTime (older records): fall back to updateTime, never to now.
  expect(dealWorkingMs({ ...base, closeTime: null })).toBe(
    base.updateTime - base.createTime
  );
});

test('a live deal still counts up to now', () => {
  const openedMs = 3 * 60 * 60 * 1000;
  for (const status of ['open', 'start', 'error']) {
    const ms = dealWorkingMs({
      status,
      createTime: Date.now() - openedMs,
      // A live deal carries an updateTime; it must NOT be treated as an end.
      updateTime: Date.now() - openedMs + 1000,
    });
    expect(Math.abs(ms - openedMs), `status "${status}" counts to now`).toBeLessThan(
      5000
    );
  }
  // An unrecognised status keeps the old live-counting behaviour rather than
  // silently freezing at a timestamp that may not mean "it ended".
  const unknown = dealWorkingMs({
    status: 'something-new',
    createTime: Date.now() - openedMs,
    closeTime: Date.now() - openedMs + 1000,
  });
  expect(Math.abs(unknown - openedMs)).toBeLessThan(5000);
});

test('a deal with no createTime reports nothing, not a random runtime', () => {
  expect(dealWorkingMs({ status: 'closed' })).toBe(0);
  expect(dealWorkingMs({ status: 'open', createTime: null })).toBe(0);
});

test('the Working Time column sorts by how long deals ran, not how old they are', () => {
  // These are the `OpenTrade` rows the deal tables build: `created` as epoch ms,
  // `closeTime`/`updateTime` as ISO strings.
  const rows = CLOSED_FIXTURES.map((d) => ({
    status: d.status,
    created: d.createTime,
    closeTime: new Date(d.closeTime).toISOString(),
    updateTime: new Date(d.updateTime).toISOString(),
    ranMs: d.ranMs,
  }));

  for (const row of rows) {
    expect(dealWorkingTimeSortValue(row)).toBeCloseTo(row.ranMs / 60_000, 6);
  }

  // Ordering by the accessor must match ordering by real duration. Before the
  // fix every row's value was `now - created`, so the Closed tab ordered by
  // deal AGE: BTC-USDC (the longest deal, 2d 23h) ranked BELOW CLANKER-USDC
  // (3 minutes) purely because it started later.
  const byAccessor = [...rows]
    .sort((a, b) => dealWorkingTimeSortValue(a) - dealWorkingTimeSortValue(b))
    .map((r) => r.ranMs);
  expect(byAccessor).toEqual([...rows].map((r) => r.ranMs).sort((a, b) => a - b));
});
