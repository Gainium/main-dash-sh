import React from "react";
import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Spec 146 — the backtest Deals tab prints entry / avg / close and every DCA
// ladder rung at the pair's own price precision (`deal.symbol.priceAssetPrecision`,
// which the engine carries on each deal), not at a fixed 1 decimal.
//
// Run from the parent: NODE_ENV=development npx vitest run core/tests/backtestDealsTabPricePrecision.vitest.test.tsx

// The real chart embed and candle loader need a browser + network; neither is
// on the path that formats prices.
vi.mock(
  "@/components/widgets/shared/TradingViewChart/TradingViewChart",
  () => ({
    default: React.forwardRef(() => <div data-testid="chart" />),
  }),
);
vi.mock("@/components/widgets/shared/CoinPair", () => ({
  default: () => <span />,
}));
vi.mock("@/utils/candles", () => ({
  default: class {
    stop = false;
    getCandles() {
      return Promise.resolve([]);
    }
  },
}));
vi.mock(
  "@/components/widgets/bots/backtest/redesign/dealToTradingView",
  () => ({
    dealToTradingView: () => ({ symbol: "X", interval: "60" }),
    dealFrameFits: () => true,
    intervalToResolution: () => "60",
  }),
);

import { RedesignDealsTab } from "@/components/widgets/bots/backtest/redesign/tabs/RedesignDealsTab";
import type {
  BacktestViewModel,
  DealVM,
} from "@/components/widgets/bots/backtest/redesign/viewModel";

// jsdom has no layout; the rail scrolls its selected row into view.
Element.prototype.scrollIntoView = () => {};

afterEach(() => cleanup());

const deal = (p: {
  entry: number;
  avg: number;
  closePrice: number;
  rungs: number[];
}): DealVM => ({
  no: 1,
  id: "d1",
  pair: "X/USDT",
  status: "closed",
  out: "win",
  pnlPerc: 1.96,
  pnlUsd: 5.19,
  entry: p.entry,
  avg: p.avg,
  closePrice: p.closePrice,
  tp: null,
  durationH: 5,
  filled: p.rungs.length,
  maxSo: p.rungs.length,
  volume: 100,
  startTime: 1_700_000_000_000,
  closeTime: 1_700_018_000_000,
  safety: p.rungs.map((price, i) => ({
    idx: i + 1,
    dev: (i + 1) * 1.5,
    price,
    filled: true,
    at: null,
  })),
  candles: [],
  entryIdx: -1,
  closeIdx: -1,
});

const vmOf = (d: DealVM, priceAssetPrecision: number | undefined) =>
  ({
    pair: d.pair,
    from: 1_699_000_000_000,
    to: 1_701_000_000_000,
    dealList: [d],
    raw: {
      interval: "1h",
      deals: [
        {
          symbol: {
            pair: "XUSDT",
            exchange: "binanceUsdm",
            baseAsset: { name: "X" },
            quoteAsset: { name: "USDT" },
            priceAssetPrecision,
          },
          startTime: d.startTime,
        },
      ],
    },
  }) as unknown as BacktestViewModel;

const detail = (label: string) =>
  screen.getByText(label).nextElementSibling?.textContent;

describe("RedesignDealsTab — price precision (§1)", () => {
  test("§1.1 a sub-dollar pair shows its own decimals (TRX, precision 5)", () => {
    const d = deal({
      entry: 0.31902,
      avg: 0.31617,
      closePrice: 0.32236,
      rungs: [0.31423, 0.30944],
    });
    render(<RedesignDealsTab vm={vmOf(d, 5)} />);
    expect(detail("Entry price")).toBe("0.31902");
    expect(detail("Avg price")).toBe("0.31617");
    expect(detail("Close price")).toBe("0.32236");
    expect(screen.getAllByText("0.31902").length).toBe(2); // detail + ladder E
    expect(screen.getByText("0.31423")).toBeTruthy();
    expect(screen.getByText("0.30944")).toBeTruthy();
  });

  test("§1.2 a BTC-sized pair at precision 1 reads as it did before", () => {
    const d = deal({
      entry: 60123.4,
      avg: 59876.5,
      closePrice: 60500.1,
      rungs: [59221.5],
    });
    render(<RedesignDealsTab vm={vmOf(d, 1)} />);
    expect(detail("Entry price")).toBe("60,123.4");
    expect(detail("Avg price")).toBe("59,876.5");
    expect(detail("Close price")).toBe("60,500.1");
    expect(screen.getByText("59,221.5")).toBeTruthy();
  });

  test("§1.3 unknown precision falls back to magnitude-based decimals", () => {
    const d = deal({
      entry: 0.31902,
      avg: 0.31617,
      closePrice: 0.32236,
      rungs: [0.31423],
    });
    render(<RedesignDealsTab vm={vmOf(d, undefined)} />);
    expect(detail("Entry price")).toBe("0.31902");
    expect(detail("Close price")).toBe("0.32236");
  });
});
