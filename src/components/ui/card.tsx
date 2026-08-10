import * as React from 'react';

import { cn } from '../../lib/utils';

interface CardProps extends React.ComponentProps<'div'> {
  position?: 1 | 2 | 3;
  selected?: boolean;
  /** If true, remove the default `gap-md` spacing so the card is compact */
  compact?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, position, selected, compact = false, ...props }, ref) => {
    const backgroundStyle = position
      ? {
          background: `var(${
            position === 3
              ? '--color-background'
              : position === 2
                ? '--color-card'
                : '--color-inner-container'
          })`,
        }
      : {};

    // When position is used, apply InnerCard styling (p-sm, space-y-sm, rounded-lg)
    // Otherwise, use the original Card styling.
    // Padding uses --spacing-* tokens so it shrinks in compact mode.
    // No border by default — surface contrast (bg-card vs page bg) is the
    // separator. See DESIGN_SYSTEM.md §3.
    // `min-w-0` lets wide children (tables, long preformatted text) shrink
    // within constrained parents so their own `overflow-x-auto` actually
    // scrolls instead of blowing out the layout. Without it, grid/flex items
    // default to `min-width: min-content` and burst past the viewport.
    const cardClasses = position
      ? 'rounded-lg p-sm space-y-sm min-w-0'
      : `bg-card text-card-foreground flex flex-col min-w-0 ${compact ? 'gap-0' : 'gap-md'} rounded-xl py-md`;

    return (
      <div
        ref={ref}
        data-slot="card"
        className={cn(
          cardClasses,
          'transition-all duration-200',
          selected
            ? '[box-shadow:inset_0px_0px_0px_2px_#ff9551,var(--box-shadow)]'
            : '[box-shadow:var(--box-shadow)]',
          className
        )}
        style={backgroundStyle}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-md has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-md', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-md', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
