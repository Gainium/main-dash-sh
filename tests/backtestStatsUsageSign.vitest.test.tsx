import React from "react";
import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Spec 159 — the backtest Stats tab's "DCA Usage" figures are labelled in the
// currency the engine measures usage in (the order-payment currency: quote for
// a spot long, base for a spot short, the margin coin for futures), not in the
// profit currency. Profit rows keep the profit currency.
//
// Run from the parent: NODE_ENV=development npx vitest run core/tests/backtestStatsUsageSign.vitest.test.tsx

import { BacktestStatsTab } from "@/components/widgets/bots/backtest/BacktestStatsTab";
import type { DCABacktestingResultHistory } from "@/types";

// jsdom has no layout observer; MasonryLayout measures its container with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

const backtest = (settings: Record<string, unknown>) =>
  ({
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settings,
    financial: { netProfitTotal: 0.065031, netProfitTotalUsd: 1737.75 },
    usage: {
      maxTheoreticalUsage: 1335.61589844,
      maxRealUsage: 1200.5,
      avgRealUsage: 800.25,
    },
  }) as unknown as DCABacktestingResultHistory;

const usageRow = (label: string) =>
  screen.getByText(label).parentElement?.textContent ?? "";

describe("BacktestStatsTab DCA Usage currency (spec 159)", () => {
  test("§1 spot long with base profit: usage in quote, profit in base", () => {
    render(
      <BacktestStatsTab
        backtest={backtest({ strategy: "LONG", profitCurrency: "base" })}
      />,
    );
    expect(usageRow("Max theoretical usage")).toContain("1335.61589844 USDT");
    expect(usageRow("Actual max usage")).toContain("1200.50000000 USDT");
    expect(usageRow("Avg deal usage")).toContain("800.25000000 USDT");
    // §3 profit rows unchanged
    expect(screen.getByText(/0\.06503100 BTC/)).toBeTruthy();
  });

  test("§2 spot short with quote profit: usage in base, profit in quote", () => {
    render(
      <BacktestStatsTab
        backtest={backtest({ strategy: "SHORT", profitCurrency: "quote" })}
      />,
    );
    expect(usageRow("Max theoretical usage")).toContain("1335.61589844 BTC");
    expect(screen.getByText(/0\.06503100 USDT/)).toBeTruthy();
  });

  test("§2 futures: coin-m in base, linear in quote", () => {
    render(
      <BacktestStatsTab
        backtest={backtest({ strategy: "LONG", futures: true, coinm: true })}
      />,
    );
    expect(usageRow("Max theoretical usage")).toContain("BTC");
    cleanup();
    render(
      <BacktestStatsTab
        backtest={backtest({
          strategy: "SHORT",
          futures: true,
          coinm: false,
          profitCurrency: "base",
        })}
      />,
    );
    expect(usageRow("Max theoretical usage")).toContain("USDT");
  });
});
