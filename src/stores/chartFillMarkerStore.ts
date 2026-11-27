import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * How chart buy/sell icons are drawn, chosen from a chart's "Chart" menu and
 * kept for every chart. On (the default), each fill's ring is sized by the
 * order's value; off, every ring has the same size.
 */
interface ChartFillMarkerState {
  sizeByValue: boolean;
  toggleSizeByValue: () => void;
}

export const useChartFillMarkerStore = create<ChartFillMarkerState>()(
  persist(
    (set) => ({
      sizeByValue: true,
      toggleSizeByValue: () => set((s) => ({ sizeByValue: !s.sizeByValue })),
    }),
    {
      name: 'chart-fill-markers',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sizeByValue: s.sizeByValue }),
    }
  )
);
