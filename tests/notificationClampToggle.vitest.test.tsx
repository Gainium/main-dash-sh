import React from 'react';
import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NotificationRichContent } from '@/components/notifications/NotificationRichContent';
import type { UnifiedNotification } from '@/stores/notificationsStore';

// Spec: specs/087.notification-clamp-toggle-by-overflow.md
//
// The expand arrow must follow whether the clamped text is actually cut off,
// not how many characters the message has. jsdom has no layout, so the tests
// give the message element the heights a browser would: a clamped element
// whose content is taller than its LINE_HEIGHT * clampLines box overflows.

const LINE_HEIGHT = 20;
// Rendered line count per message, keyed by the message string.
let renderedLines: Record<string, number> = {};

const clampOf = (el: HTMLElement) => {
  const m = /line-clamp-(\d+)/.exec(el.className);
  return m ? Number(m[1]) : null;
};
const linesOf = (el: HTMLElement) =>
  Object.entries(renderedLines).find(([msg]) =>
    el.innerHTML.includes(msg.slice(0, 20)),
  )?.[1] ?? 0;

const original = {
  scrollHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight',
  ),
  clientHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight',
  ),
};

beforeEach(() => {
  renderedLines = {};
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return linesOf(this) * LINE_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const clamp = clampOf(this);
      const lines = linesOf(this);
      return (clamp === null ? lines : Math.min(lines, clamp)) * LINE_HEIGHT;
    },
  });
});

afterEach(() => {
  cleanup();
  for (const key of ['scrollHeight', 'clientHeight'] as const) {
    const d = original[key];
    if (d) Object.defineProperty(HTMLElement.prototype, key, d);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

const changelog = (message: string): UnifiedNotification =>
  ({
    id: 'c1',
    type: 'bugfix',
    title: 'Oct 05 2026 Update',
    message,
    time: 0,
    notificationType: 'changelog',
    htmlDescription: true,
    isRead: false,
  }) as UnifiedNotification;

// The "Oct 05 2026 Update" short description: 222 characters, three blocks.
const SHORT_MULTI_BLOCK =
  '<h3 style="text-align: start">Bug fixes</h3><p><strong>Cloud &amp; Self-hosted</strong></p><p>- Deal Returns chart: bots with many closed deals now show all of them, instead of leaving the older part of the chart empty</p>';

const toggle = () => screen.queryByTitle(/Show (more|less)/);
const toggleTitle = () => toggle()?.getAttribute('title');

describe('NotificationRichContent expand arrow', () => {
  test('§1.1 short multi-block HTML that overflows a 3-line clamp shows the arrow', () => {
    expect(SHORT_MULTI_BLOCK.length).toBeLessThan(3 * 90);
    renderedLines[SHORT_MULTI_BLOCK] = 4;
    render(
      <NotificationRichContent
        notification={changelog(SHORT_MULTI_BLOCK)}
        clampLines={3}
      />,
    );
    expect(toggleTitle()).toBe('Show more');
  });

  test('§1.2 the arrow stays after expanding, as a collapse arrow', () => {
    renderedLines[SHORT_MULTI_BLOCK] = 4;
    render(
      <NotificationRichContent
        notification={changelog(SHORT_MULTI_BLOCK)}
        clampLines={3}
      />,
    );
    fireEvent.click(screen.getByTitle('Show more'));
    expect(toggleTitle()).toBe('Show less');
    fireEvent.click(screen.getByTitle('Show less'));
    expect(toggleTitle()).toBe('Show more');
  });

  test('§1.3 a long message that still fits the clamp shows no arrow', () => {
    const fits = '<p>' + 'x'.repeat(400) + '</p>';
    renderedLines[fits] = 3;
    render(
      <NotificationRichContent notification={changelog(fits)} clampLines={3} />,
    );
    expect(toggle()).toBeNull();
  });

  test('§1.3 disableClamp shows no arrow', () => {
    renderedLines[SHORT_MULTI_BLOCK] = 4;
    render(
      <NotificationRichContent
        notification={changelog(SHORT_MULTI_BLOCK)}
        clampLines={3}
        disableClamp
      />,
    );
    expect(toggle()).toBeNull();
  });
});
