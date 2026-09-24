/**
 * Runner note: run from the parent —
 * `NODE_ENV=development npx vitest run core/tests/portfolioFuturesSummary.vitest.test.ts`.
 *
 * Portfolio futures card: the numbers. Every figure the card shows comes from
 * `balanceBasisFor` + `summarizeFutures`, so this file pins them without
 * rendering anything.
 *
 * The key fact behind the basis table: a futures account's stored balance is
 * not the same quantity on every venue. Most connectors report the wallet
 * balance (unrealized PnL excluded); Hyperliquid, KuCoin and Bitget COIN-M
 * report equity (included). Adding unrealized PnL to the latter would count it
 * twice.
 */
import { describe, expect, it } from 'vitest';

import { ExchangeEnum } from '../src/types/exchange.types';
import { computePositionPnl } from '../src/features/trading-terminal/utils/positionPnl';
import { balanceBasisFor } from '../src/components/portfolio/futures/balanceBasis';
import {
  selectFuturesAccounts,
  summarizeFutures,
  type FuturesAccountInput,
  type FuturesPositionInput,
} from '../src/components/portfolio/futures/futuresSummary';

const account = (
  id: string,
  provider: ExchangeEnum,
  balance: number | undefined
): FuturesAccountInput => ({ id, name: `acct-${id}`, provider, balance });

type PosOpts = {
  exchangeUUID: string;
  exchange?: ExchangeEnum;
  side: 'LONG' | 'SHORT';
  base: string;
  quote?: string;
  qty: number;
  entry: number;
  mark?: number;
  contractSize?: number;
};

/** A position the way `addSymbolToPositions` hands it over. */
const position = (o: PosOpts): FuturesPositionInput => {
  const exchange = o.exchange ?? ExchangeEnum.binanceUsdm;
  const isInverse = exchange.toLowerCase().includes('coinm') ||
    exchange.toLowerCase().includes('inverse');
  const contractSize = o.contractSize ?? 1;
  return {
    exchangeUUID: o.exchangeUUID,
    exchange,
    side: o.side,
    quantity: String(o.qty),
    baseAssetName: o.base,
    quoteAssetName: o.quote ?? (isInverse ? 'USD' : 'USDT'),
    markPrice: o.mark,
    symbolFull: isInverse
      ? ({ quoteAsset: { minAmount: String(contractSize) } } as FuturesPositionInput['symbolFull'])
      : undefined,
    pnl:
      o.mark === undefined
        ? null
        : computePositionPnl({
            side: o.side,
            entryPrice: o.entry,
            markPrice: o.mark,
            quantity: o.qty,
            isInverse,
            contractSize,
          }),
  };
};

describe('balanceBasisFor (spec §2.2.2, §8.2)', () => {
  it('maps every §8.2 venue, and its paper variant, to its basis', () => {
    const wallet = [
      ExchangeEnum.binanceUsdm,
      ExchangeEnum.binanceCoinm,
      ExchangeEnum.bybitUsdm,
      ExchangeEnum.bybitCoinm,
      ExchangeEnum.okxLinear,
      ExchangeEnum.okxInverse,
      ExchangeEnum.bitgetUsdm,
      ExchangeEnum.krakenUsdm,
    ];
    const equity = [
      ExchangeEnum.hyperliquidLinear,
      ExchangeEnum.kucoinLinear,
      ExchangeEnum.kucoinInverse,
      ExchangeEnum.bitgetCoinm,
    ];
    for (const p of wallet) expect(balanceBasisFor(p), p).toBe('wallet');
    for (const p of equity) expect(balanceBasisFor(p), p).toBe('equity');

    // Paper books unrealized PnL only on close, so every paper venue is wallet
    // — including the ones whose live counterpart reports equity.
    for (const p of [
      ExchangeEnum.paperBinanceUsdm,
      ExchangeEnum.paperBybitCoinm,
      ExchangeEnum.paperHyperliquidLinear,
      ExchangeEnum.paperKucoinLinear,
      ExchangeEnum.paperBitgetCoinm,
      ExchangeEnum.paperKrakenUsdm,
    ]) {
      expect(balanceBasisFor(p), p).toBe('wallet');
    }
  });

  it('a futures provider missing from the table is unknown (§7 Q7: krakenCoinm)', () => {
    expect(balanceBasisFor(ExchangeEnum.krakenCoinm)).toBe('unknown');
    expect(balanceBasisFor('someNewVenueLinear')).toBe('unknown');
  });
});

