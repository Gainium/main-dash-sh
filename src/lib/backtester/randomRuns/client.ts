/**
 * Random-entry band (spec 150) — main-thread side. Loads the candles once
 * (the IndexedDB cache is warm from the run), hands them to a Web Worker and
 * keeps each result's band for the page's lifetime. One job at a time.
 */
import { useEffect, useSyncExternalStore } from 'react';

import {
  timeIntervalMap,
  type DCABacktestingInput as EngineInput,
  type DCABacktestingResult as EngineResult,
  type ExchangeIntervals,
  type FullBar,
} from '@gainium/backtester/dist/types';

import type { DCABacktestingInput, DCABacktestingResult } from '@/types';

import logger from '@/lib/loggerInstance';
import DCABacktesting from '@/lib/backtester/wrapper';

import { RANDOM_DRAWS, type Entry, type RandomBand } from './math';
import type { RandomRunsJob, RandomRunsMessage } from './randomRuns.worker';
import { hasRandomisableEntries, randomEntrySettings } from './settings';

/** A fresh DCA run's engine input and result — what the random runs rerun. */
export interface RandomTestSource {
  input: DCABacktestingInput;
  result: DCABacktestingResult;
}

// The latest runs' sources by saved backtest id, so a results modal opened
// from the backtests list finds the run it shows. Each holds the run's deals,
// so only a few are kept.
const MAX_SOURCES = 3;
const sources = new Map<string, RandomTestSource>();

export function rememberRandomTestSource(id: string, source: RandomTestSource) {
  sources.delete(id);
  sources.set(id, source);
  for (const key of sources.keys()) {
    if (sources.size <= MAX_SOURCES) break;
    sources.delete(key);
  }
}

export const randomTestSourceFor = (id: string | undefined) =>
  id ? (sources.get(id) ?? null) : null;

export interface RandomBandState {
  status: 'loading' | 'running' | 'done' | 'failed';
  done: number;
  total: number;
  /** null until MIN_BAND_DRAWS draws have completed (§3.1) */
  band: RandomBand | null;
}

// Keyed by the result object: a band only ever shows next to the run it was
// computed from (§3.2).
const states = new WeakMap<object, RandomBandState>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let active: {
  result: object;
  worker: Worker | null;
  probe: DCABacktesting | null;
} | null = null;

function set(result: object, patch: Partial<RandomBandState>) {
  const prev = states.get(result) ?? {
    status: 'loading' as const,
    done: 0,
    total: RANDOM_DRAWS,
    band: null,
  };
  states.set(result, { ...prev, ...patch });
  notify();
}

function stopActive() {
  if (!active) return;
  active.probe?.stopBacktest();
  active.worker?.postMessage('stop');
  active.worker?.terminate();
  const { result } = active;
  active = null;
  // a job cut short before it finished is dropped, so it reruns if reopened
  if (states.get(result)?.status !== 'done') states.delete(result);
}

// The app mirrors the engine's types with its own enums; the band works on
// the engine's.
const engineOf = (source: RandomTestSource) => ({
  input: source.input as unknown as EngineInput,
  result: source.result as unknown as EngineResult,
});

/** Why a result gets no band, or null when it can (§1.3). */
export function randomBandUnavailable(source: RandomTestSource): string | null {
  const { input, result } = engineOf(source);
  if (input.combo) return 'combo';
  if (!hasRandomisableEntries(input.settings)) return 'start condition';
  if ((result.portfolio?.length ?? 0) < 2) return 'no equity curve';
  if (!entriesOf({ input, result }).length) return 'no deals';
  return null;
}

/** The strategy's entries: each deal's pair and opening bar, inside the window. */
function entriesOf({ input, result }: ReturnType<typeof engineOf>): Entry[] {
  const from = input.from ?? 0;
  return (result.deals ?? [])
    .filter((d) => d.startTime >= from)
    .map((d) => ({ symbol: d.symbol.pair, time: d.startTime }));
}

/**
 * The candles the random bot needs, loaded the way the engine's own test()
 * loads them: every interval its conditions use, with each one's warm-up.
 */
