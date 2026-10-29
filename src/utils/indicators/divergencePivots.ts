import { IndicatorEnum } from '@/types';

/**
 * Divergence pivot / lookback-range settings and the values the engines use
 * when one is not stored (the `DIV` defaults in @gainium/indicators).
 */
export const DIV_PIVOT_DEFAULTS = {
  divPivotLeft: 3,
  divPivotRight: 1,
  divRangeLower: 1,
  divRangeUpper: 60,
} as const;

type DivPivotKey = keyof typeof DIV_PIVOT_DEFAULTS;

const DIV_PIVOT_KEYS = Object.keys(DIV_PIVOT_DEFAULTS) as DivPivotKey[];

type DivPivotRow = {
  type: IndicatorEnum | string;
} & Partial<Record<DivPivotKey, number | string | null>>;

const isUnset = (v: unknown) => v === undefined || v === null || v === '';

/**
 * The row without the pivot settings that are empty or equal to the default.
 * The bot engine adds a setting to the condition's data stream only when it
 * is stored, so a Divergence whose settings were left at the defaults keeps
 * the exact stream (and history) it always had. Other types are returned as
 * they are.
 */
export const stripDefaultDivergencePivots = <T extends DivPivotRow>(
  row: T
): T => {
  if (row.type !== IndicatorEnum.div) {
    return row;
  }
  const drop = DIV_PIVOT_KEYS.filter(
    (key) =>
      key in row &&
      (isUnset(row[key]) ||
        (isFinite(+(row[key] as number)) &&
          +(row[key] as number) === DIV_PIVOT_DEFAULTS[key]))
  );
  if (drop.length === 0) {
    return row;
  }
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !drop.includes(key as DivPivotKey))
  ) as T;
};

/**
 * The pivot range never finds a pair when its min is not below its max
 * (unset = the defaults). A `$variable` is not judged here.
 */
export const divergenceRangeInvalid = (row: DivPivotRow): boolean => {
  if (row.type !== IndicatorEnum.div) {
    return false;
  }
  const value = (key: 'divRangeLower' | 'divRangeUpper') =>
    isUnset(row[key]) ? DIV_PIVOT_DEFAULTS[key] : +(row[key] as number);
  const lower = value('divRangeLower');
  const upper = value('divRangeUpper');
  if (!isFinite(lower) || !isFinite(upper)) {
    return false;
  }
  return !(lower < upper);
};
