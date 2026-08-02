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
  hiddenWhen?: ConditionalDirective[];
  disabledWhen?: ConditionalDirective[];
  /**
   * Statically (always) disable this field's control. Ports legacy fields that
   * are permanently read-only regardless of other params — e.g. ADR's interval
   * (indicators.tsx:1402 `disabled={... || i.type === IndicatorEnum.adr}`).
   * ORed with any `disabledWhen` match.
   */
  disabled?: boolean;
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
}
