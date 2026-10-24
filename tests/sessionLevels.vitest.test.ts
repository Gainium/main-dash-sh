import { describe, expect, it } from 'vitest';
import {
  SessionLevels,
  sessionKey as libSessionKey,
} from '@gainium/indicators';

import {
  ExchangeIntervals,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  SessionRuleEnum,
  type SettingsIndicators,
} from '@/types';
import { chartIntervalToFollow } from '@/utils/indicators/chartIntervalSync';
import { sessionRuleParams } from '@/utils/indicators/sessionWindow';
import {
  SessionLevelsState,
  sessionKey,
  type SessionLevelsResult,
} from '@/utils/indicators/sessionLevels';

// The chart study's copy of the session levels must agree with the one the
// bot engine and backtester run (@gainium/indicators), bar by bar.

const MINUTE = 60_000;

const walk = (n: number, seed: number, start: number, stepMs: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.02));
    const close = price;
    return {
      open,
      close,
      high: Math.max(open, close) * (1 + rand() * 0.005),
      low: Math.min(open, close) * (1 - rand() * 0.005),
      time: start + i * stepMs,
    };
  });
};

const KEYS: (keyof SessionLevelsResult)[] = [
  'prevOpen',
  'prevHigh',
  'prevMid',
  'prevLow',
  'prevClose',
  'curOpen',
  'price',
  'inSession',
  'sessionKey',
  'prevSessionKey',
];

const CASES = [
  {
    name: 'New York 09:30–16:00 on weekdays, 15m',
    days: [1, 2, 3, 4, 5],
    hours: { start: '09:30', end: '16:00', timezone: 'America/New_York' },
    step: 15 * MINUTE,
    // starts inside a session: that partial session never becomes previous
    start: Date.parse('2026-03-02T15:00:00Z'),
  },
  {
    name: 'Tokyo overnight 22:00–03:30, 5m',
    days: [0, 2, 4],
    hours: { start: '22:00', end: '03:30', timezone: 'Asia/Tokyo' },
    step: 5 * MINUTE,
    start: Date.parse('2026-10-20T00:00:00Z'),
  },
  {
    name: 'London whole days, 1h (across daylight saving)',
    days: [1, 3, 5],
    hours: { timezone: 'Europe/London' },
    step: 60 * MINUTE,
    start: Date.parse('2026-03-20T00:00:00Z'),
  },
];

describe('Session price levels chart copy', () => {
  for (const [index, c] of CASES.entries()) {
    it(`matches @gainium/indicators: ${c.name}`, () => {
      const lib = new SessionLevels(c.days, c.hours);
      const chart = new SessionLevelsState(c.days, c.hours);
      let completed = 0;
      let lastPrevKey = NaN;
      for (const candle of walk(6000, 7 + index * 13, c.start, c.step)) {
        expect(sessionKey(candle.time, c.days, c.hours)).toBe(
          libSessionKey(candle.time, c.days, c.hours)
        );
        const preview = chart.preview(candle);
        const ours = chart.next(candle);
        const theirs = lib.next(candle) as SessionLevelsResult | null;
        expect(theirs).not.toBeNull();
        for (const key of KEYS) {
          expect(ours[key]).toEqual(theirs?.[key]);
          expect(preview[key]).toEqual(ours[key]);
        }
        if (
          !isNaN(ours.prevSessionKey) &&
          ours.prevSessionKey !== lastPrevKey
        ) {
          completed++;
          lastPrevKey = ours.prevSessionKey;
        }
      }
      // the walk really exercised session rollovers
      expect(completed).toBeGreaterThan(5);
    });
  }

  it('never uses a session the data starts inside', () => {
    const days = [0, 1, 2, 3, 4, 5, 6];
    const hours = { start: '09:00', end: '17:00', timezone: 'Europe/Berlin' };
    const start = Date.parse('2026-10-21T10:00:00Z'); // 12:00 Berlin
    const lib = new SessionLevels(days, hours);
    const chart = new SessionLevelsState(days, hours);
    for (const candle of walk(24 * 4, 3, start, 15 * MINUTE)) {
      const ours = chart.next(candle);
      expect(ours.prevSessionKey).toEqual(lib.next(candle)?.prevSessionKey);
      // the first whole session opens 2026-10-22 and ends the same day
      if (candle.time < Date.parse('2026-10-22T15:00:00Z')) {
        expect(ours.prevHigh).toBeNaN();
      }
    }
  });
});

describe('Session Price levels rule in the form', () => {
  const session = (sessionRule: SessionRuleEnum, interval: ExchangeIntervals) =>
    ({
      uuid: 's',
      type: IndicatorEnum.session,
      sessionRule,
      indicatorInterval: interval,
    }) as unknown as SettingsIndicators;

  it('stores a 15m interval and the comparison defaults when picked', () => {
    const before = {
      ...session(SessionRuleEnum.in, ExchangeIntervals.oneH),
      indicatorCondition: IndicatorStartConditionEnum.bw,
    };
    expect(sessionRuleParams(SessionRuleEnum.levels, before)).toEqual({
      sessionRule: SessionRuleEnum.levels,
      indicatorInterval: ExchangeIntervals.fifteenM,
      sessionLevelA: 'price',
      sessionLevelB: 'prevHigh',
      indicatorCondition: IndicatorStartConditionEnum.cu,
    });
    // already Price levels, or back to in/out: only the rule changes
    expect(
      sessionRuleParams(
        SessionRuleEnum.levels,
        session(SessionRuleEnum.levels, ExchangeIntervals.oneH)
      )
    ).toEqual({ sessionRule: SessionRuleEnum.levels });
    expect(sessionRuleParams(SessionRuleEnum.out, before)).toEqual({
      sessionRule: SessionRuleEnum.out,
    });
  });

  it('moves the chart to its interval; in/out never do', () => {
    const clock = session(SessionRuleEnum.in, ExchangeIntervals.fifteenM);
    const levels = session(SessionRuleEnum.levels, ExchangeIntervals.fifteenM);
    expect(chartIntervalToFollow([], [clock])).toBeNull();
    expect(chartIntervalToFollow([], [levels])).toBe('15');
    // switching the rule with the interval unchanged still follows
    expect(chartIntervalToFollow([clock], [levels])).toBe('15');
    expect(chartIntervalToFollow([levels], [{ ...levels }])).toBeNull();
  });
});
