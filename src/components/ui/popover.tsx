import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '../../lib/utils';

// Base Popover Components
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Consistent styling with dropdown menus and selects - explicit dark styling
          'glass-surface z-[10010] w-72 origin-(--radix-popover-content-transform-origin) rounded-xl p-3 md:p-4 text-card-foreground shadow-2xl ring-1 ring-border/60 outline-hidden',
          // Prevent popping off-screen on narrow viewports and allow scrolling for long content
          'max-w-[calc(100vw-3.5rem)] max-h-[calc(100vh-4rem)] overflow-auto',
          // Animation classes
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          // Direction-based slide animations
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

// Styled Popover Components for consistent theming across the app
const StyledPopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    minWidth?: string;
  }
>(({ className, minWidth = '8rem', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Base styling consistent with DropdownMenuContent - explicit dark styling
      `glass-surface z-[10010] min-w-[${minWidth}] rounded-xl p-1 text-card-foreground shadow-2xl ring-1 ring-border/60`,
      // Prevent popping off-screen on narrow viewports and allow scrolling for long content
      'max-w-[calc(100vw-3.5rem)] max-h-[calc(100vh-4rem)] overflow-auto',
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
const StyledPopoverItem = React.forwardRef<
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
      'focus:bg-muted/80 focus:text-card-foreground hover:bg-muted/80 text-muted-foreground',
      disabled && 'pointer-events-none opacity-50',
      selected && 'bg-muted/60 text-card-foreground',
      className
    )}
    {...props}
  />
));
StyledPopoverItem.displayName = 'StyledPopoverItem';

// Styled popover separator
const StyledPopoverSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
StyledPopoverSeparator.displayName = 'StyledPopoverSeparator';

// Styled popover label
const StyledPopoverLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-sm font-semibold text-muted-foreground',
      className
    )}
    {...props}
  />
));
StyledPopoverLabel.displayName = 'StyledPopoverLabel';

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  StyledPopoverContent,
  StyledPopoverItem,
  StyledPopoverLabel,
  StyledPopoverSeparator,
};
