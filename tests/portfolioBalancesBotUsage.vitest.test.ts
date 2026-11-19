import { describe, expect, it } from 'vitest';

import { calculateEnhancedBalances } from '@/utils/balanceCalculations';
import type { Asset } from '@/types';
import type { BalanceCalculationInput } from '@/types/enhancedBalance.types';

/**
 * The Portfolio Balances "Max Bot Usage" / "Planned" / "Free" columns are built
 * from the user's DCA and Combo bots. Bots arrive in the shape the bot-list
 * queries return them: no top-level `type`, `settings.strategy` is LONG/SHORT,
 * and `dealsInBot` is present. The calculation follows the legacy dashboard's
 * balance table (`calculateBalancesTable`):
 *
 * - a bot with no open position reserves its whole max usage, all of it still
 *   planned;
 * - a bot in a deal reserves what is left (max - current), and only the part
 *   not already locked in its resting orders is still planned;
 * - the asset is the quote for long spot and linear futures, the base for short
 *   spot and coin-margined futures;
 * - "Free" is wallet free minus planned; "Not in limit" stays the wallet's free.
 */

type Bot = NonNullable<BalanceCalculationInput['bots']>[number];

const EX = 'ex-1';

const bal = (asset: string, free: string, locked = '0', uuid = EX): Asset =>
  ({
    asset,
    free,
    locked,
    exchange: 'bitgetUsdm',
    exchangeUUID: uuid,
    exchangeName: 'Bitget',
  }) as Asset;

const listBot = (over: Partial<Bot> & { settings?: Partial<Bot['settings']> }): Bot =>
  ({
    _id: over._id ?? 'bot-1',
    exchangeUUID: over.exchangeUUID ?? EX,
    status: over.status ?? 'open',
    settings: {
      name: 'Bot',
      strategy: 'LONG',
      futures: true,
      coinm: false,
      type: 'regular',
      ...(over.settings ?? {}),
    },
    symbol: over.symbol ?? [
      { key: 'TSLAUSDT', value: { symbol: 'TSLAUSDT', baseAsset: 'TSLA', quoteAsset: 'USDT' } },
    ],
    usage: over.usage ?? { current: { base: 0, quote: 0 }, max: { base: 0, quote: 1000 } },
    assets: over.assets ?? {
      used: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 0 }] },
      required: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 0 }] },
    },
    dealsInBot: over.dealsInBot ?? { active: 0, all: 3 },
  }) as Bot;

const exchanges = [
  { id: 'ALL', name: 'All Exchanges' },
  { id: EX, uuid: EX, name: 'Bitget' },
];

const calc = (
  bots: Bot[],
  balances: Asset[] = [bal('USDT', '3000', '5000')],
  exs: BalanceCalculationInput['exchanges'] = exchanges
) =>
  calculateEnhancedBalances(
    { portfolioAssets: [], bots, exchanges: exs, prices: [], balances },
    false
  );

const row = (rows: ReturnType<typeof calc>, token: string, uuid = EX) => {
  const found = rows.find((r) => r.token === token && r.exchangeUUID === uuid);
  if (!found) throw new Error(`no ${token} row on ${uuid}`);
  return found;
};

