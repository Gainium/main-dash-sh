import { useEffect, useState } from 'react';

import { logger } from '@/lib/loggerInstance';
import type { ExchangeIntervals, Symbols } from '@/types';
import Candles from '@/utils/candles';
import type { Bar } from '@/utils/tradingView/types';

interface AnalysisCandles {
  bars: Map<string, Bar[]>;
  loading: boolean;
}

/**
 * Bars per pair for the Analysis cards, through the same IndexedDB-cached
 * loader the Deals tab uses — a backtest's own window is usually a cache hit.
 * Pairs load one after another so a multi-pair run doesn't burst the exchange.
 */
export function useAnalysisCandles(
  symbols: Symbols[],
  interval: ExchangeIntervals,
  from: number,
  to: number
): AnalysisCandles {
  const [state, setState] = useState<AnalysisCandles>({
    bars: new Map(),
    loading: false,
  });
  const key = symbols.map((s) => `${s.pair}@${s.exchange}`).join(',');

  useEffect(() => {
    if (!symbols.length || !(to > from)) {
      setState({ bars: new Map(), loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const controller = new AbortController();
    const instances: Candles[] = [];
    void (async () => {
      const bars = new Map<string, Bar[]>();
      for (const sym of symbols) {
        if (controller.signal.aborted) return;
        const instance = new Candles(sym.exchange);
        instances.push(instance);
        try {
          bars.set(
            sym.pair,
            await instance.getCandles({
              symbol: sym.pair,
              interval,
              period: {
                from: Math.floor(from / 1000),
                to: Math.ceil(to / 1000),
                countBack: 0,
                firstDataRequest: true,
              },
              baseAsset: sym.baseAsset?.name ?? '',
              quoteAsset: sym.quoteAsset?.name ?? '',
              signal: controller.signal,
            })
          );
        } catch (err) {
          logger.warn(`[useAnalysisCandles] ${sym.pair} load failed`, err);
        }
      }
      if (!controller.signal.aborted) setState({ bars, loading: false });
    })();
    return () => {
      controller.abort();
      instances.forEach((i) => (i.stop = true));
    };
    // `key` stands in for the symbols array, which callers rebuild per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, interval, from, to]);

  return state;
}
