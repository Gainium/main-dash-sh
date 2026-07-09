import {
  convertIndicatorConfigsToChart,
  type ChartIndicatorsContext,
} from '@/utils/indicators/chartIndicatorUtils';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import { StrategyEnum, type ChartIndicatorsConfig } from '@/types';

const defaultContext: ChartIndicatorsContext = {
  scaleAr: false,
  tpAr: false,
  slAr: false,
  chartInterval: '60',
  strategy: StrategyEnum.long,
  indicatorGroupsToUse: [],
  useCloseIndicators: false,
  useStartDealIndicators: false,
  useStartDCAIndicators: false,
  useStopBotIndicators: false,
  useStartBotIndicators: false,
  useRiskRewardIndicators: false,
};

// Store for indicators that can be accessed by chart widgets. Regular bots
// share the module singleton below; hedge legs each get an isolated instance
// via BotFormProvider so co-mounted leg forms don't clobber each other's
// indicator config. See IndicatorStoreContext.
export class IndicatorStore {
  private _indicators: IndicatorConfig[] = [];
  private listeners: Array<(indicators: ChartIndicatorsConfig) => void> = [];
  private notifyScheduled = false;
  private chartIndicatorsContext: ChartIndicatorsContext = defaultContext;

  reset() {
    this._indicators = [];
    this.listeners = [];
    this.chartIndicatorsContext = defaultContext;
  }

  setChartIndicatorsContext(context: Partial<ChartIndicatorsContext>) {
    this.chartIndicatorsContext = {
      ...this.chartIndicatorsContext,
      ...context,
    };
    this.scheduleNotify();
  }

  setIndicators(indicators: IndicatorConfig[]) {
    this._indicators = indicators ?? [];
    this.scheduleNotify();
  }

  getChartIndicators(): ChartIndicatorsConfig {
    return convertIndicatorConfigsToChart(
      this._indicators,
      this.chartIndicatorsContext
    );
  }

  subscribe(listener: (indicators: ChartIndicatorsConfig) => void) {
    this.listeners.push(listener);
    listener(this.getChartIndicators());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private scheduleNotify() {
    if (this.notifyScheduled) {
      return;
    }

    this.notifyScheduled = true;
    const run = () => {
      this.notifyScheduled = false;
      this.flushListeners();
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      Promise.resolve()
        .then(run)
        .catch((error) => {
          setTimeout(() => {
            throw error;
          }, 0);
        });
    }
  }

  private flushListeners() {
    const chartIndicators = convertIndicatorConfigsToChart(
      this._indicators,
      this.chartIndicatorsContext
    );

    this.listeners.forEach((listener) => listener(chartIndicators));
  }
}

/** Factory for an isolated indicator store (see IndicatorStore doc comment). */
export function createIndicatorStore(): IndicatorStore {
  return new IndicatorStore();
}

/** Default shared instance — the historical module global. */
export const indicatorStore = createIndicatorStore();