async function loadBars(probe: DCABacktesting, input: EngineInput) {
  const other = probe.getOtherIntervals() ?? [];
  const base = input.interval as ExchangeIntervals;
  const lowest = [...other.map((o) => o.interval), base].sort(
    (a, b) => timeIntervalMap[a] - timeIntervalMap[b]
  )[0];
  const period = probe.calculatePeriod(lowest);
  const wanted = other.length ? other : [{ interval: base, countBack: 0 }];
  const bars: { bar: FullBar[]; interval: ExchangeIntervals }[] = [];
  let i = 0;
  for (const oi of wanted) {
    const bar = await probe._loadData(
      oi.interval,
      undefined,
      {
        from:
          (period.from * 1000 - oi.countBack * timeIntervalMap[oi.interval]) /
          1000,
        to: period.to,
        firstDataRequest: false,
        countBack: oi.countBack,
      },
      i++,
      wanted.length
    );
    bars.push({ bar, interval: oi.interval });
  }
  return bars;
}

export async function startRandomBand(source: RandomTestSource) {
  const engine = engineOf(source);
  const { input } = engine;
  const result: object = source.result;
  if (states.has(result) || randomBandUnavailable(source)) return;
  stopActive();
  set(result, { status: 'loading' });
  const settings = randomEntrySettings(
    input.settings,
    input.interval as ExchangeIntervals
  );
  const runInput: EngineInput = { ...input, settings };
  let loadError: string | null = null;
  const probe = new DCABacktesting(
    { ...runInput, settings: structuredClone(settings) },
    undefined,
    (msg) => {
      loadError = msg;
    }
  );
  active = { result, worker: null, probe };
  try {
    const bars = await loadBars(probe, runInput);
    if (active?.result !== result) return;
    if (loadError || !bars.some((b) => b.bar.length)) {
      set(result, { status: 'failed' });
      active = null;
      return;
    }
    const worker = new Worker(
      new URL('./randomRuns.worker.ts', import.meta.url),
      { type: 'module' }
    );
    active = { result, worker, probe: null };
    worker.onmessage = (e: MessageEvent<RandomRunsMessage>) => {
      const m = e.data;
      if (m.type === 'progress') {
        set(result, {
          status: 'running',
          done: m.done,
          total: m.total,
          ...(m.band ? { band: m.band } : {}),
        });
      } else if (m.type === 'done') {
        set(result, { status: m.band ? 'done' : 'failed', band: m.band });
      } else {
        logger.warn('[backtester] random runs stopped', m);
        set(result, { status: 'failed', band: null });
      }
      if (m.type !== 'progress' && active?.result === result) {
        worker.terminate();
        active = null;
      }
    };
    worker.onerror = (e) => {
      logger.error('[backtester] random runs worker failed', {
        error: e.message,
      });
      set(result, { status: 'failed', band: null });
      if (active?.result === result) stopActive();
    };
    const job: RandomRunsJob = {
      input: runInput,
      bars,
      entries: entriesOf(engine),
      from: input.from ?? 0,
      to: input.to ?? Date.now(),
      barMs: timeIntervalMap[input.interval as ExchangeIntervals],
      draws: RANDOM_DRAWS,
      times: (engine.result.portfolio ?? []).map((p) => p.x),
    };
    set(result, { status: 'running' });
    worker.postMessage(job);
  } catch (e) {
    logger.error('[backtester] random runs could not start', {
      error: String(e),
    });
    if (active?.result === result) active = null;
    set(result, { status: 'failed', band: null });
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The band for a result, started in the background the first time it is
 * asked for. It keeps running when the caller unmounts; a new job stops it.
 */
export function useRandomBand(
  source: RandomTestSource | null | undefined
): RandomBandState | null {
  const key = source?.result ?? null;
  const state = useSyncExternalStore(subscribe, () =>
    key ? (states.get(key) ?? null) : null
  );
  useEffect(() => {
    if (source) void startRandomBand(source);
  }, [source]);
  return state;
}
