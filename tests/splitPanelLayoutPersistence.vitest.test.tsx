import React from "react";
import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { SplitPanel } from "@/components/ui/split-panel";

// Spec: specs/124.split-panel-layout-persistence.md
//
// A dragged divider must come back after a refresh however the page was
// reached. The two tree positions below stand in for "direct load" and
// "in-app navigation": the extra useId calls shift React's ids exactly as a
// different route tree does.

// Vitest resolves the library's `node` export (its server-render build),
// which runs no layout effects and so never saves. Use the browser build the
// app ships.
vi.mock(
  "react-resizable-panels",
  async () =>
    import("../../node_modules/react-resizable-panels/dist/react-resizable-panels.browser.development.js"),
);

const SAVE_ID = "test-split-persistence";
const STORAGE_KEY = `react-resizable-panels:${SAVE_ID}`;

const Split = () => (
  <SplitPanel
    direction="vertical"
    defaultSizes={[60, 40]}
    autoSaveId={SAVE_ID}
    enableKeyboardShortcuts={false}
  >
    <div>chart</div>
    <div>table</div>
  </SplitPanel>
);

// Same SplitPanel, mounted after other components that consume ids.
const IdConsumer = () => {
  React.useId();
  return null;
};
const ShiftedSplit = () => (
  <>
    {Array.from({ length: 7 }, (_, i) => (
      <IdConsumer key={i} />
    ))}
    <Split />
  </>
);

const firstPanelSize = (container: HTMLElement) =>
  Number(
    container
      .querySelector('[data-panel-group-direction="vertical"] > [data-panel]')
      ?.getAttribute("data-panel-size"),
  );

const storedLayouts = () =>
  Object.values(
    JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      { layout: number[] }
    >,
  ).map((entry) => entry.layout.map((n) => Math.round(n)));

// The library debounces its localStorage write by 100ms.
const waitForSave = (expected: number) =>
  waitFor(() =>
    expect(storedLayouts().some((l) => l[0] === expected)).toBe(true),
  );

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SplitPanel layout persistence (§1.1)", () => {
  test("first visit shows the default sizes (§1.3)", async () => {
    const { container } = render(<Split />);
    expect(firstPanelSize(container)).toBe(60);
    await waitForSave(60);
  });

  test("a size dragged after in-app navigation survives a refresh (§1.2, §3.2)", async () => {
    // 1. First visit by direct load: the default is stored.
    const first = render(<Split />);
    await waitForSave(60);
    first.unmount();

    // 2. Reached by in-app navigation; the user moves the divider.
    const nav = render(<ShiftedSplit />);
    const handle = nav.container.querySelector(
      "[data-panel-resize-handle-id]",
    ) as HTMLElement;
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    const dragged = firstPanelSize(nav.container);
    expect(dragged).toBeLessThan(60);
    await waitForSave(Math.round(dragged));
    nav.unmount();

    // 3. Refresh = direct load again: the dragged size, not the stale first entry.
    const refreshed = render(<Split />);
    await new Promise((r) => setTimeout(r, 50));
    expect(firstPanelSize(refreshed.container)).toBe(dragged);
  });

  test("one storage entry per autoSaveId, whatever the tree position (§4.1)", async () => {
    const a = render(<Split />);
    await waitForSave(60);
    a.unmount();
    const b = render(<ShiftedSplit />);
    await new Promise((r) => setTimeout(r, 200));
    b.unmount();
    expect(storedLayouts()).toHaveLength(1);
  });

  test("a layout saved before this fix is still restored once (§4.2)", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "«r9»-panel-0,«r9»-panel-1": { expandToSizes: {}, layout: [35, 65] },
      }),
    );
    const { container } = render(<Split />);
    await waitFor(() => expect(firstPanelSize(container)).toBe(35));
  });
});
