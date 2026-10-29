import { useCallback, useEffect, useRef, useState } from 'react';

import DCABacktesting from '@/lib/backtester/wrapper';
import logger from '@/lib/loggerInstance';
import {
  EdgeBacktestEnum,
  type DCABacktestingInput,
  type DCABacktestingResult,
  type PreparedDeal,
} from '@/types';

/** A fresh DCA run's engine input and result — what the random rerun needs (spec 135 §1.3). */
export interface RandomTestSource {
  input: DCABacktestingInput;
  result: DCABacktestingResult;
}

// Random deals per backtest result, for the page's lifetime (§1.4).
const remembered = new WeakMap<object, PreparedDeal[]>();

// The latest runs' sources by saved backtest id, so a results modal opened
// from the backtests list finds the run it shows (§1.3). Each holds the run's
// deals, so only a few are kept.
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

/**
 * Reruns the backtest engine with random entries (spec 135 §1.1–§1.2): same
 * input, `edge: random`, `previousData` = the run's own result.
 */
export function useRandomEdgeRun(source: RandomTestSource) {
  const { input, result } = source;
  const [deals, setDeals] = useState<PreparedDeal[] | null>(
    () => remembered.get(result) ?? null
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engine = useRef<DCABacktesting | null>(null);

  // stop a run still going when the card unmounts (§1.2)
  useEffect(
    () => () => {
      engine.current?.stopBacktest();
      engine.current = null;
    },
    []
  );

  const run = useCallback(async () => {
    if (engine.current) return;
    setError(null);
    setProgress(0);
    const onProgress = (value: number) => {
      if (engine.current !== b) return;
      // a fraction while candles load, a percentage after (as the bot form)
      const pct = value <= 1 ? value * 100 : value;
      setProgress(Math.max(0, Math.min(100, Math.round(pct))));
    };
    // Candles that cannot be loaded stop the run rather than test part of it.
    let loadError: string | null = null;
    const onLoadError = (msg: string) => {
      loadError = msg;
      b.stopBacktest();
    };
    const b: DCABacktesting = new DCABacktesting(
      {
        ...input,
        // the engine rewrites the settings for the random strategy
        settings: JSON.parse(JSON.stringify(input.settings)),
        edge: EdgeBacktestEnum.random,
        //@ts-expect-error the app mirrors the engine's types with its own enums
        previousData: result,
      },
      onProgress,
      onLoadError
    );
    engine.current = b;
    try {
      const res = (await b.test(undefined, onProgress)) as unknown as
        DCABacktestingResult | undefined;
      if (engine.current !== b) return;
      if (loadError !== null) {
        setError(loadError);
        return;
      }
      const randomDeals: PreparedDeal[] = res?.deals ?? [];
      remembered.set(result, randomDeals);
      setDeals(randomDeals);
    } catch (e) {
      if (engine.current !== b) return;
      logger.error('[backtester] random edge run failed', { error: String(e) });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (engine.current === b) {
        engine.current = null;
        setProgress(null);
      }
    }
  }, [input, result]);

  return { deals, progress, error, run };
}
