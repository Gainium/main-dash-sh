import type {
  IndicatorDefinition,
  IndicatorFieldDefinition,
} from '@/types/indicators/indicatorTypes';
import type {
  IndicatorParamPrimitive,
  IndicatorParamsState,
} from '@/types/indicators/indicatorParams';

// Shared `hiddenWhen`/`disabledWhen`/`keyWhen` gating. The inline editor, the
// configuration modal and the indicator card summary must all agree on which
// fields are live for a given set of params — when they don't, the summary
// advertises settings the form doesn't even show (e.g. MA's "Comparison
// interval" while Reference is "Current price").

// Legacy STOCH bands bind a DIFFERENT param key depending on another field
// (stochRange). Resolve the effective storage key + default from `keyWhen`.
// First match wins; falls back to the static `key` / `defaultValue`.
export const resolveFieldKey = (
  field: IndicatorFieldDefinition,
  params: IndicatorParamsState | null
): {
  key: IndicatorFieldDefinition['key'];
  defaultValue: IndicatorFieldDefinition['defaultValue'];
} => {
  if (field.keyWhen && params) {
    const match = field.keyWhen.find(
      (entry) => params[entry.field] === entry.equals
    );
    if (match) {
      return { key: match.key, defaultValue: match.defaultValue };
    }
  }
  return { key: field.key, defaultValue: field.defaultValue };
};

// `hiddenWhen`/`disabledWhen` gate on values the user may never have touched.
// An unset param still RENDERS as its `defaultValue` (see `renderField`), so
// gating on the raw params object keeps a field visible even though the UI
// already shows the value that should hide it — e.g. MAR's "Comparison MA
// length" stayed visible while Reference showed its default "Current price".
// The modal dodges this by seeding defaults into its own state
// (IndicatorConfigurationModal.tsx `getIndicatorDefaultParams`); the inline
// editor and the card summary are handed the stored params verbatim, so fill
// the gaps here before gating.
//
// "Unset" has to mean `null` as well as `undefined`. A bot loaded from the API
// never sends `undefined`: GraphQL answers every field the selection asks for,
// and the indicator selection in GraphQLQueries-fragments.ts asks for
// `mar1type`/`mar2type`/`mar2length`, so a document that never stored them
// yields three explicit `null`s. A `null` still RENDERS as the default (the
// value expressions use `??`), which is what made this look cosmetic — the
// Reference select reads "Current price" while the params object says `null`,
// so `hiddenWhen: mar2type === MAEnum.price` could not match and "Comparison
// MA length" stayed on screen (and in the summary card) for every SAVED MAR.
export const withFieldDefaults = (
  definition: IndicatorDefinition,
  params: IndicatorParamsState | null
): IndicatorParamsState | null => {
  if (!params) {
    return null;
  }
  const filled = { ...params } as Record<string, IndicatorParamPrimitive>;
  for (const field of [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ]) {
    const { key, defaultValue } = resolveFieldKey(field, params);
    if (filled[key as string] == null && defaultValue !== undefined) {
      filled[key as string] = defaultValue as IndicatorParamPrimitive;
    }
  }
  return filled as IndicatorParamsState;
};

export const shouldHideField = (
  field: IndicatorFieldDefinition,
  params: IndicatorParamsState | null
): boolean => {
  if (!params) {
    return false;
  }
  if (!field.hiddenWhen) {
    return false;
  }
  // Legacy gated on truthiness, so an UNSET gating field is treated as falsy.
  // That only matches an `equals: false` directive (legacy `parent && (child)`
  // hides the child when the parent is falsy/undefined). For `equals: true` or
  // a concrete enum value, an undefined param must NOT match — legacy
  // `!parent && (field)` / `param === value` keeps the field visible when the
  // gate is unset.
  return field.hiddenWhen.some(({ field: key, equals }) =>
    equals === false
      ? typeof params[key] === 'undefined' || params[key] === false
      : params[key] === equals
  );
};

// A static `disabled` flag always disables (legacy ADR interval), otherwise
// match a `disabledWhen` directive.
export const shouldDisableField = (
  field: IndicatorFieldDefinition,
  params: IndicatorParamsState | null
): boolean => {
  if (field.disabled) {
    return true;
  }
  if (!params) {
    return false;
  }
  if (!field.disabledWhen) {
    return false;
  }
  return field.disabledWhen.some(
    ({ field: key, equals }) => params[key] === equals
  );
};
