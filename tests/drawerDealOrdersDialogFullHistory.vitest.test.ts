/**
 * Runner note: Vitest, run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/drawerDealOrdersDialogFullHistory.vitest.test.ts`
 *
 * Spec: `specs/153.drawer-deal-orders-dialog-full-history.md`.
 *
 * The bot drawer deals table's Usage gauge opens an orders dialog for one
 * deal. It filtered the bot-level order pool (`useBotOrders`, capped at its
 * 2 × 500 newest orders), so on a busy bot an older deal's base order and early
 * DCA levels were missing. The dialog must read the deal's own orders.
 *
 * `DrawerDealsTable` cannot be mounted in jsdom without a harness larger than
 * the fix (see drawerNetPnlNoDoubleCount), so the dialog's source is held to a
 * contract here. The behavioural half — `useDealOrders` returns the whole deal
 * while the capped pool holds only part of it, and `splitDealOrders` lists it —
 * is proven in `botDrawerDealOrdersFullHistory.vitest.test.tsx`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(
    process.cwd(),
    'core/src/components/widgets/bots/drawer/DrawerDealsTable.tsx'
  ),
  'utf8'
);

/** From `const ordersForDealDialog` to the end of the `<DealOrdersDialog>` mount. */
const dialogBlock = (): string => {
  const start = src.indexOf('const ordersForDealDialog');
  const mount = src.indexOf('<DealOrdersDialog', start);
  expect(start).toBeGreaterThan(-1);
  expect(mount).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('/>', mount));
};

describe('bot drawer Usage-gauge orders dialog (spec 153)', () => {
  it('§1 does not build the dialog from the capped bot-level pool', () => {
    const block = dialogBlock();
    expect(block).not.toMatch(/\[\s*\.\.\.pendingOrders,\s*\.\.\.completedOrders\s*\]/);
    expect(block).not.toMatch(/o\.dealId === selectedDealForOrders\.id/);
  });

  it('§3 fetches the selected deal with useDealOrders, only while the dialog is open', () => {
    expect(src).toMatch(
      /const dialogDeal = ordersDialogOpen \? selectedDealForOrders : null;/
    );
    expect(src).toMatch(
      /useDealOrders\(\s*dialogDeal \? \(dialogDeal\.botId \|\| botId \|\| ''\) : '',\s*dialogDeal\?\.id \?\? '',/
    );
  });

  it('§3 maps through splitDealOrders and reports the fetch as loading', () => {
    const block = dialogBlock();
    expect(block).toMatch(/splitDealOrders\(dialogDealOrders,/);
    expect(block).toMatch(/isLoading=\{dialogDealOrdersLoading\}/);
  });
});
