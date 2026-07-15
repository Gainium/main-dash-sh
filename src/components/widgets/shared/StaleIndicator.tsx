import logger from '@/lib/loggerInstance';
import { FIVE_MINUTES, queryClient } from '@/lib/queryClient';
import { useCacheStatusStore } from '@/stores/cacheStatusStore';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Tooltip } from '../../ui/tooltip';

interface StaleIndicatorProps {
  componentId: string;
  className?: string;
}

/**
 * StaleIndicator component that shows:
 * - A clock icon (or spinning indicator when data is being revalidated)
 * - The last updated timestamp in a tooltip
 *
 * Automatically tracks cache status via the cacheStatusStore
 */
const StaleIndicatorComponent: React.FC<StaleIndicatorProps> = ({
  componentId,
  className = '',
}) => {
  // Subscribe to THIS component's cache entry directly. updateCacheStatus
  // rebuilds the Map but preserves the identity of every unchanged entry, so a
  // plain selector re-renders only when our own entry changes — an unrelated
  // widget's write leaves `cacheStatuses.get(componentId)` referentially
  // identical. This also closes the mount gap and stale-componentId gap the old
  // manual subscribe + useState mirrors had (an update between the initial seed
  // and the effect subscription could be missed; componentId changes never
  // re-seeded).
  const cacheStatus = useCacheStatusStore((s) =>
    s.cacheStatuses.get(componentId)
  );
  const isRevalidating = cacheStatus?.isRevalidating ?? false;
  const [isHovering, setIsHovering] = useState(false);

  const lastUpdated = cacheStatus?.lastUpdated;

  // Coarse staleness evaluation. The stale icon (Check → AlertCircle) crosses
  // the 5-minute threshold on its own even with no data update, so we still
  // need a periodic check — but at a 60s cadence and only re-rendering when the
  // boolean actually flips, instead of the old 1s unconditional tick.
  const [isStale, setIsStale] = useState(
    () =>
      lastUpdated != null && Date.now() - lastUpdated > FIVE_MINUTES
  );
  useEffect(() => {
    const compute = () =>
      lastUpdated != null && Date.now() - lastUpdated > FIVE_MINUTES;
    setIsStale(compute());
    const interval = setInterval(() => {
      setIsStale((prev) => {
        const nextStale = compute();
        return prev === nextStale ? prev : nextStale;
      });
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Refresh the relative-time string once a second, but ONLY while hovering —
  // it is visible solely inside the tooltip. A mounted-but-idle indicator
  // schedules no per-second timer.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isHovering) {
      return;
    }
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isHovering]);

  if (!cacheStatus) {
    return null;
  }

  // cacheStatus is non-null past the guard, so this is a concrete number.
  const resolvedLastUpdated = cacheStatus.lastUpdated;
  const { queryKeys } = cacheStatus;

  // Handle revalidation click
  const handleClick = () => {
    logger.info(
      `[StaleIndicator] Manually revalidating cache for ${componentId}`,
      {
        stale: isStale,
        queryKeys,
      }
    );

    // Get cache keys from store and invalidate them
    if (cacheStatus.queryKeys && cacheStatus.queryKeys.length > 0) {
      // We need to find the actual cache keys - this is a bit tricky since we only have query names
      // Get all queries and find matches by name
      const allQueries = queryClient.getQueryCache().getAll();
      const matchingQueries = allQueries.filter((q) =>
        cacheStatus.queryKeys.some((name) =>
          JSON.stringify(q.queryKey).includes(name)
        )
      );

      matchingQueries.forEach((q) => {
        queryClient.invalidateQueries({
          queryKey: q.queryKey,
          refetchType: 'active',
        });
      });
    }
  };

  // Format relative time
  const getRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) {
      return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Format absolute time
  const getAbsoluteTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const relativeTime = getRelativeTime(resolvedLastUpdated);
  const absoluteTime = getAbsoluteTime(resolvedLastUpdated);

  // Build tooltip content with proper line breaks
  const tooltipLines = [
    `Last updated: ${absoluteTime} (${relativeTime})`,
    isRevalidating ? 'Revalidating data...' : '',
    !isStale ? 'Click to manually revalidate' : 'Click to revalidate',
    queryKeys.length > 0 ? `Queries: ${queryKeys.join(', ')}` : '',
  ].filter(Boolean);

  const tooltipContent = tooltipLines.join('\n');

  // Determine which icon to show
  const getIcon = () => {
    if (isRevalidating) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />;
    }
    if (isHovering) {
      return <Loader2 className="h-3.5 w-3.5 text-foreground" />;
    }
    if (isStale) {
      return <AlertCircle className="h-3.5 w-3.5 text-foreground" />;
    }
    return <Check className="h-3.5 w-3.5 text-foreground" />;
  };

  return (
    <Tooltip tooltip={tooltipContent} side="bottom">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={`flex items-center self-center leading-none transition-colors hover:opacity-80 cursor-pointer ${className}`}
        title="Click to revalidate"
      >
        {getIcon()}
      </button>
    </Tooltip>
  );
};

// Props are primitives (componentId, className), so memo cuts the parent-driven
// re-renders that WidgetWrapper's chrome would otherwise push through.
export const StaleIndicator = React.memo(StaleIndicatorComponent);

export default StaleIndicator;
