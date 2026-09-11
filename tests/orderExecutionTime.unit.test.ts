import { test, expect } from '@playwright/test';

import { getOrderExecutionTime } from '@/utils/orders/executionTime';

/**
 * Chart buy/sell markers are plotted at `getOrderExecutionTime`. Two real
 * shapes pull in opposite directions, and a single field is wrong for one of
 * them:
 *
 * - A take-profit limit placed with the deal and filled 13 hours later:
 *   `transactTime` is the placement, `updateTime` is the fill. Plotting at
 *   placement drew the sell on a candle that never reached its price.
 * - A grid limit that part-filled at placement and had its remainder cancelled
 *   when the deal closed days later: `updateTime` is that cancel, not a fill.
 */
const PLACED = Date.parse('2026-01-10T03:29:39Z');
const FILLED_LATER = Date.parse('2026-01-10T16:51:15Z');
const CLOSED_DAYS_LATER = Date.parse('2026-01-14T01:13:10Z');

test('a resting limit that filled its whole size plots at the fill', () => {
  expect(
    getOrderExecutionTime({
      transactTime: PLACED,
      updateTime: FILLED_LATER,
      origQty: '0.0088',
      executedQty: '0.0088',
    })
  ).toBe(FILLED_LATER);
});

test('a partial fill keeps the placement time, not the later cancel', () => {
  expect(
    getOrderExecutionTime({
      transactTime: PLACED,
      updateTime: CLOSED_DAYS_LATER,
      origQty: '5.5',
      executedQty: '4.32',
    })
  ).toBe(PLACED);
});

test('a market order that filled on placement plots at its fill', () => {
  expect(
    getOrderExecutionTime({
      transactTime: PLACED,
      updateTime: PLACED + 800,
      origQty: '1',
      executedQty: '1',
    })
  ).toBe(PLACED + 800);
});

test('exchange rounding of the executed size still counts as a full fill', () => {
  expect(
    getOrderExecutionTime({
      transactTime: PLACED,
      updateTime: FILLED_LATER,
      origQty: '3',
      executedQty: '2.9999',
    })
  ).toBe(FILLED_LATER);
});

test('an explicit order `time` wins over transactTime as the placement', () => {
  expect(
    getOrderExecutionTime({
      time: PLACED - 1000,
      transactTime: PLACED,
      updateTime: CLOSED_DAYS_LATER,
      origQty: '2',
      executedQty: '0',
    })
  ).toBe(PLACED - 1000);
});

test('an order with only updateTime still gets a timestamp', () => {
  expect(
    getOrderExecutionTime({
      updateTime: FILLED_LATER,
      origQty: '1',
      executedQty: '1',
    })
  ).toBe(FILLED_LATER);
});

test('an updateTime earlier than placement is ignored', () => {
  expect(
    getOrderExecutionTime({
      transactTime: PLACED,
      updateTime: PLACED - 5000,
      origQty: '1',
      executedQty: '1',
    })
  ).toBe(PLACED);
});
