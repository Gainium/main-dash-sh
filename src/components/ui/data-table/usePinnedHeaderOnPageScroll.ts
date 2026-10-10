import { useEffect } from 'react';

const PHONE_QUERY = '(max-width: 767px)';

function scrollableAncestors(el: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') found.push(p);
  }
  return found;
}

/** Nearest ancestor that actually scrolls — not just one with overflow:auto. */
function findPageScroller(el: HTMLElement): HTMLElement {
  return (
    scrollableAncestors(el).find((p) => p.scrollHeight > p.clientHeight + 1) ??
    (document.scrollingElement as HTMLElement) ??
    document.body
  );
}

/**
 * Phones scroll the whole page, and the table's own scroller (needed for
 * sideways overflow) would carry its sticky header off screen with it.
 *
 * This caps the scroller to the height the page leaves it once everything
 * above has scrolled away, and keeps vertical scrolling on the page until the
 * page reaches its end. From there the table scrolls, with its header row
 * pinned at the top. Wider screens size the table to their layout instead and
 * are left alone.
 */
export function usePinnedHeaderOnPageScroll(
  el: HTMLElement | null,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled || !el || typeof window.matchMedia !== 'function') return;

    const mq = window.matchMedia(PHONE_QUERY);
    let page: HTMLElement | null = null;

    const setStyle = (prop: 'max-height' | 'overflow-y', value: string) => {
      if (value) el.style.setProperty(prop, value);
      else el.style.removeProperty(prop);
    };
    const reset = () => {
      setStyle('max-height', '');
      setStyle('overflow-y', '');
    };

    const update = (relocate: boolean) => {
      if (!mq.matches) {
        reset();
        return;
      }
      if (relocate || !page) page = findPageScroller(el);
      const isDocument = page === document.scrollingElement;
      const pageTop = page.getBoundingClientRect().top;
      // Everything laid out below the scroller: footer, paddings, bottom nav.
      const below =
        page.scrollHeight -
        (el.getBoundingClientRect().bottom -
          pageTop +
          (isDocument ? 0 : page.scrollTop));
      const cap = page.clientHeight - below;
      setStyle('max-height', cap > 200 ? `${cap}px` : '');
      const atEnd = page.scrollTop + page.clientHeight >= page.scrollHeight - 2;
      setStyle('overflow-y', atEnd ? '' : 'hidden');
    };

    const onScroll = () => update(false);
    const onLayout = () => update(true);
    const scrollTarget = () =>
      page === document.scrollingElement ? window : page;

    update(true);
    let listening = scrollTarget();
    listening?.addEventListener('scroll', onScroll, { passive: true });

    const relayout = () => {
      onLayout();
      const next = scrollTarget();
      if (next !== listening) {
        listening?.removeEventListener('scroll', onScroll);
        next?.addEventListener('scroll', onScroll, { passive: true });
        listening = next;
      }
    };

    window.addEventListener('resize', relayout);
    mq.addEventListener('change', relayout);
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(relayout)
        : null;
    // Content above the table (stats, filters) loads on its own schedule, and
    // the page only becomes the scroller once it overflows — watch every
    // candidate's content, not just the table.
    ro?.observe(el.firstElementChild ?? el);
    for (const p of scrollableAncestors(el)) {
      if (p.firstElementChild) ro?.observe(p.firstElementChild);
    }

    return () => {
      listening?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', relayout);
      mq.removeEventListener('change', relayout);
      ro?.disconnect();
      reset();
    };
  }, [el, enabled]);
}
