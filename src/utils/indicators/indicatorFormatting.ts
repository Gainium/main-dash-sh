import type {
  IndicatorDefinition,
  IndicatorFieldDefinition,
} from '@/types/indicators/indicatorTypes';
import type { SettingsIndicators } from '@/types';
import {
  resolveFieldKey,
  resolveFieldLabel,
  shouldHideField,
  withFieldDefaults,
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
  const effectiveParams = withFieldDefaults(definition, params);

  const summary: string[] = [];
  for (const field of fields) {
    if (summary.length >= maxItems) {
      break;
    }
    if (shouldHideField(field, effectiveParams)) {
      continue;
    }
    const { key, defaultValue } = resolveFieldKey(field, params);
    const value = params?.[key] ?? defaultValue;
    const formatted = formatIndicatorParamValue(field, value);
    if (!formatted) {
      continue;
    }
    // Same dynamic label the form shows, so the card doesn't call a field
    // "Base MA length" while the editor under it says "EMA Length".
    summary.push(
      `${resolveFieldLabel(definition, field, effectiveParams)}: ${formatted}`
    );
  }

  return summary;
};
