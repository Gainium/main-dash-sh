import { describe, expect, it } from "vitest";
import { PC as LibPC, priceChangeCondition } from "@gainium/indicators";

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from "@/contexts/bots/form/formDefaults";
import { mapFormDataToBackend } from "@/mappers/bots/dca/field-mapping";
import {
  BotTypesEnum,
  IndicatorAction,
  IndicatorEnum,
  PCCompareEnum,
  StartConditionEnum,
  StrategyEnum,
  type SettingsIndicators,
} from "@/types";
import type { BotFormData } from "@/types/bots/form";
import { INDICATOR_CATALOG } from "@/types/indicators/indicatorCatalog";
import { getIndicatorCatalogDefaultParams } from "@/types/indicators/indicatorLogic";
import { shouldHideField } from "@/utils/indicators/indicatorFieldGating";
import { buildTradingViewStudyDescriptor } from "@/components/widgets/shared/TradingViewChart/indicatorStudyConfig";
import { convertIndicatorConfigsToChart } from "@/utils/indicators/chartIndicatorUtils";
import {
  priceChangeRangeInvalid,
  stripPriceChangeRange,
  suggestPriceChangeValue2,
} from "@/utils/indicators/priceChangeRange";
import { PC as StudyPC } from "@/utils/tradingView/customIndicators";

const one = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error("missing");
  return value;
};

const row = (extra: Partial<SettingsIndicators> = {}): SettingsIndicators =>
  ({
    ...getIndicatorCatalogDefaultParams(IndicatorEnum.pc, IndicatorAction.startDeal),
    uuid: "u-pc",
    groupId: "g1",
    ...extra,
  }) as SettingsIndicators;

const mapRows = (indicators: SettingsIndicators[]) =>
  mapFormDataToBackend(
    {
      ...SHARED_FORM_DEFAULTS,
      type: BotTypesEnum.dca,
      exchangeUUID: "exchange-uuid",
      dca: {
        ...DCA_FORM_DEFAULTS,
        startCondition: StartConditionEnum.ti,
        indicators,
        indicatorGroups: [{ id: "g1", logic: "and", action: "startDeal" }],
      },
      combo: COMBO_FORM_DEFAULTS,
      grid: GRID_FORM_DEFAULTS,
    } as unknown as BotFormData,
    null,
  );

const save = (indicators: SettingsIndicators[]) => {
  const result = mapRows(indicators);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.data.indicators ?? [];
};

const field = (key: string) =>
  one(INDICATOR_CATALOG[IndicatorEnum.pc].fields.find((f) => f.key === key));

const chart = (i: SettingsIndicators) =>
  one(
    convertIndicatorConfigsToChart([i], {
      scaleAr: false,
      tpAr: false,
      slAr: false,
      chartInterval: "60",
      strategy: StrategyEnum.long,
      indicatorGroupsToUse: ["g1"],
      useCloseIndicators: true,
      useStartDealIndicators: true,
      useStartDCAIndicators: true,
      useStopBotIndicators: true,
      useStartBotIndicators: true,
      useRiskRewardIndicators: true,
    })[0],
  );

const studyInputs = (extra: Partial<SettingsIndicators>) =>
  one(buildTradingViewStudyDescriptor(chart(row(extra)))).inputs as Record<
    string,
    unknown
  >;

