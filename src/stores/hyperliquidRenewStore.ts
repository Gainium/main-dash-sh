import { create } from 'zustand';

/**
 * Which Hyperliquid connection the renewal dialog is open for. One dialog is
 * mounted in the layout; chips, the `?renew=` deep link and notifications all
 * open it through here.
 */
interface HyperliquidRenewState {
  targetUuid: string | null;
  open: (uuid: string) => void;
  close: () => void;
}

export const useHyperliquidRenewStore = create<HyperliquidRenewState>(
  (set) => ({
    targetUuid: null,
    open: (uuid) => set({ targetUuid: uuid }),
    close: () => set({ targetUuid: null }),
  })
);
