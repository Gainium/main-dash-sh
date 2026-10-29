import type {
  IndicatorDefinition,
  IndicatorFieldDefinition,
} from '@/types/indicators/indicatorTypes';
import type { SettingsIndicators } from '@/types';
import {
  resolveFieldKey,
  resolveFieldLabel,
  resolveFieldOptions,
  shouldHideField,
  withFieldDefaults,
  withGatingParams,
} from '@/utils/indicators/indicatorFieldGating';

const getOptionLabel = (
  field: IndicatorFieldDefinition,
  value: string | number | boolean
): string | undefined => {
  const options = field.options ?? [];
  return options.find((option) => String(option.value) === String(value))
    ?.label;
};

export const formatIndicatorParamValue = (
  field: IndicatorFieldDefinition,
  value: unknown
): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return '';
    }
    if (
      (field.type === 'select' || field.type === 'interval') &&
      field.options?.length
    ) {
      return getOptionLabel(field, trimmed) ?? trimmed;
    }
    return trimmed;
  }

  // A multi-select (Session Days) reads as its option labels, not raw values.
  if (Array.isArray(value)) {
    return value
      .map((item) => getOptionLabel(field, item) ?? String(item))
      .join(', ');
  }

  if (
    (field.type === 'select' || field.type === 'interval') &&
    field.options?.length
  ) {
    return (
      getOptionLabel(field, value as string | number | boolean) ?? String(value)
    );
  }

  return String(value);
};

// The condition an indicator fires on. Always summarized, even past the cap:
// without them the card can't say what the indicator waits
// for (RSI's Use percentile / Length / Interval / Condition filled all four
// slots, so "Value: 40" never showed and the editor had to be opened to see it).
const TRIGGER_FIELD_KEYS = new Set([
  'indicatorCondition',
  'indicatorValue',
  'indicatorValue2',
]);

export const buildIndicatorSummary = (
  definition: IndicatorDefinition,
  params: SettingsIndicators,
  maxItems = 4
): string[] => {
  const fields: IndicatorFieldDefinition[] = [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ];

  // Gate on the same defaults-filled params the editors use, and skip fields
  // the form hides — otherwise the card advertises inert settings and, being
  // first in the field order, crowds out the ones that actually apply. MA with
  // Reference "Current price" used to summarize as "Comparison length: 20 ·
  // Comparison interval: 1 hour" (both hidden, both stuck at their defaults)
  // while the live Length/Interval never made the cut.
  const effectiveParams = withGatingParams(definition, params);
  const filledParams = withFieldDefaults(definition, params) ?? params;

  const summary: string[] = [];
  let baseItems = 0;
  for (const field of fields) {
    // A field with its own `summary` only shows while its setting is in use,
    // so it does not count towards (or stop at) the cap.
    if (
      !field.summary &&
      !TRIGGER_FIELD_KEYS.has(field.key) &&
      baseItems >= maxItems
    ) {
      continue;
    }
    if (shouldHideField(field, effectiveParams)) {
      continue;
    }
    let formatted: string;
    if (field.summary) {
      formatted = field.summary(filledParams) ?? '';
    } else {
      const { key, defaultValue } = resolveFieldKey(field, params);
      const value = params?.[key] ?? defaultValue;
      // Name the value from the option list the form offers for these
      // params (`optionsWhen`), e.g. ADX's DMI conditions.
      formatted = formatIndicatorParamValue(
        {
          ...field,
          options:
            resolveFieldOptions(definition, field, params) ?? field.options,
        },
        value
      );
    }
    if (!formatted) {
      continue;
    }
    if (!field.summary) {
      baseItems += 1;
    }
    // Same dynamic label the form shows, so the card doesn't call a field
    // "Base MA length" while the editor under it says "EMA Length".
    summary.push(
      `${resolveFieldLabel(definition, field, effectiveParams)}: ${formatted}`
    );
  }

  return summary;
};