describe('portfolio balances count the bots that still need funds', () => {
  it('§1.1 an idle list-shaped DCA bot reserves its whole max usage', () => {
    const r = row(calc([listBot({})]), 'USDT');

    expect(r.required).toBe(1000);
    expect(r.planned).toBe(1000);
    expect(r.freeAndOver).toBe(2000);
    expect(r.legend?.map((l) => l.id)).toEqual(['bot-1']);
  });

  it('§1.2 a bot in a deal plans what is left minus what its orders already lock', () => {
    const r = row(
      calc([
        listBot({
          usage: { current: { base: 0, quote: 996 }, max: { base: 0, quote: 3876 } },
          assets: {
            used: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 186 }] },
            required: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 3066 }] },
          },
          dealsInBot: { active: 1, all: 40 },
        }),
      ]),
      'USDT'
    );

    expect(r.required).toBe(2880);
    expect(r.planned).toBe(2694);
    expect(r.freeAndOver).toBe(3000 - 2694);
  });

  it('§1.3 a short spot bot reserves its base asset', () => {
    const r = row(
      calc(
        [
          listBot({
            settings: { strategy: 'SHORT', futures: false },
            symbol: [{ key: 'BNBUSDT', value: { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' } }],
            usage: { current: { base: 0, quote: 0 }, max: { base: 0.12, quote: 0 } },
          }),
        ],
        [bal('BNB', '0.5'), bal('USDT', '100')]
      ),
      'BNB'
    );

    expect(r.required).toBe(0.12);
    expect(r.planned).toBe(0.12);
    expect(r.freeAndOver).toBe(0.38);
  });

  it('§1.4 a closed bot counts only while it still holds an open deal; archived never', () => {
    const closedIdle = listBot({ _id: 'a', status: 'closed' });
    const archived = listBot({ _id: 'b', status: 'archive', dealsInBot: { active: 1, all: 1 } });
    const closedInDeal = listBot({ _id: 'c', status: 'closed', dealsInBot: { active: 1, all: 1 } });

    const r = row(calc([closedIdle, archived, closedInDeal]), 'USDT');

    expect(r.legend?.map((l) => l.id)).toEqual(['c']);
    expect(r.required).toBe(1000);
  });

  it('§1.5 a linked leg reserves on its source wallet; an unknown exchange is ignored', () => {
    const rows = calc(
      [listBot({ _id: 'leg', exchangeUUID: 'leg-1' }), listBot({ _id: 'gone', exchangeUUID: 'removed' })],
      [bal('USDT', '3000')],
      [...exchanges, { id: 'leg-1', uuid: 'leg-1', name: 'Leg', linkedTo: EX }]
    );

    const r = row(rows, 'USDT');
    expect(r.legend?.map((l) => l.id)).toEqual(['leg']);
    expect(r.required).toBe(1000);
  });

  it('§1.6 "Not in limit" stays the wallet free balance', () => {
    const before = row(calc([]), 'USDT');
    const after = row(calc([listBot({})]), 'USDT');

    expect(after.free).toBe(before.free);
    expect(after.used).toBe(before.used);
    expect(after.total).toBe(before.total);
  });

  // spec 158 — FREE never counts margin a bot already locked in its position and orders.
  it('§158.1 a bot whose remaining orders are all resting leaves FREE at the wallet free', () => {
    const r = row(
      calc(
        [
          listBot({
            usage: { current: { base: 0, quote: 1600 }, max: { base: 0, quote: 2200 } },
            assets: {
              used: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 1300 }] },
              required: { base: [{ key: 'TSLA', value: 0 }], quote: [{ key: 'USDT', value: 1300 }] },
            },
            dealsInBot: { active: 1, all: 5 },
          }),
        ],
        [bal('USDT', '300', '1900')]
      ),
      'USDT'
    );

    expect(r.required).toBe(600);
    expect(r.planned).toBe(0);
    expect(r.freeAndOver).toBe(300);
  });

  it('§158.3 a spot bot holding its position in the wallet free keeps it out of FREE', () => {
    const r = row(
      calc(
        [
          listBot({
            settings: { futures: false },
            symbol: [{ key: 'JSTUSDT', value: { symbol: 'JSTUSDT', baseAsset: 'JST', quoteAsset: 'USDT' } }],
            usage: { current: { base: 0, quote: 200 }, max: { base: 0, quote: 1500 } },
            assets: {
              used: { base: [{ key: 'JST', value: 1270 }], quote: [{ key: 'USDT', value: 60 }] },
              required: { base: [{ key: 'JST', value: 1270 }], quote: [{ key: 'USDT', value: 1300 }] },
            },
            dealsInBot: { active: 1, all: 5 },
          }),
        ],
        [bal('JST', '1300'), bal('USDT', '500', '600')]
      ),
      'JST'
    );

    expect(r.required).toBe(1270);
    expect(r.planned).toBe(0);
    expect(r.freeAndOver).toBe(30);
  });

  it('§158.2 an account no bot reserves anything on keeps FREE at the wallet total', () => {
    const r = row(calc([], [bal('USDT', '300', '700')]), 'USDT');

    expect(r.required).toBe(0);
    expect(r.planned).toBe(0);
    expect(r.freeAndOver).toBe(1000);
  });
});
