/**
 * Runner: `npx vitest run core/tests/botFormSectionScrollSpy.vitest.test.ts`
 * (from the parent). Spec: `specs/096.bot-form-section-nav-highlight.md`.
 *
 * The bot form's scroll-spy picked the section with the largest visible area,
 * so a tall neighbour always beat a short or last section and overrode the
 * tab the user had just clicked. The rule is now: last section whose top has
 * reached its click-scroll position, or the last section at max scroll.
 */
import { describe, expect, it } from 'vitest';
import {
  SECTION_ACTIVATION_LINE_PX,
  bindUserScrollIntent,
  measureSectionTops,
  pickActiveSection,
} from '../src/features/bots/widgets/BotForm/sectionScrollSpy';

const at = (tops: Record<string, number>) =>
  Object.entries(tops).map(([id, top]) => ({ id, top }));

describe('pickActiveSection (§2)', () => {
  it('keeps the first section at scrollTop 0 even when the next is taller', () => {
    // Basic header at 0, a 589px Strategy below — area-based picked Strategy
    expect(
      pickActiveSection(
        at({ basic: 0, strategy: 305, 'deal-start': 894 }),
        false
      )
    ).toBe('basic');
  });

  it('picks a short section whose header sits on the activation line', () => {
    // Deal Start (373px) clicked → header at its scroll-margin; Take Profit (587px) below
    expect(
      pickActiveSection(
        at({
          basic: -942,
          strategy: -626,
          'deal-start': 0,
          'take-profit': 373,
        }),
        false
      )
    ).toBe('deal-start');
  });

  it('does not activate a section until its header crosses the line', () => {
    expect(
      pickActiveSection(
        at({ basic: -400, strategy: SECTION_ACTIVATION_LINE_PX + 1 }),
        false
      )
    ).toBe('basic');
  });

  it('pins the last section at max scroll, even below the line', () => {
    // Webhooks / Notifications can't reach the top: DCA has crossed the line
    expect(
      pickActiveSection(
        at({ dca: -700, webhook: 624, 'ext-notifications': 704 }),
        true
      )
    ).toBe('ext-notifications');
  });

  it('returns null with no sections', () => {
    expect(pickActiveSection([], false)).toBeNull();
  });
});

describe('measureSectionTops', () => {
  it('measures each header from its own scroll-margin, skipping missing ones', () => {
    const box = (top: number) => {
      const el = document.createElement('div');
      el.getBoundingClientRect = () => ({ top }) as DOMRect;
      return el;
    };
    const container = box(100);
    // the read-only drawer parks a clicked header under its 64px sticky bar
    const drawerSection = box(164);
    drawerSection.style.scrollMarginTop = '64px';
    const formSection = box(116);
    formSection.style.scrollMarginTop = '16px';
    const els: Record<string, HTMLElement> = {
      drawer: drawerSection,
      form: formSection,
    };
    expect(
      measureSectionTops(container, ['drawer', 'gone', 'form'], (id) => els[id])
    ).toEqual([
      { id: 'drawer', top: 0 },
      { id: 'form', top: 0 },
    ]);
  });
});

describe('bindUserScrollIntent', () => {
  it('fires on user input, not on programmatic scroll, and unbinds', () => {
    const el = new EventTarget() as HTMLElement;
    let n = 0;
    const unbind = bindUserScrollIntent(el, () => n++);
    el.dispatchEvent(new Event('scroll'));
    expect(n).toBe(0);
    for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      el.dispatchEvent(new Event(t));
    expect(n).toBe(4);
    unbind();
    el.dispatchEvent(new Event('wheel'));
    expect(n).toBe(4);
  });
});
