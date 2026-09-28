import React from 'react';
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ListModal } from '@/components/widgets/shared/ListModal';

// The pair icon resolves assets through the exchange-data context; it is not
// what these tests are about.
vi.mock('@/components/widgets/shared/CoinPair', () => ({
  default: () => null,
}));

// Spec: specs/072.pair-picker-window-stuck-on-first-screen.md
//
// The pair picker windows its rows: only rows in and around the visible part
// of the scroll box are mounted. These tests scroll the box and assert that
// rows far below the first screen get mounted — the reported defect was a
// picker that kept showing the first ~18 pairs over an empty, still-scrolling
// area.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom has no layout. Give the scroll box a real height and make the list
// inside it move up as the box scrolls, which is all the windowing reads.
const VIEWPORT = 500;
// Animation frames are queued and run by `scrollTo` below, like a browser
// would run them after the scroll event.
let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  const pending = frames;
  frames = [];
  pending.forEach((cb) => cb(0));
};
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('overflow-y-auto') ? VIEWPORT : 0;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const parent = this.parentElement;
      const top =
        parent && parent.classList.contains('overflow-y-auto')
          ? -parent.scrollTop
          : 0;
      return {
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    }
  );
});

const pad = (n: number) => String(n).padStart(3, '0');
// Alphabetical order is P000..P299; market-cap order is the reverse.
const ITEMS = Array.from({ length: 300 }, (_, i) => ({
  symbol: `P${pad(i)}-USDT`,
  name: `P${pad(i)}/USDT`,
  baseAsset: `P${pad(i)}`,
  quoteAsset: 'USDT',
  icon: 'P',
  color: 'red',
  marketCapRank: 300 - i,
}));

const SORT_OPTIONS = [
  { value: 'marketcap', label: 'Market cap' },
  { value: 'alpha', label: 'A–Z' },
];

const Picker: React.FC<{ sortMode: string; isLoading?: boolean }> = ({
  sortMode,
  isLoading = false,
}) => (
  <ListModal
    isOpen={true}
    isLoading={isLoading}
    onClose={() => {}}
    title="Select Pairs"
    items={ITEMS}
    selectedItems={[]}
    onItemToggle={() => {}}
    sortOptions={SORT_OPTIONS}
    sortMode={sortMode}
    onSortModeChange={() => {}}
  />
);

const scrollBox = () =>
  screen
    .getByTestId('list-modal-content')
    .querySelector('.overflow-y-auto') as HTMLDivElement;

const scrollTo = (top: number) => {
  const el = scrollBox();
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
    flushFrames();
  });
};

// Unmeasured rows are 60px + 4px gap; row N starts at N * 64.
const ROW = 64;

describe('ListModal windowed rows (§3)', () => {
  test('§3.0 control: a picker that loaded its pairs AFTER opening scrolls its rows', () => {
    const { rerender } = render(<Picker sortMode="alpha" isLoading />);
    rerender(<Picker sortMode="alpha" />);
    expect(screen.queryByText('P000')).toBeTruthy();

    scrollTo(150 * ROW);

    expect(screen.queryByText('P150')).toBeTruthy();
  });

  test('§3.1 scrolling a picker that opened with pairs already loaded mounts later rows', () => {
    render(<Picker sortMode="alpha" />);
    expect(screen.queryByText('P000')).toBeTruthy();

    scrollTo(150 * ROW);

    expect(screen.queryByText('P150')).toBeTruthy();
    expect(screen.queryByText('P000')).toBeNull();
  });

  test('§3.2 after a re-sort, scrolling still mounts later rows', () => {
    const { rerender } = render(<Picker sortMode="marketcap" />);
    // Market-cap order: P299 first.
    expect(screen.queryByText('P299')).toBeTruthy();

    rerender(<Picker sortMode="alpha" />);
    scrollTo(0);
    expect(screen.queryByText('P000')).toBeTruthy();

    scrollTo(200 * ROW);
    expect(screen.queryByText('P200')).toBeTruthy();

    scrollTo(290 * ROW);
    expect(screen.queryByText('P295')).toBeTruthy();
  });
});
