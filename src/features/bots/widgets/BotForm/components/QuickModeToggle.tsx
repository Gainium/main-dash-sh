import { SlidersHorizontal, Zap } from 'lucide-react';

import { useOptionalBotFormContext } from '@/contexts/bots/form/BotFormProvider';
import { cn } from '@/lib/utils';

export type QuickModeValue = 'quick' | 'manual';

export interface QuickModeToggleProps {
  className?: string;
  /** Controlled value. When provided alongside `onChange`, the toggle
   *  does NOT read from BotFormProvider context — used by callers
   *  outside the DCA form (e.g. hedge bots) that have their own
   *  mode state. */
  value?: QuickModeValue;
  onChange?: (next: QuickModeValue) => void;
  /** When true, render only the icons (no labels). Used by the bot
   *  form header when the panel is too narrow to fit text. */
  compact?: boolean;
}

/**
 * Segmented control that flips a form between Quick (preset-driven)
 * and Manual (full sectioned) modes. Defaults to reading state from
 * BotFormProvider; can be controlled via `value` + `onChange`.
 */
export const QuickModeToggle: React.FC<QuickModeToggleProps> = ({
  className,
  value,
  onChange,
  compact = false,
}) => {
  // Always call the hook so React's hook order stays stable across
  // renders. Use the optional variant so the component can be rendered
  // outside a BotFormProvider tree (e.g. hedge layout) as long as a
  // `value`/`onChange` pair is supplied.
  const ctx = useOptionalBotFormContext();
  const isControlled = value !== undefined && onChange !== undefined;
  const currentMode: QuickModeValue = isControlled
    ? (value as QuickModeValue)
    : (ctx?.quickSetupMode ?? 'manual');
  const setMode = (next: QuickModeValue) => {
    if (isControlled) {
      onChange(next);
    } else {
      ctx?.setQuickSetupMode(next);
    }
  };

  const options: Array<{
    id: QuickModeValue;
    label: string;
    Icon: typeof Zap;
  }> = [
    { id: 'quick', label: 'Quick', Icon: Zap },
    { id: 'manual', label: 'Manual', Icon: SlidersHorizontal },
  ];

  return (
    <div
      role="tablist"
      aria-label="Form mode"
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-muted/60 p-1',
        className
      )}
    >
      {options.map(({ id, label, Icon }) => {
        const isActive = currentMode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            onClick={() => setMode(id)}
            className={cn(
              'inline-flex items-center gap-xs rounded-sm py-1 text-xs font-semibold transition-colors',
              compact ? 'px-1.5' : 'px-sm',
              isActive
                ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/40'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
};

export default QuickModeToggle;
