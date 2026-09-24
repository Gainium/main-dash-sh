/**
 * Runner note: renders a React component in jsdom, so it is a Vitest file.
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/bug958ShortcutsSearchStub.vitest.test.tsx`.
 */

/**
 * Bug #958 — typing in Settings → Shortcuts → "Search shortcuts" crashes the
 * page ("Something went wrong").
 * Spec: `main-dash-redesign/specs/055.shortcut-store-stubs-crash-shortcuts-search.md`.
 *
 * `deleteShortcut` / `updateShortcut` / `toggleShortcut` / `resetShortcut`
 * spread `state.shortcuts[id]` even when `id` was never registered, so a call
 * for an unknown id (deleting a bot template that had no shortcut, the legacy
 * `split-panel-arrow-*` cleanup) persists a stub with no `label`/`category`.
 * The search filter then calls `shortcut.label.toLowerCase()` on it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { ShortcutsList } from "@/components/shortcuts/ShortcutsList";
import { useShortcutStore, type ShortcutConfig } from "@/stores/shortcutStore";

const KEY = { key: "d", modifiers: { cmd: true } };

const REAL: ShortcutConfig = {
  id: "manager-dashboard",
  label: "Dashboard Manager",
  description: "Toggle dashboard manager",
  defaultKey: KEY,
  currentKey: KEY,
  enabled: true,
  deleted: false,
  category: "managers",
  action: () => {},
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  useShortcutStore.setState({ shortcuts: { [REAL.id]: REAL } });
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("§4.1 store actions never create an entry for an unknown id", () => {
  it.each([
    [
      "deleteShortcut",
      () => useShortcutStore.getState().deleteShortcut("bot-template-x"),
    ],
    [
      "updateShortcut",
      () => useShortcutStore.getState().updateShortcut("bot-template-x", KEY),
    ],
    [
      "toggleShortcut",
      () => useShortcutStore.getState().toggleShortcut("bot-template-x"),
    ],
    [
      "resetShortcut",
      () => useShortcutStore.getState().resetShortcut("bot-template-x"),
    ],
  ])("%s is a no-op", (_name, call) => {
    call();
    expect(Object.keys(useShortcutStore.getState().shortcuts)).toEqual([
      REAL.id,
    ]);
  });

  it("still tombstones a registered shortcut", () => {
    useShortcutStore.getState().deleteShortcut(REAL.id);
    expect(useShortcutStore.getState().shortcuts[REAL.id]).toMatchObject({
      label: REAL.label,
      deleted: true,
      enabled: false,
    });
  });
});

describe("§4.2 rehydrate drops stubs already persisted", () => {
  it("keeps complete entries and drops label-less ones", async () => {
    const { action: _a, ...persistedReal } = REAL;
    // setState writes through persist, so clear the store before seeding.
    useShortcutStore.setState({ shortcuts: {} });
    localStorage.setItem(
      "shortcut-settings",
      JSON.stringify({
        state: {
          disableShortcutHints: false,
          shortcuts: {
            [REAL.id]: persistedReal,
            "split-panel-arrow-left": { enabled: false, deleted: true },
          },
        },
        version: 0,
      }),
    );
    await useShortcutStore.persist.rehydrate();
    expect(Object.keys(useShortcutStore.getState().shortcuts)).toEqual([
      REAL.id,
    ]);
  });
});

describe("§4.3 typing in the search box filters instead of crashing", () => {
  it("filters with a stub present in the store", () => {
    useShortcutStore.setState({
      shortcuts: {
        [REAL.id]: REAL,
        "bot-template-x": { enabled: false, deleted: true } as ShortcutConfig,
      },
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = createRoot(host);
    container = host;
    root = r;
    act(() =>
      r.render(createElement(MemoryRouter, null, createElement(ShortcutsList))),
    );
    const input = host.querySelector<HTMLInputElement>(
      'input[placeholder="Search shortcuts..."]',
    );
    if (!input) throw new Error("search input not rendered");
    const type = (value: string) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => type("dash"));
    expect(host.textContent).toContain("Dashboard Manager");
    act(() => type("zzz"));
    expect(host.textContent).not.toContain("Dashboard Manager");
  });
});
