import React from "react";
import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { HedgeBacktestActiveView } from "@/components/widgets/bots/backtest/HedgeBacktestTab";
import type { HedgeBacktestingResult } from "@/types";
import type { HedgeBacktestHistoryItem } from "@/hooks/bots/hedge/useHedgeBacktestRunner";

// The hedge backtest's Combined / Long / Short views show each leg's Stats
// tab, whose "Timestamp" row must read the time the backtest ran, as the DCA
// backtest's Stats tab does — not 1 Jan 1970.

// Render every tab's content at once: jsdom does not drive Radix tab
// switching, and only the Stats tab is under test.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: () => null,
  TabsTrigger: () => null,
  TabsContent: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <section data-testid={`tab-${value}`}>{children}</section>,
}));
vi.mock("@/components/widgets/bots/backtest/redesign", () => ({
  RedesignOverviewTab: () => null,
  RedesignDealsTab: () => null,
  buildBacktestViewModel: () => ({}),
}));
vi.mock("@/components/widgets/bots/backtest", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/widgets/bots/backtest")
  >()),
  BacktestAnalysisTab: () => null,
}));

// The Stats tab lays its cards out with a ResizeObserver; jsdom has none.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
});

const RAN_AT = Date.UTC(2026, 9, 27, 12, 30);

const leg = {
  financial: {},
  duration: {},
  usage: {},
  numerical: {},
  ratios: {},
  deals: [],
} as unknown as HedgeBacktestingResult["longResult"];

const side = (symbol: string) => ({
  symbol,
  baseAsset: symbol.replace("USDT", ""),
  quoteAsset: "USDT",
  exchange: "binanceUsdm",
  exchangeUUID: "x",
  settings: { futures: true, coinm: false, profitCurrency: "quote" },
});

const meta = {
  _id: "local-1",
  time: RAN_AT,
  long: side("XMRUSDT"),
  short: side("XMRUSDT"),
  longResult: leg,
  shortResult: leg,
  hedgeResult: leg,
} as unknown as HedgeBacktestHistoryItem;

const result = {
  longResult: leg,
  shortResult: leg,
  hedgeResult: leg,
} as unknown as HedgeBacktestingResult;

describe("Hedge backtest Stats tab timestamp", () => {
  test("every leg shows the time the backtest ran", () => {
    render(<HedgeBacktestActiveView result={result} meta={meta} />);
    const expected = new Date(RAN_AT).toLocaleString();
    for (const view of ["combined", "long", "short"]) {
      const stats = within(screen.getByTestId(`tab-${view}`))
        .getAllByTestId("tab-stats")
        .at(0)!;
      const label = within(stats).getByText("Timestamp");
      const row = label.parentElement!;
      expect(row.textContent, view).toContain(expected);
      expect(row.textContent, view).not.toContain("1970");
    }
  });
});
