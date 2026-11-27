import { AlertCircle, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A failed action, refusal or validation summary shown inside a dialog,
 * sheet or drawer. Contained (tinted background + border) so it reads as a
 * message rather than stray red text; the red stays on the icon and border,
 * the text is set in the foreground colour so long venue errors stay legible
 * in both themes.
 *
 * Field-level hints directly under an input are not this — keep those as a
 * one-line `text-xs text-destructive` under the field.
 */
export interface InlineErrorProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional bold first line. */
  title?: React.ReactNode;
  /** The message. `children` is used when this is not set. */
  message?: React.ReactNode;
  /** `error` (default) or `warning`. */
  variant?: 'error' | 'warning';
  /** Tighter padding and `text-xs`, for small dialogs and table rows. */
  size?: 'default' | 'compact';
}

type Variant = NonNullable<InlineErrorProps['variant']>;

const VARIANT_CLASSES: Record<Variant, string> = {
  error: 'border-loss/30 bg-loss/10',
  warning: 'border-warning/30 bg-warning/10',
};

const ICON_CLASSES: Record<Variant, string> = {
  error: 'text-loss',
  warning: 'text-warning',
};

const InlineError = React.forwardRef<HTMLDivElement, InlineErrorProps>(
  (
    {
      title,
      message,
      variant = 'error',
      size = 'default',
      className,
      children,
      ...props
    },
    ref
  ) => {
    const Icon = variant === 'warning' ? TriangleAlert : AlertCircle;
    const body = message ?? children;
    const compact = size === 'compact';
    return (
      <div
        ref={ref}
        role="alert"
        data-inline-error={variant}
        className={cn(
          'flex w-full items-start rounded-md border text-left',
          compact ? 'gap-xs px-sm py-1.5 text-xs' : 'gap-xs p-sm text-sm',
          VARIANT_CLASSES[variant],
          className
        )}
        {...props}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'shrink-0',
            compact ? 'mt-px h-3.5 w-3.5' : 'mt-0.5 h-4 w-4',
            ICON_CLASSES[variant]
          )}
        />
        <div className="min-w-0 flex-1 space-y-0.5 break-words [overflow-wrap:anywhere]">
          {title && (
            <div className="font-semibold leading-snug text-foreground">
              {title}
            </div>
          )}
          {body && (
            <div
              className={cn(
                'leading-snug',
                title ? 'text-muted-foreground' : 'text-foreground/90'
              )}
            >
              {body}
            </div>
          )}
        </div>
      </div>
    );
  }
);
InlineError.displayName = 'InlineError';

export { InlineError };
