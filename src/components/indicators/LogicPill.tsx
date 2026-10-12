import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ArrowLeftRight } from 'lucide-react';

export interface LogicPillProps {
  logic: string | undefined;
  /** Flip AND <-> OR. Omitted = read-only label. */
  onToggle?: (() => void) | undefined;
  className?: string;
}

/**
 * The AND/OR that joins the two items it sits between. One click flips it,
 * so the relationship is set exactly where it applies.
 */
export const LogicPill: React.FC<LogicPillProps> = ({
  logic,
  onToggle,
  className,
}) => {
  const isOr = logic === 'or';
  const label = isOr ? 'OR' : 'AND';
  const pillClass = cn(
    'inline-flex items-center gap-1 rounded-full border px-sm py-0.5 text-xs font-semibold tracking-wide',
    isOr
      ? 'border-primary/50 bg-primary/10 text-primary'
      : 'border-border bg-muted text-foreground'
  );

  return (
    <div className={cn('flex justify-center py-xs', className)}>
      {onToggle ? (
        <Tooltip tooltip={`Switch to ${isOr ? 'AND' : 'OR'}`}>
          <button
            type="button"
            className={cn(pillClass, 'hover:border-primary')}
            onClick={onToggle}
            aria-label={`${label}, switch to ${isOr ? 'AND' : 'OR'}`}
          >
            {label}
            <ArrowLeftRight className="h-3 w-3 opacity-70" />
          </button>
        </Tooltip>
      ) : (
        <span className={pillClass}>{label}</span>
      )}
    </div>
  );
};
