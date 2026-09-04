import {
  BotTypesEnum,
  type AvgPrice,
  type DCABotSettings as _DCABotSettingsCommon,
  type BotSettings as _BotSettingsCommon,
  type DCAGrid,
  type TransactionChart,
} from '@/types';
import {
  createComboOrders,
  createDCAOrders,
  createGridBotOrders,
  defaultContext,
  type ExampleOrdersStoreContext,
  type UpdateOrdersParams,
} from './example-orders-core';
import {
  strategyToLiquidationSide,
  type LiquidationParams,
} from './liquidation';

type ExampleOrdersListener = (
  orders: DCAGrid[],
  transactions: TransactionChart[],
  avgPrices: AvgPrice[]
) => void;

export class ExampleOrdersStore {
  private context: ExampleOrdersStoreContext = defaultContext;
  private orders: DCAGrid[] = [];
  private transactions: TransactionChart[] = [];
  private avgPrices: AvgPrice[] = [];
  private listeners: ExampleOrdersListener[] = [];
  private notifyScheduled = false;
  reset() {
    this.context = defaultContext;
    this.orders = [];
    this.transactions = [];
    this.avgPrices = [];
    this.listeners = [];
  }
  subscribe(listener: ExampleOrdersListener) {
    this.listeners.push(listener);
    listener(this.orders, this.transactions, this.avgPrices);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  setOrders(orders: DCAGrid[]) {
    this.orders = orders;
    this.informListeners();
  }

  setTransactions(transactions: TransactionChart[]) {
    this.transactions = transactions;
    this.informListeners();
  }

  setAvgPrices(avgPrices: AvgPrice[]) {
    this.avgPrices = avgPrices;
    this.informListeners();
  }

  private scheduleNotify() {
    if (this.notifyScheduled) {
      return;
    }

    this.notifyScheduled = true;
    const run = () => {
      this.updateOrders().then(() => {
        this.notifyScheduled = false;
      });
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

  private informListeners() {
    this.listeners.forEach((listener) =>
      listener(this.orders, this.transactions, this.avgPrices)
    );
  }

  setContext(context: Partial<ExampleOrdersStoreContext>) {
    this.context = { ...this.context, ...context };
    this.scheduleNotify();
  }
  /**
   * Last-known reference price for the active pair, kept fresh by
   * useDcaTradingContext (`inputLatestPrice`). Read by BotFormProvider so the
   * terminal Import TP/SL auto-calc in handleSettingsUpdate has access to a
   * market price that isn't part of the form state. Legacy parity: the
   * terminal `onChangeInput` closed over `latestPrice` directly.
   */
  getInputLatestPrice(): number {
    return this.context.inputLatestPrice;
  }

  /**
   * Leverage / direction for the estimated-liquidation projection, or null
   * when it does not apply (spot, leverage <= 1, or a bot type without DCA
   * settings). Exposed on the store because the bot CHART renders outside the
   * BotFormProvider — the store is the only place it can read the form's
   * futures settings from.
   */
  getLiquidationParams(): LiquidationParams | null {
    const settings = this.context.settings;
    if (!settings?.futures) return null;
    const leverage = Number(settings.leverage ?? 0);
    if (!(leverage > 1)) return null;
    return {
      side: strategyToLiquidationSide(settings.strategy),
      leverage,
    };
  }
  async updateOrders(params?: UpdateOrdersParams | undefined) {
    if (this.context.botType === BotTypesEnum.dca) {
      await this.createDCAOrders(params);
    }
    if (this.context.botType === BotTypesEnum.combo) {
      await this.createComboOrders(params);
    }
    if (this.context.botType === BotTypesEnum.grid) {
      this.createGridBotOrders(params);
    }
    this.informListeners();
  }
  private async createDCAOrders(
    params: UpdateOrdersParams | undefined = {}
  ): Promise<void> {
    this.orders = await createDCAOrders(params, this.context);
  }
  private async createComboOrders(
    params: UpdateOrdersParams | undefined = {}
  ): Promise<void> {
    this.orders = await createComboOrders(params, this.context);
  }
  private createGridBotOrders(params: UpdateOrdersParams | undefined): void {
    this.orders = createGridBotOrders(params, this.context);
  }
}

/**
 * Factory for an isolated example-orders store. Regular bots use the shared
 * module singleton below; hedge legs (which co-mount two forms under one
 * workbench) each create their own instance via BotFormProvider so their
 * order-estimation pipelines don't clobber each other. See
 * ExampleOrdersStoreContext.
 */
export function createExampleOrdersStore(): ExampleOrdersStore {
  return new ExampleOrdersStore();
}

/**
 * A read-only "merged" store for the hedge chart. Its orders are pushed in
 * from BOTH leg stores via `setOrders()` (so the chart draws long + short
 * orders together, like legacy `chartView === 'both'`). It must NEVER
 * recompute from its own context — BotChart still calls `setContext()` on the
 * active store for the drag handler / latest price, which would otherwise
 * clobber the merged set with an empty recompute. Overriding `updateOrders`
 * to a no-op keeps the merged orders authoritative.
 */
class MergedExampleOrdersStore extends ExampleOrdersStore {
  override async updateOrders(): Promise<void> {
    /* no-op: merged orders come from setOrders(), never from context */
  }
}

export function createMergedExampleOrdersStore(): ExampleOrdersStore {
  return new MergedExampleOrdersStore();
}

/** Default shared instance — the historical module global. */
export const exampleOrdersStore = createExampleOrdersStore();
