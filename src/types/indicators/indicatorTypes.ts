import { IndicatorAction, IndicatorEnum, type SettingsIndicators } from '..';

export const IndicatorCategories = {
  Trend: 'trend',
  Momentum: 'momentum',
  Volatility: 'volatility',
  Volume: 'volume',
  Chart: 'chart',
  Technical: 'technical',
  Filter: 'filter',
} as const;

export type IndicatorCategory =
  (typeof IndicatorCategories)[keyof typeof IndicatorCategories];

export const IndicatorFieldTypes = {
  NUMBER: 'number',
  SELECT: 'select',
  BOOLEAN: 'boolean',
  INTERVAL: 'interval',
  STRING: 'string',
  /** Local time of day, stored as `HH:MM` ('' when unset). */
  TIME: 'time',
} as const;

export type IndicatorFieldType =
  (typeof IndicatorFieldTypes)[keyof typeof IndicatorFieldTypes];

type ConditionalDirective = {
  field: keyof SettingsIndicators;
  equals: unknown;
};

export interface IndicatorFieldOption {
  value: string | number | boolean;
  label: string;
  description?: string;
}

export interface IndicatorFieldDefinition {
  key: keyof SettingsIndicators;
  label: string;
  type: IndicatorFieldType;
  description?: string;
  tooltip?: string;
  tooltipURL?: string;
  defaultValue?: string | number | boolean | string[];
  required?: boolean;
  allowVariables?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /**
   * Trailing unit shown inside number inputs (legacy `endAdornment`), e.g. the
   * "%" on UNPNL's value field (indicators.tsx:223). Cosmetic; no payload impact.
   */
  suffix?: string;
  placeholder?: string;
  options?: IndicatorFieldOption[];
  /**
   * Conditional option sets: when another field equals a given value, the
   * select renders this option list instead of `options`. First match wins;
   * falls back to `options` when nothing matches. Ports the legacy pattern
   * where e.g. Market Structure's value dropdown changes with the trigger type.
   */
  optionsWhen?: Array<{
    field: keyof SettingsIndicators;
    equals: unknown;
    options: IndicatorFieldOption[];
  }>;
  /**
   * Conditional storage-key remapping: when another field equals a given
   * value, this field reads/writes a DIFFERENT param key (and optionally a
   * different default) than its static `key`. First match wins; falls back to
   * `key` / `defaultValue` when nothing matches. Ports the legacy STOCH band
   * swap where the band the user edits binds stochLower vs stochUpper
   * depending on stochRange (indicators.tsx ~2447-2548).
   */
  keyWhen?: Array<{
    field: keyof SettingsIndicators;
    equals: unknown;
    key: keyof SettingsIndicators;
    defaultValue?: string | number | boolean | string[];
  }>;
  /**
   * Name this field after the option currently selected in ANOTHER field, as
   * `<that option's label> <suffix>`. Falls back to the static `label` while
   * the driving field is unset.
   *
   * A candle count is meaningless without the smoothing it belongs to, so
   * legacy labels these inputs dynamically: MAR's two length fields render
   * `${(mar1type ?? '').toUpperCase()} Length` and the MA indicator's
   * comparison inputs render `${maCrossName[maCrossingValue]} length` /
   * `… interval` (indicators.tsx:332/357/1162/1220). A static "Base MA length"
   * states neither which average it smooths nor which of the two ratio legs it
   * sizes.
   */
  labelFrom?: {
    field: keyof SettingsIndicators;
    suffix: string;
  };
  multiple?: boolean;
  /**
   * The form group the field renders in. Unset = the indicator's own settings;
   * 'modifiers' = the optional transforms of its line (smoothing, percentile),
   * drawn under their own heading after everything else.
   */
  section?: 'modifiers';
  /**
   * Width in the two-column field grid. Defaults by type (see
   * `resolveFieldSpan`): toggles, checkbox groups, fields with a description
   * and selects with long option labels take the full row; numbers and short
   * selects take half and pair with their neighbour.
   */
  span?: 'full' | 'half';
  /**
   * Always begin a new row in the field grid: never paired as the second half
   * with the field before it (e.g. Smoothing, which pairs with the Smoothing
   * length after it, not with whatever precedes the block).
   */
  rowStart?: boolean;
  /**
   * Custom text for the indicator card summary. Return `null` to leave the
   * field out of the summary (a setting that is off). Fields with a
   * `summary` do not count towards the summary's item cap: they only show
   * while their setting is in use, so they never displace the base items.
   */
  summary?: (params: SettingsIndicators) => string | null;
  hiddenWhen?: ConditionalDirective[];
  /** Hidden unless one of these matches (e.g. the "between" upper bound). */
  shownWhen?: ConditionalDirective[];
  disabledWhen?: ConditionalDirective[];
  /**
   * Statically (always) disable this field's control. Ports legacy fields that
   * are permanently read-only regardless of other params — e.g. ADR's interval
   * (indicators.tsx:1402 `disabled={... || i.type === IndicatorEnum.adr}`).
   * ORed with any `disabledWhen` match.
   */
  disabled?: boolean;
  /**
   * A select or switch with no stored value of its own: it shows a value read
   * from other params and writes those params when changed (the Session
   * preset, which fills the hour fields; the Smoothing switch, which reads
   * 'true' / 'false'). Without a `defaultValue` its `key` is only the
   * control's id and is never seeded.
   */
  derive?: {
    get: (params: SettingsIndicators) => string;
    set: (
      value: string,
      params: SettingsIndicators
    ) => Partial<SettingsIndicators>;
  };
}

export interface IndicatorDefinition {
  type: IndicatorEnum;
  label: string;
  shortLabel: string;
  category: IndicatorCategory;
  description: string;
  supportedActions: IndicatorAction[];
  fields: IndicatorFieldDefinition[];
  advancedFields?: IndicatorFieldDefinition[];
  pendingPort?: boolean;
  documentationUrl?: string;
  /**
   * Map stored params to the EFFECTIVE values the `hiddenWhen` / `shownWhen`
   * / `disabledWhen` / `optionsWhen` directives compare against. The
   * directives are plain equality checks; when one setting only applies while
   * others allow it (the smoothing compare mode needs smoothing on and percentile
   * off), the definition resolves that here instead of in every directive.
   * Gating only — never applied to what is saved.
   */
  deriveGatingParams?: (params: SettingsIndicators) => SettingsIndicators;
}
