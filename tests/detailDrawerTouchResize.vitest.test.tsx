import React from 'react';
import { describe, test, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { DetailDrawer, DetailDrawerContent } from '@/components/ui/detail-drawer';

// The bot detail drawer's resize handles must follow a finger, not only a mouse.
//
// Spec: specs/089.detail-drawer-touch-resize.md
//
// On a touch tablet a drag delivers pointerdown/pointermove (and, with the
// browser's default touch-action, a pointercancel once it claims the gesture
// for panning) but never mousedown/mousemove. The handles listened for mouse
// events only, so a finger drag did nothing.
//
// Run: NODE_ENV=development npx vitest run core/tests/detailDrawerTouchResize.vitest.test.tsx
//      (from the main-dash-redesign parent)

beforeAll(() => {
  // jsdom ships no PointerEvent; RTL would fall back to a bare Event with no
  // clientX/pointerType. A MouseEvent subclass is what browsers implement.
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    (window as unknown as Record<string, unknown>).PointerEvent = PointerEventPolyfill;
  }
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderDrawer = () =>
  render(
    <DetailDrawer open onOpenChange={() => {}}>
      <DetailDrawerContent leftPanel={<div>chart</div>}>
        <div>info</div>
      </DetailDrawerContent>
    </DetailDrawer>
  );

const chartWidth = () =>
  (document.querySelector('[data-drawer-left-panel="true"]') as HTMLElement).style.width;

const finger = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };

describe('§1.1 a finger drag on the drawer edge resizes the chart panel', () => {
  test('touch pointerdown → pointermove → pointerup moves the chart panel width', async () => {
    renderDrawer();
    const edge = await screen.findByRole('separator', { name: 'Resize chart panel' });
    const before = chartWidth();

    act(() => {
      fireEvent.pointerDown(edge, { ...finger, clientX: 0 });
    });
    act(() => {
      // The drawer opens at (1280 - 4) / 2 = 638 per panel and spans the
      // viewport. Pull its left edge 200px right: the chart panel narrows by 200.
      fireEvent.pointerMove(document, { ...finger, clientX: 200 });
    });
    act(() => {
      fireEvent.pointerUp(document, finger);
    });

    expect(before).toBe('638px');
    expect(chartWidth()).toBe('438px');
  });

  test('the split handle follows a finger too (info panel grows)', async () => {
    renderDrawer();
    const split = await screen.findByRole('separator', { name: 'Resize drawer' });
    const info = () =>
      (document.querySelector('[data-drawer-panel="true"]') as HTMLElement).style.width;
    const before = info();

    act(() => {
      fireEvent.pointerDown(split, { ...finger, clientX: 640 });
    });
    act(() => {
      fireEvent.pointerMove(document, { ...finger, clientX: 440 });
    });
    act(() => {
      fireEvent.pointerUp(document, finger);
    });

    expect(info()).not.toBe(before);
  });
});

describe('§1.3 a cancelled gesture ends the resize', () => {
  test('pointercancel stops further moves from resizing', async () => {
    renderDrawer();
    const edge = await screen.findByRole('separator', { name: 'Resize chart panel' });

    act(() => {
      fireEvent.pointerDown(edge, { ...finger, clientX: 0 });
    });
    act(() => {
      fireEvent.pointerMove(document, { ...finger, clientX: 100 });
    });
    const atCancel = chartWidth();
    act(() => {
      fireEvent.pointerCancel(document, finger);
    });
    act(() => {
      fireEvent.pointerMove(document, { ...finger, clientX: 300 });
    });

    expect(chartWidth()).toBe(atCancel);
  });
});

describe('§1.2 the browser does not claim the drag for panning', () => {
  test('every resize handle opts out of touch panning', async () => {
    renderDrawer();
    const handles = await screen.findAllByRole('separator');
    expect(handles.length).toBe(2);
    for (const h of handles) expect(h.className).toMatch(/\btouch-none\b/);
  });
});
