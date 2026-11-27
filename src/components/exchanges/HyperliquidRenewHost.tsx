import React, { Suspense, lazy } from 'react';
import { useHyperliquidRenewStore } from '@/stores/hyperliquidRenewStore';

// The dialog carries the Hyperliquid SDK; load it only when it is opened.
const HyperliquidRenewDialog = lazy(() => import('./HyperliquidRenewDialog'));

/** Mounted once in the layout: renders the renewal dialog while it is open. */
export const HyperliquidRenewHost: React.FC = () => {
  const open = useHyperliquidRenewStore((s) => !!s.targetUuid);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <HyperliquidRenewDialog />
    </Suspense>
  );
};

export default HyperliquidRenewHost;
