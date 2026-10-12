import type { IndicatorFieldDefinition } from '@/types/indicators/indicatorTypes';

// Two-column layout of an indicator's fields. Compact controls (numbers,
// short selects) sit two per row; anything that needs the width takes the
// whole row. The pairing runs over the VISIBLE fields only, so a field hidden
// by gating never leaves a hole: a half-width field without a half-width
// neighbour is widened to the full row instead.

export type IndicatorFieldSpan = 'full' | 'half';

// Longest option label that still fits a half-width select trigger at the
// narrowest two-column card (~140px per column): "Crossing down" fits,
// "Price crossing down" does not.
const MAX_HALF_OPTION_LABEL = 14;

const longestOptionLabel = (field: IndicatorFieldDefinition): number =>
  Math.max(
    0,
    ...[
      ...(field.options ?? []),
      ...(field.optionsWhen ?? []).flatMap((entry) => entry.options),
    ].map((option) => option.label.length)
  );

/** The width a field asks for, before pairing. */
export const resolveFieldSpan = (
  field: IndicatorFieldDefinition
): IndicatorFieldSpan => {
  if (field.span) {
    return field.span;
  }
  if (field.type === 'boolean' || field.multiple || field.description) {
    return 'full';
  }
  if (
    (field.type === 'select' || field.type === 'interval') &&
    longestOptionLabel(field) > MAX_HALF_OPTION_LABEL
  ) {
    return 'full';
  }
  return 'half';
};

/**
 * The span of each VISIBLE field, in order. Pairs are formed over the
 * catalog's full field order (so logical pairs such as Length | Interval or
 * Smoothing | Smoothing length stay together whatever is hidden), and a
 * half-width field whose partner is hidden takes the full row rather than
 * borrowing an unrelated neighbour or leaving a hole.
 */
export const layoutFieldSpans = (
  fields: IndicatorFieldDefinition[],
  isVisible: (field: IndicatorFieldDefinition) => boolean
): IndicatorFieldSpan[] => {
  const requested = fields.map(resolveFieldSpan);
  // A condition and the value it tests read as one statement, so they keep a
  // row of their own even when that leaves the field before them alone.
  const startsAnchoredPair = (index: number): boolean => {
    const first = fields[index];
    const second = fields[index + 1];
    return Boolean(
      first &&
      second &&
      first.key === 'indicatorCondition' &&
      second.key === 'indicatorValue' &&
      requested[index] === 'half' &&
      requested[index + 1] === 'half' &&
      isVisible(first) &&
      isVisible(second)
    );
  };
  const spans: IndicatorFieldSpan[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] as IndicatorFieldDefinition;
    const partner = fields[i + 1];
    if (
      requested[i] === 'half' &&
      partner &&
      requested[i + 1] === 'half' &&
      !startsAnchoredPair(i + 1)
    ) {
      const both = isVisible(field) && isVisible(partner);
      if (isVisible(field)) spans.push(both ? 'half' : 'full');
      if (isVisible(partner)) spans.push(both ? 'half' : 'full');
      i += 1;
    } else if (isVisible(field)) {
      spans.push('full');
    }
  }
  return spans;
};
