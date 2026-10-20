// The browser is behind the account's zone — the condition that shifted every
// daily bar. Set before any Date is built; Node re-reads TZ on change.
process.env.TZ = 'America/New_York';

import { test, expect } from '@playwright/test';

import type { GridProfitEntry } from '@/hooks/useGridBotProfit';
import { buildChartData } from '@/components/widgets/bots/drawer/botProfitChartData';

/**
 * Bot drawer Profit widget: day and week buckets (spec 127 in the cloud repo).
 *
 * `getProfitByBot` keys daily rows by the ACCOUNT time zone's midnight and
 * weekly rows as "<year>-<week>". The chart has to build its windows in that
 * same zone and decode those keys — not use browser-local midnight, and not
 * parse "2026-42" with `new Date`.
 */

const row = (date: string, profitUsd: number): GridProfitEntry => ({
  date,
  profitUsd,
  quote: profitUsd,
  base: profitUsd,
});

const opts = (timeframe: number, over: Partial<Parameters<typeof buildChartData>[1]> = {}) => ({
  showCurrency: 'usd' as const,
  profitCurrency: 'quote',
  latestPrice: 0,
  timeframe,
  timeZone: 'UTC',
  weekStart: 'm',
  // 2026-10-19 19:48 in New York — already Oct 19 in UTC, and not yet Oct 20.
  now: Date.UTC(2026, 9, 19, 23, 48),
  ...over,
});

// The rows the API returned for the reported bot (account zone UTC).
const DAILY = [
  row('2026-10-16T00:00:00.000Z', 13.74),
  row('2026-10-17T00:00:00.000Z', 12.73),
  row('2026-10-19T00:00:00.000Z', 3.49),
];

test('§1.1 daily rows land on their own account-zone day; today is the last bar', () => {
  const list = buildChartData(DAILY, opts(0));
  expect(list).toHaveLength(30);
  const byDate = Object.fromEntries(list.map((p) => [p.date, p.value]));
  expect(byDate['Oct 16']).toBe(13.74);
  expect(byDate['Oct 17']).toBe(12.73);
  expect(byDate['Oct 18']).toBe(0);
  expect(byDate['Oct 19']).toBe(3.49);
  expect(list[list.length - 1]).toMatchObject({ date: 'Oct 19', value: 3.49 });
  expect(list[0].date).toBe('Sep 20');
});

test('§1.1 a DST account zone matches by calendar day, incl. the server +1h shift', () => {
  // Europe/Rome in summer: midnight Jul 10 = 22:00Z Jul 9; the server adds
  // 1h while the zone is in DST → 23:00Z Jul 9, still Jul 10 in Rome.
  const list = buildChartData([row('2026-07-09T23:00:00.000Z', 5)], {
    ...opts(0),
    timeZone: 'Europe/Rome',
    now: Date.UTC(2026, 6, 10, 21, 0), // 23:00 Jul 10 in Rome
  });
  expect(list[list.length - 1]).toMatchObject({ date: 'Jul 10', value: 5 });
});

test('§1.2 weekly keys decode to real ISO weeks ending at the current week', () => {
  const list = buildChartData(
    [row('2026-43', 3.49), row('2026-42', 26.47)],
    opts(1)
  );
  expect(list.map((p) => p.date)).toEqual(['2026-W42', '2026-W43']);
  expect(list.map((p) => p.value)).toEqual([26.47, 3.49]);
  for (const p of list) expect(`${p.date}${p.label}${p.fullDate}`).not.toMatch(/NaN|Invalid/);
});

test('§1.2 weekly gap-fill crosses an ISO year boundary', () => {
  // 2026-W53 = Dec 28 2026; 2027 starts on a Friday, so ISO 2027-W01 = Jan 4.
  const list = buildChartData([row('2026-52', 1), row('2027-2', 2)], {
    ...opts(1),
    now: Date.UTC(2027, 0, 20, 12), // Wed Jan 20 2027 = 2027-W03
  });
  expect(list.map((p) => p.date)).toEqual([
    '2026-W52',
    '2026-W53',
    '2027-W1',
    '2027-W2',
    '2027-W3',
  ]);
  expect(list.map((p) => p.value)).toEqual([1, 0, 0, 2, 0]);
});

test('§1.2 Sunday-start accounts use $week + 1 numbering', () => {
  // Mongo $week for Sun Oct 18 2026 is 42 → server key "2026-43".
  const list = buildChartData([row('2026-43', 7)], {
    ...opts(1, { weekStart: 's' }),
    now: Date.UTC(2026, 9, 20, 12), // Tue Oct 20, same Sunday-week
  });
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ date: '2026-W43', value: 7 });
});
