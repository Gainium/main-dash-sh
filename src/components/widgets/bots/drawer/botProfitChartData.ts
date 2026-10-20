import type { GridProfitEntry } from '@/hooks/useGridBotProfit';
import type { GridCurrency } from '@/types/bots/grid/data';
import { round } from '@/utils/bots/grid/math';
import {
  getProfitWeekKey,
  getProfitWeekStart,
  getTzDateKey,
  getTzDayBounds,
} from '@/utils/timeUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChartPoint {
  date: string;
  value: number;
  fullDate: string;
  label: string;
}

// ---------- helpers ----------

/**
 * Map the raw getProfitByBot entries into the value to display,
 * respecting the selected currency.
 *
 * This mirrors the legacy logic in main-dash/components/gridbot/botContent.tsx
 * where profit entries are mapped before being passed to TotalProfit.
 */
const mapProfitValue = (
  entry: GridProfitEntry,
  showCurrency: GridCurrency,
  profitCurrency: string,
  latestPrice: number
): number => {
  if (showCurrency === 'usd') return entry.profitUsd;
  if (showCurrency === 'base' && profitCurrency === 'base') return entry.base;
  if (showCurrency === 'quote' && profitCurrency === 'quote')
    return entry.quote;
  if (showCurrency === 'quote' && profitCurrency === 'base')
    return entry.base * (latestPrice || 1);
  if (showCurrency === 'base' && profitCurrency === 'quote')
    return latestPrice > 0 ? entry.quote / latestPrice : 0;
  return 0;
};

/**
 * Build chart data with a fixed-size window, filling empty periods with 0.
 * Follows the legacy TotalProfit.tsx windows, but Daily and Weekly are built
 * in the account's zone and decode the server's week keys exactly.
 */
export interface BuildChartDataOptions {
  showCurrency: GridCurrency;
  profitCurrency: string;
  latestPrice: number;
  /** 0=Daily, 1=Weekly, 2=Monthly, 3=Total */
  timeframe: number;
  /** The account's TIME ZONE — the zone the server bucketed days/weeks by. */
  timeZone: string;
  /** The account's `weekStart` ('m' = ISO weeks); decides the weekly keys. */
  weekStart: string | null | undefined;
  /** Current time (epoch ms). */
  now: number;
}

export const buildChartData = (
  entries: GridProfitEntry[],
  {
    showCurrency,
    profitCurrency,
    latestPrice,
    timeframe,
    timeZone,
    weekStart,
    now: nowMs,
  }: BuildChartDataOptions
): ChartPoint[] => {
  const precision = showCurrency === 'usd' ? 2 : 6;

  const getValue = (e: GridProfitEntry) =>
    round(
      mapProfitValue(e, showCurrency, profitCurrency, latestPrice),
      precision
    );

  // Total: return raw entries as-is
  if (timeframe === 3) {
    return entries.map((e) => {
      const d = new Date(e.date);
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: getValue(e),
        fullDate: e.date,
        label: d.toLocaleDateString(),
      };
    });
  }

  if (timeframe === 2) {
    // Monthly: fixed 12-month window ending this month
    const today = new Date(nowMs);
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-based
    const list: ChartPoint[] = [];
    for (let i = -11; i <= 0; i++) {
      let m = month + i;
      let y = year;
      if (m < 1) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${m}`; // backend key e.g. "2025-3"
      const keyPadded = `${y}-${`0${m}`.slice(-2)}`; // "2025-03"
      const match = entries.find(
        ({ date }) => date === key || date === keyPadded
      );
      list.push({
        date: new Date(y, m - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        value: match ? getValue(match) : 0,
        fullDate: keyPadded,
        label: keyPadded,
      });
    }
    return list;
  }

  // The account-zone calendar day `nowMs` falls on, as UTC midnight. Falls
  // back to the instant's UTC day if the zone cannot format it.
  const todayKey =
    getTzDateKey(new Date(nowMs), timeZone) ||
    new Date(nowMs).toISOString().slice(0, 10);
  const [todayY, todayM, todayD] = todayKey.split('-').map(Number);
  const todayUTC = Date.UTC(todayY, todayM - 1, todayD);

  if (timeframe === 1) {
    // Weekly: the server keys rows "<year>-<week>" by the account's
    // `weekStart` (see getProfitWeekKey). Walk the calendar days from the first
    // row's week to today and start a bar wherever the key changes, so the
    // partial weeks at a Sunday-start year boundary come out exactly as the
    // server split them. The last bar is the current week.
    const list: ChartPoint[] = [];
    const byWeek = new Map<string, GridProfitEntry>();
    let first = Infinity;
    for (const e of entries) {
      const start = getProfitWeekStart(e.date, weekStart);
      if (!Number.isFinite(start)) continue;
      const { year, week } = getProfitWeekKey(start, weekStart);
      const id = `${year}-${week}`;
      if (!byWeek.has(id)) byWeek.set(id, e);
      first = Math.min(first, start);
    }
    if (!Number.isFinite(first)) return list;

    let lastId = '';
    for (let day = first; day <= todayUTC; day += DAY_MS) {
      const { year, week } = getProfitWeekKey(day, weekStart);
      const id = `${year}-${week}`;
      if (id === lastId) continue;
      lastId = id;
      const match = byWeek.get(id);
      list.push({
        date: `${year}-W${week}`,
        value: match ? getValue(match) : 0,
        fullDate: new Date(day).toISOString(),
        label: id,
      });
    }
    return list;
  }

  // Daily (timeframe === 0): the last 30 calendar days of the ACCOUNT's zone,
  // which is the boundary the server bucketed by. Rows are matched by that
  // zone's calendar day rather than by instant, because the server shifts its
  // keys by an hour while the zone is in DST.
  const byDay = new Map<string, GridProfitEntry>();
  for (const e of entries) {
    const key = getTzDateKey(new Date(e.date), timeZone);
    if (key && !byDay.has(key)) byDay.set(key, e);
  }
  const list: ChartPoint[] = [];
  for (let i = -29; i <= 0; i++) {
    // `Date.UTC` normalises an underflowing day across month and year ends.
    const day = new Date(Date.UTC(todayY, todayM - 1, todayD + i));
    const key = day.toISOString().slice(0, 10);
    const match = byDay.get(key);
    const bounds = getTzDayBounds(todayY, todayM, todayD + i, timeZone);
    list.push({
      date: day.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      value: match ? getValue(match) : 0,
      fullDate: new Date(bounds ? bounds.start : day.getTime()).toISOString(),
      label: key,
    });
  }
  return list;
};

