/**
 * Runner note: `.vitest.test.tsx` — mounts the real `useFormHandlers` in jsdom
 * with mocked modules, so it is Vitest-only. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/comboMultiPairSave.vitest.test.tsx`
 *
 * Saving a multi-pair Combo bot must send the pair list when the user changed
 * it, and only then. The combo save branch used to strip `pair` from every
 * save of a bot that had pairs, so adding or removing pairs on a multi-pair
 * Combo bot reported success and changed nothing.
 *
 * "Changed" is judged against the stored list as the form shows it: the form
 * drops stored pairs the venue no longer lists, and that filtering is not an
 * edit, so it must not reach the wire.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const BOT_ID = "6accb277cb3d7e6a12b606e7";

const queryState = { hasStoredPair: true };
let useMultiValue = true;
let currentFormData: Record<string, unknown> = {};

vi.mock(
  "@/features/bots/widgets/BotForm/providers/BotFormQueryProvider",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useBotFormQuery: () => ({
      currentExchange: { provider: "bybitLinear" },
      hasStoredPair: queryState.hasStoredPair,
    }),
  }),
);

vi.mock("@/contexts/bots/form/BotFormProvider", () => ({
  useBotFormSelector: (field: string) =>
    field === "useMulti" ? useMultiValue : undefined,
  useBotFormTopLevelSelector: () => undefined,
  useBotFormActions: () => ({ updateFormData: () => {} }),
  useOptionalBotFormState: () => null,
  useBotFormState: () => ({ botVars: null, setAlerts: () => {} }),
  useBotFormEditing: () => ({ disableEditing: () => {} }),
  useBotFormBotVars: () => null,
  useBotFormContext: () => ({ setAlerts: () => {} }),
  useBotFormStoreApi: () => ({
    getState: () => ({ formData: currentFormData, errors: {} }),
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {}, warning: () => {} },
}));
vi.mock("@/lib/analytics", () => ({ track: () => {} }));
vi.mock("@/hooks/useBacktestMutations", () => ({
  useRunBacktest: () => ({ mutateAsync: () => Promise.resolve(null) }),
  prepareBacktestInput: () => ({}),
}));

import { useFormHandlers } from "@/hooks/bots/dca/useFormHandlers";
import { BotTypesEnum } from "@/types";

/** Listed on the venue — `pairMetadata` is keyed like the provider writes it. */
const listed = (pairs: string[]) =>
  Object.fromEntries(
    pairs.map((pair) => [
      pair,
      {
        pair,
        exchange: "bybitLinear",
        baseAsset: { name: pair.replace(/USDT$/, "") },
        quoteAsset: { name: "USDT" },
      },
    ]),
  );

const sent: Array<Record<string, unknown>> = [];
const probe: { save: (() => Promise<void>) | null } = { save: null };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const save = async ({
  stored,
  form,
  listedPairs,
  useMulti = true,
}: {
  stored: string[];
  form: string[];
  listedPairs: string[];
  useMulti?: boolean;
}) => {
  useMultiValue = useMulti;
  queryState.hasStoredPair = stored.length > 0;
  currentFormData = {
    type: BotTypesEnum.combo,
    combo: { useMulti },
    dca: { useMulti: false },
    pair: form,
    pairMetadata: listed(listedPairs),
  };
  const Probe = () => {
    const handlers = useFormHandlers(
      () => {},
      () => {},
      () => {},
      { _id: BOT_ID, settings: { pair: stored, useMulti } } as never,
      {
        mutateAsync: (params: { settings: Record<string, unknown> }) => {
          sent.push(params.settings);
          return Promise.resolve(null);
        },
      } as never,
      {
        mode: "edit",
        // The mapper is stubbed: this file is about the strip decision only.
        payloadMapper: () =>
          ({
            success: true,
            updatePayload: { pair: form, name: "COMBO" },
          }) as never,
      },
      false,
    );
    useEffect(() => {
      probe.save = handlers.handleSave;
    });
    return null;
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => r.render(createElement(Probe)));
  await act(async () => {
    await probe.save?.();
  });
  expect(sent).toHaveLength(1);
  return sent[0];
};

beforeEach(() => {
  sent.length = 0;
  probe.save = null;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const STORED = ["WUSDT", "CKBUSDT", "LUMIAUSDT"];

describe("§1.1 multi-pair Combo: a pair-list edit reaches changeComboBot", () => {
  it("an added pair is sent", async () => {
    const settings = await save({
      stored: STORED,
      form: [...STORED, "NEARUSDT"],
      listedPairs: [...STORED, "NEARUSDT"],
    });
    expect(settings).toHaveProperty("pair", [...STORED, "NEARUSDT"]);
  });

  it("a removed pair is sent", async () => {
    const settings = await save({
      stored: STORED,
      form: ["WUSDT", "CKBUSDT"],
      listedPairs: STORED,
    });
    expect(settings).toHaveProperty("pair", ["WUSDT", "CKBUSDT"]);
  });

  it("a replaced pair is sent (same count)", async () => {
    const settings = await save({
      stored: STORED,
      form: ["WUSDT", "CKBUSDT", "NEARUSDT"],
      listedPairs: [...STORED, "NEARUSDT"],
    });
    expect(settings).toHaveProperty("pair", ["WUSDT", "CKBUSDT", "NEARUSDT"]);
  });
});

describe("§1.2 multi-pair Combo: a save that does not touch pairs sends none", () => {
  it("identical list → stripped", async () => {
    const settings = await save({
      stored: STORED,
      form: STORED,
      listedPairs: STORED,
    });
    expect(settings).not.toHaveProperty("pair");
    expect(settings).toHaveProperty("name", "COMBO");
  });

  it("reordered list → stripped", async () => {
    const settings = await save({
      stored: STORED,
      form: [...STORED].reverse(),
      listedPairs: STORED,
    });
    expect(settings).not.toHaveProperty("pair");
  });

  it("the form filtered out a stored pair the venue no longer lists → stripped", async () => {
    const settings = await save({
      stored: [...STORED, "DELISTEDUSDT"],
      form: STORED,
      listedPairs: STORED,
    });
    expect(settings).not.toHaveProperty("pair");
  });

  it("pair metadata not loaded (no filter ran) → compared against the raw stored list", async () => {
    const settings = await save({
      stored: STORED,
      form: STORED,
      listedPairs: [],
    });
    expect(settings).not.toHaveProperty("pair");
  });
});

describe("§1.3 single-pair Combo stays locked to its pair", () => {
  it("a changed pair is stripped", async () => {
    const settings = await save({
      stored: ["WUSDT"],
      form: ["NEARUSDT"],
      listedPairs: ["WUSDT", "NEARUSDT"],
      useMulti: false,
    });
    expect(settings).not.toHaveProperty("pair");
  });

  it("the emptied-bot repair still sends the one pick", async () => {
    const settings = await save({
      stored: [],
      form: ["NEARUSDT"],
      listedPairs: ["NEARUSDT"],
      useMulti: false,
    });
    expect(settings).toHaveProperty("pair", ["NEARUSDT"]);
  });
});
