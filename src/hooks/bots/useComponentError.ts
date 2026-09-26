import { useOptionalBotFormContext } from '@/contexts/bots/form/BotFormProvider';
import type { BotFormAlert } from '@/types/bots/form';
import { useEffect } from 'react';
import type { SettingsNavId } from './useSettingsNavigation';

export interface UseComponentErrorOptions {
  /**
   * Navigation ID for linking from the footer alert summary.
   * Use a value from SETTINGS_NAV_IDS for type safety.
   * If not provided, defaults to the field name (which may not navigate correctly).
   */
  navId?: SettingsNavId | string;
  /**
   * Alert variant (error, warning, info)
   * @default 'error'
   */
  variant?: BotFormAlert['variant'];
  /**
   * Optional description shown in the alert dropdown
   */
  description?: string;
  /**
   * Optional title for the alert (displayed instead of message)
   */
  title?: string;
}

/**
 * Hook for components to register validation errors with the bot form context.
 * This allows component-level errors to appear in the footer alert summary
 * and be navigable via the navId system.
 *
 * @example
 * ```tsx
 * const exceedsBalance = value > availableBalance;
 *
 * useComponentError(
 *   'baseOrderSize',
 *   exceedsBalance,
 *   'The value exceeds the available balance',
 *   { navId: 'baseOrderSize' }
 * );
 * ```
 *
 * @param field - Unique field identifier (e.g., 'baseOrderSize')
 * @param hasError - Whether the error condition is active
 * @param message - Error message to display
 * @param options - Additional options (navId, variant, description)
 */
export const useComponentError = (
  field: string,
  hasError: boolean,
  message: string,
  options?: UseComponentErrorOptions
) => {
  const context = useOptionalBotFormContext();
  const registerComponentError = context?.registerComponentError;

  useEffect(() => {
    // Skip registration if not in a bot form context
    if (!registerComponentError) {
      return;
    }

    if (hasError) {
      registerComponentError(field, {
        variant: options?.variant ?? 'error',
        message,
        title: options?.title,
        navId: options?.navId ?? field,
        description: options?.description,
      });
    } else {
      registerComponentError(field, null);
    }

    // Cleanup: remove error when component unmounts
    return () => {
      registerComponentError(field, null);
    };
  }, [
    hasError,
    message,
    field,
    options?.variant,
    options?.navId,
    options?.description,
    options?.title,
    registerComponentError,
  ]);
};
