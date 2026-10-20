import { cn } from '@/lib/utils';
import type { AlertVariant } from '@/types/bots/form';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import React from 'react';

export interface SettingsAlertProps {
  /** Shown inline in the chip */
  title?: React.ReactNode;
  /** Shown in a tooltip on hover (plain text) */
  description?: string;
  className?: string;
  variant?: AlertVariant;
  /** Optional navigation id so external lists can link to this alert */
  navId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_FOR: Record<NonNullable<SettingsAlertProps['variant']>, any> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const CHIP_CLASSES: Record<
  NonNullable<SettingsAlertProps['variant']>,
  string
> = {
  error: 'bg-destructive/40 text-text-white [&>svg]:text-white',
  warning: 'bg-warning/40 text-white [&>svg]:text-white',
  // Info is a plain hint, not a chip: an orange pill read as a warning.
  info: 'bg-transparent px-0 py-0 font-normal text-muted-foreground [&>svg]:text-muted-foreground',
};

const SettingsAlert: React.FC<SettingsAlertProps> = ({
  title,
  description,
  className,
  variant = 'info',
  navId,
}) => {
  const Icon = ICON_FOR[variant];
  const [expanded, setExpanded] = React.useState(false);

  // Resolve the hover/tap tooltip: prefer explicit description, fall back to
  // the title text (extracted as plain string so it works as an HTML title attr).
  const tooltipText =
    description ?? (typeof title === 'string' ? title : undefined);

  return (
    <span
      className={cn(
        'flex w-fit max-w-full items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold cursor-pointer',
        CHIP_CLASSES[variant],
        className
      )}
      data-settings-alert-nav-id={navId}
      data-settings-alert-variant={variant}
      role="note"
      title={!expanded ? tooltipText : undefined}
      onClick={() => setExpanded((prev) => !prev)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span
        className={cn(
          'min-w-0',
          expanded ? 'whitespace-normal break-words' : 'truncate'
        )}
      >
        {title}
      </span>
    </span>
  );
};

export default SettingsAlert;
