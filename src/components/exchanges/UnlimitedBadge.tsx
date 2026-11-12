import { Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Unlimited trading on the free plan. Its own badge, never merged with
 * "Popular": an exchange can be both.
 */
export const UnlimitedBadge = ({
  tooltip = 'Unlimited trading on the free plan. Bots on this account use no credits.',
  className,
}: {
  tooltip?: string;
  className?: string;
}) => (
  <span
    title={tooltip}
    className={cn(
      'inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-xs font-medium bg-success/10 text-success',
      className
    )}
  >
    <InfinityIcon className="h-3 w-3" aria-hidden="true" />
    Unlimited
  </span>
);
