import { test, expect } from '@playwright/test';

import {
  BALANCE_STALE_AFTER_MS,
  formatAge,
  isBalanceStale,
  oldestUpdated,
  parseUpdated,
} from '@/utils/balanceStaleness';

/**
 * The 2026-09-03 case: a Kraken spot account whose `balances` rows were last
 * written at 00:45 UTC showed 13.5 ETH all day while the venue held 1.53. The
 * marker must appear for such a row, stay hidden for a fresh one, and never
 * appear when the backend did not send `updated` at all (older backend —
 * unknown is not stale).
 */
const NOW = Date.parse('2026-09-03T15:06:00Z');

test('a row written 14 hours ago is stale', () => {
  expect(isBalanceStale('2026-09-03T00:45:24.033Z', NOW)).toBe(true);
});

test('a row written a minute ago is fresh', () => {
  expect(isBalanceStale('2026-09-03T15:05:00Z', NOW)).toBe(false);
});

test('the threshold is 15 minutes and exclusive', () => {
  const edge = new Date(NOW - BALANCE_STALE_AFTER_MS).toISOString();
  expect(isBalanceStale(edge, NOW)).toBe(false);
  expect(isBalanceStale(new Date(NOW - BALANCE_STALE_AFTER_MS - 1).toISOString(), NOW)).toBe(true);
});

test('missing or malformed updated is never stale', () => {
  expect(isBalanceStale(undefined, NOW)).toBe(false);
  expect(isBalanceStale(null, NOW)).toBe(false);
  expect(isBalanceStale('not a date', NOW)).toBe(false);
  expect(parseUpdated('not a date')).toBeNull();
});

test('a summed asset takes the oldest venue time', () => {
  expect(
    oldestUpdated(['2026-09-03T15:05:00Z', null, '2026-09-03T00:45:24.033Z', undefined])
  ).toBe('2026-09-03T00:45:24.033Z');
  expect(oldestUpdated([null, undefined])).toBeNull();
});

test('formatAge reads naturally', () => {
  expect(formatAge('2026-09-03T15:05:30Z', NOW)).toBe('30 s ago');
  expect(formatAge('2026-09-03T14:51:00Z', NOW)).toBe('15 min ago');
  expect(formatAge('2026-09-03T00:45:24Z', NOW)).toBe('14 h ago');
  expect(formatAge('2026-08-30T00:45:24Z', NOW)).toBe('5 days ago');
  expect(formatAge(null, NOW)).toBe('unknown');
});