describe('summarizeFutures — account rows (spec §2.2)', () => {
  it('§2.2.3 upnl is the sum of computePositionPnl over the account positions', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const p1 = position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.1, entry: 50000, mark: 51000 });
    const p2 = position({ exchangeUUID: 'a', side: 'SHORT', base: 'ETH', qty: 2, entry: 3000, mark: 3100 });
    const { rows } = summarizeFutures({ accounts: [a], positions: [p1, p2] });
    expect(rows[0]?.upnl).toBeCloseTo((p1.pnl?.pnlQuote ?? NaN) + (p2.pnl?.pnlQuote ?? NaN), 8);
    expect(rows[0]?.upnl).toBeCloseTo(100 - 200, 8);
  });

  it('§2.2.4 wallet basis: wallet = reported, equity = reported + upnl', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const p = position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.1, entry: 50000, mark: 51000 });
    const [row] = summarizeFutures({ accounts: [a], positions: [p] }).rows;
    expect(row).toMatchObject({ wallet: 1000, equity: 1100 });
    expect(row?.upnl).toBeCloseTo(100, 8);
  });

  it('§2.2.4 equity basis: equity = reported, wallet = reported − upnl (never added twice)', () => {
    const a = account('a', ExchangeEnum.hyperliquidLinear, 1100);
    const p = position({ exchangeUUID: 'a', exchange: ExchangeEnum.hyperliquidLinear, side: 'LONG', base: 'BTC', quote: 'USDC', qty: 0.1, entry: 50000, mark: 51000 });
    const [row] = summarizeFutures({ accounts: [a], positions: [p] }).rows;
    expect(row?.equity).toBe(1100);
    expect(row?.wallet).toBeCloseTo(1000, 8);
  });

  it('§2.2.4 unknown basis: wallet and equity are null, upnl is still shown', () => {
    const a = account('a', ExchangeEnum.krakenCoinm, 500);
    const p = position({ exchangeUUID: 'a', exchange: ExchangeEnum.krakenCoinm, side: 'LONG', base: 'BTC', qty: 100, entry: 50000, mark: 55000, contractSize: 1 });
    const [row] = summarizeFutures({ accounts: [a], positions: [p] }).rows;
    expect(row).toMatchObject({ wallet: null, equity: null });
    expect(row?.upnl).toBeCloseTo(10, 8);
  });

  it('§2.2.4 an account with no positions has upnl 0 and equity = wallet', () => {
    const [row] = summarizeFutures({
      accounts: [account('a', ExchangeEnum.bybitUsdm, 250)],
      positions: [],
    }).rows;
    expect(row).toMatchObject({ wallet: 250, upnl: 0, equity: 250 });
  });

  it('§2.2.5 total sums rows; one null row nulls only that total column', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const b = account('b', ExchangeEnum.krakenCoinm, 500);
    const pa = position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.1, entry: 50000, mark: 51000 });
    const pb = position({ exchangeUUID: 'b', exchange: ExchangeEnum.krakenCoinm, side: 'LONG', base: 'BTC', qty: 100, entry: 50000, mark: 55000 });
    const { total } = summarizeFutures({ accounts: [a, b], positions: [pa, pb] });
    expect(total.wallet).toBeNull();
    expect(total.equity).toBeNull();
    expect(total.upnl).toBeCloseTo(110, 8);

    const both = summarizeFutures({
      accounts: [a, account('c', ExchangeEnum.bybitUsdm, 300)],
      positions: [pa],
    }).total;
    expect(both.wallet).toBe(1300);
    expect(both.equity).toBeCloseTo(1400, 8);
  });

  it('§2.2.6 one unpriced position nulls that account upnl and equity, not its wallet', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const priced = position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.1, entry: 50000, mark: 51000 });
    const unpriced = position({ exchangeUUID: 'a', side: 'LONG', base: 'ETH', qty: 1, entry: 3000 });
    const { rows, total } = summarizeFutures({ accounts: [a], positions: [priced, unpriced] });
    expect(rows[0]).toMatchObject({ wallet: 1000, upnl: null, equity: null });
    expect(total.upnl).toBeNull();
  });

  it('plan: a position quoted in a non-USD asset counts as unpriced', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const p = position({ exchangeUUID: 'a', side: 'LONG', base: 'ETH', quote: 'BTC', qty: 1, entry: 0.05, mark: 0.051 });
    const { rows, exposure } = summarizeFutures({ accounts: [a], positions: [p] });
    expect(rows[0]?.upnl).toBeNull();
    expect(exposure.top).toEqual([]);
  });

  it('a missing stored balance leaves wallet and equity null', () => {
    const [row] = summarizeFutures({
      accounts: [account('a', ExchangeEnum.binanceUsdm, undefined)],
      positions: [],
    }).rows;
    expect(row).toMatchObject({ wallet: null, equity: null, upnl: 0 });
  });

  it('§2.6.4 positions unavailable: reported balance stays in its basis column, the rest is null', () => {
    const s = summarizeFutures({
      accounts: [
        account('w', ExchangeEnum.binanceUsdm, 1000),
        account('e', ExchangeEnum.kucoinLinear, 400),
      ],
      positions: [],
      positionsKnown: false,
    });
    expect(s.rows[0]).toMatchObject({ wallet: 1000, upnl: null, equity: null });
    expect(s.rows[1]).toMatchObject({ wallet: null, upnl: null, equity: 400 });
    expect(s.exposure.top).toEqual([]);
  });

  it('counts open positions', () => {
    const a = account('a', ExchangeEnum.binanceUsdm, 1000);
    const s = summarizeFutures({
      accounts: [a],
      positions: [
        position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.1, entry: 50000, mark: 51000 }),
        position({ exchangeUUID: 'a', side: 'SHORT', base: 'ETH', qty: 1, entry: 3000, mark: 3000 }),
      ],
    });
    expect(s.openPositions).toBe(2);
  });
});

