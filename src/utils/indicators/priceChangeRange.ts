import { IndicatorEnum, PCCompareEnum } from '@/types';

/**
 * Price Change range: how the candle's move from its open (up to the high for
 * a positive `pcValue`, down to the low for a negative one, in %) is compared
 * — greater than (unset, the behaviour before the setting existed), lower
 * than, or strictly between |pcValue| and |pcValue2|. The decision lives in
 * `@gainium/indicators` (`priceChangeCondition`); this module only keeps what
 * the form saves in the shape the engines read.
 */

type PriceChangeRow = {
  type: IndicatorEnum | string;
  pcValue?: string | number | null;
  pcValue2?: string | number | null;
  pcCompare?: PCCompareEnum | string | null;
};

const isUnset = (v: unknown) => v === undefined || v === null || v === '';

const isVariable = (v: unknown) => typeof v === 'string' && v.startsWith('$');

/** The compare the engines apply: unset / unknown = gt. */
export const resolvePriceChangeCompare = (
  compare: PriceChangeRow['pcCompare'],
): PCCompareEnum =>
  compare === PCCompareEnum.lt || compare === PCCompareEnum.bw
    ? compare
    : PCCompareEnum.gt;

/**
 * The row as it should be saved: no `pcCompare` when it is greater than (so
 * a Price Change that never chose keeps exactly the data it always had), no
 * `pcValue2` unless the compare is between. Other types are returned as they
 * are.
 */
export const stripPriceChangeRange = <T extends PriceChangeRow>(row: T): T => {
  if (row.type !== IndicatorEnum.pc) {
    return row;
  }
  const compare = resolvePriceChangeCompare(row.pcCompare);
  const drop: string[] = [];
  if ('pcCompare' in row && compare === PCCompareEnum.gt) {
    drop.push('pcCompare');
  }
  if ('pcValue2' in row && compare !== PCCompareEnum.bw) {
    drop.push('pcValue2');
  }
  if (drop.length === 0) {
    return row;
  }
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !drop.includes(key)),
  ) as T;
};

/**
 * Between with no second value, a second value of the other sign, or two
 * values of the same size never fires (unset pcValue = 5). A `$variable` is
 * not judged here.
 */
export const priceChangeRangeInvalid = (row: PriceChangeRow): boolean => {
  if (
    row.type !== IndicatorEnum.pc ||
    resolvePriceChangeCompare(row.pcCompare) !== PCCompareEnum.bw
  ) {
    return false;
  }
  if (isVariable(row.pcValue) || isVariable(row.pcValue2)) {
    return false;
  }
  const v1 = isUnset(row.pcValue) ? 5 : +(row.pcValue as number);
  const v2 = isUnset(row.pcValue2) ? NaN : +(row.pcValue2 as number);
  if (!isFinite(v1) || !isFinite(v2)) {
    return true;
  }
  const sameSign = (v1 > 0 && v2 > 0) || (v1 < 0 && v2 < 0);
  return !sameSign || Math.abs(v1) === Math.abs(v2);
};

/**
 * A second bound to start Between with: twice the first, same sign (5 → 10,
 * −2 → −4), or nothing when the first is a variable or not a number.
 */
export const suggestPriceChangeValue2 = (
  pcValue: PriceChangeRow['pcValue'],
): string | undefined => {
  if (isVariable(pcValue)) {
    return undefined;
  }
  const v = isUnset(pcValue) ? 5 : +(pcValue as number);
  if (!isFinite(v) || v === 0) {
    return undefined;
  }
  return `${v * 2}`;
};
