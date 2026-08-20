import { test, expect } from '@playwright/test';

import { dealStartBlockedSummary } from '@/lib/utils/dealStartBlocked';
import type { DealStartBlock } from '@/types';

/**
 * A deal is created BEFORE its opening order reaches the exchange, so a venue
 * refusal leaves the deal listed with no orders and all-zero numbers - visually
 * identical to a deal that is merely waiting for its limit price. The engine's
 * bot-level warning names neither the deal nor the symbol, so an account hit by
 * an account-wide Binance Quantitative Rules restriction had no way to connect
 * the two.
 *
 * These pin the one-liner the deal tables hang off their status chip: the
 * reason, the expiry, and the account-vs-symbol scope are the three facts that
 * were missing.
 */
test.describe('dealStartBlockedSummary', () => {
  const base: DealStartBlock = {
    reason:
      'Binance temporarily restricted new orders on this account (Futures Quantitative Rules).',
    subType: 'Exchange rules',
  };

  test('is empty when the deal is not blocked, so nothing renders', () => {
    expect(dealStartBlockedSummary({} as DealStartBlock)).toBe('');
    expect(
      dealStartBlockedSummary(undefined as unknown as DealStartBlock)
    ).toBe('');
  });

  test('leads with the venue reason', () => {
    expect(dealStartBlockedSummary(base)).toContain(base.reason as string);
  });

  test('names when it retries - "paused" with no end is barely better than silence', () => {
    const retryAfter = Date.now() + 2 * 60 * 60 * 1000;
    const summary = dealStartBlockedSummary({ ...base, retryAfter });
    expect(summary).toContain('Retrying automatically after');
  });

  test('omits an expiry that has already passed rather than promising the past', () => {
    const summary = dealStartBlockedSummary({
      ...base,
      retryAfter: Date.now() - 60_000,
    });
    expect(summary).not.toContain('Retrying automatically after');
  });

  test('says when the restriction covers the whole account', () => {
    // The difference between one symbol being unavailable and none of the
    // user's bots being able to open anything.
    expect(dealStartBlockedSummary({ ...base, scope: 'account' })).toContain(
      'whole exchange account'
    );
    expect(
      dealStartBlockedSummary({ ...base, scope: 'symbol' })
    ).not.toContain('whole exchange account');
  });
});
