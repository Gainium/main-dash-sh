/**
 * Apply a tested price-behaviour setting (indicator page `edge`) to the
 * indicator dialog: the catalog defaults, plus the setting's bot config, plus
 * the timeframe it was tested on.
 */
import {
  ExchangeIntervals,
  IndicatorAction,
  StrategyEnum,
  timeIntervalMap,
  type ExchangeEnum,
  type IndicatorEnum,
  type IndicatorSection,
} from '@/types';
import type {
  IndicatorEdgeBotConfig,
  IndicatorEdgeSetting,
} from '@/types/helpCenter';
import type { EdgeSide } from '@/utils/indicatorEdge';
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
  resolveFieldKey,
  resolveFieldOptions,
  shouldHideField,
  withGatingParams,
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

/** A param as the editor shows it: numbers and numeric strings alike. */
function normalizeParam(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(normalizeParam));
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const asNumber = trimmed === '' ? Number.NaN : Number(trimmed);
    return Number.isFinite(asNumber) ? String(asNumber) : trimmed;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** The value a field shows for these (default-filled) params. */
function shownValue(
  field: IndicatorDefinition['fields'][number],
  params: IndicatorParamsState
): string {
  if (field.derive) {
    return normalizeParam(field.derive.get(params));
  }
  const { key, defaultValue } = resolveFieldKey(field, params);
  const value = (params as Record<string, unknown>)[key as string];
  return normalizeParam(
    value === undefined || value === null || value === '' ? defaultValue : value
  );
}

interface MatchEdgeInput {
  definition: IndicatorDefinition;
  action: IndicatorAction;
  section?: IndicatorSection | undefined;
  /** The editor's current params. */
  params: IndicatorParamsState;
  settings: IndicatorEdgeSetting[];
}

/**
 * The tested setting the editor's params reproduce, or null. A setting
 * matches when every field the tested setting shows reads the same as what
 * Apply would set on that setting's timeframe: its bot config, the catalog
 * default for every other field (so RSI(7) "below 30" does not match a
 * length of 14), and the timeframe on every interval field. A field the
 * tested setting hides does not count (a price-crossing MA has no second
 * interval to match).
 */
export function matchEdgeSetting({
  definition,
  action,
  section,
  params,
  settings,
}: MatchEdgeInput): IndicatorEdgeSetting | null {
  const current = withGatingParams(definition, params);
  if (!current) return null;
  const fields = [...definition.fields, ...(definition.advancedFields ?? [])];
  for (const setting of settings) {
    const bot = setting.bot;
    if (
      !bot ||
      bot.type !== definition.type ||
      edgeTfToInterval(setting.tf) === null ||
      !isApplicableEdgeBot(bot)
    ) {
      continue;
    }
    const tested = withGatingParams(
      definition,
      buildEdgeAppliedParams({
        definition,
        action,
        section,
        current: null,
        request: { bot, tf: setting.tf },
      })
    );
    if (!tested) continue;
    const same = fields.every(
      (field) =>
        shouldHideField(field, tested) ||
        shownValue(field, current) === shownValue(field, tested)
    );
    if (same) return setting;
  }
  return null;
}

/**
 * The side a condition trades in this bot, for reading its price behaviour.
 * Entries (start deal, DCA add) trade the bot's side; exits (close deal, TP,
 * SL) pay off when price then moves against the position, so they read from
 * the opposite side. Unknown (null) without a strategy or for actions that
 * are not entries or exits (bot controller, risk-reward).
 */
export function edgeSideForCondition(
  action: IndicatorAction,
  strategy: StrategyEnum | string | null | undefined
): EdgeSide | null {
  if (strategy !== StrategyEnum.long && strategy !== StrategyEnum.short) {
    return null;
  }
  const botSide: EdgeSide = strategy === StrategyEnum.long ? 'long' : 'short';
  switch (action) {
    case IndicatorAction.startDeal:
    case IndicatorAction.startDca:
      return botSide;
    case IndicatorAction.closeDeal:
      return botSide === 'long' ? 'short' : 'long';
    default:
      return null;
  }
}
