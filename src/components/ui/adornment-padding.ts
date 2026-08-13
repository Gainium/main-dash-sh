/**
 * Left padding an input needs so its value clears an absolutely-positioned
 * start adornment (coin icon + unit label).
 *
 * The two were previously unrelated: the adornment sized itself to its content
 * while the input reserved a flat `4.5rem`, so any label past ~7 characters
 * overlapped the value — `FARTCOIN`, `1000PEPE` and Hyperliquid's `XYZ:SP500`
 * all did.
 *
 * Two properties matter and are pinned by tests:
 *   - it NEVER goes below the original 4.5rem, so every label that fits today
 *     renders exactly as it does today;
 *   - the floor stays in `rem` and the comparison happens in CSS, because this
 *     app's rem tracks the browser font size — resolving it to px here would
 *     break the layout for anyone not on a 16px default.
 */

/** The original fixed reservation, and the floor for the computed value. */
export const ADORNMENT_PADDING_FLOOR = '4.5rem';

/**
 * Adornment container's own `pl-1` (4px) plus 8px of breathing room before the
 * value starts.
 *
 * Sized so the widest label in common use still lands under the floor — `USDT`
 * measures 59px, and 59 + 12 = 71px against the 72px the floor resolves to at a
 * 16px root. One px more and every USDT-quoted field in the app would shift,
 * for no benefit.
 */
export const ADORNMENT_GUTTER = 12;

/**
 * @param width measured adornment width in px; 0 / unmeasured yields
 *   `undefined` so the caller's static `pl-[4.5rem]` class stays in effect.
 */
export const adornmentPaddingLeft = (width: number): string | undefined => {
  if (!Number.isFinite(width) || width <= 0) return undefined;
  return `max(${ADORNMENT_PADDING_FLOOR}, ${Math.ceil(width) + ADORNMENT_GUTTER}px)`;
};
