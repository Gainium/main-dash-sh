import { cn } from '@/lib/utils';
import * as React from 'react';

// Base styled popover content with consistent styling
export const StyledPopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Base styling consistent with DropdownMenuContent
      'glass-surface z-[10010] min-w-[8rem] overflow-hidden rounded-xl p-1 text-popover-foreground shadow-2xl ring-1 ring-border/60',
      // Animation classes
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      // Direction-based slide animations
      'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
));
StyledPopoverContent.displayName = 'StyledPopoverContent';

// Styled popover item with consistent hover states
export const StyledPopoverItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    disabled?: boolean;
    selected?: boolean;
  }
>(({ className, disabled, selected, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-all duration-200',
      'focus:bg-accent/80 focus:text-accent-foreground hover:bg-accent/80',
      disabled && 'pointer-events-none opacity-50',
      selected && 'bg-accent/60 text-accent-foreground',
      className
    )}
    {...props}
  />
));
StyledPopoverItem.displayName = 'StyledPopoverItem';
