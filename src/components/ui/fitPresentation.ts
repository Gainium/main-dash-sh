import type { FontStep } from './ResponsiveCurrencyValue';

// Average character width as a fraction of font-size for typical UI fonts.
// Digits & currency chars are slightly narrower than full em — 0.62 is a good fit.
const CHAR_WIDTH_RATIO = 0.62;

function estimateWidth(text: string, fontPx: number): number {
  return text.length * fontPx * CHAR_WIDTH_RATIO;
}

/**
 * Selects the best (font size, text) combination for the given full and
 * compact renderings of a value and the available container width.
 *
 * Strategy:
 *   1. Try full format from largest → smallest font until it fits.
 *   2. If no full-format size fits, try compact format from largest → smallest.
 *   3. Last resort: smallest font, compact.
 */
export function fitPresentation(
  fullText: string,
  compactText: string,
  containerWidth: number,
  steps: readonly FontStep[]
): { sizeClass: string; text: string } {
  // Container not yet measured — show full at the smallest size, no flash
  if (containerWidth === 0) {
    return {
      sizeClass: steps[steps.length - 1]?.sizeClass ?? 'text-base',
      text: fullText,
    };
  }

  // 1. Try full format
  for (const { sizeClass, px } of steps) {
    if (estimateWidth(fullText, px) <= containerWidth) {
      return { sizeClass, text: fullText };
    }
  }

  // 2. Try compact format
  for (const { sizeClass, px } of steps) {
    if (estimateWidth(compactText, px) <= containerWidth) {
      return { sizeClass, text: compactText };
    }
  }

  // 3. Absolute fallback
  return {
    sizeClass: steps[steps.length - 1]?.sizeClass ?? 'text-sm',
    text: compactText,
  };
}
