import { describe, expect, it } from 'vitest';
import {
  ExchangeIntervals,
  IndicatorEnum,
  type SettingsIndicators,
} from '@/types';
import { chartIntervalToFollow } from '@/utils/indicators/chartIntervalSync';
import {
  isInSession,
  isSessionActiveDuring,
  resolveSessionPreset,
  sessionPresetParams,
} from '@/utils/indicators/sessionWindow';

const indicator = (
  uuid: string,
  type: IndicatorEnum,
  indicatorInterval: ExchangeIntervals
) => ({ uuid, type, indicatorInterval }) as unknown as SettingsIndicators;

describe('chartIntervalToFollow', () => {
  it('follows an added indicator', () => {
    const rsi = indicator('a', IndicatorEnum.rsi, ExchangeIntervals.fifteenM);
    expect(chartIntervalToFollow([], [rsi])).toBe('15');
  });

  it('follows a changed timeframe and ignores untouched indicators', () => {
    const before = [
      indicator('a', IndicatorEnum.rsi, ExchangeIntervals.oneH),
      indicator('b', IndicatorEnum.adx, ExchangeIntervals.fourH),
    ];
    const after = [
      before[0],
      indicator('b', IndicatorEnum.adx, ExchangeIntervals.oneD),
    ];
    expect(chartIntervalToFollow(before, after)).toBe('1D');
    expect(chartIntervalToFollow(before, [...before])).toBeNull();
  });

  it('never follows a session, which has no timeframe', () => {
    const session = indicator(
      's',
      IndicatorEnum.session,
      ExchangeIntervals.oneH
    );
    expect(chartIntervalToFollow([], [session])).toBeNull();
  });
});

const WEEKDAYS = [1, 2, 3, 4, 5];
const at = (iso: string) => Date.parse(iso);

describe('session window (chart)', () => {
  it('matches the engine on a New York session across daylight saving', () => {
    const ny = { start: '09:30', end: '16:00', timezone: 'America/New_York' };
    expect(isInSession(at('2026-07-15T13:30:00Z'), WEEKDAYS, 'in', ny)).toBe(
      true
    );
    expect(isInSession(at('2026-01-14T13:30:00Z'), WEEKDAYS, 'in', ny)).toBe(
      false
    );
  });

  it('shades a daily bar that contains the session, and not a weekend one', () => {
    const london = { start: '08:00', end: '17:00', timezone: 'Europe/London' };
    const day = 86_400_000;
    const friday = at('2026-10-23T00:00:00Z');
    const saturday = at('2026-10-24T00:00:00Z');
    expect(
      isSessionActiveDuring(friday, friday + day, WEEKDAYS, 'in', london)
    ).toBe(true);
    expect(
      isSessionActiveDuring(saturday, saturday + day, WEEKDAYS, 'in', london)
    ).toBe(false);
  });

  it('shades a 4h bar the session opens inside, not one before it', () => {
    const hours = { start: '13:30', end: '20:00' };
    const h4 = 4 * 3_600_000;
    expect(
      isSessionActiveDuring(
        at('2026-10-23T12:00:00Z'),
        at('2026-10-23T12:00:00Z') + h4,
        WEEKDAYS,
        'in',
        hours
      )
    ).toBe(true);
    expect(
      isSessionActiveDuring(
        at('2026-10-23T08:00:00Z'),
        at('2026-10-23T08:00:00Z') + h4,
        WEEKDAYS,
        'in',
        hours
      )
    ).toBe(false);
  });
});

describe('session presets', () => {
  const base = { sessionTimezone: 'UTC' } as SettingsIndicators;

  it('reads all day, a preset, or custom from the stored hours', () => {
    expect(resolveSessionPreset(base)).toBe('allDay');
    expect(
      resolveSessionPreset({
        ...base,
        ...sessionPresetParams('newYork', base),
      })
    ).toBe('newYork');
    expect(
      resolveSessionPreset({
        ...base,
        sessionStart: '10:00',
        sessionEnd: '11:00',
      })
    ).toBe('custom');
  });

  it('Custom from all day gives editable hours; All day clears them', () => {
    const custom = { ...base, ...sessionPresetParams('custom', base) };
    expect(resolveSessionPreset(custom)).toBe('custom');
    expect(
      resolveSessionPreset({
        ...custom,
        ...sessionPresetParams('allDay', custom),
      })
    ).toBe('allDay');
  });
});
