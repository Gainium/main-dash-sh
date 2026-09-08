/**
 * Runner note: this file renders a React component in jsdom, so it is a Vitest
 * file (`*.vitest.test.tsx`), not one of core's Playwright `.unit.test.ts`
 * pure-function tests. Run from the parent:
 * `npx vitest run core/tests/bug701CreditsChipFloor.vitest.test.tsx`.
 */

/**
 * Bug #701 — "Inaccurate Subscription information", second defect.
 * Spec: `main-dash-redesign/specs/008.credit-quotes-skip-the-per-bot-floor.md`.
 *
 * main-app charges `Math.floor(base + pairs + indicators + deals)` per bot
 * (`src/bot/utils.ts`), and the shared `calculateCost` helper mirrors that in
 * its `total`. `CreditsChip` ignored that `total` and re-summed the four
 * component props, so the bot create form quoted `154.5` credits for a
 * 130-pair / 50-deal bot the backend charges `154` for — while the
 * insufficient-credits gate right next to it used the floored `credits.total`.
 * `BotCreditsDisplay`, the component the chip replaced, floors (`:69-71`);
 * dropping it here was a regression against the file's own behaviour.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CreditsChip } from '@/features/bots/widgets/BotForm/components/BotFormFooter';
import { calculateCost } from '@/utils/bots/credits';
import { BotTypesEnum } from '@/types';

/** The reporter's own bot: 130 pairs, 0 indicators, 50 max deals. */
const REPORTER_BOT = {
  botType: BotTypesEnum.dca,
  pairs: 130,
  indicators: 0,
  deals: 50,
  affiliate: false,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const renderChip = (credits: {
  base: number;
  pairs: number;
  indicators: number;
  deals: number;
  total: number;
}) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const chipRoot = createRoot(el);
  container = el;
  root = chipRoot;
  act(() => {
    chipRoot.render(
      createElement(CreditsChip, { isCompact: false, credits, affiliate: false })
    );
  });
  const button = el.querySelector('button');
  if (!button) throw new Error('credits chip did not render a button');
  return {
    aria: button.getAttribute('aria-label'),
    face: button.textContent?.trim(),
  };
};

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('bug #701 — the credits chip quotes the charged (floored) total', () => {
  it("§2.1 quotes 154 for the reporter's 130-pair / 50-deal bot", () => {
    const credits = calculateCost(REPORTER_BOT);
    // Guard the premise: the components really do sum to a fractional 154.5,
    // so this test can only pass because the chip stopped re-summing them.
    expect(
      credits.base + credits.pairs + credits.indicators + credits.deals
    ).toBe(154.5);
    expect(credits.total).toBe(154);

    const { aria, face } = renderChip(credits);
    expect(aria).toBe('154 credits');
    expect(face).toBe('154');
  });

  it('§1.1 never renders a fractional quote', () => {
    for (const pairs of [2, 3, 7, 130, 131]) {
      const credits = calculateCost({ ...REPORTER_BOT, pairs });
      const { face } = renderChip(credits);
      expect(face).toBe(String(credits.total));
      expect(face).not.toContain('.');
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it('§3 honours a pre-multiplied total (hedge bot, two legs)', () => {
    // BotFormFooter multiplies the FLOORED per-leg total by `creditsMultiplier`
    // (2 for a hedge bot), matching the backend's one floored `botCosts` row
    // per leg. Summing the components instead would quote 309 for this.
    const computed = calculateCost(REPORTER_BOT);
    const credits = {
      base: computed.base * 2,
      indicators: computed.indicators * 2,
      pairs: computed.pairs * 2,
      deals: computed.deals * 2,
      total: computed.total * 2,
    };
    const { aria } = renderChip(credits);
    expect(aria).toBe('308 credits');
  });
});
