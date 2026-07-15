import { Loader2 } from 'lucide-react';

/**
 * Shared "deals are loading" indicator for the bot details drawer. Used by both
 * the single-bot deals table (DrawerDealsTable — DCA/Combo/Grid) and the hedge
 * bot deals widget (via OpenOrdersWidget's `loadingIndicator` prop), so every
 * bot type shows the exact same loading treatment while open/closed deals are
 * still being fetched.
 */
export function DealsLoadingIndicator() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading deals...</span>
      </div>
    </div>
  );
}

export default DealsLoadingIndicator;
