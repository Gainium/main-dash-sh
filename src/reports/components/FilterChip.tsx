// FilterChip - Individual filter chip component
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  SERVER_FILTER_PENDING_TOOLTIP,
  SERVER_FILTER_UNAVAILABLE_TOOLTIP,
} from '@/components/ui/data-table/serverSide';
import { Loader2, X, Zap } from 'lucide-react';
import React from 'react';

interface FilterChipProps {
  label: string;
  value: string;
  onEdit: () => void;
  onRemove: () => void;
  /**
   * Server-paged tables: whether the server applies this filter. A filter it
   * cannot apply stays visible (and removable) but is marked "Not applied";
   * one waiting on the backend check shows "applying…".
   */
  status?: 'applied' | 'pending' | 'unavailable';
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  value,
  onEdit,
  onRemove,
  status = 'applied',
}) => {
  const unapplied = status !== 'applied';
  return (
    <Badge
      variant="secondary"
      className={
        'group h-7 px-2 gap-1 cursor-pointer hover:bg-secondary/80 transition-colors' +
        (unapplied ? ' bg-muted text-muted-foreground' : '')
      }
      onClick={onEdit}
      data-testid="filter-chip"
      data-filter-status={status}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">:</span>
      <span className={'text-xs' + (unapplied ? ' opacity-70' : '')}>
        {value}
      </span>
      {status === 'unavailable' && (
        <Tooltip tooltip={SERVER_FILTER_UNAVAILABLE_TOOLTIP} side="bottom" delay={150}>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-background/60 px-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="h-2.5 w-2.5" aria-hidden="true" />
            Not applied
          </span>
        </Tooltip>
      )}
      {status === 'pending' && (
        <Tooltip tooltip={SERVER_FILTER_PENDING_TOOLTIP} side="bottom" delay={150}>
          <span className="inline-flex items-center gap-0.5 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
            applying…
          </span>
        </Tooltip>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 ml-1 opacity-60 hover:opacity-100 hover:bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
};
