import { test, expect } from '@playwright/test';

import { resolveDcaRanges } from '@/utils/bots/dca/ranges';
import {
  buildSmartOrdersHelperMessage,
  deriveSmartOrdersRange,
} from '@/utils/bots/dca/smart-orders';
import { hotValidateDcaFormData } from '@/utils/bots/dca/validation';
import { MAX_DCA_ORDERS, MAX_RESTING_EXCHANGE_ORDERS } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * The platform budgets *resting exchange orders*, not ladder depth.
 *
 * Venues cap open orders per symbol (Binance `MAX_NUM_ORDERS`, Bybit's 500
 * conditional/TP-SL/active ceiling, Kraken `EOrder:Orders limit exceeded`), and
 * the whole point of smart orders is that only `activeOrdersCount` levels ever
 * rest there — the rest of the ladder is a plan the engine holds in memory
 * (main-app `core/src/bot/dcaHelper.ts`, the `!all && useSmartOrders` slice).
 *
 * Before this, `ordersCount` was clamped to `200 / maxNumberOfOpenDeals`
 * whether or not smart orders were on, so a bot with 5 concurrent deals could
 * not describe a ladder deeper than 40 — the block Alessandro P. hit migrating
 * 200-order strategies off 3Commas. These lock the split.
 */

const makeFormData = (dca: Record<string, unknown>): BotFormData =>
  ({
    type: 'dca',
    dca: {
      dcaCondition: 'percentage',
      dcaCustom: [],
      useMulti: false,
      useSmartOrders: false,
      maxDealsPerPair: '1',
      maxNumberOfOpenDeals: '1',
      ordersCount: '10',
      activeOrdersCount: '5',
      ...dca,
    },
    combo: {},
  }) as unknown as BotFormData;

test.describe('DCA order budget — ladder depth vs resting exchange orders', () => {
  test('smart orders free the ladder from the concurrency divisor', () => {
    const shared = { maxNumberOfOpenDeals: '5', ordersCount: '200' };

    const withoutSmart = resolveDcaRanges(
      makeFormData({ ...shared, useSmartOrders: false })
    );
    // 200 resting orders / 5 concurrent deals — every level rests, so depth pays.
    expect(withoutSmart.ordersCount.max).toBe(40);

    const withSmart = resolveDcaRanges(
      makeFormData({ ...shared, useSmartOrders: true })
    );
    // Only `activeOrdersCount` rests, so the ladder runs to the full ceiling.
    expect(withSmart.ordersCount.max).toBe(MAX_DCA_ORDERS);
  });

  test('the resting budget moves onto activeOrdersCount instead', () => {
    const ranges = resolveDcaRanges(
      makeFormData({
        useSmartOrders: true,
        maxNumberOfOpenDeals: '5',
        ordersCount: '200',
      })
    );
    // 5 deals × 40 active orders each = the 200-order budget, exactly spent.
    expect(ranges.smartOrders.max).toBe(40);
    expect(ranges.smartOrders.max * 5).toBe(MAX_RESTING_EXCHANGE_ORDERS);
  });

  test('a multi-pair bot divides by maxDealsPerPair, not maxNumberOfOpenDeals', () => {
    // Regression: `resolveSmartOrdersRangeBounds` passed `!useMulti`, so a
    // multi-pair bot was budgeted against the setting it does not use.
    const ranges = resolveDcaRanges(
      makeFormData({
        useMulti: true,
        useSmartOrders: true,
        maxDealsPerPair: '4',
        maxNumberOfOpenDeals: '100',
        ordersCount: '200',
      })
    );
    expect(ranges.smartOrders.max).toBe(50); // 200 / 4, not 200 / 100
  });

  test('ordersCount never exceeds the ladder ceiling even with smart orders', () => {
    const ranges = resolveDcaRanges(
      makeFormData({
        useSmartOrders: true,
        maxNumberOfOpenDeals: '1',
        ordersCount: '500',
      })
    );
    expect(ranges.ordersCount.max).toBe(MAX_DCA_ORDERS);
  });

  test('deriveSmartOrdersRange reports which setting bound it', () => {
    const range = deriveSmartOrdersRange({
      ordersCount: '200',
      dcaCondition: 'percentage',
      dcaCustom: [],
      useMulti: false,
      maxDealsPerPair: '1',
      maxNumberOfOpenDeals: '8',
    } as never);
    expect(range.max).toBe(25); // 200 / 8
    expect(range.limitSource).toBe('maxNumberOfOpenDeals');
    expect(buildSmartOrdersHelperMessage(range)).toContain('open-order limit');
  });
});

test.describe('validateDca — orders count', () => {
  const base = {
    // `hotValidateDcaFormData` drops every DCA-ladder error when `useDca` is
    // off, so the flag has to be on for these to mean anything.
    useDca: true,
    dcaCondition: 'percentage',
    dcaCustom: [],
    useMulti: false,
    maxDealsPerPair: '1',
    activeOrdersCount: '5',
    useSmartOrders: false,
  };

  const ordersCountError = (settings: Record<string, unknown>) => {
    const { errors } = hotValidateDcaFormData({
      dca: { ...base, ...settings },
      pair: [],
      mode: 'create',
    } as never);
    return errors['ordersCount'];
  };

  test('blocks a deep ladder only when every level would rest', () => {
    expect(
      ordersCountError({ ordersCount: '200', maxNumberOfOpenDeals: '5' })
    ).toContain('Enable smart orders');
  });

  test('allows the same ladder once smart orders are on', () => {
    expect(
      ordersCountError({
        ordersCount: '200',
        maxNumberOfOpenDeals: '5',
        useSmartOrders: true,
      })
    ).toBeUndefined();
  });

  test('still refuses to exceed the ladder ceiling', () => {
    expect(
      ordersCountError({
        ordersCount: '201',
        maxNumberOfOpenDeals: '1',
        useSmartOrders: true,
      })
    ).toContain(`${MAX_DCA_ORDERS} or less`);
  });
});
