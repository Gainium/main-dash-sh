import { afterEach, describe, expect, test, vi } from "vitest";

import { binanceHandler } from "@/utils/tradingView/exchanges/binance";
import { getCandles } from "@/utils/tradingView/historyApi";

/**
 * Resolutions with no `ExchangeIntervals` value (6h, 12h, 3D, 1M) bypass the
 * candle cache and are fetched directly. Every chart request is capped to
 * 1000 bars of its OWN resolution — a cap computed with a 1m step instead
 * clamps a 6h request to ~17 hours, so each scroll-back returns 3 bars and
 * leaves the rest of the requested range empty.
 */

const STEP_MS: Record<string, number> = {
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "3d": 3 * 86_400_000,
  "4h": 4 * 3_600_000,
};

const fetchMock = vi.fn(async (input: string | URL) => {
  const q = new URL(String(input)).searchParams;
  const step = STEP_MS[q.get("type") ?? ""];
  const start = Number(q.get("startAt"));
  const end = Number(q.get("endAt"));
  const data = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    data.push({
      time: t,
      open: "1",
      high: "2",
      low: "0.5",
      close: "1.5",
      volume: "1",
    });
  }
  return new Response(JSON.stringify({ status: "OK", data, reason: null }));
});

vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockClear());

const symbolInfo = {
  name: "DOGEUSDT",
  ticker: "DOGEUSDT",
  exchange: "binanceUsdm",
} as never;

const TO = Date.UTC(2026, 9, 14) / 1000;

const load = (resolution: string, stepSec: number, bars: number) =>
  getCandles(
    symbolInfo,
    resolution as never,
    {
      from: TO - bars * stepSec,
      to: TO,
      countBack: bars,
      firstDataRequest: false,
    },
    binanceHandler,
  );

describe("chart history for resolutions outside the candle cache", () => {
  test.each([
    ["360", 6 * 3600],
    ["720", 12 * 3600],
    ["3D", 3 * 86400],
  ])(
    "a %s request returns the whole requested window",
    async (res, stepSec) => {
      const bars = await load(res, stepSec, 300);
      expect(bars.length).toBeGreaterThanOrEqual(300);
      expect(bars[0].time).toBeLessThanOrEqual((TO - 299 * stepSec) * 1000);
    },
  );

  test("the request window is still capped at 1000 bars of the resolution", async () => {
    await load("360", 6 * 3600, 5000);
    const q = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    const spanBars =
      (Number(q.get("endAt")) - Number(q.get("startAt"))) / STEP_MS["6h"];
    expect(spanBars).toBeLessThanOrEqual(1000);
    expect(spanBars).toBeGreaterThan(900);
  });
});
