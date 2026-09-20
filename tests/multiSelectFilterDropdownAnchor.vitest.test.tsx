import React from 'react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { Column } from '@tanstack/react-table';

// The multi-select column filter ("Is any of" / "Is none of") sizes and aligns
// its option list from `--radix-popover-trigger-width`, which Radix resolves
// from the POPOVER ANCHOR — not from the trigger element, despite the name.
//
// `ColumnFilter` renders the input into a `flex-1 min-w-0` slot that sits after
// the operator button, and the input's own trigger is deliberately pinned to a
// 24px floor (`min-w-6 shrink-0`) so the selected chips — not the empty text
// field — absorb the row's shrinking. With no explicit anchor Radix makes the
// trigger its own anchor, so once values are selected the option list opened as
// a sliver at the right-hand end of the cell, under the gap where the next chip
// goes, instead of spanning the column.
//
// jsdom performs no layout — every rect is 0x0 and floating-ui never reads the
// elements' own `getBoundingClientRect` — so the anchor cannot be identified by
// measuring. The real `PopoverAnchor` is rendered and its `virtualRef` prop is
// captured instead, which pins exactly the wiring that was wrong: WHICH element
// Radix is told to anchor to. (Same capture idiom as bug655's `DndContext`.)

// jsdom has no ResizeObserver; Radix's popper positioning uses one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const box = vi.hoisted(() => ({
  anchorVirtualRef: null as { current: Element | null } | null,
  anchorRenders: 0,
}));

vi.mock('@/components/ui/popover', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/ui/popover')>();
  return {
    ...actual,
    PopoverAnchor: (
      props: React.ComponentProps<typeof actual.PopoverAnchor> & {
        virtualRef?: { current: Element | null };
      }
    ) => {
      box.anchorRenders++;
      box.anchorVirtualRef = props.virtualRef ?? null;
      return React.createElement(actual.PopoverAnchor, props);
    },
  };
});

import { ColumnFilter } from '@/components/ui/data-table/filter-components';

const SYMBOLS = ['ADI-USD', 'AI-USD', '0G-USD', '2Z-USD', 'A-USD', 'ACU-USD'];
const SELECTED = ['ADI-USD', 'AI-USD'];

/** A column whose filter is the Symbol-style multi-select, with values picked. */
function makeColumn() {
  return {
    id: 'symbol',
    columnDef: { meta: { filterType: 'array', filterOptions: SYMBOLS } },
    getFilterValue: () => ({ operator: 'isAnyOf', value: SELECTED }),
    setFilterValue: () => {},
    getFacetedRowModel: () => ({ rows: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as Column<any, unknown>;
}

afterEach(() => {
  cleanup();
  box.anchorVirtualRef = null;
  box.anchorRenders = 0;
});

describe('multi-select column filter dropdown anchoring', () => {
  test('§1.1 the dropdown is anchored to the filter CELL, not the collapsed residual input', () => {
    const { container } = render(<ColumnFilter column={makeColumn()} />);

    const cell = container.firstElementChild as HTMLElement;
    const trigger = container.querySelector(
      '[data-slot="popover-trigger"]'
    ) as HTMLElement;
    expect(cell, 'the filter cell').not.toBeNull();
    expect(trigger, 'the residual input trigger').not.toBeNull();

    // The trigger is nested inside the cell, so "anchored to the cell" is a
    // strictly wider box than "anchored to the trigger" — that difference is
    // the whole defect.
    expect(cell.contains(trigger)).toBe(true);
    expect(cell).not.toBe(trigger);

    expect(
      box.anchorRenders,
      'an explicit PopoverAnchor must be rendered'
    ).toBeGreaterThan(0);
    expect(
      box.anchorVirtualRef?.current,
      'Radix must be anchored to the filter cell'
    ).toBe(cell);
  });

  test('§1.1 the option list tracks the anchor width with a legible floor', () => {
    const { container } = render(<ColumnFilter column={makeColumn()} />);
    const trigger = container.querySelector('[data-slot="popover-trigger"]')!;
    act(() => {
      fireEvent.click(trigger.querySelector('button')!);
    });

    const content = document.querySelector('[data-slot="popover-content"]');
    expect(content, 'the dropdown must be open').not.toBeNull();
    expect(content!.className).toContain('w-(--radix-popover-trigger-width)');
    // A floor, so a very narrow column still yields a readable list rather
    // than a sliver.
    expect(content!.className).toContain('min-w-48');
  });

  test('§4 the residual input still lets the chips absorb the shrinking', () => {
    const { container } = render(<ColumnFilter column={makeColumn()} />);
    const trigger = container.querySelector('[data-slot="popover-trigger"]')!;
    // Widening this back out would "fix" the dropdown by re-breaking chip
    // readability in a narrow column.
    expect(trigger.className).toContain('min-w-6');
    expect(trigger.className).toContain('shrink-0');
    // And the chips are still rendered inside the filter row.
    expect(container.textContent).toContain('ADI-USD');
    expect(container.textContent).toContain('AI-USD');
  });
});
