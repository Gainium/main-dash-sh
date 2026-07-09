import { createContext, useContext } from 'react';
import {
  exampleOrdersStore,
  type ExampleOrdersStore,
} from '@/utils/bots/dca/example-orders';
import { indicatorStore, type IndicatorStore } from '@/stores/indicatorStore';

/**
 * Instance-scoping for the bot-form side-effect stores.
 *
 * Historically `exampleOrdersStore` and `indicatorStore` were module globals.
 * That forces hedge bots to mount only ONE leg form at a time, because two
 * co-mounted `BotFormProvider`s would both write the same global and clobber
 * each other (see HedgeBotEditLayout's single-leg-mount hack).
 *
 * The stores are now instantiable. The context DEFAULT VALUE is the shared
 * module singleton, so any consumer NOT wrapped in an overriding provider —
 * regular dca/grid/combo bots, the trading terminal, deal drawers — reads the
 * exact same global object it always did. Behaviour is preserved by
 * construction. Only `BotFormProvider` with `isolateStores` (hedge legs)
 * supplies fresh per-instance stores.
 */
export const ExampleOrdersStoreContext =
  createContext<ExampleOrdersStore>(exampleOrdersStore);

export const IndicatorStoreContext =
  createContext<IndicatorStore>(indicatorStore);

/**
 * Read the active example-orders store. Returns the shared module singleton
 * unless an ancestor `BotFormProvider` isolated it (hedge leg).
 */
export function useExampleOrdersStore(): ExampleOrdersStore {
  return useContext(ExampleOrdersStoreContext);
}

/**
 * Read the active indicator store. Returns the shared module singleton unless
 * an ancestor `BotFormProvider` isolated it (hedge leg).
 */
export function useIndicatorStore(): IndicatorStore {
  return useContext(IndicatorStoreContext);
}
