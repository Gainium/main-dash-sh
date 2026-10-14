/**
 * Runner note: Vitest, run from the parent:
 * `npx vitest run core/tests/drawerNetPnlNoDoubleCount.vitest.test.ts`
 *
 * Spec: `specs/111.drawer-net-pnl-double-counts-realized-on-open-deals.md`.
 *
 * The bot drawer's Net P&L columns added realized profit on top of
 * `unrealizedProfit`, which is already the whole deal's P&L, so reduces,
 * partial take-profits and grid sales were counted twice on open deals.
 *
 * `DrawerDealsTable` cannot be mounted in jsdom without a harness larger than
 * the fix (see bug695DrawerTabsFullscreen), so its two columns are held to a
 * source-level contract: they must go through `calculateDealNetPnl`, the same
 * helper the Deals page uses. The behavioural half is proven on that helper.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { calculateDealNetPnl } from '@/lib/utils/tradingMetrics';

const drawerSource = readFileSync(
  resolve(
    process.cwd(),
    'core/src/components/widgets/bots/drawer/DrawerDealsTable.tsx'
  ),
  'utf8'
);

/** The source of one `const <name>: ColumnDef<…> = { … };` block. */
const columnBlock = (name: string): string => {
  const start = drawerSource.indexOf(`const ${name}: ColumnDef<`);
  expect(start, `${name} must exist in DrawerDealsTable`).toBeGreaterThan(-1);
  const end = drawerSource.indexOf('\n    };', start);
  return drawerSource.slice(start, end);
};

describe('bot drawer Net P&L on open deals (spec 111)', () => {
  // §2 — an open LONG futures deal after one reduce: the reduce sold 106421
  // base for 294.4669 quote, which is now the deal's whole quote balance.
  const unrealizedProfit = -1543.515216901378;
  const realizedProfit = -523.71085845246;

  it('§1.1 reports the deal total, not unrealized + realized', () => {
    expect(
      calculateDealNetPnl({ active: true, unrealizedProfit, realizedProfit })
    ).toBeCloseTo(-1543.5152, 4);
  });

  it('§1.3 inactive deals keep reporting realized only', () => {
    // transformDealToTrade sets unrealizedProfit to undefined when not active.
    expect(
      calculateDealNetPnl({
        active: false,
        unrealizedProfit: undefined,
        realizedProfit,
      })
    ).toBeCloseTo(realizedProfit, 8);
  });

  for (const name of ['netPnlColumn', 'netPnlPercentageColumn']) {
    it(`§1.2 ${name} goes through calculateDealNetPnl`, () => {
      const block = columnBlock(name);
      expect(
        block,
        `${name} must not add realized profit on top of unrealizedProfit`
      ).not.toMatch(/unrealizedPnl\s*\+\s*realizedPnl/);
      // accessor + cell
      expect(block.match(/calculateDealNetPnl\(/g)?.length ?? 0).toBe(2);
    });
  }
});
