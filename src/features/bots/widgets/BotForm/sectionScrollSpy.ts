/**
 * Scroll-spy rules shared by the bot form and its read-only drawer.
 *
 * A section becomes active once its header has scrolled to (or past) the
 * point a tab click scrolls it to — its scroll-margin below the container's
 * top, plus a small tolerance. At max scroll the last section wins, because
 * the last sections can never reach that point.
 */
export const SECTION_ACTIVATION_LINE_PX = 16;

/**
 * @param sections in document order; `top` is the header's distance below
 *   its click-scroll position (see measureSectionTops)
 * @param atBottom the container is scrolled to its end
 */
export function pickActiveSection(
  sections: ReadonlyArray<{ id: string; top: number }>,
  atBottom: boolean
): string | null {
  if (sections.length === 0) return null;
  if (atBottom) return sections[sections.length - 1].id;
  let active = sections[0].id;
  for (const { id, top } of sections) {
    if (top > SECTION_ACTIVATION_LINE_PX) break;
    active = id;
  }
  return active;
}

/**
 * Offsets of the given sections' headers from where a tab click scrolls them
 * to: the container's top plus the section's own `scroll-margin-top`.
 */
export function measureSectionTops(
  container: HTMLElement,
  ids: ReadonlyArray<string>,
  getSection: (id: string) => HTMLElement | null | undefined
): Array<{ id: string; top: number }> {
  const containerTop = container.getBoundingClientRect().top;
  return ids.flatMap((id) => {
    const el = getSection(id);
    if (!el) return [];
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return [{ id, top: el.getBoundingClientRect().top - containerTop - margin }];
  });
}

/** True when `el` can scroll and is scrolled to its end. */
export function isScrolledToBottom(el: HTMLElement): boolean {
  return (
    el.scrollTop > 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 1
  );
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

/**
 * Calls `onIntent` when the user starts scrolling `el` themselves (wheel,
 * touch, keyboard, scrollbar), never for programmatic scrolls. Used to keep a
 * clicked tab active until then; `scrollend` is not available in Safari.
 */
export function bindUserScrollIntent(
  el: HTMLElement,
  onIntent: () => void
): () => void {
  USER_SCROLL_EVENTS.forEach((type) =>
    el.addEventListener(type, onIntent, { passive: true })
  );
  return () =>
    USER_SCROLL_EVENTS.forEach((type) =>
      el.removeEventListener(type, onIntent)
    );
}
