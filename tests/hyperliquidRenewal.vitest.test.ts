import { describe, test, expect } from 'vitest';
import {
  agentRenewal,
  findRenewTarget,
  hyperliquidSiblings,
  isHyperliquidAgentRejection,
} from '@/utils/hyperliquidRenewal';
import { botUrlFor } from '@/components/notifications/botUrl';
import { ExchangeEnum, type ExchangeInUser } from '@/types/exchange.types';

// Hyperliquid API-wallet renewal: which connections need it, which ones a
// renewal must update together, and where its notices lead.

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const W = '0xAbC0000000000000000000000000000000000001';

const conn = (
  uuid: string,
  provider: ExchangeEnum,
  key: string,
  hlAgent?: ExchangeInUser['hlAgent']
): ExchangeInUser => ({
  uuid,
  provider,
  key,
  name: uuid,
  secret: '',
  hlAgent: hlAgent ?? null,
});

describe('agentRenewal', () => {
  test('no expiry known → nothing to show', () => {
    expect(agentRenewal(null, NOW)).toEqual({ status: 'ok' });
    expect(agentRenewal({ state: 'missing', expiresAt: null }, NOW)).toEqual({
      status: 'ok',
    });
  });
  test('more than 14 days left → ok; within 14 → expiring with days left', () => {
    expect(
      agentRenewal({ state: 'active', expiresAt: NOW + 30 * DAY }, NOW)
    ).toEqual({ status: 'ok' });
    expect(
      agentRenewal({ state: 'active', expiresAt: NOW + 2.2 * DAY }, NOW)
    ).toEqual({ status: 'expiring', expiresAt: NOW + 2.2 * DAY, daysLeft: 3 });
  });
  test('past expiry → expired, even before the sync relabels it', () => {
    expect(agentRenewal({ state: 'active', expiresAt: NOW - 1 }, NOW)).toEqual({
      status: 'expired',
      expiresAt: NOW - 1,
    });
  });
});

describe('hyperliquidSiblings', () => {
  const all = [
    conn('spot', ExchangeEnum.hyperliquid, W),
    conn('perp', ExchangeEnum.hyperliquidLinear, W.toLowerCase()),
    conn('master', ExchangeEnum.hyperliquid, W, { state: 'master' }),
    conn('other-wallet', ExchangeEnum.hyperliquid, '0xdef'),
    conn('paper', ExchangeEnum.paperHyperliquid, W),
    conn('binance', ExchangeEnum.binance, W),
  ];
  test('same wallet (any case), live Hyperliquid, not master, not the target', () => {
    expect(hyperliquidSiblings(W, all, 'spot').map((e) => e.uuid)).toEqual([
      'perp',
    ]);
  });
  test('add flow (no target): every existing live leg of the wallet', () => {
    expect(hyperliquidSiblings(W, all).map((e) => e.uuid)).toEqual([
      'spot',
      'perp',
    ]);
  });
  test('no wallet → nothing', () => {
    expect(hyperliquidSiblings('', all)).toEqual([]);
  });
});

describe('findRenewTarget', () => {
  const all = [
    conn('fine', ExchangeEnum.hyperliquid, W, {
      state: 'active',
      expiresAt: NOW + 90 * DAY,
    }),
    conn('soon', ExchangeEnum.hyperliquidLinear, W, {
      state: 'active',
      expiresAt: NOW + 3 * DAY,
    }),
    conn('dead', ExchangeEnum.hyperliquid, '0x2', {
      state: 'expired',
      expiresAt: NOW - DAY,
    }),
    conn('binance', ExchangeEnum.binance, 'k'),
  ];
  test('exact uuid', () => {
    expect(findRenewTarget('soon', all, NOW)?.uuid).toBe('soon');
  });
  test('"hyperliquid" picks expired first, then the soonest expiry', () => {
    expect(findRenewTarget('hyperliquid', all, NOW)?.uuid).toBe('dead');
    expect(
      findRenewTarget(
        'hyperliquid',
        all.filter((e) => e.uuid !== 'dead'),
        NOW
      )?.uuid
    ).toBe('soon');
  });
  test('unknown uuid or a non-Hyperliquid connection → null', () => {
    expect(findRenewTarget('nope', all, NOW)).toBeNull();
    expect(findRenewTarget('binance', all, NOW)).toBeNull();
    expect(findRenewTarget(null, all, NOW)).toBeNull();
  });
});

describe('notifications lead to the renewal', () => {
  test('the expiry notice and the venue refusal both open the renewal', () => {
    expect(
      botUrlFor({
        botId: 'system',
        message:
          'Your Hyperliquid API wallet expires in 3 days (30 Nov 2026). Renew it…',
      })
    ).toBe('/exchanges?renew=hyperliquid');
    expect(
      botUrlFor({
        botId: '65f0c0ffee',
        botType: 'dca',
        message:
          'User or API Wallet 0x2c7536e3605d9c16a7a3d7b1898e529396a65c23 does not exist.',
      })
    ).toBe('/exchanges?renew=hyperliquid');
  });
  test('other bot and system rows keep their routes', () => {
    expect(
      botUrlFor({ botId: '65f0', botType: 'grid', message: 'Order filled' })
    ).toBe('/grid/view/65f0');
    expect(botUrlFor({ botId: 'system', message: 'Replace your key' })).toBe(
      null
    );
  });
  test('rejection matcher is specific', () => {
    expect(
      isHyperliquidAgentRejection('User or API Wallet 0xab does not exist')
    ).toBe(true);
    expect(isHyperliquidAgentRejection('Insufficient margin')).toBe(false);
  });
});
