import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { useOptionalBotFormState } from '@/contexts/bots/form/BotFormProvider';
import { navigateToSetting } from '@/hooks/bots/useSettingsNavigation';
import { logger } from '@/lib/loggerInstance';
import type { BotFormAlert, BotFormAlerts } from '@/types/bots/form';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';

export interface BotFormAlertButtonProps {
  className?: string;
  /**
   * Optional alerts to render instead of reading the surrounding
   * BotFormProvider's alerts. Hedge bots use this to surface a leg's
   * alerts from a header that sits OUTSIDE the leg's provider tree
   * (the alerts are bridged up via an event bus). When omitted, the
   * component reads the ambient form context as before.
   */
  alerts?: BotFormAlerts;
}

export const BotFormAlertButton: React.FC<BotFormAlertButtonProps> = ({
  className,
  alerts: alertsProp,
}) => {
  const ctx = useOptionalBotFormState();
  const alerts = alertsProp ?? ctx?.alerts;

  const alertsList = useMemo((): BotFormAlert[] => {
    if (!alerts) return [];

    const allAlerts: BotFormAlert[] = [];
    for (const fieldAlerts of Object.values(alerts)) {
      if (Array.isArray(fieldAlerts)) {
        allAlerts.push(...fieldAlerts);
      }
    }

    return allAlerts;
  }, [alerts]);

  const hasAlerts = alertsList.length > 0;

  if (!hasAlerts) {
    return null;
  }

  const errorCount = alertsList.filter((a) => a.variant === 'error').length;
  const warningCount = alertsList.filter((a) => a.variant === 'warning').length;
  const totalCount = alertsList.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`relative h-8 w-8 text-muted-foreground hover:text-foreground ${className ?? ''}`}
          aria-label={`${totalCount} form ${totalCount === 1 ? 'alert' : 'alerts'}`}
        >
          <TriangleAlert className="h-4 w-4" />
          {totalCount > 0 && (
            <span
              // eslint-disable-next-line spacing/no-hardcoded-font-size
              className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                errorCount > 0
                  ? 'bg-destructive text-destructive-foreground'
                  : warningCount > 0
                    ? 'bg-warning text-warning-foreground'
                    : 'bg-primary text-primary-foreground'
              }`}
            >
              {totalCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto"
      >
        {alertsList.map((alert, idx) => (
          <DropdownMenuItem
            key={idx}
            onSelect={() => {
              const navTarget = alert.navId;
              logger.debugCategory('SettingsNavigation', 'Alert clicked', {
                navTarget,
                alert,
              });
              if (navTarget) {
                // Use setTimeout to allow dropdown to close first
                setTimeout(() => {
                  navigateToSetting(navTarget);
                }, 0);
              }
            }}
          >
            <SettingsAlert
              variant={alert.variant as 'error' | 'warning' | 'info'}
              title={alert.title ?? alert.message}
              description={alert.description}
              className="w-full"
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BotFormAlertButton;
