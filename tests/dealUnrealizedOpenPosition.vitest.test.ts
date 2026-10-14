/**
 * Runner note: Vitest, run from the parent:
 * `npx vitest run core/tests/dealUnrealizedOpenPosition.vitest.test.ts`
 *
 * Spec: `specs/113.deal-unrealized-shows-open-position-only.md`.
 *
 * A deal's stored/live unrealized value is the WHOLE deal's P&L, so it already
 * holds what a reduce, a partial take-profit or a grid sell banked. Every
 * deal-level "Unrealized" display must show the open position only:
 * Net P&L − Realized. The behaviour is proven on the helper; the tables and
 * cards are held to a source-level contract that they go through it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  calculateDealNetPnl,
  calculateDealOpenPnl,
} from '@/lib/utils/tradingMetrics';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), 'core/src', path), 'utf8');

describe('deal Unrealized = open position only (spec 113)', () => {
  // §2 — open LONG futures deal after one reduce at a loss.
  const unrealizedProfit = -1513.725678513778;
  const realizedProfit = -523.71085845246;

  it('§1.1 open deal: Unrealized excludes the realized reduce', () => {
    expect(
      calculateDealOpenPnl({ active: true, unrealizedProfit, realizedProfit })
    ).toBeCloseTo(-990.0148, 4);
  });

  it('§1.1 Realized + Unrealized = Net P&L, and Net P&L is unchanged', () => {
    const net = calculateDealNetPnl({
      active: true,
      unrealizedProfit,
      realizedProfit,
    });
    expect(net).toBeCloseTo(unrealizedProfit, 8);
    const open = Number(
      calculateDealOpenPnl({ active: true, unrealizedProfit, realizedProfit })
    );
    expect(open + realizedProfit).toBeCloseTo(net, 8);
  });

  it('§1.1 nothing banked yet: unchanged', () => {
    expect(
      calculateDealOpenPnl({
        active: true,
        unrealizedProfit: -12.5,
        realizedProfit: 0,
      })
    ).toBe(-12.5);
  });

  it('§1.3 closed deals and missing prices pass through untouched', () => {
    expect(
      calculateDealOpenPnl({
        active: false,
        unrealizedProfit: 0,
        realizedProfit: 40,
      })
    ).toBe(0);
    expect(
      calculateDealOpenPnl({
        active: true,
        unrealizedProfit: undefined,
        realizedProfit: 40,
      })
    ).toBeUndefined();
    expect(
      calculateDealOpenPnl({
        active: true,
        unrealizedProfit: null,
        realizedProfit: 40,
      })
    ).toBeNull();
  });

  /** The source between `id: '<id>'` and the next column's `id:`/end. */
  const columnSource = (src: string, id: string): string => {
    const start = src.indexOf(`id: '${id}'`);
    expect(start, `column ${id} must exist`).toBeGreaterThan(-1);
    const next = src.indexOf('\n      {\n', start);
    const nextConst = src.indexOf('\n    const ', start);
    const ends = [next, nextConst].filter((i) => i > start);
    return src.slice(start, ends.length ? Math.min(...ends) : undefined);
  };

  it('§1.1/§1.2 Deals page Unrealized columns (incl. totals) use the helper', () => {
    const src = read('components/widgets/shared/OpenOrdersWidget.tsx');
    for (const id of ['unrealizedProfit', 'unrealizedProfitPercentage']) {
      const block = columnSource(src, id);
      // accessor (sort, filter, totals row) AND cell
      expect(block.match(/calculateDealOpenPnl\(/g)?.length ?? 0).toBe(2);
    }
  });

  it('§1.1/§1.2 bot drawer Unrealized columns use the helper', () => {
    const src = read('components/widgets/bots/drawer/DrawerDealsTable.tsx');
    for (const id of ['unrealizedPnl', 'unrealizedPnlPercentage']) {
      const block = columnSource(src, id);
      expect(block.match(/calculateDealOpenPnl\(/g)?.length ?? 0).toBe(2);
    }
  });

  it('§1.1 deal card, detail drawer, merge dialog and treemap use it', () => {
    for (const path of [
      'components/trades/TradeCard.tsx',
      'components/trades/TradeDetailContent.tsx',
      'features/bots/widgets/BotForm/hooks/useBotSmartOrders.ts',
      'components/widgets/dashboard/TreemapBase.tsx',
    ]) {
      expect(read(path), path).toContain('calculateDealOpenPnl(');
    }
  });

  it('§1.4 grid Unrealized is already net minus realized (unchanged)', () => {
    expect(read('types/gridBot.ts')).toContain(
      'valueChangeUsd - (res.profit?.totalUsd || 0)'
    );
  });
});
