/**
 * Runner note: Vitest. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/localBacktestBalances.vitest.test.ts`.
 *
 * A local backtest sizes percentage orders off the selected account's real
 * balance (spec 131). Before the fix the input was always `[]`, so every
 * `percTotal` / `percFree` order fell to the venue minimum.
 */
import { describe, expect, it } from 'vitest';

import { localBacktestBalances } from '@/features/bots/widgets/BotForm/localBacktestSettings';
import type { BalanceData } from '@/stores/live/balanceStore';

const row = (
  exchangeUUID: string,
  asset: string,
  free: number,
  locked = 0
): BalanceData => ({
  asset,
  free,
  locked,
  total: free + locked,
  exchangeUUID,
});

const store: BalanceData[] = [
  row('acc-inverse', 'BTC', 0.0074892472149821485),
  row('acc-spot', 'BTC', 2),
  row('acc-spot', 'USDT', 5000, 100),
  row('acc-parent', 'USDT', 300),
];

describe('localBacktestBalances (spec 131)', () => {
  it('§4.1/§4.2 passes the selected account rows in the backtester Asset shape', () => {
    expect(localBacktestBalances(store, { uuid: 'acc-inverse' })).toEqual([
      { asset: 'BTC', free: '0.0074892472149821485', locked: '0' },
    ]);
  });

  it('§4.1 excludes every other account', () => {
    expect(localBacktestBalances(store, { uuid: 'acc-spot' })).toEqual([
      { asset: 'BTC', free: '2', locked: '0' },
      { asset: 'USDT', free: '5000', locked: '100' },
    ]);
  });

  it('§4.1 a linked account reads its parent wallet (legacy parity)', () => {
    expect(
      localBacktestBalances(store, { uuid: 'acc-leg', linkedTo: 'acc-parent' })
    ).toEqual([{ asset: 'USDT', free: '300', locked: '0' }]);
  });

  it('§4.3 no exchange or no matching rows gives an empty list', () => {
    expect(localBacktestBalances(store, null)).toEqual([]);
    expect(localBacktestBalances(store, { uuid: 'unknown' })).toEqual([]);
  });
});
