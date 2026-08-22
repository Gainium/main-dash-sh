import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Long-press → open the card's actions menu.
 *
 * Every bot/deal card exposes its actions through a `MoreVertical` dropdown in
 * a floating pill. On touch that pill is a small target, so a long press
 * anywhere on the card opens the same menu directly. The returned `open` /
 * `setOpen` pair is meant to drive a controlled `<DropdownMenu>` whose trigger
 * is that pill button — the menu still anchors to the button, so its position
 * is identical whether it was tapped or long-pressed.
 *
 * Touch only: on desktop the pill is hover-revealed and right-click keeps the
 * browser's own context menu.
 */

const LONG_PRESS_MS = 450;
// A press that drifts further than this is a scroll/swipe, not a long press.
const MOVE_TOLERANCE_PX = 10;

export interface UseLongPressMenuOptions {
  delay?: number;
  /** Fired when the press qualifies, before the menu opens. */
  onLongPress?: () => void;
  /** Skip the whole gesture (e.g. the card has no actions). */
  disabled?: boolean;
}

export function useLongPressMenu(options: UseLongPressMenuOptions = {}) {
  const { delay = LONG_PRESS_MS, onLongPress, disabled = false } = options;

  const [open, setOpen] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the press qualifies; consumed by the click that the browser
  // synthesises after touchend so the card doesn't also navigate.
  const suppressClickRef = useRef(false);
  // True between touchstart and touchend — lets us tell a touch-originated
  // `contextmenu` (Android fires one at ~500ms) from a real right-click.
  const touchActiveRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY };
      suppressClickRef.current = false;
      touchActiveRef.current = true;
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        suppressClickRef.current = true;
        onLongPressRef.current?.();
        setOpen(true);
      }, delay);
    },
    [cancel, delay, disabled]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (
        Math.abs(dx) > MOVE_TOLERANCE_PX ||
        Math.abs(dy) > MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    },
    [cancel]
  );

  const onTouchEnd = useCallback(() => {
    cancel();
    startRef.current = null;
    touchActiveRef.current = false;
  }, [cancel]);

  // Suppress the platform callout/selection menu that a long press would
  // otherwise raise on top of ours. Real right-clicks are left alone.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (touchActiveRef.current) e.preventDefault();
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  /**
   * Call at the top of the card's click handler: returns true when the click
   * is the tail of a long press and should be ignored.
   */
  const shouldSuppressClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    open,
    setOpen,
    shouldSuppressClick,
    suppressClickRef,
    cancelLongPress: cancel,
    longPressHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      onContextMenu,
    },
  };
}

export default useLongPressMenu;
