import type { BalanceData } from '@/stores/live/balanceStore';
import {
  BotTypesEnum,
  StrategyEnum,
  type Asset,
  type DCABotSettings,
  type ExchangeInUser,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { extractPairAssets, normalizePairKey } from '@/utils/pairs';

/**
 * The settings a local (in-browser) DCA / combo backtest runs with: the form's
 * own slice, as the user has it now. It is the RAW slice, not the save
 * payload, so fields the save strips for an older backend (`singlePosition`,
 * `maxPositionEntries`) still reach the backtester, which simulates them.
 *
 * A combo bot stores its settings in `formData.combo`, not `formData.dca`, and
 * must run with `combo: true` so the backtester applies combo grid logic.
 * Mirrors legacy (useDCAPage `settingsInput`), which passes the bot's own
 * settings plus the real `combo` flag. Using `formData.dca` + `combo: false`
 * for a combo bot ran it as a plain DCA bot with the empty DCA slice,
 * producing trivial ~1% ROI deals.
 */
export const localDcaBacktestSettings = (
  formData: BotFormData,
  mapped: Pick<DCABotSettings, 'indicators' | 'indicatorGroups'>
): DCABotSettings => ({
  ...((formData.type === BotTypesEnum.combo
    ? formData.combo
    : formData.dca) as unknown as DCABotSettings),
  // The raw form slice keeps every indicator NUMBER param as a STRING:
  // `InlineIndicatorConfig` stores `newValue.toString()` so a `$var`
  // expression can share the field. It is `mapFormDataToPayload` that coerces
  // them back (its `fieldsAsNumber` list), so a SAVED bot holds
  // `indicatorLength: 14` while the form the user is still editing holds
  // `'14'` — and the engine is not tolerant: `new RSI('14')` returns `null`
  // for every bar, so no crossing ever fires and the run reports 0 deals
  // (while a saved, reopened bot backtests fine).
  // Take the indicators from the mapped payload instead: it is normalised
  // exactly the way the backend receives them, and pruned of the close
  // indicators the active close condition cannot use.
  // `mapIndicatorGroupsFields` reads the combo slice for combo bots, so this
  // is correct for both bot types.
  indicators: mapped.indicators,
  indicatorGroups: mapped.indicatorGroups,
  name: formData.name,
  pair: [formData.pair].flat(),
});

/**
 * The balances a local backtest sizes its orders from: the selected account's
 * rows of the live balance store (hydrated per account by the form's
 * `getBalances`), in the backtester's `Asset` shape. A linked account reads its
 * parent wallet, as legacy does (`new.tsx` filters on `linkedTo ?? uuid`).
 * Without them `percTotal` / `percFree` orders size off a zero balance and every
 * order falls to the venue minimum.
 */
export const localBacktestBalances = (
  balances: readonly BalanceData[],
  exchange: Pick<ExchangeInUser, 'uuid' | 'linkedTo'> | null | undefined
): Asset[] => {
  if (!exchange?.uuid) return [];
  const accounts = new Set([exchange.uuid, exchange.linkedTo].filter(Boolean));
  return balances
    .filter((b) => accounts.has(b.exchangeUUID))
    .map((b) => ({
      asset: b.asset,
      free: `${b.free ?? 0}`,
      locked: `${b.locked ?? 0}`,
    }));
};

/**
 * The asset a "Budget" for a local DCA backtest is counted in (spec 162): the
 * quote a long buys with, or the base a short sells. The engine's hard budget
 * (`enforceBalances`) covers spot DCA bots only and one spend asset for the
 * whole run, so a combo bot, a futures bot or a multi-pair bot whose pairs
 * spend different assets gets the reason instead.
 */
export const backtestBudgetAsset = (
  formData: Pick<BotFormData, 'type' | 'pair' | 'pairMetadata'> & {
    dca?: Partial<Pick<DCABotSettings, 'strategy' | 'futures'>>;
  }
):
  | { asset: string }
  | {
      unsupported: string;
      /** not a DCA-engine bot: no field at all */
      hidden?: true;
    } => {
  if (formData.type === BotTypesEnum.combo) {
    return { unsupported: 'Budget is available for spot DCA bots only.' };
  }
  if (formData.type !== BotTypesEnum.dca) {
    return {
      unsupported: 'Budget is available for DCA bots only.',
      hidden: true,
    };
  }
  const dca = formData.dca;
  if (dca?.futures) {
    return { unsupported: 'Budget is available for spot DCA bots only.' };
  }
  const short = dca?.strategy === StrategyEnum.short;
  const assets = new Set(
    [formData.pair]
      .flat()
      .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
      .map((p) => {
        const meta = (formData.pairMetadata ?? {})[normalizePairKey(p)];
        const fallback = extractPairAssets(p);
        return short
          ? (meta?.baseAsset?.name ?? fallback.baseAsset)
          : (meta?.quoteAsset?.name ?? fallback.quoteAsset);
      })
      .filter(Boolean)
  );
  if (assets.size !== 1) {
    return {
      unsupported:
        assets.size === 0
          ? 'Select a pair to set a budget.'
          : 'Budget needs all pairs to spend the same asset.',
    };
  }
  return { asset: [...assets][0] };
};

/**
 * The balances a budgeted run starts from: the account rows, with the spend
 * asset's free amount replaced by the budget (added when the account holds
 * none). The engine reads that row as the hard budget.
 */
export const applyBacktestBudget = (
  balances: readonly Asset[],
  asset: string,
  budget: number
): Asset[] => {
  const row: Asset = { asset, free: `${budget}`, locked: '0' };
  return balances.some((b) => b.asset === asset)
    ? balances.map((b) => (b.asset === asset ? row : b))
    : [...balances, row];
};
