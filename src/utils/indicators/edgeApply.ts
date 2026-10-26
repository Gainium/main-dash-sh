/**
 * Apply a tested price-behaviour setting (indicator page `edge`) to the
 * indicator dialog: the catalog defaults, plus the setting's bot config, plus
 * the timeframe it was tested on.
 */
import {
  ExchangeIntervals,
  timeIntervalMap,
  type ExchangeEnum,
  type IndicatorAction,
  type IndicatorEnum,
  type IndicatorSection,
} from '@/types';
import type { IndicatorEdgeBotConfig } from '@/types/helpCenter';
import { INDICATOR_CATALOG } from '@/types/indicators/indicatorCatalog';
import {
  filterIntervalOptionsByExchange,
  getIndicatorCatalogDefaultParams,
} from '@/types/indicators/indicatorLogic';
import type {
  IndicatorParamPrimitive,
  IndicatorParamsState,
} from '@/types/indicators/indicatorParams';
import type { IndicatorDefinition } from '@/types/indicators/indicatorTypes';
import {
  resetInvalidConditionalSelects,
  resolveFieldOptions,
} from '@/utils/indicators/indicatorFieldGating';

/** What Apply hands the dialog: the bot config and the tab's timeframe. */
export interface EdgeApplyRequest {
  bot: IndicatorEdgeBotConfig;
  tf: string;
}

const INTERVALS = new Set<string>(Object.values(ExchangeIntervals));

/** `1h` → `ExchangeIntervals.oneH`; null for a timeframe the bots do not have. */
export function edgeTfToInterval(tf: string): ExchangeIntervals | null {
  return INTERVALS.has(tf) ? (tf as ExchangeIntervals) : null;
}

/** Every param key the definition stores, including keys a field switches to. */
function knownKeys(definition: IndicatorDefinition): Set<string> {
  const keys = new Set<string>();
  for (const field of [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ]) {
    keys.add(field.key as string);
    field.keyWhen?.forEach((entry) => keys.add(entry.key as string));
  }
  return keys;
}

/**
 * Whether this build's catalog can reproduce the config exactly: its type is
 * registered and it sets only fields the type has. Rows are never
 * approximated, so a config with a field this build does not know (an older
 * self-hosted catalog) gets no Apply.
 */
export function isApplicableEdgeBot(bot: IndicatorEdgeBotConfig): boolean {
  const definition = INDICATOR_CATALOG[bot.type as IndicatorEnum];
  if (!definition) return false;
  const keys = knownKeys(definition);
  return Object.keys(bot.params).every((key) => keys.has(key));
}

interface BuildEdgeParamsInput {
  definition: IndicatorDefinition;
  action: IndicatorAction;
  section?: IndicatorSection | undefined;
  /** The dialog's current params. */
  current: IndicatorParamsState | null;
  request: EdgeApplyRequest;
  exchange?: ExchangeEnum | undefined;
  /** Shortest interval the editor offers (the inline editor's floor). */
  minIntervalMs?: number | undefined;
}

/**
 * The editor's params after Apply. Starts from the catalog's plain defaults
 * (never a favorite's saved settings), so nothing set before (smoothing,
 * percentile…) changes what was tested. Keeps the indicator's identity
 * (`uuid`, `groupId`) so an edited indicator stays the same one.
 *
 * Every interval field takes the tab's timeframe: the bot configs never carry
 * one, and a second MA or oscillator left on another interval is a setting
 * the data never measured. A field whose options do not offer it (the bot's
 * exchange, the editor's shortest interval) keeps its current value.
 */
export function buildEdgeAppliedParams({
  definition,
  action,
  section,
  current,
  request,
  exchange,
  minIntervalMs,
}: BuildEdgeParamsInput): IndicatorParamsState {
  const defaults = getIndicatorCatalogDefaultParams(
    definition.type,
    action,
    section
  );
  const next = {
    ...defaults,
    ...(current?.uuid ? { uuid: current.uuid } : {}),
    ...(current?.groupId ? { groupId: current.groupId } : {}),
    ...request.bot.params,
  } as Record<string, IndicatorParamPrimitive>;

  const interval = edgeTfToInterval(request.tf);
  const intervalKeys: string[] = [];
  for (const field of [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ]) {
    if (field.type !== 'interval' || field.multiple) continue;
    const key = field.key as string;
    intervalKeys.push(key);
    const offered = filterIntervalOptionsByExchange(
      resolveFieldOptions(definition, field, next as IndicatorParamsState),
      exchange
    );
    const isOffered =
      interval !== null &&
      (offered ?? []).some((option) => option.value === interval) &&
      (minIntervalMs === undefined ||
        (timeIntervalMap[interval] ?? 0) >= minIntervalMs);
    const kept =
      (current as Record<string, IndicatorParamPrimitive> | null)?.[key] ??
      (defaults as Record<string, IndicatorParamPrimitive>)[key];
    next[key] = isOffered ? interval : kept;
  }

  // Same rule as editing a field by hand: a select whose options depend on
  // a changed field falls back to a valid value.
  const prev = current ?? defaults;
  return [...Object.keys(request.bot.params), ...intervalKeys].reduce(
    (params, key) =>
      resetInvalidConditionalSelects(definition, prev, params, key),
    next as IndicatorParamsState
  );
}
