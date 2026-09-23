import type { Bar, SubscribeBarsCallback } from './types';

// TradingView's realtime callback accepts only the newest bar it holds or a
// newer one; an older bar is rejected ("putToCacheNewBar: time violation").
// Exchange handlers are responsible for never sending one — this guard is the
// last line at the datafeed boundary, keyed per series (ticker|resolution),
// with the floor seeded from the history getBars returned.
export const createRealtimeBarGuard = () => {
  const newestTime = new Map<string, number>();

  const raise = (key: string, time: number) => {
    if (time > (newestTime.get(key) ?? -Infinity)) newestTime.set(key, time);
  };

  return {
    noteHistory(key: string, bars: Bar[]) {
      if (bars.length > 0) raise(key, bars[bars.length - 1].time);
    },
    wrap(
      key: string,
      onTick: SubscribeBarsCallback,
      onDrop?: (bar: Bar, newest: number) => void
    ): SubscribeBarsCallback {
      return (bar) => {
        const newest = newestTime.get(key) ?? -Infinity;
        if (bar.time < newest) {
          onDrop?.(bar, newest);
          return;
        }
        raise(key, bar.time);
        onTick(bar);
      };
    },
  };
};
