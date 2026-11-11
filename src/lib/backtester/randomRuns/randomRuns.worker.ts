/// <reference lib="webworker" />
/**
 * Random-entry band (spec 150) — runs in a Web Worker so the dashboard stays
 * responsive. Each draw reruns the user's bot on the candles the main thread
 * handed over, with the strategy's entries shifted by one random offset.
 */
import './windowShim';

import DCABacktester from '@gainium/backtester/dist/dca';
import type {
  DCABacktestingInput,
  ExchangeIntervals,
  FullBar,
} from '@gainium/backtester/dist/types';

import {
  BAND_EVERY,
  bandOf,
  barsIn,
  entryGate,
  offsetBars,
  sampleAt,
  shiftEntries,
  type Entry,
  type RandomBand,
} from './math';

export interface RandomRunsJob {
  /** the run's own engine input, start condition already replaced */
  input: DCABacktestingInput;
  bars: { bar: FullBar[]; interval: ExchangeIntervals }[];
  entries: Entry[];
  from: number;
  to: number;
  barMs: number;
  draws: number;
  /** the strategy curve's timestamps — the band is sampled at these */
  times: number[];
}

export type RandomRunsMessage =
  | { type: 'progress'; done: number; total: number; band: RandomBand | null }
  | { type: 'done'; band: RandomBand | null }
  | { type: 'selfCheckFailed'; got: number; want: number }
  | { type: 'error'; message: string };

const post = (m: RandomRunsMessage) => self.postMessage(m);

/**
 * One draw: a new engine (its constructor resets the engine's shared state,
 * and draws run one after another), the gate as its only entry signal.
 */
async function runDraw(job: RandomRunsJob, offset: number) {
  const bars = barsIn(job.from, job.to, job.barMs);
  const gate = entryGate(
    shiftEntries(job.entries, offset, job.from, job.to, job.barMs),
    job.barMs
  );
  const engine = new DCABacktester({
    ...job.input,
    settings: structuredClone(job.input.settings),
    hooks: {
      approveNewDeal: (ctx) =>
        ctx.positionEntry ? true : gate.approve(ctx.symbol, ctx.time),
    },
  });
  const result = await engine.test(job.bars);
  const { missed } = gate.finish();
  const deals = (result?.deals ?? []).filter((d) => d.startTime >= job.from);
  return {
    deals: deals.length,
    equity: sampleAt(result?.portfolio ?? [], job.times),
    missed,
    bars,
  };
}

let stopped = false;

async function run(job: RandomRunsJob) {
  try {
    // §3.5: unshifted entries must give back the strategy's own deals, or
    // the gate is not reproducing the bot and no band is shown
    const check = await runDraw(job, 0);
    if (check.deals !== job.entries.length) {
      post({
        type: 'selfCheckFailed',
        got: check.deals,
        want: job.entries.length,
      });
      return;
    }
    const runs: number[][] = [];
    let missed = 0;
    for (let d = 0; d < job.draws; d++) {
      if (stopped) return;
      const r = await runDraw(job, offsetBars(d, check.bars));
      runs.push(r.equity);
      missed += r.missed;
      const done = d + 1;
      const band =
        done % BAND_EVERY === 0 || done === job.draws
          ? bandOf(runs, missed, done * job.entries.length)
          : null;
      post({ type: 'progress', done, total: job.draws, band });
    }
    post({
      type: 'done',
      band: bandOf(runs, missed, job.draws * job.entries.length),
    });
  } catch (e) {
    post({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

self.onmessage = (e: MessageEvent<RandomRunsJob | 'stop'>) => {
  if (e.data === 'stop') {
    stopped = true;
    return;
  }
  void run(e.data);
};
