import type { BalanceData } from '@/stores/live/balanceStore';
import {
  BotTypesEnum,
  type Asset,
  type DCABotSettings,
  type ExchangeInUser,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

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