describe("Price Change: Condition select", () => {
  const compare = field("pcCompare");
  const value2 = field("pcValue2");

  it("offers Greater than / Lower than / Between, Greater than when unset", () => {
    expect(compare.label).toBe("Condition");
    expect(compare.options?.map((o) => o.label)).toEqual([
      "Greater than",
      "Lower than",
      "Between",
    ]);
    expect(compare.derive?.get(row())).toBe(PCCompareEnum.gt);
    expect(compare.derive?.get(row({ pcCompare: "junk" as PCCompareEnum }))).toBe(
      PCCompareEnum.gt,
    );
  });

  it("stores nothing for a new Price Change", () => {
    const r = row();
    expect("pcCompare" in r).toBe(false);
    expect("pcValue2" in r).toBe(false);
    const [saved] = save([r]);
    expect(saved.pcCompare).toBeUndefined();
    expect(saved.pcValue2).toBeUndefined();
    expect(saved.pcValue).toBe("5");
  });

  it("shows the second value only for Between", () => {
    expect(shouldHideField(value2, row())).toBe(true);
    expect(shouldHideField(value2, row({ pcCompare: PCCompareEnum.lt }))).toBe(true);
    expect(shouldHideField(value2, row({ pcCompare: PCCompareEnum.bw }))).toBe(false);
  });

  it("choosing Between seeds a second value of the same sign; leaving it clears it", () => {
    const set = one(compare.derive).set;
    expect(set(PCCompareEnum.bw, row({ pcValue: "2" }))).toEqual({
      pcCompare: PCCompareEnum.bw,
      pcValue2: "4",
    });
    expect(set(PCCompareEnum.bw, row({ pcValue: "-2" }))).toEqual({
      pcCompare: PCCompareEnum.bw,
      pcValue2: "-4",
    });
    expect(set(PCCompareEnum.bw, row({ pcValue: "2", pcValue2: "7" }))).toEqual({
      pcCompare: PCCompareEnum.bw,
      pcValue2: "7",
    });
    expect(set(PCCompareEnum.gt, row({ pcCompare: PCCompareEnum.bw }))).toEqual({
      pcCompare: undefined,
      pcValue2: undefined,
    });
    expect(set(PCCompareEnum.lt, row())).toEqual({
      pcCompare: PCCompareEnum.lt,
      pcValue2: undefined,
    });
    expect(suggestPriceChangeValue2("$var")).toBeUndefined();
  });

  it("names a non-default choice on the card", () => {
    expect(compare.summary?.(row())).toBeNull();
    expect(compare.summary?.(row({ pcCompare: PCCompareEnum.gt }))).toBeNull();
    expect(compare.summary?.(row({ pcCompare: PCCompareEnum.lt }))).toBe("Lower than");
    expect(compare.summary?.(row({ pcCompare: PCCompareEnum.bw }))).toBe("Between");
  });
});

describe("Price Change: save", () => {
  it("leaves pcCompare unset for Greater than and drops a stray second value", () => {
    const [gt] = save([row({ pcCompare: PCCompareEnum.gt, pcValue2: "9" })]);
    expect("pcCompare" in gt).toBe(false);
    expect("pcValue2" in gt).toBe(false);
    const [lt] = save([row({ pcValue: "-2", pcCompare: PCCompareEnum.lt, pcValue2: "9" })]);
    expect(lt).toMatchObject({ pcValue: "-2", pcCompare: PCCompareEnum.lt });
    expect("pcValue2" in lt).toBe(false);
  });

  it("keeps Between with both values as strings", () => {
    const [bw] = save([
      row({ pcValue: "2", pcValue2: 5 as unknown as string, pcCompare: PCCompareEnum.bw }),
    ]);
    expect(bw).toMatchObject({ pcValue: "2", pcValue2: "5", pcCompare: PCCompareEnum.bw });
  });

  it("refuses a Between that can never fire", () => {
    for (const [pcValue, pcValue2] of [
      ["2", "-5"],
      ["2", undefined],
      ["3", "3"],
      ["0", "2"],
    ]) {
      const result = mapRows([row({ pcValue, pcValue2, pcCompare: PCCompareEnum.bw })]);
      expect(result.success, `${pcValue} ${pcValue2}`).toBe(false);
      expect(result.errors.join(" ")).toContain("Price Change");
    }
    // a variable is not judged
    expect(
      priceChangeRangeInvalid({ type: IndicatorEnum.pc, pcValue: "$x", pcCompare: "bw" }),
    ).toBe(false);
    // other types are untouched
    const other = { type: IndicatorEnum.rsi, pcCompare: "gt", pcValue2: "1" };
    expect(stripPriceChangeRange(other)).toBe(other);
  });
});