describe('summarizeFutures — net exposure (spec §2.3)', () => {
  const a = account('a', ExchangeEnum.binanceUsdm, 1000);
  const b = account('b', ExchangeEnum.binanceCoinm, 1);

  it('§2.3.1 nets long and short across accounts per base asset, at mark', () => {
    const { exposure } = summarizeFutures({
      accounts: [a, b],
      positions: [
        position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 0.2, entry: 50000, mark: 60000 }),
        // inverse: 300 contracts × $100 = $30,000 notional regardless of mark
        position({ exchangeUUID: 'b', exchange: ExchangeEnum.binanceCoinm, side: 'SHORT', base: 'BTC', qty: 300, entry: 50000, mark: 60000, contractSize: 100 }),
      ],
    });
    expect(exposure.top).toHaveLength(1);
    expect(exposure.top[0]?.asset).toBe('BTC');
    expect(exposure.top[0]?.net).toBeCloseTo(12000 - 30000, 8);
  });

  it('§2.3.2 keeps the top 5 by |net|; the rest fold into Other with count and summed net', () => {
    const nets: Array<[string, number]> = [
      ['BTC', 10000], ['ETH', -3000], ['SOL', 1800], ['XRP', -1400],
      ['DOGE', 900], ['LINK', 400], ['AVAX', -300],
    ];
    const positions = nets.map(([base, n]) =>
      position({ exchangeUUID: 'a', side: n > 0 ? 'LONG' : 'SHORT', base, qty: Math.abs(n) / 10, entry: 10, mark: 10 })
    );
    const { exposure } = summarizeFutures({ accounts: [a], positions });
    expect(exposure.top.map((r) => r.asset)).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);
    expect(exposure.other).not.toBeNull();
    expect(exposure.other?.count).toBe(2);
    expect(exposure.other?.net).toBeCloseTo(100, 8);
    expect(exposure.other?.rows.map((r) => r.asset)).toEqual(['LINK', 'AVAX']);
  });

  it('§2.3.2 five assets or fewer means no Other row', () => {
    const { exposure } = summarizeFutures({
      accounts: [a],
      positions: [position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 1, entry: 10, mark: 10 })],
    });
    expect(exposure.other).toBeNull();
  });

  it('§2.3.5 keeps an asset whose long and short net to exactly zero', () => {
    const { exposure } = summarizeFutures({
      accounts: [a],
      positions: [
        position({ exchangeUUID: 'a', side: 'LONG', base: 'ETH', qty: 1, entry: 3000, mark: 3000 }),
        position({ exchangeUUID: 'a', side: 'SHORT', base: 'ETH', qty: 1, entry: 3000, mark: 3000 }),
      ],
    });
    expect(exposure.top).toEqual([{ asset: 'ETH', net: 0 }]);
  });

  it('§2.3.6 gross long, gross short and net over the same positions', () => {
    const { exposure } = summarizeFutures({
      accounts: [a],
      positions: [
        // hedged ETH: 3000 long, 1000 short
        position({ exchangeUUID: 'a', side: 'LONG', base: 'ETH', qty: 1, entry: 3000, mark: 3000 }),
        position({ exchangeUUID: 'a', side: 'SHORT', base: 'ETH', qty: 1, entry: 1000, mark: 1000 }),
        position({ exchangeUUID: 'a', side: 'SHORT', base: 'SOL', qty: 5, entry: 100, mark: 100 }),
        // unpriced: counted nowhere
        position({ exchangeUUID: 'a', side: 'LONG', base: 'XRP', qty: 1, entry: 1 }),
      ],
    });
    expect(exposure.grossLong).toBeCloseTo(3000, 8);
    expect(exposure.grossShort).toBeCloseTo(1500, 8);
    expect(exposure.net).toBeCloseTo(1500, 8);
  });

  it('§2.3.6 no positions → zero gross and net', () => {
    const { exposure } = summarizeFutures({ accounts: [a], positions: [] });
    expect(exposure).toMatchObject({ grossLong: 0, grossShort: 0, net: 0 });
  });

  it('§2.3.4 notional never leaks into the account totals', () => {
    const s = summarizeFutures({
      accounts: [a],
      positions: [position({ exchangeUUID: 'a', side: 'LONG', base: 'BTC', qty: 1, entry: 60000, mark: 60000 })],
    });
    expect(s.total.equity).toBe(1000);
  });
});

