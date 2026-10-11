/**
 * Runner: `npx vitest run core/tests/readOnlyBotFormScrollContainer.vitest.test.ts`
 * (from the parent). Spec: `specs/097.readonly-drawer-scroll-spy-container.md`.
 *
 * The read-only bot drawer bound its scroll-spy to the first ancestor with
 * overflow:auto. In the drawer that is a wrapper which grows to its content
 * and never scrolls, so a hand scroll never moved the highlighted tab. The
 * container must be the nearest ancestor that actually scrolls.
 */
import { describe, expect, it } from 'vitest';
import { findScrollingAncestor } from '../src/components/ui/data-table/usePinnedHeaderOnPageScroll';

/** jsdom has no layout: give an element the sizes the browser measured. */
const box = (overflowY: string, scrollHeight: number, clientHeight: number) => {
  const el = document.createElement('div');
  el.style.overflowY = overflowY;
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight });
  return el;
};

/** Drawer body (scrolls) > content wrapper (overflow:auto, grown) > form. */
const drawer = (bodySize: [number, number]) => {
  const body = box('auto', ...bodySize);
  const wrapper = box('auto', 7991, 7991);
  const form = document.createElement('div');
  body.appendChild(wrapper);
  wrapper.appendChild(form);
  document.body.appendChild(body);
  return { body, wrapper, form };
};

describe('findScrollingAncestor (§2)', () => {
  it('skips an overflow:auto wrapper that grows to its content', () => {
    const { body, form } = drawer([7999, 917]);
    expect(findScrollingAncestor(form)).toBe(body);
    body.remove();
  });

  it('returns null while nothing overflows yet, so the caller can retry', () => {
    const { body, form } = drawer([917, 917]);
    expect(findScrollingAncestor(form)).toBeNull();
    body.remove();
  });
});