describe("Price Change: chart study", () => {
  it("passes the compare and the second bound", () => {
    expect(studyInputs({})).toMatchObject({
      up: 5,
      showUp: true,
      showDown: false,
      compare: "gt",
    });
    expect(studyInputs({ pcValue: "-2", pcCompare: PCCompareEnum.lt })).toMatchObject({
      down: 2,
      showDown: true,
      compare: "lt",
    });
    expect(
      studyInputs({ pcValue: "2", pcValue2: "5", pcCompare: PCCompareEnum.bw }),
    ).toMatchObject({ up: 2, up2: 5, showUp: true, compare: "bw" });
    // mixed signs never fire: nothing is marked
    expect(
      studyInputs({ pcValue: "2", pcValue2: "-5", pcCompare: PCCompareEnum.bw }),
    ).toMatchObject({ showUp: false, showDown: false });
  });

  it("marks the candle after each one priceChangeCondition fires on, at the bounds", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cases: [string, string | undefined, PCCompareEnum | undefined][] = [
      ["2", undefined, undefined],
      ["2", undefined, PCCompareEnum.lt],
      ["2", "5", PCCompareEnum.bw],
      ["-5", "-2", PCCompareEnum.bw],
      ["-2", undefined, PCCompareEnum.gt],
      ["-2", undefined, PCCompareEnum.lt],
    ];
    const order = ["up", "down", "showUp", "showDown", "compare", "up2", "down2"];
    for (const [pcValue, pcValue2, pcCompare] of cases) {
      const inputs = studyInputs({ pcValue, pcValue2, pcCompare });
      let bar = { open: 0, high: 0, low: 0 };
      // a minimal PineJS context: new_var series in call order per bar
      const series: number[][] = [];
      let call = 0;
      const ctx = {
        setMinimumAdditionalDepth: () => undefined,
        new_var: (v?: number) => {
          const h = (series[call] ??= []);
          h.push(v ?? NaN);
          call++;
          return {
            get: (n: number) => (h.length - 1 - n >= 0 ? h[h.length - 1 - n] : NaN),
            set: (x: number) => {
              h[h.length - 1] = x;
            },
          };
        },
      };
      const study = StudyPC({
        Std: { high: () => bar.high, low: () => bar.low, open: () => bar.open },
      }) as unknown as {
        constructor: new () => {
          main: (c: unknown, input: (i: number) => unknown) => number[];
        };
      };
      const instance = new study.constructor();
      const t = Math.abs(+pcValue);
      const lib = new LibPC(t, t);
      const sign = +pcValue > 0 ? 1 : -1;
      const v1 = Math.abs(+pcValue);
      const v2 = pcValue2 === undefined ? v1 : Math.abs(+pcValue2);
      const lo = Math.min(v1, v2);
      const hi = Math.max(v1, v2);
      let prev: { fires: boolean; open: number } = { fires: false, open: 0 };
      let marked = 0;
      for (let i = 0; i < 2000; i++) {
        const open = 100 + rnd() * 10;
        bar = { open, high: open * (1 + rnd() * 0.08), low: open * (1 - rnd() * 0.08) };
        call = 0;
        const out = instance.main(ctx, (k: number) => inputs[order[k]]);
        const [upTriUp, upTriDown, downTriDown, downTriUp] = out;
        const lines = out.slice(4, 12).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
        const tris = [upTriUp, upTriDown, downTriDown, downTriUp];
        if (prev.fires) {
          marked++;
          const at = (pct: number) => prev.open * (1 + (sign * pct) / 100);
          const want =
            pcCompare === PCCompareEnum.bw ? [at(lo), at(hi)] : [at(v1)];
          expect(lines).toEqual([...want].sort((a, b) => a - b));
          // up move: gt / bw-lower point up (below the line); lt / bw-upper down
          const along = sign > 0 ? upTriUp : downTriDown;
          const against = sign > 0 ? upTriDown : downTriUp;
          if (pcCompare === PCCompareEnum.lt) {
            expect(Number.isFinite(along)).toBe(false);
            expect(Number.isFinite(against)).toBe(true);
          } else {
            expect(Number.isFinite(along)).toBe(true);
            expect(Number.isFinite(against)).toBe(pcCompare === PCCompareEnum.bw);
            // pointing up = below its line, pointing down = above it
            if (sign > 0) expect(along).toBeLessThan(at(lo));
            else expect(along).toBeGreaterThan(at(lo));
          }
          // the other direction draws nothing
          const otherSide = sign > 0 ? [downTriDown, downTriUp] : [upTriUp, upTriDown];
          expect(otherSide.every((v) => !Number.isFinite(v))).toBe(true);
        } else {
          expect(lines).toEqual([]);
          expect(tris.every((v) => !Number.isFinite(v))).toBe(true);
        }
        const res = one(lib.next({ ...bar, close: open }) ?? undefined);
        prev = {
          fires: priceChangeCondition(res, { value: pcValue, value2: pcValue2, compare: pcCompare }),
          open,
        };
      }
      expect(marked).toBeGreaterThan(50);
    }
  });
});
