import {
  convertIndicatorConfigsToChart,
  selectActiveChartIndicators,
  type ChartIndicatorsContext,
} from '@/utils/indicators/chartIndicatorUtils';
import { chartIntervalToFollow } from '@/utils/indicators/chartIntervalSync';
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

const PENDING_INTERVAL_TTL_MS = 3_000;

// Store for indicators that can be accessed by chart widgets. Regular bots
// share the module singleton below; hedge legs each get an isolated instance
// via BotFormProvider so co-mounted leg forms don't clobber each other's
// indicator config. See IndicatorStoreContext.
export class IndicatorStore {
  private _indicators: IndicatorConfig[] = [];
  private listeners: Array<(indicators: ChartIndicatorsConfig) => void> = [];
  private notifyScheduled = false;
  private chartIndicatorsContext: ChartIndicatorsContext = defaultContext;
  private intervalListeners: Array<(interval: string) => void> = [];
  // A request made while no chart listens (the form hydrates before the chart
  // mounts) is handed to the next chart that subscribes, if it comes soon —
  // an old one belongs to a chart that is gone.
  private pendingInterval: { interval: string; at: number } | null = null;
  // Indicators the chart showed at the last flush, before its timeframe
  // filter: one that joins (added, or its action came into use) or changes
  // timeframe moves the chart onto that timeframe.
  private activeIndicators: IndicatorConfig[] = [];

  reset() {
    this._indicators = [];
    this.listeners = [];
    this.intervalListeners = [];
    this.pendingInterval = null;
    this.activeIndicators = [];
    this.chartIndicatorsContext = defaultContext;
  }

  /** Ask the chart(s) showing this store to switch to a TV resolution. */
  private requestChartInterval(interval: string) {
    if (!this.intervalListeners.length) {
      this.pendingInterval = { interval, at: Date.now() };
      return;
    }
    this.pendingInterval = null;
    this.intervalListeners.forEach((listener) => listener(interval));
  }

  subscribeChartInterval(listener: (interval: string) => void) {
    this.intervalListeners.push(listener);
    const pending = this.pendingInterval;
    this.pendingInterval = null;
    if (pending && Date.now() - pending.at < PENDING_INTERVAL_TTL_MS) {
      listener(pending.interval);
    }
    return () => {
      this.intervalListeners = this.intervalListeners.filter(
        (l) => l !== listener
      );
    };
  }

  setChartIndicatorsContext(context: Partial<ChartIndicatorsContext>) {
    this.chartIndicatorsContext = {
      ...this.chartIndicatorsContext,
      ...context,
    };
    this.scheduleNotify();
  }

  setIndicators(indicators: IndicatorConfig[]) {
    // The bot form calls this on every write; an unchanged list (same array
    // reference — a keystroke elsewhere in the form) must not rebuild the
    // chart config and re-render every chart subscriber.
    if (indicators && indicators === this._indicators) {
      return;
    }
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
    const active = selectActiveChartIndicators(
      this._indicators,
      this.chartIndicatorsContext
    );
    const follow = chartIntervalToFollow(this.activeIndicators, active);
    this.activeIndicators = active;
    if (follow && follow !== this.chartIndicatorsContext.chartInterval) {
      this.requestChartInterval(follow);
    }

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
