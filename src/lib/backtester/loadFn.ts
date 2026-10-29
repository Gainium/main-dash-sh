import { ExchangeEnum, tvToExchangeIntervalMap } from '@/types';
import Candles from '@/utils/candles';
import type {
  Bar,
  PeriodParams,
  ResolutionString,
} from 'public/static/charting_library/charting_library';

const loadFn = (
  exchange: ExchangeEnum,
  updateProgress?: (value: number, text: string, step?: number) => void,
  handleErrorByCandles?: (msg: string) => void
): {
  load: (
    name: string,
    baseAsset: string,
    quoteAsset: string,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    ex?: ExchangeEnum,
    index?: number,
    total?: number
  ) => Promise<Bar[]>;
  stop: () => void;
} => {
  const instance = new Candles(exchange);
  return {
    load: async (
      name: string,
      baseAsset: string,
      quoteAsset: string,
      resolution: ResolutionString,
      periodParams: PeriodParams,
      _ex?: ExchangeEnum,
      index?: number,
      total?: number
    ) =>
      instance.getCandles({
        symbol: name,
        period: periodParams,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        interval: tvToExchangeIntervalMap[resolution],
        baseAsset,
        quoteAsset,
        updateProgress,
        index,
        total,
        handleErrorByCandles,
        backtest: true,
      }),
    stop: () => {
      instance.stop = true;
    },
  };
};

export default loadFn;
