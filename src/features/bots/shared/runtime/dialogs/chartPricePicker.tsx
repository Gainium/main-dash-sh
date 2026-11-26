// Lets a price field take its value from a click on a chart that sits beside
// it, and shows the field's price on that chart as a draggable draft line.
//
// The surface that owns the chart (the deal drawer) runs the host hook and
// provides the context; a field reads it and offers a pick button only when a
// chart is there. Without a provider nothing changes.
import type { ChartPickerCoordinates } from '@/components/widgets/shared/TradingViewChart/TVChartPicker';
import type { ChartOrderLine } from '@/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface ChartPriceDraft {
  price: number;
  label: string;
  side: 'buy' | 'sell';
}

export interface ChartPricePick {
  field: string;
  price: number;
  /** Increases on every pick, so picking the same price twice still lands. */
  seq: number;
}

export interface ChartPricePickerValue {
  /** The field waiting for a click on the chart, or null. */
  activeField: string | null;
  start: (field: string) => void;
  cancel: () => void;
  lastPick: ChartPricePick | null;
  setDraft: (field: string, draft: ChartPriceDraft | null) => void;
}

export const ChartPricePickerContext =
  createContext<ChartPricePickerValue | null>(null);

/** The picker of the chart beside this field, or null when there is none. */
export const useChartPricePicker = (): ChartPricePickerValue | null =>
  useContext(ChartPricePickerContext);

/** State for the surface that owns the chart. */
export function useChartPricePickerHost(): {
  value: ChartPricePickerValue;
  /** Feed to `TVChartPicker`. */
  isActive: boolean;
  onPick: (coordinates: ChartPickerCoordinates) => void;
  /** Draft lines to draw on the chart. */
  lines: ChartOrderLine[];
} {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<ChartPricePick | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ChartPriceDraft>>({});

  const deliver = useCallback((field: string, price: number) => {
    if (!(price > 0)) return;
    setLastPick((prev) => ({ field, price, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const start = useCallback((field: string) => setActiveField(field), []);
  const cancel = useCallback(() => setActiveField(null), []);

  const setDraft = useCallback(
    (field: string, draft: ChartPriceDraft | null) =>
      setDrafts((prev) => {
        const current = prev[field];
        if (!draft) {
          if (!current) return prev;
          return Object.fromEntries(
            Object.entries(prev).filter(([key]) => key !== field)
          );
        }
        if (
          current &&
          current.price === draft.price &&
          current.label === draft.label &&
          current.side === draft.side
        ) {
          return prev;
        }
        return { ...prev, [field]: draft };
      }),
    []
  );

  const onPick = useCallback(
    (coordinates: ChartPickerCoordinates) => {
      if (!activeField) return;
      deliver(activeField, coordinates.price);
      setActiveField(null);
    },
    [activeField, deliver]
  );

  useEffect(() => {
    if (!activeField) return;
    // Captured on window so Esc cancels the pick only, and does not also reach
    // the drawer around the chart (which closes on Esc).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setActiveField(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeField]);

  const lines = useMemo<ChartOrderLine[]>(
    () =>
      Object.entries(drafts).map(([field, draft]) => ({
        price: draft.price,
        side: draft.side,
        qty: 0,
        label: draft.label,
        isDraggable: true,
        // Dragging the line is the same as picking where it was dropped.
        onMove: (price: number) => deliver(field, price),
      })),
    [drafts, deliver]
  );

  const value = useMemo<ChartPricePickerValue>(
    () => ({ activeField, start, cancel, lastPick, setDraft }),
    [activeField, start, cancel, lastPick, setDraft]
  );

  return { value, isActive: activeField !== null, onPick, lines };
}