describe('selectFuturesAccounts — follows the My Accounts selection (spec §2.1.4)', () => {
  const exchanges = [
    { id: 'ALL', type: 'aggregate' as const, name: 'All Exchanges', provider: 'all', balance: 0 },
    { id: 'f1', type: 'exchange' as const, name: 'F1', provider: ExchangeEnum.binanceUsdm, balance: 100 },
    { id: 'f2', type: 'exchange' as const, name: 'F2', provider: ExchangeEnum.bybitUsdm, balance: 200 },
    { id: 's1', type: 'exchange' as const, name: 'S1', provider: ExchangeEnum.binance, balance: 300 },
  ];
  const ids = (sel: string[] | undefined) =>
    selectFuturesAccounts(exchanges, sel).map((a) => a.id);

  it('"All", an empty selection or no page context → every futures account', () => {
    expect(ids(['ALL'])).toEqual(['f1', 'f2']);
    expect(ids([])).toEqual(['f1', 'f2']);
    expect(ids(undefined)).toEqual(['f1', 'f2']);
  });

  it('a selection → only the selected futures accounts', () => {
    expect(ids(['f2'])).toEqual(['f2']);
    expect(ids(['s1', 'f1'])).toEqual(['f1']);
  });

  it('a spot-only selection → no futures accounts (the card hides)', () => {
    expect(ids(['s1'])).toEqual([]);
  });

  it('positions of unselected accounts leave the count and the exposure', () => {
    const s = summarizeFutures({
      accounts: selectFuturesAccounts(exchanges, ['f2']),
      positions: [
        position({ exchangeUUID: 'f1', side: 'LONG', base: 'BTC', qty: 1, entry: 100, mark: 100 }),
        position({ exchangeUUID: 'f2', side: 'SHORT', base: 'ETH', qty: 1, entry: 50, mark: 50 }),
      ],
    });
    expect(s.rows.map((r) => r.id)).toEqual(['f2']);
    expect(s.openPositions).toBe(1);
    expect(s.exposure.top).toEqual([{ asset: 'ETH', net: -50 }]);
  });
});
