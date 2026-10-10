/**
 * Runner: `npx vitest run core/tests/botsTabTableHeightBound.vitest.test.ts`
 * (from the parent). Spec: `specs/095.bots-table-unscrollable-desktop.md`.
 *
 * On desktop the DCA, Combo and Hedge DCA pages bound the height chain from
 * the page down to the bots table so the table's own scroller is the only
 * vertical scroller (that is what keeps its header pinned). The bots tab's
 * TabsContent is a block box, so the `flex-1` on the table wrapper inside it
 * does nothing: the wrapper grows to its content and the TabsContent
 * (`overflow-hidden`) clips it. The table's `h-full` scroller then never gets
 * a bounded height, nothing scrolls, and rows past the fold, the totals row
 * and the pagination footer are unreachable.
 *
 * jsdom does not lay out, so — as for other layout defects here — this
 * asserts on the class string that IS the behaviour: the wrapper must take
 * the TabsContent's height on desktop (`md:h-full`). Phones scroll the page
 * and must stay unbounded, so the bound is `md:`-only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES = [
  'src/pages/TradingBots.tsx',
  'src/pages/ComboBots.tsx',
  'src/pages/hedge-bots/HedgeDcaBots.tsx',
];

/** className of the first element opened inside `<TabsContent value="bots">`. */
const botsTabWrapperClass = (file: string): string => {
  const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
  const tab = /<TabsContent\s+value="bots"[^>]*>/.exec(src);
  if (!tab) throw new Error(`${file}: no bots TabsContent`);
  const after = src.slice(tab.index + tab[0].length);
  const wrapper = /<motion\.div\s+className="([^"]*)"/.exec(after);
  if (!wrapper) throw new Error(`${file}: no table wrapper in bots tab`);
  return wrapper[1];
};

describe('bots tab table wrapper is height-bounded on desktop (spec §1, §2)', () => {
  for (const file of PAGES) {
    it(`${file}: wrapper fills the TabsContent from md up`, () => {
      const classes = botsTabWrapperClass(file).split(/\s+/);
      expect(classes).toContain('md:h-full');
      // §2: phones keep the page scroller — no unprefixed height bound.
      expect(classes).not.toContain('h-full');
    });
  }
});
